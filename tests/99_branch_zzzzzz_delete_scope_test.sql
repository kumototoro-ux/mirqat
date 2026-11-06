-- =====================================================================
-- هجرة 43: الحذف داخل النطاق فقط (يعتمد على معلم هجرة 40: f06)
-- =====================================================================
\set ON_ERROR_STOP 1
create temp table d43 as select
  (select employee_id from profiles where id = '00000000-0000-0000-0000-000000000f06') as emp,
  (select id from students where code = 'OV1') as stu,
  (select class_id from students where code = 'OV1') as cls;
grant select on d43 to public;
create temp table sc43 as select * from staff_scope where employee_id = (select emp from d43);
-- سجّل سلوكًا باسم المعلم (قبل سحب نطاقه)
insert into behavior_records (student_id, status_id, score, recorded_by, recorder_type, occurred_on)
  select stu, 2, 1, emp, 'teacher', current_date from d43;
create temp table b43 as select id from behavior_records where student_id = (select stu from d43) and recorded_by = (select emp from d43) order by id desc limit 1;
grant select on b43 to public;
-- اسحب نطاقه إلى الفرع 2 فقط
delete from staff_scope where employee_id = (select emp from d43);
insert into staff_scope (employee_id, branch_id) select emp, 2 from d43;
select test.login('00000000-0000-0000-0000-000000000f06');
select test.fails(format($$select public.delete_behavior(%s)$$, (select id from b43)),
                  'خارج نطاق', 'حذف سلوك طالب خرج من نطاقه ممنوع');
select test.fails(format($$select public.delete_attendance_session(%s, current_date, 1::smallint, 5::smallint)$$, (select cls from d43)),
                  'خارج نطاق', 'حذف تحضير فصل خرج من نطاقه ممنوع');
select test.logout();
select test.ok(exists (select 1 from behavior_records where student_id = (select stu from d43) and recorded_by = (select emp from d43)), 'السجل باقٍ');
delete from behavior_records where student_id = (select stu from d43) and recorded_by = (select emp from d43);
delete from staff_scope where employee_id = (select emp from d43);
insert into staff_scope (employee_id, branch_id, stage_id, grade_id, section_id, subject_id) select employee_id, branch_id, stage_id, grade_id, section_id, subject_id from sc43;
do $$ begin raise notice '✅ اختبارات هجرة 43'; end $$;
