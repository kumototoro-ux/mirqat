-- =====================================================================
-- هجرة 38: مناصب الفروع (دفعة 2ب-2) — الموظفون وحسابات الموظفين والطلاب
--  • الموظف «في فرعي» إن كان نطاقه أو منصبه في فرع أملك فيه القدرة. الإداريون لا يظهرون لأحد ولا يُمسّون
--  • تسجيل/تعديل الموظفين: معلمون فقط، في فروعي فقط، لا نفسي، لا نوع إداري. الحذف يبقى للإداري
--  • الحسابات: can_manage_account / can_manage_profile يفحصها الخادم قبل أي عملية بمفتاح الخدمة
-- =====================================================================

-- فروع الموظف: نطاقه (staff_scope) أو مناصبه
create or replace function app.employee_branches(p_emp bigint) returns smallint[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct b), '{}') from (
    select branch_id as b from public.staff_scope where employee_id = p_emp and branch_id is not null
    union select branch_id from public.employee_positions where employee_id = p_emp) x
$$;

-- هل لي المستوى على «معلم» في فروعه؟ p_all = في كل فروعه (للكتابة)، وإلا في أحدها (للعرض). الإداري: دائمًا
create or replace function app.emp_cap(p_area text, p_min integer, p_emp bigint, p_all boolean) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_br smallint[]; v_ok boolean;
begin
  if app.is_admin() then return true; end if;
  if app.my_role() is null then return false; end if;
  if not exists (select 1 from public.employees where id = p_emp and user_type = 'teacher') then return false; end if;
  v_br := app.employee_branches(p_emp);
  if cardinality(v_br) = 0 then return false; end if;
  if p_all then
    select bool_and(app.cap_level(p_area, b) >= p_min) into v_ok from unnest(v_br) b;
  else
    select bool_or(app.cap_level(p_area, b) >= p_min) into v_ok from unnest(v_br) b;
  end if;
  return coalesce(v_ok, false);
end $$;
revoke all on function app.employee_branches(bigint), app.emp_cap(text, integer, bigint, boolean) from public, anon;
grant execute on function app.employee_branches(bigint), app.emp_cap(text, integer, bigint, boolean) to authenticated;

-- القراءة
drop policy if exists employees_read on public.employees;
create policy employees_read on public.employees for select to authenticated
  using ((select app.is_admin()) or id = (select app.my_employee_id()) or app.emp_cap('employees', 1, id, false));
drop policy if exists staff_scope_read on public.staff_scope;
create policy staff_scope_read on public.staff_scope for select to authenticated
  using ((select app.is_admin()) or employee_id = (select app.my_employee_id()) or app.emp_cap('employees', 1, employee_id, false));
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using ((select app.is_admin()) or id = auth.uid()
         or (employee_id is not null and app.emp_cap('employee_accounts', 1, employee_id, false))
         or (student_id is not null and app.has_cap('student_accounts', 1, app.student_branch(student_id))));

-- هل أستطيع إدارة حساب سجلٍّ ما (إنشاء/كلمة مرور/إيقاف)؟ يفحصها الخادم قبل استعمال مفتاح الخدمة
create or replace function public.can_manage_account(p_kind text, p_id bigint, p_min integer default 2) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when app.is_admin() then true
    when p_kind = 'employee' then p_id is distinct from app.my_employee_id() and app.emp_cap('employee_accounts', p_min, p_id, true)
    when p_kind = 'student' then app.has_cap('student_accounts', p_min, app.student_branch(p_id))
    else false end
$$;
create or replace function public.can_manage_profile(p_user uuid, p_min integer default 2) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_emp bigint; v_stu bigint;
begin
  if app.is_admin() then return true; end if;
  if p_user is null or p_user = auth.uid() then return false; end if;
  select employee_id, student_id into v_emp, v_stu from public.profiles where id = p_user;
  if not found then return false; end if;
  if v_emp is not null then return public.can_manage_account('employee', v_emp, p_min); end if;
  if v_stu is not null then return public.can_manage_account('student', v_stu, p_min); end if;
  return false;
end $$;
revoke all on function public.can_manage_account(text, bigint, integer), public.can_manage_profile(uuid, integer) from public, anon;
grant execute on function public.can_manage_account(text, bigint, integer), public.can_manage_profile(uuid, integer) to authenticated;

create or replace FUNCTION public.save_employee(p_id bigint, p jsonb)
 RETURNS TABLE(id bigint, code text, user_id uuid, role app_role)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id    bigint;
  v_code  text;
  v_name  text := app.nz(p, 'name_ar');
  v_nid   text := app.nz(p, 'national_id');
  v_type  text := coalesce(app.nz(p, 'user_type'), 'teacher');
  v_scope jsonb := coalesce(p -> 'scope', '{}'::jsonb);
  v_role  public.app_role;
  v_user  uuid;
begin
  if not app.is_admin() then
    -- صاحب منصب: معلمون في فروعه فقط، لا إداريون، ولا نفسه، ولا نطاقًا خارج فرعه
    if v_type <> 'teacher' then raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية في فرعه' using errcode = '42501';  end if;
    if v_scope ->> 'branch_id' is null or not app.has_cap('employees', 2, (v_scope ->> 'branch_id')::smallint) then raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية في فرعه' using errcode = '42501';  end if;
    if p_id is not null and (p_id = app.my_employee_id() or not app.emp_cap('employees', 2, p_id, true)) then raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية في فرعه' using errcode = '42501';  end if;
  end if;
  if v_name is null then raise exception 'الاسم بالعربي مطلوب'; end if;
  if v_type not in ('admin', 'teacher') then raise exception 'نوع المستخدم غير معروف: %', v_type; end if;
  v_role := v_type::public.app_role;
  -- لا يغيّر أحد نوع حسابه هو بنفسه (يمنع أن يُنزل الإداري نفسه إلى معلم بتعديل سجله)
  if p_id is not null and exists (
       select 1 from public.profiles pr where pr.employee_id = p_id and pr.id = auth.uid() and pr.role <> v_role) then
    raise exception 'لا يمكنك تغيير نوع حسابك بنفسك. اطلب ذلك من إداري آخر';
  end if;
  if v_nid is not null and exists (
       select 1 from public.employees e where e.national_id = v_nid and e.id is distinct from p_id) then
    raise exception 'رقم الهوية % مسجّل لموظف آخر', v_nid;
  end if;
  if v_type = 'teacher' and (
       jsonb_array_length(coalesce(v_scope -> 'grade_ids', '[]')) = 0
    or jsonb_array_length(coalesce(v_scope -> 'section_ids', '[]')) = 0
    or jsonb_array_length(coalesce(v_scope -> 'subject_ids', '[]')) = 0
    or v_scope ->> 'branch_id' is null) then
    raise exception 'يجب اختيار الفرع وصف وشعبة ومادة واحدة على الأقل';
  end if;

  if p_id is null then
    perform pg_advisory_xact_lock(hashtext('mirqat:employee_code'));
    v_code := app.next_code('employees', 'E', 3);
    insert into public.employees (code, national_id, name_ar, name_en, user_type, job_role, gender)
    values (v_code, v_nid, v_name, app.nz(p, 'name_en'), v_type, app.nz(p, 'job_role'), app.nz(p, 'gender'))
    returning employees.id into v_id;
  else
    update public.employees e set
      national_id = v_nid, name_ar = v_name, name_en = app.nz(p, 'name_en'), user_type = v_type,
      job_role = app.nz(p, 'job_role'), gender = app.nz(p, 'gender'),
      is_active = coalesce((p ->> 'is_active')::boolean, e.is_active), is_edited = true
    where e.id = p_id
    returning e.id, e.code into v_id, v_code;
    if v_id is null then raise exception 'الموظف غير موجود'; end if;
  end if;

  -- النطاق يُستبدل كاملًا (الإداري يرى كل شيء فلا يحتاج نطاقًا)
  delete from public.staff_scope where employee_id = v_id;
  if v_type = 'teacher' then
    insert into public.staff_scope (employee_id, branch_id) values (v_id, (v_scope ->> 'branch_id')::smallint);
    if v_scope ->> 'stage_id' is not null then
      insert into public.staff_scope (employee_id, stage_id) values (v_id, (v_scope ->> 'stage_id')::smallint);
    end if;
    insert into public.staff_scope (employee_id, grade_id)
      select v_id, x::smallint from jsonb_array_elements_text(v_scope -> 'grade_ids') x;
    insert into public.staff_scope (employee_id, section_id)
      select v_id, x::smallint from jsonb_array_elements_text(v_scope -> 'section_ids') x;
    insert into public.staff_scope (employee_id, subject_id)
      select v_id, x::smallint from jsonb_array_elements_text(v_scope -> 'subject_ids') x;
  end if;

  -- إن كان له حساب، يتبع دوره نوعه (والخادم يحدّث الجلسة بالمعرّف المُعاد)
  update public.profiles pr set role = v_role where pr.employee_id = v_id and pr.role <> v_role
  returning pr.id into v_user;
  if v_user is null then
    select pr.id into v_user from public.profiles pr where pr.employee_id = v_id;
  end if;
  return query select v_id, v_code, v_user, v_role;
end $function$;

do $$ begin raise notice '✅ هجرة 38: الموظفون وحسابات الموظفين والطلاب بنطاق الفرع'; end $$;
