-- =====================================================================
-- اختبارات 30: طالب يحاول أن يصير موظفًا (أو يرى ما لا يخصه)
-- كل محاولة هنا يستطيع أي طالب تنفيذها من متصفحه بالمفتاح العام وجلسته.
-- تعتمد على بيانات 10_core_test.sql و 20_auth_accounts_test.sql
-- =====================================================================
\set ON_ERROR_STOP 1

select test.login('00000000-0000-0000-0000-000000000051');   -- الطالب s1

-- ---------------------------------------------------------------------
-- 1) تغيير الدور أو الربط بسجل موظف
-- ---------------------------------------------------------------------
select test.ok(test.affected($$update profiles set role = 'admin' where id = auth.uid()$$) = 0,
               'الطالب لا يرفع دوره إلى إداري');
select test.ok(test.affected($$update profiles set role = 'teacher', employee_id = 2, student_id = null where id = auth.uid()$$) = 0,
               'الطالب لا يربط حسابه بسجل معلم');
select test.ok(test.affected($$update profiles set status = 'active' where username = 'e1'$$) = 0,
               'الطالب لا يعدّل حساب غيره');
select test.fails($$insert into profiles (id, username, role, employee_id) values
                    ('00000000-0000-0000-0000-0000000000ff', 'hack', 'admin', 1)$$,
                  'violates row-level security', 'الطالب لا ينشئ حساب إداري');
select test.ok(test.affected($$delete from profiles where username = 'admin'$$) = 0, 'الطالب لا يحذف حساب الإداري');
select test.ok((select role = 'student' from profiles where id = auth.uid()), 'دور الطالب ما زال طالبًا بعد كل المحاولات');

-- ---------------------------------------------------------------------
-- 2) منح نفسه نطاق معلم أو إعدادات أو سجلات
-- ---------------------------------------------------------------------
select test.fails($$insert into staff_scope (employee_id, branch_id) values (2, 1)$$,
                  'permission denied|row-level security', 'الطالب لا يضيف نطاق معلم');
select test.ok(test.affected($$update app_settings set value = '"x"' where key = 'school_name'$$) = 0,
               'الطالب لا يعدّل الإعدادات');
select test.fails($$insert into audit_log (action, details) values ('x', 'y')$$,
                  'permission denied|row-level security', 'الطالب لا يكتب في سجل النشاط');
select test.ok((select count(*) from audit_log) = 0, 'الطالب لا يقرأ سجل النشاط');
select test.fails($$insert into login_attempts (username, succeeded) values ('admin', true)$$,
                  'permission denied', 'الطالب لا يزوّر محاولة دخول ناجحة لفك القفل');

-- ---------------------------------------------------------------------
-- 3) قراءة ما لا يخصه
-- ---------------------------------------------------------------------
select test.ok((select count(*) from profiles) = 1, 'الطالب يرى حسابه فقط من الحسابات');
select test.ok((select count(*) from employees) = 0, 'الطالب لا يرى سجلات الموظفين');
select test.ok((select count(*) from students where code <> 'S1') = 0, 'الطالب لا يرى زملاءه');
select test.ok((select count(*) from staff_scope) = 0, 'الطالب لا يرى نطاقات المعلمين');
select test.fails($$select * from migration.legacy_accounts$$, 'permission denied',
                  'الطالب لا يقرأ الحسابات القديمة وكلماتها');
select test.fails($$select * from auth.users$$, 'permission denied', 'الطالب لا يقرأ جدول حسابات Auth');

-- ---------------------------------------------------------------------
-- 4) استدعاء دوال الخادم مباشرة
-- ---------------------------------------------------------------------
select test.fails($$select * from public.auth_login_gate('admin', 'staff', null)$$, 'permission denied',
                  'الطالب لا يستعلم عن بريد الإداري الداخلي');
select test.fails($$select public.admin_attach_profile('00000000-0000-0000-0000-0000000000ff', 'x', 'admin', 1)$$,
                  'permission denied', 'الطالب لا ينشئ حسابًا عبر دالة الخادم');
select test.fails($$select * from public.admin_legacy_accounts()$$, 'permission denied',
                  'الطالب لا يقرأ قائمة الحسابات القديمة');
select test.fails($$select app.ip_is_throttled('1.2.3.4')$$, 'permission denied', 'الطالب لا يستدعي دوال القفل');
select test.logout();

-- ---------------------------------------------------------------------
-- 5) الزائر بلا حساب (المفتاح العام وحده)
-- ---------------------------------------------------------------------
set role anon;
select test.fails($$select count(*) from profiles$$, 'permission denied', 'الزائر لا يقرأ الحسابات');
select test.fails($$select count(*) from students$$, 'permission denied', 'الزائر لا يقرأ الطلاب');
select test.ok((select get_public_settings() ? 'school_name'), 'الزائر يقرأ اسم المدرسة فقط');
select test.ok(not (select get_public_settings() ? 'results_visible_grades'), 'الزائر لا يقرأ الإعدادات الداخلية');
reset role;

-- ---------------------------------------------------------------------
-- 6) الحساب الموقوف يفقد كل شيء فورًا حتى لو بقيت جلسته
-- ---------------------------------------------------------------------
update profiles set status = 'disabled' where username = 'e1';
select test.login('00000000-0000-0000-0000-0000000000e1');
select test.ok(app.my_role() is null, 'المعلم الموقوف بلا دور');
select test.ok((select count(*) from students) = 0, 'المعلم الموقوف لا يرى أي طالب');
select test.logout();
update profiles set status = 'active' where username = 'e1';

-- ---------------------------------------------------------------------
-- 7) قفل الجهاز: 40 محاولة فاشلة من عنوان واحد على أسماء مختلفة
-- ---------------------------------------------------------------------
set role service_role;
select public.auth_record_login('guess' || g, false, '203.0.113.9') from generate_series(1, 39) g;
select test.ok(not (select ip_locked from public.auth_login_gate('admin', 'staff', '203.0.113.9')),
               '39 محاولة من جهاز واحد لا تقفله');
select public.auth_record_login('guess40', false, '203.0.113.9');
select test.ok((select ip_locked from public.auth_login_gate('admin', 'staff', '203.0.113.9')),
               'الأربعون تقفل الجهاز حتى على اسم لم يُجرَّب');
select test.ok(not (select ip_locked from public.auth_login_gate('admin', 'staff', '198.51.100.7')),
               'قفل جهاز لا يمس جهازًا آخر');
select test.ok(not (select ip_locked from public.auth_login_gate('admin', 'staff', 'garbage')),
               'عنوان غير مفهوم لا يُفشل البوابة');
select test.ok((select user_id is null from public.auth_login_gate(repeat('a', 65), 'staff', null)),
               'اسم أطول من 64 حرفًا يُرفض دون بحث');
update login_attempts set attempted_at = attempted_at - interval '16 minutes' where ip = '203.0.113.9';
select test.ok(not (select ip_locked from public.auth_login_gate('admin', 'staff', '203.0.113.9')),
               'قفل الجهاز ينتهي بعد 15 دقيقة');
reset role;
