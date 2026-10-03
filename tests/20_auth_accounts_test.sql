-- =====================================================================
-- اختبارات 13: الدخول وإنشاء الحسابات
-- تعتمد على دوال test.* من 10_core_test.sql (تُشغَّل بعده)
-- =====================================================================
\set ON_ERROR_STOP 1
grant usage on schema test to service_role;
grant execute on all functions in schema test to service_role;

-- بيانات: موظف وطالب جديدان، وحسابان قديمان لهما
insert into employees (code, name_ar, user_type) values ('AUTH_E', 'موظف اختبار الدخول', 'teacher');
insert into students (code, name_ar, class_id) values ('AUTH_S', 'طالب اختبار الدخول', 1);
insert into migration.legacy_accounts (kind, code, username, password_value, password_hashed, status_raw, user_type, source_sheet, source_row)
values ('staff', 'AUTH_E', 'auth.teacher', 'x', false, 'active', 'teacher', 'Users', 900),
       ('student', 'AUTH_S', 'auth.student', 'y', false, 'active', null, 'Students_Users', 901),
       ('staff', 'NO_SUCH_EMP', 'ghost', null, false, null, 'teacher', 'Users', 902);
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a001', 'u-a001@accounts.test'),
  ('00000000-0000-0000-0000-00000000a002', 'u-a002@accounts.test'),
  ('00000000-0000-0000-0000-00000000a003', 'u-a003@accounts.test');

-- ---------------------------------------------------------------------
-- الصلاحيات: لا anon ولا authenticated
-- ---------------------------------------------------------------------
set role anon;
select test.fails($$select * from public.auth_login_gate('x', 'staff')$$, 'permission denied', 'anon لا يستدعي بوابة الدخول');
select test.fails($$select public.auth_record_login('x', true)$$, 'permission denied', 'anon لا يسجّل محاولات دخول');
reset role;
select test.login('00000000-0000-0000-0000-0000000000a0');  -- الإداري من 10_core_test
select test.fails($$select * from public.admin_legacy_accounts()$$, 'permission denied', 'حتى الإداري من المتصفح لا يقرأ الحسابات القديمة');
select test.fails($$select public.admin_attach_profile('00000000-0000-0000-0000-00000000a001', 'zz', 'teacher', 1)$$,
                  'permission denied', 'ولا ينشئ حسابًا بتجاوز الخادم');
select test.logout();

-- ---------------------------------------------------------------------
-- الخادم: الحسابات القديمة مربوطة بسجلاتها
-- ---------------------------------------------------------------------
set role service_role;
select test.ok((select employee_id is not null from public.admin_legacy_accounts() where username = 'auth.teacher'),
               'الحساب القديم للموظف مربوط بسجله الجديد بالرمز');
select test.ok((select student_id is not null from public.admin_legacy_accounts() where username = 'auth.student'),
               'الحساب القديم للطالب مربوط بسجله الجديد بالرمز');
select test.ok((select employee_id is null and student_id is null from public.admin_legacy_accounts() where username = 'ghost'),
               'رمز بلا سجل يظهر بلا ربط (يُرفض عند الإنشاء)');

-- ربط حساب Auth بسجله
select public.admin_attach_profile('00000000-0000-0000-0000-00000000a001', ' Auth.Teacher ', 'teacher',
       (select id from employees where code = 'AUTH_E'), null, 'active',
       (select id from public.admin_legacy_accounts() where username = 'auth.teacher'));
select test.ok((select must_change_password and source_sheet = 'Users' and legacy_status = 'active'
                  from profiles where id = '00000000-0000-0000-0000-00000000a001'),
               'الحساب الجديد يبدأ بتغيير إلزامي ويحفظ مصدره القديم');
select test.ok((select auth_user_id = '00000000-0000-0000-0000-00000000a001'
                  from public.admin_legacy_accounts() where username = 'auth.teacher'),
               'الحساب القديم عُلّم بمعرّف حسابه الجديد');
reset role;
select test.ok((select password_value is null from migration.legacy_accounts where username = 'auth.teacher')
               and (select password_value = 'y' from migration.legacy_accounts where username = 'auth.student'),
               'كلمة المرور القديمة تُمسح لحظة إنشاء الحساب، ولا يُمسّ غيره');
set role service_role;
select test.fails($$select public.admin_attach_profile('00000000-0000-0000-0000-00000000a002', 'other', 'teacher',
                    (select id from employees where code = 'E2'), null, 'active',
                    (select id from public.admin_legacy_accounts() where username = 'auth.teacher'))$$,
                  'أُنشئ له حساب من قبل', 'الحساب القديم لا يُنشأ مرتين');
select test.fails($$select public.admin_attach_profile('00000000-0000-0000-0000-00000000a002', 'AUTH.TEACHER', 'student',
                    null, (select id from students where code = 'AUTH_S'))$$,
                  'مستخدم من قبل', 'اسم المستخدم فريد بلا حساسية لحالة الأحرف');
select test.fails($$select public.admin_attach_profile('00000000-0000-0000-0000-00000000a002', 'two words', 'student',
                    null, (select id from students where code = 'AUTH_S'))$$,
                  'المسافات', 'اسم المستخدم بلا مسافات');
select test.fails($$select public.admin_attach_profile('00000000-0000-0000-0000-00000000a002', 'bad.role', 'teacher',
                    null, (select id from students where code = 'AUTH_S'))$$,
                  'profiles_owner_chk', 'المعلم لا يُربط بسجل طالب');
select test.ok((select count(*) from profiles where id = '00000000-0000-0000-0000-00000000a002') = 0,
               'المحاولات الفاشلة لم تترك حسابًا ناقصًا');
select public.admin_attach_profile('00000000-0000-0000-0000-00000000a002', 'auth.student', 'student',
       null, (select id from students where code = 'AUTH_S'));

-- ---------------------------------------------------------------------
-- بوابة الدخول والقفل
-- ---------------------------------------------------------------------
select test.ok((select user_id = '00000000-0000-0000-0000-00000000a001' and email = 'u-a001@accounts.test'
                       and not locked and status = 'active'
                  from public.auth_login_gate('AUTH.teacher', 'staff')),
               'البوابة تجد الحساب باسم المستخدم بلا حساسية لحالة الأحرف');
select test.ok((select user_id is null from public.auth_login_gate('auth.teacher', 'student'))
               and (select user_id is null from public.auth_login_gate('auth.student', 'staff')),
               'كل بوابة لا تقبل إلا حساباتها: الموظف لا يدخل من بوابة الطالب والعكس');
select test.fails($$select * from public.auth_login_gate('auth.teacher', 'other')$$, 'بوابة غير معروفة', 'البوابة إلزامية');
select test.ok((select user_id is null and not locked from public.auth_login_gate('nobody', 'staff')),
               'اسم غير موجود يعيد صفًا فارغًا لا خطأ');
select test.ok((select count(*) = 1 and bool_and(user_id is null) from public.auth_login_gate('   ', 'student')),
               'اسم فارغ لا يُفشل البوابة');

select public.auth_record_login('auth.student', false, '10.0.0.1') from generate_series(1, 4);
select test.ok(not (select locked from public.auth_login_gate('auth.student', 'student')), '4 محاولات فاشلة لا تقفل');
select public.auth_record_login('auth.student', false, 'not-an-ip');
select test.ok((select locked from public.auth_login_gate('auth.student', 'student')), 'الخامسة تقفل (وعنوان IP غير مفهوم لا يُفشلها)');
select test.ok(not (select locked from public.auth_login_gate('auth.teacher', 'staff')), 'القفل لاسم واحد فقط');

update login_attempts set attempted_at = attempted_at - interval '16 minutes' where username = 'auth.student';
select test.ok(not (select locked from public.auth_login_gate('auth.student', 'student')), 'القفل ينتهي بعد 15 دقيقة');

select public.auth_record_login('auth.teacher', false) from generate_series(1, 3);
select public.auth_record_login('auth.teacher', true, '10.0.0.2');
select public.auth_record_login('auth.teacher', false) from generate_series(1, 4);
select test.ok(not (select locked from public.auth_login_gate('auth.teacher', 'staff')), 'الدخول الناجح يصفّر العدّاد');
select test.ok((select last_login_at is not null from profiles where username = 'auth.teacher'), 'الدخول الناجح يحدّث آخر دخول');
create temp table audit_before as select count(*) n from audit_log where table_name = 'profiles';
select public.auth_record_login('auth.student', true);
select test.ok((select count(*) from audit_log where action = 'تسجيل دخول' and actor_code = 'AUTH_E') = 1
               and (select count(*) from audit_log where action = 'تسجيل دخول' and actor_code = 'AUTH_S') = 0,
               'دخول الموظف يُكتب في سجل النشاط، ودخول الطالب لا (كالنظام القديم)');
select test.ok((select count(*) from audit_log where table_name = 'profiles') = (select n from audit_before)
               and (select last_login_at is not null from profiles where username = 'auth.student'),
               'تحديث آخر دخول لا يملأ سجل التدقيق');
reset role;

-- ---------------------------------------------------------------------
-- صاحب الحساب لا يلغي التغيير الإلزامي بنفسه من المتصفح
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-00000000a002');
select test.ok(test.affected($$update profiles set must_change_password = false where id = auth.uid()$$) = 0,
               'الطالب لا يلغي التغيير الإلزامي بطلب مباشر');
select test.fails($$select count(*) from login_attempts$$, 'permission denied', 'الطالب لا يقرأ محاولات الدخول');
select test.logout();
