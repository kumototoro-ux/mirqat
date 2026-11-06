-- =====================================================================
-- هجرة 41: تغيير الحالة الجماعي ضمن الفرع (يعتمد على موظفي وطلاب اختبار هجرة 40)
-- =====================================================================
\set ON_ERROR_STOP 1
create temp table bk as select
  (select id from students where code = 'OV1') as s1, (select id from students where code = 'OV2') as s2,
  (select id from employees where code = 'OVN') as n, (select id from employees where code = 'OVD') as d,
  (select id from employees where code = 'OVM') as m, (select id from employees where code = 'OVM2') as m2;
grant select on bk to public;

select test.login('00000000-0000-0000-0000-000000000f02');   -- مدير فرع 1
select test.ok(set_students_status(array[(select s1 from bk)], 'withdrawn') = 1, 'مدير الفرع ينسّب طالب فرعه');
select test.ok((select status from students where id = (select s1 from bk)) = 'withdrawn', 'والحالة تغيّرت');
select test.fails(format($$select set_students_status(array[%s, %s]::bigint[], 'active')$$, (select s1 from bk), (select s2 from bk)), 'FORBIDDEN', 'طالب من فرع آخر يُفشل الدفعة كلها');
select test.ok((select status from students where id = (select s1 from bk)) = 'withdrawn', 'ولم يتغير شيء (الكل أو لا شيء)');
select test.fails($$select set_students_status(array[1]::bigint[], 'bogus')$$, 'حالة غير معروفة', 'حالة مجهولة مرفوضة');
select test.ok(set_employees_active(array[(select n from bk)], false) = 1, 'يوقف معلم فرعه');
select test.ok(not (select is_active from employees where id = (select n from bk)), 'والمعلم أُوقف');
select test.fails(format($$select set_employees_active(array[%s]::bigint[], false)$$, (select d from bk)), 'FORBIDDEN', 'لا يوقف مدير الفروع (رتبة أعلى)');
select test.fails(format($$select set_employees_active(array[%s]::bigint[], false)$$, (select m2 from bk)), 'FORBIDDEN', 'ولا مديرًا في فرع آخر');
select test.fails(format($$select set_employees_active(array[%s]::bigint[], false)$$, (select m from bk)), 'حدد بين', 'ولا نفسه (يُستثنى)');
select test.logout();

select test.login('00000000-0000-0000-0000-000000000f04');   -- مشرف طلاب: طلاب 2 بلا موظفين
select test.ok(set_students_status(array[(select s1 from bk)], 'active') = 1, 'مشرف الطلاب يغيّر حالة طلاب فرعه');
select test.fails(format($$select set_employees_active(array[%s]::bigint[], true)$$, (select n from bk)), 'FORBIDDEN', 'لكن لا يمسّ الموظفين');
select test.logout();

select test.login('00000000-0000-0000-0000-000000000f07');   -- قبول: طلاب كامل
select test.ok(set_students_status(array[(select s1 from bk)], 'active') = 1, 'مسؤول القبول يغيّر حالة الطلاب');
select test.logout();

select test.login('00000000-0000-0000-0000-000000000f06');   -- معلم عادي
select test.fails(format($$select set_students_status(array[%s]::bigint[], 'withdrawn')$$, (select s1 from bk)), 'FORBIDDEN', 'المعلم العادي ممنوع');
select test.fails(format($$select set_employees_active(array[%s]::bigint[], true)$$, (select m from bk)), 'FORBIDDEN', 'والموظفون');
select test.logout();

select test.login('00000000-0000-0000-0000-0000000000a0');   -- إداري
select test.ok(set_employees_active(array[(select n from bk)], true) = 1, 'الإداري يعيد التفعيل');
select test.ok(set_students_status(array[(select s2 from bk)], 'withdrawn') = 1, 'ويغيّر أي فرع');
select test.logout();
do $$ begin raise notice '✅ اختبارات هجرة 41'; end $$;
