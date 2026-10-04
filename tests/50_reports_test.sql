-- اختبارات 16: التقارير
\set ON_ERROR_STOP 1
select test.login('00000000-0000-0000-0000-000000000051');
select test.fails($$select report_students()$$, 'للإدارة فقط', 'الطالب لا يرى تقرير الطلاب');
select test.fails($$select report_accounts()$$, 'للإدارة فقط', 'الطالب لا يرى تقرير الحسابات');
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000a0');
-- انسحاب مسجّل في التدقيق
select * from save_student((select id from students where code = 'S1'), '{"name_ar":"منسحب للتقرير","branch_id":1,"grade_id":1,"section_id":1,"status":"withdrawn"}');
create temp table rs as select report_students() r;
select test.ok((select (r -> 'totals' ->> 'all')::int = (select count(*) from students) from rs), 'إجمالي الطلاب صحيح');
select test.ok((select (r -> 'totals' ->> 'withdrawn_this_month')::int >= 1 from rs), 'الانسحاب هذا الشهر محسوب من سجل التدقيق');
select test.ok((select jsonb_array_length(r -> 'monthly') = 6 from rs), 'اتجاه آخر 6 أشهر');
select test.ok((select (select sum((b ->> 'all')::int) from jsonb_array_elements(r -> 'by_branch') b) = (r -> 'totals' ->> 'all')::int from rs),
               'مجموع الفروع = الإجمالي');
select test.ok((select report_employees() -> 'totals' ->> 'all')::int = (select count(*) from employees), 'تقرير الموظفين');
select test.ok((select jsonb_array_length(report_accounts() -> 'by_role') = 3), 'تقرير الحسابات بالأدوار الثلاثة');
select test.ok((select jsonb_array_length(report_accounts() -> 'daily_logins') = 14), 'دخول آخر 14 يومًا');
select test.logout();

-- تقرير النشاط
select test.login('00000000-0000-0000-0000-000000000051');
select test.fails($$select report_activity()$$, 'للإدارة فقط', 'الطالب لا يرى تقرير النشاط');
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000a0');
select test.ok((select (report_activity() -> 'totals' ->> 'week')::int >= 1), 'النشاط الأسبوعي محسوب');
select test.ok((select jsonb_array_length(report_activity() -> 'daily') = 14), 'النشاط اليومي لأسبوعين');
select test.logout();

-- تدقيق القوائم المرجعية واستخدام الفروع
select test.login('00000000-0000-0000-0000-0000000000a0');
update branches set name = name || ' (مؤقت)' where id = 1;
update branches set name = replace(name, ' (مؤقت)', '') where id = 1;
select test.ok((select count(*) from audit_log where table_name = 'branches' and action = 'UPDATE') >= 2, 'إعادة تسمية فرع تُكتب في سجل النشاط');
select test.ok((select students >= 1 from branch_usage() where branch_id = 1), 'استخدام الفرع يُحسب بالطلاب');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000051');
select test.ok((select count(*) from branch_usage()) = 0, 'الطالب لا يرى استخدام الفروع');
select test.logout();
