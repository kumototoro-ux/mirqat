-- =====================================================================
-- هجرة 43: تشديد حذف التحضير والسلوك على نطاق المستخدم الحالي
-- فحص الأمان 2: الحذف كان يعتمد على «من سجّل خلال 6 ساعات» دون التحقق من أن
-- الفصل/الطالب ما زال داخل نطاق صلاحيات المستخدم (مثلًا بعد سحب نطاقه).
-- =====================================================================

create or replace function public.delete_attendance_session(p_class_id integer, p_date date, p_period smallint, p_subject_id smallint)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية' using errcode = '42501'; end if;
  if not app.has_cap('attendance', 2, app.class_branch(p_class_id)) then
    if not app.staff_can_access(p_class_id, p_subject_id) then
      raise exception 'هذا الفصل أو هذه المادة خارج نطاق صلاحياتك' using errcode = '42501';
    end if;
    if exists (
         select 1 from public.attendance_records a
          where a.class_id = p_class_id and a.occurred_on = p_date and a.period_no = p_period and a.subject_id is not distinct from p_subject_id
            and (a.recorded_by is distinct from app.my_employee_id() or a.recorded_at < now() - interval '6 hours')) then
      raise exception 'حذف التحضير متاح لمن سجّله خلال 6 ساعات فقط — اطلب الحذف من الإدارة';
    end if;
  end if;
  delete from public.attendance_records a
   where a.class_id = p_class_id and a.occurred_on = p_date and a.period_no = p_period and a.subject_id is not distinct from p_subject_id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.delete_behavior(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old public.behavior_records;
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية' using errcode = '42501'; end if;
  select * into v_old from public.behavior_records where id = p_id;
  if v_old.id is null then return; end if;
  if not app.has_cap('behavior', 2, app.student_branch(v_old.student_id)) then
    if not app.staff_can_access_student(v_old.student_id) then
      raise exception 'الطالب خارج نطاق صلاحياتك' using errcode = '42501';
    end if;
    if v_old.recorded_by is distinct from app.my_employee_id() or v_old.recorded_at < now() - interval '6 hours' then
      raise exception 'الحذف متاح لمن سجّله خلال 6 ساعات فقط — اطلبه من الإدارة';
    end if;
  end if;
  delete from public.behavior_records where id = p_id;
end $$;

revoke all on function public.delete_attendance_session(integer, date, smallint, smallint), public.delete_behavior(bigint) from public, anon;
grant execute on function public.delete_attendance_session(integer, date, smallint, smallint), public.delete_behavior(bigint) to authenticated;
