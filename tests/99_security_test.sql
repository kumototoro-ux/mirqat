-- =====================================================================
-- هجرة 33: التشديد الأمني — كل ثغرة مؤكدة في التدقيق صارت اختبارًا يجب أن يُرفض
-- =====================================================================
\set ON_ERROR_STOP 1

-- تجهيز: معلم مساعد (SEC) له نفس نطاق E1 (الفرع 1، الصف 1، الشعبة أ، الرياضيات)،
-- وتقييم يملكه E1 في الفصل C1، وطالب من الفصل C1 وطالب من فرع آخر (خارج النطاق)
insert into employees (code, name_ar, user_type) values ('SEC', 'معلم مساعد', 'teacher');
insert into staff_scope (employee_id, branch_id)  select id, 1 from employees where code = 'SEC';
insert into staff_scope (employee_id, grade_id)   select id, 1 from employees where code = 'SEC';
insert into staff_scope (employee_id, section_id) select id, 1 from employees where code = 'SEC';
insert into staff_scope (employee_id, subject_id) select id, 1 from employees where code = 'SEC';
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000005ec');
insert into profiles (id, username, role, employee_id, status, must_change_password)
select '00000000-0000-0000-0000-0000000005ec', 'sec', 'teacher', id, 'active', false from employees where code = 'SEC';
insert into students (code, name_ar, class_id) values ('SECX', 'طالب فرع آخر', 3);
insert into assessments (kind, class_id, subject_id, term_id, eval_type_id, teacher_id, title, max_score)
values ('task', 1, 1, 1, 1, 2, 'مهمة فحص الأمان', 10);
create temp table sec as select
  (select id from assessments where title = 'مهمة فحص الأمان') as aid,
  (select id from students where code = 'S2') as peer,
  (select id from students where code = 'SECX') as outsider;
grant select on sec to public;

-- =====================================================================
-- ع-1: لا رصد مباشر — لا في تقييم غيري، ولا لطالب خارج نطاقي، ولا حتى في تقييمي
-- =====================================================================
select test.login('00000000-0000-0000-0000-0000000005ec');
select test.fails(format($$insert into grade_entries (assessment_id, student_id, score, max_score, source, recorded_by)
  values (%s, %s, 5, 10, 'manual', app.my_employee_id())$$, (select aid from sec), (select peer from sec)),
  'permission denied', 'المعلم المساعد لا يرصد في تقييم معلم آخر');
select test.fails(format($$insert into grade_entries (assessment_id, student_id, score, max_score, source, recorded_by)
  values (%s, %s, 5, 10, 'manual', app.my_employee_id())$$, (select aid from sec), (select outsider from sec)),
  'permission denied', 'ولا يرصد لطالب من فرع آخر');
select test.fails(format($$update assessments set title = 'x' where id = %s$$, (select aid from sec)), 'permission denied', 'ولا يعدّل التقييم مباشرة');
select test.logout();

select test.login('00000000-0000-0000-0000-0000000000e1');
select test.fails(format($$insert into grade_entries (assessment_id, student_id, score, max_score, source, recorded_by)
  values (%s, %s, 5, 10, 'manual', app.my_employee_id())$$, (select aid from sec), (select peer from sec)),
  'permission denied', 'حتى صاحب التقييم يرصد عبر الدوال فقط');
select test.fails($$delete from form_attempts$$, 'permission denied', 'لا حذف مباشر للمحاولات');
select test.fails($$update form_questions set points = 99$$, 'permission denied', 'لا تعديل مباشر للأسئلة');
select test.fails($$update question_options set is_correct = true$$, 'permission denied', 'لا تعديل مباشر للإجابات الصحيحة');
-- والرصد عبر الدالة المحمية يعمل كما هو
select grade_task((select aid from sec), jsonb_build_array(jsonb_build_object('student_id', (select peer from sec), 'score', 7)));
select test.ok((select count(*) from grade_entries where assessment_id = (select aid from sec)) = 1, 'الرصد عبر grade_task يعمل');
select test.fails(format($$select grade_task(%s, '[{"student_id": %s, "score": 7}]')$$, (select aid from sec), (select outsider from sec)),
  '.', 'grade_task يرفض طالبًا من خارج الفصل');
select test.logout();
select test.ok((select count(*) from grade_entries where assessment_id = (select aid from sec)) = 1, 'لم يُرصد للطالب الخارجي شيء');

-- الدفاع الثاني: السياسة نفسها تشترط ملكية التقييم والطالب من فصله
select test.ok((select with_check ~ 'can_edit_assessment' and with_check ~ 'class_id' from pg_policies
                 where tablename = 'grade_entries' and policyname = 'grade_entries_insert'), 'سياسة الرصد تشترط الملكية والفصل');

-- =====================================================================
-- م-1: الطالب لا يقرأ درجاته ومحاولاته ونقاطه الخام مباشرة
-- =====================================================================
select test.login('00000000-0000-0000-0000-000000000052');
select test.ok((select count(*) from grade_entries) = 0, 'الطالب لا يقرأ جدول الرصد مباشرة');
select test.ok((select count(*) from form_attempts) = 0, 'ولا محاولاته');
select test.ok((select count(*) from attempt_answers) = 0, 'ولا نقاط إجاباته');
select test.ok((select count(*) from grade_totals) = 0, 'ولا مجاميعه عبر العرض');
select test.ok(student_home() is not null, 'وصفحته الرئيسية تعمل (عبر الدالة)');
select test.ok(my_assessments() is not null, 'ومهامه تعمل');
select test.logout();

select test.login('00000000-0000-0000-0000-0000000000e1');
select test.ok((select count(*) from grade_entries where assessment_id = (select aid from sec)) = 1, 'المعلم يقرأ رصد تقييمه');
select test.logout();

-- =====================================================================
-- م-4 وع-2: الزائر بلا صلاحيات، والدوال الداخلية مغلقة
-- =====================================================================
select test.ok(not exists (select 1 from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'),
  'الزائر بلا أي صلاحية على الجداول');
select test.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute') and p.proname <> 'get_public_settings'),
  'الزائر لا ينفّذ أي دالة محمية إلا الإعدادات العامة');
select test.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('save_form_answers_internal', 'track_log', 'track_purge', 'auth_login_gate', 'auth_record_login',
                       'admin_attach_profile', 'admin_legacy_accounts', 'register_upload', 'forget_uploads',
                       'mark_files_purged', 'purge_candidates', 'stale_uploads', 'settle_due_forms', 'admin_revoke_sessions')
     and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))),
  'الدوال الداخلية للخادم وحده');
select test.ok(not exists (
  select 1 from information_schema.role_table_grants
   where grantee = 'authenticated' and table_schema = 'public' and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')),
  'المستخدم لا يفرّغ الجداول ولا ينشئ مشغّلات');
select test.ok(not exists (
  select 1 from pg_default_acl d where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace
     and (d.defaclacl::text like '%anon=%' or d.defaclacl::text like '%authenticated=%')),
  'العناصر الجديدة لا تُفتح تلقائيًا للزائر أو المستخدم');

set role anon;
select test.ok(get_public_settings() is not null, 'الإعدادات العامة للزائر تعمل');
select test.fails($$select count(*) from students$$, 'permission denied', 'الزائر لا يقرأ الطلاب');
reset role;

-- =====================================================================
-- م-3: إخراج كل جلسات الحساب
-- =====================================================================
insert into auth.sessions (user_id) values ('00000000-0000-0000-0000-000000000052'), ('00000000-0000-0000-0000-000000000052'),
  ('00000000-0000-0000-0000-000000000051');
set role service_role;
select test.ok(admin_revoke_sessions('00000000-0000-0000-0000-000000000052') = 2, 'حُذفت جلستا الحساب');
reset role;
select test.ok((select count(*) from auth.sessions where user_id = '00000000-0000-0000-0000-000000000051') = 1, 'وجلسات غيره باقية');
select test.login('00000000-0000-0000-0000-0000000000a0');
select test.fails($$select admin_revoke_sessions('00000000-0000-0000-0000-000000000051')$$, 'permission denied', 'حتى الإداري لا يستدعيها من المتصفح');
select test.logout();

-- =====================================================================
-- ن-2: دليل الموظفين لمن له حساب مكتمل
-- =====================================================================
select test.login('00000000-0000-0000-0000-0000000000dd');
select test.ok((select count(*) from staff_directory) = 0, 'حساب بلا سجل لا يرى أسماء الموظفين');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000052');
select test.ok((select count(*) from staff_directory) > 0, 'الطالب يرى أسماء معلميه');
select test.logout();
