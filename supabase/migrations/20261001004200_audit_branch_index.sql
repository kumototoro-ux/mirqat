-- =====================================================================
-- هجرة 42: فهرسة نشاط الفرع (للأداء بعد حجم المدرسة الحقيقي)
-- في هجرة 40 كان branch_audit يحسب فرع كل صف سجل وقت القراءة. مع ثلاثة آلاف طالب
-- يتراكم في التحضير والرصد مئات الآلاف من الصفوف خلال 90 يومًا، فيتجاوز الاستعلام مهلته.
-- الآن يُحسب الفرع مرة واحدة عند الكتابة (تريغر على audit_log) ويُفهرس.
-- =====================================================================

alter table public.audit_log add column if not exists branches smallint[];
create index if not exists audit_log_branches_idx on public.audit_log using gin (branches);

-- فروع الصف: الموظف قد يتبع عدة فروع، وغيره فرع واحد من بيانات السجل نفسها
create or replace function app.audit_branches(p_table text, p_old jsonb, p_new jsonb) returns smallint[]
language plpgsql stable security definer set search_path = '' as $$
declare d jsonb := coalesce(p_new, p_old); v smallint;
begin
  if p_table = 'employees' then
    return app.employee_branches(nullif(d ->> 'id', '')::bigint);
  end if;
  v := coalesce(nullif(d ->> 'branch_id', '')::smallint,
                app.class_branch(nullif(d ->> 'class_id', '')::integer),
                app.student_branch(nullif(d ->> 'student_id', '')::bigint));
  return case when v is null then null else array[v] end;
end $$;
revoke all on function app.audit_branches(text, jsonb, jsonb) from public, anon, authenticated;

create or replace function app.audit_log_set_branches() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.table_name in ('students', 'employees', 'staff_scope', 'classes', 'subject_matrix', 'timetable_slots', 'exam_schedule',
                        'assessments', 'grade_entries', 'content_items', 'period_links', 'attendance_records', 'behavior_records') then
    new.branches := app.audit_branches(new.table_name, new.old_data, new.new_data);
  end if;
  return new;
end $$;
revoke all on function app.audit_log_set_branches() from public, anon, authenticated;
drop trigger if exists audit_log_branches on public.audit_log;
create trigger audit_log_branches before insert on public.audit_log for each row execute function app.audit_log_set_branches();

-- تعبئة آخر 90 يومًا (نافذة العرض)
update public.audit_log a set branches = app.audit_branches(a.table_name, a.old_data, a.new_data)
 where a.occurred_at > now() - interval '90 days' and a.branches is null
   and a.table_name in ('students', 'employees', 'staff_scope', 'classes', 'subject_matrix', 'timetable_slots', 'exam_schedule',
                        'assessments', 'grade_entries', 'content_items', 'period_links', 'attendance_records', 'behavior_records');

-- القراءة تستعمل العمود المفهرس
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
     where a.branches @> array[p_branch]
       and a.occurred_at > now() - interval '90 days'
       and (p_table is null or a.table_name = p_table)
       and (v_q is null or a.actor_name ilike '%' || v_q || '%' or a.details ilike '%' || v_q || '%' or a.actor_code ilike '%' || v_q || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at desc, x.id desc)
                        from (select * from base order by occurred_at desc, id desc offset greatest(0, coalesce(p_offset, 0)) limit v_limit) x), '[]'::jsonb))
  into v_res;
  return v_res;
end $$;

do $$ begin raise notice '✅ هجرة 42: نشاط الفرع مفهرس'; end $$;
