-- =====================================================================
-- مِرقاة — 22: التحضير والسلوك
--   التحضير: حصة كاملة في معاملة واحدة (من جدول المعلم أو اختيار يدوي)، تاريخ حقيقي،
--            سجلات مجمّعة بالحصة، ومتابعة الغياب بنفس معادلة النظام القديم
--            (الغائب = 1، المتأخر = ربع، الحاضر والمستأذن = لا خصم)
--   السلوك:  يبدأ كل طالب من 100 في الفصل الدراسي، السلبي يُخصم، الإيجابي يُعدّ (للتقدير)
--            الإداري يدير الكل، والمعلم يسجّل لطلاب نطاقه ويعدّل ما سجّله خلال 3 أيام
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) تصنيف الحالات من أسمائها (القوائم تُدار من الإعدادات بأسماء حرة)
-- ---------------------------------------------------------------------
create or replace function app.att_kind(p_name text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_name ~ '(غائب|غياب)' then 'absent'
    when p_name ~ '(متأخر|تأخر|تاخر)' then 'late'
    when p_name ~ '(مستأذن|استئذان|عذر|معذور)' then 'excused'
    else 'present' end
$$;

create or replace function app.beh_kind(p_name text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_name ~ 'سلب' then 'negative'
    when p_name ~ '(إيجاب|ايجاب|تميز|متميز)' then 'positive'
    else 'neutral' end
$$;

-- ---------------------------------------------------------------------
-- 2) التحضير: الفصل والتاريخ صريحان في كل سجل
-- ---------------------------------------------------------------------
alter table public.attendance_records
  add column class_id     integer references public.classes(id),
  add column occurred_on  date;

-- السجلات المنقولة: الفصل الحالي للطالب، والتاريخ من بداية الأسبوع + رقم اليوم
-- (وضع النقل: لا تُعلَّم كمعدَّلة ولا تُكتب في سجل التدقيق)
select set_config('app.migrating', 'on', false);
update public.attendance_records r
   set class_id = coalesce(r.class_id, s.class_id),
       occurred_on = coalesce(r.occurred_on, e.starts_on + (r.day_of_week - extract(dow from e.starts_on)::int))
  from public.students s, public.calendar_entries e
 where s.id = r.student_id and e.id = r.week_id;

-- كل الكتابة عبر save_attendance (تفرض التاريخ والنطاق والمهل)
revoke insert, update, delete on public.attendance_records from authenticated;

create index attendance_session_idx on public.attendance_records (class_id, occurred_on, period_no);
create index attendance_student_date_idx on public.attendance_records (student_id, occurred_on);

-- الأسبوع والفصل الدراسي ليوم معيّن (ويرفض الإجازات وعطلة نهاية الأسبوع)
create or replace function app.school_day(p_date date, out week_id integer, out term_id smallint, out day_of_week smallint)
language plpgsql stable security definer set search_path = '' as $$
declare v_dow int := extract(dow from p_date)::int;
begin
  if v_dow > 4 then raise exception 'هذا اليوم عطلة نهاية الأسبوع'; end if;
  if exists (select 1 from public.calendar_entries c
              where p_date between c.starts_on and c.ends_on and c.event ~ '(إجازة|اجازة|عطلة)') then
    raise exception 'هذا اليوم إجازة في التقويم الدراسي';
  end if;
  select w.week_id, w.term_id into week_id, term_id
    from public.school_weeks w where p_date between w.starts_on and w.ends_on
   order by w.starts_on desc limit 1;
  if week_id is null then raise exception 'هذا التاريخ خارج أسابيع التقويم الدراسي'; end if;
  day_of_week := v_dow;
end $$;

-- حفظ تحضير حصة كاملة: {class_id, subject_id, period_no, date, rows:[{student_id, status_id, note}]}
create or replace function public.save_attendance(p jsonb) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_class   integer := (p ->> 'class_id')::int;
  v_subject smallint := nullif(p ->> 'subject_id', '')::smallint;
  v_period  smallint := (p ->> 'period_no')::smallint;
  v_date    date := coalesce(nullif(p ->> 'date', '')::date, (now() at time zone 'Asia/Riyadh')::date);
  v_today   date := (now() at time zone 'Asia/Riyadh')::date;
  v_admin   boolean := app.is_admin();
  v_emp     bigint := app.my_employee_id();
  d         record;
  r         jsonb;
  v_sid     bigint;
  v_status  smallint;
  v_old     public.attendance_records;
  v_n       integer := 0;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if v_class is null or v_period is null or v_period not between 1 and 12 then raise exception 'اختر الفصل والحصة'; end if;
  if not v_admin and not app.staff_can_access(v_class, v_subject) then
    raise exception 'هذا الفصل أو هذه المادة خارج نطاق صلاحياتك' using errcode = '42501';
  end if;
  if v_date > v_today then raise exception 'لا تحضير ليوم لم يأتِ بعد'; end if;
  -- المعلم: اليوم وحتى 3 أيام سابقة (لمن نسي)، والإداري أي يوم
  if not v_admin and v_date < v_today - 3 then raise exception 'تحضير يوم مضى عليه أكثر من 3 أيام من الإدارة فقط'; end if;
  select * into d from app.school_day(v_date);
  if jsonb_typeof(p -> 'rows') <> 'array' or jsonb_array_length(p -> 'rows') = 0 then raise exception 'الكشف فارغ'; end if;
  if jsonb_array_length(p -> 'rows') > 200 then raise exception 'الكشف أكبر من المسموح'; end if;

  for r in select * from jsonb_array_elements(p -> 'rows') loop
    v_sid := (r ->> 'student_id')::bigint;
    v_status := (r ->> 'status_id')::smallint;
    if not exists (select 1 from public.students s where s.id = v_sid and s.class_id = v_class) then
      raise exception 'طالب ليس في هذا الفصل';
    end if;
    if not exists (select 1 from public.attendance_statuses where id = v_status) then raise exception 'حالة تحضير غير معروفة'; end if;
    if char_length(coalesce(r ->> 'note', '')) > 300 then raise exception 'الملاحظة طويلة'; end if;

    select * into v_old from public.attendance_records a
     where a.student_id = v_sid and a.week_id = d.week_id and a.day_of_week = d.day_of_week
       and a.period_no = v_period and a.subject_id is not distinct from v_subject;
    if v_old.id is null then
      insert into public.attendance_records (student_id, week_id, day_of_week, period_no, subject_id, status_id, note,
                                             recorded_by, recorder_type, class_id, occurred_on)
      values (v_sid, d.week_id, d.day_of_week, v_period, v_subject, v_status, nullif(btrim(coalesce(r ->> 'note', '')), ''),
              v_emp, case when v_admin then 'admin' else 'teacher' end, v_class, v_date);
      v_n := v_n + 1;
    elsif v_old.status_id <> v_status or v_old.note is distinct from nullif(btrim(coalesce(r ->> 'note', '')), '') then
      if not v_admin and (v_old.recorded_by is distinct from v_emp or v_old.recorded_at < now() - interval '3 days') then
        raise exception 'لا يمكنك تعديل تحضير سجّله غيرك أو مضى عليه أكثر من 3 أيام';
      end if;
      update public.attendance_records
         set status_id = v_status, note = nullif(btrim(coalesce(r ->> 'note', '')), ''), class_id = v_class, occurred_on = v_date
       where id = v_old.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

-- حذف تحضير حصة كاملة: الإداري دائمًا، والمعلم ما سجّله خلال 6 ساعات
create or replace function public.delete_attendance_session(p_class_id integer, p_date date, p_period smallint, p_subject_id smallint)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare v_n integer;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not app.is_admin() and exists (
       select 1 from public.attendance_records a
        where a.class_id = p_class_id and a.occurred_on = p_date and a.period_no = p_period and a.subject_id is not distinct from p_subject_id
          and (a.recorded_by is distinct from app.my_employee_id() or a.recorded_at < now() - interval '6 hours')) then
    raise exception 'حذف التحضير متاح لمن سجّله خلال 6 ساعات فقط — اطلب الحذف من الإدارة';
  end if;
  delete from public.attendance_records a
   where a.class_id = p_class_id and a.occurred_on = p_date and a.period_no = p_period and a.subject_id is not distinct from p_subject_id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- حصص المعلم اليوم من جدوله، مع حالة تحضير كل حصة
create or replace function public.my_periods(p_date date default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  with d as (select coalesce(p_date, (now() at time zone 'Asia/Riyadh')::date) as day)
  select coalesce(jsonb_agg(jsonb_build_object(
           'slot_id', t.id, 'class_id', t.class_id, 'subject_id', t.subject_id, 'period_no', t.period_no,
           'starts_at', t.starts_at, 'subject', s.name,
           'recorded', (select count(*) from public.attendance_records a
                         where a.class_id = t.class_id and a.occurred_on = d.day and a.period_no = t.period_no
                           and a.subject_id is not distinct from t.subject_id),
           'absent', (select count(*) from public.attendance_records a join public.attendance_statuses st on st.id = a.status_id
                       where a.class_id = t.class_id and a.occurred_on = d.day and a.period_no = t.period_no
                         and a.subject_id is not distinct from t.subject_id and app.att_kind(st.name) = 'absent'),
           'students', (select count(*) from public.students x where x.class_id = t.class_id and x.status = 'active'))
         order by t.period_no), '[]'::jsonb)
    from public.timetable_slots t
    join public.subjects s on s.id = t.subject_id
    cross join d
   where t.teacher_id = app.my_employee_id()
     and t.day_of_week = extract(dow from d.day)::int
     and extract(dow from d.day)::int <= 4
$$;

-- سجلات التحضير مجمّعة بالحصة (بصلاحيات المستخدم: المعلم يرى طلاب نطاقه فقط)
create or replace function public.attendance_sessions(p jsonb) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_page  integer := greatest(1, coalesce((p ->> 'page')::int, 1));
  v_size  integer := least(50, greatest(5, coalesce((p ->> 'size')::int, 15)));
  v_class integer := nullif(p ->> 'class_id', '')::int;
  v_from  date := nullif(p ->> 'from', '')::date;
  v_mine  boolean := coalesce((p ->> 'mine')::boolean, false);
  result  jsonb;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  with g as (
    select a.class_id, a.occurred_on, a.period_no, a.subject_id,
           count(*) as total,
           count(*) filter (where app.att_kind(st.name) = 'present') as present,
           count(*) filter (where app.att_kind(st.name) = 'absent') as absent,
           count(*) filter (where app.att_kind(st.name) = 'late') as late,
           count(*) filter (where app.att_kind(st.name) = 'excused') as excused,
           max(a.recorded_at) as recorded_at,
           (array_agg(a.recorded_by order by a.recorded_at desc))[1] as recorded_by,
           bool_or(a.is_edited) as edited
      from public.attendance_records a
      join public.attendance_statuses st on st.id = a.status_id
     where a.class_id is not null and a.occurred_on is not null
       and (v_class is null or a.class_id = v_class)
       and (v_from is null or a.occurred_on >= v_from)
       and (not v_mine or a.recorded_by = app.my_employee_id())
     group by a.class_id, a.occurred_on, a.period_no, a.subject_id
  )
  select jsonb_build_object(
    'total', (select count(*) from g),
    'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_on desc, x.period_no desc)
                        from (select g.*, s.name as subject, e.name_ar as recorder
                                from g left join public.subjects s on s.id = g.subject_id
                                left join public.staff_directory e on e.id = g.recorded_by
                               order by g.occurred_on desc, g.period_no desc
                               offset (v_page - 1) * v_size limit v_size) x), '[]'::jsonb))
    into result;
  return result;
end $$;

-- متابعة الغياب لفصل في فصل دراسي: نسبة الحضور بمعادلة النظام القديم
create or replace function public.attendance_summary(p_class_id integer, p_term_id smallint) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(x order by x.pct, x.absent desc), '[]'::jsonb) into result from (
    select s.id as student_id, s.code, s.name_ar,
           count(a.id) as total,
           count(a.id) filter (where app.att_kind(st.name) = 'absent') as absent,
           count(a.id) filter (where app.att_kind(st.name) = 'late') as late,
           count(a.id) filter (where app.att_kind(st.name) = 'excused') as excused,
           case when count(a.id) = 0 then null
                else greatest(0, round(100 * (count(a.id) - count(a.id) filter (where app.att_kind(st.name) = 'absent')
                                              - 0.25 * count(a.id) filter (where app.att_kind(st.name) = 'late')) / count(a.id))) end as pct,
           max(a.occurred_on) filter (where app.att_kind(st.name) = 'absent') as last_absent
      from public.students s
      left join public.calendar_entries w on w.term_id = p_term_id
      left join public.attendance_records a on a.student_id = s.id and a.week_id = w.id
      left join public.attendance_statuses st on st.id = a.status_id
     where s.class_id = p_class_id and s.status = 'active'
     group by s.id, s.code, s.name_ar
  ) x;
  return result;
end $$;

-- ---------------------------------------------------------------------
-- 3) السلوك
-- ---------------------------------------------------------------------
alter table public.behavior_records
  add column occurred_on date,
  add column subject_id smallint references public.subjects(id),
  add column is_edited boolean not null default false;

update public.behavior_records b
   set occurred_on = coalesce(b.occurred_on, e.starts_on + (coalesce(b.day_of_week, 0) - extract(dow from e.starts_on)::int))
  from public.calendar_entries e
 where e.id = b.week_id;
update public.behavior_records set occurred_on = recorded_at::date where occurred_on is null;
select set_config('app.migrating', 'off', false);
create index behavior_records_recent_idx on public.behavior_records (recorded_at desc);

-- المعلم يرى سلوك طلاب نطاقه، ويسجّل لهم، ويعدّل ما سجّله خلال 3 أيام؛ والإداري الكل
drop policy if exists behavior_read on public.behavior_records;
drop policy if exists behavior_admin_write on public.behavior_records;
create policy behavior_read on public.behavior_records for select to authenticated
  using ((select app.is_admin())
         or student_id = (select app.my_student_id())
         or ((select app.is_staff()) and app.staff_can_access_student(student_id)));
-- الكتابة كلها عبر الدوال
revoke insert, update, delete on public.behavior_records from authenticated;

create or replace function public.save_behavior(p_id bigint, p jsonb) returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_admin  boolean := app.is_admin();
  v_emp    bigint := app.my_employee_id();
  v_sid    bigint := (p ->> 'student_id')::bigint;
  v_status smallint := (p ->> 'status_id')::smallint;
  v_score  numeric := coalesce(nullif(p ->> 'score', '')::numeric, 0);
  v_date   date := coalesce(nullif(p ->> 'date', '')::date, (now() at time zone 'Asia/Riyadh')::date);
  v_today  date := (now() at time zone 'Asia/Riyadh')::date;
  v_old    public.behavior_records;
  v_week   integer;
  v_term   smallint;
  v_id     bigint;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not exists (select 1 from public.behavior_statuses where id = v_status) then raise exception 'اختر حالة السلوك'; end if;
  if v_score < 0 or v_score > 100 then raise exception 'الدرجة بين 0 و 100'; end if;
  if char_length(coalesce(p ->> 'note', '')) > 1000 then raise exception 'الملاحظة طويلة'; end if;
  if v_date > v_today then raise exception 'لا يمكن تسجيل سلوك بتاريخ قادم'; end if;
  if not v_admin and v_date < v_today - 14 then raise exception 'تسجيل سلوك أقدم من أسبوعين من الإدارة فقط'; end if;
  if not v_admin and not app.staff_can_access_student(v_sid) then
    raise exception 'الطالب خارج نطاق صلاحياتك' using errcode = '42501';
  end if;
  if not exists (select 1 from public.students where id = v_sid) then raise exception 'الطالب غير موجود'; end if;

  select w.week_id, w.term_id into v_week, v_term from public.school_weeks w
   where v_date between w.starts_on and w.ends_on order by w.starts_on desc limit 1;
  if v_term is null then
    select c.term_id into v_term from public.calendar_entries c where v_date between c.starts_on and c.ends_on limit 1;
  end if;

  if p_id is null then
    insert into public.behavior_records (student_id, term_id, week_id, day_of_week, status_id, score, note, recorded_by, recorder_type,
                                         occurred_on, subject_id)
    values (v_sid, v_term, v_week, least(4, extract(dow from v_date)::int), v_status, round(v_score, 2),
            nullif(btrim(coalesce(p ->> 'note', '')), ''), v_emp, case when v_admin then 'admin' else 'teacher' end,
            v_date, nullif(p ->> 'subject_id', '')::smallint)
    returning id into v_id;
    return v_id;
  end if;

  select * into v_old from public.behavior_records where id = p_id;
  if v_old.id is null then raise exception 'السجل غير موجود'; end if;
  if not v_admin and (v_old.recorded_by is distinct from v_emp or v_old.recorded_at < now() - interval '3 days') then
    raise exception 'تعديل سجل سلوك متاح لمن سجّله خلال 3 أيام فقط';
  end if;
  update public.behavior_records
     set student_id = v_sid, term_id = v_term, week_id = v_week, day_of_week = least(4, extract(dow from v_date)::int),
         status_id = v_status, score = round(v_score, 2), note = nullif(btrim(coalesce(p ->> 'note', '')), ''),
         occurred_on = v_date, subject_id = nullif(p ->> 'subject_id', '')::smallint, is_edited = true
   where id = p_id;
  return p_id;
end $$;

create or replace function public.delete_behavior(p_id bigint) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_old public.behavior_records;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into v_old from public.behavior_records where id = p_id;
  if v_old.id is null then return; end if;
  if not app.is_admin() and (v_old.recorded_by is distinct from app.my_employee_id() or v_old.recorded_at < now() - interval '6 hours') then
    raise exception 'الحذف متاح لمن سجّله خلال 6 ساعات فقط — اطلبه من الإدارة';
  end if;
  delete from public.behavior_records where id = p_id;
end $$;

-- ملخص سلوك طالب في فصل دراسي: 100 − مجموع خصم السلبي، وعدد الإيجابي
create or replace function public.behavior_summary(p_student_id bigint, p_term_id smallint) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'score', greatest(0, 100 - coalesce(sum(b.score) filter (where app.beh_kind(st.name) = 'negative'), 0)),
    'negative', count(*) filter (where app.beh_kind(st.name) = 'negative'),
    'positive', count(*) filter (where app.beh_kind(st.name) = 'positive'),
    'neutral', count(*) filter (where app.beh_kind(st.name) = 'neutral'),
    'total', count(*))
    from public.behavior_records b join public.behavior_statuses st on st.id = b.status_id
   where b.student_id = p_student_id and (p_term_id is null or b.term_id = p_term_id)
$$;

-- لوحة السلوك: الأكثر خصمًا والأكثر تميزًا في الفصل الدراسي (ضمن ما يراه المستخدم)
create or replace function public.behavior_board(p_term_id smallint) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare r jsonb;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  with per as (
    select b.student_id,
           greatest(0, 100 - coalesce(sum(b.score) filter (where app.beh_kind(st.name) = 'negative'), 0)) as score,
           count(*) filter (where app.beh_kind(st.name) = 'negative') as negative,
           count(*) filter (where app.beh_kind(st.name) = 'positive') as positive
      from public.behavior_records b join public.behavior_statuses st on st.id = b.status_id
     where p_term_id is null or b.term_id = p_term_id
     group by b.student_id
  )
  select jsonb_build_object(
    'lowest', coalesce((select jsonb_agg(x) from (select per.*, s.name_ar, s.code from per join public.students s on s.id = per.student_id
                                                    where per.negative > 0 order by per.score, per.negative desc limit 6) x), '[]'),
    'top', coalesce((select jsonb_agg(x) from (select per.*, s.name_ar, s.code from per join public.students s on s.id = per.student_id
                                                 where per.positive > 0 order by per.positive desc, per.score desc limit 6) x), '[]'),
    'week', (select jsonb_build_object(
                'positive', count(*) filter (where app.beh_kind(st.name) = 'positive'),
                'negative', count(*) filter (where app.beh_kind(st.name) = 'negative'))
               from public.behavior_records b join public.behavior_statuses st on st.id = b.status_id
              where b.occurred_on >= (now() at time zone 'Asia/Riyadh')::date - 6))
    into r;
  return r;
end $$;

revoke all on function public.save_attendance(jsonb), public.delete_attendance_session(integer, date, smallint, smallint),
                       public.my_periods(date), public.attendance_sessions(jsonb), public.attendance_summary(integer, smallint),
                       public.save_behavior(bigint, jsonb), public.delete_behavior(bigint), public.behavior_summary(bigint, smallint),
                       public.behavior_board(smallint)
  from public, anon;
grant execute on function public.save_attendance(jsonb), public.delete_attendance_session(integer, date, smallint, smallint),
                          public.my_periods(date), public.attendance_sessions(jsonb), public.attendance_summary(integer, smallint),
                          public.save_behavior(bigint, jsonb), public.delete_behavior(bigint), public.behavior_summary(bigint, smallint),
                          public.behavior_board(smallint)
  to authenticated;
grant execute on function app.att_kind(text), app.beh_kind(text) to authenticated;

do $$ begin raise notice '✅ هجرة 22: التحضير والسلوك'; end $$;
