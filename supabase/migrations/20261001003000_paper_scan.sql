-- =====================================================================
-- هجرة 30: تصحيح أوراق الإجابة الورقية (الفقاعات) بالكاميرا
--   القراءة تتم في متصفح المعلم (QR + الفقاعات)، ويراجعها قبل الحفظ.
--   الحفظ هنا: محاولة «ورقية» واحدة لكل طالب في النموذج، تُستبدل عند إعادة التصوير،
--   تُصحَّح أسئلة الاختيار تلقائيًا من الخيار المظلَّل، وتبقى الأسئلة المكتوبة «للتصحيح»
--   إلا إن أدخل المعلم درجتها — ثم تُرصد الدرجة كأي محاولة إلكترونية.
--   لا تُستبدل محاولة إلكترونية حقيقية بورقة (يُصفّرها المعلم أولًا إن أراد).
-- =====================================================================

alter table public.form_attempts
  add column source      text not null default 'online' check (source in ('online', 'paper')),
  add column scanned_by  bigint references public.employees(id) on delete set null;

/* حفظ ورقة طالب
   p_choices: {question_id: option_id | null}  — أسئلة الاختيار وصح/خطأ (null = فارغ أو أكثر من دائرة)
   p_points:  {question_id: درجة}              — الأسئلة المكتوبة (ما لم يُذكر يبقى للتصحيح)
   p_meta:    ما قرأه الماسح (الحروف والحالات) — يُحفظ كما هو للرجوع إليه */
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
revoke all on function public.save_paper_attempt(bigint, bigint, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_paper_attempt(bigint, bigint, jsonb, jsonb, jsonb) to authenticated;

/* حالة الطلاب في شاشة التصحيح: من صُحّحت ورقته، ومن حلّ إلكترونيًا، ومن بقي */
create or replace function public.paper_status(p_assessment_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.assert_can_edit(p_assessment_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'student_id', t.student_id, 'attempt_id', t.id, 'source', t.source,
             'score', t.score, 'max_score', t.max_score, 'pending_review', t.pending_review, 'at', t.submitted_at)
           order by t.submitted_at desc)
      from (select distinct on (student_id) * from public.form_attempts
             where assessment_id = p_assessment_id and not is_auto_absent
             order by student_id, attempt_no desc) t), '[]'::jsonb);
end $$;
revoke all on function public.paper_status(bigint) from public, anon;
grant execute on function public.paper_status(bigint) to authenticated;

/* إعادة التصحيح (بعد تعديل المفتاح أو الدرجات): الأسئلة المكتوبة في الورقة لا إجابة نصية لها — تبقى كما هي (للتصحيح أو بدرجة المعلم) */
create or replace function app.regrade_form(p_assessment_id bigint) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare r record; v_n integer := 0;
begin
  update public.attempt_answers aa
     set points = x.pts, status = x.st
    from (select a2.attempt_id, a2.question_id, s.pts, s.st
            from public.attempt_answers a2
            join public.form_attempts t on t.id = a2.attempt_id
            cross join lateral app.score_answer(a2.question_id, a2.option_id, a2.response) s
           where t.assessment_id = p_assessment_id and not t.is_auto_absent and a2.status <> 'manual'
             and not (t.source = 'paper' and a2.option_id is null)) x
   where aa.attempt_id = x.attempt_id and aa.question_id = x.question_id
     and (aa.points, aa.status) is distinct from (x.pts, x.st);

  -- المقالي المصحَّح يدويًا: لا تتجاوز درجته درجة السؤال الجديدة
  update public.attempt_answers aa
     set points = least(aa.points, q.points)
    from public.form_attempts t, public.form_questions q
   where t.id = aa.attempt_id and t.assessment_id = p_assessment_id and q.id = aa.question_id
     and aa.status = 'manual' and aa.points > q.points;

  for r in select id from public.form_attempts
            where assessment_id = p_assessment_id and not is_auto_absent
              and exists (select 1 from public.attempt_answers aa where aa.attempt_id = form_attempts.id)
  loop
    perform app.recompute_attempt(r.id);
    v_n := v_n + 1;
  end loop;

  -- الأصفار التلقائية تتبع الدرجة العظمى الجديدة
  update public.grade_entries g set max_score = m.max_score
    from public.form_max_scores m
   where g.assessment_id = p_assessment_id and m.assessment_id = p_assessment_id
     and g.source = 'auto_absent' and m.max_score > 0 and g.max_score <> m.max_score;
  return v_n;
end $$;
