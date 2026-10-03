-- =====================================================================
-- مِرقاة — 08: الأمان (Row Level Security)
-- الدرس من ثغرة checkAccess_: الصلاحيات تُفرض داخل القاعدة نفسها، فلا يتجاوزها أي طلب
-- مباشر من المتصفح مهما كان. الواجهة تعرض فقط، والقاعدة تقرر.
--
-- القواعد:
--   الإداري  : كل شيء
--   المعلم   : نطاقه (staff_scope) — نفس منطق checkAccess_ حرفيًا
--   الطالب   : بياناته وصفه فقط، والكتابة الوحيدة: تسليم النموذج (عبر دالة) ورصد المشاهدة
--   anon     : لا شيء، عدا اسم المدرسة وشعارها عبر get_public_settings()
-- =====================================================================

-- ---------------------------------------------------------------------
-- دوال الهوية (security definer: تقرأ profiles دون أن تتأثر بـ RLS نفسها)
-- ---------------------------------------------------------------------
create or replace function app.my_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.status = 'active'
$$;

create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.my_role() = 'admin', false)
$$;

create or replace function app.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.my_role() in ('admin', 'teacher'), false)
$$;

create or replace function app.my_employee_id() returns bigint
language sql stable security definer set search_path = '' as $$
  select p.employee_id from public.profiles p where p.id = auth.uid() and p.status = 'active'
$$;

create or replace function app.my_student_id() returns bigint
language sql stable security definer set search_path = '' as $$
  select p.student_id from public.profiles p where p.id = auth.uid() and p.status = 'active'
$$;

create or replace function app.my_class_id() returns integer
language sql stable security definer set search_path = '' as $$
  select s.class_id
    from public.profiles p join public.students s on s.id = p.student_id
   where p.id = auth.uid() and p.status = 'active' and s.status = 'active'
$$;

-- ---------------------------------------------------------------------
-- نطاق الموظف — الرفض هو الأصل (deny by default):
--   المعلم يرى السجل فقط إذا كان مخوَّلًا صراحةً بفرعه وصفه وشعبته ومادته.
--   أي بُعد بلا صلاحية مسجّلة = لا يرى شيئًا فيه.
--   المرحلة: تُعرف من الصف نفسه، فلا تُشترط إلا إذا سُجّلت للمعلم مراحل صراحةً.
--   سجل بلا فصل يُفحص بالمادة فقط، وسجل بلا مادة (قائمة طلاب) يُفحص بالفصل فقط.
-- ---------------------------------------------------------------------
create or replace function app.staff_can_access(p_class_id integer, p_subject_id smallint)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_emp     bigint;
  v_branch  smallint;
  v_stage   smallint;
  v_grade   smallint;
  v_section smallint;
begin
  if app.is_admin() then return true; end if;
  if not app.is_staff() then return false; end if;
  v_emp := app.my_employee_id();
  if v_emp is null then return false; end if;
  if p_class_id is null and p_subject_id is null then return false; end if;

  if p_class_id is not null then
    select c.branch_id, g.stage_id, c.grade_id, c.section_id
      into v_branch, v_stage, v_grade, v_section
      from public.classes c join public.grades g on g.id = c.grade_id
     where c.id = p_class_id;
    if not found then return false; end if;

    if not exists (select 1 from public.staff_scope s where s.employee_id = v_emp and s.branch_id = v_branch)
    then return false; end if;

    if not exists (select 1 from public.staff_scope s where s.employee_id = v_emp and s.grade_id = v_grade)
    then return false; end if;

    if not exists (select 1 from public.staff_scope s where s.employee_id = v_emp and s.section_id = v_section)
    then return false; end if;

    if exists (select 1 from public.staff_scope s where s.employee_id = v_emp and s.stage_id is not null)
       and not exists (select 1 from public.staff_scope s where s.employee_id = v_emp and s.stage_id = v_stage)
    then return false; end if;
  end if;

  if p_subject_id is not null
     and not exists (select 1 from public.staff_scope s where s.employee_id = v_emp and s.subject_id = p_subject_id)
  then return false; end if;

  return true;
end $$;

create or replace function app.staff_can_access_student(p_student_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select app.staff_can_access(s.class_id, null) from public.students s where s.id = p_student_id), false)
$$;

-- من يملك تعديل تقييم: الإداري، أو المعلم صاحبه ضمن نطاقه
create or replace function app.can_edit_assessment(p_assessment_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select app.is_admin()
        or (a.teacher_id = app.my_employee_id() and app.staff_can_access(a.class_id, a.subject_id))
      from public.assessments a where a.id = p_assessment_id
  ), false)
$$;

-- هل يرى الطالب هذا التقييم: صفه، وليس نموذجًا في وضع المسودة
create or replace function app.student_sees_assessment(p_assessment_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select a.class_id = app.my_class_id()
       and (a.kind <> 'form' or exists (
             select 1 from public.form_details f
              where f.assessment_id = a.id and f.status in ('published', 'closed')))
      from public.assessments a where a.id = p_assessment_id
  ), false)
$$;

revoke all on function app.login_is_locked(citext) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- تفعيل RLS على كل جداول public، وسحب كل صلاحيات anon
-- ---------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('revoke all on public.%I from anon', t.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- الجداول المرجعية: يقرؤها أي حساب نشط، ويكتبها الإداري فقط
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'academic_years', 'terms', 'branches', 'stages', 'grades', 'sections', 'subjects',
    'classes', 'subject_matrix', 'eval_types', 'grade_weights',
    'attendance_statuses', 'behavior_statuses', 'app_settings',
    'calendar_entries', 'timetable_slots', 'exam_schedule'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select app.my_role()) is not null)',
                   t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select app.is_admin())) with check ((select app.is_admin()))',
                   t || '_admin_write', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- الأشخاص
-- ---------------------------------------------------------------------
create policy students_read on public.students for select to authenticated
  using ((select app.is_admin()) or id = (select app.my_student_id()) or app.staff_can_access(class_id, null));
create policy students_admin_write on public.students for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

create policy enrollments_read on public.student_enrollments for select to authenticated
  using ((select app.is_admin()) or student_id = (select app.my_student_id()));

create policy employees_read on public.employees for select to authenticated
  using ((select app.is_admin()) or id = (select app.my_employee_id()));
create policy employees_admin_write on public.employees for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

create policy staff_scope_read on public.staff_scope for select to authenticated
  using ((select app.is_admin()) or employee_id = (select app.my_employee_id()));
create policy staff_scope_admin_write on public.staff_scope for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

create policy profiles_read on public.profiles for select to authenticated
  using ((select app.is_admin()) or id = auth.uid());
create policy profiles_admin_write on public.profiles for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));
-- إنشاء الحسابات وتغيير كلمات المرور يتمان من الخادم (service_role) لأنها تحتاج Supabase Admin API

-- login_attempts: RLS مفعّلة بلا أي سياسة = لا يصلها إلا service_role

-- دليل أسماء المعلمين: الاسم فقط بلا أي بيانات شخصية — يحتاجه الطالب والمعلم لعرض "اسم المعلم"
create view public.staff_directory as
select e.id, e.code, e.name_ar from public.employees e where e.is_active;
revoke all on public.staff_directory from anon;
grant select on public.staff_directory to authenticated;

-- ---------------------------------------------------------------------
-- التقييمات والنماذج
-- ---------------------------------------------------------------------
create policy assessments_read on public.assessments for select to authenticated
  using ((select app.is_admin())
         or ((select app.is_staff()) and app.staff_can_access(class_id, subject_id))
         or app.student_sees_assessment(id));
create policy assessments_insert on public.assessments for insert to authenticated
  with check ((select app.is_admin())
              or (teacher_id = (select app.my_employee_id()) and app.staff_can_access(class_id, subject_id)));
create policy assessments_update on public.assessments for update to authenticated
  using (app.can_edit_assessment(id))
  with check ((select app.is_admin())
              or (teacher_id = (select app.my_employee_id()) and app.staff_can_access(class_id, subject_id)));
create policy assessments_delete on public.assessments for delete to authenticated
  using (app.can_edit_assessment(id));

create policy form_details_read on public.form_details for select to authenticated
  using (exists (select 1 from public.assessments a where a.id = assessment_id));
create policy form_details_write on public.form_details for all to authenticated
  using (app.can_edit_assessment(assessment_id)) with check (app.can_edit_assessment(assessment_id));

-- الأسئلة والخيارات: للموظفين فقط. الطالب يقرأ عبر get_form_for_student (بلا الإجابة الصحيحة)
create policy form_questions_staff_read on public.form_questions for select to authenticated
  using ((select app.is_staff()) and exists (select 1 from public.assessments a where a.id = assessment_id));
create policy form_questions_write on public.form_questions for all to authenticated
  using (app.can_edit_assessment(assessment_id)) with check (app.can_edit_assessment(assessment_id));

create policy question_options_staff_read on public.question_options for select to authenticated
  using ((select app.is_staff()) and exists (select 1 from public.form_questions q where q.id = question_id));
create policy question_options_write on public.question_options for all to authenticated
  using (exists (select 1 from public.form_questions q where q.id = question_id and app.can_edit_assessment(q.assessment_id)))
  with check (exists (select 1 from public.form_questions q where q.id = question_id and app.can_edit_assessment(q.assessment_id)));

-- المحاولات: الطالب يقرأ محاولاته، والإنشاء فقط عبر submit_form_attempt.
-- الحذف ("تصفير إجابة الطالب") لصاحب النموذج أو الإداري.
create policy form_attempts_read on public.form_attempts for select to authenticated
  using (student_id = (select app.my_student_id())
         or ((select app.is_staff()) and exists (select 1 from public.assessments a where a.id = assessment_id)));
create policy form_attempts_delete on public.form_attempts for delete to authenticated
  using (app.can_edit_assessment(assessment_id));

create policy attempt_answers_read on public.attempt_answers for select to authenticated
  using (exists (select 1 from public.form_attempts t where t.id = attempt_id));

-- ---------------------------------------------------------------------
-- الرصد — مهلة تعديل 3 أيام ومهلة حذف 6 ساعات للمعلم، بلا قيد للإداري
-- ---------------------------------------------------------------------
create policy grade_entries_read on public.grade_entries for select to authenticated
  using ((select app.is_admin())
         or ((select app.is_staff()) and exists (select 1 from public.assessments a where a.id = assessment_id))
         or (student_id = (select app.my_student_id())
             and not exists (select 1 from public.assessments a
                               join public.grade_visibility v
                                 on v.student_id = grade_entries.student_id
                                and v.subject_id = a.subject_id and v.term_id = a.term_id
                              where a.id = grade_entries.assessment_id and not v.is_visible)));
create policy grade_entries_insert on public.grade_entries for insert to authenticated
  with check ((select app.is_admin())
              or ((select app.is_staff())
                  and recorded_by = (select app.my_employee_id())
                  and exists (select 1 from public.assessments a where a.id = assessment_id)));
create policy grade_entries_update on public.grade_entries for update to authenticated
  using ((select app.is_admin())
         or (recorded_by = (select app.my_employee_id()) and recorded_at > now() - interval '3 days'))
  with check ((select app.is_admin())
              or (recorded_by = (select app.my_employee_id()) and recorded_at > now() - interval '3 days'));
create policy grade_entries_delete on public.grade_entries for delete to authenticated
  using ((select app.is_admin())
         or (recorded_by = (select app.my_employee_id()) and recorded_at > now() - interval '6 hours'));

create policy grade_visibility_read on public.grade_visibility for select to authenticated
  using ((select app.is_admin()) or student_id = (select app.my_student_id()));
create policy grade_visibility_admin_write on public.grade_visibility for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

-- ---------------------------------------------------------------------
-- المحتوى والمشاهدات وربط الحصص
-- ---------------------------------------------------------------------
create policy content_items_read on public.content_items for select to authenticated
  using ((select app.is_admin())
         or ((select app.is_staff()) and app.staff_can_access(class_id, subject_id))
         or class_id = (select app.my_class_id()));
create policy content_items_insert on public.content_items for insert to authenticated
  with check ((select app.is_admin())
              or (teacher_id = (select app.my_employee_id()) and app.staff_can_access(class_id, subject_id)));
create policy content_items_update on public.content_items for update to authenticated
  using ((select app.is_admin()) or teacher_id = (select app.my_employee_id()))
  with check ((select app.is_admin())
              or (teacher_id = (select app.my_employee_id()) and app.staff_can_access(class_id, subject_id)));
create policy content_items_delete on public.content_items for delete to authenticated
  using ((select app.is_admin()) or teacher_id = (select app.my_employee_id()));

create policy student_views_read on public.student_views for select to authenticated
  using (student_id = (select app.my_student_id())
         or ((select app.is_staff()) and app.staff_can_access_student(student_id)));
create policy student_views_insert on public.student_views for insert to authenticated
  with check (student_id = (select app.my_student_id())
              and (assessment_id is null or app.student_sees_assessment(assessment_id))
              and (content_item_id is null or exists (select 1 from public.content_items c where c.id = content_item_id)));

create policy period_links_read on public.period_links for select to authenticated
  using (exists (select 1 from public.timetable_slots s
                  where s.id = slot_id
                    and ((select app.is_admin())
                         or s.teacher_id = (select app.my_employee_id())
                         or s.class_id = (select app.my_class_id()))));
create policy period_links_write on public.period_links for all to authenticated
  using ((select app.is_admin())
         or exists (select 1 from public.timetable_slots s where s.id = slot_id and s.teacher_id = (select app.my_employee_id())))
  with check ((select app.is_admin())
              or exists (select 1 from public.timetable_slots s where s.id = slot_id and s.teacher_id = (select app.my_employee_id())));

-- ---------------------------------------------------------------------
-- التحضير والسلوك
-- ---------------------------------------------------------------------
create policy attendance_read on public.attendance_records for select to authenticated
  using ((select app.is_admin())
         or student_id = (select app.my_student_id())
         or ((select app.is_staff()) and app.staff_can_access_student(student_id)));
create policy attendance_insert on public.attendance_records for insert to authenticated
  with check ((select app.is_admin())
              or ((select app.is_staff())
                  and recorded_by = (select app.my_employee_id())
                  and app.staff_can_access_student(student_id)));
create policy attendance_update on public.attendance_records for update to authenticated
  using ((select app.is_admin())
         or (recorded_by = (select app.my_employee_id()) and recorded_at > now() - interval '3 days'))
  with check ((select app.is_admin())
              or (recorded_by = (select app.my_employee_id()) and recorded_at > now() - interval '3 days'));
create policy attendance_delete on public.attendance_records for delete to authenticated
  using ((select app.is_admin())
         or (recorded_by = (select app.my_employee_id()) and recorded_at > now() - interval '6 hours'));

create policy behavior_read on public.behavior_records for select to authenticated
  using ((select app.is_admin()) or student_id = (select app.my_student_id()));
create policy behavior_admin_write on public.behavior_records for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

-- ---------------------------------------------------------------------
-- سجل التدقيق: قراءة للإداري فقط، والكتابة بالتريجر وحده
-- ---------------------------------------------------------------------
create policy audit_log_admin_read on public.audit_log for select to authenticated
  using ((select app.is_admin()));
