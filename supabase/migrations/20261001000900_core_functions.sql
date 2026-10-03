-- =====================================================================
-- مِرقاة — 09: الدوال الذرية الأساسية
-- كل دالة هنا معاملة واحدة: إما تكتمل كلها أو لا يُكتب شيء. لا تُحسب من حد دوال Vercel.
-- =====================================================================

-- ---------------------------------------------------------------------
-- حماية نموذج له إجابات: لا إضافة/حذف أسئلة، ولا تغيير الخيارات أو الصحيح أو الدرجة
-- (نفس assertQuestionsSafeForResponses_ — عدالة التصحيح لمن أجاب بالفعل)
-- تعديل نص السؤال أو صورته مسموح.
-- ---------------------------------------------------------------------
create or replace function app.form_has_real_attempts(p_assessment_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.form_attempts t
                  where t.assessment_id = p_assessment_id and not t.is_auto_absent)
$$;

create or replace function app.protect_answered_questions() returns trigger
language plpgsql as $$
declare v_assessment bigint := coalesce(new.assessment_id, old.assessment_id);
begin
  if app.is_migrating() then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and new.points = old.points and new.assessment_id = old.assessment_id then
    return new;
  end if;
  if app.form_has_real_attempts(v_assessment) then
    raise exception 'لا يمكن إضافة أو حذف أسئلة أو تغيير درجاتها بعد وجود إجابات مُسلَّمة. لتعديل درجة طالب معيّن عدّل رصده مباشرة.';
  end if;
  return coalesce(new, old);
end $$;
create trigger form_questions_protect before insert or delete or update on public.form_questions
  for each row execute function app.protect_answered_questions();

create or replace function app.protect_answered_options() returns trigger
language plpgsql as $$
declare v_assessment bigint;
begin
  if app.is_migrating() then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and new.body = old.body and new.is_correct = old.is_correct
     and new.question_id = old.question_id then
    return new;
  end if;
  select q.assessment_id into v_assessment from public.form_questions q
   where q.id = coalesce(new.question_id, old.question_id);
  if v_assessment is not null and app.form_has_real_attempts(v_assessment) then
    raise exception 'لا يمكن تغيير الخيارات أو الإجابة الصحيحة بعد وجود إجابات مُسلَّمة.';
  end if;
  return coalesce(new, old);
end $$;
create trigger question_options_protect before insert or delete or update on public.question_options
  for each row execute function app.protect_answered_options();

-- ---------------------------------------------------------------------
-- اسم المدرسة وشعارها — الدالة الوحيدة المتاحة قبل تسجيل الدخول
-- ---------------------------------------------------------------------
create or replace function public.get_public_settings() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb)
    from public.app_settings s where s.is_public
$$;
revoke all on function public.get_public_settings() from public;
grant execute on function public.get_public_settings() to anon, authenticated;

-- ---------------------------------------------------------------------
-- كاشف الحضور — مرة بالدقيقة كحد أقصى لكل حساب
-- ---------------------------------------------------------------------
create or replace function public.touch_presence() returns void
language sql security definer set search_path = '' as $$
  update public.profiles
     set last_seen_at = now()
   where id = auth.uid()
     and (last_seen_at is null or last_seen_at < now() - interval '1 minute')
$$;
revoke all on function public.touch_presence() from public, anon;
grant execute on function public.touch_presence() to authenticated;

-- ---------------------------------------------------------------------
-- فحوص مشتركة لفتح النموذج من الطالب
-- ---------------------------------------------------------------------
create or replace function app.assert_student_can_open_form(p_assessment_id bigint)
returns table (student_id bigint, max_attempts smallint, used_attempts integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_student bigint := app.my_student_id();
  v_class   integer := app.my_class_id();
  a         record;
  f         record;
  v_used    integer;
begin
  if v_student is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into a from public.assessments where id = p_assessment_id and kind = 'form';
  if not found then raise exception 'النموذج غير موجود'; end if;
  if a.class_id is distinct from v_class then raise exception 'FORBIDDEN: هذا النموذج ليس لصفك'; end if;

  select * into f from public.form_details where assessment_id = p_assessment_id;
  if not found or f.status <> 'published' then raise exception 'هذا النموذج غير متاح حاليًا'; end if;
  if f.opens_at is not null and now() < f.opens_at then raise exception 'لم يفتح هذا النموذج بعد'; end if;
  if f.closes_at is not null and now() >= f.closes_at then raise exception 'انتهت مهلة هذا النموذج'; end if;

  select count(*) into v_used from public.form_attempts t
   where t.assessment_id = p_assessment_id and t.student_id = v_student and not t.is_auto_absent;
  if v_used >= f.max_attempts then raise exception 'استنفدت عدد المحاولات المسموحة لهذا النموذج'; end if;

  return query select v_student, f.max_attempts, v_used;
end $$;

-- ---------------------------------------------------------------------
-- أسئلة النموذج للطالب — بلا الإجابة الصحيحة إطلاقًا، مع ساعة الخادم للعداد التنازلي
-- ---------------------------------------------------------------------
create or replace function public.get_form_for_student(p_assessment_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  chk     record;
  result  jsonb;
begin
  select * into chk from app.assert_student_can_open_form(p_assessment_id);

  select jsonb_build_object(
           'id', a.id,
           'title', a.title,
           'description', a.description,
           'intro_video_url', f.intro_video_url,
           'closes_at', f.closes_at,
           'server_now', now(),
           'max_attempts', chk.max_attempts,
           'used_attempts', chk.used_attempts,
           'questions', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', q.id, 'position', q.position, 'body', q.body, 'image_url', q.image_url,
                      'points', q.points, 'section_title', q.section_title,
                      'section_instructions', q.section_instructions,
                      'options', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'body', o.body)
                                                            order by o.position), '[]'::jsonb)
                                    from public.question_options o where o.question_id = q.id))
                    order by q.position)
               from public.form_questions q where q.assessment_id = a.id), '[]'::jsonb))
    into result
    from public.assessments a join public.form_details f on f.assessment_id = a.id
   where a.id = p_assessment_id;
  return result;
end $$;
revoke all on function public.get_form_for_student(bigint) from public, anon;
grant execute on function public.get_form_for_student(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- تسليم النموذج — معاملة واحدة: محاولة + إجابات + رصد. التجميع View فلا يحتاج تحديثًا.
-- p_answers = {"<question_id>": <option_id>, ...} — كل الأسئلة إجبارية
-- ---------------------------------------------------------------------
create or replace function public.submit_form_attempt(p_assessment_id bigint, p_answers jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  chk           record;
  v_attempt_id  bigint;
  v_attempt_no  smallint;
  v_score       numeric(7,2);
  v_max         numeric(7,2);
  v_missing     integer;
  v_extra       integer;
  v_bad_option  integer;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'صيغة الإجابات غير صحيحة';
  end if;

  -- قفل على (النموذج، الطالب) فقط: لا يتعطل باقي الفصل، ويمنع الضغط المزدوج من نفس الطالب
  perform pg_advisory_xact_lock(hashtextextended('submit:' || p_assessment_id || ':' || coalesce(app.my_student_id(), 0), 0));

  select * into chk from app.assert_student_can_open_form(p_assessment_id);

  -- كل سؤال له إجابة
  select count(*) into v_missing
    from public.form_questions q
   where q.assessment_id = p_assessment_id
     and not (p_answers ? q.id::text);
  if v_missing > 0 then
    raise exception 'يجب الإجابة على جميع الأسئلة — بقي % سؤال بلا إجابة', v_missing;
  end if;

  -- لا مفاتيح لأسئلة ليست من هذا النموذج
  select count(*) into v_extra
    from jsonb_object_keys(p_answers) k
   where not exists (select 1 from public.form_questions q
                      where q.assessment_id = p_assessment_id and q.id::text = k);
  if v_extra > 0 then raise exception 'إجابات لأسئلة ليست في هذا النموذج'; end if;

  -- كل إجابة خيار حقيقي من خيارات سؤالها
  select count(*) into v_bad_option
    from jsonb_each_text(p_answers) e
   where e.value !~ '^\d+$'
      or not exists (select 1 from public.question_options o
                      where o.id = e.value::bigint and o.question_id = e.key::bigint);
  if v_bad_option > 0 then raise exception 'إجابة غير صالحة: الخيار لا ينتمي للسؤال'; end if;

  -- أي صفر تلقائي سابق (لو أُعيد فتح النموذج) يُستبدل بالتسليم الحقيقي
  delete from public.form_attempts t
   where t.assessment_id = p_assessment_id and t.student_id = chk.student_id and t.is_auto_absent;

  select coalesce(sum(q.points), 0) into v_max from public.form_questions q where q.assessment_id = p_assessment_id;
  select coalesce(sum(q.points), 0) into v_score
    from jsonb_each_text(p_answers) e
    join public.form_questions q on q.id = e.key::bigint
    join public.question_options o on o.id = e.value::bigint and o.question_id = q.id
   where o.is_correct;

  v_attempt_no := chk.used_attempts + 1;
  insert into public.form_attempts (assessment_id, student_id, attempt_no, score, max_score, raw_answers)
  values (p_assessment_id, chk.student_id, v_attempt_no, v_score, v_max, p_answers)
  returning id into v_attempt_id;

  insert into public.attempt_answers (attempt_id, question_id, option_id)
  select v_attempt_id, e.key::bigint, e.value::bigint from jsonb_each_text(p_answers) e;

  -- الرصد: آخر محاولة هي المعتمدة (نفس السلوك الحالي)
  if v_max > 0 then
    insert into public.grade_entries (assessment_id, student_id, score, max_score, source, recorded_by)
    values (p_assessment_id, chk.student_id, v_score, v_max, 'form', null)
    on conflict (assessment_id, student_id) do update
       set score = excluded.score, max_score = excluded.max_score, source = 'form';
  end if;

  return jsonb_build_object('score', v_score, 'max_score', v_max, 'attempt_no', v_attempt_no);
end $$;
revoke all on function public.submit_form_attempt(bigint, jsonb) from public, anon;
grant execute on function public.submit_form_attempt(bigint, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- مراجعة الطالب لإجاباته بعد التسليم (آخر محاولة حقيقية)
-- ---------------------------------------------------------------------
create or replace function public.get_my_attempt_review(p_assessment_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_student  bigint := app.my_student_id();
  v_attempt  record;
begin
  if v_student is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_attempt from public.form_attempts t
   where t.assessment_id = p_assessment_id and t.student_id = v_student and not t.is_auto_absent
   order by t.attempt_no desc limit 1;
  if not found then raise exception 'لا توجد محاولة مُسلَّمة لهذا النموذج'; end if;

  return jsonb_build_object(
    'score', v_attempt.score, 'max_score', v_attempt.max_score, 'submitted_at', v_attempt.submitted_at,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q.id, 'body', q.body, 'image_url', q.image_url, 'points', q.points,
               'chosen_option_id', ans.option_id,
               'options', (select jsonb_agg(jsonb_build_object('id', o.id, 'body', o.body, 'is_correct', o.is_correct)
                                            order by o.position)
                             from public.question_options o where o.question_id = q.id))
             order by q.position)
        from public.form_questions q
        left join public.attempt_answers ans on ans.attempt_id = v_attempt.id and ans.question_id = q.id
       where q.assessment_id = p_assessment_id), '[]'::jsonb));
end $$;
revoke all on function public.get_my_attempt_review(bigint) from public, anon;
grant execute on function public.get_my_attempt_review(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- تسوية الغياب: كل طالب في الفصل لم يُجب على نموذج انتهى = صفر تلقائي
-- الطالب المسجَّل بعد فتح النموذج معفى. لا تطمس رصدًا موجودًا.
-- ---------------------------------------------------------------------
create or replace function app.settle_form_absences(p_assessment_id bigint) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  a        record;
  f        record;
  v_max    numeric(7,2);
  v_count  integer := 0;
begin
  select * into a from public.assessments where id = p_assessment_id and kind = 'form';
  select * into f from public.form_details where assessment_id = p_assessment_id for update;
  if a.id is null or f.assessment_id is null or f.absence_settled_at is not null then return 0; end if;
  if not (f.status = 'closed' or (f.status = 'published' and f.closes_at is not null and f.closes_at <= now())) then
    return 0;
  end if;

  select coalesce(sum(points), 0) into v_max from public.form_questions where assessment_id = p_assessment_id;

  if v_max > 0 then
    with absentees as (
      select s.id as student_id
        from public.students s
       where s.class_id = a.class_id and s.status = 'active'
         and (s.enrolled_at is null or f.opens_at is null or s.enrolled_at <= f.opens_at)
         and not exists (select 1 from public.form_attempts t
                          where t.assessment_id = p_assessment_id and t.student_id = s.id)
    ), ins as (
      insert into public.form_attempts (assessment_id, student_id, attempt_no, is_auto_absent, score, max_score, submitted_at)
      select p_assessment_id, x.student_id, 0, true, 0, v_max, coalesce(f.closes_at, now())
        from absentees x
      returning student_id
    ), grades as (
      insert into public.grade_entries (assessment_id, student_id, score, max_score, source)
      select p_assessment_id, i.student_id, 0, v_max, 'auto_absent' from ins i
      on conflict (assessment_id, student_id) do nothing
      returning 1
    )
    select count(*) into v_count from ins;
  end if;

  update public.form_details set absence_settled_at = now() where assessment_id = p_assessment_id;
  return v_count;
end $$;

-- تُستدعى دوريًا (pg_cron) — بلا سقف مصطنع: الاستعلام مفلتر بالفهرس على النماذج غير المسوّاة فقط
create or replace function public.settle_due_forms() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare r record; v_total integer := 0;
begin
  for r in select f.assessment_id from public.form_details f
            where f.absence_settled_at is null
              and (f.status = 'closed' or (f.status = 'published' and f.closes_at <= now()))
  loop
    v_total := v_total + app.settle_form_absences(r.assessment_id);
  end loop;
  return v_total;
end $$;
revoke all on function public.settle_due_forms() from public, anon, authenticated;
grant execute on function public.settle_due_forms() to service_role;

-- ---------------------------------------------------------------------
-- إعادة فتح نموذج بوقت إغلاق جديد — يحذف الأصفار التلقائية ويلغي علامة التسوية
-- ---------------------------------------------------------------------
create or replace function public.reopen_form(p_assessment_id bigint, p_closes_at timestamptz) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
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
end $$;
revoke all on function public.reopen_form(bigint, timestamptz) from public, anon;
grant execute on function public.reopen_form(bigint, timestamptz) to authenticated;
