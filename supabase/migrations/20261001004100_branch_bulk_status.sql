-- =====================================================================
-- هجرة 41: تغيير الحالة الجماعي لأصحاب المناصب ضمن فروعهم
--   set_students_status(ids, status)   مستوى «تسجيل الطلاب» ≥ 2 في فرع كل طالب
--   set_employees_active(ids, active)  مستوى «تسجيل الموظفين» ≥ 2 مع قاعدة الرتبة، وليس نفسه
-- الكل أو لا شيء: أي سجل خارج النطاق يُفشل العملية كلها.
-- =====================================================================

create or replace function public.set_students_status(p_ids bigint[], p_status text) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_n integer;
begin
  if app.my_role() is null or not app.is_staff() then
    raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية في فرعه' using errcode = '42501';
  end if;
  if p_status not in ('active', 'withdrawn', 'graduated') then raise exception 'حالة غير معروفة'; end if;
  if coalesce(cardinality(p_ids), 0) = 0 or cardinality(p_ids) > 100 then raise exception 'حدد بين 1 و100 طالب'; end if;
  if not app.is_admin() and exists (
       select 1 from unnest(p_ids) i where not app.has_cap('students', 2, app.student_branch(i))) then
    raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية في فرعه' using errcode = '42501';
  end if;
  update public.students set status = p_status::public.student_status, is_edited = true where id = any(p_ids);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.set_employees_active(p_ids bigint[], p_active boolean) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_n integer; v_ids bigint[];
begin
  if app.my_role() is null or not app.is_staff() then
    raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية في فرعه' using errcode = '42501';
  end if;
  v_ids := array(select i from unnest(p_ids) i where i is distinct from app.my_employee_id());   -- لا يوقف نفسه
  if coalesce(cardinality(v_ids), 0) = 0 or cardinality(v_ids) > 100 then raise exception 'حدد بين 1 و100 موظف'; end if;
  if not app.is_admin() and exists (
       select 1 from unnest(v_ids) i where not app.emp_cap('employees', 2, i, true)) then
    raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية في فرعه' using errcode = '42501';
  end if;
  update public.employees set is_active = p_active, is_edited = true where id = any(v_ids);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.set_students_status(bigint[], text), public.set_employees_active(bigint[], boolean) from public, anon;
grant execute on function public.set_students_status(bigint[], text), public.set_employees_active(bigint[], boolean) to authenticated;

do $$ begin raise notice '✅ هجرة 41: تغيير الحالة الجماعي ضمن الفرع'; end $$;
