-- =====================================================================
-- مِرقاة — 16: تقارير الإدارة (الطلاب، الموظفون، الحسابات)
--
-- كل تقرير استدعاء واحد يعيد JSON مجمّعًا داخل القاعدة: لا تُنقل آلاف الصفوف للموقع.
-- نفس الاستدعاء يغذي بطاقات الأرقام والرسم الدائري أعلى الصفحة والتقرير الكامل.
-- للإداري فقط.
-- =====================================================================

-- ---------------------------------------------------------------------
-- الطلاب
-- ---------------------------------------------------------------------
create or replace function public.report_students()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_month   timestamptz := date_trunc('month', now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh';
  v_prev    timestamptz := v_month - interval '1 month';
  v_result  jsonb;
begin
  perform app.require_admin();

  with s as (
    select st.id, st.status, st.gender, st.fee_status, st.enrolled_at,
           c.branch_id, b.name as branch, g.id as grade_id, g.name as grade, sg.name as stage, sg.sort_order as stage_sort, g.sort_order as grade_sort
      from public.students st
      left join public.classes c on c.id = st.class_id
      left join public.branches b on b.id = c.branch_id
      left join public.grades g on g.id = c.grade_id
      left join public.stages sg on sg.id = g.stage_id
  ),
  -- الانسحابات من سجل التدقيق: كل تغيير حالة من منتظم إلى منسحب
  w as (
    select a.occurred_at, (a.new_data ->> 'class_id')::int as class_id
      from public.audit_log a
     where a.table_name = 'students' and a.action = 'UPDATE'
       and a.old_data ->> 'status' = 'active' and a.new_data ->> 'status' = 'withdrawn'
  ),
  months as (
    select generate_series(v_month - interval '5 months', v_month, interval '1 month') as m
  )
  select jsonb_build_object(
    'generated_at', now(),
    'totals', (select jsonb_build_object(
        'all', count(*),
        'active', count(*) filter (where status = 'active'),
        'withdrawn', count(*) filter (where status = 'withdrawn'),
        'graduated', count(*) filter (where status = 'graduated'),
        'new_this_month', count(*) filter (where enrolled_at >= v_month),
        'new_last_month', count(*) filter (where enrolled_at >= v_prev and enrolled_at < v_month),
        'withdrawn_this_month', (select count(*) from w where occurred_at >= v_month),
        'withdrawn_last_month', (select count(*) from w where occurred_at >= v_prev and occurred_at < v_month),
        'before_system', count(*) filter (where enrolled_at is null)
      ) from s),
    'by_branch', coalesce((select jsonb_agg(x order by x ->> 'name') from (
        select jsonb_build_object(
          'name', coalesce(branch, 'بلا فرع'),
          'all', count(*),
          'active', count(*) filter (where status = 'active'),
          'withdrawn', count(*) filter (where status = 'withdrawn'),
          'graduated', count(*) filter (where status = 'graduated'),
          'new_this_month', count(*) filter (where enrolled_at >= v_month),
          'new_last_month', count(*) filter (where enrolled_at >= v_prev and enrolled_at < v_month),
          'male', count(*) filter (where status = 'active' and gender = 'ذكر'),
          'female', count(*) filter (where status = 'active' and gender = 'أنثى')
        ) as x
        from s group by branch) t), '[]'::jsonb),
    'by_grade', coalesce((select jsonb_agg(x order by (x ->> 'stage_sort')::int, (x ->> 'grade_sort')::int) from (
        select jsonb_build_object(
          'name', trim(coalesce(grade, '—') || ' ' || coalesce(stage, '')),
          'stage_sort', coalesce(min(stage_sort), 0), 'grade_sort', coalesce(min(grade_sort), 0),
          'active', count(*) filter (where status = 'active'),
          'withdrawn', count(*) filter (where status = 'withdrawn')
        ) as x
        from s group by grade, stage) t), '[]'::jsonb),
    'by_fee', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(fee_status, 'غير محدد'), 'count', n)) from (
        select fee_status, count(*) n from s where status = 'active' group by fee_status order by n desc) t), '[]'::jsonb),
    'by_gender', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(gender, 'غير محدد'), 'count', n)) from (
        select gender, count(*) n from s where status = 'active' group by gender order by n desc) t), '[]'::jsonb),
    'monthly', (select jsonb_agg(jsonb_build_object(
          'month', to_char(m, 'YYYY-MM'),
          'enrolled', (select count(*) from s where enrolled_at >= m and enrolled_at < m + interval '1 month'),
          'withdrawn', (select count(*) from w where occurred_at >= m and occurred_at < m + interval '1 month')
        ) order by m) from months)
  ) into v_result;
  return v_result;
end $$;

-- ---------------------------------------------------------------------
-- الموظفون
-- ---------------------------------------------------------------------
create or replace function public.report_employees()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_month  timestamptz := date_trunc('month', now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh';
  v_result jsonb;
begin
  perform app.require_admin();
  with e as (
    select em.id, em.is_active, coalesce(em.user_type, 'teacher') as user_type, em.gender, em.created_at,
           (select count(*) from public.staff_scope ss where ss.employee_id = em.id and ss.subject_id is not null) as subjects,
           (select count(*) from public.timetable_slots t where t.teacher_id = em.id) as periods
      from public.employees em
  ),
  eb as (
    select b.name as branch, e.*
      from e join public.staff_scope ss on ss.employee_id = e.id and ss.branch_id is not null
      join public.branches b on b.id = ss.branch_id
  )
  select jsonb_build_object(
    'generated_at', now(),
    'totals', (select jsonb_build_object(
        'all', count(*),
        'active', count(*) filter (where is_active),
        'inactive', count(*) filter (where not is_active),
        'teachers', count(*) filter (where is_active and user_type = 'teacher'),
        'admins', count(*) filter (where is_active and user_type = 'admin'),
        'no_scope', count(*) filter (where is_active and user_type = 'teacher' and subjects = 0),
        'new_this_month', count(*) filter (where created_at >= v_month),
        'weekly_periods', coalesce(sum(periods) filter (where is_active), 0)
      ) from e),
    'by_branch', coalesce((select jsonb_agg(x order by x ->> 'name') from (
        select jsonb_build_object(
          'name', branch,
          'teachers', count(distinct id) filter (where is_active),
          'periods', coalesce(sum(periods) filter (where is_active), 0),
          'subjects', coalesce(sum(subjects) filter (where is_active), 0)
        ) as x from eb group by branch) t), '[]'::jsonb),
    'by_subject', coalesce((select jsonb_agg(jsonb_build_object('name', su.name, 'teachers', n) order by n desc) from (
        select ss.subject_id, count(distinct ss.employee_id) n
          from public.staff_scope ss join public.employees em on em.id = ss.employee_id and em.is_active
         where ss.subject_id is not null group by ss.subject_id) t
        join public.subjects su on su.id = t.subject_id), '[]'::jsonb),
    'by_gender', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(gender, 'غير محدد'), 'count', n)) from (
        select gender, count(*) n from e where is_active group by gender) t), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- ---------------------------------------------------------------------
-- الحسابات
-- ---------------------------------------------------------------------
create or replace function public.report_accounts()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform app.require_admin();
  with p as (
    select pr.role, pr.status, pr.must_change_password, pr.last_login_at, pr.created_at
      from public.profiles pr
  ),
  r as (
    select unnest(array['student', 'teacher', 'admin']::public.app_role[]) as role
  )
  select jsonb_build_object(
    'generated_at', now(),
    'students_without', (select count(*) from public.students s where s.status = 'active'
                          and not exists (select 1 from public.profiles x where x.student_id = s.id)),
    'employees_without', (select count(*) from public.employees e where e.is_active
                          and not exists (select 1 from public.profiles x where x.employee_id = e.id)),
    'by_role', (select jsonb_agg(jsonb_build_object(
        'role', r.role,
        'all', (select count(*) from p where p.role = r.role),
        'active', (select count(*) from p where p.role = r.role and p.status = 'active'),
        'disabled', (select count(*) from p where p.role = r.role and p.status = 'disabled'),
        'activated', (select count(*) from p where p.role = r.role and p.status = 'active' and not p.must_change_password),
        'temp', (select count(*) from p where p.role = r.role and p.status = 'active' and p.must_change_password),
        'login_7d', (select count(*) from p where p.role = r.role and p.last_login_at > now() - interval '7 days'),
        'login_30d', (select count(*) from p where p.role = r.role and p.last_login_at > now() - interval '30 days'),
        'never', (select count(*) from p where p.role = r.role and p.last_login_at is null)
      ) order by r.role) from r),
    'daily_logins', (select jsonb_agg(jsonb_build_object('day', to_char(d, 'YYYY-MM-DD'), 'count',
        (select count(distinct a.username) from public.login_attempts a
          where a.succeeded and a.attempted_at >= d and a.attempted_at < d + interval '1 day')) order by d)
        from generate_series((now() at time zone 'Asia/Riyadh')::date - 13, (now() at time zone 'Asia/Riyadh')::date, interval '1 day') d)
  ) into v_result;
  return v_result;
end $$;

revoke all on function public.report_students() from public, anon;
revoke all on function public.report_employees() from public, anon;
revoke all on function public.report_accounts() from public, anon;
grant execute on function public.report_students() to authenticated, service_role;
grant execute on function public.report_employees() to authenticated, service_role;
grant execute on function public.report_accounts() to authenticated, service_role;

do $$ begin raise notice '✅ هجرة 16: تقارير الإدارة جاهزة'; end $$;
