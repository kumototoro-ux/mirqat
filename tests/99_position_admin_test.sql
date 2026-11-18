-- هجرة 46: إدارة المناصب من الواجهة — الإداري وحده، حماية الأساسية، تعديل القدرات، فروع المنصب
\set ON_ERROR_STOP 1
insert into employees (code, name_ar, user_type) values ('PAE1', 'موظف اختبار المناصب', 'teacher'), ('PAE2', 'موظف ثانٍ', 'teacher');
create temp table pe as select (select id from employees where code = 'PAE1') as a, (select id from employees where code = 'PAE2') as b;
grant select on pe to public;

select test.ok((select name_ar from positions where code = 'branches_director') = 'مدير المدرسة', 'مدير الفروع صار مدير المدرسة');
select test.ok((select tier from positions where code = 'branches_director') = 'school' and (select tier from positions where code = 'branch_manager') = 'branch', 'مستويا المدرسة والفرع');
select test.ok((select count(*) from positions where is_system) = 7, 'سبعة مناصب أساسية');
select test.ok(app.pos_rank((select a from pe)) = 0, 'بلا منصب: رتبة صفر');

-- غير الإداري: لا يملك أي دالة
select test.login('00000000-0000-0000-0000-0000000000e6');
select test.fails($$select admin_save_position(null, 'منصب المعلم', null, 'branch', 0::smallint, null)$$, 'للإدارة فقط', 'المعلم لا ينشئ منصبًا');
select test.fails($$select admin_set_position_caps('deputy', '{"students":3}'::jsonb)$$, 'للإدارة فقط', 'ولا يعدّل القدرات');
select test.fails($$select admin_delete_position('deputy')$$, 'للإدارة فقط', 'ولا يحذف');
select test.fails($$insert into position_caps(position, area, level) values ('deputy', 'audit', 3)$$, 'row-level security|permission', 'ولا يكتب في الجدول مباشرة');
select test.logout();

select test.login('00000000-0000-0000-0000-0000000000e1');
create temp table np as select admin_save_position(null, 'مسؤول المختبر', 'مسؤولة المختبر', 'branch', 1::smallint, 'وصف') as code;
grant select on np to public;
select test.ok((select code from np) like 'custom\_%', 'كود المنصب الجديد مولَّد');
select test.ok((select rank from positions where code = (select code from np)) = 1 and not (select is_system from positions where code = (select code from np)), 'منصب مخصّص برتبة 1');
select test.fails($$select admin_save_position(null, 'مسؤول المختبر', null, 'branch', 0::smallint, null)$$, 'يوجد منصب', 'لا تكرار للاسم');
select test.fails($$select admin_save_position(null, '', null, 'branch', 0::smallint, null)$$, 'مطلوب', 'الاسم مطلوب');
select test.fails($$select admin_save_position(null, 'س', null, 'x', 0::smallint, null)$$, 'مستوى', 'مستوى غير صالح');
select test.fails($$select admin_save_position(null, 'س', null, 'branch', 3::smallint, null)$$, 'رتبة', 'رتبة المخصّص لا تتجاوز 1');

-- القدرات: ضبط، وصفر يسحب، ومجال غير معروف يُرفض
select admin_set_position_caps((select code from np), '{"students":2,"results":1,"audit":3}');
select test.ok((select count(*) from position_caps where position = (select code from np)) = 3, 'ثلاث قدرات');
select admin_set_position_caps((select code from np), '{"students":3,"results":0}');
select test.ok((select level from position_caps where position = (select code from np) and area = 'students') = 3
           and not exists (select 1 from position_caps where position = (select code from np) and area in ('results', 'audit')), 'رفع وسحب في ضبطة واحدة');
select test.fails(format($$select admin_set_position_caps(%L, '{"nope":1}')$$, (select code from np)), 'مجال غير معروف', 'مجال غير معروف');
select test.fails(format($$select admin_set_position_caps(%L, '{"students":4}')$$, (select code from np)), 'بين 0 و3', 'مستوى فوق 3');
select test.fails(format($$select admin_set_position_caps(%L, '{"students":"x"}')$$, (select code from np)), 'غير صالح', 'مستوى غير رقمي');

-- فروع المنصب بالمجموعة
select admin_set_position_branches((select a from pe), (select code from np), array[1, 2]::smallint[]);
select test.ok((select count(*) from employee_positions where employee_id = (select a from pe)) = 2, 'فرعان');
select admin_set_position_branches((select a from pe), (select code from np), array[2]::smallint[]);
select test.ok((select array_agg(branch_id) from employee_positions where employee_id = (select a from pe)) = array[2::smallint], 'يبقى الفرع 2 فقط');
select test.fails(format($$select admin_set_position_branches(%s, 'deputy', array[999]::smallint[])$$, (select a from pe)), 'فرع غير موجود', 'فرع غير موجود');
select test.fails(format($$select admin_set_position_branches(%s, 'nope', array[1]::smallint[])$$, (select a from pe)), 'منصب غير معروف', 'منصب غير معروف');
select test.fails(format($$select admin_set_position_branches(%s, 'deputy', array[1]::smallint[])$$, (select id from employees where user_type = 'admin' limit 1)), 'يملك كل', 'الإداري لا يُسند له منصب');

update employees set is_active = true where id = (select a from pe);
select test.logout();

-- حذف: لا يحذف الأساسي، ولا المشغول، ويحذف الفارغ
select test.login('00000000-0000-0000-0000-0000000000e1');
select test.fails($$select admin_delete_position('deputy')$$, 'لا تُحذف', 'الأساسي محمي');
select test.fails(format($$select admin_delete_position(%L)$$, (select code from np)), 'يشغل', 'المشغول محمي');
select admin_set_position_branches((select a from pe), (select code from np), '{}'::smallint[]);
select admin_delete_position((select code from np));
select test.ok(not exists (select 1 from positions where code = (select code from np)) and not exists (select 1 from position_caps where position = (select code from np)), 'حُذف مع قدراته');
select test.ok(exists (select 1 from audit_log where table_name = 'position_caps'), 'تعديل القدرات في سجل النشاط');

-- تسمية المنصب الأساسي تتغير والكود ثابت
select admin_save_position('deputy', 'وكيل الفرع (جديد)', 'وكيلة الفرع', 'school', 1::smallint, 'x');
select test.ok((select name_ar from positions where code = 'deputy') = 'وكيل الفرع (جديد)' and (select tier from positions where code = 'deputy') = 'branch' and (select rank from positions where code = 'deputy') = 0, 'الأساسي: الاسم يتغير والمستوى والرتبة ثابتان');
select admin_save_position('deputy', 'وكيل الفرع', 'وكيلة الفرع', 'branch', 0::smallint, 'يساعد مدير الفرع في الجداول والتحضير والسلوك وتسجيل الطلاب.');
select test.logout();

-- التنظيف
delete from employees where code in ('PAE1', 'PAE2');
