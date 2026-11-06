-- =====================================================================
-- مِرقاة — 36: مناصب الفروع (الدفعة 2أ من نظام الأدوار والصلاحيات)
--
-- المناصب: مدير/ة فرع، وكيل/ة فرع، مشرف/ة معلمات، مشرف/ة طلاب، مسؤول/ة القبول والتسجيل.
-- كل منصب مرتبط بفرع، وله «قدرات» على مجالات (طلاب، حسابات الطلاب، تحضير، سلوك، …) بمستوى:
--   1 عرض | 2 تعديل | 3 كامل (إنشاء وحذف واستيراد).
-- نوع الحساب يبقى معلمًا (أو إداريًا)، والمنصب طبقة فوقه يمنحها الإداري. الإداري يملك كل شيء دائمًا.
--
-- هذه الهجرة تفرض المنصب في القاعدة على: تسجيل الطلاب واستيرادهم وحذفهم، والتحضير، والسلوك.
-- (النتائج والشهادات والتقارير والموظفون ومتابعة المعلمين في الدفعة 2ب.)
-- لا تغيّر أي بيانات حالية، ولا تمنح أحدًا منصبًا. آمنة لإعادة التشغيل لما بعد الجداول.
-- =====================================================================

create table public.cap_areas (
  area    text primary key,
  name_ar text not null,
  sort    smallint not null
);
create table public.positions (
  code     text primary key,
  name_ar  text not null,
  name_f   text not null,
  sort     smallint not null
);
create table public.position_caps (
  position text not null references public.positions(code) on delete cascade,
  area     text not null references public.cap_areas(area) on delete cascade,
  level    smallint not null check (level between 1 and 3),
  primary key (position, area)
);
create table public.employee_positions (
  employee_id bigint   not null references public.employees(id) on delete cascade,
  position    text     not null references public.positions(code) on delete cascade,
  branch_id   smallint not null references public.branches(id) on delete cascade,
  assigned_by uuid,
  assigned_at timestamptz not null default now(),
  primary key (employee_id, position, branch_id)
);
create index employee_positions_branch_idx on public.employee_positions (branch_id, position);

comment on table public.positions is 'مناصب الفروع — تُضاف بالهجرات وحدها';
comment on table public.position_caps is 'قدرات كل منصب على كل مجال: 1 عرض، 2 تعديل، 3 كامل';
comment on table public.employee_positions is 'من يشغل أي منصب في أي فرع — يمنحه الإداري وحده';

alter table public.cap_areas enable row level security;
alter table public.positions enable row level security;
alter table public.position_caps enable row level security;
alter table public.employee_positions enable row level security;
revoke all on public.cap_areas, public.positions, public.position_caps, public.employee_positions from anon, authenticated;
grant select on public.cap_areas, public.positions, public.position_caps, public.employee_positions to authenticated;
create policy cap_areas_read on public.cap_areas for select to authenticated using ((select app.my_role()) is not null);
create policy positions_read on public.positions for select to authenticated using ((select app.my_role()) is not null);
create policy position_caps_read on public.position_caps for select to authenticated using ((select app.my_role()) is not null);
create policy employee_positions_read on public.employee_positions for select to authenticated
  using ((select app.is_admin()) or employee_id = (select app.my_employee_id()));
create trigger employee_positions_audit after insert or update or delete on public.employee_positions
  for each row execute function app.audit_row();

insert into public.cap_areas (area, name_ar, sort) values
  ('students', 'تسجيل الطلاب', 1), ('student_accounts', 'حسابات الطلاب', 2), ('employees', 'تسجيل الموظفين', 3),
  ('employee_accounts', 'حسابات الموظفين', 4), ('schedule', 'الجداول والتقويم والاختبارات', 5), ('attendance', 'التحضير والغياب', 6),
  ('behavior', 'السلوك', 7), ('tasks', 'المهام والنماذج والمحتوى', 8), ('grading', 'الرصد والتصحيح', 9),
  ('results', 'الكشوف والنتائج', 10), ('certificates', 'شهادات الشكر', 11), ('reports', 'التقارير', 12);

insert into public.positions (code, name_ar, name_f, sort) values
  ('branch_manager',      'مدير الفرع',                'مديرة الفرع',                1),
  ('deputy',              'وكيل الفرع',                'وكيلة الفرع',                2),
  ('teachers_supervisor', 'مشرف المعلمات',             'مشرفة المعلمات',             3),
  ('students_supervisor', 'مشرف الطلاب',               'مشرفة الطلاب',               4),
  ('admissions',          'مسؤول القبول والتسجيل',     'مسؤولة القبول والتسجيل',     5);

-- القدرات حسب الجدول المعتمد (1 عرض، 2 تعديل، 3 كامل)
insert into public.position_caps (position, area, level) values
  ('branch_manager','students',3), ('branch_manager','student_accounts',3), ('branch_manager','employees',2), ('branch_manager','employee_accounts',2),
  ('branch_manager','schedule',2), ('branch_manager','attendance',2), ('branch_manager','behavior',2), ('branch_manager','tasks',1),
  ('branch_manager','grading',1), ('branch_manager','results',2), ('branch_manager','certificates',2), ('branch_manager','reports',1),
  ('deputy','students',2), ('deputy','student_accounts',1), ('deputy','employees',1), ('deputy','schedule',2), ('deputy','attendance',2),
  ('deputy','behavior',2), ('deputy','tasks',1), ('deputy','results',1), ('deputy','certificates',2), ('deputy','reports',1),
  ('teachers_supervisor','employees',1), ('teachers_supervisor','schedule',1), ('teachers_supervisor','attendance',1), ('teachers_supervisor','behavior',1),
  ('teachers_supervisor','tasks',1), ('teachers_supervisor','grading',1), ('teachers_supervisor','results',1), ('teachers_supervisor','reports',1),
  ('students_supervisor','students',2), ('students_supervisor','student_accounts',2), ('students_supervisor','schedule',1), ('students_supervisor','attendance',2),
  ('students_supervisor','behavior',2), ('students_supervisor','results',1), ('students_supervisor','certificates',2), ('students_supervisor','reports',1),
  ('admissions','students',3), ('admissions','student_accounts',3);

-- ---------------------------------------------------------------------
-- الفحص: مستوى قدرتي على مجال في فرع (الإداري 3 دائمًا). حساب غير نشط أو بلا سجل = 0
-- ---------------------------------------------------------------------
create or replace function app.class_branch(p_class_id integer) returns smallint
language sql stable security definer set search_path = '' as $$
  select c.branch_id from public.classes c where c.id = p_class_id
$$;
create or replace function app.student_branch(p_student_id bigint) returns smallint
language sql stable security definer set search_path = '' as $$
  select c.branch_id from public.students s join public.classes c on c.id = s.class_id where s.id = p_student_id
$$;

create or replace function app.cap_level(p_area text, p_branch smallint) returns smallint
language sql stable security definer set search_path = '' as $$
  select case
    when app.is_admin() then 3::smallint
    when p_branch is null then 0::smallint
    else coalesce((
      select max(c.level)
        from public.employee_positions ep
        join public.position_caps c on c.position = ep.position and c.area = p_area
       where ep.employee_id = app.my_employee_id() and ep.branch_id = p_branch), 0)::smallint
  end
$$;

create or replace function app.has_cap(p_area text, p_min integer, p_branch smallint) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.cap_level(p_area, p_branch) >= p_min
$$;

-- هل أملك المستوى في فرع ما (أي فرع)؟ — لبوابات الدخول للقوائم
create or replace function app.cap_any(p_area text, p_min integer) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_admin() or exists (
    select 1 from public.employee_positions ep
      join public.position_caps c on c.position = ep.position and c.area = p_area and c.level >= p_min
     where ep.employee_id = app.my_employee_id() and app.my_role() is not null)
$$;

create or replace function app.require_cap(p_area text, p_min integer, p_branch smallint) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(app.has_cap(p_area, p_min, p_branch), false) then
    raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية في فرعه' using errcode = '42501';
  end if;
end $$;
create or replace function app.require_cap_any(p_area text, p_min integer) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(app.cap_any(p_area, p_min), false) then
    raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية' using errcode = '42501';
  end if;
end $$;

revoke all on function app.class_branch(integer), app.student_branch(bigint), app.cap_level(text, smallint),
  app.has_cap(text, integer, smallint), app.cap_any(text, integer),
  app.require_cap(text, integer, smallint), app.require_cap_any(text, integer) from public, anon;
grant execute on function app.class_branch(integer), app.student_branch(bigint), app.cap_level(text, smallint),
  app.has_cap(text, integer, smallint), app.cap_any(text, integer),
  app.require_cap(text, integer, smallint), app.require_cap_any(text, integer) to authenticated;

-- ما أملكه: مناصبي ومستوى كل مجال وفروعه (لواجهة الموقع — إخفاء فقط، والحماية الحقيقية في الدوال والسياسات)
create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'admin', app.is_admin(),
    'positions', coalesce((
      select jsonb_agg(jsonb_build_object('position', ep.position, 'name', pz.name_ar, 'branch_id', ep.branch_id) order by pz.sort, ep.branch_id)
        from public.employee_positions ep join public.positions pz on pz.code = ep.position
       where ep.employee_id = app.my_employee_id() and app.my_role() is not null), '[]'::jsonb),
    'areas', coalesce((
      select jsonb_object_agg(a.area, jsonb_build_object('level', a.level, 'branches', a.branches))
        from (select c.area, max(c.level) as level, jsonb_agg(distinct ep.branch_id) as branches
                from public.employee_positions ep join public.position_caps c on c.position = ep.position
               where ep.employee_id = app.my_employee_id() and app.my_role() is not null
               group by c.area) a), '{}'::jsonb))
$$;
revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

-- إسناد منصب أو سحبه: للإداري وحده. المنصب لموظف نشط غير إداري، في فرع موجود
create or replace function public.admin_set_position(p_employee_id bigint, p_position text, p_branch smallint, p_on boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_type text; v_active boolean;
begin
  perform app.require_admin();
  if not exists (select 1 from public.positions where code = p_position) then raise exception 'منصب غير معروف'; end if;
  if not exists (select 1 from public.branches where id = p_branch) then raise exception 'الفرع غير موجود'; end if;
  select user_type, is_active into v_type, v_active from public.employees where id = p_employee_id;
  if not found then raise exception 'الموظف غير موجود'; end if;
  if v_type = 'admin' then raise exception 'الإداري يملك كل الصلاحيات ولا يُسند له منصب'; end if;
  if p_on then
    if not v_active then raise exception 'لا يُسند منصب لموظف غير نشط'; end if;
    insert into public.employee_positions (employee_id, position, branch_id, assigned_by)
    values (p_employee_id, p_position, p_branch, auth.uid()) on conflict do nothing;
  else
    delete from public.employee_positions where employee_id = p_employee_id and position = p_position and branch_id = p_branch;
  end if;
end $$;
revoke all on function public.admin_set_position(bigint, text, smallint, boolean) from public, anon;
grant execute on function public.admin_set_position(bigint, text, smallint, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- القراءة (RLS): صاحب المنصب يرى طلاب فرعه وتحضيرهم وسلوكهم بحسب مستوى مجاله
-- ---------------------------------------------------------------------
drop policy if exists students_read on public.students;
create policy students_read on public.students for select to authenticated
  using ((select app.is_admin())
         or id = (select app.my_student_id())
         or app.staff_can_access(class_id, null::smallint)
         or app.has_cap('students', 1, app.class_branch(class_id)));

drop policy if exists attendance_read on public.attendance_records;
create policy attendance_read on public.attendance_records for select to authenticated
  using ((select app.is_admin())
         or student_id = (select app.my_student_id())
         or ((select app.is_staff()) and app.staff_can_access_student(student_id))
         or app.has_cap('attendance', 1, app.student_branch(student_id)));

drop policy if exists behavior_read on public.behavior_records;
create policy behavior_read on public.behavior_records for select to authenticated
  using ((select app.is_admin())
         or student_id = (select app.my_student_id())
         or ((select app.is_staff()) and app.staff_can_access_student(student_id))
         or app.has_cap('behavior', 1, app.student_branch(student_id)));

-- ---------------------------------------------------------------------
-- الدوال المحمية: نفس نصوصها الحالية مع فحص المنصب والفرع بدل «إداري فقط»
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_student(p_id bigint, p jsonb)
 RETURNS TABLE(id bigint, code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_class integer;
  v_id    bigint;
  v_code  text;
  v_name  text := app.nz(p, 'name_ar');
  v_nid   text := app.nz(p, 'national_id');
  v_birth date;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية' using errcode = '42501'; end if;
  perform app.require_cap('students', case when p_id is null then 3 else 2 end, (p ->> 'branch_id')::smallint);
  if p_id is not null then perform app.require_cap('students', 2, app.student_branch(p_id)); end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.delete_student(p_id bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية' using errcode = '42501'; end if;
  perform app.require_cap('students', 3, app.student_branch(p_id));
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
end $function$;

CREATE OR REPLACE FUNCTION public.import_students(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r        jsonb;
  v_id     bigint;
  v_code   text;
  v_nid    text;
  v_class  integer;
  v_birth  date;
  v_btext  text;
  v_new    int := 0;
  v_upd    int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_i      int := 0;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية' using errcode = '42501'; end if;
  perform app.require_cap_any('students', 3);
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'بيانات غير صالحة'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'الحد 5000 طالب في المرة'; end if;
  perform pg_advisory_xact_lock(hashtext('mirqat:student_code'));

  for r in select * from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1;
    begin
      v_code := app.nz(r, 'code');
      -- غير الإداري: كل صف ضمن فروعه فقط (قبل أن ينشئ الفصل)
      perform app.require_cap('students', 3, (r ->> 'branch_id')::smallint);
      v_nid  := app.nz(r, 'national_id');
      v_class := case when app.nz(r, 'section_id') is not null
                      then app.class_for((r ->> 'branch_id')::smallint, (r ->> 'grade_id')::smallint, (r ->> 'section_id')::smallint) end;
      v_birth := null; v_btext := app.nz(r, 'birth_date');
      if v_btext ~ '^\d{4}-\d{2}-\d{2}$' then
        begin v_birth := v_btext::date; v_btext := null; exception when others then v_birth := null; end;
      end if;

      select s.id into v_id from public.students s where v_code is not null and s.code = v_code;
      if v_id is not null then perform app.require_cap('students', 3, app.student_branch(v_id)); end if;
      if v_nid is not null and exists (select 1 from public.students s where s.national_id = v_nid and s.id is distinct from v_id) then
        raise exception 'رقم الهوية % مسجّل لطالب آخر', v_nid;
      end if;

      if v_id is null then
        if v_code is null then v_code := app.next_code('students', 'S', 4); end if;
        insert into public.students (code, national_id, name_ar, name_en, nationality, birth_date, birth_date_text, gender, class_id, fee_status, enrolled_at)
        values (v_code, v_nid, app.nz(r, 'name_ar'), app.nz(r, 'name_en'), app.nz(r, 'nationality'), v_birth, v_btext,
                app.nz(r, 'gender'), v_class, app.nz(r, 'fee_status'), now());
        v_new := v_new + 1;
      else
        update public.students s set
          name_ar = coalesce(app.nz(r, 'name_ar'), s.name_ar),
          name_en = coalesce(app.nz(r, 'name_en'), s.name_en),
          nationality = coalesce(app.nz(r, 'nationality'), s.nationality),
          national_id = coalesce(v_nid, s.national_id),
          birth_date = coalesce(v_birth, s.birth_date),
          birth_date_text = case when v_birth is not null then null else coalesce(v_btext, s.birth_date_text) end,
          gender = coalesce(app.nz(r, 'gender'), s.gender),
          fee_status = coalesce(app.nz(r, 'fee_status'), s.fee_status),
          class_id = coalesce(v_class, s.class_id),
          status = 'active',
          is_edited = true
        where s.id = v_id;
        v_upd := v_upd + 1;
      end if;
    exception when others then
      v_errors := v_errors || jsonb_build_object('i', v_i, 'code', v_code, 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('created', v_new, 'updated', v_upd, 'errors', v_errors);
end $function$;

CREATE OR REPLACE FUNCTION public.save_attendance(p jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_class   integer := (p ->> 'class_id')::int;
  v_subject smallint := nullif(p ->> 'subject_id', '')::smallint;
  v_period  smallint := (p ->> 'period_no')::smallint;
  v_date    date := coalesce(nullif(p ->> 'date', '')::date, (now() at time zone 'Asia/Riyadh')::date);
  v_today   date := (now() at time zone 'Asia/Riyadh')::date;
  v_admin   boolean := app.has_cap('attendance', 2, app.class_branch(v_class));
  v_emp     bigint := app.my_employee_id();
  d         record;
  r         jsonb;
  v_sid     bigint;
  v_status  smallint;
  v_old     public.attendance_records;
  v_n       integer := 0;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية' using errcode = '42501'; end if;
  if v_class is null or v_period is null or v_period not between 1 and 12 then raise exception 'اختر الفصل والحصة'; end if;
  if not v_admin and not app.staff_can_access(v_class, v_subject) then
    raise exception 'هذا الفصل أو هذه المادة خارج نطاق صلاحياتك' using errcode = '42501';
  end if;
  if v_date > v_today then raise exception 'لا تحضير ليوم لم يأتِ بعد'; end if;
  -- المعلم: اليوم وحتى 3 أيام سابقة (لمن نسي)، والإداري أي يوم
  if not v_admin and v_date < v_today - 3 then raise exception 'تحضير يوم مضى عليه أكثر من 3 أيام من الإدارة فقط'; end if;
  select * into d from app.school_day(v_date);
  if jsonb_typeof(p -> 'rows') <> 'array' or jsonb_array_length(p -> 'rows') = 0 then raise exception 'الكشف فارغ'; end if;
  if jsonb_array_length(p -> 'rows') > 200 then raise exception 'الكشف أكبر من المسموح'; end if;

  for r in select * from jsonb_array_elements(p -> 'rows') loop
    v_sid := (r ->> 'student_id')::bigint;
    v_status := (r ->> 'status_id')::smallint;
    if not exists (select 1 from public.students s where s.id = v_sid and s.class_id = v_class) then
      raise exception 'طالب ليس في هذا الفصل';
    end if;
    if not exists (select 1 from public.attendance_statuses where id = v_status) then raise exception 'حالة تحضير غير معروفة'; end if;
    if char_length(coalesce(r ->> 'note', '')) > 300 then raise exception 'الملاحظة طويلة'; end if;

    select * into v_old from public.attendance_records a
     where a.student_id = v_sid and a.week_id = d.week_id and a.day_of_week = d.day_of_week
       and a.period_no = v_period and a.subject_id is not distinct from v_subject;
    if v_old.id is null then
      insert into public.attendance_records (student_id, week_id, day_of_week, period_no, subject_id, status_id, note,
                                             recorded_by, recorder_type, class_id, occurred_on)
      values (v_sid, d.week_id, d.day_of_week, v_period, v_subject, v_status, nullif(btrim(coalesce(r ->> 'note', '')), ''),
              v_emp, case when v_admin then 'admin' else 'teacher' end, v_class, v_date);
      v_n := v_n + 1;
    elsif v_old.status_id <> v_status or v_old.note is distinct from nullif(btrim(coalesce(r ->> 'note', '')), '') then
      if not v_admin and (v_old.recorded_by is distinct from v_emp or v_old.recorded_at < now() - interval '3 days') then
        raise exception 'لا يمكنك تعديل تحضير سجّله غيرك أو مضى عليه أكثر من 3 أيام';
      end if;
      update public.attendance_records
         set status_id = v_status, note = nullif(btrim(coalesce(r ->> 'note', '')), ''), class_id = v_class, occurred_on = v_date
       where id = v_old.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $function$;

CREATE OR REPLACE FUNCTION public.delete_attendance_session(p_class_id integer, p_date date, p_period smallint, p_subject_id smallint)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_n integer;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية' using errcode = '42501'; end if;
  if not app.has_cap('attendance', 2, app.class_branch(p_class_id)) and exists (
       select 1 from public.attendance_records a
        where a.class_id = p_class_id and a.occurred_on = p_date and a.period_no = p_period and a.subject_id is not distinct from p_subject_id
          and (a.recorded_by is distinct from app.my_employee_id() or a.recorded_at < now() - interval '6 hours')) then
    raise exception 'حذف التحضير متاح لمن سجّله خلال 6 ساعات فقط — اطلب الحذف من الإدارة';
  end if;
  delete from public.attendance_records a
   where a.class_id = p_class_id and a.occurred_on = p_date and a.period_no = p_period and a.subject_id is not distinct from p_subject_id;
  get diagnostics v_n = row_count;
  return v_n;
end $function$;

CREATE OR REPLACE FUNCTION public.attendance_sessions(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_page  integer := greatest(1, coalesce((p ->> 'page')::int, 1));
  v_size  integer := least(50, greatest(5, coalesce((p ->> 'size')::int, 15)));
  v_class integer := nullif(p ->> 'class_id', '')::int;
  v_from  date := nullif(p ->> 'from', '')::date;
  v_mine  boolean := coalesce((p ->> 'mine')::boolean, false);
  result  jsonb;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية' using errcode = '42501'; end if;
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
       and ((select app.is_admin()) or app.has_cap('attendance', 1, app.class_branch(a.class_id)) or a.student_id in (select s.id from public.students s where app.staff_can_access(s.class_id, null)))
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
end $function$;

CREATE OR REPLACE FUNCTION public.save_behavior(p_id bigint, p jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin  boolean := app.is_admin();
  v_emp    bigint := app.my_employee_id();
  v_sid    bigint := (p ->> 'student_id')::bigint;
  v_status smallint := (p ->> 'status_id')::smallint;
  v_score  numeric := coalesce(nullif(p ->> 'score', '')::numeric, 0);
  v_date   date := coalesce(nullif(p ->> 'date', '')::date, (now() at time zone 'Asia/Riyadh')::date);
  v_today  date := (now() at time zone 'Asia/Riyadh')::date;
  v_old    public.behavior_records;
  v_week   integer;
  v_term   smallint;
  v_id     bigint;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية' using errcode = '42501'; end if;
  v_admin := app.has_cap('behavior', 2, app.student_branch(v_sid));
  if not exists (select 1 from public.behavior_statuses where id = v_status) then raise exception 'اختر حالة السلوك'; end if;
  if v_score < 0 or v_score > 100 then raise exception 'الدرجة بين 0 و 100'; end if;
  if char_length(coalesce(p ->> 'note', '')) > 1000 then raise exception 'الملاحظة طويلة'; end if;
  if v_date > v_today then raise exception 'لا يمكن تسجيل سلوك بتاريخ قادم'; end if;
  if not v_admin and v_date < v_today - 14 then raise exception 'تسجيل سلوك أقدم من أسبوعين من الإدارة فقط'; end if;
  if not v_admin and not app.staff_can_access_student(v_sid) then
    raise exception 'الطالب خارج نطاق صلاحياتك' using errcode = '42501';
  end if;
  if not exists (select 1 from public.students where id = v_sid) then raise exception 'الطالب غير موجود'; end if;

  select w.week_id, w.term_id into v_week, v_term from public.school_weeks w
   where v_date between w.starts_on and w.ends_on order by w.starts_on desc limit 1;
  if v_term is null then
    select c.term_id into v_term from public.calendar_entries c where v_date between c.starts_on and c.ends_on limit 1;
  end if;

  if p_id is null then
    insert into public.behavior_records (student_id, term_id, week_id, day_of_week, status_id, score, note, recorded_by, recorder_type,
                                         occurred_on, subject_id)
    values (v_sid, v_term, v_week, least(4, extract(dow from v_date)::int), v_status, round(v_score, 2),
            nullif(btrim(coalesce(p ->> 'note', '')), ''), v_emp, case when v_admin then 'admin' else 'teacher' end,
            v_date, nullif(p ->> 'subject_id', '')::smallint)
    returning id into v_id;
    return v_id;
  end if;

  select * into v_old from public.behavior_records where id = p_id;
  if v_old.id is null then raise exception 'السجل غير موجود'; end if;
  -- السجل القديم أيضًا يجب أن يكون في فرع يملك فيه التعديل (لا نقل سجل من فرع آخر)
  if v_admin and not app.has_cap('behavior', 2, app.student_branch(v_old.student_id)) then
    raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية' using errcode = '42501';
  end if;
  if not v_admin and (v_old.recorded_by is distinct from v_emp or v_old.recorded_at < now() - interval '3 days') then
    raise exception 'تعديل سجل سلوك متاح لمن سجّله خلال 3 أيام فقط';
  end if;
  update public.behavior_records
     set student_id = v_sid, term_id = v_term, week_id = v_week, day_of_week = least(4, extract(dow from v_date)::int),
         status_id = v_status, score = round(v_score, 2), note = nullif(btrim(coalesce(p ->> 'note', '')), ''),
         occurred_on = v_date, subject_id = nullif(p ->> 'subject_id', '')::smallint, is_edited = true
   where id = p_id;
  return p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.delete_behavior(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_old public.behavior_records;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية' using errcode = '42501'; end if;
  select * into v_old from public.behavior_records where id = p_id;
  if v_old.id is null then return; end if;
  if not app.has_cap('behavior', 2, app.student_branch(v_old.student_id)) and (v_old.recorded_by is distinct from app.my_employee_id() or v_old.recorded_at < now() - interval '6 hours') then
    raise exception 'الحذف متاح لمن سجّله خلال 6 ساعات فقط — اطلبه من الإدارة';
  end if;
  delete from public.behavior_records where id = p_id;
end $function$;
