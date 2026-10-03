-- =====================================================================
-- اختبارات مِرقاة — تُشغَّل على قاعدة محلية فارغة بعد تطبيق الهجرات (run_tests.sh)
-- كل اختبار يرمي خطأً عند الفشل فيتوقف التشغيل كاملًا.
-- =====================================================================
\set ON_ERROR_STOP 1
create schema test;
grant usage on schema test to authenticated, anon;

create function test.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAILED: %', msg; end if;
  raise notice 'PASS: %', msg;
end $$;

create function test.fails(stmt text, pattern text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm ~ pattern then raise notice 'PASS: % (%)', msg, sqlerrm; return; end if;
    raise exception 'FAILED: % — unexpected error: %', msg, sqlerrm;
  end;
  raise exception 'FAILED: % — no error raised', msg;
end $$;

create function test.affected(stmt text) returns integer language plpgsql as $$
declare n integer;
begin execute stmt; get diagnostics n = row_count; return n; end $$;

create function test.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, false);
  execute 'set role authenticated';
end $$;
create function test.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', false);
end $$;
grant execute on all functions in schema test to authenticated, anon;

-- ---------------------------------------------------------------------
-- بيانات تجريبية
-- ---------------------------------------------------------------------
insert into academic_years (name, is_current) values ('1448', true);
insert into terms (academic_year_id, name) values (1, 'الترم الأول');
insert into branches (name) values ('الفرع الرئيسي'), ('فرع الشمال');
insert into stages (name) values ('المتوسط');
insert into grades (stage_id, name) values (1, 'الأول');
insert into sections (name) values ('أ'), ('ب');
insert into subjects (name) values ('رياضيات'), ('علوم');
insert into eval_types (name) values ('واجبات'), ('اختبارات قصيرة');
insert into grade_weights (subject_id, eval_type_id, weight) values (1, 1, 20), (1, 2, 30);
insert into classes (branch_id, grade_id, section_id) values (1,1,1), (1,1,2), (2,1,1);  -- C1, C2, C3
insert into attendance_statuses (name) values ('حاضر'), ('غائب');
insert into app_settings (key, value, is_public) values ('school_name', '"مدرسة دار الهدى"', true), ('exam_visibility', '"all"', false);

insert into calendar_entries (term_id, week_label, starts_on, ends_on, event) values
  (1, '1', '2026-09-06', '2026-09-10', null),
  (1, 'اليوم الوطني', '2026-09-23', '2026-09-23', 'إجازة'),
  (1, '3', '2026-09-20', '2026-09-24', null);

insert into employees (code, name_ar, user_type) values
  ('E0', 'المدير', 'admin'), ('E1', 'معلم الرياضيات', 'teacher'), ('E2', 'معلم بلا قيود', 'teacher');
insert into staff_scope (employee_id, branch_id) values (2, 1);
insert into staff_scope (employee_id, section_id) values (2, 1);
insert into staff_scope (employee_id, subject_id) values (2, 1);
insert into staff_scope (employee_id, grade_id) values (2, 1);
-- E2: فرع وصف ومادة، لكن بلا أي شعبة
insert into staff_scope (employee_id, branch_id) values (3, 1);
insert into staff_scope (employee_id, grade_id) values (3, 1);
insert into staff_scope (employee_id, subject_id) values (3, 1);

insert into students (code, name_ar, class_id, enrolled_at) values
  ('S1', 'طالب أول', 1, null), ('S2', 'طالب ثاني', 1, null), ('S3', 'طالب الشعبة ب', 2, null),
  ('S4', 'طالب جديد', 1, now() + interval '1 day');

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a0'), ('00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-0000000000e2'), ('00000000-0000-0000-0000-000000000051'),
  ('00000000-0000-0000-0000-000000000052'), ('00000000-0000-0000-0000-000000000053'),
  ('00000000-0000-0000-0000-0000000000dd');
insert into profiles (id, username, role, employee_id, student_id, status) values
  ('00000000-0000-0000-0000-0000000000a0', 'admin', 'admin', 1, null, 'active'),
  ('00000000-0000-0000-0000-0000000000e1', 'e1', 'teacher', 2, null, 'active'),
  ('00000000-0000-0000-0000-0000000000e2', 'e2', 'teacher', 3, null, 'active'),
  ('00000000-0000-0000-0000-000000000051', 's1', 'student', null, 1, 'active'),
  ('00000000-0000-0000-0000-000000000052', 's2', 'student', null, 2, 'active'),
  ('00000000-0000-0000-0000-000000000053', 's3', 'student', null, 3, 'active');

-- تكليف عادي + نموذج إلكتروني للفصل C1 مادة الرياضيات
insert into assessments (kind, class_id, subject_id, term_id, eval_type_id, teacher_id, title, max_score)
values ('task', 1, 1, 1, 1, 2, 'واجب 1', 10);
insert into assessments (kind, class_id, subject_id, term_id, eval_type_id, teacher_id, title)
values ('form', 1, 1, 1, 2, 2, 'اختبار قصير 1');
insert into form_details (assessment_id, opens_at, closes_at, max_attempts, status)
values (2, now() - interval '1 hour', now() + interval '1 day', 1, 'published');
insert into form_questions (assessment_id, position, body, points) values (2, 1, 'س1', 2), (2, 2, 'س2', 3);
insert into question_options (question_id, position, body, is_correct) values
  (1, 1, 'True', true), (1, 2, 'False', false),
  (2, 1, 'أ', false), (2, 2, 'ب', true);

-- =====================================================================
-- 1) التقويم
-- =====================================================================
select test.ok((select count(*) from school_weeks) = 2, 'school_weeks يستبعد الإجازة المحتواة داخل أسبوع');

-- =====================================================================
-- 2) نطاق المعلم (checkAccess_)
-- =====================================================================
select test.login('00000000-0000-0000-0000-0000000000e1');
select test.ok((select count(*) from students) = 3, 'المعلم E1 يرى طلاب الشعبة أ فقط (3)');
select test.ok(not exists (select 1 from students where code = 'S3'), 'المعلم E1 لا يرى طالب الشعبة ب');
select test.fails($$insert into assessments (kind, class_id, subject_id, term_id, teacher_id, title, max_score)
                    values ('task', 2, 1, 1, 2, 'خارج النطاق', 10)$$, 'row-level security', 'المعلم لا ينشئ تكليفًا خارج نطاقه');
select test.fails($$insert into assessments (kind, class_id, subject_id, term_id, teacher_id, title, max_score)
                    values ('task', 1, 2, 1, 2, 'مادة ليست له', 10)$$, 'row-level security', 'المعلم لا ينشئ تكليفًا لمادة ليست له');
select test.fails($$insert into assessments (kind, class_id, subject_id, term_id, teacher_id, title, max_score)
                    values ('task', 1, 1, 1, 3, 'باسم معلم آخر', 10)$$, 'row-level security', 'المعلم لا ينشئ تكليفًا باسم معلم آخر');
select test.ok((select count(*) from employees) = 1, 'المعلم يرى سجله الوظيفي فقط');
select test.ok((select count(*) from staff_directory) = 3, 'دليل الأسماء متاح بلا بيانات شخصية');
select test.logout();

select test.login('00000000-0000-0000-0000-0000000000e2');
select test.ok((select count(*) from students) = 0, 'معلم بلا صلاحية على أي شعبة لا يرى أي طالب (الرفض هو الأصل)');
select test.ok((select count(*) from assessments) = 0, 'ولا يرى أي تكليف');
select test.logout();

-- =====================================================================
-- 3) الطالب
-- =====================================================================
select test.login('00000000-0000-0000-0000-000000000051');
select test.ok((select count(*) from students) = 1, 'الطالب يرى سجله فقط');
select test.ok((select count(*) from assessments) = 2, 'الطالب يرى تقييمات صفه');
select test.ok((select count(*) from question_options) = 0, 'الطالب لا يقرأ جدول الخيارات مباشرة');
select test.ok((select count(*) from audit_log) = 0, 'الطالب لا يرى سجل التدقيق');
select test.ok(position('is_correct' in get_form_for_student(2)::text) = 0, 'أسئلة النموذج للطالب بلا الإجابة الصحيحة');
select test.ok((get_form_for_student(2) -> 'server_now') is not null, 'ساعة الخادم مرفقة للعداد التنازلي');

-- إجابات غير مكتملة / خيار من سؤال آخر
select test.fails($$select submit_form_attempt(2, '{"1": 1}')$$, 'بلا إجابة', 'التسليم الناقص مرفوض');
select test.fails($$select submit_form_attempt(2, '{"1": 3, "2": 4}')$$, 'لا ينتمي', 'خيار من سؤال آخر مرفوض');
select test.fails($$select submit_form_attempt(2, '{"1": 1, "2": 4, "99": 1}')$$, 'ليست في هذا النموذج', 'سؤال غريب مرفوض');

-- تسليم صحيح: س1 صح (2) + س2 خطأ (0) = 2 من 5
select test.ok((submit_form_attempt(2, '{"1": 1, "2": 3}') ->> 'score')::numeric = 2, 'التصحيح الآلي = 2 من 5');
select test.fails($$select submit_form_attempt(2, '{"1": 1, "2": 4}')$$, 'استنفدت', 'لا محاولة ثانية بعد استنفاد المسموح');
select test.ok((select score from grade_entries where assessment_id = 2) = 2, 'التسليم أنشأ رصدًا تلقائيًا');
select test.ok((get_my_attempt_review(2) -> 'questions' -> 1 ->> 'chosen_option_id')::bigint = 3, 'مراجعة الطالب لإجاباته تعرض اختياره');
select test.fails($$insert into form_attempts (assessment_id, student_id, attempt_no) values (2, 1, 5)$$,
                  'row-level security', 'الطالب لا يكتب محاولة مباشرة متجاوزًا الدالة');
select test.logout();

select test.login('00000000-0000-0000-0000-000000000053');
select test.fails($$select get_form_for_student(2)$$, 'FORBIDDEN', 'طالب صف آخر لا يفتح النموذج');
select test.logout();

-- =====================================================================
-- 4) حماية نموذج له إجابات
-- =====================================================================
select test.login('00000000-0000-0000-0000-0000000000e1');
select test.fails($$insert into form_questions (assessment_id, position, body, points) values (2, 3, 'س3', 1)$$,
                  'بعد وجود إجابات', 'لا إضافة أسئلة بعد التسليم');
select test.fails($$update question_options set is_correct = false where id = 1$$,
                  'بعد وجود إجابات', 'لا تغيير الإجابة الصحيحة بعد التسليم');
select test.ok(test.affected($$update form_questions set body = 'س1 (مصحح إملائيًا)' where id = 1$$) = 1,
               'تعديل نص السؤال مسموح بعد التسليم');
select test.logout();

-- =====================================================================
-- 5) الرصد اليدوي ومهل التعديل والحذف
-- =====================================================================
insert into grade_entries (assessment_id, student_id, score, max_score, recorded_by, recorded_at) values
  (1, 1, 8, 10, 2, now() - interval '2 days'),
  (1, 2, 6, 10, 2, now() - interval '4 days');

select test.login('00000000-0000-0000-0000-0000000000e1');
select test.ok(test.affected($$update grade_entries set score = 9 where assessment_id = 1 and student_id = 1$$) = 1,
               'تعديل رصد عمره يومان مسموح');
select test.ok(test.affected($$update grade_entries set score = 7 where assessment_id = 1 and student_id = 2$$) = 0,
               'تعديل رصد عمره 4 أيام ممنوع (مهلة 3 أيام)');
select test.ok(test.affected($$delete from grade_entries where assessment_id = 1 and student_id = 1$$) = 0,
               'حذف رصد عمره يومان ممنوع (مهلة 6 ساعات)');
select test.fails($$update grade_entries set score = 11 where assessment_id = 1 and student_id = 1$$,
                  'grade_entries_score_chk', 'درجة أعلى من العظمى مرفوضة');
select test.fails($$insert into grade_entries (assessment_id, student_id, score, max_score, recorded_by) values (1, 1, 5, 10, 2)$$,
                  'duplicate key', 'رصد مكرر لنفس الطالب ونفس التقييم مرفوض');
select test.logout();

select test.ok((select is_edited and recorded_at < now() - interval '1 day' from grade_entries where assessment_id = 1 and student_id = 1),
               'التعديل يحفظ تاريخ الرصد الأصلي ويعلّم السجل كمعدَّل');
select test.ok(exists (select 1 from audit_log where table_name = 'grade_entries' and action = 'UPDATE' and actor_code = 'E1'),
               'سجل التدقيق كتب التعديل باسم المعلم تلقائيًا');

select test.login('00000000-0000-0000-0000-0000000000a0');
select test.ok(test.affected($$update grade_entries set score = 7 where assessment_id = 1 and student_id = 2$$) = 1,
               'الإداري يعدّل بلا مهلة');
select test.logout();

-- =====================================================================
-- 6) التجميع (نفس معادلة recalcMyGradeAggregation_)
--   الطالب S1: واجبات 9/10 × 20 = 18 ، اختبارات قصيرة 2/5 × 30 = 12 ، المجموع 30
-- =====================================================================
select test.ok((select weighted_score from grade_breakdown where student_id = 1 and eval_type_id = 1) = 18, 'الواجبات: 9/10 × 20 = 18');
select test.ok((select weighted_score from grade_breakdown where student_id = 1 and eval_type_id = 2) = 12, 'الاختبارات القصيرة: 2/5 × 30 = 12');
select test.ok((select total from grade_totals where student_id = 1 and subject_id = 1) = 30, 'المجموع يُحسب لحظيًا = 30');

insert into grade_visibility (student_id, subject_id, term_id, is_visible) values (1, 1, 1, false);
select test.login('00000000-0000-0000-0000-000000000051');
select test.ok((select count(*) from grade_entries) = 0, 'نتيجة مخفية بقرار الإدارة لا تظهر للطالب');
select test.logout();
delete from grade_visibility;

select test.login('00000000-0000-0000-0000-000000000052');
select test.ok((select count(*) from grade_entries) = 1 and (select student_id from grade_entries) = 2, 'الطالب يرى درجاته فقط');
select test.logout();

-- =====================================================================
-- 7) تسوية الغياب وإعادة الفتح
-- =====================================================================
update form_details set closes_at = now() - interval '1 minute', opens_at = now() - interval '2 hours' where assessment_id = 2;
select test.ok(settle_due_forms() = 1, 'التسوية سجّلت صفرًا لطالب واحد غائب (S2)');
select test.ok(exists (select 1 from grade_entries where assessment_id = 2 and student_id = 2 and score = 0 and source = 'auto_absent'),
               'الغائب S2 رُصد له صفر');
select test.ok(not exists (select 1 from form_attempts where assessment_id = 2 and student_id = 4), 'الطالب الجديد S4 معفى');
select test.ok((select score from grade_entries where assessment_id = 2 and student_id = 1) = 2, 'درجة من سلّم لم تُمس');
select test.ok(settle_due_forms() = 0, 'لا تسوية مكررة لنموذج مسوّى');

select test.login('00000000-0000-0000-0000-0000000000e1');
select reopen_form(2, now() + interval '1 day');
select test.logout();
select test.ok(not exists (select 1 from form_attempts where assessment_id = 2 and is_auto_absent), 'إعادة الفتح حذفت الأصفار التلقائية');
select test.ok((select absence_settled_at is null and status = 'published' from form_details where assessment_id = 2), 'إعادة الفتح ألغت علامة التسوية');

select test.login('00000000-0000-0000-0000-000000000052');
select test.ok((submit_form_attempt(2, '{"1": 1, "2": 4}') ->> 'score')::numeric = 5, 'الطالب S2 أجاب بعد إعادة الفتح = 5 من 5');
select test.logout();

-- =====================================================================
-- 8) المشاهدات، الحسابات المعطلة، والزائر
-- =====================================================================
select test.login('00000000-0000-0000-0000-000000000051');
select test.ok(test.affected($$insert into student_views (student_id, assessment_id) values (1, 1)$$) = 1, 'الطالب يسجّل مشاهدته');
select test.fails($$insert into student_views (student_id, assessment_id) values (2, 1)$$, 'row-level security', 'الطالب لا يسجّل مشاهدة باسم غيره');
select test.logout();

update profiles set status = 'disabled' where username = 's3';
select test.login('00000000-0000-0000-0000-000000000053');
select test.ok((select count(*) from students) = 0 and (select count(*) from subjects) = 0, 'الحساب المعطّل لا يرى شيئًا');
select test.logout();

set role anon;
select test.fails($$select * from students$$, 'permission denied', 'الزائر بلا دخول لا يصل للجداول');
select test.ok(get_public_settings() ->> 'school_name' = 'مدرسة دار الهدى' and not (get_public_settings() ? 'exam_visibility'),
               'الزائر يرى اسم المدرسة فقط');
reset role;

-- =====================================================================
-- 9) سلامة البنية
-- =====================================================================
select test.fails($$insert into staff_scope (employee_id, branch_id, subject_id) values (2, 1, 1)$$, 'one_dimension', 'صف النطاق يحمل بعدًا واحدًا فقط');
select test.fails($$insert into profiles (id, username, role, employee_id) values ('00000000-0000-0000-0000-0000000000dd', 'x', 'student', 1)$$,
                  'profiles_owner_chk', 'حساب طالب لا يرتبط بموظف');
select test.fails($$insert into question_options (question_id, position, body, is_correct) values (2, 3, 'ج', true)$$,
                  'duplicate key|بعد وجود إجابات', 'خيار صحيح واحد فقط لكل سؤال');
update students set class_id = 2 where code = 'S1';
select test.ok((select count(*) from student_enrollments where student_id = 1) = 2
               and (select count(*) from student_enrollments where student_id = 1 and ended_at is null) = 1,
               'نقل الطالب لفصل آخر يحفظ تاريخ انتقاله');
select test.ok((select count(*) from pg_tables t where t.schemaname = 'public' and not t.rowsecurity) = 0,
               'كل جداول public محمية بـ RLS');
insert into assessments (kind, class_id, subject_id, term_id, teacher_id, title) values ('form', 1, 1, 1, 2, 'نموذج بلا إجابات');
insert into form_questions (assessment_id, position, body, points) values (currval('assessments_id_seq'), 1, 'س', 1);
insert into question_options (question_id, position, body, is_correct) values (currval('form_questions_id_seq'), 1, 'أ', true);
select test.fails(format($$insert into question_options (question_id, position, body, is_correct) values (%s, 2, 'ب', true)$$,
                         currval('form_questions_id_seq')),
                  'question_options_one_correct_uq', 'خيار صحيح واحد فقط لكل سؤال (بالقيد الفريد)');
select test.fails($$insert into form_details (assessment_id, status) values (1, 'draft')$$, 'مسموح فقط', 'إعدادات النموذج لا تُضاف لتكليف عادي');

-- معلم بلا أي صف صلاحية إطلاقًا
insert into employees (code, name_ar) values ('E3', 'معلم جديد بلا صلاحيات');
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000e3');
insert into profiles (id, username, role, employee_id) values ('00000000-0000-0000-0000-0000000000e3', 'e3', 'teacher', 4);
select test.login('00000000-0000-0000-0000-0000000000e3');
select test.ok((select count(*) from students) = 0 and (select count(*) from assessments) = 0
               and (select count(*) from grade_entries) = 0 and (select count(*) from attendance_records) = 0,
               'معلم بلا صلاحيات لا يرى أي بيانات طلاب');
select test.logout();

-- حصتان في نفس الوقت لمادتين مختلفتين مسموح، ونفس المادة مكررة في نفس الحصة ممنوع
insert into timetable_slots (class_id, subject_id, teacher_id, day_of_week, period_no) values (1, 1, 2, 0, 1), (1, 2, 3, 0, 1), (1, 1, 2, 0, 2);
select test.ok((select count(*) from timetable_slots where class_id = 1 and day_of_week = 0) = 3, 'حصتان لنفس المادة في اليوم، ومادتان في نفس الحصة');
select test.fails($$insert into timetable_slots (class_id, subject_id, day_of_week, period_no) values (1, 1, 0, 1)$$,
                  'duplicate key', 'نفس المادة لا تتكرر في نفس الحصة لنفس الفصل');
