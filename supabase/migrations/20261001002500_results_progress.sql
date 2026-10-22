-- =====================================================================
-- مِرقاة — 25: "الأداء حتى الآن" في النتائج
--   في بداية الفصل الدراسي يكون مجموع الطالب من 100 منخفضًا لأن أغلب التقييمات (كالنهائي) لم تُرصد بعد،
--   فيبدو الجميع "ضعيفًا". يضاف لكل مادة ولكل طالب ولكل فصل مؤشر ثانٍ:
--   الأداء = المجموع ÷ نسب أنواع التقييم التي رُصدت فعلًا × 100
--   الإشعار الرسمي والتقدير يبقيان على المجموع من 100 كما في النظام القديم.
-- =====================================================================

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
  ev as (   -- لكل طالب ومادة ونوع تقييم: المرصود
    select ge.student_id, a.subject_id, a.eval_type_id, sum(ge.score) as earned, sum(ge.max_score) as mx, count(*) as n
      from public.grade_entries ge join public.assessments a on a.id = ge.assessment_id
     where ge.student_id = any(p_student_ids) and a.term_id = p_term_id
     group by 1, 2, 3),
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
           case when ev.mx > 0 then round(ev.earned / ev.mx * coalesce(w.weight, 0), 2) else 0 end as weighted
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

create or replace function public.results_overview(p_term_id smallint) returns jsonb
language sql stable security definer set search_path = '' as $$
  with ev as (
    select ge.student_id, a.subject_id, a.eval_type_id, sum(ge.score) as earned, sum(ge.max_score) as mx
      from public.grade_entries ge join public.assessments a on a.id = ge.assessment_id
     where a.term_id = p_term_id and coalesce(app.is_admin(), false)
     group by 1, 2, 3),
  ss as (
    select ev.student_id, ev.subject_id,
           sum(case when ev.mx > 0 then round(ev.earned / ev.mx * coalesce(w.weight, 0), 2) else 0 end) as total,
           sum(coalesce(w.weight, 0)) as rec_max
      from ev left join public.grade_weights w on w.subject_id = ev.subject_id and w.eval_type_id = ev.eval_type_id
     group by 1, 2),
  wt as (select subject_id, sum(weight) as mx from public.grade_weights where weight > 0 group by 1),
  sp as (
    select ss.student_id, avg(ss.total / wt.mx * 100) as pct,
           avg(case when ss.rec_max > 0 then ss.total / ss.rec_max * 100 end) as progress
      from ss join wt on wt.subject_id = ss.subject_id and wt.mx > 0
     group by 1),
  cls as (
    select s.class_id, count(*) as students, count(sp.pct) as graded, round(avg(sp.pct), 2) as average,
           round(avg(sp.progress), 2) as progress,
           count(*) filter (where app.results_visible(s.id, p_term_id)) as visible
      from public.students s left join sp on sp.student_id = s.id
     where s.status = 'active' and s.class_id is not null and coalesce(app.is_admin(), false)
     group by s.class_id)
  select case when not coalesce(app.is_admin(), false) then null else
    coalesce(jsonb_agg(jsonb_build_object('class_id', class_id, 'students', students, 'graded', graded,
                                          'average', average, 'progress', progress, 'visible', visible)), '[]'::jsonb) end
    from cls
$$;

revoke all on function public.results_overview(smallint) from public, anon;
grant execute on function public.results_overview(smallint) to authenticated;

do $$ begin raise notice '✅ هجرة 25: الأداء حتى الآن في النتائج'; end $$;
