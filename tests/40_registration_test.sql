-- =====================================================================
-- اختبارات 15: تسجيل الطلاب والموظفين
-- =====================================================================
\set ON_ERROR_STOP 1

insert into students (code, name_ar, class_id) values ('S2315218', 'طالب برقم قديم كبير', 1), ('SE099', 'رمز بحرفين', 1);

-- غير الإداري ممنوع
select test.login('00000000-0000-0000-0000-000000000051');   -- طالب
select test.fails($$select * from save_student(null, '{"name_ar":"x","branch_id":1,"grade_id":1,"section_id":1}')$$,
                  'للإدارة فقط', 'الطالب لا يسجّل طلابًا');
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000e1');   -- معلم
select test.fails($$select * from save_student(null, '{"name_ar":"x","branch_id":1,"grade_id":1,"section_id":1}')$$,
                  'للإدارة فقط', 'المعلم لا يسجّل طلابًا');
select test.fails($$select * from save_employee(null, '{"name_ar":"x","user_type":"admin"}')$$,
                  'للإدارة فقط', 'المعلم لا يضيف موظفًا إداريًا');
select test.logout();

select test.login('00000000-0000-0000-0000-0000000000a0');   -- إداري
-- الرمز التالي كالنظام القديم: أعلى رقم بعد S + 1، والرموز ذات الأحرف الأخرى لا تُحسب
select test.ok((select code = 'S2315219' from save_student(null,
  '{"name_ar":"طالب جديد","national_id":"1122334455","branch_id":1,"grade_id":1,"section_id":2,"gender":"ذكر","fee_status":"سدد","birth_date":"2012-05-01"}')),
  'رقم الطالب الجديد = أعلى رقم + 1');
select test.ok((select enrolled_at is not null and class_id = 2 and birth_date = '2012-05-01' from students where national_id = '1122334455'),
  'يُحفظ تاريخ التسجيل والفصل والميلاد');
select test.fails($$select * from save_student(null, '{"name_ar":"مكرر","national_id":"1122334455","branch_id":1,"grade_id":1,"section_id":1}')$$,
                  'مسجّل لطالب آخر', 'رقم الهوية لا يتكرر');
select test.fails($$select * from save_student(null, '{"name_ar":"  ","branch_id":1,"grade_id":1,"section_id":1}')$$,
                  'الاسم بالعربي مطلوب', 'الاسم مطلوب');
select test.fails($$select * from save_student(null, '{"name_ar":"س","branch_id":1,"grade_id":1}')$$,
                  'اختر الفرع والصف والشعبة', 'الفصل مطلوب');
select test.fails($$select * from save_student(null, '{"name_ar":"س","birth_date":"غلط","branch_id":1,"grade_id":1,"section_id":1}')$$,
                  'تاريخ الميلاد', 'تاريخ غير صحيح يُرفض برسالة واضحة');
-- تركيبة جديدة تنشئ فصلها
select * from save_student(null, '{"name_ar":"فرع الشمال ب","branch_id":2,"grade_id":1,"section_id":2}');
select test.ok(exists (select 1 from classes c join students s on s.class_id = c.id
                        where c.branch_id = 2 and c.grade_id = 1 and c.section_id = 2 and s.name_ar = 'فرع الشمال ب'),
               'تركيبة فرع/صف/شعبة جديدة تُنشئ فصلها');
-- التعديل
select test.ok((select code = 'S2315219' from save_student((select id from students where national_id = '1122334455'),
  '{"name_ar":"طالب معدّل","national_id":"1122334455","branch_id":1,"grade_id":1,"section_id":1,"status":"withdrawn"}')),
  'التعديل يحفظ الرقم نفسه');
select test.ok((select name_ar = 'طالب معدّل' and is_edited and status = 'withdrawn' and class_id = 1 and birth_date = '2012-05-01'
                  from students where national_id = '1122334455'),
               'التعديل يحدّث البيانات ويعلّم "تم التعديل" ولا يمسح الميلاد');
select test.ok(exists (select 1 from audit_log where table_name = 'students' and action = 'INSERT'), 'التسجيل يُكتب في سجل النشاط');

-- الحذف: الطالب بلا سجلات يُحذف، ومن له درجات لا
select delete_student((select id from students where name_ar = 'فرع الشمال ب'));
select test.ok(not exists (select 1 from students where name_ar = 'فرع الشمال ب'), 'طالب بلا سجلات يُحذف');
select test.fails($$select delete_student((select student_id from grade_entries limit 1))$$, 'منسحب', 'من له درجات لا يُحذف');

-- الموظفون
select test.ok((select code = 'E004' from save_employee(null,
  '{"name_ar":"معلمة جديدة","user_type":"teacher","gender":"أنثى","scope":{"branch_id":1,"stage_id":1,"grade_ids":[1],"section_ids":[1,2],"subject_ids":[1]}}')),
  'رقم الموظف التالي E + 3 خانات');
select test.ok((select count(*) from staff_scope where employee_id = (select id from employees where name_ar = 'معلمة جديدة')) = 6,
  'النطاق: فرع ومرحلة وصف وشعبتان ومادة = 6 صفوف');
select test.fails($$select * from save_employee(null, '{"name_ar":"بلا نطاق","user_type":"teacher","scope":{"branch_id":1}}')$$,
                  'صف وشعبة ومادة', 'المعلم بلا صف أو شعبة أو مادة يُرفض');
select * from save_employee((select id from employees where name_ar = 'معلمة جديدة'),
  '{"name_ar":"معلمة جديدة","user_type":"teacher","scope":{"branch_id":1,"grade_ids":[1],"section_ids":[1],"subject_ids":[2]}}');
select test.ok((select count(*) from staff_scope where employee_id = (select id from employees where name_ar = 'معلمة جديدة')) = 4,
  'تعديل النطاق يستبدله كاملًا');
select test.ok((select count(*) from save_employee(null, '{"name_ar":"إداري جديد","user_type":"admin"}')) = 1, 'الإداري لا يحتاج نطاقًا');
-- تغيير نوع موظف له حساب يغيّر دور حسابه
create temp table conv as select * from save_employee((select employee_id from profiles where id = '00000000-0000-0000-0000-0000000000e1'),
                       '{"name_ar":"معلم صار إداريًا","user_type":"admin"}');
select test.ok((select role = 'admin' and user_id = '00000000-0000-0000-0000-0000000000e1' from conv)
               and (select role = 'admin' from profiles where id = '00000000-0000-0000-0000-0000000000e1'),
               'تحويل معلم إلى إداري يغيّر دور حسابه');
select test.fails($$select delete_employee((select employee_id from profiles where id = auth.uid()))$$,
                  'سجلك بنفسك', 'الإداري لا يحذف سجله');
select test.ok(delete_employee((select id from employees where name_ar = 'إداري جديد')) is null, 'موظف بلا سجلات يُحذف');
select test.logout();
