-- =====================================================================
-- مِرقاة — 21: الرصد اليومي
--   - رصد يدوي (كشف كامل) ورصد لطالب واحد (مشاركة وغيرها) — تقييم من نوع manual
--   - ملاحظة المعلم على كل درجة، ومسح الدرجة خلال 6 ساعات
--   - النماذج: خيار السماح للطالب باستعراض الأسئلة بعد الحل (الاختبارات الشهرية/النهائية)
--   - قائمة "بانتظار الرصد" وسجلات الرصد
-- =====================================================================

alter table public.assessments
  add column target_student_id bigint references public.students(id) on delete cascade;
comment on column public.assessments.target_student_id is 'رصد خاص بطالب واحد (مشاركة، تميز…) — لا يظهر لبقية الفصل';
create index assessments_target_idx on public.assessments (target_student_id) where target_student_id is not null;

alter table public.grade_entries
  add column note text check (note is null or char_length(note) <= 500);

alter table public.form_details
  add column allow_review boolean not null default true;
comment on column public.form_details.allow_review is 'false = الطالب يرى درجته فقط دون استعراض الأسئلة والإجابات';

-- رصد طالب واحد لا يراه زملاؤه
create or replace function app.student_sees_assessment(p_assessment_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select a.class_id = app.my_class_id()
       and not a.is_draft
       and (a.target_student_id is null or a.target_student_id = app.my_student_id())
       and (a.kind <> 'task' or a.published_at is null or a.published_at <= now())
       and (a.kind <> 'form' or exists (
             select 1 from public.form_details f
              where f.assessment_id = a.id and f.status in ('published', 'closed')))
      from public.assessments a where a.id = p_assessment_id
  ), false)
$$;

create or replace function app.apply_form_details(p_assessment_id bigint, d jsonb, p_publish_check boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_status   text := coalesce(d ->> 'status', 'draft');
  v_opens    timestamptz := nullif(d ->> 'opens_at', '')::timestamptz;
  v_closes   timestamptz := nullif(d ->> 'closes_at', '')::timestamptz;
  v_old      public.form_details;
begin
  if v_status not in ('draft', 'published', 'closed') then raise exception 'حالة غير معروفة'; end if;
  if v_opens is not null and v_closes is not null and v_closes <= v_opens then
    raise exception 'وقت الإغلاق يجب أن يكون بعد وقت الفتح';
  end if;
  if v_status = 'published' and p_publish_check then
    if v_closes is null then raise exception 'حدّد وقت إغلاق النموذج قبل نشره'; end if;
    if not exists (select 1 from public.form_questions where assessment_id = p_assessment_id) then
      raise exception 'أضف سؤالًا واحدًا على الأقل قبل النشر';
    end if;
  end if;

  select * into v_old from public.form_details where assessment_id = p_assessment_id;
  insert into public.form_details (assessment_id, opens_at, closes_at, max_attempts, status, intro_video_url,
                                   shuffle_questions, shuffle_options, time_limit_minutes, show_results, track_focus, allow_review)
  values (p_assessment_id, v_opens, v_closes,
          greatest(1, least(20, coalesce((d ->> 'max_attempts')::int, 1))),
          v_status::public.form_status,
          case when (d ->> 'intro_video_url') ~* '^https://' then d ->> 'intro_video_url' end,
          coalesce((d ->> 'shuffle_questions')::boolean, false),
          coalesce((d ->> 'shuffle_options')::boolean, false),
          nullif(d ->> 'time_limit_minutes', '')::smallint,
          coalesce(d ->> 'show_results', 'after_submit'),
          coalesce((d ->> 'track_focus')::boolean, true),
          coalesce((d ->> 'allow_review')::boolean, true))
  on conflict (assessment_id) do update set
     opens_at = excluded.opens_at, closes_at = excluded.closes_at, max_attempts = excluded.max_attempts,
     status = excluded.status, intro_video_url = excluded.intro_video_url,
     shuffle_questions = excluded.shuffle_questions, shuffle_options = excluded.shuffle_options,
     time_limit_minutes = excluded.time_limit_minutes, show_results = excluded.show_results,
     track_focus = excluded.track_focus, allow_review = excluded.allow_review,
     -- تمديد وقت الإغلاق لنموذج مسوّى = إعادة فتح (تُحذف الأصفار التلقائية)
     absence_settled_at = case when excluded.status = 'published' and excluded.closes_at > now() then null
                               else public.form_details.absence_settled_at end;

  if v_old.absence_settled_at is not null and v_status = 'published' and v_closes > now() then
    delete from public.grade_entries where assessment_id = p_assessment_id and source = 'auto_absent';
    delete from public.form_attempts where assessment_id = p_assessment_id and is_auto_absent;
  end if;
end $$;

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

create or replace function public.submit_form_session(p_session_id bigint, p_patch jsonb default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  s          public.form_sessions;
  v_attempt  bigint;
  t          public.form_attempts;
  f          public.form_details;
begin
  select * into s from public.form_sessions where id = p_session_id;
  if s.id is null or s.student_id is distinct from app.my_student_id() then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('form:' || s.assessment_id || ':' || s.student_id, 0));
  select * into s from public.form_sessions where id = p_session_id;

  if s.submitted_at is null and p_patch is not null and p_patch <> '{}'::jsonb
     and (s.deadline_at is null or now() <= s.deadline_at + interval '2 minutes') then
    perform public.save_form_answers_internal(s.id, p_patch);
  end if;
  v_attempt := app.finalize_session(s.id);

  select * into t from public.form_attempts where id = v_attempt;
  select * into f from public.form_details where assessment_id = s.assessment_id;
  return jsonb_build_object(
    'attempt_no', t.attempt_no,
    'submitted_at', t.submitted_at,
    'show_score', f.show_results = 'after_submit',
    'score', case when f.show_results = 'after_submit' then t.score end,
    'max_score', case when f.show_results = 'after_submit' then t.max_score end,
    'pending_review', t.pending_review,
    'allow_review', f.allow_review);
end $$;

create or replace function public.get_form_review(p_assessment_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_student bigint := app.my_student_id();
  t         public.form_attempts;
  f         public.form_details;
  v_show    boolean;
begin
  if v_student is null then raise exception 'AUTH_REQUIRED'; end if;
  if not app.student_sees_assessment(p_assessment_id) then raise exception 'FORBIDDEN'; end if;
  select * into f from public.form_details where assessment_id = p_assessment_id;
  select * into t from public.form_attempts
   where assessment_id = p_assessment_id and student_id = v_student and not is_auto_absent
   order by attempt_no desc limit 1;
  if t.id is null then return jsonb_build_object('status', 'none'); end if;

  v_show := f.show_results = 'after_submit'
         or (f.show_results = 'after_close' and (f.status = 'closed' or (f.closes_at is not null and f.closes_at <= now())));
  if not v_show then
    return jsonb_build_object('status', 'hidden', 'submitted_at', t.submitted_at, 'attempt_no', t.attempt_no,
                              'show_results', f.show_results, 'closes_at', f.closes_at);
  end if;

  -- الاختبارات الشهرية والنهائية: الدرجة فقط بلا استعراض الأسئلة
  if not f.allow_review then
    return jsonb_build_object('status', 'score_only', 'score', t.score, 'max_score', t.max_score,
                              'pending_review', t.pending_review, 'submitted_at', t.submitted_at, 'attempt_no', t.attempt_no);
  end if;

  return jsonb_build_object(
    'status', 'shown',
    'score', t.score, 'max_score', t.max_score, 'pending_review', t.pending_review,
    'submitted_at', t.submitted_at, 'attempt_no', t.attempt_no,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q.id, 'qtype', q.qtype, 'body', q.body, 'image_url', q.image_url, 'points', q.points,
               'explanation', q.explanation,
               'earned', coalesce(aa.points, 0), 'status', coalesce(aa.status, 'auto'), 'feedback', aa.feedback,
               'chosen_option_id', aa.option_id, 'response', aa.response,
               'accepted', case when q.qtype = 'short' then q.config -> 'answers' when q.qtype = 'fill' then q.config -> 'blanks' end,
               'pairs', case when q.qtype = 'match' then q.config -> 'pairs' end,
               'options', case when q.qtype in ('mcq', 'tf') then (
                 select jsonb_agg(jsonb_build_object('id', o.id, 'body', o.body, 'is_correct', o.is_correct) order by o.position)
                   from public.question_options o where o.question_id = q.id) end)
             order by q.position)
        from public.form_questions q
        left join public.attempt_answers aa on aa.attempt_id = t.id and aa.question_id = q.id
       where q.assessment_id = p_assessment_id), '[]'::jsonb));
end $$;

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

create or replace function public.staff_assessments(p jsonb) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_page   integer := greatest(1, coalesce((p ->> 'page')::int, 1));
  v_size   integer := least(50, greatest(5, coalesce((p ->> 'size')::int, 15)));
  v_kind   text := nullif(p ->> 'kind', '');
  v_class  integer := nullif(p ->> 'class_id', '')::int;
  v_subj   smallint := nullif(p ->> 'subject_id', '')::smallint;
  v_status text := nullif(p ->> 'status', '');
  v_q      text := nullif(btrim(p ->> 'q'), '');
  v_mine   boolean := coalesce((p ->> 'mine')::boolean, false);
  v_sort   text := coalesce(p ->> 'sort', 'newest');
  v_me     bigint := app.my_employee_id();
  v_manual boolean := coalesce((p ->> 'include_manual')::boolean, false);
  v_rec    boolean := coalesce((p ->> 'recorded')::boolean, false);
  result   jsonb;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  with base as (
    select a.id, a.kind, a.title, a.class_id, a.subject_id, a.teacher_id, a.created_at, a.is_draft,
           a.max_score, a.published_at, a.due_at, a.submission_mode, a.grades_recorded_at, a.target_student_id,
           a.description, s.name_ar as target_student,
           f.status as form_status, f.opens_at, f.closes_at, f.time_limit_minutes,
           case
             when a.kind = 'form' then
               case when f.status = 'draft' then 'draft'
                    when f.status = 'closed' or (f.closes_at is not null and f.closes_at <= now()) then 'closed'
                    when f.opens_at is not null and f.opens_at > now() then 'scheduled'
                    else 'open' end
             when a.kind = 'manual' then 'closed'
             else
               case when a.is_draft then 'draft'
                    when a.published_at is not null and a.published_at > now() then 'scheduled'
                    when a.due_at is not null and a.due_at <= now() then 'closed'
                    else 'open' end
           end as status
      from public.assessments a
      left join public.form_details f on f.assessment_id = a.id
      left join public.students s on s.id = a.target_student_id
     where (a.kind in ('task', 'form') or (v_manual and a.kind = 'manual'))
       and (v_kind is null or a.kind::text = v_kind)
       and (v_class is null or a.class_id = v_class)
       and (v_subj is null or a.subject_id = v_subj)
       and (not v_mine or a.teacher_id = v_me)
       and (v_q is null or a.title ilike '%' || replace(replace(v_q, '%', ''), '_', '') || '%')
  ), counted as (
    select b.*,
           case when b.target_student_id is not null then 1
                else (select count(*) from public.students s where s.class_id = b.class_id and s.status = 'active') end as class_size,
           (select round(avg(g.score / nullif(g.max_score, 0)) * 100) from public.grade_entries g where g.assessment_id = b.id) as avg_pct,
           case when b.kind = 'form'
                then (select count(distinct t.student_id) from public.form_attempts t where t.assessment_id = b.id and not t.is_auto_absent)
                else (select count(*) from public.task_submissions s where s.assessment_id = b.id) end as submitted,
           (select count(*) from public.grade_entries g where g.assessment_id = b.id) as graded,
           case when b.kind = 'form'
                then (select count(*) from public.form_attempts t where t.assessment_id = b.id and t.pending_review > 0)
                else (select count(*) from public.task_submissions s where s.assessment_id = b.id and s.graded_at is null) end as to_grade,
           (select count(*) from public.form_questions q where q.assessment_id = b.id) as questions
      from base b
  ), filtered as (
    select * from counted c
     where (not v_rec or c.graded > 0) and (v_status is null
        or (v_status = 'needs_grading' and c.to_grade > 0)
        -- بانتظار الرصد: مهمة منشورة لم يكتمل رصدها، أو نموذج فيه إجابات تنتظر التصحيح
        or (v_status = 'to_record' and c.status <> 'draft'
            and ((c.kind = 'task' and (c.to_grade > 0 or c.graded < c.class_size)) or (c.kind = 'form' and c.to_grade > 0)))
        or c.status = v_status)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.ord)
        from (
          select f.*, row_number() over (order by
                   case when v_sort = 'due' then coalesce(f.due_at, f.closes_at) end asc nulls last,
                   case when v_sort = 'title' then f.title end asc,
                   case when v_sort = 'recorded' then f.grades_recorded_at end desc nulls last,
                   f.created_at desc, f.id desc) as ord
            from filtered f
           order by ord
           offset (v_page - 1) * v_size limit v_size
        ) x), '[]'::jsonb))
    into result;
  return result;
end $$;

-- ---------------------------------------------------------------------
-- الرصد اليدوي: إنشاء التقييم والكشف في معاملة واحدة
--   p_student_id: رصد لطالب واحد (مشاركة…) بدل الفصل كله
-- ---------------------------------------------------------------------
create or replace function public.save_manual(p_id bigint, p jsonb, p_class_id integer, p_student_id bigint, p_rows jsonb)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare
  b      record;
  v_id   bigint;
  v_old  public.assessments;
  v_max  numeric(7,2) := nullif(p ->> 'max_score', '')::numeric;
  v_date timestamptz := coalesce(nullif(p ->> 'date', '')::timestamptz, now());
begin
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

-- حذف رصد يدوي كامل: الإداري دائمًا، والمعلم خلال 6 ساعات من آخر رصد فيه
create or replace function public.delete_manual(p_id bigint) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.assert_can_edit(p_id);
  if not exists (select 1 from public.assessments where id = p_id and kind = 'manual') then
    raise exception 'الرصد غير موجود';
  end if;
  if not app.is_admin() and exists (select 1 from public.grade_entries where assessment_id = p_id and recorded_at < now() - interval '6 hours') then
    raise exception 'مضى على هذا الرصد أكثر من 6 ساعات — اطلب حذفه من الإدارة، أو عدّل درجاته';
  end if;
  delete from public.grade_entries where assessment_id = p_id;
  delete from public.assessments where id = p_id;
end $$;

-- آخر رصد فردي للمعلم (لشاشة "رصد لطالب")
create or replace function public.my_recent_single(p_limit integer default 12) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x.recorded_at desc), '[]'::jsonb) from (
    select a.id, a.title, s.name_ar as student, s.code, sub.name as subject, g.score, g.max_score, g.note, g.recorded_at,
           g.recorded_at > now() - interval '6 hours' as can_undo
      from public.assessments a
      join public.students s on s.id = a.target_student_id
      join public.grade_entries g on g.assessment_id = a.id and g.student_id = a.target_student_id
      left join public.subjects sub on sub.id = a.subject_id
     where a.kind = 'manual' and a.target_student_id is not null
       and a.teacher_id = app.my_employee_id()
     order by g.recorded_at desc
     limit greatest(1, least(p_limit, 50))
  ) x
$$;

-- قوائم المعلم للموظفين فقط (كانت تعيد للطالب ما يراه أصلًا، والآن تُرفض صراحةً)
create or replace function public.staff_assessment_stats() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare r jsonb;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select jsonb_build_object(
    'tasks', count(*) filter (where a.kind = 'task'),
    'forms', count(*) filter (where a.kind = 'form'),
    'open', count(*) filter (where (a.kind = 'task' and not a.is_draft and (a.published_at is null or a.published_at <= now()) and (a.due_at is null or a.due_at > now()))
                              or (a.kind = 'form' and f.status = 'published' and (f.opens_at is null or f.opens_at <= now()) and (f.closes_at is null or f.closes_at > now()))),
    'drafts', count(*) filter (where (a.kind = 'task' and a.is_draft) or (a.kind = 'form' and f.status = 'draft')),
    'closing_soon', count(*) filter (where (a.kind = 'task' and not a.is_draft and a.due_at between now() and now() + interval '24 hours')
                                      or (a.kind = 'form' and f.status = 'published' and f.closes_at between now() and now() + interval '24 hours')),
    'to_grade', (select count(*) from public.task_submissions s where s.graded_at is null)
              + (select count(*) from public.form_attempts t where t.pending_review > 0))
    into r
    from public.assessments a left join public.form_details f on f.assessment_id = a.id
   where a.kind in ('task', 'form');
  return r;
end $$;

revoke all on function public.save_manual(bigint, jsonb, integer, bigint, jsonb), public.delete_manual(bigint), public.my_recent_single(integer) from public, anon;
grant execute on function public.save_manual(bigint, jsonb, integer, bigint, jsonb), public.delete_manual(bigint), public.my_recent_single(integer) to authenticated;

do $$ begin raise notice '✅ هجرة 21: الرصد اليومي (يدوي + طالب واحد + ملاحظات) واستعراض الأسئلة'; end $$;
