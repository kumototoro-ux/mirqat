-- =====================================================================
-- مِرقاة — 35: مفاتيح الصلاحيات الفردية (الدفعة 1 من نظام الأدوار والصلاحيات)
--
-- الفكرة: نوع الحساب (إداري / معلم / طالب) كما هو، وفوقه «مفاتيح» تُمنح أو تُسحب لكل معلم على حدة:
--   إنشاء الاختبارات، طباعتها وأوراق الإجابة، التصحيح بالكاميرا، تصحيح المقالي، الرصد اليومي وتحسين الدرجات،
--   نشر الفيديوهات، إعادة فتح المنتهي، نسخ المهام والنماذج.
-- لكل مفتاح قيمة افتراضية للمعلم (المغلقة: إنشاء الاختبارات، التصحيح بالكاميرا، إعادة الفتح)،
-- ولكل معلم استثناء فردي يمنحه الإداري أو يسحبه. الإداري يملك كل المفاتيح دائمًا.
-- المعلمون الحاليون يحتفظون بكل ما عندهم الآن: يُمنحون المفاتيح المغلقة صراحةً عند التشغيل.
-- المنع في القاعدة داخل الدوال المحمية نفسها، لا في الأزرار فقط.
-- =====================================================================

create table public.permission_keys (
  key             text primary key,
  name_ar         text not null,
  hint            text,
  sort            smallint not null,
  teacher_default boolean not null
);
comment on table public.permission_keys is 'قائمة المفاتيح المتاحة وقيمتها الافتراضية للمعلم — تُضاف بالهجرات وحدها';

create table public.user_permissions (
  employee_id bigint not null references public.employees(id) on delete cascade,
  key         text   not null references public.permission_keys(key) on delete cascade,
  granted     boolean not null,
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  primary key (employee_id, key)
);
comment on table public.user_permissions is 'استثناء فردي عن الافتراضي: granted=true منح، false سحب. غيابه = الافتراضي';

alter table public.permission_keys enable row level security;
alter table public.user_permissions enable row level security;
revoke all on public.permission_keys, public.user_permissions from anon, authenticated;
grant select on public.permission_keys to authenticated;
grant select on public.user_permissions to authenticated;   -- القراءة فقط، والكتابة عبر admin_set_permission
create policy permission_keys_read on public.permission_keys for select to authenticated
  using ((select app.my_role()) is not null);
create policy user_permissions_read on public.user_permissions for select to authenticated
  using ((select app.is_admin()) or employee_id = (select app.my_employee_id()));
create trigger user_permissions_audit after insert or update or delete on public.user_permissions
  for each row execute function app.audit_row();

insert into public.permission_keys (key, name_ar, hint, sort, teacher_default) values
  ('create_exams',    'إنشاء الاختبارات والنماذج',        'إنشاء نموذج جديد أو تعديل أسئلته', 1, false),
  ('print_exams',     'طباعة الاختبارات وأوراق الإجابة',  'ورقة الأسئلة ونسخة المعلم وأوراق التظليل', 2, true),
  ('camera_grading',  'التصحيح بالكاميرا',                'قراءة أوراق التظليل بالكاميرا وحفظ الدرجات', 3, false),
  ('essay_grading',   'تصحيح الأسئلة المقالية',           'مكتب التصحيح للإجابات المقالية', 4, true),
  ('daily_grading',   'الرصد اليومي وتحسين الدرجات',      'رصد الدرجات يدويًا وتحسين درجة طالب', 5, true),
  ('publish_content', 'نشر الفيديوهات والإثراءات',        'رفع المحتوى للطلاب وتعديله', 6, true),
  ('reopen',          'إعادة فتح مهمة أو نموذج منتهٍ',    'تمديد الموعد بعد انتهائه', 7, false),
  ('copy_assessment', 'نسخ مهمة أو نموذج لفصل آخر',       'نسخ ما أنشأه لفصول أخرى', 8, true);

-- المعلمون الحاليون: يحتفظون بكل ما عندهم الآن (يسحب الإداري ممن لا يريد)
insert into public.user_permissions (employee_id, key, granted)
select e.id, k.key, true
  from public.employees e cross join public.permission_keys k
 where e.user_type <> 'admin' and not k.teacher_default;

-- ---------------------------------------------------------------------
-- الفحص: المفتاح الفعلي = استثناء المعلم إن وُجد، وإلا الافتراضي. الإداري يملك الكل. غير المعلم لا شيء.
-- ---------------------------------------------------------------------
create or replace function app.has_perm(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when app.is_admin() then true
    when app.my_role() is distinct from 'teacher' then false
    else coalesce(
      (select u.granted from public.user_permissions u where u.employee_id = app.my_employee_id() and u.key = p_key),
      (select k.teacher_default from public.permission_keys k where k.key = p_key),
      false)
  end
$$;
revoke all on function app.has_perm(text) from public, anon;
grant execute on function app.has_perm(text) to authenticated;

create or replace function app.require_perm(p_key text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(app.has_perm(p_key), false) then
    raise exception 'FORBIDDEN: لا تملك صلاحية هذه العملية، راجع الإدارة' using errcode = '42501';
  end if;
end $$;
revoke all on function app.require_perm(text) from public, anon;
grant execute on function app.require_perm(text) to authenticated;

-- مفاتيحي الفعلية لواجهة الموقع (إخفاء الأزرار فقط — الحماية الحقيقية داخل الدوال)
create or replace function public.my_permissions() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(k.key, app.has_perm(k.key)), '{}'::jsonb) from public.permission_keys k
$$;
revoke all on function public.my_permissions() from public, anon;
grant execute on function public.my_permissions() to authenticated;

-- منح مفتاح أو سحبه أو إعادته للافتراضي (p_granted = null) — للإداري وحده
create or replace function public.admin_set_permission(p_employee_id bigint, p_key text, p_granted boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_type text;
begin
  perform app.require_admin();
  if not exists (select 1 from public.permission_keys where key = p_key) then
    raise exception 'مفتاح غير معروف: %', p_key;
  end if;
  select user_type into v_type from public.employees where id = p_employee_id;
  if not found then raise exception 'الموظف غير موجود'; end if;
  if v_type = 'admin' then raise exception 'الإداري يملك كل الصلاحيات ولا تُعدَّل'; end if;
  if p_granted is null then
    delete from public.user_permissions where employee_id = p_employee_id and key = p_key;
  else
    insert into public.user_permissions (employee_id, key, granted, updated_by)
    values (p_employee_id, p_key, p_granted, auth.uid())
    on conflict (employee_id, key) do update set granted = excluded.granted, updated_by = auth.uid(), updated_at = now();
  end if;
end $$;
revoke all on function public.admin_set_permission(bigint, text, boolean) from public, anon;
grant execute on function public.admin_set_permission(bigint, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- تحصين الدوال المحمية بالمفاتيح (نفس نصوصها الحالية + سطر الفحص أول الدالة)
-- ---------------------------------------------------------------------
-- save_form ← مفتاح create_exams
create or replace function public.save_form(p_id bigint, p jsonb, p_class_ids integer[] default null) returns bigint[]
language plpgsql volatile security definer set search_path = '' as $$
declare
  b        record;
  v_ids    bigint[] := '{}';
  v_id     bigint;
  c        integer;
  v_old    public.assessments;
begin
  perform app.require_perm('create_exams');
  select * into b from app.assessment_base(p);

  if p_id is not null then
    perform app.assert_can_edit(p_id);
    select * into v_old from public.assessments where id = p_id and kind = 'form';
    if v_old.id is null then raise exception 'النموذج غير موجود'; end if;
    perform app.assert_can_author(v_old.class_id, b.v_subject);
    update public.assessments
       set title = b.v_title, description = app.nz(p, 'description'), subject_id = b.v_subject,
           term_id = b.v_term, eval_type_id = b.v_eval
     where id = p_id;
    if p ? 'questions' then perform app.save_form_questions(p_id, p -> 'questions'); end if;
    perform app.apply_form_details(p_id, coalesce(p -> 'details', '{}'), true);
    return array[p_id];
  end if;

  if p_class_ids is null or cardinality(p_class_ids) = 0 then raise exception 'اختر فصلًا واحدًا على الأقل'; end if;
  if cardinality(p_class_ids) > 30 then raise exception 'الحد الأقصى 30 فصلًا دفعة واحدة'; end if;
  foreach c in array p_class_ids loop
    perform app.assert_can_author(c, b.v_subject);
    insert into public.assessments (kind, class_id, subject_id, term_id, eval_type_id, teacher_id, title, description)
    values ('form', c, b.v_subject, b.v_term, b.v_eval, b.v_teacher, b.v_title, app.nz(p, 'description'))
    returning id into v_id;
    perform app.save_form_questions(v_id, coalesce(p -> 'questions', '[]'));
    perform app.apply_form_details(v_id, coalesce(p -> 'details', '{}'), true);
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end $$;

-- save_paper_attempt ← مفتاح camera_grading
create or replace function public.save_paper_attempt(p_assessment_id bigint, p_student_id bigint, p_choices jsonb,
                                                     p_points jsonb default '{}'::jsonb, p_meta jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  a          public.assessments;
  q          record;
  v_attempt  bigint;
  v_max      numeric(7,2);
  v_opt      bigint;
  v_raw      text;
  v_pts      numeric;
  v_sc       record;
  v_replaced boolean;
  t          public.form_attempts;
begin
  perform app.require_perm('camera_grading');
  select * into a from public.assessments where id = p_assessment_id;
  if a.id is null or a.kind <> 'form' then raise exception 'النموذج غير موجود'; end if;
  perform app.assert_can_edit(p_assessment_id);
  if p_choices is null or jsonb_typeof(p_choices) <> 'object' then raise exception 'صيغة الإجابات غير صحيحة'; end if;
  p_points := coalesce(p_points, '{}'::jsonb);
  if jsonb_typeof(p_points) <> 'object' then raise exception 'صيغة الدرجات غير صحيحة'; end if;
  if not exists (select 1 from public.students s where s.id = p_student_id and s.class_id = a.class_id) then
    raise exception 'الطالب ليس من صف هذا النموذج';
  end if;
  if exists (select 1 from jsonb_object_keys(p_choices) k
              where not exists (select 1 from public.form_questions fq
                                 where fq.assessment_id = p_assessment_id and fq.id::text = k and fq.qtype in ('mcq', 'tf'))) then
    raise exception 'إجابات لأسئلة ليست أسئلة اختيار في هذا النموذج';
  end if;
  if exists (select 1 from jsonb_object_keys(p_points) k
              where not exists (select 1 from public.form_questions fq
                                 where fq.assessment_id = p_assessment_id and fq.id::text = k and fq.qtype not in ('mcq', 'tf'))) then
    raise exception 'درجات لأسئلة ليست مكتوبة في هذا النموذج';
  end if;
  if exists (select 1 from public.form_attempts t2
              where t2.assessment_id = p_assessment_id and t2.student_id = p_student_id
                and not t2.is_auto_absent and t2.source = 'online') then
    raise exception 'للطالب محاولة إلكترونية في هذا النموذج — صفّرها من النتائج أولًا إن أردت اعتماد الورقة';
  end if;

  -- إعادة التصوير تستبدل الورقة السابقة، والصفر التلقائي يُستبدل بالورقة
  v_replaced := exists (select 1 from public.form_attempts t2
                         where t2.assessment_id = p_assessment_id and t2.student_id = p_student_id and t2.source = 'paper');
  delete from public.form_attempts t2
   where t2.assessment_id = p_assessment_id and t2.student_id = p_student_id and (t2.is_auto_absent or t2.source = 'paper');
  delete from public.form_sessions s
   where s.assessment_id = p_assessment_id and s.student_id = p_student_id and s.submitted_at is null;

  select coalesce(sum(points), 0) into v_max from public.form_questions where assessment_id = p_assessment_id;
  insert into public.form_attempts (assessment_id, student_id, attempt_no, score, max_score, raw_answers, source, scanned_by, submitted_at)
  values (p_assessment_id, p_student_id, 1, 0, v_max,
          jsonb_build_object('choices', p_choices, 'points', p_points, 'scan', p_meta),
          'paper', app.my_employee_id(), now())
  returning id into v_attempt;

  for q in select * from public.form_questions where assessment_id = p_assessment_id order by position loop
    if q.qtype in ('mcq', 'tf') then
      v_raw := p_choices ->> q.id::text;
      continue when v_raw is null;
      if v_raw !~ '^\d{1,18}$' then raise exception 'إجابة غير صالحة للسؤال %', q.position; end if;
      select o.id into v_opt from public.question_options o where o.id = v_raw::bigint and o.question_id = q.id;
      if v_opt is null then raise exception 'الخيار لا ينتمي للسؤال %', q.position; end if;
      select * into v_sc from app.score_answer(q.id, v_opt, null);
      insert into public.attempt_answers (attempt_id, question_id, option_id, response, points, status)
      values (v_attempt, q.id, v_opt, null, v_sc.pts, v_sc.st);
    else
      v_raw := p_points ->> q.id::text;
      if v_raw is null then
        insert into public.attempt_answers (attempt_id, question_id, option_id, response, points, status)
        values (v_attempt, q.id, null, null, 0, 'pending');
      else
        if v_raw !~ '^\d{1,4}(\.\d{1,2})?$' then raise exception 'درجة غير صالحة للسؤال %', q.position; end if;
        v_pts := v_raw::numeric;
        if v_pts > q.points then raise exception 'درجة السؤال % بين 0 و %', q.position, trim_scale(q.points); end if;
        insert into public.attempt_answers (attempt_id, question_id, option_id, response, points, status)
        values (v_attempt, q.id, null, null, round(v_pts, 2), 'manual');
      end if;
    end if;
  end loop;

  perform app.recompute_attempt(v_attempt);
  select * into t from public.form_attempts where id = v_attempt;
  return jsonb_build_object('attempt_id', t.id, 'score', t.score, 'max_score', t.max_score,
                            'pending_review', t.pending_review, 'replaced', v_replaced);
end $$;

-- reopen_task ← مفتاح reopen
create or replace function public.reopen_task(p_assessment_id bigint, p_due_at timestamptz) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_perm('reopen');
  if not app.can_edit_assessment(p_assessment_id) then raise exception 'FORBIDDEN'; end if;
  if (select kind from public.assessments where id = p_assessment_id) <> 'task' then raise exception 'ليست مهمة'; end if;
  if p_due_at is null or p_due_at <= now() then raise exception 'حدّد موعد تسليم جديدًا في المستقبل'; end if;
  update public.assessments
     set due_at = p_due_at,
         published_at = case when published_at is null or published_at > now() then now() else published_at end,
         week_id = coalesce(app.current_week_id(), week_id)
   where id = p_assessment_id;
end $$;

-- reopen_form ← مفتاح reopen
create or replace function public.reopen_form(p_assessment_id bigint, p_closes_at timestamptz) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_perm('reopen');
  if not app.can_edit_assessment(p_assessment_id) then raise exception 'FORBIDDEN'; end if;
  if p_closes_at is null or p_closes_at <= now() then
    raise exception 'حدّد تاريخ ووقت إغلاق جديد في المستقبل';
  end if;
  if not exists (select 1 from public.form_questions where assessment_id = p_assessment_id) then
    raise exception 'لا يمكن فتح نموذج بلا أسئلة';
  end if;
  delete from public.grade_entries where assessment_id = p_assessment_id and source = 'auto_absent';
  delete from public.form_attempts where assessment_id = p_assessment_id and is_auto_absent;
  update public.form_details
     set status = 'published', closes_at = p_closes_at, absence_settled_at = null
   where assessment_id = p_assessment_id;
  update public.assessments set week_id = coalesce(app.current_week_id(), week_id) where id = p_assessment_id;
end $$;

-- duplicate_assessment ← مفتاح copy_assessment
create or replace function public.duplicate_assessment(p_id bigint, p_class_ids integer[]) returns bigint[]
language plpgsql volatile security definer set search_path = '' as $$
declare
  a      public.assessments;
  c      integer;
  v_new  bigint;
  v_ids  bigint[] := '{}';
  q      record;
  v_q    bigint;
begin
  perform app.require_perm('copy_assessment');
  select * into a from public.assessments where id = p_id;
  if a.id is null or not (app.is_admin() or app.staff_can_access(a.class_id, a.subject_id)) then
    raise exception 'التقييم غير موجود';
  end if;
  if p_class_ids is null or cardinality(p_class_ids) = 0 then p_class_ids := array[a.class_id]; end if;
  if cardinality(p_class_ids) > 30 then raise exception 'الحد الأقصى 30 فصلًا'; end if;

  foreach c in array p_class_ids loop
    perform app.assert_can_author(c, a.subject_id);
    insert into public.assessments (kind, class_id, subject_id, term_id, eval_type_id, teacher_id, title, description,
                                    max_score, published_at, due_at, submission_mode, allow_late, is_draft, target_student_id)
    values (a.kind, c, a.subject_id, a.term_id, a.eval_type_id,
            case when app.is_admin() then a.teacher_id else app.my_employee_id() end,
            left(a.title || case when c = a.class_id then ' (نسخة)' else '' end, 200), a.description,
            a.max_score, null, null, a.submission_mode, a.allow_late, a.kind <> 'manual', case when c = a.class_id then a.target_student_id end)
    returning id into v_new;

    insert into public.assessment_attachments (assessment_id, kind, name, url, storage_path, mime, size_bytes, position)
    select v_new, kind, name, url, storage_path, mime, size_bytes, position
      from public.assessment_attachments where assessment_id = a.id;

    if a.kind = 'form' then
      insert into public.form_details (assessment_id, max_attempts, status, intro_video_url, shuffle_questions,
                                       shuffle_options, time_limit_minutes, show_results, track_focus, allow_review)
      select v_new, max_attempts, 'draft', intro_video_url, shuffle_questions, shuffle_options,
             time_limit_minutes, show_results, track_focus, allow_review
        from public.form_details where assessment_id = a.id;
      for q in select * from public.form_questions where assessment_id = a.id order by position loop
        insert into public.form_questions (assessment_id, position, body, image_url, points, section_title,
                                           section_instructions, qtype, config, explanation)
        values (v_new, q.position, q.body, q.image_url, q.points, q.section_title, q.section_instructions,
                q.qtype, q.config, q.explanation)
        returning id into v_q;
        insert into public.question_options (question_id, position, body, is_correct)
        select v_q, position, body, is_correct from public.question_options where question_id = q.id;
      end loop;
    end if;
    v_ids := v_ids || v_new;
  end loop;
  return v_ids;
end $$;

-- save_content ← مفتاح publish_content
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
  perform app.require_perm('publish_content');
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

-- grade_form_answer ← مفتاح essay_grading
create or replace function public.grade_form_answer(p_attempt_id bigint, p_question_id bigint, p_points numeric, p_feedback text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  t public.form_attempts;
  q public.form_questions;
begin
  perform app.require_perm('essay_grading');
  select * into t from public.form_attempts where id = p_attempt_id and not is_auto_absent;
  if t.id is null then raise exception 'المحاولة غير موجودة'; end if;
  perform app.assert_can_edit(t.assessment_id);
  select * into q from public.form_questions where id = p_question_id and assessment_id = t.assessment_id;
  if q.id is null then raise exception 'السؤال ليس من هذا النموذج'; end if;
  if p_points is null or p_points < 0 or p_points > q.points then
    raise exception 'الدرجة بين 0 و %', trim_scale(q.points);
  end if;
  insert into public.attempt_answers (attempt_id, question_id, option_id, response, points, status, feedback)
  values (t.id, q.id, null, null, round(p_points, 2), 'manual', nullif(btrim(coalesce(p_feedback, '')), ''))
  on conflict (attempt_id, question_id) do update
     set points = excluded.points, status = 'manual', feedback = excluded.feedback;
  perform app.recompute_attempt(t.id);
  select * into t from public.form_attempts where id = p_attempt_id;
  return jsonb_build_object('score', t.score, 'max_score', t.max_score, 'pending_review', t.pending_review);
end $$;

-- grade_task ← مفتاح daily_grading
create or replace function public.grade_task(p_id bigint, p_rows jsonb) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  a        public.assessments;
  r        jsonb;
  v_sid    bigint;
  v_score  numeric;
  v_old    public.grade_entries;
  v_emp    bigint := app.my_employee_id();
  v_admin  boolean := app.is_admin();
  v_n      integer := 0;
begin
  perform app.require_perm('daily_grading');
  perform app.assert_can_edit(p_id);
  select * into a from public.assessments where id = p_id;
  if a.kind = 'form' then raise exception 'درجات النموذج تُصحَّح من نتائجه'; end if;
  if a.max_score is null then raise exception 'حدّد الدرجة العظمى أولًا'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'صيغة الرصد غير صحيحة'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_sid := (r ->> 'student_id')::bigint;
    if not exists (select 1 from public.students s where s.id = v_sid and s.class_id = a.class_id)
       and not exists (select 1 from public.grade_entries g where g.assessment_id = a.id and g.student_id = v_sid) then
      raise exception 'طالب ليس في فصل هذه المهمة';
    end if;
    if a.target_student_id is not null and v_sid <> a.target_student_id then
      raise exception 'هذا الرصد خاص بطالب واحد';
    end if;
    v_score := nullif(r ->> 'score', '')::numeric;
    if char_length(coalesce(r ->> 'note', '')) > 500 then raise exception 'الملاحظة أطول من 500 حرف'; end if;
    select * into v_old from public.grade_entries where assessment_id = a.id and student_id = v_sid;

    -- مسح درجة مرصودة: للمعلم خلال 6 ساعات من رصدها، وللإداري دائمًا
    if coalesce((r ->> 'clear')::boolean, false) then
      if v_old.id is not null then
        if not v_admin and v_old.recorded_at < now() - interval '6 hours' then
          raise exception 'لا يمكن مسح رصد مضى عليه أكثر من 6 ساعات. عدّل الدرجة بدلًا من ذلك';
        end if;
        delete from public.grade_entries where id = v_old.id;
      end if;
      update public.task_submissions set graded_at = null where assessment_id = a.id and student_id = v_sid and files_purged_at is null;
      v_n := v_n + 1;
      continue;
    end if;

    if v_score is not null then
      if v_score < 0 or v_score > a.max_score then raise exception 'الدرجة بين 0 و %', trim_scale(a.max_score); end if;
      if v_old.id is null then
        insert into public.grade_entries (assessment_id, student_id, score, max_score, source, recorded_by, note)
        values (a.id, v_sid, round(v_score, 2), a.max_score, 'manual', v_emp, nullif(btrim(coalesce(r ->> 'note', '')), ''));
      elsif v_old.score <> round(v_score, 2) then
        if not v_admin and v_old.recorded_at < now() - interval '3 days' then
          raise exception 'انتهت مهلة تعديل الرصد (3 أيام). اطلب التعديل من الإدارة';
        end if;
        update public.grade_entries set score = round(v_score, 2), max_score = a.max_score where id = v_old.id;
      end if;
    end if;
    -- الملاحظة على الرصد (تظهر للطالب مع درجته)
    if r ? 'note' and v_old.id is not null and v_old.note is distinct from nullif(btrim(coalesce(r ->> 'note', '')), '') then
      update public.grade_entries set note = nullif(btrim(coalesce(r ->> 'note', '')), '') where id = v_old.id;
    end if;
    update public.task_submissions
       set graded_at = case when v_score is not null or graded_at is not null then coalesce(graded_at, now()) end,
           graded_by = coalesce(v_emp, graded_by),
           feedback = case when r ? 'feedback' then nullif(btrim(coalesce(r ->> 'feedback', '')), '') else feedback end
     where assessment_id = a.id and student_id = v_sid;
    v_n := v_n + 1;
  end loop;
  update public.assessments set grades_recorded_at = coalesce(grades_recorded_at, now()) where id = a.id;
  return v_n;
end $$;

-- save_manual ← مفتاح daily_grading
create or replace function public.save_manual(p_id bigint, p jsonb, p_class_id integer, p_student_id bigint, p_rows jsonb)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare
  b      record;
  v_id   bigint;
  v_old  public.assessments;
  v_max  numeric(7,2) := nullif(p ->> 'max_score', '')::numeric;
  v_date timestamptz := coalesce(nullif(p ->> 'date', '')::timestamptz, now());
begin
  perform app.require_perm('daily_grading');
  select * into b from app.assessment_base(p);
  if v_max is null or v_max <= 0 or v_max > 1000 then raise exception 'حدّد الدرجة العظمى (أكبر من صفر)'; end if;
  if char_length(coalesce(p ->> 'description', '')) > 2000 then raise exception 'التفاصيل طويلة جدًا'; end if;

  if p_id is not null then
    perform app.assert_can_edit(p_id);
    select * into v_old from public.assessments where id = p_id and kind = 'manual';
    if v_old.id is null then raise exception 'الرصد غير موجود'; end if;
    perform app.assert_can_author(v_old.class_id, b.v_subject);
    if exists (select 1 from public.grade_entries where assessment_id = p_id and score > v_max) then
      raise exception 'توجد درجات مرصودة أعلى من الدرجة العظمى الجديدة';
    end if;
    update public.assessments
       set title = b.v_title, description = app.nz(p, 'description'), subject_id = b.v_subject, term_id = b.v_term,
           eval_type_id = b.v_eval, max_score = v_max, published_at = v_date
     where id = p_id;
    update public.grade_entries set max_score = v_max where assessment_id = p_id and max_score <> v_max;
    v_id := p_id;
  else
    if p_class_id is null then raise exception 'اختر الفصل'; end if;
    perform app.assert_can_author(p_class_id, b.v_subject);
    if p_student_id is not null and not exists (
         select 1 from public.students s where s.id = p_student_id and s.class_id = p_class_id and s.status = 'active') then
      raise exception 'الطالب ليس في هذا الفصل';
    end if;
    insert into public.assessments (kind, class_id, subject_id, term_id, eval_type_id, teacher_id, title, description,
                                    max_score, published_at, grades_recorded_at, target_student_id)
    values ('manual', p_class_id, b.v_subject, b.v_term, b.v_eval, b.v_teacher, b.v_title, app.nz(p, 'description'),
            v_max, v_date, now(), p_student_id)
    returning id into v_id;
  end if;

  if p_rows is not null and jsonb_array_length(p_rows) > 0 then
    perform public.grade_task(v_id, p_rows);
  end if;
  return v_id;
end $$;

-- save_improvement ← مفتاح daily_grading
create or replace function public.save_improvement(p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_student bigint := (p ->> 'student_id')::bigint;
  v_subject smallint := (p ->> 'subject_id')::smallint;
  v_term    smallint := (p ->> 'term_id')::smallint;
  v_type    smallint := (p ->> 'eval_type_id')::smallint;
  v_earned  numeric := (p ->> 'earned')::numeric;
  v_max     numeric := (p ->> 'max')::numeric;
  v_reason  text := left(btrim(regexp_replace(coalesce(p ->> 'reason', ''), '[[:cntrl:]]+', ' ', 'g')), 300);
  c record;
  v_id bigint;
begin
  perform app.require_perm('daily_grading');
  perform app.imp_context(v_student, v_subject);
  if not exists (select 1 from public.terms t where t.id = v_term) then raise exception 'اختر الفصل الدراسي'; end if;
  if not exists (select 1 from public.eval_types e where e.id = v_type and e.report_section <> 'final') then
    raise exception 'نوع التقييم غير مسموح بتحسينه (الاختبار النهائي مستثنى)';
  end if;
  if v_reason = '' then raise exception 'اكتب سبب التحسين'; end if;
  if v_max is null or v_max <= 0 then raise exception 'الدرجة العظمى للتحسين غير صحيحة'; end if;
  if v_earned is null or v_earned < 0 or v_earned > v_max then raise exception 'الدرجة المستحقة يجب أن تكون بين 0 والدرجة العظمى'; end if;

  perform pg_advisory_xact_lock(hashtext('mirqat:improve:' || v_student || ':' || v_subject || ':' || v_term));
  if (select count(*) from public.grade_improvements gi where gi.student_id = v_student and gi.subject_id = v_subject and gi.term_id = v_term) >= 2 then
    raise exception 'استُنفد الحد: تحسينان فقط لكل طالب في كل مادة وكل فصل دراسي';
  end if;
  select * into c from app.imp_current(v_student, v_subject, v_term, v_type, v_earned / v_max);
  if c.weight <= 0 then raise exception 'هذا النوع غير موجود في توزيع درجات المادة'; end if;
  if c.current_score / c.weight >= 0.99 then raise exception 'درجة الطالب في هذا النوع مرتفعة (99%% فأكثر) ولا تحتاج تحسينًا'; end if;
  if not (c.after_score > c.current_score) then
    raise exception 'هذا التحسين لن يضيف أي درجة للطالب، فلم يُحفظ (حتى لا يستهلك أحد التحسينين)';
  end if;

  insert into public.grade_improvements (student_id, subject_id, term_id, eval_type_id, earned, max_score, reason, before_score, after_score, recorded_by, created_by)
  values (v_student, v_subject, v_term, v_type, v_earned, v_max, v_reason, c.current_score, c.after_score,
          (select pr.employee_id from public.profiles pr where pr.id = auth.uid()), auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'before', c.current_score, 'after', c.after_score, 'weight', c.weight);
end $$;
