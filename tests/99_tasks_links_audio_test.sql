-- =====================================================================
-- هجرة 28: تسليم بالروابط وبالتسجيل الصوتي، حد 3 ملفات، وإعادة فتح المهمة
-- يعتمد على بيانات 60: المعلم e6، الطالبان S60A (…61) و S60B (…62) في الفصل 1
-- =====================================================================
\set ON_ERROR_STOP 1
create temp table t28 (k text primary key, v bigint);
grant all on t28 to authenticated, service_role;

select test.login('00000000-0000-0000-0000-0000000000e6');
insert into t28 select 'link', (save_task(null, '{"title":"مشروع برابط","subject_id":1,"term_id":1,"eval_type_id":1,"max_score":10,"due_at":"2099-01-01T10:00:00Z","submission_mode":"link"}', array[1]) -> 'ids' ->> 0)::bigint;
insert into t28 select 'audio', (save_task(null, '{"title":"تسميع سورة","subject_id":1,"term_id":1,"eval_type_id":1,"max_score":10,"due_at":"2099-01-01T10:00:00Z","submission_mode":"audio"}', array[1]) -> 'ids' ->> 0)::bigint;
insert into t28 select 'any', (save_task(null, '{"title":"حر","subject_id":1,"term_id":1,"eval_type_id":1,"max_score":10,"due_at":"2099-01-01T10:00:00Z","submission_mode":"any"}', array[1]) -> 'ids' ->> 0)::bigint;
select test.fails($$select save_task(null, '{"title":"x","subject_id":1,"term_id":1,"eval_type_id":1,"max_score":10,"due_at":"2099-01-01T10:00:00Z","submission_mode":"video"}', array[1])$$, 'غير معروف', 'نوع تسليم غير معروف يُرفض');
select test.logout();

-- الرفع: صوت حتى 6 ميقا، وغيره 1 ميقا
set role service_role;
select register_upload((select id from students where code = 'S60A'), (select v from t28 where k = 'audio'),
  format('subs/%s/%s/44444444-4444-4444-4444-444444444444.webm', (select v from t28 where k = 'audio'), (select id from students where code = 'S60A')),
  'تسجيل.webm', 'audio/webm', 4000000);
select test.fails(format($$select register_upload(%s, %s, 'subs/%s/%s/55555555-5555-5555-5555-555555555555.webm', 'x', 'audio/webm', 7000000)$$,
  (select id from students where code = 'S60A'), (select v from t28 where k = 'audio'), (select v from t28 where k = 'audio'), (select id from students where code = 'S60A')),
  '6 ميقا', 'الصوت فوق 6 ميقا يُرفض');
select test.fails(format($$select register_upload(%s, %s, 'subs/%s/%s/66666666-6666-6666-6666-666666666666.pdf', 'x', 'application/pdf', 2000000)$$,
  (select id from students where code = 'S60A'), (select v from t28 where k = 'any'), (select v from t28 where k = 'any'), (select id from students where code = 'S60A')),
  '1 ميقا', 'وغير الصوت فوق 1 ميقا يُرفض');
select register_upload((select id from students where code = 'S60A'), (select v from t28 where k = 'any'),
  format('subs/%s/%s/77777777-7777-7777-7777-77777777777%s.webp', (select v from t28 where k = 'any'), (select id from students where code = 'S60A'), n), 'صورة.webp', 'image/webp', 1000)
  from generate_series(1, 4) n;
reset role;

select test.login('00000000-0000-0000-0000-000000000061');
-- الروابط
select test.fails(format($$select submit_task(%s, null, '{}', array['ftp://x'])$$, (select v from t28 where k = 'link')), 'https', 'الرابط يبدأ بـ https');
select test.fails(format($$select submit_task(%s, null, '{}', '{}')$$, (select v from t28 where k = 'link')), 'رابط', 'مهمة الرابط تحتاج رابطًا');
select test.ok((submit_task((select v from t28 where k = 'link'), 'ملاحظة', '{}', array['https://docs.google.com/x', ' https://docs.google.com/x ']) ->> 'submission_id') is not null, 'تسليم برابط (المكرر يُدمج)');
select test.ok((select cardinality(links) from task_submissions where assessment_id = (select v from t28 where k = 'link')) = 1, 'الرابط محفوظ مرة واحدة');
select test.fails(format($$select submit_task(%s, null, '{}', array['https://a.com/1','https://a.com/2','https://a.com/3','https://a.com/4'])$$, (select v from t28 where k = 'any')), 'ثلاثة روابط', 'ثلاثة روابط كحد أقصى');
-- الصوت
select test.fails(format($$select submit_task(%s, null, '{}')$$, (select v from t28 where k = 'audio')), 'مقطعًا صوتيًا', 'مهمة الصوت تحتاج تسجيلًا');
select test.ok((submit_task((select v from t28 where k = 'audio'), null,
  array[format('subs/%s/%s/44444444-4444-4444-4444-444444444444.webm', (select v from t28 where k = 'audio'), (select id from students where code = 'S60A'))]) ->> 'submission_id') is not null, 'تسليم التسجيل الصوتي');
-- حد الملفات
select test.fails(format($$select submit_task(%s, null, array[%s])$$, (select v from t28 where k = 'any'),
  (select string_agg(quote_literal(format('subs/%s/%s/77777777-7777-7777-7777-77777777777%s.webp', (select v from t28 where k = 'any'), (select id from students where code = 'S60A'), n)), ',') from generate_series(1, 4) n)),
  'ثلاثة ملفات', 'ثلاثة ملفات كحد أقصى');
select test.ok((submit_task((select v from t28 where k = 'any'), null,
  (select array_agg(format('subs/%s/%s/77777777-7777-7777-7777-77777777777%s.webp', (select v from t28 where k = 'any'), (select id from students where code = 'S60A'), n)) from generate_series(1, 3) n),
  array['https://example.com/work']) ->> 'submission_id') is not null, 'نص/ملف/رابط معًا: 3 ملفات + رابط');
select test.logout();

-- إعادة فتح المهمة
select test.login('00000000-0000-0000-0000-0000000000e6');
select test.fails(format($$select reopen_task(%s, now() - interval '1 day')$$, (select v from t28 where k = 'link')), 'المستقبل', 'الموعد الجديد في المستقبل');
select reopen_task((select v from t28 where k = 'link'), '2099-02-01T10:00:00Z');
select test.ok((select due_at from assessments where id = (select v from t28 where k = 'link')) = '2099-02-01T10:00:00Z', 'أُعيد فتح المهمة بموعد جديد');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000062');
select test.fails(format($$select reopen_task(%s, '2099-03-01')$$, (select v from t28 where k = 'link')), 'FORBIDDEN', 'الطالب لا يعيد الفتح');
select test.logout();
