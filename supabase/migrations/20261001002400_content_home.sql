-- =====================================================================
-- مِرقاة — 24: الفيديوهات والإثراءات + الصفحات الرئيسية
--   المحتوى: مسودة/جدولة/انتهاء، تثبيت، مدة الفيديو، نص الإثراء، مرفقات، نشر لعدة فصول دفعة واحدة،
--            متابعة المشاهدة (فتح/إكمال/حفظ لاحقًا) وتحليل من شاهد ومن لم يشاهد
--   الرئيسية: student_home و staff_home — كل بيانات الصفحة في طلب واحد
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) أعمدة المحتوى
-- ---------------------------------------------------------------------
alter table public.content_items
  add column if not exists body        text check (body is null or char_length(body) <= 5000),
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add column if not exists is_pinned   boolean not null default false,
  add column if not exists is_draft    boolean not null default false,
  add column if not exists minutes     smallint check (minutes is null or minutes between 1 and 600);
alter table public.content_items
  add constraint content_items_attachments_chk check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 5);
create index if not exists content_items_published_idx on public.content_items (class_id, published_at desc);

-- الطالب يرى محتوى فصله المنشور فقط (لا المسودات ولا المجدول ولا المنتهي)
drop policy if exists content_items_read on public.content_items;
create policy content_items_read on public.content_items for select to authenticated
  using ((select app.is_admin())
         or ((select app.is_staff()) and app.staff_can_access(class_id, subject_id))
         or (class_id = (select app.my_class_id()) and not is_draft
             and (published_at is null or published_at <= now())
             and (expires_at is null or expires_at > now())));
-- الكتابة كلها عبر الدوال (تتحقق من النطاق والروابط والمرفقات)
revoke insert, update, delete on public.content_items from authenticated;

-- ---------------------------------------------------------------------
-- 2) متابعة المشاهدة
-- ---------------------------------------------------------------------
create table public.content_progress (
  student_id       bigint not null references public.students(id) on delete cascade,
  content_item_id  bigint not null references public.content_items(id) on delete cascade,
  first_opened_at  timestamptz,
  last_opened_at   timestamptz,
  opens            integer not null default 0,
  completed_at     timestamptz,
  saved_at         timestamptz,
  primary key (student_id, content_item_id)
);
create index content_progress_item_idx on public.content_progress (content_item_id);
create index content_progress_recent_idx on public.content_progress (last_opened_at desc);
alter table public.content_progress enable row level security;
grant select on public.content_progress to authenticated;
grant all on public.content_progress to service_role;
create policy content_progress_read on public.content_progress for select to authenticated
  using (student_id = (select app.my_student_id())
         or ((select app.is_staff()) and exists (select 1 from public.content_items c where c.id = content_item_id)));

-- المشاهدات القديمة (Student_Views) تصير تقدمًا مفتوحًا
insert into public.content_progress (student_id, content_item_id, first_opened_at, last_opened_at, opens)
select student_id, content_item_id, min(viewed_at), max(viewed_at), count(*)
  from public.student_views where content_item_id is not null
 group by student_id, content_item_id
on conflict do nothing;

create or replace function app.content_status(c public.content_items) returns text
language sql stable set search_path = '' as $$
  select case when c.is_draft then 'draft'
              when c.expires_at is not null and c.expires_at <= now() then 'expired'
              when c.published_at is not null and c.published_at > now() then 'scheduled'
              else 'published' end
$$;

-- ---------------------------------------------------------------------
-- 3) الحفظ والحذف (المعلم: نطاقه ومحتواه، الإداري: الكل)
-- ---------------------------------------------------------------------
create or replace function app.clean_content_attachments(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare r jsonb := '[]'::jsonb; x jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' then return '[]'::jsonb; end if;
  if jsonb_array_length(p) > 5 then raise exception 'خمسة مرفقات على الأكثر'; end if;
  for x in select * from jsonb_array_elements(p) loop
    if coalesce(x ->> 'storage_path', '') !~ '^(tasks|content)/[0-9a-f-]{36}/a\.[a-z0-9]{2,5}$' then
      raise exception 'مرفق غير صالح';
    end if;
    r := r || jsonb_build_array(jsonb_build_object(
      'name', left(coalesce(nullif(btrim(x ->> 'name'), ''), 'ملف'), 120),
      'storage_path', x ->> 'storage_path',
      'mime', left(coalesce(x ->> 'mime', ''), 120),
      'size_bytes', greatest(0, coalesce((x ->> 'size_bytes')::int, 0)),
      'kind', case when coalesce(x ->> 'mime', '') like 'image/%' then 'image' else 'file' end));
  end loop;
  return r;
end $$;

create or replace function public.save_content(p_id bigint, p jsonb, p_class_ids integer[]) returns bigint[]
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_admin   boolean := coalesce(app.is_admin(), false);
  v_emp     bigint := app.my_employee_id();
  v_kind    text := coalesce(p ->> 'kind', 'video');
  v_title   text := btrim(coalesce(p ->> 'title', ''));
  v_url     text := nullif(btrim(coalesce(p ->> 'url', '')), '');
  v_body    text := nullif(btrim(coalesce(p ->> 'body', '')), '');
  v_desc    text := nullif(btrim(coalesce(p ->> 'description', '')), '');
  v_subj    smallint := nullif(p ->> 'subject_id', '')::smallint;
  v_term    smallint := nullif(p ->> 'term_id', '')::smallint;
  v_pub     timestamptz := nullif(p ->> 'published_at', '')::timestamptz;
  v_exp     timestamptz := nullif(p ->> 'expires_at', '')::timestamptz;
  v_min     smallint := nullif(p ->> 'minutes', '')::smallint;
  v_pin     boolean := coalesce((p ->> 'is_pinned')::boolean, false);
  v_draft   boolean := coalesce((p ->> 'is_draft')::boolean, false);
  v_att     jsonb := app.clean_content_attachments(p -> 'attachments');
  v_old     public.content_items;
  v_ids     bigint[] := '{}';
  v_id      bigint;
  c         integer;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if v_kind not in ('video', 'enrichment') then raise exception 'نوع غير معروف'; end if;
  if char_length(v_title) < 2 or char_length(v_title) > 200 then raise exception 'العنوان مطلوب (حتى 200 حرف)'; end if;
  if v_subj is null then raise exception 'اختر المادة'; end if;
  if v_url is not null and (v_url !~* '^https://[^\s]+$' or char_length(v_url) > 1000) then
    raise exception 'الرابط يجب أن يبدأ بـ https://';
  end if;
  if v_kind = 'video' and v_url is null then raise exception 'أضف رابط الفيديو'; end if;
  if v_kind = 'enrichment' and v_url is null and v_body is null and jsonb_array_length(v_att) = 0 then
    raise exception 'أضف رابطًا أو نصًا أو مرفقًا للإثراء';
  end if;
  if v_desc is not null and char_length(v_desc) > 600 then raise exception 'الوصف حتى 600 حرف'; end if;
  if v_exp is not null and v_exp <= coalesce(v_pub, now()) then raise exception 'موعد الإخفاء يجب أن يكون بعد موعد النشر'; end if;

  if p_id is null then
    if p_class_ids is null or cardinality(p_class_ids) = 0 then raise exception 'اختر فصلًا واحدًا على الأقل'; end if;
    if cardinality(p_class_ids) > 40 then raise exception 'أربعون فصلًا على الأكثر في المرة الواحدة'; end if;
    foreach c in array p_class_ids loop
      if not v_admin and not app.staff_can_access(c, v_subj) then raise exception 'فصل أو مادة خارج نطاقك'; end if;
      insert into public.content_items (kind, class_id, subject_id, term_id, teacher_id, title, description, url, body,
                                        attachments, is_pinned, is_draft, minutes, published_at, expires_at)
      values (v_kind::public.content_kind, c, v_subj, v_term, v_emp, v_title, v_desc, v_url, v_body,
              v_att, v_pin, v_draft, v_min, coalesce(v_pub, case when v_draft then null else now() end), v_exp)
      returning id into v_id;
      v_ids := v_ids || v_id;
    end loop;
  else
    select * into v_old from public.content_items where id = p_id for update;
    if v_old.id is null then raise exception 'المحتوى غير موجود'; end if;
    if not v_admin and (v_old.teacher_id is distinct from v_emp or not app.staff_can_access(v_old.class_id, v_subj)) then
      raise exception 'لا تملك تعديل هذا المحتوى' using errcode = '42501';
    end if;
    update public.content_items
       set kind = v_kind::public.content_kind, subject_id = v_subj, term_id = coalesce(v_term, term_id),
           title = v_title, description = v_desc, url = v_url, body = v_body, attachments = v_att,
           is_pinned = v_pin, is_draft = v_draft, minutes = v_min,
           published_at = case when v_pub is not null then v_pub
                               when not v_draft and v_old.is_draft then now()
                               else v_old.published_at end,
           expires_at = v_exp
     where id = p_id;
    v_ids := array[p_id];
  end if;
  return v_ids;
end $$;

create or replace function public.set_content_flags(p_id bigint, p jsonb) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_old public.content_items;
begin
  select * into v_old from public.content_items where id = p_id;
  if v_old.id is null then raise exception 'المحتوى غير موجود'; end if;
  if not (coalesce(app.is_admin(), false) or (v_old.teacher_id = app.my_employee_id() and app.staff_can_access(v_old.class_id, v_old.subject_id))) then
    raise exception 'لا تملك تعديل هذا المحتوى' using errcode = '42501';
  end if;
  update public.content_items
     set is_pinned = coalesce((p ->> 'is_pinned')::boolean, is_pinned),
         is_draft = coalesce((p ->> 'is_draft')::boolean, is_draft),
         published_at = case when (p ->> 'is_draft')::boolean is false and is_draft then now() else published_at end,
         expires_at = case when (p ->> 'expire_now')::boolean then now() when p ? 'expires_at' then nullif(p ->> 'expires_at', '')::timestamptz else expires_at end
   where id = p_id;
end $$;

-- يعيد مسارات المرفقات التي لم يعد يستخدمها أي محتوى آخر (ليحذفها الخادم من المخزن)
create or replace function public.delete_content(p_id bigint) returns text[]
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_old   public.content_items;
  v_paths text[];
begin
  select * into v_old from public.content_items where id = p_id;
  if v_old.id is null then return '{}'; end if;
  if not (coalesce(app.is_admin(), false) or v_old.teacher_id = app.my_employee_id()) then
    raise exception 'لا تملك حذف هذا المحتوى' using errcode = '42501';
  end if;
  delete from public.period_links where content_item_id = p_id;
  delete from public.student_views where content_item_id = p_id;
  delete from public.content_items where id = p_id;
  select coalesce(array_agg(x ->> 'storage_path'), '{}') into v_paths
    from jsonb_array_elements(v_old.attachments) x
   where not exists (select 1 from public.content_items c, jsonb_array_elements(c.attachments) y
                      where y ->> 'storage_path' = x ->> 'storage_path');
  return v_paths;
end $$;

-- ---------------------------------------------------------------------
-- 4) قوائم الموظف (بصلاحياته: المعلم يرى نطاقه)
-- ---------------------------------------------------------------------
create or replace function public.staff_content(p jsonb) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_page   integer := greatest(1, coalesce((p ->> 'page')::int, 1));
  v_size   integer := least(50, greatest(6, coalesce((p ->> 'size')::int, 15)));
  v_kind   text := nullif(p ->> 'kind', '');
  v_class  integer := nullif(p ->> 'class_id', '')::int;
  v_subj   smallint := nullif(p ->> 'subject_id', '')::smallint;
  v_status text := nullif(p ->> 'status', '');
  v_q      text := nullif(btrim(p ->> 'q'), '');
  v_mine   boolean := coalesce((p ->> 'mine')::boolean, false);
  v_sort   text := coalesce(p ->> 'sort', 'newest');
  v_me     bigint := app.my_employee_id();
  r        jsonb;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  with base as (
    select c.id, c.kind::text as kind, c.title, c.description, c.url, c.body, c.attachments, c.minutes,
           c.is_pinned, c.is_draft, c.published_at, c.expires_at, c.created_at, c.updated_at,
           c.class_id, c.subject_id, c.term_id, c.teacher_id, d.name_ar as teacher,
           app.content_status(c) as status,
           (c.teacher_id = v_me) as is_mine,
           (select count(*) from public.students s where s.class_id = c.class_id and s.status = 'active') as class_size,
           (select count(*) from public.content_progress g where g.content_item_id = c.id and g.first_opened_at is not null) as viewers,
           (select count(*) from public.content_progress g where g.content_item_id = c.id and g.completed_at is not null) as completed
      from public.content_items c
      left join public.staff_directory d on d.id = c.teacher_id
     where (v_kind is null or c.kind::text = v_kind)
       and (v_class is null or c.class_id = v_class)
       and (v_subj is null or c.subject_id = v_subj)
       and (not v_mine or c.teacher_id = v_me)
       and (v_q is null or c.title ilike '%' || replace(replace(v_q, '%', ''), '_', '') || '%')
  ), f as (select * from base where v_status is null or status = v_status)
  select jsonb_build_object(
    'total', (select count(*) from f),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(x) - 'ord' order by x.ord) from (
        select f.*, row_number() over (order by
                 f.is_pinned desc,
                 case when v_sort = 'views' then f.viewers end desc nulls last,
                 case when v_sort = 'title' then f.title end asc,
                 case when v_sort = 'oldest' then coalesce(f.published_at, f.created_at) end asc,
                 coalesce(f.published_at, f.created_at) desc, f.id desc) as ord
          from f) x
       where x.ord > (v_page - 1) * v_size and x.ord <= v_page * v_size), '[]'::jsonb))
    into r;
  return r;
end $$;

create or replace function public.content_stats() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare r jsonb;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select jsonb_build_object(
    'videos', count(*) filter (where c.kind = 'video'),
    'enrichments', count(*) filter (where c.kind = 'enrichment'),
    'scheduled', count(*) filter (where app.content_status(c) = 'scheduled'),
    'drafts', count(*) filter (where c.is_draft),
    'week_views', (select count(*) from public.content_progress g where g.last_opened_at > now() - interval '7 days'),
    'completion', (select round(100.0 * count(*) filter (where g.completed_at is not null) / nullif(count(*), 0))
                     from public.content_progress g where g.first_opened_at is not null))
    into r
    from public.content_items c;
  return r;
end $$;

-- من شاهد ومن لم يشاهد
create or replace function public.content_viewers(p_id bigint) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_class integer; r jsonb;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select class_id into v_class from public.content_items where id = p_id;
  if v_class is null then raise exception 'المحتوى غير موجود'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'code', s.code, 'name_ar', s.name_ar,
           'first_opened_at', g.first_opened_at, 'last_opened_at', g.last_opened_at,
           'opens', coalesce(g.opens, 0), 'completed_at', g.completed_at)
           order by (g.completed_at is not null) desc, (g.first_opened_at is not null) desc, s.name_ar), '[]'::jsonb)
    into r
    from public.students s
    left join public.content_progress g on g.student_id = s.id and g.content_item_id = p_id
   where s.class_id = v_class and s.status = 'active';
  return r;
end $$;

-- ---------------------------------------------------------------------
-- 5) الطالب
-- ---------------------------------------------------------------------
create or replace function app.student_content_visible(p_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.content_items c
                  where c.id = p_id and c.class_id = app.my_class_id() and not c.is_draft
                    and (c.published_at is null or c.published_at <= now())
                    and (c.expires_at is null or c.expires_at > now()))
$$;

create or replace function public.my_content() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'kind', c.kind, 'title', c.title, 'description', c.description, 'url', c.url, 'body', c.body,
           'attachments', c.attachments, 'minutes', c.minutes, 'is_pinned', c.is_pinned,
           'published_at', coalesce(c.published_at, c.created_at), 'expires_at', c.expires_at,
           'subject_id', c.subject_id, 'subject', s.name, 'teacher', d.name_ar,
           'opened_at', g.first_opened_at, 'last_opened_at', g.last_opened_at,
           'completed_at', g.completed_at, 'saved_at', g.saved_at)
           order by c.is_pinned desc, coalesce(c.published_at, c.created_at) desc, c.id desc), '[]'::jsonb)
    from public.content_items c
    join public.subjects s on s.id = c.subject_id
    left join public.staff_directory d on d.id = c.teacher_id
    left join public.content_progress g on g.content_item_id = c.id and g.student_id = app.my_student_id()
   where c.class_id = app.my_class_id() and not c.is_draft
     and (c.published_at is null or c.published_at <= now())
     and (c.expires_at is null or c.expires_at > now())
$$;

create or replace function public.open_content(p_id bigint) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_sid bigint := app.my_student_id();
begin
  if v_sid is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not app.student_content_visible(p_id) then raise exception 'المحتوى غير متاح'; end if;
  insert into public.content_progress (student_id, content_item_id, first_opened_at, last_opened_at, opens)
  values (v_sid, p_id, now(), now(), 1)
  on conflict (student_id, content_item_id) do update
     set first_opened_at = coalesce(public.content_progress.first_opened_at, now()),
         last_opened_at = now(),
         -- فتحات متتالية خلال دقيقة تُحسب مرة واحدة
         opens = public.content_progress.opens
                 + case when public.content_progress.last_opened_at > now() - interval '1 minute' then 0 else 1 end;
  insert into public.student_views (student_id, content_item_id) values (v_sid, p_id) on conflict do nothing;
end $$;

create or replace function public.set_content_progress(p_id bigint, p_completed boolean, p_saved boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_sid bigint := app.my_student_id();
begin
  if v_sid is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not app.student_content_visible(p_id) then raise exception 'المحتوى غير متاح'; end if;
  insert into public.content_progress (student_id, content_item_id, completed_at, saved_at,
                                       first_opened_at, last_opened_at, opens)
  values (v_sid, p_id, case when p_completed then now() end, case when p_saved then now() end,
          case when p_completed then now() end, case when p_completed then now() end, case when p_completed then 1 else 0 end)
  on conflict (student_id, content_item_id) do update
     set completed_at = case when p_completed is null then public.content_progress.completed_at
                             when p_completed then coalesce(public.content_progress.completed_at, now()) end,
         saved_at = case when p_saved is null then public.content_progress.saved_at
                         when p_saved then coalesce(public.content_progress.saved_at, now()) end,
         first_opened_at = coalesce(public.content_progress.first_opened_at, case when p_completed then now() end);
end $$;

-- ---------------------------------------------------------------------
-- 6) الفصل الدراسي الحالي
-- ---------------------------------------------------------------------
create or replace function app.current_term() returns smallint
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select term_id from public.calendar_entries
      where (now() at time zone 'Asia/Riyadh')::date between starts_on and ends_on order by starts_on desc limit 1),
    (select t.id from public.terms t join public.academic_years y on y.id = t.academic_year_id
      where y.is_current order by t.sort_order, t.id limit 1),
    (select max(id) from public.terms))
$$;

-- ---------------------------------------------------------------------
-- 7) رئيسية الطالب
-- ---------------------------------------------------------------------
create or replace function public.student_home() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_sid   bigint := app.my_student_id();
  v_class integer := app.my_class_id();
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_dow   int := extract(dow from (now() at time zone 'Asia/Riyadh'))::int;
  v_term  smallint := app.current_term();
  v_exams boolean := coalesce((select value #>> '{}' from public.app_settings where key = 'exam_visibility'), 'all') <> 'hidden';
  r jsonb;
begin
  if v_sid is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select jsonb_build_object(
    'today', v_today,
    'dow', v_dow,
    'term_id', v_term,
    'week', (select jsonb_build_object('label', w.week_label, 'no', w.week_no, 'starts_on', w.starts_on, 'ends_on', w.ends_on)
               from public.school_weeks w where v_today between w.starts_on and w.ends_on limit 1),
    'holiday', (select e.event from public.calendar_entries e
                 where v_today between e.starts_on and e.ends_on and e.event is not null limit 1),
    'lessons', case when v_dow > 4 then '[]'::jsonb else coalesce((
       select jsonb_agg(jsonb_build_object('id', t.id, 'period_no', t.period_no, 'starts_at', t.starts_at,
                                           'delivery_mode', t.delivery_mode, 'subject', s.name, 'teacher', d.name_ar)
                        order by t.period_no, s.name)
         from public.timetable_slots t join public.subjects s on s.id = t.subject_id
         left join public.staff_directory d on d.id = t.teacher_id
        where t.class_id = v_class and t.day_of_week = v_dow), '[]'::jsonb) end,
    'attendance', (select jsonb_build_object(
                     'total', count(*),
                     'absent', count(*) filter (where app.att_kind(st.name) = 'absent'),
                     'late', count(*) filter (where app.att_kind(st.name) = 'late'),
                     'pct', case when count(*) = 0 then null
                                 else greatest(0, round(100 * (count(*) - count(*) filter (where app.att_kind(st.name) = 'absent')
                                                    - 0.25 * count(*) filter (where app.att_kind(st.name) = 'late')) / count(*))) end,
                     'intisab', coalesce((select b.is_intisab from public.classes c join public.branches b on b.id = c.branch_id where c.id = v_class), false))
                     from public.attendance_records a
                     join public.calendar_entries w on w.id = a.week_id and w.term_id = v_term
                     join public.attendance_statuses st on st.id = a.status_id
                    where a.student_id = v_sid),
    'behavior', (select jsonb_build_object(
                   'score', greatest(0, 100 - coalesce(sum(b.score) filter (where app.beh_kind(st.name) = 'negative'), 0)),
                   'positive', count(*) filter (where app.beh_kind(st.name) = 'positive'),
                   'negative', count(*) filter (where app.beh_kind(st.name) = 'negative'))
                   from public.behavior_records b join public.behavior_statuses st on st.id = b.status_id
                  where b.student_id = v_sid and b.term_id = v_term),
    'grades', coalesce((
       select jsonb_agg(x order by x.recorded_at desc) from (
         select g.id, g.score, g.max_score, g.recorded_at, g.note, a.title, s.name as subject, a.id as assessment_id
           from public.grade_entries g
           join public.assessments a on a.id = g.assessment_id
           join public.subjects s on s.id = a.subject_id
          where g.student_id = v_sid
            and not exists (select 1 from public.grade_visibility v where v.student_id = v_sid and v.subject_id = a.subject_id
                                                                     and v.term_id = a.term_id and not v.is_visible)
          order by g.recorded_at desc limit 5) x), '[]'::jsonb),
    'content', jsonb_build_object(
       'new', coalesce((select jsonb_agg(x) from (
                select c.id, c.kind, c.title, c.url, c.minutes, s.name as subject, coalesce(c.published_at, c.created_at) as published_at
                  from public.content_items c join public.subjects s on s.id = c.subject_id
                 where c.class_id = v_class and not c.is_draft
                   and (c.published_at is null or c.published_at <= now()) and (c.expires_at is null or c.expires_at > now())
                   and not exists (select 1 from public.content_progress g where g.content_item_id = c.id and g.student_id = v_sid
                                                                            and g.first_opened_at is not null)
                 order by c.is_pinned desc, coalesce(c.published_at, c.created_at) desc limit 4) x), '[]'::jsonb),
       'unseen', (select count(*) from public.content_items c
                   where c.class_id = v_class and not c.is_draft
                     and (c.published_at is null or c.published_at <= now()) and (c.expires_at is null or c.expires_at > now())
                     and not exists (select 1 from public.content_progress g where g.content_item_id = c.id and g.student_id = v_sid
                                                                              and g.first_opened_at is not null)),
       'total', (select count(*) from public.content_items c
                  where c.class_id = v_class and not c.is_draft
                    and (c.published_at is null or c.published_at <= now()) and (c.expires_at is null or c.expires_at > now())),
       'completed', (select count(*) from public.content_progress g join public.content_items c on c.id = g.content_item_id
                      where g.student_id = v_sid and g.completed_at is not null and c.class_id = v_class)),
    'exams', case when not v_exams then '[]'::jsonb else coalesce((
       select jsonb_agg(jsonb_build_object('id', e.id, 'date', e.exam_date, 'starts_at', e.starts_at, 'period', e.exam_period, 'subject', s.name)
                        order by e.exam_date, e.starts_at)
         from public.exam_schedule e join public.subjects s on s.id = e.subject_id
        where e.class_id = v_class and e.exam_date between v_today and v_today + 21), '[]'::jsonb) end,
    'events', coalesce((
       select jsonb_agg(jsonb_build_object('event', e.event, 'starts_on', e.starts_on, 'ends_on', e.ends_on) order by e.starts_on)
         from (select * from public.calendar_entries e
                where e.event is not null and btrim(e.event) <> '' and e.ends_on >= v_today
                order by e.starts_on limit 3) e), '[]'::jsonb))
    into r;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- 8) رئيسية الموظف (بصلاحياته: المعلم يرى نطاقه وعمله، الإداري الكل)
-- ---------------------------------------------------------------------
create or replace function public.staff_home() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_admin boolean := coalesce(app.is_admin(), false);
  v_me    bigint := app.my_employee_id();
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_dow   int := extract(dow from (now() at time zone 'Asia/Riyadh'))::int;
  r jsonb;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select jsonb_build_object(
    'today', v_today,
    'dow', v_dow,
    'week', (select jsonb_build_object('label', w.week_label, 'no', w.week_no, 'starts_on', w.starts_on, 'ends_on', w.ends_on)
               from public.school_weeks w where v_today between w.starts_on and w.ends_on limit 1),
    'holiday', (select e.event from public.calendar_entries e
                 where v_today between e.starts_on and e.ends_on and e.event is not null limit 1),
    'students', (select count(*) from public.students where status = 'active'),
    -- التحضير اليوم: حصص اليوم (حصصي للمعلم، كل الحصص للإداري) وما سُجّل منها
    'periods_today', case when v_dow > 4 then 0 else (select count(*) from public.timetable_slots t
                       where t.day_of_week = v_dow and (v_admin or t.teacher_id = v_me)) end,
    'periods_recorded', (select count(*) from (
                           select distinct a.class_id, a.period_no, a.subject_id from public.attendance_records a
                            where a.occurred_on = v_today and (v_admin or a.recorded_by = v_me)) x),
    'absent_today', (select count(*) from public.attendance_records a join public.attendance_statuses st on st.id = a.status_id
                      where a.occurred_on = v_today and app.att_kind(st.name) = 'absent'),
    'to_grade', (select count(*) from public.task_submissions s join public.assessments a on a.id = s.assessment_id
                  where s.graded_at is null and (v_admin or a.teacher_id = v_me))
              + (select count(*) from public.form_attempts t join public.assessments a on a.id = t.assessment_id
                  where t.pending_review > 0 and (v_admin or a.teacher_id = v_me)),
    'open_now', (select count(*) from public.assessments a left join public.form_details f on f.assessment_id = a.id
                  where (v_admin or a.teacher_id = v_me)
                    and ((a.kind = 'task' and not a.is_draft and (a.published_at is null or a.published_at <= now()) and a.due_at > now())
                      or (a.kind = 'form' and f.status = 'published' and (f.opens_at is null or f.opens_at <= now()) and f.closes_at > now()))),
    'closing', coalesce((select jsonb_agg(x order by x.ends_at) from (
        select a.id, a.kind, a.title, coalesce(f.closes_at, a.due_at) as ends_at, s.name as subject, a.class_id,
               (select count(*) from public.students st where st.class_id = a.class_id and st.status = 'active') as class_size,
               case when a.kind = 'form' then (select count(distinct t.student_id) from public.form_attempts t where t.assessment_id = a.id and not t.is_auto_absent)
                    else (select count(*) from public.task_submissions ts where ts.assessment_id = a.id) end as submitted
          from public.assessments a left join public.form_details f on f.assessment_id = a.id
          join public.subjects s on s.id = a.subject_id
         where (v_admin or a.teacher_id = v_me) and a.target_student_id is null
           and ((a.kind = 'task' and not a.is_draft and a.due_at between now() and now() + interval '3 days')
             or (a.kind = 'form' and f.status = 'published' and f.closes_at between now() and now() + interval '3 days'))
         order by coalesce(f.closes_at, a.due_at) limit 5) x), '[]'::jsonb),
    'recent_submissions', coalesce((select jsonb_agg(x order by x.at desc) from (
        (select ts.id, 'task' as kind, a.id as assessment_id, a.title, st.name_ar as student, ts.submitted_at as at, ts.is_late,
                ts.graded_at is not null as graded
           from public.task_submissions ts join public.assessments a on a.id = ts.assessment_id
           join public.students st on st.id = ts.student_id
          where (v_admin or a.teacher_id = v_me) order by ts.submitted_at desc limit 6)
        union all
        (select t.id, 'form', a.id, a.title, st.name_ar, t.submitted_at, false, t.pending_review = 0
           from public.form_attempts t join public.assessments a on a.id = t.assessment_id
           join public.students st on st.id = t.student_id
          where not t.is_auto_absent and (v_admin or a.teacher_id = v_me) order by t.submitted_at desc limit 6)
        order by at desc limit 6) x), '[]'::jsonb),
    -- نشاط آخر 14 يومًا: الدرجات المرصودة وسجلات التحضير والمشاهدات
    'activity', (select coalesce(jsonb_agg(jsonb_build_object(
                   'day', d::date,
                   'grades', (select count(*) from public.grade_entries g
                               where (g.recorded_at at time zone 'Asia/Riyadh')::date = d::date and (v_admin or g.recorded_by = v_me)),
                   'attendance', (select count(*) from public.attendance_records a
                                   where a.occurred_on = d::date and (v_admin or a.recorded_by = v_me)),
                   'views', (select count(*) from public.content_progress g join public.content_items c on c.id = g.content_item_id
                              where (g.last_opened_at at time zone 'Asia/Riyadh')::date = d::date and (v_admin or c.teacher_id = v_me)))
                   order by d), '[]'::jsonb)
                   from generate_series(v_today - 13, v_today, interval '1 day') d),
    'content', (select jsonb_build_object(
                  'items', count(*),
                  'week_views', (select count(*) from public.content_progress g join public.content_items c on c.id = g.content_item_id
                                  where g.last_opened_at > now() - interval '7 days' and (v_admin or c.teacher_id = v_me)),
                  'top', coalesce((select jsonb_agg(x) from (
                     select c.id, c.kind, c.title, s.name as subject,
                            (select count(*) from public.content_progress g where g.content_item_id = c.id and g.first_opened_at is not null) as viewers,
                            (select count(*) from public.students st where st.class_id = c.class_id and st.status = 'active') as class_size
                       from public.content_items c join public.subjects s on s.id = c.subject_id
                      where (v_admin or c.teacher_id = v_me) and not c.is_draft
                      order by coalesce(c.published_at, c.created_at) desc limit 3) x), '[]'::jsonb))
                  from public.content_items c where (v_admin or c.teacher_id = v_me)),
    'behavior_week', (select jsonb_build_object(
                        'positive', count(*) filter (where app.beh_kind(st.name) = 'positive'),
                        'negative', count(*) filter (where app.beh_kind(st.name) = 'negative'))
                        from public.behavior_records b join public.behavior_statuses st on st.id = b.status_id
                       where b.occurred_on >= v_today - 6 and (v_admin or b.recorded_by = v_me)),
    'events', coalesce((
       select jsonb_agg(jsonb_build_object('event', e.event, 'starts_on', e.starts_on, 'ends_on', e.ends_on) order by e.starts_on)
         from (select * from public.calendar_entries e
                where e.event is not null and btrim(e.event) <> '' and e.ends_on >= v_today
                order by e.starts_on limit 3) e), '[]'::jsonb),
    'admin', case when not v_admin then null else jsonb_build_object(
       'employees', (select count(*) from public.employees where is_active),
       'accounts', (select count(*) from public.profiles),
       'must_change', (select count(*) from public.profiles where must_change_password),
       'release_rules', (select count(*) from public.result_release_rules where is_active and kind = 'block'),
       'audit', coalesce((select jsonb_agg(x) from (
          select id, occurred_at, actor_name, action, table_name, details from public.audit_log
           order by occurred_at desc limit 6) x), '[]'::jsonb)) end)
    into r;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- 9) الصلاحيات
-- ---------------------------------------------------------------------
revoke all on function public.save_content(bigint, jsonb, integer[]), public.set_content_flags(bigint, jsonb),
                       public.delete_content(bigint), public.staff_content(jsonb), public.content_stats(),
                       public.content_viewers(bigint), public.my_content(), public.open_content(bigint),
                       public.set_content_progress(bigint, boolean, boolean), public.student_home(), public.staff_home()
  from public, anon;
grant execute on function public.save_content(bigint, jsonb, integer[]), public.set_content_flags(bigint, jsonb),
                          public.delete_content(bigint), public.staff_content(jsonb), public.content_stats(),
                          public.content_viewers(bigint), public.my_content(), public.open_content(bigint),
                          public.set_content_progress(bigint, boolean, boolean), public.student_home(), public.staff_home()
  to authenticated;
grant execute on function app.content_status(public.content_items), app.current_term(),
                          app.student_content_visible(bigint) to authenticated;
revoke all on function app.clean_content_attachments(jsonb) from public, anon, authenticated;

do $$ begin raise notice '✅ هجرة 24: الفيديوهات والإثراءات + الصفحات الرئيسية'; end $$;
