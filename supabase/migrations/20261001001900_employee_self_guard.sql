-- =====================================================================
-- مِرقاة — 19: حماية الإداري من تغيير دوره بنفسه
--
-- تعديل سجل الموظف يزامن دور حسابه (معلم/إداري). لو فتح الإداري سجله هو وحُفظ النوع "معلم"
-- لصار حسابه معلمًا وفقد الإدارة. الآن يُرفض ذلك برسالة واضحة.
-- =====================================================================
create or replace function public.save_employee(p_id bigint, p jsonb)
returns table (id bigint, code text, user_id uuid, role public.app_role)
language plpgsql security definer set search_path = '' as $$
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
  perform app.require_admin();
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
end $$;

do $$ begin raise notice '✅ هجرة 19: الإداري لا يغيّر دوره بنفسه'; end $$;
