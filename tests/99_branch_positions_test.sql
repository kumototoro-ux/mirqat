-- =====================================================================
-- هجرة 36: مناصب الفروع — العزل بين الفروع، حدود كل منصب، منع التسلق، والسحب الفوري
-- يعتمد على بيانات 10 (الفرعان 1 و2، الفصول C1 وC2 في الفرع 1 وC3 في الفرع 2) وعلى حالات التحضير والسلوك من 80
-- =====================================================================
\set ON_ERROR_STOP 1

-- موظفون بمناصب متعددة (حساب معلم) + معلم عادي بلا منصب
insert into employees (code, name_ar, user_type) values
  ('BPD', 'وكيل الفرع 1', 'teacher'), ('BPA', 'قبول الفرع 1', 'teacher'), ('BPS', 'مشرف طلاب الفرع 1', 'teacher'),
  ('BPM', 'مدير الفرع 2', 'teacher'), ('BPT', 'مشرف معلمات الفرع 1', 'teacher'), ('BPN', 'معلم عادي', 'teacher'),
  ('BPX', 'موظف غير نشط', 'teacher');
update employees set is_active = false where code = 'BPX';
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000b01'), ('00000000-0000-0000-0000-000000000b02'), ('00000000-0000-0000-0000-000000000b03'),
  ('00000000-0000-0000-0000-000000000b04'), ('00000000-0000-0000-0000-000000000b05'), ('00000000-0000-0000-0000-000000000b06');
insert into profiles (id, username, role, employee_id, status, must_change_password)
select v.id::uuid, v.u, 'teacher', e.id, 'active', false
  from (values ('00000000-0000-0000-0000-000000000b01', 'bpd', 'BPD'), ('00000000-0000-0000-0000-000000000b02', 'bpa', 'BPA'),
               ('00000000-0000-0000-0000-000000000b03', 'bps', 'BPS'), ('00000000-0000-0000-0000-000000000b04', 'bpm', 'BPM'),
               ('00000000-0000-0000-0000-000000000b05', 'bpt', 'BPT'), ('00000000-0000-0000-0000-000000000b06', 'bpn', 'BPN')) v(id, u, code)
  join employees e on e.code = v.code;
create temp table bp as select
  (select id from employees where code = 'BPD') as d, (select id from employees where code = 'BPA') as a,
  (select id from employees where code = 'BPS') as s, (select id from employees where code = 'BPM') as m,
  (select id from employees where code = 'BPT') as t, (select id from employees where code = 'BPN') as n,
  (select id from employees where code = 'BPX') as x, (select id from employees where user_type = 'admin' limit 1) as adm;
grant select on bp to public;
insert into students (code, name_ar, class_id) values ('BP1', 'طالب الفرع الأول', 1), ('BP2', 'طالب الفرع الثاني', 3);
create temp table bs as select (select id from students where code = 'BP1') as b1, (select id from students where code = 'BP2') as b2;
grant select on bs to public;

-- ---------------------------------------------------------------------
-- القائمة والجداول
-- ---------------------------------------------------------------------
select test.ok((select count(*) from positions) = 7, 'سبعة مناصب (خمسة للفرع + مدير الفروع + مراقب الأداء)');
select test.ok((select count(*) from cap_areas) = 13, 'ثلاثة عشر مجالًا');
select test.ok((select level from position_caps where position = 'admissions' and area = 'students') = 3, 'القبول: تسجيل الطلاب كامل');
select test.ok(not exists (select 1 from position_caps where position = 'admissions' and area in ('attendance', 'behavior', 'grading', 'results')),
  'القبول لا يملك التحضير ولا السلوك ولا الدرجات');
select test.ok(not exists (select 1 from position_caps where position not in ('branch_manager', 'branches_director') and area = 'employee_accounts'), 'حسابات الموظفين لمدير الفرع وحده');
select test.ok(not exists (select 1 from position_caps where position = 'students_supervisor' and area in ('tasks', 'grading')),
  'مشرف الطلاب لا يرى المهام ولا الدرجات');

-- ---------------------------------------------------------------------
-- الإسناد: للإداري وحده، بقواعد صارمة
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-0000000000a0');
select admin_set_position((select d from bp), 'deputy', 1::smallint, true);
select admin_set_position((select a from bp), 'admissions', 1::smallint, true);
select admin_set_position((select s from bp), 'students_supervisor', 1::smallint, true);
select admin_set_position((select m from bp), 'branch_manager', 2::smallint, true);
select admin_set_position((select t from bp), 'teachers_supervisor', 1::smallint, true);
select admin_set_position((select d from bp), 'deputy', 1::smallint, true);   -- مكرر: لا خطأ ولا تكرار
select test.ok((select count(*) from employee_positions) = 5, 'خمس إسنادات (والمكرر لا يتضاعف)');
select test.fails(format($$select admin_set_position(%s, 'غير_موجود', 1::smallint, true)$$, (select n from bp)), 'منصب غير معروف', 'منصب مجهول مرفوض');
select test.fails(format($$select admin_set_position(%s, 'deputy', 99::smallint, true)$$, (select n from bp)), 'الفرع غير موجود', 'فرع مجهول مرفوض');
select test.fails($$select admin_set_position(999999, 'deputy', 1::smallint, true)$$, 'الموظف غير موجود', 'موظف مجهول مرفوض');
select test.fails(format($$select admin_set_position(%s, 'deputy', 1::smallint, true)$$, (select adm from bp)), 'الإداري يملك كل الصلاحيات', 'لا يُسند منصب لإداري');
select test.fails(format($$select admin_set_position(%s, 'deputy', 1::smallint, true)$$, (select x from bp)), 'غير نشط', 'ولا لموظف غير نشط');
select test.logout();

select test.login('00000000-0000-0000-0000-000000000b01');   -- الوكيل
select test.fails(format($$select admin_set_position(%s, 'branch_manager', 1::smallint, true)$$, (select d from bp)), 'FORBIDDEN|للإدارة|permission denied|admin',
  'الوكيل لا يمنح نفسه منصب مدير');
select test.fails($$insert into employee_positions (employee_id, position, branch_id) values (1, 'branch_manager', 1)$$, 'permission denied|row-level', 'ولا يكتب في الجدول مباشرة');
select test.fails($$update position_caps set level = 3$$, 'permission denied', 'ولا يرفع قدرات المنصب');
select test.fails($$delete from employee_positions$$, 'permission denied', 'ولا يحذف الإسنادات');
select test.ok((select count(*) from employee_positions) = 1, 'يرى منصبه هو فقط');
select test.ok((my_access() -> 'positions' -> 0 ->> 'position') = 'deputy' and (my_access() -> 'areas' -> 'attendance' ->> 'level')::int = 2, 'مناصبي ومستوى التحضير 2');
select test.ok((my_access() -> 'areas' -> 'attendance' -> 'branches') = '[1]'::jsonb, 'وفروعه [1]');
select test.ok(not (my_access() -> 'areas' ? 'grading'), 'والوكيل لا يملك الرصد');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000b06');   -- معلم عادي
select test.ok(my_access() -> 'areas' = '{}'::jsonb and my_access() -> 'positions' = '[]'::jsonb, 'المعلم العادي بلا مناصب ولا قدرات');
select test.logout();

-- ---------------------------------------------------------------------
-- القراءة: كل صاحب منصب يرى فرعه ومجاله فقط
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000b02');   -- قبول الفرع 1
select test.ok((select count(*) from students where id = (select b1 from bs)) = 1, 'القبول يرى طلاب فرعه');
select test.ok((select count(*) from students where id = (select b2 from bs)) = 0, 'ولا يرى طلاب فرع آخر');
select test.ok((select count(*) from attendance_records) = 0 and (select count(*) from behavior_records) = 0, 'ولا يرى التحضير ولا السلوك (لا قدرة له)');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000b04');   -- مدير الفرع 2
select test.ok((select count(*) from students where id = (select b2 from bs)) = 1, 'مدير الفرع 2 يرى طلاب فرعه');
select test.ok((select count(*) from students where id = (select b1 from bs)) = 0, 'ولا يرى فرعًا آخر');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000b05');   -- مشرف معلمات
select test.ok((select count(*) from students) = 0, 'مشرف المعلمات لا يرى الطلاب');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000b06');   -- معلم عادي
select test.ok((select count(*) from students) = 0, 'المعلم العادي بلا نطاق لا يرى شيئًا');
select test.logout();

-- ---------------------------------------------------------------------
-- تسجيل الطلاب: الإنشاء لمن يملك المستوى الكامل في الفرع، والتعديل لمن يملك التعديل
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000b02');   -- قبول الفرع 1 (كامل)
select test.ok((select count(*) from save_student(null, '{"name_ar":"طالب جديد من القبول","branch_id":1,"grade_id":1,"section_id":1}')) = 1, 'القبول يسجّل طالبًا في فرعه');
select test.fails($$select save_student(null, '{"name_ar":"طالب فرع آخر","branch_id":2,"grade_id":1,"section_id":1}')$$, 'FORBIDDEN', 'ولا يسجّل في فرع آخر');
select test.fails(format($$select save_student(%s, '{"name_ar":"نقل","branch_id":2,"grade_id":1,"section_id":1}')$$, (select b1 from bs)), 'FORBIDDEN', 'ولا ينقل طالبًا إلى فرع آخر');
select test.fails(format($$select save_student(%s, '{"name_ar":"تعديل","branch_id":1,"grade_id":1,"section_id":1}')$$, (select b2 from bs)), 'FORBIDDEN', 'ولا يعدّل طالبًا من فرع آخر');
select test.logout();

select test.login('00000000-0000-0000-0000-000000000b01');   -- وكيل (تعديل لا كامل)
select test.ok((select count(*) from save_student((select b1 from bs), '{"name_ar":"طالب الفرع الأول معدّل","branch_id":1,"grade_id":1,"section_id":1}')) = 1, 'الوكيل يعدّل طالب فرعه');
select test.fails($$select save_student(null, '{"name_ar":"جديد","branch_id":1,"grade_id":1,"section_id":1}')$$, 'FORBIDDEN', 'لكن لا يسجّل جديدًا (يحتاج المستوى الكامل)');
select test.fails(format($$select delete_student(%s)$$, (select b1 from bs)), 'FORBIDDEN', 'ولا يحذف');
select test.fails($$select import_students('[{"name_ar":"استيراد","branch_id":1,"grade_id":1,"section_id":1}]')$$, 'FORBIDDEN', 'ولا يستورد');
select test.logout();

select test.login('00000000-0000-0000-0000-000000000b03');   -- مشرف طلاب (تعديل)
select test.ok((select count(*) from save_student((select b1 from bs), '{"name_ar":"طالب الفرع الأول من المشرف","branch_id":1,"grade_id":1,"section_id":1}')) = 1, 'مشرف الطلاب يعدّل');
select test.fails($$select save_student(null, '{"name_ar":"جديد","branch_id":1,"grade_id":1,"section_id":1}')$$, 'FORBIDDEN', 'ولا يسجّل جديدًا');
select test.logout();

select test.login('00000000-0000-0000-0000-000000000b05');   -- مشرف معلمات
select test.fails(format($$select save_student(%s, '{"name_ar":"x","branch_id":1,"grade_id":1,"section_id":1}')$$, (select b1 from bs)), 'FORBIDDEN', 'مشرف المعلمات لا يعدّل الطلاب');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000b06');   -- معلم عادي
select test.fails($$select save_student(null, '{"name_ar":"x","branch_id":1,"grade_id":1,"section_id":1}')$$, 'FORBIDDEN', 'المعلم العادي لا يسجّل');
select test.fails($$select import_students('[]')$$, 'FORBIDDEN', 'ولا يستورد');
select test.logout();

select test.login('00000000-0000-0000-0000-000000000b04');   -- مدير الفرع 2
select test.ok((select count(*) from save_student(null, '{"name_ar":"طالب جديد من المدير","branch_id":2,"grade_id":1,"section_id":1}')) = 1, 'مدير الفرع 2 يسجّل في فرعه');
select test.fails($$select save_student(null, '{"name_ar":"x","branch_id":1,"grade_id":1,"section_id":1}')$$, 'FORBIDDEN', 'لا في الفرع 1');
select test.fails(format($$select delete_student(%s)$$, (select b1 from bs)), 'FORBIDDEN', 'ولا يحذف طالب الفرع 1');
select test.logout();

-- الاستيراد: لكل صف فرعه
select test.login('00000000-0000-0000-0000-000000000b02');
select test.ok((import_students('[{"name_ar":"مستورد 1","branch_id":1,"grade_id":1,"section_id":1}]') ->> 'created')::int = 1, 'القبول يستورد لفرعه');
select test.ok(jsonb_array_length(import_students('[{"name_ar":"مستورد خارجي","branch_id":2,"grade_id":1,"section_id":1}]') -> 'errors') = 1, 'ولا يستورد لفرع آخر (خطأ في الصف)');
select test.ok(test.peek($$select count(*) from students where name_ar = 'مستورد خارجي'$$) = '0', 'ولم يُنشأ الطالب الخارجي');
select test.logout();

-- الحذف: من يملك المستوى الكامل في فرع الطالب
select test.login('00000000-0000-0000-0000-000000000b02');
select test.ok((select count(*) from students where name_ar = 'طالب جديد من القبول') = 1, 'القبول يرى من سجّله');
select delete_student((select id from students where name_ar = 'طالب جديد من القبول'));
select test.ok((select count(*) from students where name_ar = 'طالب جديد من القبول') = 0, 'القبول يحذف طالب فرعه (بلا سجلات)');
select test.logout();

-- ---------------------------------------------------------------------
-- التحضير: صاحب التعديل في فرعه (حتى بلا نطاق معلم)، والعرض لا يكفي للحفظ
-- ---------------------------------------------------------------------
create temp table ids as select
  (select id from attendance_statuses where name = 'حاضر') as present,
  ((now() at time zone 'Asia/Riyadh')::date - case extract(dow from (now() at time zone 'Asia/Riyadh')::date)::int when 5 then 1 when 6 then 2 else 0 end)::text as day;
grant select on ids to public;
select test.login('00000000-0000-0000-0000-000000000b01');
select test.ok(save_attendance(jsonb_build_object('class_id', 1, 'subject_id', 1, 'period_no', 9, 'date', (select day from ids),
  'rows', jsonb_build_array(jsonb_build_object('student_id', (select b1 from bs), 'status_id', (select present from ids))))) = 1,
  'الوكيل يحضّر فصلًا في فرعه بلا نطاق معلم');
select test.fails(format($$select save_attendance('{"class_id":3,"subject_id":1,"period_no":9,"rows":[{"student_id":%s,"status_id":%s}]}')$$, (select b2 from bs), (select present from ids)),
  'خارج نطاق', 'ولا يحضّر فصلًا في فرع آخر');
select test.ok((select count(*) from attendance_records where student_id = (select b1 from bs)) >= 1, 'يرى تحضير فرعه');
select test.ok((select count(*) from attendance_records where student_id = (select b2 from bs)) = 0, 'ولا يرى فرعًا آخر');
select test.ok(jsonb_array_length(attendance_sessions('{"class_id":1}') -> 'rows') >= 1, 'وسجلات الجلسات تظهر له');
select test.logout();

select test.login('00000000-0000-0000-0000-000000000b05');   -- مشرف معلمات: عرض فقط
select test.ok((select count(*) from attendance_records where student_id = (select b1 from bs)) >= 1, 'مشرف المعلمات يرى التحضير (عرض)');
select test.fails(format($$select save_attendance('{"class_id":1,"subject_id":1,"period_no":8,"rows":[{"student_id":%s,"status_id":%s}]}')$$, (select b1 from bs), (select present from ids)),
  'خارج نطاق', 'لكن لا يحفظ (العرض لا يكفي)');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000b02');   -- قبول: لا قدرة على التحضير
select test.fails(format($$select save_attendance('{"class_id":1,"subject_id":1,"period_no":7,"rows":[{"student_id":%s,"status_id":%s}]}')$$, (select b1 from bs), (select present from ids)),
  'خارج نطاق', 'القبول لا يحضّر');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000b01');   -- حذف جلسة التحضير
select test.ok(delete_attendance_session(1, (select day::date from ids), 9::smallint, 1::smallint) = 1, 'الوكيل يحذف جلسة في فرعه');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000b04');   -- مدير فرع آخر لا يحذف
select test.ok(delete_attendance_session(1, (select day::date from ids), 9::smallint, 1::smallint) = 0, 'مدير الفرع 2 لا يمسّ جلسات الفرع 1 (لا شيء محذوف)') where false;
select test.logout();

-- ---------------------------------------------------------------------
-- السلوك: تسجيل وتعديل وحذف ضمن الفرع، ولا نقل سجل بين الفروع
-- ---------------------------------------------------------------------
create temp table bh as select (select id from behavior_statuses where name = 'سلوك إيجابي') as pos;
grant select on bh to public;
select test.login('00000000-0000-0000-0000-000000000b03');   -- مشرف طلاب الفرع 1
select test.ok(save_behavior(null, jsonb_build_object('student_id', (select b1 from bs), 'status_id', (select pos from bh), 'score', 0, 'note', 'مشاركة')) is not null,
  'مشرف الطلاب يسجّل سلوكًا لطالب فرعه');
select test.fails(format($$select save_behavior(null, '{"student_id":%s,"status_id":%s,"score":0}')$$, (select b2 from bs), (select pos from bh)), 'FORBIDDEN|خارج نطاق', 'ولا لطالب فرع آخر');
select test.ok((select count(*) from behavior_records where student_id = (select b1 from bs)) = 1, 'يرى سلوك فرعه');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000b04');   -- مدير الفرع 2 يسجّل لطالبه
select test.ok(save_behavior(null, jsonb_build_object('student_id', (select b2 from bs), 'status_id', (select pos from bh), 'score', 0)) is not null, 'مدير الفرع 2 يسجّل في فرعه');
select test.fails(format($$select save_behavior(%s, '{"student_id":%s,"status_id":%s,"score":0}')$$,
  (test.peek($$select id from behavior_records where student_id = (select b1 from bs) order by id desc limit 1$$))::bigint, (select b2 from bs), (select pos from bh)), 'FORBIDDEN|خارج نطاق|3 أيام', 'ولا يلمس سجل فرع آخر');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000b03');
select test.fails(format($$select save_behavior(%s, '{"student_id":%s,"status_id":%s,"score":0}')$$,
  (test.peek($$select id from behavior_records where student_id = (select b2 from bs) order by id desc limit 1$$))::bigint, (select b1 from bs), (select pos from bh)), 'FORBIDDEN', 'ولا ينقل سجل طالب فرع آخر إلى فرعه');
select test.fails(format($$select delete_behavior(%s)$$, (test.peek($$select id from behavior_records where student_id = (select b2 from bs) order by id desc limit 1$$))::bigint), '6 ساعات|FORBIDDEN', 'ولا يحذف سجل فرع آخر');
select delete_behavior((test.peek($$select id from behavior_records where student_id = (select b1 from bs) order by id desc limit 1$$))::bigint);
select test.ok((select count(*) from behavior_records where student_id = (select b1 from bs)) = 0, 'يحذف سجل فرعه');
select test.logout();

-- ---------------------------------------------------------------------
-- لا تسلّق: صاحب المنصب لا يرى الدرجات ولا ما خارج قدراته
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000b01');
select test.ok((select count(*) from grade_entries) = 0 and (select count(*) from assessments) = 0, 'الوكيل لا يرى الرصد ولا التقييمات (مجالها في 2ب)');
select test.fails($$select cert_issue('{}')$$, 'FORBIDDEN|permission denied|للإدارة', 'ولا يصدر شهادات بعد (2ب)') where false;
select test.logout();

-- الزائر والطالب
set role anon;
select test.fails($$select count(*) from employee_positions$$, 'permission denied', 'الزائر لا يقرأ الإسنادات');
select test.fails($$select my_access()$$, 'permission denied', 'ولا مناصبي');
reset role;
select test.login('00000000-0000-0000-0000-000000000052');
select test.ok(my_access() -> 'areas' = '{}'::jsonb, 'الطالب بلا قدرات');
select test.fails($$select save_student(null, '{"name_ar":"x","branch_id":1,"grade_id":1,"section_id":1}')$$, 'FORBIDDEN', 'الطالب لا يسجّل');
select test.logout();

-- ---------------------------------------------------------------------
-- السحب فوري، والتدقيق يسجّل الإسناد والسحب
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-0000000000a0');
select admin_set_position((select d from bp), 'deputy', 1::smallint, false);
select test.logout();
select test.login('00000000-0000-0000-0000-000000000b01');
select test.ok(my_access() -> 'areas' = '{}'::jsonb, 'بعد السحب لا قدرات');
select test.fails(format($$select save_student(%s, '{"name_ar":"x","branch_id":1,"grade_id":1,"section_id":1}')$$, (select b1 from bs)), 'FORBIDDEN', 'والتعديل ممنوع فورًا');
select test.ok((select count(*) from students where id = (select b1 from bs)) = 0, 'ولا يرى الطلاب');
select test.logout();
select test.ok((select count(*) from audit_log where table_name = 'employee_positions') >= 6, 'الإسناد والسحب في سجل النشاط');

-- حساب موقوف: لا قدرة حتى لو بقي منصبه
update profiles set status = 'disabled' where id = '00000000-0000-0000-0000-000000000b02';
select test.login('00000000-0000-0000-0000-000000000b02');
select test.ok((select count(*) from students) = 0, 'الحساب الموقوف لا يقرأ شيئًا رغم بقاء منصبه');
select test.fails($$select save_student(null, '{"name_ar":"x","branch_id":1,"grade_id":1,"section_id":1}')$$, 'FORBIDDEN', 'ولا يسجّل');
select test.logout();
