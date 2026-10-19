-- =====================================================================
-- هجرة 22: التحضير والسلوك (يعتمد على بيانات 60: المعلم E60 والطالبان S60A وS60B في الفصل 1)
-- =====================================================================
\set ON_ERROR_STOP 1
insert into attendance_statuses (name) values ('متأخر'), ('مستأذن');
insert into behavior_statuses (name) values ('سلوك إيجابي'), ('سلوك سلبي');
create temp table k (k text primary key, v text);
grant all on k to authenticated;
-- يوم دراسي حديث (آخر يوم من الأحد إلى الخميس) وأسبوع يغطيه
insert into k select 'day', ((now() at time zone 'Asia/Riyadh')::date - case extract(dow from (now() at time zone 'Asia/Riyadh')::date)::int when 5 then 1 when 6 then 2 else 0 end)::text;
insert into calendar_entries (term_id, week_label, starts_on, ends_on)
select 1, 'أسبوع الاختبار', (v::date - extract(dow from v::date)::int), (v::date - extract(dow from v::date)::int) + 4 from k where k = 'day';
insert into k select 'a', id::text from students where code = 'S60A';
insert into k select 'b', id::text from students where code = 'S60B';
insert into k select 'present', id::text from attendance_statuses where name = 'حاضر';
insert into k select 'absent', id::text from attendance_statuses where name = 'غائب';
insert into k select 'late', id::text from attendance_statuses where name = 'متأخر';
insert into k select 'neg', id::text from behavior_statuses where name = 'سلوك سلبي';
insert into k select 'pos', id::text from behavior_statuses where name = 'سلوك إيجابي';
insert into timetable_slots (class_id, subject_id, teacher_id, day_of_week, period_no)
select 1, 1, (select id from employees where code = 'E60'), extract(dow from (select v::date from k where k = 'day'))::int, 3;

select test.ok(app.att_kind('غائب بعذر') = 'absent' and app.att_kind('متأخر') = 'late' and app.att_kind('حاضر') = 'present', 'تصنيف حالات التحضير');
select test.ok(app.beh_kind('سلوك سلبي') = 'negative' and app.beh_kind('سلوك إيجابي') = 'positive', 'تصنيف حالات السلوك');

select test.login('00000000-0000-0000-0000-0000000000e6');
select test.fails($$insert into attendance_records (student_id, week_id, day_of_week, period_no, status_id) values (1, 1, 0, 1, 1)$$,
                  'permission denied', 'لا كتابة مباشرة في التحضير');
select test.ok(save_attendance(jsonb_build_object('class_id', 1, 'subject_id', 1, 'period_no', 3, 'date', (select v from k where k = 'day'),
  'rows', jsonb_build_array(
    jsonb_build_object('student_id', (select v from k where k = 'a')::bigint, 'status_id', (select v from k where k = 'present')::int),
    jsonb_build_object('student_id', (select v from k where k = 'b')::bigint, 'status_id', (select v from k where k = 'absent')::int, 'note', 'بلا عذر')))) = 2,
  'تحضير حصة كاملة');
select test.ok((select (x ->> 'recorded')::int = 2 and (x ->> 'absent')::int = 1 from jsonb_array_elements(my_periods((select v::date from k where k = 'day'))) x where (x ->> 'period_no')::int = 3),
  'حصص المعلم اليوم تُظهر حالة التحضير');
-- تعديل: الغائب صار متأخرًا
select test.ok(save_attendance(jsonb_build_object('class_id', 1, 'subject_id', 1, 'period_no', 3, 'date', (select v from k where k = 'day'),
  'rows', jsonb_build_array(jsonb_build_object('student_id', (select v from k where k = 'b')::bigint, 'status_id', (select v from k where k = 'late')::int)))) = 1,
  'تعديل حالة طالب');
select test.ok((select count(*) from attendance_records where class_id = 1 and occurred_on = (select v::date from k where k = 'day')) = 2, 'لا تكرار عند التعديل');
select test.fails($$select save_attendance('{"class_id":2,"subject_id":1,"period_no":1,"rows":[{"student_id":3,"status_id":1}]}')$$, 'خارج نطاق', 'لا تحضير لفصل خارج النطاق');
select test.fails(format($$select save_attendance('{"class_id":1,"subject_id":1,"period_no":1,"date":"%s","rows":[{"student_id":%s,"status_id":%s}]}')$$,
                         (select v::date + 7 from k where k = 'day'), (select v from k where k = 'a'), (select v from k where k = 'present')), 'لم يأتِ', 'لا تحضير ليوم قادم');
select test.fails(format($$select save_attendance('{"class_id":1,"subject_id":1,"period_no":1,"date":"%s","rows":[{"student_id":%s,"status_id":%s}]}')$$,
                         (select v::date - 30 from k where k = 'day'), (select v from k where k = 'a'), (select v from k where k = 'present')), 'الإدارة', 'المعلم لا يحضّر يومًا قديمًا');
select test.ok((attendance_sessions('{}') ->> 'total')::int >= 1, 'سجلات التحضير مجمّعة بالحصة');
-- نسبة الحضور: طالب متأخر في حصة واحدة = 75%
select test.ok((select (x ->> 'pct')::int from jsonb_array_elements(attendance_summary(1, 1::smallint)) x where (x ->> 'student_id')::bigint = (select v from k where k = 'b')::bigint) = 75,
  'المتأخر يُخصم ربع حصة (75%)');
select test.ok(delete_attendance_session(1, (select v::date from k where k = 'day'), 3::smallint, 1::smallint) = 2, 'حذف تحضير حصة خلال 6 ساعات');
select test.logout();

select test.login('00000000-0000-0000-0000-000000000061');
select test.fails($$select attendance_sessions('{}')$$, 'FORBIDDEN', 'الطالب لا يرى سجلات التحضير');
select test.logout();

-- السلوك
select test.login('00000000-0000-0000-0000-0000000000e6');
insert into k select 'b1', save_behavior(null, jsonb_build_object('student_id', (select v from k where k = 'a')::bigint, 'status_id', (select v from k where k = 'neg')::int, 'score', 5, 'note', 'تأخر عن الحصة', 'date', (select v from k where k = 'day')))::text;
select save_behavior(null, jsonb_build_object('student_id', (select v from k where k = 'a')::bigint, 'status_id', (select v from k where k = 'pos')::int, 'score', 0, 'note', 'مشاركة متميزة', 'date', (select v from k where k = 'day')));
select test.ok((behavior_summary((select v from k where k = 'a')::bigint, 1::smallint) ->> 'score')::numeric = 95, 'السلوك 100 − 5 = 95');
select test.ok((behavior_summary((select v from k where k = 'a')::bigint, 1::smallint) ->> 'positive')::int = 1, 'الإيجابي يُعدّ ولا يُخصم');
select test.ok(jsonb_array_length(behavior_board(1::smallint) -> 'lowest') = 1, 'لوحة السلوك');
select test.fails($$select save_behavior(null, '{"student_id":3,"status_id":1,"score":1}')$$, 'نطاق', 'لا سلوك لطالب خارج النطاق');
select test.fails($$insert into behavior_records (student_id, status_id) values (1, 1)$$, 'permission denied', 'لا كتابة مباشرة في السلوك');
select delete_behavior((select v from k where k = 'b1')::bigint);
select test.ok((behavior_summary((select v from k where k = 'a')::bigint, 1::smallint) ->> 'score')::numeric = 100, 'حذف السلبي يعيد الدرجة');
select test.logout();

select test.login('00000000-0000-0000-0000-000000000061');
select test.ok((select count(*) from behavior_records) = 1, 'الطالب يرى سلوكه');
select test.fails($$select behavior_board(1::smallint)$$, 'FORBIDDEN', 'ولا يرى لوحة السلوك');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000062');
select test.ok((select count(*) from behavior_records) = 0, 'ولا يرى سلوك غيره');
select test.logout();
