-- هجرة 45: أنواع الرسوم وشرطها على عرض النتائج (+ الأصل مغلق، وسجل التغييرات، وتجاوز السماح)
\set ON_ERROR_STOP 1
create temp table fx (k text primary key, v bigint);
grant all on fx to authenticated, service_role;

-- قواعد إتاحة بقيت من اختبارات سابقة: تُحفظ وتُفرَّغ ثم تُعاد في آخر الاختبار
create temp table saved_rules as select * from result_release_rules;
delete from result_release_rules;

-- عام جديد حالي بفصلين بالضبط، فترتيبهما 1 و2 مهما أضافت الاختبارات الأخرى
update academic_years set is_current = false where is_current;
insert into academic_years (name, is_current) values ('FEE-TEST', true);
insert into terms (academic_year_id, name, sort_order)
select (select id from academic_years where name = 'FEE-TEST'), n, o from (values ('ف١', 1), ('ف٢', 2)) v(n, o);
insert into fx select 't1', id from terms where name = 'ف١';
insert into fx select 't2', id from terms where name = 'ف٢';
insert into fx select 'a', id from students where code = 'S90A';
insert into fx select 'b', id from students where code = 'S90B';
insert into fx select 'y', id from academic_years where name = 'FEE-TEST';

create function pg_temp.vis(p_term text, p_student text default 'a') returns text language sql as $$
  select case when (a ->> 'visible')::boolean then 'visible' else a ->> 'reason' end
    from (select app.result_access((select v from fx where k = p_student), (select v::smallint from fx where k = p_term)) a) q
$$;

-- الأعداد الأولية: ست حالات، وكل طالب موجود وقت الهجرة صار «جزءًا من الأول»
select test.ok((select count(*) from fee_statuses) = 6, 'ست حالات رسوم أولية');
select test.ok((select unlocks_term from fee_statuses where name = 'معفي من الرسوم') = 9
           and (select unlocks_term from fee_statuses where name = 'دفع رسوم الترم الأول') = 1
           and (select unlocks_term from fee_statuses where name = 'دفع جزءًا من رسوم الترم الأول') = 0, 'جدول الفتح مطابق للنظام القديم');

-- 1) الأصل مغلق: بلا قاعدة اعتماد لا تظهر النتيجة
update app_settings set value = '"closed"' where key = 'results_default';
update app_settings set value = '"on"' where key = 'results_fee_gate';
select test.ok(pg_temp.vis('t1') = 'not_approved', 'الأصل مغلق: لا نتيجة بلا اعتماد ('||coalesce(pg_temp.vis('t1'),'null')||')');

-- 2) اعتماد الإدارة للجميع (سماح عام) ثم تُفحص الرسوم
insert into result_release_rules (kind, note) values ('allow', 'fee-test-open');
update students set fee_status = null where id = (select v from fx where k = 'a');
select test.ok(pg_temp.vis('t1') = 'fees', 'بلا حالة رسوم: ممنوع');
update students set fee_status = 'لم يدفع شيئًا' where id = (select v from fx where k = 'a');
select test.ok(pg_temp.vis('t1') = 'fees' and pg_temp.vis('t2') = 'fees', 'لم يدفع: ممنوع في الترمين');
update students set fee_status = 'دفع جزءًا من رسوم الترم الأول' where id = (select v from fx where k = 'a');
select test.ok(pg_temp.vis('t1') = 'fees', 'جزء من الأول: ممنوع');
update students set fee_status = 'دفع رسوم الترم الأول' where id = (select v from fx where k = 'a');
select test.ok(pg_temp.vis('t1') = 'visible' and pg_temp.vis('t2') = 'fees', 'دفع الأول: الأول فقط');
update students set fee_status = 'دفع جزءًا من رسوم الترم الثاني' where id = (select v from fx where k = 'a');
select test.ok(pg_temp.vis('t1') = 'visible' and pg_temp.vis('t2') = 'fees', 'جزء من الثاني: الأول فقط');
update students set fee_status = 'دفع رسوم الترم الثاني' where id = (select v from fx where k = 'a');
select test.ok(pg_temp.vis('t1') = 'visible' and pg_temp.vis('t2') = 'visible', 'دفع الثاني: الترمان');
update students set fee_status = 'معفي من الرسوم' where id = (select v from fx where k = 'a');
select test.ok(pg_temp.vis('t1') = 'visible' and pg_temp.vis('t2') = 'visible', 'معفي: الترمان');

-- 3) حالة غير معروفة لا تُحفظ أصلًا، والفراغ يعني بلا حالة
select test.fails($$update students set fee_status = 'مسدد' where code = 'S90A'$$, 'غير معروفة', 'حالة خارج القائمة مرفوضة');
select test.fails($$insert into students (code, name_ar, fee_status) values ('S45X', 'س', 'سدد')$$, 'غير معروفة', 'الإدخال بحالة غير معروفة مرفوض');

-- 4) الاعتماد يغلب الرسوم: حجب صريح لفرع الطالب يمنعه رغم أنه معفي
insert into result_release_rules (kind, note, class_ids) select 'block', 'fee-test-block', array[class_id] from students where code = 'S90A';
select test.ok(pg_temp.vis('t1') = 'blocked', 'الحجب الصريح يغلب الرسوم');
delete from result_release_rules where note = 'fee-test-block';

-- 5) سماح على الطالب نفسه يتجاوز الرسوم (تأجيل بموافقة الإدارة)
update students set fee_status = 'لم يدفع شيئًا' where id = (select v from fx where k = 'a');
select test.ok(pg_temp.vis('t1') = 'fees', 'قبل السماح: ممنوع');
insert into result_release_rules (kind, note, student_ids) select 'allow', 'fee-test-allow', array[v] from fx where k = 'a';
select test.ok(pg_temp.vis('t1') = 'visible' and pg_temp.vis('t2') = 'visible', 'سماح الطالب يتجاوز الرسوم');
delete from result_release_rules where note = 'fee-test-allow';
select test.ok(pg_temp.vis('t1') = 'fees', 'بعد إزالة السماح: ممنوع');

-- 6) العام الجديد يبطل حالات العام السابق دون حذف
update students set fee_status = 'معفي من الرسوم' where id = (select v from fx where k = 'a');
select test.ok(pg_temp.vis('t1') = 'visible', 'حالة العام الحالي سارية');
update academic_years set is_current = false where name = 'FEE-TEST';
insert into academic_years (name, is_current) values ('FEE-TEST-2', true);
insert into terms (academic_year_id, name, sort_order) select id, 'ن١', 1 from academic_years where name = 'FEE-TEST-2';
insert into fx select 'n1', id from terms where name = 'ن١';
select test.ok(pg_temp.vis('n1') = 'fees', 'عام جديد: الحالة القديمة لا تُفتح له شيئًا');
select test.ok((select fee_status from students where code = 'S90A') = 'معفي من الرسوم', 'حالة العام السابق محفوظة (لا حذف)');
select test.ok(pg_temp.vis('t1') = 'visible', 'فصول العام السابق لا يحجبها شرط الرسوم');
update students set fee_status = 'دفع رسوم الترم الأول' where id = (select v from fx where k = 'a');
select test.ok(pg_temp.vis('n1') = 'visible', 'تحديد الحالة في العام الجديد يفتح الترم الأول');
update academic_years set is_current = false where name = 'FEE-TEST-2';
update academic_years set is_current = true where name = 'FEE-TEST';

-- 7) إيقاف شرط الرسوم
update app_settings set value = '"off"' where key = 'results_fee_gate';
update students set fee_status = null where id = (select v from fx where k = 'a');
select test.ok(pg_temp.vis('t1') = 'visible', 'الشرط معطّل: يكفي الاعتماد');
update app_settings set value = '"on"' where key = 'results_fee_gate';

-- 8) الأصل مفتوح
delete from result_release_rules where note = 'fee-test-open';
update app_settings set value = '"open"' where key = 'results_default';
update students set fee_status = 'معفي من الرسوم' where id = (select v from fx where k = 'a');
select test.ok(pg_temp.vis('t1') = 'visible', 'الأصل مفتوح: بلا قاعدة وبرسوم صحيحة تظهر');
update app_settings set value = '"closed"' where key = 'results_default';

-- 9) السجل، وإعادة التسمية، ومنع حذف المستخدمة
select test.ok((select count(*) from student_fee_log where student_id = (select v from fx where k = 'a')) >= 5, 'كل تغيير رسوم مسجَّل');
select test.ok(exists (select 1 from student_fee_log where student_id = (select v from fx where k = 'a')
                          and old_status = 'دفع رسوم الترم الأول' and new_status is null), 'السجل يحفظ القديم والجديد');
insert into fee_statuses (name, unlocks_term) values ('حالة اختبار', 1);
update students set fee_status = 'حالة اختبار' where id = (select v from fx where k = 'b');
select test.fails($$delete from fee_statuses where name = 'حالة اختبار'$$, 'مستخدمة', 'لا حذف لحالة مستخدمة');
update fee_statuses set name = 'حالة اختبار ٢' where name = 'حالة اختبار';
select test.ok((select fee_status from students where id = (select v from fx where k = 'b')) = 'حالة اختبار ٢', 'إعادة التسمية تتبعها سجلات الطلاب');
update students set fee_status = null where id = (select v from fx where k = 'b');
delete from fee_statuses where name = 'حالة اختبار ٢';

-- 10) الصلاحيات: الطالب لا يقرأ القائمة ولا السجل، والمعلم بلا صلاحية لا يحدد، والإداري يحدد
select test.login('00000000-0000-0000-0000-000000000091');
select test.ok((select count(*) from fee_statuses) = 0, 'الطالب لا يقرأ أنواع الرسوم');
select test.ok((select count(*) from student_fee_log) = 0, 'الطالب لا يقرأ سجل الرسوم');
select test.fails($$select set_students_fee(array[1::bigint], 'معفي من الرسوم')$$, 'FORBIDDEN', 'الطالب لا يحدد الرسوم');
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000e6');
select test.fails($$insert into fee_statuses (name) values ('x1')$$, 'row-level security', 'المعلم لا يضيف نوع رسوم');
select test.fails($$select set_students_fee(array[(select id from students where code = 'S90A')], 'معفي من الرسوم')$$, 'FORBIDDEN', 'المعلم بلا صلاحية لا يحدد الرسوم');
select test.ok((select count(*) from fee_statuses) = 6, 'المعلم يقرأ القائمة');
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000a0');
select test.ok((select set_students_fee(array[(select v from fx where k = 'a'), (select v from fx where k = 'b')], 'دفع رسوم الترم الثاني')) = 2, 'الإداري يحدد الرسوم جماعيًا');
select test.fails($$select set_students_fee(array[(select v from fx where k = 'a')], 'غلط')$$, 'غير معروفة', 'حالة غير معروفة مرفوضة بالجملة');
select test.logout();

-- تنظيف: إعادة الإعدادات والعام الحالي كما كانت للاختبارات اللاحقة
delete from result_release_rules;
insert into result_release_rules overriding system value select * from saved_rules;
update academic_years set is_current = false where is_current;
update academic_years set is_current = true where name = '1448';
update app_settings set value = '"open"' where key = 'results_default';
update app_settings set value = '"off"' where key = 'results_fee_gate';
