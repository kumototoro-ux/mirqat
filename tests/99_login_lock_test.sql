-- =====================================================================
-- هجرة 34: القفل على (الاسم + الجهاز) — لا يستطيع أحد قفل حساب غيره
-- =====================================================================
\set ON_ERROR_STOP 1
set role service_role;
-- مهاجم من جهاز واحد: 5 محاولات خاطئة على اسم الطالب
select public.auth_record_login('auth.student', false, '203.0.113.50') from generate_series(1, 5);
select test.ok((select locked from public.auth_login_gate('auth.student', 'student', '203.0.113.50')), 'جهاز المهاجم مقفول عن هذا الاسم');
select test.ok(not (select locked from public.auth_login_gate('auth.student', 'student', '198.51.100.20')), 'وصاحب الحساب يدخل من جهازه');
select test.ok(not (select locked from public.auth_login_gate('auth.teacher', 'staff', '203.0.113.50')), 'وجهاز المهاجم لا يُقفل عن غير هذا الاسم (إلا بقفل الجهاز العام عند 40)');

-- تخمين موزّع: 30 محاولة من 6 أجهزة تقفل الحساب على الجميع
select public.auth_record_login('auth.student', false, '192.0.2.' || (n % 5 + 1)) from generate_series(1, 25) n;
select test.ok((select locked from public.auth_login_gate('auth.student', 'student', '198.51.100.20')), '30 محاولة من أجهزة كثيرة تقفل الحساب');

-- عنوان غير معروف: القفل على الاسم كما كان (الأحوط)
select test.ok((select locked from public.auth_login_gate('auth.student', 'student', null)), 'جهاز بلا عنوان يخضع لقفل الاسم');

-- الدخول الناجح يصفّر كل شيء
select public.auth_record_login('auth.student', true, '198.51.100.20');
select test.ok(not (select locked from public.auth_login_gate('auth.student', 'student', '203.0.113.50')), 'الدخول الناجح يصفّر العدّاد');
reset role;
select test.ok(to_regprocedure('app.login_is_locked_text(text)') is null, 'دالة القفل القديمة حُذفت');
