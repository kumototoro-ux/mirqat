-- =====================================================================
-- هجرة 37: النتائج وإتاحتها والشهادات بنطاق الفرع
-- =====================================================================
\set ON_ERROR_STOP 1
insert into employees (code, name_ar, user_type) values
  ('RCM1', 'مدير الفرع 1', 'teacher'), ('RCM2', 'مدير الفرع 2', 'teacher'), ('RCD1', 'وكيل الفرع 1', 'teacher'),
  ('RCT1', 'مشرف معلمات 1', 'teacher'), ('RCN', 'معلم عادي', 'teacher');
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000c01'), ('00000000-0000-0000-0000-000000000c02'), ('00000000-0000-0000-0000-000000000c03'),
  ('00000000-0000-0000-0000-000000000c04'), ('00000000-0000-0000-0000-000000000c05');
insert into profiles (id, username, role, employee_id, status, must_change_password)
select v.id::uuid, v.u, 'teacher', e.id, 'active', false
  from (values ('00000000-0000-0000-0000-000000000c01', 'rcm1', 'RCM1'), ('00000000-0000-0000-0000-000000000c02', 'rcm2', 'RCM2'),
               ('00000000-0000-0000-0000-000000000c03', 'rcd1', 'RCD1'), ('00000000-0000-0000-0000-000000000c04', 'rct1', 'RCT1'),
               ('00000000-0000-0000-0000-000000000c05', 'rcn', 'RCN')) v(id, u, code) join employees e on e.code = v.code;
insert into employee_positions (employee_id, position, branch_id)
select e.id, v.p, v.b from (values ('RCM1', 'branch_manager', 1), ('RCM2', 'branch_manager', 2), ('RCD1', 'deputy', 1), ('RCT1', 'teachers_supervisor', 1)) v(c, p, b)
  join employees e on e.code = v.c;
insert into students (code, name_ar, class_id) values ('RC1', 'طالب نتائج فرع1', 1), ('RC2', 'طالب نتائج فرع2', 3);
create temp table rc as select (select id from students where code = 'RC1') as s1, (select id from students where code = 'RC2') as s2;
grant select on rc to public;
create temp table rr (k text primary key, v bigint);
grant all on rr to public;

-- ---------------------------------------------------------------------
-- عرض النتائج
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000c01');   -- مدير الفرع 1
select test.ok(class_results(1, 1::smallint) ? 'subjects', 'مدير الفرع يرى نتائج فصل فرعه');
select test.fails($$select class_results(3, 1::smallint)$$, 'FORBIDDEN', 'ولا يرى فصل فرع آخر');
select test.ok(student_report_card((select s1 from rc), 1::smallint) ? 'student', 'ويرى إشعار طالب فرعه');
select test.fails(format($$select student_report_card(%s, 1::smallint)$$, (select s2 from rc)), 'FORBIDDEN', 'ولا إشعار طالب فرع آخر');
select test.ok(not exists (select 1 from jsonb_array_elements(results_overview(1::smallint)) e where (e ->> 'class_id')::int = 3), 'النظرة العامة لا تشمل فصول فرع آخر');
select test.ok(exists (select 1 from jsonb_array_elements(results_overview(1::smallint)) e where (e ->> 'class_id')::int = 1), 'وتشمل فصول فرعه');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000c03');   -- وكيل: عرض فقط
select test.ok(class_results(1, 1::smallint) ? 'subjects', 'الوكيل يرى النتائج (عرض)');
select test.fails(format($$select save_release_rule(null, '{"kind":"block","branch_ids":[1]}')$$), 'FORBIDDEN', 'لكن لا يحجبها');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000c05');   -- معلم عادي
select test.fails($$select class_results(1, 1::smallint)$$, 'FORBIDDEN', 'المعلم العادي لا يرى النتائج');
select test.ok(results_overview(1::smallint) is null, 'ولا النظرة العامة');
select test.logout();

-- ---------------------------------------------------------------------
-- قواعد الإتاحة: ضمن الفرع فقط
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000c01');
insert into rr select 'b1', save_release_rule(null, '{"kind":"block","branch_ids":[1],"term_ids":[1],"note":"حتى اعتماد فرعي"}');
select test.ok((select count(*) from rr where k = 'b1') = 1, 'مدير الفرع يحجب نتائج فرعه');
select test.ok((select count(*) from result_release_rules where id = (select v from rr where k = 'b1')) = 1, 'ويرى قاعدته');
select test.ok(release_rule_reach('{"branch_ids":[1]}'::jsonb) >= 1, 'ومعاينة المتأثرين لفرعه');
select test.fails($$select save_release_rule(null, '{"kind":"block","branch_ids":[2]}')$$, 'FORBIDDEN', 'ولا يحجب فرعًا آخر');
select test.fails($$select save_release_rule(null, '{"kind":"block"}')$$, 'FORBIDDEN', 'ولا قاعدة مفتوحة على الجميع');
select test.fails($$select save_release_rule(null, '{"kind":"block","branch_ids":[1],"stage_ids":[1]}')$$, 'FORBIDDEN', 'ولا مرحلة (قد تتجاوز فرعه)');
select test.fails($$select save_release_rule(null, '{"kind":"block","grade_ids":[1]}')$$, 'FORBIDDEN', 'ولا صفًا');
select test.fails($$select save_release_rule(null, '{"kind":"block","branch_ids":[1,2]}')$$, 'FORBIDDEN', 'ولا فرعه مع فرع آخر');
select test.fails(format($$select save_release_rule(null, '{"kind":"allow","student_ids":[%s]}')$$, (select s2 from rc)), 'FORBIDDEN', 'ولا طالبًا من فرع آخر');
select test.ok(save_release_rule(null, format('{"kind":"allow","student_ids":[%s]}', (select s1 from rc))::jsonb) is not null, 'لكن يتيح لطالب من فرعه');
select test.ok(save_release_rule((select v from rr where k = 'b1'), '{"kind":"block","branch_ids":[1],"note":"تعديل"}') is not null, 'ويعدّل قاعدته');
select test.fails(format($$select save_release_rule(%s, '{"kind":"block","branch_ids":[2]}')$$, (select v from rr where k = 'b1')), 'FORBIDDEN', 'ولا ينقل قاعدته إلى فرع آخر');
select set_release_rule_active((select v from rr where k = 'b1'), false);
select test.logout();

-- الإداري يضع قاعدة عامة وأخرى لفرع 2: لا يراهما ولا يمسّهما مدير الفرع 1
select test.login('00000000-0000-0000-0000-0000000000a0');
insert into rr select 'glob', save_release_rule(null, '{"kind":"block","term_ids":[1],"note":"عام"}');
insert into rr select 'b2', save_release_rule(null, '{"kind":"block","branch_ids":[2]}');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000c01');
select test.ok((select count(*) from result_release_rules where id in ((select v from rr where k = 'glob'), (select v from rr where k = 'b2'))) = 0, 'لا يرى القاعدة العامة ولا قاعدة فرع آخر');
select test.fails(format($$select set_release_rule_active(%s, false)$$, (select v from rr where k = 'glob')), 'FORBIDDEN', 'ولا يوقف القاعدة العامة');
select test.fails(format($$select delete_release_rule(%s)$$, (select v from rr where k = 'b2')), 'FORBIDDEN', 'ولا يحذف قاعدة فرع آخر');
select test.fails(format($$select save_release_rule(%s, '{"kind":"block","branch_ids":[1]}')$$, (select v from rr where k = 'glob')), 'FORBIDDEN', 'ولا يعدّل القاعدة العامة');
select delete_release_rule((select v from rr where k = 'b1'));
select test.ok((select count(*) from result_release_rules where id = (select v from rr where k = 'b1')) = 0, 'ويحذف قاعدته');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000c02');   -- مدير الفرع 2
select test.ok((select count(*) from result_release_rules where id = (select v from rr where k = 'b2')) = 1 and not exists (select 1 from result_release_rules where 1 = any(branch_ids)), 'مدير الفرع 2 يرى قاعدة فرعه فقط');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000c04');   -- مشرف معلمات
select test.ok((select count(*) from result_release_rules) = 0, 'مشرف المعلمات لا يرى القواعد (عرض الدرجات فقط)') where false;
select test.fails($$select save_release_rule(null, '{"kind":"block","branch_ids":[1]}')$$, 'FORBIDDEN', 'ولا يكتبها');
select test.fails($$select save_attendance_grant(1, 1::smallint, 10, null)$$, 'للإدارة', 'ومنح المواظبة للإداري وحده');
select test.fails($$select save_report_labels('{}')$$, 'للإدارة', 'وتسميات الإشعار كذلك');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000c01');
select test.fails($$select save_attendance_grant(1, 1::smallint, 10, null)$$, 'للإدارة', 'مدير الفرع لا يمنح المواظبة');
select test.logout();

-- ---------------------------------------------------------------------
-- الشهادات
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000c01');
select test.ok((cert_issue(format('{"type":"custom","student_id":%s,"reason":"تميز في السلوك والمشاركة"}', (select s1 from rc))::jsonb) ->> 'id')::bigint is not null,
  'مدير الفرع يصدر شهادة لطالب فرعه (دون نطاق تدريس ودون مادة)');
select test.fails(format($$select cert_issue('{"type":"custom","student_id":%s,"reason":"تقدير غير مستحق"}')$$, (select s2 from rc)), 'FORBIDDEN|نطاق', 'ولا لطالب فرع آخر');
select test.ok(json_array_length(cert_top('top', 1::smallint, null) ) >= 0, 'وأوائل فرعه');
select test.fails($$select cert_top('top', 2::smallint, null)$$, 'FORBIDDEN', 'لا أوائل فرع آخر');
select test.fails($$select cert_top('top', null, null)$$, 'FORBIDDEN', 'ولا أوائل كل الفروع');
select test.ok((cert_list(null, null, null, 0, 12) ->> 'total')::int = 1, 'قائمته تشمل شهادات فرعه');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000c02');   -- مدير الفرع 2
select test.ok((cert_list(null, null, null, 0, 12) ->> 'total')::int = 0, 'مدير الفرع 2 لا يرى شهادات الفرع 1');
select test.fails(format($$select cert_revoke(%s)$$, test.peek($$select max(id) from appreciation_certs$$)::bigint), 'FORBIDDEN', 'ولا يلغيها');
select test.ok((cert_issue(format('{"type":"custom","student_id":%s,"reason":"تقدير فرع الشمال"}', (select s2 from rc))::jsonb) ->> 'id')::bigint is not null, 'ويصدر لفرعه');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000c03');   -- وكيل (تعديل الشهادات)
select test.ok((cert_list(null, null, null, 0, 12) ->> 'total')::int = 1, 'الوكيل يرى شهادات فرعه');
select test.ok((cert_issue(format('{"type":"behavior","student_id":%s}', (select s1 from rc))::jsonb) ->> 'id') is not null, 'ويصدر لفرعه') where false;
select cert_revoke(test.peek(format('select id from appreciation_certs where student_id = %s and revoked_at is null limit 1', (select s1 from rc)))::bigint);
select test.ok((cert_list(null, null, null, 0, 12) ->> 'total')::int = 0, 'ويلغي شهادة فرعه');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000c04');   -- مشرف معلمات: لا قدرة على الشهادات
select test.fails(format($$select cert_issue('{"type":"custom","student_id":%s,"reason":"محاولة"}')$$, (select s1 from rc)), 'FORBIDDEN|نطاق|المادة', 'مشرف المعلمات لا يصدر');
select test.ok((cert_list(null, null, null, 0, 12) ->> 'total')::int = 0, 'ولا يرى شهادات');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000c05');
select test.fails(format($$select cert_issue('{"type":"top","student_id":%s}')$$, (select s1 from rc)), 'للإدارة فقط', 'المعلم العادي لا يصدر الأوائل');
select test.fails($$select cert_top('top', 1::smallint, null)$$, 'FORBIDDEN', 'ولا يرى أوائل');
select test.logout();
