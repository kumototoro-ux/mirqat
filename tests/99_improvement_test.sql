-- =====================================================================
-- هجرة 27: تحسين درجة الطالب — نفس أرقام قواعد Apps Script (impRun_)
-- يعتمد على الطالب A900 من اختبار 98 (فصل الفرع الرئيسي، مادة 1، الوزن: القصيرة 30)
-- =====================================================================
\set ON_ERROR_STOP 1

-- القاعدة نفسها
select test.ok(app.apply_improvements(4.9, 10, array[1]) = 5, 'دون النصف: تُرفع حتى نصف الوزن فقط');
select test.ok(app.apply_improvements(3, 10, array[0.5]) = 5, 'دون النصف: نسبة التحسين × الوزن، حتى النصف');
select test.ok(app.apply_improvements(2, 10, array[0.2]) = 4, 'دون النصف: إضافة جزئية');
select test.ok(app.apply_improvements(8, 10, array[1]) = 10, 'بين النصف و99%: 20% من الوزن × النسبة');
select test.ok(app.apply_improvements(9.5, 10, array[1]) = 10, 'ولا يتجاوز الوزن أبدًا');
select test.ok(app.apply_improvements(9.95, 10, array[1]) = 9.95, '99% فأكثر: لا شيء');
select test.ok(app.apply_improvements(3, 10, array[1, 0.5]) = 6, 'تحسينان بالترتيب: 3 ← 5 ← 6');
select test.ok(app.apply_improvements(null, 0, array[1]) is null, 'بلا وزن: لا تغيير');

-- رصد أصلي: 3 من 10 في الاختبارات القصيرة (وزنها 30) ← 9 من 30
create temp table ri (k text primary key, v bigint);
grant all on ri to authenticated, service_role;
insert into ri select 'stu', id from students where code = 'A900';
insert into ri select 'cls', class_id from students where code = 'A900';
insert into assessments (kind, class_id, subject_id, term_id, eval_type_id, title, max_score, published_at, grades_recorded_at)
values ('manual', (select v from ri where k = 'cls'), 1, 1, 2, 'قصير للتحسين', 10, now(), now());
insert into grade_entries (assessment_id, student_id, score, max_score)
select a.id, (select v from ri where k = 'stu'), 3, 10 from assessments a where a.title = 'قصير للتحسين';

select test.login('00000000-0000-0000-0000-0000000000a0');
select test.ok((select (x ->> 'current')::numeric from jsonb_array_elements(improvement_state((select v from ri where k = 'stu'), 1::smallint, 1::smallint) -> 'types') x
                 where (x ->> 'eval_type_id')::int = 2) = 9, 'الحالة: الدرجة الحالية 9 من 30');
select test.ok(not exists (select 1 from jsonb_array_elements(improvement_state((select v from ri where k = 'stu'), 1::smallint, 1::smallint) -> 'types') x
                 where (x ->> 'eval_type_id')::int = 3), 'الاختبار النهائي لا يظهر للتحسين');
select test.ok((improvement_preview((select v from ri where k = 'stu'), 1::smallint, 1::smallint, 2::smallint, 10, 10) ->> 'after')::numeric = 15, 'المعاينة: 9 ← 15 (نصف الوزن)');

select test.fails($$select save_improvement(jsonb_build_object('student_id', (select v from ri where k = 'stu'), 'subject_id', 1, 'term_id', 1, 'eval_type_id', 3, 'earned', 5, 'max', 10, 'reason', 'x'))$$, 'النهائي', 'لا تحسين للاختبار النهائي');
select test.fails($$select save_improvement(jsonb_build_object('student_id', (select v from ri where k = 'stu'), 'subject_id', 1, 'term_id', 1, 'eval_type_id', 2, 'earned', 5, 'max', 10, 'reason', '  '))$$, 'سبب التحسين', 'السبب إلزامي');
select test.fails($$select save_improvement(jsonb_build_object('student_id', (select v from ri where k = 'stu'), 'subject_id', 1, 'term_id', 1, 'eval_type_id', 2, 'earned', 0, 'max', 10, 'reason', 'لا شيء'))$$, 'لن يضيف', 'تحسين لا يضيف شيئًا لا يُحفظ (لا يستهلك الحد)');

select test.ok((save_improvement(jsonb_build_object('student_id', (select v from ri where k = 'stu'), 'subject_id', 1, 'term_id', 1, 'eval_type_id', 2, 'earned', 10, 'max', 10, 'reason', 'اختبار إعادة')) ->> 'after')::numeric = 15, 'التحسين الأول: 9 ← 15');
select test.ok((save_improvement(jsonb_build_object('student_id', (select v from ri where k = 'stu'), 'subject_id', 1, 'term_id', 1, 'eval_type_id', 2, 'earned', 5, 'max', 10, 'reason', 'واجب إضافي')) ->> 'after')::numeric = 18, 'التحسين الثاني: 15 ← 18 (20% × النسبة)');
select test.fails($$select save_improvement(jsonb_build_object('student_id', (select v from ri where k = 'stu'), 'subject_id', 1, 'term_id', 1, 'eval_type_id', 1, 'earned', 5, 'max', 10, 'reason', 'ثالث'))$$, 'استُنفد', 'تحسينان فقط لكل مادة في الفصل الدراسي');

-- النتائج تطبّق التحسين، والرصد الأصلي لم يتغير
select test.ok((select (s -> 'evals' ->> '2')::numeric
                  from jsonb_array_elements(class_results((select v from ri where k = 'cls')::int, 1::smallint) -> 'students') x,
                       jsonb_array_elements(x -> 'subjects') s
                 where x ->> 'code' = 'A900' and (s ->> 'subject_id')::int = 1) = 18, 'النتائج: درجة النوع بعد التحسين 18');
select test.ok((select ge.score from grade_entries ge join assessments a on a.id = ge.assessment_id where a.title = 'قصير للتحسين') = 3, 'الرصد الأصلي كما هو (3 من 10)');
select test.ok((list_improvements(null) ->> 'total')::int = 2, 'السجل يعرض التحسينين للإدارة');
select test.ok(json_array_length(backup_improvements(null)) = 2, 'التحسينات في النسخة الاحتياطية');
select test.logout();
insert into ri select 'imp', max(id) from grade_improvements;

-- المعلم يرى ما رصده هو فقط
select test.login('00000000-0000-0000-0000-0000000000e3');
select test.ok((list_improvements(null) ->> 'total')::int = 0, 'المعلم لا يرى تحسينات غيره');
select test.fails($$select delete_improvement((select v from ri where k = 'imp'))$$, 'رصدته أنت', 'ولا يحذفها');
select test.logout();

select test.login('00000000-0000-0000-0000-0000000000a0');
select delete_improvement((select v from ri where k = 'imp'));
select test.ok((list_improvements(null) ->> 'total')::int = 1, 'الإدارة تحذف أي تحسين');
select test.logout();
select test.ok((select count(*) from grade_improvements) = 1, 'والجدول نفسه محمي من القراءة المباشرة للمعلم (عبر الدوال فقط)');
