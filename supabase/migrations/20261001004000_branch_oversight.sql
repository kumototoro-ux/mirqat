-- =====================================================================
-- هجرة 40: الإشراف على الفرع — تقرير الفرع، سجل نشاط الفرع، متابعة المهام والرصد
-- الكل للقراءة فقط، ومقيّد بفروع صاحب المنصب في القاعدة نفسها (لا في الأزرار):
--   cap_branches(area, min)        الفروع التي أملك فيها مستوى في مجال
--   branch_report(branch)          أرقام الطلاب والموظفين والحسابات لفرع واحد (مجال reports)
--   branch_audit(branch, ...)      سجل نشاط الفرع آخر 90 يومًا (مجال audit الجديد)
--   branch_tasks(p)                مهام ونماذج الفرع مع التسليمات (مجال tasks)
--   branch_grading(p)              ملخص الرصد لكل معلم وآخر ما رُصد (مجال grading)
-- لا تُعدَّل سياسات الجداول الأساسية: الدوال security definer تتحقق أولًا ثم تقرأ.
-- =====================================================================

-- مجال جديد: سجل النشاط (عرض فقط لمدير الفرع ومدير الفروع في فروعهم)
insert into public.cap_areas (area, name_ar, sort) values ('audit', 'سجل نشاط الفرع', 14)
  on conflict (area) do nothing;
insert into public.position_caps (position, area, level) values
  ('branch_manager', 'audit', 1), ('branches_director', 'audit', 1)
  on conflict do nothing;

-- ---------------------------------------------------------------------
-- الفروع التي أملك فيها مستوى في مجال (الإداري: كل الفروع الفعالة)
-- ---------------------------------------------------------------------
create or replace function public.cap_branches(p_area text, p_min integer default 1) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) order by b.sort_order, b.id), '[]'::jsonb)
    from public.branches b
   where b.is_active and app.has_cap(p_area, p_min, b.id)
$$;

-- ---------------------------------------------------------------------
-- تقرير الفرع
-- ---------------------------------------------------------------------
create or replace function public.branch_report(p_branch smallint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_month timestamptz := date_trunc('month', now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh';
  v_res jsonb;
begin
  perform app.require_cap('reports', 1, p_branch);
  with s as (
    select st.id, st.status, st.gender, st.enrolled_at, g.name as grade, g.sort_order as gsort, c.id as class_id
      from public.students st
      join public.classes c on c.id = st.class_id and c.branch_id = p_branch
      join public.grades g on g.id = c.grade_id
  ),
  emp as (
    select e.id, e.is_active, e.gender,
           (select count(*) from public.staff_scope ss where ss.employee_id = e.id and ss.subject_id is not null and ss.branch_id = p_branch) as subjects,
           (select count(*) from public.timetable_slots t join public.classes c on c.id = t.class_id and c.branch_id = p_branch where t.teacher_id = e.id) as periods
      from public.employees e
     where e.user_type = 'teacher' and p_branch = any(app.employee_branches(e.id))
  ),
  pr as (
    select p.role, p.status, p.must_change_password, p.last_login_at, p.student_id, p.employee_id
      from public.profiles p
     where (p.student_id is not null and exists (select 1 from s where s.id = p.student_id))
        or (p.employee_id is not null and exists (select 1 from emp where emp.id = p.employee_id))
  )
  select jsonb_build_object(
    'generated_at', now(),
    'branch', (select name from public.branches where id = p_branch),
    'students', jsonb_build_object(
      'all', (select count(*) from s),
      'active', (select count(*) from s where status = 'active'),
      'withdrawn', (select count(*) from s where status = 'withdrawn'),
      'graduated', (select count(*) from s where status = 'graduated'),
      'new_this_month', (select count(*) from s where enrolled_at >= v_month),
      'by_grade', coalesce((select jsonb_agg(jsonb_build_object('name', grade, 'active', n) order by gsort)
                              from (select grade, gsort, count(*) n from s where status = 'active' group by grade, gsort) t), '[]'::jsonb),
      'by_gender', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(gender, 'غير محدد'), 'count', n))
                               from (select gender, count(*) n from s where status = 'active' group by gender) t), '[]'::jsonb),
      'monthly', coalesce((select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
                    'enrolled', (select count(*) from s where s.enrolled_at >= m and s.enrolled_at < m + interval '1 month')) order by m)
                    from generate_series(v_month - interval '5 months', v_month, interval '1 month') m), '[]'::jsonb)),
    'employees', jsonb_build_object(
      'teachers', (select count(*) from emp where is_active),
      'inactive', (select count(*) from emp where not is_active),
      'no_subject', (select count(*) from emp where is_active and subjects = 0),
      'weekly_periods', coalesce((select sum(periods) from emp where is_active), 0)),
    'accounts', jsonb_build_object(
      'students_without', (select count(*) from s where status = 'active'
                            and not exists (select 1 from public.profiles x where x.student_id = s.id)),
      'teachers_without', (select count(*) from emp where is_active
                            and not exists (select 1 from public.profiles x where x.employee_id = emp.id)),
      'by_role', coalesce((select jsonb_agg(to_jsonb(q) order by q.role) from (
          select r.role, count(pr.role) as "all", count(*) filter (where pr.status = 'disabled') as disabled,
                 count(*) filter (where pr.status = 'active' and not pr.must_change_password) as activated,
                 count(*) filter (where pr.status = 'active' and pr.must_change_password) as temp,
                 count(*) filter (where pr.last_login_at > now() - interval '7 days') as login_7d,
                 count(*) filter (where pr.last_login_at is null) as never
            from (values ('student'::public.app_role), ('teacher')) r(role) left join pr on pr.role = r.role group by r.role) q), '[]'::jsonb))
  ) into v_res;
  return v_res;
end $$;

-- ---------------------------------------------------------------------
-- سجل نشاط الفرع: الأحداث على بيانات الفرع (طلابه، فصوله، معلموه، تحضيره، سلوكه، مهامه...)
-- ---------------------------------------------------------------------
create or replace function app.audit_in_branch(p_old jsonb, p_new jsonb, p_table text, p_branch smallint) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare d jsonb := coalesce(p_new, p_old);
begin
  if p_table = 'employees' then
    return p_branch = any(app.employee_branches(nullif(d ->> 'id', '')::bigint));
  end if;
  return coalesce(nullif(d ->> 'branch_id', '')::smallint,
                  app.class_branch(nullif(d ->> 'class_id', '')::integer),
                  app.student_branch(nullif(d ->> 'student_id', '')::bigint)) = p_branch;
end $$;
revoke all on function app.audit_in_branch(jsonb, jsonb, text, smallint) from public, anon, authenticated;

create or replace function public.branch_audit(p_branch smallint, p_q text default null, p_table text default null,
                                               p_offset integer default 0, p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := nullif(btrim(replace(replace(coalesce(p_q, ''), '%', ''), '_', '')), '');
  v_limit integer := least(50, greatest(5, coalesce(p_limit, 20)));
  v_res jsonb;
begin
  perform app.require_cap('audit', 1, p_branch);
  with base as (
    select a.id, a.occurred_at, a.actor_name, a.actor_code, a.actor_role, a.action, a.table_name, a.record_id, a.details
      from public.audit_log a
     where a.occurred_at > now() - interval '90 days'
       and a.table_name in ('students', 'employees', 'staff_scope', 'classes', 'subject_matrix', 'timetable_slots', 'exam_schedule',
                            'assessments', 'grade_entries', 'content_items', 'period_links', 'attendance_records', 'behavior_records')
       and (p_table is null or a.table_name = p_table)
       and (v_q is null or a.actor_name ilike '%' || v_q || '%' or a.details ilike '%' || v_q || '%' or a.actor_code ilike '%' || v_q || '%')
       and app.audit_in_branch(a.old_data, a.new_data, a.table_name, p_branch)
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at desc, x.id desc)
                        from (select * from base order by occurred_at desc, id desc offset greatest(0, coalesce(p_offset, 0)) limit v_limit) x), '[]'::jsonb))
  into v_res;
  return v_res;
end $$;

-- ---------------------------------------------------------------------
-- متابعة المهام والنماذج (قراءة فقط)
-- ---------------------------------------------------------------------
create or replace function public.branch_tasks(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_branch smallint := nullif(p ->> 'branch', '')::smallint;
  v_kind text := nullif(p ->> 'kind', '');
  v_status text := nullif(p ->> 'status', '');
  v_teacher bigint := nullif(p ->> 'teacher', '')::bigint;
  v_q text := nullif(btrim(replace(replace(coalesce(p ->> 'q', ''), '%', ''), '_', '')), '');
  v_off integer := greatest(0, coalesce((p ->> 'offset')::int, 0));
  v_lim integer := least(50, greatest(5, coalesce((p ->> 'limit')::int, 15)));
  v_res jsonb;
begin
  perform app.require_cap('tasks', 1, v_branch);
  with base as (
    select a.id, a.kind::text as kind, a.title, a.created_at, a.due_at, a.max_score, a.teacher_id, a.class_id,
           g.name as grade, sc.name as section, su.name as subject, e.name_ar as teacher,
           case
             when a.kind = 'form' then
               case when f.status = 'draft' then 'draft'
                    when f.status = 'closed' or (f.closes_at is not null and f.closes_at <= now()) then 'closed'
                    when f.opens_at is not null and f.opens_at > now() then 'scheduled'
                    else 'open' end
             else
               case when a.is_draft then 'draft'
                    when a.published_at is not null and a.published_at > now() then 'scheduled'
                    when a.due_at is not null and a.due_at <= now() then 'closed'
                    else 'open' end
           end as status
      from public.assessments a
      join public.classes c on c.id = a.class_id and c.branch_id = v_branch
      join public.grades g on g.id = c.grade_id
      join public.sections sc on sc.id = c.section_id
      join public.subjects su on su.id = a.subject_id
      left join public.employees e on e.id = a.teacher_id
      left join public.form_details f on f.assessment_id = a.id
     where a.kind in ('task', 'form')
       and (v_kind is null or a.kind::text = v_kind)
       and (v_teacher is null or a.teacher_id = v_teacher)
       and (v_q is null or a.title ilike '%' || v_q || '%')
  ), flt as (
    select * from base where v_status is null or status = v_status
  ), counted as (
    select b.*,
           case when exists (select 1 from public.assessments x where x.id = b.id and x.target_student_id is not null) then 1
                else (select count(*) from public.students s where s.class_id = b.class_id and s.status = 'active') end as class_size,
           case when b.kind = 'form'
                then (select count(distinct t.student_id) from public.form_attempts t where t.assessment_id = b.id and not t.is_auto_absent)
                else (select count(*) from public.task_submissions s where s.assessment_id = b.id) end as submitted,
           (select count(*) from public.grade_entries ge where ge.assessment_id = b.id) as graded,
           (select round(avg(ge.score / nullif(ge.max_score, 0)) * 100) from public.grade_entries ge where ge.assessment_id = b.id) as avg_pct
      from (select * from flt order by created_at desc, id desc offset v_off limit v_lim) b
  )
  select jsonb_build_object(
    'total', (select count(*) from flt),
    'summary', jsonb_build_object(
      'tasks', (select count(*) from base where kind = 'task'),
      'forms', (select count(*) from base where kind = 'form'),
      'open', (select count(*) from base where status = 'open'),
      'closed', (select count(*) from base where status = 'closed'),
      'draft', (select count(*) from base where status = 'draft')),
    'teachers', coalesce((select jsonb_agg(jsonb_build_object('id', teacher_id, 'name', teacher, 'n', n) order by n desc)
                            from (select teacher_id, teacher, count(*) n from base where teacher_id is not null group by teacher_id, teacher) t), '[]'::jsonb),
    'rows', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc, c.id desc) from counted c), '[]'::jsonb)
  ) into v_res;
  return v_res;
end $$;

-- ---------------------------------------------------------------------
-- متابعة الرصد: ملخص كل معلم + آخر التقييمات المرصودة (قراءة فقط)
-- ---------------------------------------------------------------------
create or replace function public.branch_grading(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_branch smallint := nullif(p ->> 'branch', '')::smallint;
  v_term smallint := nullif(p ->> 'term', '')::smallint;
  v_off integer := greatest(0, coalesce((p ->> 'offset')::int, 0));
  v_lim integer := least(50, greatest(5, coalesce((p ->> 'limit')::int, 15)));
  v_res jsonb;
begin
  perform app.require_cap('grading', 1, v_branch);
  with a as (
    select x.id, x.kind::text as kind, x.title, x.teacher_id, x.due_at, x.created_at, x.class_id, x.grades_recorded_at,
           g.name as grade, sc.name as section, su.name as subject, e.name_ar as teacher,
           (select count(*) from public.grade_entries ge where ge.assessment_id = x.id) as graded,
           (select max(ge.recorded_at) from public.grade_entries ge where ge.assessment_id = x.id) as last_recorded,
           (select round(avg(ge.score / nullif(ge.max_score, 0)) * 100) from public.grade_entries ge where ge.assessment_id = x.id) as avg_pct
      from public.assessments x
      join public.classes c on c.id = x.class_id and c.branch_id = v_branch
      join public.grades g on g.id = c.grade_id
      join public.sections sc on sc.id = c.section_id
      join public.subjects su on su.id = x.subject_id
      left join public.employees e on e.id = x.teacher_id
     where (v_term is null or x.term_id = v_term)
       and (x.kind = 'manual' or not x.is_draft)
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'assessments', (select count(*) from a),
      'graded', (select count(*) from a where graded > 0),
      'overdue_ungraded', (select count(*) from a where kind <> 'manual' and graded = 0 and due_at is not null and due_at < now() - interval '3 days')),
    'teachers', coalesce((select jsonb_agg(jsonb_build_object('id', teacher_id, 'name', teacher, 'assessments', n, 'graded', gd,
                    'ungraded_overdue', od, 'last_recorded', lr, 'avg_pct', ap) order by od desc, n desc)
                  from (select teacher_id, teacher, count(*) n, count(*) filter (where graded > 0) gd,
                               count(*) filter (where kind <> 'manual' and graded = 0 and due_at is not null and due_at < now() - interval '3 days') od,
                               max(last_recorded) lr, round(avg(avg_pct)) ap
                          from a where teacher_id is not null group by teacher_id, teacher) t), '[]'::jsonb),
    'total', (select count(*) from a where graded > 0),
    'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.last_recorded desc, x.id desc)
                        from (select * from a where graded > 0 order by last_recorded desc, id desc offset v_off limit v_lim) x), '[]'::jsonb)
  ) into v_res;
  return v_res;
end $$;

revoke all on function public.cap_branches(text, integer), public.branch_report(smallint),
  public.branch_audit(smallint, text, text, integer, integer), public.branch_tasks(jsonb), public.branch_grading(jsonb) from public, anon;
grant execute on function public.cap_branches(text, integer), public.branch_report(smallint),
  public.branch_audit(smallint, text, text, integer, integer), public.branch_tasks(jsonb), public.branch_grading(jsonb) to authenticated;

do $$ begin raise notice '✅ هجرة 40: الإشراف على الفرع (تقرير، نشاط، مهام، رصد)'; end $$;
