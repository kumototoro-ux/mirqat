-- =====================================================================
-- هجرة 31: تسريع صفحات المعلم (الرئيسية، قائمة المهام، سجلات التحضير)
--   كانت «security invoker» فتُطبَّق سياسات الصفوف على كل سجل تحضير ورصد (دالة نطاق لكل صف)،
--   ونشاط 14 يومًا كان يمسح الجداول 14 مرة. صارت «security definer» مع تقييد صريح بنفس النطاق:
--   كل الأرقام مقيّدة بالمعلم نفسه (recorded_by / teacher_id) أو بنطاقه (عدد الطلاب، غياب اليوم)،
--   ونشاط الأيام بتجميع واحد لكل جدول. النتيجة نفسها، والزمن من ~4.4 ث إلى أجزاء من الثانية.
--   وبنفس الطريقة: قائمة المهام والنماذج (staff_assessments) وسجلات التحضير (attendance_sessions)
--   — النطاق يُفحص مرة لكل تقييم/طالب بدل كل سجل.
-- =====================================================================

create index if not exists attendance_records_day_idx on public.attendance_records (occurred_on);
create index if not exists grade_entries_recorded_at_idx on public.grade_entries (recorded_at);

create or replace function public.staff_home() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
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
    'students', (select count(*) from public.students s where s.status = 'active' and (v_admin or app.staff_can_access(s.class_id, null))),
    -- التحضير اليوم: حصص اليوم (حصصي للمعلم، كل الحصص للإداري) وما سُجّل منها
    'periods_today', case when v_dow > 4 then 0 else (select count(*) from public.timetable_slots t
                       where t.day_of_week = v_dow and (v_admin or t.teacher_id = v_me)) end,
    'periods_recorded', (select count(*) from (
                           select distinct a.class_id, a.period_no, a.subject_id from public.attendance_records a
                            where a.occurred_on = v_today and (v_admin or a.recorded_by = v_me)) x),
    'absent_today', (select count(*) from public.attendance_records a join public.attendance_statuses st on st.id = a.status_id
                      where a.occurred_on = v_today and app.att_kind(st.name) = 'absent'
                        and (v_admin or app.staff_can_access_student(a.student_id))),
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
         order by coalesce(f.closes_at, a.due_at), a.id limit 5) x), '[]'::jsonb),
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
                   'day', d.day, 'grades', coalesce(g.n, 0), 'attendance', coalesce(at.n, 0), 'views', coalesce(v.n, 0)) order by d.day), '[]'::jsonb)
                   from (select x::date as day from generate_series(v_today - 13, v_today, interval '1 day') x) d
                   left join (select (g.recorded_at at time zone 'Asia/Riyadh')::date as day, count(*) as n from public.grade_entries g
                               where g.recorded_at >= (v_today - 14)::timestamp at time zone 'Asia/Riyadh' and (v_admin or g.recorded_by = v_me)
                               group by 1) g on g.day = d.day
                   left join (select a.occurred_on as day, count(*) as n from public.attendance_records a
                               where a.occurred_on >= v_today - 13 and (v_admin or a.recorded_by = v_me)
                               group by 1) at on at.day = d.day
                   left join (select (p.last_opened_at at time zone 'Asia/Riyadh')::date as day, count(*) as n
                                from public.content_progress p join public.content_items c on c.id = p.content_item_id
                               where p.last_opened_at >= (v_today - 14)::timestamp at time zone 'Asia/Riyadh' and (v_admin or c.teacher_id = v_me)
                               group by 1) v on v.day = d.day),
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

revoke all on function public.staff_home() from public, anon;
grant execute on function public.staff_home() to authenticated;

/* قائمة المهام والنماذج */
create or replace function public.staff_assessments(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
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
       -- نطاق المعلم: نفس سياسة القراءة، مرة لكل تقييم
       and app.staff_can_access(a.class_id, a.subject_id)
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

/* سجلات التحضير */
create or replace function public.attendance_sessions(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
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
           count(*) filter (where st.kind = 'present') as present,
           count(*) filter (where st.kind = 'absent') as absent,
           count(*) filter (where st.kind = 'late') as late,
           count(*) filter (where st.kind = 'excused') as excused,
           max(a.recorded_at) as recorded_at,
           (array_agg(a.recorded_by order by a.recorded_at desc))[1] as recorded_by,
           bool_or(a.is_edited) as edited
      from public.attendance_records a
      join (select x.id, app.att_kind(x.name) as kind from public.attendance_statuses x) st on st.id = a.status_id -- النوع مرة لكل حالة
     where a.class_id is not null and a.occurred_on is not null
       and (v_class is null or a.class_id = v_class)
       and (v_from is null or a.occurred_on >= v_from)
       and (not v_mine or a.recorded_by = app.my_employee_id())
       -- نطاق المعلم: طلاب فصوله (يُحسب مرة لكل طالب لا لكل سجل)
       and ((select app.is_admin()) or a.student_id in (select s.id from public.students s where app.staff_can_access(s.class_id, null)))
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
