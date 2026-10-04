-- =====================================================================
-- مِرقاة — 18: تدقيق القوائم المرجعية
-- كل إضافة أو إعادة تسمية أو حذف في الفروع والمراحل والصفوف والشعب والمواد
-- وأنواع التقييم والحالات والسنوات والفصول الدراسية تُكتب في سجل النشاط (قبل/بعد).
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'branches', 'stages', 'grades', 'sections', 'subjects', 'eval_types',
    'attendance_statuses', 'behavior_statuses', 'academic_years', 'terms'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_row()',
      t || '_audit', t);
  end loop;
  raise notice '✅ هجرة 18: القوائم المرجعية مراقبة في سجل النشاط';
end $$;

-- عدد السجلات المرتبطة بكل فرع (يظهر في الإعدادات ويُشرح به سبب رفض الحذف)
create or replace function public.branch_usage()
returns table (branch_id smallint, classes bigint, students bigint, staff bigint)
language sql stable security definer set search_path = '' as $$
  select b.id,
         (select count(*) from public.classes c where c.branch_id = b.id),
         (select count(*) from public.students s join public.classes c on c.id = s.class_id where c.branch_id = b.id),
         (select count(distinct ss.employee_id) from public.staff_scope ss where ss.branch_id = b.id)
    from public.branches b
   where coalesce(app.is_admin(), false)
$$;
revoke all on function public.branch_usage() from public, anon;
grant execute on function public.branch_usage() to authenticated;
