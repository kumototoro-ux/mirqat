-- =====================================================================
-- هجرة 30: حفظ أوراق الإجابة الورقية المصحَّحة بالكاميرا
-- يعتمد على بيانات 60: المعلم e6، الطالبان S60A و S60B في الفصل 1
-- =====================================================================
\set ON_ERROR_STOP 1
create temp table t30 (k text primary key, v bigint);
grant all on t30 to authenticated, service_role;

select test.login('00000000-0000-0000-0000-0000000000e6');
insert into t30 select 'form', (save_form(null, jsonb_build_object(
  'title', 'اختبار ورقي', 'subject_id', 1, 'term_id', 1, 'eval_type_id', 2,
  'details', jsonb_build_object('status', 'closed', 'opens_at', now() - interval '2 day', 'closes_at', now() - interval '1 day'),
  'questions', '[
    {"qtype":"mcq","body":"1+1","points":2,"options":[{"body":"1"},{"body":"2","is_correct":true},{"body":"3"},{"body":"4"}]},
    {"qtype":"tf","body":"الشمس نجم","points":1,"options":[{"body":"صح","is_correct":true},{"body":"خطأ"}]},
    {"qtype":"mcq","body":"2+2","points":2,"options":[{"body":"4","is_correct":true},{"body":"5"},{"body":"6"}]},
    {"qtype":"long","body":"اشرح","points":5},
    {"qtype":"short","body":"عاصمة؟","points":2,"config":{"answers":["الرياض"]}}
  ]'::jsonb), array[1]))[1];
select test.logout();

create temp table pq as
select fq.id, fq.qtype, fq.position,
       (select o.id from question_options o where o.question_id = fq.id and o.is_correct) as ok,
       (select o.id from question_options o where o.question_id = fq.id and not o.is_correct order by o.position limit 1) as bad
  from form_questions fq where fq.assessment_id = (select v from t30 where k = 'form');
grant select on pq to authenticated;
insert into t30 values ('a', (select id from students where code = 'S60A')), ('b', (select id from students where code = 'S60B'));

select test.login('00000000-0000-0000-0000-0000000000e6');
-- الطالب أ: سؤالان صحيحان + فارغ، والمقالي بدرجة، والقصيرة تبقى للتصحيح
create temp table r1 as select save_paper_attempt((select v from t30 where k = 'form'), (select v from t30 where k = 'a'),
  jsonb_build_object((select id from pq where position = 1)::text, (select ok from pq where position = 1),
                     (select id from pq where position = 2)::text, (select ok from pq where position = 2)),
  jsonb_build_object((select id from pq where qtype = 'long')::text, 3.5),
  '{"picks":["B","A",""]}') as r;
grant select on r1 to authenticated;
select test.ok((select (r ->> 'score')::numeric from r1) = 6.5, 'الدرجة = 2 + 1 + 3.5');
select test.ok((select (r ->> 'max_score')::numeric from r1) = 12, 'من 12');
select test.ok((select (r ->> 'pending_review')::int from r1) = 1, 'القصيرة تبقى للتصحيح');
select test.ok((select (r ->> 'replaced')::boolean from r1) = false, 'أول ورقة');
select test.logout();

select test.ok((select score from grade_entries where assessment_id = (select v from t30 where k = 'form') and student_id = (select v from t30 where k = 'a')) = 6.5, 'رُصدت في الدرجات');
select test.ok((select source from form_attempts where assessment_id = (select v from t30 where k = 'form') and student_id = (select v from t30 where k = 'a')) = 'paper', 'محاولة ورقية');
select test.ok((select scanned_by from form_attempts where assessment_id = (select v from t30 where k = 'form') and student_id = (select v from t30 where k = 'a')) is not null, 'يُحفظ من صحّحها');

-- إعادة التصوير تستبدل الورقة (لا تتكرر المحاولة)
select test.login('00000000-0000-0000-0000-0000000000e6');
select test.ok((save_paper_attempt((select v from t30 where k = 'form'), (select v from t30 where k = 'a'),
  jsonb_build_object((select id from pq where position = 1)::text, (select bad from pq where position = 1),
                     (select id from pq where position = 3)::text, (select ok from pq where position = 3))) ->> 'replaced')::boolean, 'الورقة الثانية تستبدل الأولى');
select test.logout();
select test.ok((select count(*) from form_attempts where assessment_id = (select v from t30 where k = 'form') and student_id = (select v from t30 where k = 'a')) = 1, 'محاولة واحدة فقط');
select test.ok((select score from grade_entries where assessment_id = (select v from t30 where k = 'form') and student_id = (select v from t30 where k = 'a')) = 2, 'الدرجة الجديدة 2');

-- تصحيح المكتوب لاحقًا من شاشة النتائج المعتادة
select test.login('00000000-0000-0000-0000-0000000000e6');
select grade_form_answer((select id from form_attempts where assessment_id = (select v from t30 where k = 'form') and student_id = (select v from t30 where k = 'a')),
                         (select id from pq where qtype = 'long'), 4);
select test.ok((select (x ->> 'pending_review')::int from (select jsonb_array_elements(paper_status((select v from t30 where k = 'form'))) x) y
                 where (x ->> 'student_id')::bigint = (select v from t30 where k = 'a')) = 1, 'المقالي صُحّح وبقيت القصيرة');

-- تعديل المفتاح يعيد تصحيح الاختيار، ولا يمسّ المكتوب
select test.logout();
begin;
update question_options set is_correct = false where question_id = (select id from pq where position = 1);
update question_options set is_correct = true where id = (select bad from pq where position = 1);
commit;
select test.ok((select score from grade_entries where assessment_id = (select v from t30 where k = 'form') and student_id = (select v from t30 where k = 'a')) = 8, 'بعد تعديل المفتاح: 2 + 2 + 4');
select test.ok((select status from attempt_answers aa join form_attempts t on t.id = aa.attempt_id
                 where t.assessment_id = (select v from t30 where k = 'form') and t.student_id = (select v from t30 where k = 'a')
                   and aa.question_id = (select id from pq where qtype = 'short')) = 'pending', 'القصيرة ما زالت للتصحيح');

-- الأخطاء
select test.login('00000000-0000-0000-0000-0000000000e6');
select test.fails(format($$select save_paper_attempt(%s, %s, jsonb_build_object('%s', %s))$$,
  (select v from t30 where k = 'form'), (select v from t30 where k = 'b'), (select id from pq where position = 1), (select ok from pq where position = 3)),
  'لا ينتمي', 'خيار من سؤال آخر مرفوض');
select test.fails(format($$select save_paper_attempt(%s, %s, jsonb_build_object('%s', %s))$$,
  (select v from t30 where k = 'form'), (select v from t30 where k = 'b'), (select id from pq where qtype = 'long'), 1),
  'ليست أسئلة اختيار', 'إجابة اختيار لسؤال مكتوب مرفوضة');
select test.fails(format($$select save_paper_attempt(%s, %s, '{}', jsonb_build_object('%s', 9))$$,
  (select v from t30 where k = 'form'), (select v from t30 where k = 'b'), (select id from pq where qtype = 'long')),
  'بين 0 و', 'درجة فوق درجة السؤال مرفوضة');
select test.fails(format($$select save_paper_attempt(%s, %s, '{}')$$,
  (select v from t30 where k = 'form'), 999999999),
  'ليس من صف', 'طالب ليس من الصف مرفوض');
select test.logout();

-- معلم آخر لا يملك النموذج
select test.login('00000000-0000-0000-0000-0000000000e2');
select test.fails(format($$select save_paper_attempt(%s, %s, '{}')$$, (select v from t30 where k = 'form'), (select v from t30 where k = 'b')),
  'لا تملك', 'معلم آخر لا يصحح ورقة نموذج غيره');
select test.fails(format($$select paper_status(%s)$$, (select v from t30 where k = 'form')), 'لا تملك', 'ولا يرى حالة الأوراق');
select test.logout();

-- لا تُستبدل محاولة إلكترونية بورقة
insert into form_attempts (assessment_id, student_id, attempt_no, score, max_score, source)
values ((select v from t30 where k = 'form'), (select v from t30 where k = 'b'), 1, 0, 12, 'online');
select test.login('00000000-0000-0000-0000-0000000000e6');
select test.fails(format($$select save_paper_attempt(%s, %s, '{}')$$, (select v from t30 where k = 'form'), (select v from t30 where k = 'b')),
  'محاولة إلكترونية', 'الإلكترونية لا تُستبدل');
select test.ok(jsonb_array_length(paper_status((select v from t30 where k = 'form'))) = 2, 'الحالة: ورقي + إلكتروني');
select test.logout();
