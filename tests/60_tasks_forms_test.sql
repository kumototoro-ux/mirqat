-- =====================================================================
-- هجرة 20: المهام والنماذج الموحّدة
-- =====================================================================
\set ON_ERROR_STOP 1

insert into students (code, name_ar, class_id) values ('S60A', 'طالب المهام أ', 1), ('S60B', 'طالب المهام ب', 1);
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000061'), ('00000000-0000-0000-0000-000000000062');
insert into profiles (id, username, role, student_id, status)
select '00000000-0000-0000-0000-000000000061', 's60a', 'student', id, 'active' from students where code = 'S60A';
insert into profiles (id, username, role, student_id, status)
select '00000000-0000-0000-0000-000000000062', 's60b', 'student', id, 'active' from students where code = 'S60B';

insert into employees (code, name_ar, user_type) values ('E60', 'معلم المهام', 'teacher');
insert into staff_scope (employee_id, branch_id) select id, 1 from employees where code = 'E60';
insert into staff_scope (employee_id, grade_id) select id, 1 from employees where code = 'E60';
insert into staff_scope (employee_id, section_id) select id, 1 from employees where code = 'E60';
insert into staff_scope (employee_id, subject_id) select id, 1 from employees where code = 'E60';
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000e6');
insert into profiles (id, username, role, employee_id, status)
select '00000000-0000-0000-0000-0000000000e6', 'e60', 'teacher', id, 'active' from employees where code = 'E60';

create temp table ids (k text primary key, v bigint);
grant all on ids to authenticated, service_role;

-- =====================================================================
-- 1) المهام
-- =====================================================================
select test.login('00000000-0000-0000-0000-0000000000e6');
insert into ids select 'task', (save_task(null, '{"title":"بحث عن الماء","subject_id":1,"term_id":1,"eval_type_id":1,"max_score":10,
  "due_at":"2099-01-01T10:00:00Z","submission_mode":"any",
  "attachments":[{"kind":"link","name":"مرجع","url":"https://example.com/a"}]}', array[1]) -> 'ids' ->> 0)::bigint;
select test.fails($$select save_task(null, '{"title":"خارج","subject_id":1,"term_id":1,"eval_type_id":1,"max_score":10,"due_at":"2099-01-01T10:00:00Z","submission_mode":"text"}', array[2])$$,
                  'خارج نطاق', 'المعلم لا ينشئ مهمة لفصل خارج نطاقه');
select test.fails($$select save_task(null, '{"title":"بلا موعد","subject_id":1,"term_id":1,"eval_type_id":1,"max_score":10,"submission_mode":"text"}', array[1])$$,
                  'موعد التسليم', 'مهمة بتسليم تحتاج موعدًا');
insert into ids select 'draft', (save_task(null, '{"title":"مسودة","subject_id":1,"term_id":1,"eval_type_id":1,"max_score":5,"is_draft":true}', array[1]) -> 'ids' ->> 0)::bigint;
insert into ids select 'later', (save_task(null, '{"title":"مجدولة","subject_id":1,"term_id":1,"eval_type_id":1,"max_score":5,"published_at":"2099-01-01T00:00:00Z"}', array[1]) -> 'ids' ->> 0)::bigint;
select test.ok((select count(*) from assessment_attachments where assessment_id = (select v from ids where k = 'task')) = 1, 'المرفق حُفظ');
select test.logout();

select test.login('00000000-0000-0000-0000-000000000061');
select test.ok(exists (select 1 from assessments where id = (select v from ids where k = 'task')), 'الطالب يرى المهمة المنشورة');
select test.ok(not exists (select 1 from assessments where id = (select v from ids where k = 'draft')), 'الطالب لا يرى المسودة');
select test.ok(not exists (select 1 from assessments where id = (select v from ids where k = 'later')), 'الطالب لا يرى مهمة قبل تاريخ طرحها');
select test.ok((select count(*) from assessment_attachments) = 1, 'الطالب يرى مرفقات مهمته فقط');
select test.ok((can_submit_task((select v from ids where k = 'task')) ->> 'mode') = 'any', 'الطالب يستطيع التسليم');
select test.logout();

-- الرفع يُسجَّل من الخادم باسم الطالب
set role service_role;
select register_upload((select id from students where code = 'S60A'), (select v from ids where k = 'task'),
  format('subs/%s/%s/11111111-1111-1111-1111-111111111111.webp', (select v from ids where k = 'task'), (select id from students where code = 'S60A')),
  'صورة.webp', 'image/webp', 200000);
select register_upload((select id from students where code = 'S60B'), (select v from ids where k = 'task'),
  format('subs/%s/%s/22222222-2222-2222-2222-222222222222.pdf', (select v from ids where k = 'task'), (select id from students where code = 'S60B')),
  'ملف.pdf', 'application/pdf', 300000);
select test.fails(format($$select register_upload(%s, %s, 'subs/1/1/x.pdf', 'x', 'application/pdf', 10)$$,
                         (select id from students where code = 'S60A'), (select v from ids where k = 'task')),
                  'مسار غير صالح', 'مسار رفع لا يطابق الطالب والمهمة مرفوض');
select test.fails(format($$select register_upload(%s, %s, 'subs/%s/%s/33333333-3333-3333-3333-333333333333.pdf', 'x', 'application/pdf', 2000000)$$,
                         (select id from students where code = 'S60A'), (select v from ids where k = 'task'),
                         (select v from ids where k = 'task'), (select id from students where code = 'S60A')),
                  '1 ميقا', 'ملف أكبر من 1 ميقا مرفوض');
reset role;
select test.ok(not has_function_privilege('authenticated', 'public.register_upload(bigint,bigint,text,text,text,integer)', 'execute'),
               'المتصفح لا يسجّل رفعًا بنفسه');

select test.login('00000000-0000-0000-0000-000000000061');
select test.fails(format($$select submit_task(%s, 'جوابي', array['subs/%s/%s/22222222-2222-2222-2222-222222222222.pdf'])$$,
                         (select v from ids where k = 'task'), (select v from ids where k = 'task'), (select id from students where code = 'S60B')),
                  'ملف غير معروف', 'الطالب لا يسلّم ملف طالب آخر');
select test.ok((submit_task((select v from ids where k = 'task'), 'جوابي الأول',
                 array[format('subs/%s/%s/11111111-1111-1111-1111-111111111111.webp', (select v from ids where k = 'task'), (select id from students where code = 'S60A'))])
                ->> 'submission_id') is not null, 'تسليم نص + صورة');
select test.ok((select count(*) from submission_files) = 1, 'الملف ضمن التسليم');
select test.ok((select jsonb_array_length(submit_task((select v from ids where k = 'task'), 'جوابي المعدل', '{}') -> 'removed_paths')) = 1,
               'تعديل التسليم بلا الملف يعيد مساره للحذف من المخزن');
select test.ok((select body from task_submissions) = 'جوابي المعدل', 'النص تحدّث');
select test.ok((select count(*) from task_submissions) = 1, 'الطالب يرى تسليمه فقط');
select test.logout();

select test.login('00000000-0000-0000-0000-000000000062');
select test.ok((submit_task((select v from ids where k = 'task'), null,
                 array[format('subs/%s/%s/22222222-2222-2222-2222-222222222222.pdf', (select v from ids where k = 'task'), (select id from students where code = 'S60B'))])
                ->> 'submission_id') is not null, 'تسليم ملف فقط');
select test.ok((select count(*) from task_submissions) = 1 and (select count(*) from submission_files) = 1, 'الطالب الثاني لا يرى تسليم الأول');
select test.logout();

-- التصحيح
select test.login('00000000-0000-0000-0000-0000000000e6');
select test.ok((select count(*) from task_submissions where assessment_id = (select v from ids where k = 'task')) = 2, 'المعلم يرى التسليمين');
select test.fails(format($$select grade_task(%s, '[{"student_id": %s, "score": 11}]')$$, (select v from ids where k = 'task'), (select id from students where code = 'S60A')),
                  'الدرجة بين', 'درجة أعلى من العظمى مرفوضة');
select test.fails(format($$select grade_task(%s, '[{"student_id": %s, "score": 5}]')$$, (select v from ids where k = 'task'), 3),
                  'ليس في فصل', 'لا رصد لطالب من فصل آخر');
select grade_task((select v from ids where k = 'task'), format('[{"student_id": %s, "score": 9, "feedback": "ممتاز"}, {"student_id": %s, "score": 7}]',
                  (select id from students where code = 'S60A'), (select id from students where code = 'S60B'))::jsonb);
select test.ok((select count(*) from grade_entries where assessment_id = (select v from ids where k = 'task')) = 2, 'الرصد أُنشئ للطالبين');
select test.ok((select count(*) from task_submissions where assessment_id = (select v from ids where k = 'task') and graded_at is not null) = 2, 'التسليمان مصحّحان');
select test.fails(format($$select save_task(%s, '{"title":"بحث عن الماء","subject_id":1,"term_id":1,"eval_type_id":1,"max_score":5,"due_at":"2099-01-01T10:00:00Z","submission_mode":"any"}', null)$$,
                         (select v from ids where k = 'task')),
                  'أعلى من الدرجة العظمى', 'لا تخفيض للعظمى تحت درجات مرصودة');
select test.logout();

select test.login('00000000-0000-0000-0000-000000000061');
select test.fails(format($$select submit_task(%s, 'تعديل بعد التصحيح', '{}')$$, (select v from ids where k = 'task')), 'صُحّح', 'لا تعديل بعد التصحيح');
select test.ok((select feedback from task_submissions) = 'ممتاز', 'الطالب يرى ملاحظة المعلم');
select test.logout();

-- مهلة التعديل: رصد عمره 4 أيام
set app.migrating = 'on';
update grade_entries set recorded_at = now() - interval '4 days' where assessment_id = (select v from ids where k = 'task');
set app.migrating = 'off';
select test.login('00000000-0000-0000-0000-0000000000e6');
select test.fails(format($$select grade_task(%s, '[{"student_id": %s, "score": 8}]')$$, (select v from ids where k = 'task'), (select id from students where code = 'S60A')),
                  'مهلة', 'المعلم لا يعدّل رصدًا مضى عليه أكثر من 3 أيام');
select test.logout();

-- حذف ملفات التسليم المصحّحة
set role service_role;
select test.ok((select count(*) from purge_candidates(false)) = 0, 'التلقائي ينتظر 48 ساعة بعد التصحيح');
select test.ok((select count(*) from purge_candidates(true)) = 1, 'اليدوي يشمل كل الملفات المصحّحة');
reset role;
update task_submissions set graded_at = now() - interval '49 hours';
set role service_role;
select test.ok((select count(*) from purge_candidates(false)) = 1, 'بعد 48 ساعة يدخل الملف في الحذف التلقائي');
select test.ok(mark_files_purged(array(select id from purge_candidates(false))) = 1, 'تعليم الملف كمحذوف');
select test.ok((select count(*) from task_submissions where files_purged_at is not null) = 1, 'التسليم علِّم بحذف ملفاته');
select test.ok((select body is null from task_submissions where files_purged_at is not null), 'تسليم الملف فقط بلا نص');
select test.ok((select count(*) from task_submissions where body = 'جوابي المعدل') = 1, 'النصوص لا تُحذف أبدًا');
reset role;
update app_settings set value = '{"enabled": false, "hours": 48}' where key = 'submission_purge';
set role service_role;
select test.ok((select count(*) from purge_candidates(false)) = 0, 'إيقاف الحذف التلقائي من الإعدادات');
reset role;
update app_settings set value = '{"enabled": true, "hours": 48}' where key = 'submission_purge';
select test.login('00000000-0000-0000-0000-0000000000e6');
select test.fails($$select purge_stats()$$, 'للإدارة فقط', 'إحصاءات الحذف للإداري فقط');
select test.logout();

-- =====================================================================
-- 2) النماذج
-- =====================================================================
select test.login('00000000-0000-0000-0000-0000000000e6');
select test.fails($$select save_form(null, '{"title":"ن","subject_id":1,"term_id":1,"eval_type_id":2,"details":{"status":"published"},
  "questions":[{"qtype":"mcq","body":"س","points":1,"options":[{"body":"أ","is_correct":true},{"body":"ب"}]}]}', array[1])$$,
  'وقت إغلاق', 'لا نشر بلا وقت إغلاق');
select test.fails($$select save_form(null, '{"title":"ن","subject_id":1,"term_id":1,"eval_type_id":2,
  "questions":[{"qtype":"mcq","body":"س","points":1,"options":[{"body":"أ","is_correct":true},{"body":"ب","is_correct":true}]}]}', array[1])$$,
  'إجابة صحيحة واحدة', 'سؤال اختيار بإجابتين صحيحتين مرفوض');
select test.fails($$select save_form(null, '{"title":"ن","subject_id":1,"term_id":1,"eval_type_id":2,
  "questions":[{"qtype":"fill","body":"عاصمة السعودية [[1]] و[[2]]","points":2,"config":{"blanks":[["الرياض"]]}}]}', array[1])$$,
  'لا يطابق', 'عدد الفراغات يجب أن يطابق إجاباتها');

insert into ids select 'form', (save_form(null, jsonb_build_object(
  'title', 'اختبار شامل', 'subject_id', 1, 'term_id', 1, 'eval_type_id', 2,
  'details', jsonb_build_object('status', 'published', 'opens_at', now() - interval '1 hour', 'closes_at', now() + interval '1 day',
                                'shuffle_questions', true, 'shuffle_options', true, 'show_results', 'after_submit'),
  'questions', '[
    {"qtype":"mcq","body":"$\\frac{1}{2}+\\frac{1}{2}$ = ؟","points":2,"options":[{"body":"1","is_correct":true},{"body":"2"},{"body":"$\\sqrt{4}$"}]},
    {"qtype":"tf","body":"الماء يغلي عند 100°","points":1,"options":[{"body":"صح","is_correct":true},{"body":"خطأ"}]},
    {"qtype":"short","body":"عاصمة السعودية؟","points":2,"config":{"answers":["الرياض"]}},
    {"qtype":"long","body":"اشرح دورة الماء","points":5},
    {"qtype":"match","body":"صل","points":3,"config":{"pairs":[{"l":"H2O","r":"ماء"},{"l":"NaCl","r":"ملح"},{"l":"O2","r":"أكسجين"}]}},
    {"qtype":"fill","body":"$2+2=$ [[1]] و $3\\times3=$ [[2]]","points":2,"config":{"blanks":[["4","٤"],["9"]]}}
  ]'::jsonb), array[1]))[1];
select test.ok((select count(*) from form_questions where assessment_id = (select v from ids where k = 'form')) = 6, 'ستة أسئلة بستة أنواع');
select test.logout();

-- بدء الجلسة
select test.login('00000000-0000-0000-0000-000000000061');
create temp table sess as select start_form_session((select v from ids where k = 'form')) as p;
select test.ok((select p ->> 'status' from sess) = 'open', 'الجلسة بدأت');
select test.ok(position('is_correct' in (select p::text from sess)) = 0, 'لا إجابة صحيحة في بيانات الطالب');
select test.ok(position('الرياض' in (select p::text from sess)) = 0, 'لا إجابات مقبولة للقصيرة');
select test.ok(position('"blanks": [' in (select p::text from sess)) = 0, 'لا إجابات للفراغات');
select test.ok((select jsonb_array_length(p -> 'questions') from sess) = 6, 'كل الأسئلة');
select test.ok((select (q ->> 'blanks')::int from sess, jsonb_array_elements(p -> 'questions') q where q ->> 'qtype' = 'fill') = 2, 'عدد الفراغات فقط');
select test.ok((select jsonb_array_length(q -> 'rights') from sess, jsonb_array_elements(p -> 'questions') q where q ->> 'qtype' = 'match') = 3, 'جهة التوصيل اليمنى');
select test.ok((select p ->> 'session_id' from sess) = (start_form_session((select v from ids where k = 'form')) ->> 'session_id'), 'فتح النموذج مرة أخرى يستكمل نفس الجلسة');
select test.ok((select count(*) from form_sessions) = 0, 'الطالب لا يقرأ جدول الجلسات مباشرة');
select test.logout();

-- الإجابات: الصحيحة من بيانات المعلم + تحويل التوصيل من ترتيب العرض
create temp table q as
select fq.id, fq.qtype, fq.position from form_questions fq where fq.assessment_id = (select v from ids where k = 'form');
grant select on q, sess to authenticated;
create temp table ans as
select jsonb_build_object(
  (select id from q where qtype = 'mcq')::text, (select o.id from question_options o where o.question_id = (select id from q where qtype = 'mcq') and o.is_correct),
  (select id from q where qtype = 'tf')::text, (select o.id from question_options o where o.question_id = (select id from q where qtype = 'tf') and not o.is_correct),
  (select id from q where qtype = 'short')::text, ' الرِّيـاض ',
  (select id from q where qtype = 'long')::text, 'تتبخر المياه ثم تتكثف',
  (select id from q where qtype = 'fill')::text, jsonb_build_array('٤', '8'),
  (select id from q where qtype = 'match')::text, (
    -- صحيح للزوجين الأولين، وخطأ في الثالث
    select jsonb_build_object('0', (select n - 1 from jsonb_array_elements_text(s.option_order -> (select id from q where qtype = 'match')::text) with ordinality x(v, n) where v = '0'),
                              '1', (select n - 1 from jsonb_array_elements_text(s.option_order -> (select id from q where qtype = 'match')::text) with ordinality x(v, n) where v = '1'),
                              '2', (select n - 1 from jsonb_array_elements_text(s.option_order -> (select id from q where qtype = 'match')::text) with ordinality x(v, n) where v = '0'))
      from form_sessions s where s.id = (select (p ->> 'session_id')::bigint from sess))
) as a;
grant select on ans to authenticated;

select test.login('00000000-0000-0000-0000-000000000061');
select test.ok(save_form_answers((select (p ->> 'session_id')::bigint from sess), (select a from ans) - (select id from q where qtype = 'long')::text) is not null, 'الحفظ التلقائي');
select test.ok(((start_form_session((select v from ids where k = 'form')) -> 'answers') ? (select id from q where qtype = 'short')::text), 'الإجابات المحفوظة تعود عند الفتح من جهاز آخر');
select test.fails(format($$select save_form_answers(%s, '{"999999": 1}')$$, (select p ->> 'session_id' from sess)), 'ليست في هذا النموذج', 'لا إجابة لسؤال غريب');
select log_form_event((select (p ->> 'session_id')::bigint from sess), 'hidden');
select log_form_event((select (p ->> 'session_id')::bigint from sess), 'blur');
select log_form_event((select (p ->> 'session_id')::bigint from sess), 'hack');
select test.logout();

select test.login('00000000-0000-0000-0000-000000000062');
select test.fails(format($$select save_form_answers(%s, '{}')$$, (select p ->> 'session_id' from sess)), 'FORBIDDEN', 'طالب آخر لا يكتب في جلسة غيره');
select log_form_event((select (p ->> 'session_id')::bigint from sess), 'blur');
select test.logout();
select test.ok((select count(*) from form_events) = 2, 'سجل الخروج: حدثان صحيحان فقط');

select test.login('00000000-0000-0000-0000-000000000061');
create temp table res as select submit_form_session((select (p ->> 'session_id')::bigint from sess),
  jsonb_build_object((select id from q where qtype = 'long')::text, 'تتبخر المياه ثم تتكثف')) as r;
select test.ok((select (r ->> 'pending_review')::int from res) = 1, 'المقالي ينتظر التصحيح اليدوي');
-- mcq 2 + tf 0 + short 2 + long 0 + match 3×2/3=2 + fill 2×1/2=1 = 7
select test.ok((select (r ->> 'score')::numeric from res) = 7, 'التصحيح الآلي لكل الأنواع = 7');
select test.ok((submit_form_session((select (p ->> 'session_id')::bigint from sess)) ->> 'score')::numeric = 7, 'الضغط المزدوج يعيد نفس النتيجة');
select test.fails(format($$select start_form_session(%s)$$, (select v from ids where k = 'form')), 'استنفدت', 'لا محاولة ثانية');
select test.ok((get_form_review((select v from ids where k = 'form')) ->> 'status') = 'shown', 'مراجعة الطالب بعد التسليم');
select test.logout();

grant select on res to authenticated;
select test.ok((select focus_events from form_attempts where id = (select attempt_id from form_sessions where id = (select (p ->> 'session_id')::bigint from sess))) = 2,
               'عدد مرات الخروج محفوظ في المحاولة');

-- التصحيح اليدوي وإعادة التصحيح بعد تعديل المعلم
create temp table att as select attempt_id as id from form_sessions where id = (select (p ->> 'session_id')::bigint from sess);
grant select on att to authenticated;
select test.login('00000000-0000-0000-0000-0000000000e6');
select test.fails(format($$select grade_form_answer(%s, %s, 6)$$, (select id from att), (select id from q where qtype = 'long')), 'الدرجة بين', 'درجة يدوية أعلى من السؤال مرفوضة');
select test.ok((grade_form_answer((select id from att), (select id from q where qtype = 'long'), 4, 'جيد') ->> 'score')::numeric = 11, 'التصحيح اليدوي: 7 + 4 = 11');
select test.ok((select score from grade_entries where assessment_id = (select v from ids where k = 'form') and student_id = (select id from students where code = 'S60A')) = 11,
               'الرصد تحدّث');
-- المعلم أخطأ: الإجابة الصحيحة لصح/خطأ هي "خطأ"
select save_form((select v from ids where k = 'form'), jsonb_build_object(
  'title', 'اختبار شامل', 'subject_id', 1, 'term_id', 1, 'eval_type_id', 2,
  'details', (select to_jsonb(d) from form_details d where assessment_id = (select v from ids where k = 'form')),
  'questions', (select jsonb_agg(jsonb_build_object('id', fq.id, 'qtype', fq.qtype, 'body', fq.body, 'points', fq.points, 'config', fq.config,
                  'options', (select jsonb_agg(jsonb_build_object('id', o.id, 'body', o.body,
                                'is_correct', case when fq.qtype = 'tf' then not o.is_correct else o.is_correct end) order by o.position)
                                from question_options o where o.question_id = fq.id)) order by fq.position)
                  from form_questions fq where fq.assessment_id = (select v from ids where k = 'form'))));
select test.ok((select score from form_attempts where id = (select id from att)) = 12, 'تعديل الإجابة الصحيحة أعاد التصحيح: 11 + 1 = 12');
select test.ok((select score from grade_entries where assessment_id = (select v from ids where k = 'form') and student_id = (select id from students where code = 'S60A')) = 12,
               'والرصد تبعه مباشرة');
select test.ok((select points from attempt_answers where attempt_id = (select id from att) and question_id = (select id from q where qtype = 'long')) = 4,
               'الدرجة اليدوية بقيت كما هي');
select test.fails(format($$select save_form(%s, '{"title":"x","subject_id":1,"term_id":1,"eval_type_id":2,"questions":[]}')$$, (select v from ids where k = 'form')),
                  'بعد وجود إجابات', 'لا حذف أسئلة بعد التسليم');
select test.ok((select count(*) from form_events) = 2 and (select count(*) from form_sessions) >= 1, 'المعلم يرى سجل الخروج والجلسات');
select test.logout();

-- إظهار النتائج بعد الإغلاق فقط
update form_details set show_results = 'after_close' where assessment_id = (select v from ids where k = 'form');
select test.login('00000000-0000-0000-0000-000000000061');
select test.ok((get_form_review((select v from ids where k = 'form')) ->> 'status') = 'hidden', 'النتيجة مخفية حتى الإغلاق');
select test.ok(position('is_correct' in get_form_review((select v from ids where k = 'form'))::text) = 0, 'ولا تظهر الإجابات الصحيحة');
select test.logout();

-- مدة الحل لكل طالب
select test.login('00000000-0000-0000-0000-0000000000e6');
insert into ids select 'timed', (save_form(null, jsonb_build_object(
  'title', 'اختبار بوقت', 'subject_id', 1, 'term_id', 1, 'eval_type_id', 2,
  'details', jsonb_build_object('status', 'published', 'closes_at', now() + interval '1 day', 'time_limit_minutes', 10),
  'questions', '[{"qtype":"short","body":"1+1","points":1,"config":{"answers":["2"]}}]'::jsonb), array[1]))[1];
select test.logout();
insert into ids select 'timed_q', id from form_questions where assessment_id = (select v from ids where k = 'timed');
select test.login('00000000-0000-0000-0000-000000000062');
create temp table s2 as select start_form_session((select v from ids where k = 'timed')) as p;
select test.ok((select (p ->> 'deadline_at')::timestamptz between now() + interval '9 minutes' and now() + interval '11 minutes' from s2), 'مهلة الطالب 10 دقائق من بدئه');
select save_form_answers((select (p ->> 'session_id')::bigint from s2),
  jsonb_build_object((select v from ids where k = 'timed_q')::text, '2'));
select test.logout();
grant select on s2 to authenticated;
update form_sessions set deadline_at = now() - interval '5 minutes' where id = (select (p ->> 'session_id')::bigint from s2);
select test.login('00000000-0000-0000-0000-000000000062');
select test.fails(format($$select save_form_answers(%s, '{}')$$, (select p ->> 'session_id' from s2)), 'انتهى الوقت', 'لا حفظ بعد انتهاء الوقت');
select test.ok((start_form_session((select v from ids where k = 'timed')) ->> 'status') = 'submitted', 'فتح النموذج بعد انتهاء الوقت يسلّم المحفوظ تلقائيًا');
select test.ok((select score from grade_entries where assessment_id = (select v from ids where k = 'timed')) = 1, 'الإجابة المحفوظة صُحّحت');
select test.logout();

-- =====================================================================
-- 3) النسخ والحذف والقوائم
-- =====================================================================
select test.login('00000000-0000-0000-0000-0000000000e6');
insert into ids select 'copy', (duplicate_assessment((select v from ids where k = 'form'), null))[1];
select test.ok((select status from form_details where assessment_id = (select v from ids where k = 'copy')) = 'draft', 'النسخة مسودة');
select test.ok((select count(*) from form_questions where assessment_id = (select v from ids where k = 'copy')) = 6, 'النسخة بكل الأسئلة');
select test.ok((select count(*) from question_options o join form_questions fq on fq.id = o.question_id
                 where fq.assessment_id = (select v from ids where k = 'copy') and o.is_correct) = 2, 'والإجابات الصحيحة');
select test.fails(format($$select duplicate_assessment(%s, array[2])$$, (select v from ids where k = 'form')), 'خارج نطاق', 'لا نسخ لفصل خارج النطاق');
select test.fails(format($$select delete_assessment(%s)$$, (select v from ids where k = 'task')), 'درجات مرصودة', 'لا حذف لتقييم له رصد');
select test.ok(delete_assessment((select v from ids where k = 'copy')) ? 'paths', 'حذف النسخة');
select test.ok((staff_assessments('{"kind":"form"}') ->> 'total')::int >= 2, 'قائمة المعلم');
select test.ok((select (r ->> 'to_grade')::int from jsonb_array_elements(staff_assessments('{"kind":"task"}') -> 'rows') r
                 where (r ->> 'id')::bigint = (select v from ids where k = 'task')) = 0, 'لا تسليمات بانتظار التصحيح');
select test.ok((staff_assessment_stats() ->> 'drafts')::int >= 1, 'إحصاءات المعلم');
select test.logout();

select test.login('00000000-0000-0000-0000-0000000000e2');
select test.ok((staff_assessments('{}') ->> 'total')::int = 0, 'معلم بلا نطاق لا يرى شيئًا');
select test.fails(format($$select grade_task(%s, '[]')$$, (select v from ids where k = 'task')), 'لا تملك', 'ولا يرصد');
select test.logout();

select test.login('00000000-0000-0000-0000-000000000061');
select test.ok((select count(*) from jsonb_array_elements(my_assessments()) x where (x ->> 'id')::bigint = (select v from ids where k = 'task') and x -> 'submission' is not null) = 1,
               'قائمة الطالب تعرض تسليمه');
select test.ok(not exists (select 1 from jsonb_array_elements(my_assessments()) x where (x ->> 'id')::bigint = (select v from ids where k = 'draft')),
               'ولا تعرض المسودات');
select test.logout();
