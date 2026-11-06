-- =====================================================================
-- هجرة 38: الموظفون وحسابات الموظفين والطلاب بنطاق الفرع
-- =====================================================================
\set ON_ERROR_STOP 1
insert into employees (code, name_ar, user_type) values
  ('EAM1', 'مدير فرع 1', 'teacher'), ('EAM2', 'مدير فرع 2', 'teacher'), ('EAD1', 'وكيل فرع 1', 'teacher'),
  ('EAT1', 'معلم فرع 1', 'teacher'), ('EAT2', 'معلم فرع 2', 'teacher'), ('EAN', 'معلم عادي', 'teacher'), ('EAS1', 'مشرف طلاب 1', 'teacher');
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000d01'), ('00000000-0000-0000-0000-000000000d02'), ('00000000-0000-0000-0000-000000000d03'),
  ('00000000-0000-0000-0000-000000000d04'), ('00000000-0000-0000-0000-000000000d05'), ('00000000-0000-0000-0000-000000000d06'), ('00000000-0000-0000-0000-000000000d07');
insert into profiles (id, username, role, employee_id, status, must_change_password)
select v.id::uuid, v.u, 'teacher', e.id, 'active', false
  from (values ('00000000-0000-0000-0000-000000000d01', 'eam1', 'EAM1'), ('00000000-0000-0000-0000-000000000d02', 'eam2', 'EAM2'),
               ('00000000-0000-0000-0000-000000000d03', 'ead1', 'EAD1'), ('00000000-0000-0000-0000-000000000d04', 'eat1', 'EAT1'),
               ('00000000-0000-0000-0000-000000000d05', 'eat2', 'EAT2'), ('00000000-0000-0000-0000-000000000d06', 'ean', 'EAN'),
               ('00000000-0000-0000-0000-000000000d07', 'eas1', 'EAS1')) v(id, u, code) join employees e on e.code = v.code;
insert into employee_positions (employee_id, position, branch_id)
select e.id, v.p, v.b from (values ('EAM1', 'branch_manager', 1), ('EAM2', 'branch_manager', 2), ('EAD1', 'deputy', 1), ('EAS1', 'students_supervisor', 1)) v(c, p, b) join employees e on e.code = v.c;
-- نطاق المعلمين: EAT1 في فرع 1، EAT2 في فرع 2
insert into staff_scope (employee_id, branch_id) select id, 1 from employees where code = 'EAT1';
insert into staff_scope (employee_id, branch_id) select id, 2 from employees where code = 'EAT2';
create temp table ea as select
  (select id from employees where code = 'EAT1') as t1, (select id from employees where code = 'EAT2') as t2,
  (select id from employees where code = 'EAM1') as m1, (select id from employees where code = 'EAN') as n,
  (select id from employees where user_type = 'admin' limit 1) as adm;
grant select on ea to public;
insert into students (code, name_ar, class_id) values ('EAS-1', 'طالب حسابات 1', 1), ('EAS-2', 'طالب حسابات 2', 3);
create temp table es as select (select id from students where code = 'EAS-1') as s1, (select id from students where code = 'EAS-2') as s2;
grant select on es to public;
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000d11'), ('00000000-0000-0000-0000-000000000d12');
insert into profiles (id, username, role, student_id, status, must_change_password)
values ('00000000-0000-0000-0000-000000000d11', 'eas-s1', 'student', (select s1 from es), 'active', true),
       ('00000000-0000-0000-0000-000000000d12', 'eas-s2', 'student', (select s2 from es), 'active', true);

-- ---------------------------------------------------------------------
-- القراءة
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000d01');   -- مدير فرع 1
select test.ok((select count(*) from employees where id = (select t1 from ea)) = 1, 'مدير الفرع يرى معلم فرعه');
select test.ok((select count(*) from employees where id = (select t2 from ea)) = 0, 'ولا يرى معلم فرع آخر');
select test.ok((select count(*) from employees where id = (select adm from ea)) = 0, 'ولا يرى الإداري');
select test.ok((select count(*) from staff_scope where employee_id = (select t1 from ea)) >= 1 and (select count(*) from staff_scope where employee_id = (select t2 from ea)) = 0, 'ونطاق معلمي فرعه فقط');
select test.ok((select count(*) from profiles where employee_id = (select t1 from ea)) = 1, 'ويرى حساب معلم فرعه');
select test.ok((select count(*) from profiles where employee_id = (select t2 from ea)) = 0, 'ولا حساب معلم فرع آخر');
select test.ok((select count(*) from profiles where student_id = (select s1 from es)) = 1 and (select count(*) from profiles where student_id = (select s2 from es)) = 0, 'وحساب طالب فرعه فقط');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000d03');   -- وكيل: يرى الموظفين، لا حساباتهم
select test.ok((select count(*) from employees where id = (select t1 from ea)) = 1, 'الوكيل يرى معلمي فرعه');
select test.ok((select count(*) from profiles where employee_id = (select t1 from ea)) = 0, 'ولا يرى حسابات الموظفين');
select test.ok((select count(*) from profiles where student_id = (select s1 from es)) = 1, 'لكن يرى حسابات الطلاب (عرض)');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000d06');   -- معلم عادي
select test.ok((select count(*) from employees where id <> (select n from ea)) = 0, 'المعلم العادي لا يرى زملاءه');
select test.ok((select count(*) from profiles where id <> '00000000-0000-0000-0000-000000000d06') = 0, 'ولا حساباتهم');
select test.logout();

-- ---------------------------------------------------------------------
-- تسجيل وتعديل الموظفين
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000d01');
select test.ok((select count(*) from save_employee(null, '{"name_ar":"معلم جديد","user_type":"teacher","scope":{"branch_id":1,"grade_ids":[1],"section_ids":[1],"subject_ids":[1]}}')) = 1, 'مدير الفرع يسجّل معلمًا في فرعه');
select test.fails($$select save_employee(null, '{"name_ar":"x","user_type":"teacher","scope":{"branch_id":2,"grade_ids":[1],"section_ids":[1],"subject_ids":[1]}}')$$, 'FORBIDDEN', 'ولا في فرع آخر');
select test.fails($$select save_employee(null, '{"name_ar":"x","user_type":"admin","scope":{}}')$$, 'FORBIDDEN', 'ولا ينشئ إداريًا');
select test.ok((select count(*) from save_employee((select t1 from ea), '{"name_ar":"معلم فرع 1 معدّل","user_type":"teacher","scope":{"branch_id":1,"grade_ids":[1],"section_ids":[1],"subject_ids":[1]}}')) = 1, 'ويعدّل معلم فرعه');
select test.fails(format($$select save_employee(%s, '{"name_ar":"x","user_type":"teacher","scope":{"branch_id":1,"grade_ids":[1],"section_ids":[1],"subject_ids":[1]}}')$$, (select t2 from ea)), 'FORBIDDEN', 'ولا يعدّل معلم فرع آخر');
select test.fails(format($$select save_employee(%s, '{"name_ar":"نقل","user_type":"teacher","scope":{"branch_id":2,"grade_ids":[1],"section_ids":[1],"subject_ids":[1]}}')$$, (select t1 from ea)), 'FORBIDDEN', 'ولا ينقل معلمه إلى فرع آخر');
select test.fails(format($$select save_employee(%s, '{"name_ar":"x","user_type":"teacher","scope":{"branch_id":1,"grade_ids":[1],"section_ids":[1],"subject_ids":[1]}}')$$, (select adm from ea)), 'FORBIDDEN', 'ولا يعدّل إداريًا');
select test.fails(format($$select save_employee(%s, '{"name_ar":"نفسي","user_type":"teacher","scope":{"branch_id":1,"grade_ids":[1],"section_ids":[1],"subject_ids":[1]}}')$$, (select m1 from ea)), 'FORBIDDEN', 'ولا يعدّل نفسه');
select test.fails(format($$select delete_employee(%s)$$, (select t1 from ea)), 'للإدارة', 'والحذف للإداري وحده');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000d03');   -- وكيل: عرض
select test.fails($$select save_employee(null, '{"name_ar":"x","user_type":"teacher","scope":{"branch_id":1,"grade_ids":[1],"section_ids":[1],"subject_ids":[1]}}')$$, 'FORBIDDEN', 'الوكيل لا يسجّل موظفين (عرض فقط)');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000d06');
select test.fails($$select save_employee(null, '{"name_ar":"x","user_type":"teacher","scope":{"branch_id":1,"grade_ids":[1],"section_ids":[1],"subject_ids":[1]}}')$$, 'FORBIDDEN', 'المعلم العادي لا يسجّل');
select test.logout();

-- ---------------------------------------------------------------------
-- حسابات: فحص صلاحية الإدارة
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000d01');   -- مدير فرع 1
select test.ok(can_manage_account('employee', (select t1 from ea)), 'مدير الفرع يدير حساب معلمه');
select test.ok(not can_manage_account('employee', (select t2 from ea)), 'ولا حساب معلم فرع آخر');
select test.ok(not can_manage_account('employee', (select adm from ea)), 'ولا حساب إداري');
select test.ok(not can_manage_account('employee', (select m1 from ea)), 'ولا حسابه هو');
select test.ok(can_manage_account('student', (select s1 from es)) and not can_manage_account('student', (select s2 from es)), 'وحساب طالب فرعه فقط');
select test.ok(can_manage_profile('00000000-0000-0000-0000-000000000d04') and not can_manage_profile('00000000-0000-0000-0000-000000000d05'), 'can_manage_profile بنفس الحدود');
select test.ok(not can_manage_profile('00000000-0000-0000-0000-000000000d01'), 'ولا حسابه هو');
select test.ok(not can_manage_profile('00000000-0000-0000-0000-0000000000a0'), 'ولا حساب الإداري');
select test.ok(can_manage_profile('00000000-0000-0000-0000-000000000d11') and not can_manage_profile('00000000-0000-0000-0000-000000000d12'), 'وحساب الطالب بحسب فرعه');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000d03');   -- وكيل: عرض الحسابات فقط
select test.ok(not can_manage_account('student', (select s1 from es)), 'الوكيل لا يدير حسابات الطلاب (عرض)');
select test.ok(can_manage_account('student', (select s1 from es), 1), 'لكن مستوى العرض متاح');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000d07');   -- مشرف طلاب
select test.ok(can_manage_account('student', (select s1 from es)), 'مشرف الطلاب يدير حسابات طلاب فرعه');
select test.ok(not can_manage_account('employee', (select t1 from ea)), 'ولا حسابات الموظفين');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000d02');   -- مدير فرع 2
select test.ok(not can_manage_account('student', (select s1 from es)) and can_manage_account('student', (select s2 from es)), 'مدير الفرع 2 لفرعه فقط');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000d06');
select test.ok(not can_manage_account('student', (select s1 from es)) and not can_manage_account('employee', (select t1 from ea)), 'المعلم العادي لا يدير شيئًا');
select test.logout();
set role anon;
select test.fails($$select can_manage_account('student', 1)$$, 'permission denied', 'الزائر لا يستدعيها');
reset role;
