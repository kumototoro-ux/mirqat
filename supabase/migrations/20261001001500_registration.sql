-- =====================================================================
-- مِرقاة — 15: تسجيل الطلاب والموظفين (إداري فقط)
--
-- كل عملية دالة واحدة ذرية: تتحقق، وتولّد الرمز تحت قفل (لا يأخذ إداريان نفس الرقم
-- لو سجّلا في نفس اللحظة — نفس withLock_ في النظام القديم)، وتكتب، ويسجّلها التدقيق تلقائيًا.
-- تُستدعى بجلسة الإداري نفسه (لا بالمفتاح السري)، وتتحقق من دوره داخلها.
-- =====================================================================

-- ---------------------------------------------------------------------
-- الرمز التالي: نفس generateIdFromPositional_ القديمة — أعلى رقم بعد البادئة + 1
--   الطلاب S + 4 خانات على الأقل، الموظفون E + 3
--   (الرموز ذات الأحرف الأخرى مثل SE014 أو FA003 لا تدخل في الحساب، كالقديم)
-- ---------------------------------------------------------------------
create or replace function app.next_code(p_table text, p_prefix text, p_pad int)
returns text language plpgsql security definer set search_path = '' as $$
declare v_max bigint;
begin
  execute format(
    'select coalesce(max(substring(code from %L)::bigint), 0) from public.%I where code ~ %L',
    '^' || p_prefix || '(\d+)$', p_table, '^' || p_prefix || '\d+$'
  ) into v_max;
  -- lpad يقصّ النص الأطول من الطول المطلوب، فلا يُستخدم إلا للأقصر
  return p_prefix || lpad((v_max + 1)::text, greatest(p_pad, length((v_max + 1)::text)), '0');
end $$;
revoke all on function app.next_code(text, text, int) from public, anon, authenticated;

-- الفصل لتركيبة (فرع، صف، شعبة): يُنشأ إن لم يوجد — كالنظام القديم الذي يقبل أي تركيبة
create or replace function app.class_for(p_branch smallint, p_grade smallint, p_section smallint)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_id integer;
begin
  if p_branch is null or p_grade is null or p_section is null then
    raise exception 'اختر الفرع والصف والشعبة';
  end if;
  select id into v_id from public.classes where branch_id = p_branch and grade_id = p_grade and section_id = p_section;
  if v_id is null then
    insert into public.classes (branch_id, grade_id, section_id) values (p_branch, p_grade, p_section)
    on conflict (branch_id, grade_id, section_id) do update set is_active = true
    returning id into v_id;
  end if;
  return v_id;
end $$;
revoke all on function app.class_for(smallint, smallint, smallint) from public, anon, authenticated;

create or replace function app.require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(app.is_admin(), false) then
    raise exception 'هذه العملية للإدارة فقط' using errcode = '42501';
  end if;
end $$;
revoke all on function app.require_admin() from public, anon;
grant execute on function app.require_admin() to authenticated;

-- نص فارغ = null
create or replace function app.nz(p jsonb, k text) returns text
language sql immutable set search_path = '' as $$ select nullif(btrim(p ->> k), '') $$;

-- =====================================================================
-- الطلاب
-- =====================================================================
create or replace function public.save_student(p_id bigint, p jsonb)
returns table (id bigint, code text)
language plpgsql security definer set search_path = '' as $$
declare
  v_class integer;
  v_id    bigint;
  v_code  text;
  v_name  text := app.nz(p, 'name_ar');
  v_nid   text := app.nz(p, 'national_id');
  v_birth date;
begin
  perform app.require_admin();
  if v_name is null then raise exception 'الاسم بالعربي مطلوب'; end if;
  if v_nid is not null and exists (
       select 1 from public.students s where s.national_id = v_nid and s.id is distinct from p_id) then
    raise exception 'رقم الهوية % مسجّل لطالب آخر', v_nid;
  end if;
  begin
    v_birth := app.nz(p, 'birth_date')::date;
  exception when others then
    raise exception 'تاريخ الميلاد غير صحيح';
  end;
  v_class := app.class_for((p ->> 'branch_id')::smallint, (p ->> 'grade_id')::smallint, (p ->> 'section_id')::smallint);

  if p_id is null then
    perform pg_advisory_xact_lock(hashtext('mirqat:student_code'));
    v_code := app.next_code('students', 'S', 4);
    insert into public.students (code, national_id, name_ar, name_en, nationality, birth_date, gender, class_id, fee_status, enrolled_at)
    values (v_code, v_nid, v_name, app.nz(p, 'name_en'), app.nz(p, 'nationality'), v_birth, app.nz(p, 'gender'),
            v_class, app.nz(p, 'fee_status'), now())
    returning students.id into v_id;
  else
    update public.students s set
      national_id = v_nid, name_ar = v_name, name_en = app.nz(p, 'name_en'), nationality = app.nz(p, 'nationality'),
      birth_date = case when p ? 'birth_date' then v_birth else s.birth_date end,  -- غياب الحقل لا يمسح التاريخ
      gender = app.nz(p, 'gender'), class_id = v_class, fee_status = app.nz(p, 'fee_status'),
      status = coalesce(app.nz(p, 'status')::public.student_status, s.status),
      is_edited = true
    where s.id = p_id
    returning s.id, s.code into v_id, v_code;
    if v_id is null then raise exception 'الطالب غير موجود'; end if;
  end if;
  return query select v_id, coalesce(v_code, (select s.code from public.students s where s.id = v_id));
end $$;

-- الحذف للطالب المسجّل خطأً فقط: من له سجلات دراسية يُغيَّر وضعه إلى "منسحب" بدل الحذف.
-- يعيد معرّف حساب الدخول المحذوف (إن وُجد) ليحذفه الخادم من Supabase Auth.
create or replace function public.delete_student(p_id bigint)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  perform app.require_admin();
  if exists (select 1 from public.grade_entries where student_id = p_id)
     or exists (select 1 from public.attendance_records where student_id = p_id)
     or exists (select 1 from public.behavior_records where student_id = p_id)
     or exists (select 1 from public.form_attempts where student_id = p_id) then
    raise exception 'للطالب درجات أو تحضير مسجّل، فلا يُحذف. غيّر حالته إلى "منسحب" بدلًا من الحذف';
  end if;
  delete from public.profiles where student_id = p_id returning profiles.id into v_user;
  delete from public.student_views where student_id = p_id;
  delete from public.student_enrollments where student_id = p_id;
  delete from public.students where id = p_id;
  if not found then raise exception 'الطالب غير موجود'; end if;
  return v_user;
end $$;

-- =====================================================================
-- الموظفون (مع نطاقهم: فرع، مرحلة، صفوف، شعب، مواد)
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

create or replace function public.delete_employee(p_id bigint)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  perform app.require_admin();
  if (select pr.id from public.profiles pr where pr.employee_id = p_id) = auth.uid() then
    raise exception 'لا يمكنك حذف سجلك بنفسك';
  end if;
  if exists (select 1 from public.assessments where teacher_id = p_id)
     or exists (select 1 from public.timetable_slots where teacher_id = p_id)
     or exists (select 1 from public.exam_schedule where teacher_id = p_id)
     or exists (select 1 from public.grade_entries where recorded_by = p_id)
     or exists (select 1 from public.attendance_records where recorded_by = p_id)
     or exists (select 1 from public.content_items where teacher_id = p_id) then
    raise exception 'للموظف حصص أو مهام أو رصد مسجّل باسمه، فلا يُحذف. أوقفه (غير نشط) بدلًا من الحذف';
  end if;
  delete from public.profiles where employee_id = p_id returning profiles.id into v_user;
  delete from public.employees where id = p_id;
  if not found then raise exception 'الموظف غير موجود'; end if;
  return v_user;
end $$;

-- ---------------------------------------------------------------------
-- الصلاحيات: يستدعيها الإداري بجلسته، وكل دالة تتحقق من دوره بنفسها
-- ---------------------------------------------------------------------
revoke all on function public.save_student(bigint, jsonb) from public, anon;
revoke all on function public.delete_student(bigint) from public, anon;
revoke all on function public.save_employee(bigint, jsonb) from public, anon;
revoke all on function public.delete_employee(bigint) from public, anon;
grant execute on function public.save_student(bigint, jsonb) to authenticated, service_role;
grant execute on function public.delete_student(bigint) to authenticated, service_role;
grant execute on function public.save_employee(bigint, jsonb) to authenticated, service_role;
grant execute on function public.delete_employee(bigint) to authenticated, service_role;

do $$
begin
  if has_function_privilege('anon', 'public.save_student(bigint, jsonb)', 'execute') then
    raise exception 'فحص 15: تسجيل الطلاب متاح للزائر';
  end if;
  raise notice '✅ هجرة 15: تسجيل الطلاب والموظفين جاهز';
end $$;
