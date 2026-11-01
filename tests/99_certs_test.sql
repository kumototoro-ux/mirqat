-- =====================================================================
-- هجرة 29: شهادات الشكر والتقدير — الصلاحيات والاستحقاق والإصدار والإلغاء
-- يعتمد على بيانات 60: المعلم e6 (نطاقه الفصل 1، المادة 1)، والطالبان S60A و S60B في الفصل 1
-- =====================================================================
\set ON_ERROR_STOP 1
create temp table tc (k text primary key, v bigint);
grant all on tc to authenticated, service_role;
insert into tc select 'a', id from students where code = 'S60A';
insert into tc select 'b', id from students where code = 'S60B';
insert into tc select 'emp', employee_id from profiles where id = '00000000-0000-0000-0000-0000000000e6';
insert into eval_types (name, category, sort_order) select 'بحوث و تقارير', 'continuous', 9 where not exists (select 1 from eval_types where name like '%بحوث%');
insert into tc select 'act', id from eval_types where name like '%بحوث%' order by id limit 1;

-- طالب في شعبة جديدة خارج نطاق المعلم
insert into sections (name, sort_order) values ('شعبة-شهادات', 99);
insert into classes (branch_id, grade_id, section_id) select c.branch_id, c.grade_id, (select id from sections where name = 'شعبة-شهادات') from classes c where c.id = 1;
insert into students (code, name_ar, class_id) values ('SCERT1', 'طالب خارج النطاق', (select max(id) from classes));
insert into tc select 'out', id from students where code = 'SCERT1';

-- درجات: S60A ممتاز (بحثان للمعلم e6 + اختبار)، S60B بلا درجات في المادة 1
insert into assessments (kind, class_id, subject_id, term_id, eval_type_id, title, max_score, published_at, grades_recorded_at, teacher_id)
select 'manual', 1, 1, 1, x.et, x.t, 10, now(), now(), (select v from tc where k = 'emp')
  from (values ('شهادة-بحث1', (select v from tc where k = 'act')::smallint), ('شهادة-بحث2', (select v from tc where k = 'act')::smallint), ('شهادة-اختبار', (select id from eval_types where name not like '%بحوث%' order by id limit 1))) x(t, et);
insert into grade_entries (assessment_id, student_id, score, max_score)
select a.id, (select v from tc where k = 'a'), case a.title when 'شهادة-اختبار' then 8 else 10 end, 10 from assessments a where a.title like 'شهادة-%';
-- سلوك: إيجابي لـ S60A، وسلبي فقط لـ S60B
insert into behavior_records (student_id, term_id, status_id, note)
values ((select v from tc where k = 'a'), 1, (select id from behavior_statuses where name like '%إيجاب%' limit 1), 'متعاون'),
       ((select v from tc where k = 'b'), 1, (select id from behavior_statuses where name like '%سلب%' limit 1), 'إزعاج');

-- المعلم: المادة والأنشطة والتقدير الخاص فقط، وضمن نطاقه
select test.login('00000000-0000-0000-0000-0000000000e6');
select test.fails(format($$select cert_preview('{"type":"top","student_id":%s}')$$, (select v from tc where k = 'a')), 'للإدارة فقط', 'المعلم لا يصدر شهادة الأوائل');
select test.fails(format($$select cert_preview('{"type":"behavior","student_id":%s}')$$, (select v from tc where k = 'a')), 'للإدارة فقط', 'ولا شهادة السلوك');
select test.fails(format($$select cert_preview('{"type":"subject","student_id":%s,"subject_id":2}')$$, (select v from tc where k = 'a')), 'صلاحيتك', 'مادة خارج نطاقه تُرفض');
select test.fails(format($$select cert_preview('{"type":"subject","student_id":%s,"subject_id":1}')$$, (select v from tc where k = 'out')), 'نطاق صلاحيتك', 'طالب خارج نطاقه يُرفض');
select test.ok((cert_preview(format('{"type":"subject","student_id":%s,"subject_id":1,"term_id":1}', (select v from tc where k = 'a'))::jsonb) -> 'metrics' ->> 'pct')::int
  = (select round(sum(ge.score) * 100 / sum(ge.max_score))::int from grade_entries ge join assessments a on a.id = ge.assessment_id
      where ge.student_id = (select v from tc where k = 'a') and a.subject_id = 1 and a.term_id = 1 and ge.score is not null), 'نسبة المادة = مجموع درجاتها المرصودة');
select test.ok((cert_preview(format('{"type":"activities","student_id":%s,"term_id":1}', (select v from tc where k = 'a'))::jsonb) -> 'metrics' ->> 'n')::int >= 2, 'الأنشطة: بحوثه من رصد المعلم نفسه');
select test.fails(format($$select cert_preview('{"type":"custom","student_id":%s,"subject_id":1,"reason":"  "}')$$, (select v from tc where k = 'a')), 'سبب التقدير', 'التقدير الخاص يحتاج سببًا');
insert into tc select 'c1', (cert_issue(format('{"type":"subject","student_id":%s,"subject_id":1,"term_id":1}', (select v from tc where k = 'a'))::jsonb) ->> 'id')::bigint;
select test.ok((select v from tc where k = 'c1') is not null, 'أُصدرت شهادة المادة');
select test.ok((cert_issue(format('{"type":"subject","student_id":%s,"subject_id":1,"term_id":1}', (select v from tc where k = 'a'))::jsonb) ->> 'id')::bigint = (select v from tc where k = 'c1'), 'إعادة الإصدار تحدّث الشهادة نفسها');
select cert_issue(format('{"type":"custom","student_id":%s,"subject_id":1,"reason":"مبادرته في مساعدة زملائه"}', (select v from tc where k = 'a'))::jsonb);
select test.ok((cert_list() ->> 'total')::int = 2, 'المعلم يرى ما أصدره');
select test.ok((select (x ->> 'issued')::boolean from json_array_elements(cert_subject_top(1::smallint, 1::smallint, 1)) x where (x ->> 'student_id')::bigint = (select v from tc where k = 'a')), 'أفضل 3 في المادة: الطالب معلَّم بأنه صدرت شهادته');
select test.logout();

-- معلم آخر لا يرى ولا يلغي
select test.login('00000000-0000-0000-0000-0000000000e3');
select test.ok((cert_list() ->> 'total')::int = 0, 'معلم آخر لا يرى شهادات غيره');
select test.fails(format($$select cert_revoke(%s)$$, (select v from tc where k = 'c1')), 'ليست من إصدارك', 'ولا يلغيها');
select test.logout();

-- الإدارة
select test.login('00000000-0000-0000-0000-0000000000a0');
select test.fails(format($$select cert_preview('{"type":"behavior","student_id":%s,"term_id":1}')$$, (select v from tc where k = 'b')), 'إيجابية', 'السلوك يحتاج ملاحظة إيجابية');
select test.ok((cert_preview(format('{"type":"behavior","student_id":%s,"term_id":1}', (select v from tc where k = 'a'))::jsonb) -> 'metrics' ->> 'positive')::int >= 1, 'شهادة سلوك تُحسب من الملاحظات الإيجابية');
select test.ok(json_array_length(cert_top('top', (select c.branch_id from classes c where c.id = 1), 1::smallint)) between 1 and 5, 'أوائل الفرع خمسة كحد أقصى');
select test.ok((cert_issue(format('{"type":"top","student_id":%s,"term_id":1}', cert_top('top', (select c.branch_id from classes c where c.id = 1), 1::smallint) -> 0 ->> 'student_id')::jsonb) -> 'metrics' ->> 'rank')::int = 1, 'إصدار شهادة الأول على الفرع');
select test.ok((cert_list() ->> 'total')::int >= 3, 'الإدارة ترى كل الشهادات');
select test.logout();

-- الطالب يرى شهاداته، والإلغاء يخفيها
select test.login((select id from profiles where student_id = (select v from tc where k = 'a')));
select test.ok(json_array_length(my_appreciation_certs()) >= 2, 'الطالب يرى شهاداته');
insert into tc select 'n', json_array_length(my_appreciation_certs());
select test.fails($$select cert_list()$$, 'FORBIDDEN', 'والطالب لا يصل لقائمة الإدارة');
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000e6');
select cert_revoke((select v from tc where k = 'c1'));
select test.logout();
select test.login((select id from profiles where student_id = (select v from tc where k = 'a')));
select test.ok(json_array_length(my_appreciation_certs()) = (select v from tc where k = 'n') - 1, 'بعد الإلغاء تختفي من صفحة الطالب');
select test.logout();
