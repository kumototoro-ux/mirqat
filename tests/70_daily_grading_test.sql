-- =====================================================================
-- هجرة 21: الرصد اليومي
-- (يعتمد على بيانات 60: المعلم E60 للفصل 1 مادة 1، والطالبان S60A وS60B)
-- =====================================================================
\set ON_ERROR_STOP 1
create temp table g (k text primary key, v bigint);
grant all on g to authenticated, service_role;
insert into g select 'a', id from students where code = 'S60A';
insert into g select 'b', id from students where code = 'S60B';

select test.login('00000000-0000-0000-0000-0000000000e6');
-- رصد يدوي للفصل كله
insert into g select 'm', save_manual(null, '{"title":"اختبار شفهي","subject_id":1,"term_id":1,"eval_type_id":1,"max_score":5,"description":"سورة الملك"}', 1, null,
  format('[{"student_id":%s,"score":5,"note":"ممتاز"},{"student_id":%s,"score":3}]', (select v from g where k='a'), (select v from g where k='b'))::jsonb);
select test.ok((select count(*) from grade_entries where assessment_id = (select v from g where k='m')) = 2, 'الرصد اليدوي أنشأ التقييم والكشف معًا');
select test.ok((select note from grade_entries where assessment_id = (select v from g where k='m') and student_id = (select v from g where k='a')) = 'ممتاز', 'الملاحظة حُفظت مع الدرجة');
select test.fails($$select save_manual(null, '{"title":"x","subject_id":1,"term_id":1,"eval_type_id":1,"max_score":5}', 2, null, null)$$, 'خارج نطاق', 'لا رصد يدوي لفصل خارج النطاق');
select test.fails(format($$select grade_task(%s, '[{"student_id":%s,"score":6}]')$$, (select v from g where k='m'), (select v from g where k='a')), 'الدرجة بين', 'درجة أعلى من العظمى مرفوضة');
-- تعديل الملاحظة وحدها
select grade_task((select v from g where k='m'), format('[{"student_id":%s,"note":"ممتاز جدًا"}]', (select v from g where k='a'))::jsonb);
select test.ok((select note from grade_entries where assessment_id = (select v from g where k='m') and student_id = (select v from g where k='a')) = 'ممتاز جدًا', 'تعديل الملاحظة دون الدرجة');
-- مسح درجة خلال 6 ساعات
select grade_task((select v from g where k='m'), format('[{"student_id":%s,"clear":true}]', (select v from g where k='b'))::jsonb);
select test.ok((select count(*) from grade_entries where assessment_id = (select v from g where k='m')) = 1, 'مسح درجة طالب خلال 6 ساعات');

-- رصد لطالب واحد
insert into g select 's', save_manual(null, '{"title":"مشاركة صفية","subject_id":1,"term_id":1,"eval_type_id":1,"max_score":2}', 1, (select v from g where k='a'),
  format('[{"student_id":%s,"score":2,"note":"أجاب عن سؤال صعب"}]', (select v from g where k='a'))::jsonb);
select test.fails(format($$select grade_task(%s, '[{"student_id":%s,"score":1}]')$$, (select v from g where k='s'), (select v from g where k='b')), 'طالب واحد', 'رصد الطالب الواحد لا يُضاف لغيره');
select test.ok(jsonb_array_length(my_recent_single()) = 1, 'آخر الرصد الفردي للمعلم');
select test.ok((select (r ->> 'class_size')::int from jsonb_array_elements(staff_assessments('{"include_manual":true,"kind":"manual"}') -> 'rows') r where (r ->> 'id')::bigint = (select v from g where k='s')) = 1,
               'سجل الرصد الفردي يُحسب لطالب واحد');
select test.ok((staff_assessments('{"kind":"manual"}') ->> 'total')::int = 0, 'المركز (المهام والنماذج) لا يعرض الرصد اليدوي');
select test.ok((staff_assessments('{"include_manual":true,"recorded":true}') ->> 'total')::int >= 3, 'سجلات الرصد');
select test.ok((staff_assessments('{"status":"to_record"}') ->> 'total')::int >= 1, 'قائمة "بانتظار الرصد"');
select test.logout();

select test.login('00000000-0000-0000-0000-000000000062');
select test.ok(not exists (select 1 from assessments where id = (select v from g where k='s')), 'زميل الفصل لا يرى رصد الطالب الواحد');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000061');
select test.ok(exists (select 1 from assessments where id = (select v from g where k='s')), 'صاحب الرصد يراه');
select test.ok((select note from grade_entries where assessment_id = (select v from g where k='s')) = 'أجاب عن سؤال صعب', 'والطالب يرى ملاحظة المعلم');
select test.fails(format($$select save_manual(%s, '{"title":"x","subject_id":1,"term_id":1,"eval_type_id":1,"max_score":5}', null, null, null)$$, (select v from g where k='m')),
                  'لا تملك|FORBIDDEN', 'الطالب لا يعدّل رصدًا');
select test.logout();

-- الحذف بعد 6 ساعات للإداري فقط
set app.migrating = 'on';
update grade_entries set recorded_at = now() - interval '7 hours' where assessment_id = (select v from g where k='m');
set app.migrating = 'off';
select test.login('00000000-0000-0000-0000-0000000000e6');
select test.fails(format($$select delete_manual(%s)$$, (select v from g where k='m')), '6 ساعات', 'المعلم لا يحذف رصدًا مضى عليه أكثر من 6 ساعات');
select test.fails(format($$select grade_task(%s, '[{"student_id":%s,"clear":true}]')$$, (select v from g where k='m'), (select v from g where k='a')), '6 ساعات', 'ولا يمسح درجة قديمة');
select delete_manual((select v from g where k='s'));
select test.ok(not exists (select 1 from assessments where id = (select v from g where k='s')), 'حذف رصد فردي حديث');
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000a0');
select delete_manual((select v from g where k='m'));
select test.ok(not exists (select 1 from assessments where id = (select v from g where k='m')), 'الإداري يحذف دائمًا');
select test.logout();

-- النماذج: الدرجة فقط بلا استعراض الأسئلة
update form_details set allow_review = false, show_results = 'after_submit'
 where assessment_id = (select id from assessments where title = 'اختبار شامل' and kind = 'form' order by id limit 1);
select test.login('00000000-0000-0000-0000-000000000061');
select test.ok((get_form_review((select id from assessments where title = 'اختبار شامل' and kind = 'form' order by id limit 1)) ->> 'status') = 'score_only', 'الطالب يرى درجته فقط');
select test.ok(position('questions' in get_form_review((select id from assessments where title = 'اختبار شامل' and kind = 'form' order by id limit 1))::text) = 0, 'بلا أسئلة ولا إجابات');
select test.logout();

select test.login('00000000-0000-0000-0000-000000000061');
select test.fails($$select staff_assessments('{}')$$, 'FORBIDDEN', 'الطالب لا يستدعي قوائم المعلم');
select test.fails($$select staff_assessment_stats()$$, 'FORBIDDEN', 'ولا إحصاءاته');
select test.logout();
