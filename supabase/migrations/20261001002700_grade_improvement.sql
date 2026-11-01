-- =====================================================================
-- هجرة 27 — تحسين درجة الطالب (تبويب «تحسين» في الرصد اليومي)
-- نفس قواعد موقع Apps Script (ImprovementCore.js) حرفيًا:
--   • الدرجات الأصلية لا تتغير أبدًا؛ التحسين سجل مستقل بسببه ومن رصده ومتى
--   • على أنواع التقييم غير النهائية فقط (أعمال الترم والاختبارات القصيرة/الشهرية/التحريرية)
--   • تُطبَّق على درجة النوع الموزونة بالترتيب الزمني:
--       < 50% من الوزن  : تُضاف (نسبة التحسين × الوزن) حتى 50% من الوزن كحد أعلى
--       50% إلى < 99%    : تُضاف (نسبة التحسين × 20% × الوزن)
--       99% فأكثر        : لا شيء — والناتج لا يتجاوز الوزن أبدًا
--   • تحسينان فقط لكل طالب في كل مادة وكل فصل دراسي (يُعتمد الأقدم)
--   • الحذف: الإدارة دائمًا، والمعلم لما رصده خلال 6 ساعات
-- =====================================================================

create table public.grade_improvements (
  id            bigint generated always as identity primary key,
  student_id    bigint not null references public.students(id) on delete cascade,
  subject_id    smallint not null references public.subjects(id),
  term_id       smallint not null references public.terms(id),
  eval_type_id  smallint not null references public.eval_types(id),
  earned        numeric(7,2) not null check (earned >= 0),
  max_score     numeric(7,2) not null check (max_score > 0),
  reason        text not null check (length(btrim(reason)) between 1 and 300),
  before_score  numeric(7,2),
  after_score   numeric(7,2),
  recorded_by   bigint references public.employees(id) on delete set null,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  constraint grade_improvements_score_chk check (earned <= max_score)
);
create index grade_improvements_lookup_idx on public.grade_improvements (student_id, subject_id, term_id);
create index grade_improvements_recent_idx on public.grade_improvements (created_at desc);
alter table public.grade_improvements enable row level security;
-- القراءة والكتابة عبر الدوال أدناه فقط
revoke all on public.grade_improvements from anon, authenticated;
create trigger grade_improvements_audit after insert or delete on public.grade_improvements
  for each row execute function app.audit_row();
comment on table public.grade_improvements is 'تحسين درجة الطالب في نوع تقييم — لا يغيّر الرصد الأصلي، ويطبقه محرك النتائج';

-- ---------------------------------------------------------------------
-- القاعدة (مطابقة impRun_)
-- ---------------------------------------------------------------------
create or replace function app.apply_improvements(p_base numeric, p_weight numeric, p_ratios numeric[])
returns numeric
language plpgsql immutable set search_path = '' as $$
declare
  cur numeric := coalesce(p_base, 0);
  w   numeric := coalesce(p_weight, 0);
  r   numeric;
  pct numeric;
  add numeric;
begin
  if w <= 0 or p_ratios is null or cardinality(p_ratios) = 0 then return p_base; end if;
  foreach r in array p_ratios loop
    pct := cur / w;
    add := 0;
    if pct < 0.5 then add := least(r * w, 0.5 * w - cur);
    elsif pct < 0.99 then add := r * 0.2 * w;
    end if;
    add := greatest(0, least(add, w - cur));
    cur := round(cur + add, 4);
  end loop;
  return round(cur, 2);
end $$;

-- ---------------------------------------------------------------------
-- محرك النتائج: نفس هجرة 25 مع تطبيق التحسينات على درجة كل نوع
-- ---------------------------------------------------------------------
create or replace function app.build_report(p_student_ids bigint[], p_term_id smallint, p_student_view boolean)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  with st as (
    select s.id, s.code, s.name_ar, s.name_en, s.national_id, s.nationality, s.birth_date, s.birth_date_text,
           s.gender, s.fee_status, s.status::text as status, s.enrolled_at, s.class_id,
           c.branch_id, c.grade_id, c.section_id, g.stage_id,
           b.name as branch, coalesce(b.is_intisab, false) as is_intisab, sg.name as stage, g.name as grade, sec.name as section
      from public.students s
      left join public.classes c on c.id = s.class_id
      left join public.branches b on b.id = c.branch_id
      left join public.grades g on g.id = c.grade_id
      left join public.stages sg on sg.id = g.stage_id
      left join public.sections sec on sec.id = c.section_id
     where s.id = any(p_student_ids)),
  ev0 as (   -- لكل طالب ومادة ونوع تقييم: المرصود
    select ge.student_id, a.subject_id, a.eval_type_id, sum(ge.score) as earned, sum(ge.max_score) as mx, count(*) as n
      from public.grade_entries ge join public.assessments a on a.id = ge.assessment_id
     where ge.student_id = any(p_student_ids) and a.term_id = p_term_id
     group by 1, 2, 3),
  imp_all as (   -- تحسينات الفصل الدراسي: أقدم اثنين فقط لكل طالب ومادة
    select gi.*, row_number() over (partition by gi.student_id, gi.subject_id order by gi.created_at, gi.id) as rn
      from public.grade_improvements gi
     where gi.student_id = any(p_student_ids) and gi.term_id = p_term_id),
  imp as (
    select student_id, subject_id, eval_type_id,
           array_agg(least(1, greatest(0, earned / max_score)) order by created_at, id) as ratios
      from imp_all where rn <= 2 group by 1, 2, 3),
  ev as (   -- المرصود + التحسينات (نوع بتحسين ولا رصد له يُعامل كصفر ثم يُحسَّن)
    select coalesce(e.student_id, i.student_id) as student_id, coalesce(e.subject_id, i.subject_id) as subject_id,
           coalesce(e.eval_type_id, i.eval_type_id) as eval_type_id,
           coalesce(e.earned, 0) as earned, coalesce(e.mx, 0) as mx, coalesce(e.n, 0) as n, i.ratios
      from ev0 e
      full join imp i on i.student_id = e.student_id and i.subject_id = e.subject_id and i.eval_type_id = e.eval_type_id),
  pairs as (   -- مواد الطالب: موزعة على فصله + أي مادة رُصدت له في هذا الفصل الدراسي
    select st.id as student_id, m.subject_id
      from st join public.subject_matrix m
        on m.branch_id = st.branch_id and m.grade_id = st.grade_id and (m.section_id is null or m.section_id = st.section_id)
    union
    select student_id, subject_id from ev),
  vis as (
    select p.student_id, p.subject_id, coalesce(v.is_visible, true) as visible
      from pairs p left join public.grade_visibility v
        on v.student_id = p.student_id and v.subject_id = p.subject_id and v.term_id = p_term_id),
  wsec as (   -- عظمى كل قسم لكل مادة = مجموع نسب أنواعه
    select w.subject_id,
           coalesce(sum(w.weight) filter (where e.report_section = 'term_work'), 0) as tw_max,
           coalesce(sum(w.weight) filter (where e.report_section = 'quizzes'), 0) as qz_max,
           coalesce(sum(w.weight) filter (where e.report_section = 'final'), 0) as fn_max,
           sum(w.weight) as max_total
      from public.grade_weights w join public.eval_types e on e.id = w.eval_type_id
     where w.weight > 0
     group by w.subject_id),
  evw as (
    select ev.*, coalesce(w.weight, 0) as weight, e.report_section,
           case when ev.ratios is not null
                then app.apply_improvements(case when ev.mx > 0 then round(ev.earned / ev.mx * coalesce(w.weight, 0), 2) else 0 end,
                                            coalesce(w.weight, 0), ev.ratios)
                when ev.mx > 0 then round(ev.earned / ev.mx * coalesce(w.weight, 0), 2) else 0 end as weighted
      from ev
      left join public.grade_weights w on w.subject_id = ev.subject_id and w.eval_type_id = ev.eval_type_id
      left join public.eval_types e on e.id = ev.eval_type_id),
  esec as (
    select student_id, subject_id,
           sum(weighted) filter (where report_section = 'term_work') as tw,
           sum(weighted) filter (where report_section = 'quizzes') as qz,
           sum(weighted) filter (where report_section = 'final') as fn,
           sum(weighted) as total,
           sum(weight) as rec_max,
           sum(n) as entries,
           jsonb_object_agg(coalesce(eval_type_id, 0)::text, weighted) as evals
      from evw group by 1, 2),
  subj_rows as (
    select vis.student_id, vis.subject_id, vis.visible, sj.sort_order, sj.name,
           ws.tw_max, ws.qz_max, ws.fn_max, ws.max_total,
           es.tw, es.qz, es.fn, es.total, es.entries, es.evals, es.rec_max,
           case when es.total is not null and ws.max_total > 0 then round(es.total / ws.max_total * 100, 2) end as pct,
           case when es.total is not null and es.rec_max > 0 then round(es.total / es.rec_max * 100, 2) end as progress
      from vis
      join public.subjects sj on sj.id = vis.subject_id
      left join wsec ws on ws.subject_id = vis.subject_id
      left join esec es on es.student_id = vis.student_id and es.subject_id = vis.subject_id
     where not p_student_view or vis.visible),
  per_student as (
    select student_id,
           jsonb_agg(jsonb_build_object(
             'subject_id', subject_id, 'visible', visible,
             'term_work', tw, 'quizzes', qz, 'final', fn, 'total', total, 'max', max_total,
             'pct', pct, 'rating_ar', app.rating_ar(pct), 'rating_en', app.rating_en(pct),
             'recorded_max', rec_max, 'progress', progress,
             'entries', coalesce(entries, 0), 'evals', coalesce(evals, '{}'::jsonb))
             order by sort_order, name) as subjects,
           sum(total) filter (where total is not null) as total,
           sum(max_total) filter (where total is not null) as max_total,
           round(avg(pct), 2) as average,
           round(avg(progress), 2) as progress,
           sum(rec_max) filter (where total is not null) as recorded_max,
           count(*) filter (where total is not null) as graded
      from subj_rows group by student_id),
  att as (
    select a.student_id, count(*) as total,
           count(*) filter (where app.att_kind(s.name) = 'absent') as absent,
           count(*) filter (where app.att_kind(s.name) = 'late') as late,
           count(*) filter (where app.att_kind(s.name) = 'excused') as excused
      from public.attendance_records a
      join public.calendar_entries w on w.id = a.week_id and w.term_id = p_term_id
      join public.attendance_statuses s on s.id = a.status_id
     where a.student_id = any(p_student_ids)
     group by a.student_id),
  grant_row as (
    select distinct on (student_id) student_id, score
      from public.attendance_grants
     where student_id = any(p_student_ids) and (term_id = p_term_id or term_id is null)
     order by student_id, term_id nulls last),
  beh as (
    select b.student_id,
           greatest(0, 100 - coalesce(sum(b.score) filter (where app.beh_kind(s.name) = 'negative'), 0)) as score,
           count(*) filter (where app.beh_kind(s.name) = 'negative') as negative,
           count(*) filter (where app.beh_kind(s.name) = 'positive') as positive
      from public.behavior_records b join public.behavior_statuses s on s.id = b.status_id
     where b.student_id = any(p_student_ids) and b.term_id = p_term_id
     group by b.student_id),
  full_rows as (
    select st.*, ps.subjects, ps.total, ps.max_total, ps.average, ps.graded, ps.progress, ps.recorded_max,
           case when gr.student_id is not null then gr.score
                when st.is_intisab then null
                when att.total > 0 then greatest(0, round(100 * (att.total - att.absent - 0.25 * att.late) / att.total)) end as att_pct,
           gr.student_id is not null as granted, att.total as att_total, att.absent, att.late, att.excused,
           coalesce(beh.score, 100) as beh_score, coalesce(beh.negative, 0) as beh_negative, coalesce(beh.positive, 0) as beh_positive
      from st
      left join per_student ps on ps.student_id = st.id
      left join att on att.student_id = st.id
      left join grant_row gr on gr.student_id = st.id
      left join beh on beh.student_id = st.id),
  ranked as (
    select f.*, case when f.average is not null then rank() over (order by f.average desc nulls last) end as rnk
      from full_rows f)
  select jsonb_build_object(
    'term', (select jsonb_build_object('id', t.id, 'name', t.name, 'year', y.name)
               from public.terms t join public.academic_years y on y.id = t.academic_year_id where t.id = p_term_id),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', sj.id, 'name', sj.name, 'name_en', sj.name_en,
               'term_work', coalesce(ws.tw_max, 0), 'quizzes', coalesce(ws.qz_max, 0), 'final', coalesce(ws.fn_max, 0),
               'max', coalesce(ws.max_total, 0),
               'evals', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'name_en', e.name_en,
                                                                       'section', e.report_section, 'weight', w.weight)
                                                    order by e.sort_order, e.id)
                                    from public.grade_weights w join public.eval_types e on e.id = w.eval_type_id
                                   where w.subject_id = sj.id and w.weight > 0), '[]'::jsonb))
               order by sj.sort_order, sj.name)
        from public.subjects sj left join wsec ws on ws.subject_id = sj.id
       where sj.id in (select subject_id from subj_rows)), '[]'::jsonb),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'code', x.code, 'name_ar', x.name_ar, 'name_en', x.name_en,
               'national_id', x.national_id, 'nationality', x.nationality,
               'birth_date', coalesce(x.birth_date::text, x.birth_date_text), 'gender', x.gender,
               'fee_status', x.fee_status, 'status', x.status, 'enrolled_at', x.enrolled_at,
               'class_id', x.class_id, 'branch', x.branch, 'stage', x.stage, 'grade', x.grade, 'section', x.section,
               'is_intisab', x.is_intisab,
               'subjects', coalesce(x.subjects, '[]'::jsonb),
               'total', x.total, 'max_total', x.max_total, 'average', x.average, 'graded', coalesce(x.graded, 0),
               'rating_ar', app.rating_ar(x.average), 'rating_en', app.rating_en(x.average),
               'progress', x.progress, 'recorded_max', x.recorded_max,
               'rank', case when p_student_view then null else x.rnk end,
               'attendance', jsonb_build_object(
                  'pct', x.att_pct, 'intisab', x.is_intisab, 'granted', x.granted,
                  'total', coalesce(x.att_total, 0), 'absent', coalesce(x.absent, 0), 'late', coalesce(x.late, 0),
                  'excused', coalesce(x.excused, 0),
                  'rating_ar', app.rating_ar(x.att_pct), 'rating_en', app.rating_en(x.att_pct)),
               'behavior', jsonb_build_object(
                  'score', x.beh_score, 'negative', x.beh_negative, 'positive', x.beh_positive,
                  'rating_ar', app.rating_ar(x.beh_score), 'rating_en', app.rating_en(x.beh_score)))
               order by x.name_ar)
        from ranked x), '[]'::jsonb))
    into r;
  return r;
end $$;
revoke all on function app.build_report(bigint[], smallint, boolean) from public, anon, authenticated;



-- التصفير: نفس هجرة 26 مع حذف التحسينات مع المهام والرصد
create or replace function public.admin_reset_data(p_branch smallint, p_parts text[], p_confirm text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  sc        record;
  v_me      uuid := auth.uid();
  v_users   uuid[] := '{}';
  v_task    text[] := '{}';   -- task-files (عام)
  v_sub     text[] := '{}';   -- submissions (خاص)
  v_counts  jsonb := '{}'::jsonb;
  v_n       int;
  v_backup  timestamptz;
  v_ass     bigint[];
  v_stu     bigint[];
begin
  perform app.require_admin();
  if p_confirm is distinct from 'تصفير' then raise exception 'اكتب كلمة التأكيد كما هي'; end if;
  if coalesce(cardinality(p_parts), 0) = 0 then raise exception 'اختر ما يُصفَّر'; end if;
  if p_branch is not null and (p_parts && array['employees', 'audit']) then
    raise exception 'الموظفون وسجل العمليات يُصفَّران لكل الفروع فقط';
  end if;
  -- لا تصفير بلا نسخة احتياطية حديثة (آخر 24 ساعة) لنفس النطاق أو لكل الفروع
  select (s.value ->> 'at')::timestamptz into v_backup from public.app_settings s
   where s.key = 'last_backup' and ((s.value ->> 'branch') is null or (s.value ->> 'branch')::smallint is not distinct from p_branch);
  if v_backup is null or v_backup < now() - interval '24 hours' then
    raise exception 'نزّل نسخة احتياطية لهذا النطاق أولًا (خلال آخر 24 ساعة)';
  end if;

  perform set_config('app.migrating', 'on', true);   -- بلا سجل عمليات لكل صف ولا حمايات التعديل أثناء التصفير
  select * into sc from app.reset_scope(p_branch);
  v_ass := case when 'assessments' = any(p_parts) or 'students' = any(p_parts) then sc.assessment_ids else '{}' end;
  v_stu := case when 'students' = any(p_parts) then sc.student_ids else '{}' end;

  -- الملفات التي ستُحذف من التخزين
  if 'assessments' = any(p_parts) then
    v_task := v_task || coalesce((select array_agg(x.storage_path) from public.assessment_attachments x where x.assessment_id = any(v_ass) and x.storage_path is not null), '{}')
                     || coalesce((select array_agg(substr(q.image_url, 9)) from public.form_questions q where q.assessment_id = any(v_ass) and q.image_url like 'storage:%'), '{}');
  end if;
  v_sub := coalesce((select array_agg(f.storage_path) from public.submission_files f join public.task_submissions t on t.id = f.submission_id
                      where (t.assessment_id = any(v_ass) and 'assessments' = any(p_parts)) or t.student_id = any(v_stu)), '{}')
        || coalesce((select array_agg(pu.storage_path) from public.pending_uploads pu
                      where (pu.assessment_id = any(v_ass) and 'assessments' = any(p_parts)) or pu.student_id = any(v_stu)), '{}');

  -- التحضير والسلوك (سجلات الطلاب المحذوفين تُحذف معهم دائمًا)
  if 'conduct' = any(p_parts) then
    delete from public.attendance_records ar where ar.class_id = any(sc.class_ids) or ar.student_id = any(sc.student_ids);
    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('attendance', v_n);
    delete from public.behavior_records br where br.student_id = any(sc.student_ids);
    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('behavior', v_n);
  elsif 'students' = any(p_parts) then
    delete from public.attendance_records ar where ar.student_id = any(v_stu);
    delete from public.behavior_records br where br.student_id = any(v_stu);
  end if;

  -- المهام والنماذج والرصد (للطلاب المحذوفين تُحذف درجاتهم ومحاولاتهم وتسليماتهم أيضًا)
  delete from public.grade_entries ge where ('assessments' = any(p_parts) and ge.assessment_id = any(v_ass)) or ge.student_id = any(v_stu);
  -- التحسينات جزء من الرصد: تُحذف مع المهام والرصد لطلاب النطاق (ومع الطلاب تلقائيًا)
  if 'assessments' = any(p_parts) then
    delete from public.grade_improvements gi where gi.student_id = any(sc.student_ids);
  end if;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('grades', v_n);
  delete from public.form_attempts fa where ('assessments' = any(p_parts) and fa.assessment_id = any(v_ass)) or fa.student_id = any(v_stu);
  delete from public.task_submissions ts where ('assessments' = any(p_parts) and ts.assessment_id = any(v_ass)) or ts.student_id = any(v_stu);
  if 'assessments' = any(p_parts) then
    delete from public.attempt_answers aa using public.form_questions q where aa.question_id = q.id and q.assessment_id = any(v_ass);
    delete from public.assessments a where a.id = any(v_ass);
    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('assessments', v_n);
  end if;

  -- المحتوى
  if 'content' = any(p_parts) then
    v_task := v_task || coalesce((select array_agg(att ->> 'storage_path') from public.content_items ci, jsonb_array_elements(coalesce(ci.attachments, '[]')) att
                                   where ci.class_id = any(sc.class_ids) and att ->> 'storage_path' is not null), '{}');
    delete from public.content_items ci where ci.class_id = any(sc.class_ids);
    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('content', v_n);
  end if;

  -- الطلاب وحساباتهم
  if 'students' = any(p_parts) then
    select coalesce(array_agg(p.id), '{}') into v_users from public.profiles p where p.student_id = any(v_stu);
    delete from public.profiles p where p.student_id = any(v_stu);
    delete from public.students s where s.id = any(v_stu);
    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('students', v_n);
  end if;

  -- الموظفون (عدا الإدارة وحسابك)
  if 'employees' = any(p_parts) then
    v_users := v_users || coalesce((select array_agg(p.id) from public.profiles p join public.employees e on e.id = p.employee_id
                                    where e.user_type <> 'admin' and p.id <> v_me), '{}');
    delete from public.profiles p using public.employees e where e.id = p.employee_id and e.user_type <> 'admin' and p.id <> v_me;
    create temp table _gone on commit drop as
      select e.id from public.employees e where e.user_type <> 'admin' and not exists (select 1 from public.profiles p where p.employee_id = e.id);
    -- ما يبقى من سجلات تشير إليهم (الجداول، التقييمات الباقية…) يُفصل عنهم بدل أن يمنع الحذف
    update public.timetable_slots x set teacher_id = null where x.teacher_id in (select id from pg_temp._gone);
    update public.exam_schedule x set teacher_id = null where x.teacher_id in (select id from pg_temp._gone);
    update public.assessments x set teacher_id = null where x.teacher_id in (select id from pg_temp._gone);
    update public.grade_entries x set recorded_by = null where x.recorded_by in (select id from pg_temp._gone);
    update public.content_items x set teacher_id = null where x.teacher_id in (select id from pg_temp._gone);
    update public.period_links x set linked_by = null where x.linked_by in (select id from pg_temp._gone);
    update public.attendance_records x set recorded_by = null where x.recorded_by in (select id from pg_temp._gone);
    update public.behavior_records x set recorded_by = null where x.recorded_by in (select id from pg_temp._gone);
    update public.task_submissions x set graded_by = null where x.graded_by in (select id from pg_temp._gone);
    delete from public.employees e where e.id in (select id from pg_temp._gone);
    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('employees', v_n);
  end if;

  if 'audit' = any(p_parts) then
    delete from public.audit_log;
    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('audit', v_n);
  end if;

  -- سطر واحد في سجل العمليات بدل آلاف السطور
  insert into public.audit_log (actor_id, actor_name, actor_role, action, table_name, record_id, new_data)
  values (v_me, (select coalesce(e.name_ar, p.username) from public.profiles p left join public.employees e on e.id = p.employee_id where p.id = v_me),
          'admin', 'RESET', 'all', coalesce(p_branch::text, 'all'),
          jsonb_build_object('parts', p_parts, 'branch', p_branch, 'counts', v_counts));

  return jsonb_build_object('counts', v_counts, 'users', to_jsonb(v_users),
                            'files', jsonb_build_object('task-files', to_jsonb(v_task), 'submissions', to_jsonb(v_sub)));
end $$;


-- ---------------------------------------------------------------------
-- دوال تبويب التحسين
-- ---------------------------------------------------------------------
create or replace function app.imp_context(p_student bigint, p_subject smallint)
returns integer
language plpgsql stable security definer set search_path = '' as $$
declare v_class integer;
begin
  select s.class_id into v_class from public.students s where s.id = p_student and s.status = 'active';
  if v_class is null then raise exception 'الطالب غير موجود أو بلا فصل'; end if;
  perform app.assert_can_author(v_class, p_subject);   -- الإدارة، أو معلم المادة لهذا الفصل
  return v_class;
end $$;

-- درجة النوع الحالية (بعد التحسينات السابقة) ووزنه
create or replace function app.imp_current(p_student bigint, p_subject smallint, p_term smallint, p_type smallint, p_extra numeric default null)
returns table (weight numeric, base numeric, current_score numeric, after_score numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  w numeric; e numeric; m numeric; b numeric; ratios numeric[];
begin
  select gw.weight into w from public.grade_weights gw where gw.subject_id = p_subject and gw.eval_type_id = p_type;
  w := coalesce(w, 0);
  select sum(ge.score), sum(ge.max_score) into e, m
    from public.grade_entries ge join public.assessments a on a.id = ge.assessment_id
   where ge.student_id = p_student and a.subject_id = p_subject and a.term_id = p_term and a.eval_type_id = p_type;
  b := case when coalesce(m, 0) > 0 then round(e / m * w, 2) end;
  select array_agg(least(1, greatest(0, x.earned / x.max_score)) order by x.created_at, x.id) into ratios
    from (select gi.*, row_number() over (order by gi.created_at, gi.id) rn
            from public.grade_improvements gi
           where gi.student_id = p_student and gi.subject_id = p_subject and gi.term_id = p_term) x
   where x.rn <= 2 and x.eval_type_id = p_type;
  weight := w;
  base := b;
  current_score := coalesce(app.apply_improvements(coalesce(b, 0), w, ratios), b, 0);
  after_score := case when p_extra is null then current_score
                      else app.apply_improvements(coalesce(b, 0), w, coalesce(ratios, '{}') || least(1, greatest(0, p_extra))) end;
  return next;
end $$;

-- حالة طالب في مادة: الأنواع المتاحة للتحسين ودرجته الحالية في كل نوع، وكم استُخدم من التحسينين
create or replace function public.improvement_state(p_student bigint, p_subject smallint, p_term smallint)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_used int;
begin
  perform app.imp_context(p_student, p_subject);
  select count(*) into v_used from public.grade_improvements gi where gi.student_id = p_student and gi.subject_id = p_subject and gi.term_id = p_term;
  return jsonb_build_object(
    'used', v_used, 'max', 2,
    'types', coalesce((
      select jsonb_agg(jsonb_build_object('eval_type_id', e.id, 'name', e.name, 'weight', c.weight, 'base', c.base, 'current', c.current_score)
                       order by e.sort_order, e.id)
        from public.eval_types e
        join public.grade_weights gw on gw.eval_type_id = e.id and gw.subject_id = p_subject and gw.weight > 0
        cross join lateral app.imp_current(p_student, p_subject, p_term, e.id) c
       where e.report_section <> 'final'), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('id', gi.id, 'type', e.name, 'earned', gi.earned, 'max', gi.max_score, 'reason', gi.reason,
                                          'before', gi.before_score, 'after', gi.after_score, 'at', gi.created_at) order by gi.created_at)
        from public.grade_improvements gi join public.eval_types e on e.id = gi.eval_type_id
       where gi.student_id = p_student and gi.subject_id = p_subject and gi.term_id = p_term), '[]'::jsonb));
end $$;

create or replace function public.improvement_preview(p_student bigint, p_subject smallint, p_term smallint, p_type smallint, p_earned numeric, p_max numeric)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c record;
begin
  perform app.imp_context(p_student, p_subject);
  select * into c from app.imp_current(p_student, p_subject, p_term, p_type,
                                       case when p_max > 0 and p_earned >= 0 then least(p_earned, p_max) / p_max end);
  return jsonb_build_object('weight', c.weight, 'current', c.current_score, 'after', c.after_score);
end $$;

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

create or replace function public.delete_improvement(p_id bigint)
returns void
language plpgsql security definer set search_path = '' as $$
declare r public.grade_improvements;
begin
  select * into r from public.grade_improvements where id = p_id;
  if r.id is null then raise exception 'السجل غير موجود'; end if;
  if not coalesce(app.is_admin(), false) then
    if r.created_by is distinct from auth.uid() then raise exception 'تحذف التحسين الذي رصدته أنت فقط' using errcode = '42501'; end if;
    if r.created_at < now() - interval '6 hours' then raise exception 'انتهت مهلة الحذف (6 ساعات) — اطلبه من الإدارة'; end if;
  end if;
  delete from public.grade_improvements where id = p_id;
end $$;

-- السجل: الإدارة كل التحسينات، والمعلم ما رصده
create or replace function public.list_improvements(p_q text, p_limit int default 50, p_offset int default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_admin boolean := coalesce(app.is_admin(), false);
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  if auth.uid() is null or app.my_role() not in ('admin', 'teacher') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return jsonb_build_object(
    'total', (select count(*) from public.grade_improvements gi join public.students s on s.id = gi.student_id
               where (v_admin or gi.created_by = auth.uid()) and (v_q is null or s.name_ar ilike '%' || v_q || '%' or s.code ilike '%' || v_q || '%')),
    'rows', coalesce((
      select jsonb_agg(x order by x.at desc) from (
        select gi.id, s.code, s.name_ar as student, sj.name as subject, t.name as term, e.name as type,
               gi.earned, gi.max_score as max, gi.reason, gi.before_score as before, gi.after_score as after, gi.created_at as at,
               case when v_admin then em.name_ar end as teacher,
               (v_admin or (gi.created_by = auth.uid() and gi.created_at >= now() - interval '6 hours')) as can_delete
          from public.grade_improvements gi
          join public.students s on s.id = gi.student_id
          join public.subjects sj on sj.id = gi.subject_id
          join public.terms t on t.id = gi.term_id
          join public.eval_types e on e.id = gi.eval_type_id
          left join public.employees em on em.id = gi.recorded_by
         where (v_admin or gi.created_by = auth.uid()) and (v_q is null or s.name_ar ilike '%' || v_q || '%' or s.code ilike '%' || v_q || '%')
         order by gi.created_at desc
         limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) x), '[]'::jsonb));
end $$;

-- للنسخة الاحتياطية
create or replace function public.backup_improvements(p_branch smallint)
returns json
language plpgsql stable security definer set search_path = '' as $$
declare v json;
begin
  perform app.require_admin();
  select coalesce(json_agg(x), '[]'::json) into v from (
    select s.code as "رقم الطالب", s.name_ar as "اسم الطالب", sj.name as "المادة", t.name as "الفصل الدراسي", e.name as "نوع التقييم",
           gi.earned as "المستحقة", gi.max_score as "العظمى", gi.before_score as "قبل", gi.after_score as "بعد",
           gi.reason as "السبب", em.name_ar as "رصده", gi.created_at as "التاريخ"
      from public.grade_improvements gi
      join public.students s on s.id = gi.student_id
      left join public.classes c on c.id = s.class_id
      join public.subjects sj on sj.id = gi.subject_id
      join public.terms t on t.id = gi.term_id
      join public.eval_types e on e.id = gi.eval_type_id
      left join public.employees em on em.id = gi.recorded_by
     where p_branch is null or c.branch_id = p_branch
     order by gi.created_at) x;
  return v;
end $$;

revoke all on function app.apply_improvements(numeric, numeric, numeric[]), app.imp_context(bigint, smallint),
                       app.imp_current(bigint, smallint, smallint, smallint, numeric) from public, anon;
grant execute on function app.apply_improvements(numeric, numeric, numeric[]) to authenticated;
revoke all on function public.improvement_state(bigint, smallint, smallint), public.improvement_preview(bigint, smallint, smallint, smallint, numeric, numeric),
                       public.save_improvement(jsonb), public.delete_improvement(bigint), public.list_improvements(text, int, int),
                       public.backup_improvements(smallint)
  from public, anon;
grant execute on function public.improvement_state(bigint, smallint, smallint), public.improvement_preview(bigint, smallint, smallint, smallint, numeric, numeric),
                          public.save_improvement(jsonb), public.delete_improvement(bigint), public.list_improvements(text, int, int),
                          public.backup_improvements(smallint)
  to authenticated;

do $$ begin raise notice '✅ هجرة 27: تحسين درجة الطالب'; end $$;
