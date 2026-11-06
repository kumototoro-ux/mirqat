-- =====================================================================
-- هجرة 42: فرع كل صف سجل يُحسب عند الكتابة
-- =====================================================================
\set ON_ERROR_STOP 1
select test.ok(exists (select 1 from audit_log where table_name = 'students' and branches @> array[1::smallint]), 'صف تسجيل طالب الفرع 1 موسوم بفرعه');
select test.ok(not exists (select 1 from audit_log a where a.table_name = 'students' and a.branches @> array[1::smallint] and a.branches @> array[2::smallint]), 'ولا يُوسم بفرعين');
select test.ok(not exists (select 1 from audit_log where table_name in ('profiles', 'app_settings') and branches is not null), 'الجداول خارج القائمة بلا وسم');
select test.ok(exists (select 1 from audit_log where table_name = 'employees' and branches is not null and cardinality(branches) >= 1), 'والموظف بفروعه');
do $$ begin raise notice '✅ اختبارات هجرة 42'; end $$;
