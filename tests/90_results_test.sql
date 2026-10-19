-- =====================================================================
-- هجرة 23: النتائج وإشعار الدرجات
-- بيانات مستقلة: شعبة "ج" (فصل جديد) وفرع انتساب، وطلاب S90A/S90B/S90C
-- =====================================================================
\set ON_ERROR_STOP 1
create temp table r (k text primary key, v bigint);
grant all on r to authenticated, service_role;

insert into sections (name) values ('ج');
insert into branches (name) values ('نظام الانتساب');
insert into classes (branch_id, grade_id, section_id)
select 1, 1, (select id from sections where name = 'ج');
insert into classes (branch_id, grade_id, section_id)
select (select id from branches where name = 'نظام الانتساب'), 1, 1;
insert into r select 'cls', id from classes where section_id = (select id from sections where name = 'ج');
insert into r select 'icls', id from classes where branch_id = (select id from branches where name = 'نظام الانتساب');
insert into r select 'ibr', id from branches where name = 'نظام الانتساب';

insert into eval_types (name) values ('اختبار نهائي');
insert into r select 'fin', id from eval_types where name = 'اختبار نهائي';
select test.ok((select report_section from eval_types where name = 'اختبار نهائي') = 'final', 'النهائي يُصنّف قسمًا نهائيًا تلقائيًا');
select test.ok((select report_section from eval_types where name = 'اختبارات قصيرة') = 'quizzes'
           and (select report_section from eval_types where name = 'واجبات') = 'term_work', 'القصيرة اختبارات، والواجبات أعمال ترم');
select test.ok((select name_en from eval_types where name = 'واجبات') = 'Homework', 'ترجمة مبدئية لأنواع التقييم');
select test.ok((select name_en from subjects where name = 'رياضيات') = 'Mathematics', 'ترجمة مبدئية للمواد');
insert into grade_weights (subject_id, eval_type_id, weight) select 1, id, 50 from eval_types where name = 'اختبار نهائي';
insert into subject_matrix (branch_id, grade_id, section_id, subject_id) values (1, 1, null, 1), (1, 1, null, 2)
  on conflict do nothing;

insert into students (code, name_ar, name_en, national_id, class_id)
select 'S90A', 'أحمد النتائج', 'Ahmed', '1090000001', v from r where k = 'cls';
insert into students (code, name_ar, class_id) select 'S90B', 'بدر النتائج', v from r where k = 'cls';
insert into students (code, name_ar, class_id) select 'S90C', 'خالد المنتسب', v from r where k = 'icls';
insert into r select 'a', id from students where code = 'S90A';
insert into r select 'b', id from students where code = 'S90B';
insert into r select 'c', id from students where code = 'S90C';
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000091'), ('00000000-0000-0000-0000-000000000092'),
                                   ('00000000-0000-0000-0000-000000000093');
insert into profiles (id, username, role, student_id, status)
select '00000000-0000-0000-0000-000000000091', 's90a', 'student', v, 'active' from r where k = 'a';
insert into profiles (id, username, role, student_id, status)
select '00000000-0000-0000-0000-000000000092', 's90b', 'student', v, 'active' from r where k = 'b';
insert into profiles (id, username, role, student_id, status)
select '00000000-0000-0000-0000-000000000093', 's90c', 'student', v, 'active' from r where k = 'c';

-- تقييمات الفصل: واجب من 10 (نسبة 20)، قصير من 20 (نسبة 30)، نهائي من 50 (نسبة 50)
insert into assessments (kind, class_id, subject_id, term_id, eval_type_id, teacher_id, title, max_score)
select 'manual', v, 1, 1, 1, 2, 'واجب ن', 10 from r where k = 'cls';
insert into r select 'hw', max(id) from assessments;
insert into assessments (kind, class_id, subject_id, term_id, eval_type_id, teacher_id, title, max_score)
select 'manual', v, 1, 1, 2, 2, 'قصير ن', 20 from r where k = 'cls';
insert into r select 'qz', max(id) from assessments;
insert into assessments (kind, class_id, subject_id, term_id, eval_type_id, teacher_id, title, max_score)
select 'manual', (select v from r where k = 'cls'), 1, 1, v, 2, 'نهائي ن', 50 from r where k = 'fin';
insert into r select 'fn', max(id) from assessments;
insert into assessments (kind, class_id, subject_id, term_id, eval_type_id, teacher_id, title, max_score)
select 'manual', v, 1, 1, 1, 2, 'واجب منتسب', 10 from r where k = 'icls';
insert into r select 'ihw', max(id) from assessments;

insert into grade_entries (assessment_id, student_id, score, max_score, recorded_by)
select (select v from r where k = 'hw'), (select v from r where k = 'a'), 8, 10, 2
union all select (select v from r where k = 'qz'), (select v from r where k = 'a'), 15, 20, 2
union all select (select v from r where k = 'fn'), (select v from r where k = 'a'), 40, 50, 2
union all select (select v from r where k = 'hw'), (select v from r where k = 'b'), 10, 10, 2
union all select (select v from r where k = 'ihw'), (select v from r where k = 'c'), 9, 10, 2;

-- سلوك سلبي لأحمد (−10)
insert into behavior_records (student_id, term_id, status_id, score, occurred_on)
select (select v from r where k = 'a'), 1, (select id from behavior_statuses where name = 'سلوك سلبي'), 10, current_date;

-- ---------------------------------------------------------------------
-- كشف الطالب
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000091');
insert into r select 'rep_ok', 1 where my_report_card(1::smallint) ->> 'status' = 'ok';
select test.ok((select count(*) from r where k = 'rep_ok') = 1, 'الطالب يرى إشعاره بلا قواعد حجب');
select test.ok((select (x ->> 'term_work')::numeric = 16 and (x ->> 'quizzes')::numeric = 22.5 and (x ->> 'final')::numeric = 40
                       and (x ->> 'total')::numeric = 78.5 and x ->> 'rating_ar' = 'جيد' and x ->> 'rating_en' = 'Good'
                  from jsonb_array_elements(my_report_card(1::smallint) -> 'student' -> 'subjects') x where (x ->> 'subject_id')::int = 1),
  'أقسام المادة: أعمال الترم 16 + القصيرة 22.5 + النهائي 40 = 78.5 (جيد)');
select test.ok((select (x ->> 'term_work')::numeric = 20 and (x ->> 'quizzes')::numeric = 30 and (x ->> 'final')::numeric = 50
                  from jsonb_array_elements(my_report_card(1::smallint) -> 'subjects') x where (x ->> 'id')::int = 1),
  'عظمى كل قسم من توزيع الدرجات');
select test.ok((my_report_card(1::smallint) -> 'student' ->> 'average')::numeric = 78.5, 'المعدل من المواد المرصودة فقط');
select test.ok((my_report_card(1::smallint) -> 'student' -> 'behavior' ->> 'score')::numeric = 90, 'السلوك 100 − 10');
select test.ok(my_report_card(1::smallint) -> 'student' -> 'rank' = 'null'::jsonb, 'لا ترتيب في إشعار الطالب');
select test.ok(jsonb_array_length(my_result_terms()) >= 1, 'فصول الطالب الدراسية');
select test.fails($$select class_results(1, 1::smallint)$$, 'للإدارة', 'الطالب لا يرى كشف الفصل');
select test.ok((select count(*) from result_release_rules) = 0, 'الطالب لا يقرأ قواعد الإتاحة');
select test.logout();

select test.login('00000000-0000-0000-0000-0000000000e6');
select test.fails($$select class_results(1, 1::smallint)$$, 'للإدارة', 'المعلم لا يرى كشف الفصل');
select test.fails($$select save_release_rule(null, '{}')$$, 'للإدارة', 'المعلم لا يضع قواعد إتاحة');
select test.logout();

-- ---------------------------------------------------------------------
-- الانتساب ومنح المواظبة
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-0000000000a0');
select test.ok(save_report_labels(jsonb_build_object('branches', jsonb_build_array(jsonb_build_object('id', (select v from r where k = 'ibr'), 'is_intisab', true)))) = 1,
  'تعليم الفرع كفرع انتساب');
select test.ok((student_report_card((select v from r where k = 'c'), 1::smallint) -> 'student' -> 'attendance' ->> 'intisab')::boolean
           and student_report_card((select v from r where k = 'c'), 1::smallint) -> 'student' -> 'attendance' -> 'pct' = 'null'::jsonb,
  'المنتسب بلا مواظبة');
select save_attendance_grant((select v from r where k = 'c'), 1::smallint, 100, 'بطلب الطالب');
select test.ok((student_report_card((select v from r where k = 'c'), 1::smallint) -> 'student' -> 'attendance' ->> 'pct')::numeric = 100
           and (student_report_card((select v from r where k = 'c'), 1::smallint) -> 'student' -> 'attendance' ->> 'granted')::boolean,
  'منح المواظبة للمنتسب بطلبه');
select save_attendance_grant((select v from r where k = 'c'), 1::smallint, 95, null);
select test.ok((select count(*) from attendance_grants where student_id = (select v from r where k = 'c')) = 1, 'إعادة المنح تعدّل ولا تكرر');
select test.fails($$select save_attendance_grant(1, 1::smallint, 120, null)$$, 'بين 0 و 100', 'درجة المنح بين 0 و 100');

-- كشف الفصل للإدارة
select test.ok(jsonb_array_length(class_results((select v from r where k = 'cls')::int, 1::smallint) -> 'students') = 2, 'كشف الفصل: كل طلابه');
select test.ok((select (x ->> 'rank')::int = 1 from jsonb_array_elements(class_results((select v from r where k = 'cls')::int, 1::smallint) -> 'students') x
                 where x ->> 'code' = 'S90A'), 'ترتيب الطالب في كشف الإدارة');
select test.ok((select x ->> 'national_id' = '1090000001' from jsonb_array_elements(class_results((select v from r where k = 'cls')::int, 1::smallint) -> 'students') x
                 where x ->> 'code' = 'S90A'), 'بيانات الطالب كاملة في الكشف');
select test.ok((select (x -> 'average')::text::numeric from jsonb_array_elements(results_overview(1::smallint)) x
                 where (x ->> 'class_id')::bigint = (select v from r where k = 'cls')) = 49.25, 'نظرة عامة: معدل الفصل');

-- ---------------------------------------------------------------------
-- قواعد الإتاحة
-- ---------------------------------------------------------------------
select test.fails($$select save_release_rule(null, '{"kind":"allow"}')$$, 'تحتاج', 'الإتاحة الاستثنائية تحتاج هدفًا');
select test.fails($$select save_release_rule(null, '{"opens_at":"2030-01-02","closes_at":"2030-01-01"}')$$, 'بعد تاريخ', 'الإغلاق بعد الإتاحة');
select test.ok(release_rule_reach(jsonb_build_object('class_ids', jsonb_build_array((select v from r where k = 'cls')))) = 2, 'معاينة عدد المتأثرين');
insert into r select 'all', save_release_rule(null, '{"kind":"block","term_ids":[1],"note":"حتى اعتماد النتائج"}');
select test.logout();

select test.login('00000000-0000-0000-0000-000000000091');
select test.ok(my_report_card(1::smallint) ->> 'status' = 'hidden'
           and my_report_card(1::smallint) -> 'access' ->> 'reason' = 'blocked', 'الحجب العام يخفي الإشعار');
select test.ok((select count(*) from grade_totals) = 0, 'ولا تُستنتج المجاميع من grade_totals');
select test.ok(my_report_card(2::smallint) is not null, 'فصل دراسي آخر غير مشمول');
select test.logout();

select test.login('00000000-0000-0000-0000-0000000000a0');
select test.ok((select count(*) from grade_totals where student_id = (select v from r where k = 'a')) = 1, 'الإدارة ترى المجاميع دائمًا');
-- استثناء طالب واحد (الأخص يغلب)
insert into r select 'allow', save_release_rule(null, jsonb_build_object('kind', 'allow', 'student_ids', jsonb_build_array((select v from r where k = 'a'))));
-- الفصل يُتاح مستقبلًا
insert into r select 'cls_rule', save_release_rule(null, jsonb_build_object('kind', 'block', 'class_ids', jsonb_build_array((select v from r where k = 'cls')),
                                                                         'opens_at', now() + interval '3 days'));
select test.logout();

select test.login('00000000-0000-0000-0000-000000000091');
select test.ok(my_report_card(1::smallint) ->> 'status' = 'ok', 'استثناء الطالب يغلب حجب الفصل والعام');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000092');
select test.ok(my_report_card(1::smallint) -> 'access' ->> 'reason' = 'not_yet' and my_report_card(1::smallint) -> 'access' ->> 'opens_at' is not null,
  'قاعدة الفصل: تُتاح لاحقًا مع موعدها');
select test.logout();

select test.login('00000000-0000-0000-0000-0000000000a0');
select save_release_rule((select v from r where k = 'cls_rule'), jsonb_build_object('kind', 'block', 'class_ids', jsonb_build_array((select v from r where k = 'cls')),
                                                                                 'opens_at', now() - interval '1 day', 'closes_at', now() + interval '5 days'));
select test.logout();
select test.login('00000000-0000-0000-0000-000000000092');
select test.ok(my_report_card(1::smallint) ->> 'status' = 'ok' and my_report_card(1::smallint) -> 'access' ->> 'closes_at' is not null,
  'فترة العرض مفتوحة (الفصل يغلب الحجب العام) مع موعد الإغلاق');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000093');
select test.ok(my_report_card(1::smallint) ->> 'status' = 'hidden', 'طالب فصل آخر يبقى تحت الحجب العام');
select test.logout();

select test.login('00000000-0000-0000-0000-0000000000a0');
select save_release_rule((select v from r where k = 'cls_rule'), jsonb_build_object('kind', 'block', 'class_ids', jsonb_build_array((select v from r where k = 'cls')),
                                                                                 'opens_at', now() - interval '5 days', 'closes_at', now() - interval '1 day'));
select test.ok((class_results((select v from r where k = 'cls')::int, 1::smallint) -> 'access' -> (select v from r where k = 'b')::text ->> 'reason') = 'ended',
  'انتهت فترة العرض');
select set_release_rule_active((select v from r where k = 'all'), false);
select delete_release_rule((select v from r where k = 'cls_rule'));
select test.logout();
select test.login('00000000-0000-0000-0000-000000000093');
select test.ok(my_report_card(1::smallint) ->> 'status' = 'ok', 'تعطيل القاعدة يعيد الإتاحة');
select test.ok((my_report_card(1::smallint) -> 'student' -> 'attendance' ->> 'pct')::numeric = 95, 'المنتسب يرى المواظبة الممنوحة');
select test.logout();

-- إخفاء مادة بعينها يبقى نافذًا
insert into grade_visibility (student_id, subject_id, term_id, is_visible) select v, 1, 1, false from r where k = 'b';
select test.login('00000000-0000-0000-0000-000000000092');
select test.ok(not exists (select 1 from jsonb_array_elements(my_report_card(1::smallint) -> 'student' -> 'subjects') x where (x ->> 'subject_id')::int = 1),
  'المادة المخفية لا تظهر في إشعار الطالب');
select test.logout();
