-- =====================================================================
-- هجرة 39: مدير الفروع ومراقب الأداء وتقارير الأداء + قاعدة الرتبة
-- =====================================================================
\set ON_ERROR_STOP 1
insert into employees (code, name_ar, user_type) values
  ('PFD1', 'مدير الفروع 1', 'teacher'), ('PFD2', 'مدير الفروع 2', 'teacher'), ('PFM1', 'مراقب أول', 'teacher'), ('PFM2', 'مراقب ثانٍ', 'teacher'),
  ('PFB1', 'مدير فرع 1', 'teacher'), ('PFB1B', 'مدير فرع آخر 1', 'teacher'), ('PFT1', 'معلم فرع 1', 'teacher'), ('PFN', 'معلم عادي', 'teacher');
insert into auth.users (id) select ('00000000-0000-0000-0000-000000000e' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 8) n;
insert into profiles (id, username, role, employee_id, status, must_change_password)
select ('00000000-0000-0000-0000-000000000e' || lpad(n::text, 2, '0'))::uuid, 'pf' || n, 'teacher', e.id, 'active', false
  from (values (1, 'PFD1'), (2, 'PFD2'), (3, 'PFM1'), (4, 'PFM2'), (5, 'PFB1'), (6, 'PFB1B'), (7, 'PFT1'), (8, 'PFN')) v(n, c) join employees e on e.code = v.c;
insert into employee_positions (employee_id, position, branch_id)
select e.id, v.p, v.b from (values ('PFD1', 'branches_director', 1), ('PFD2', 'branches_director', 2), ('PFM1', 'performance_monitor', 1), ('PFM1', 'performance_monitor', 2),
  ('PFM2', 'performance_monitor', 1), ('PFB1', 'branch_manager', 1), ('PFB1B', 'branch_manager', 1)) v(c, p, b) join employees e on e.code = v.c;
insert into staff_scope (employee_id, branch_id) select id, 1 from employees where code = 'PFT1';
create temp table pf as select
  (select id from employees where code = 'PFD1') as d1, (select id from employees where code = 'PFB1') as b1, (select id from employees where code = 'PFB1B') as b1b,
  (select id from employees where code = 'PFT1') as t1, (select id from employees where code = 'PFM1') as m1;
grant select on pf to public;
create temp table pr (k text primary key, v bigint);
grant all on pr to public;
-- الفرع 1 له مبنى، الفرع 2 بلا مبنى
select test.login('00000000-0000-0000-0000-0000000000a0');
select admin_set_branch_building(1::smallint, true);
select test.logout();
select test.login('00000000-0000-0000-0000-000000000e08');
select test.fails($$select admin_set_branch_building(2::smallint, true)$$, 'للإدارة|FORBIDDEN', 'تحديد المبنى للإداري وحده');
select test.logout();

-- ---------------------------------------------------------------------
-- قاعدة الرتبة
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000e05');   -- مدير فرع 1
select test.ok(can_manage_account('employee', (select t1 from pf)), 'مدير الفرع يدير حساب معلم فرعه');
select test.ok(not can_manage_account('employee', (select b1b from pf)), 'ولا حساب مدير فرع زميله');
select test.ok(not can_manage_account('employee', (select d1 from pf)), 'ولا حساب مدير الفروع');
select test.fails(format($$select save_employee(%s, '{"name_ar":"x","user_type":"teacher","scope":{"branch_id":1,"grade_ids":[1],"section_ids":[1],"subject_ids":[1]}}')$$, (select b1b from pf)), 'FORBIDDEN', 'ولا يعدّل سجل زميله المدير');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000e01');   -- مدير الفروع
select test.ok(can_manage_account('employee', (select b1 from pf)), 'مدير الفروع يدير حساب مدير الفرع');
select test.ok(can_manage_account('employee', (select t1 from pf)), 'وحساب المعلم');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000e03');   -- مراقب
select test.ok(not can_manage_account('employee', (select t1 from pf)), 'المراقب لا يدير حسابات (عرض فقط)');
select test.ok((select count(*) from students) >= 0 and my_access() -> 'areas' -> 'performance' ->> 'level' = '3', 'قدرات المراقب: أداء كامل');
select test.fails($$select save_student(null, '{"name_ar":"x","branch_id":1,"grade_id":1,"section_id":1}')$$, 'FORBIDDEN', 'ولا يسجّل طلابًا');
select test.fails($$select save_release_rule(null, '{"kind":"block","branch_ids":[1]}')$$, 'FORBIDDEN', 'ولا يحجب نتائج');
select test.logout();

-- ---------------------------------------------------------------------
-- النموذج
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000e03');
select test.ok(jsonb_array_length(perf_form(1::smallint) -> 'sections') = 6, 'فرع بمبنى: ستة أقسام');
select test.ok(jsonb_array_length(perf_form(2::smallint) -> 'sections') = 5, 'فرع بلا مبنى: بلا قسم المبنى');
select test.ok(jsonb_array_length(perf_my_branches()) >= 2, 'فروع المراقب');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000e04');   -- مراقب ثانٍ: فرع 1 فقط
select test.ok(jsonb_array_length(perf_my_branches()) = 1, 'المراقب الثاني فرعه واحد');
select test.fails($$select perf_form(2::smallint)$$, 'FORBIDDEN', 'ولا نموذج فرع غير مسند');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000e05');   -- مدير فرع
select test.fails($$select perf_form(1::smallint)$$, 'FORBIDDEN', 'مدير الفرع لا يرى نموذج التقرير');
select test.ok(jsonb_array_length(perf_my_branches()) = 0, 'ولا فروع تقارير');
select test.logout();

-- ---------------------------------------------------------------------
-- كتابة التقرير
-- ---------------------------------------------------------------------
create temp table pi as select
  (select jsonb_agg(jsonb_build_object('item', i.code, 'rating', 3, 'note', 'ملاحظة')) from perf_items i join perf_sections s on s.code = i.section) as all_items,
  (select jsonb_agg(jsonb_build_object('item', i.code, 'rating', 4)) from perf_items i join perf_sections s on s.code = i.section where not s.building_only) as no_building;
grant select on pi to public;
select test.login('00000000-0000-0000-0000-000000000e03');
insert into pr select 'r1', perf_save_report(null, jsonb_build_object('branch_id', 1, 'visit_type', 'field', 'visit_date', current_date, 'strengths', 'انضباط جيد',
  'scores', (select jsonb_agg(x) from (select jsonb_build_object('item', 'd_students', 'rating', 4) x union all select jsonb_build_object('item', 'b_clean', 'rating', 2, 'note', 'يحتاج عناية')) q)));
select test.ok((select count(*) from pr where k = 'r1') = 1, 'المراقب ينشئ مسودة لفرعه');
select test.ok((perf_get((select v from pr where k = 'r1')) ->> 'overall_pct')::numeric = 75.00, 'النسبة: (4+2) ÷ 8 = 75%');
select test.fails($$select perf_save_report(null, '{"branch_id":1,"scores":[{"item":"zzz","rating":3}]}')$$, 'بند غير معروف', 'بند مجهول مرفوض');
select test.fails($$select perf_save_report(null, '{"branch_id":2,"scores":[{"item":"b_clean","rating":3}]}')$$, 'لا ينطبق على هذا الفرع', 'بند المبنى لفرع بلا مبنى مرفوض');
select test.fails($$select perf_save_report(null, '{"branch_id":1,"scores":[{"item":"d_staff","rating":5}]}')$$, 'تقييم غير صحيح|check', 'تقييم 5 مرفوض');
select test.fails($$select perf_save_report(null, '{"branch_id":1,"visit_date":"2999-01-01","scores":[]}')$$, 'المستقبل', 'تاريخ مستقبلي مرفوض');
select test.fails($$select perf_save_report(null, '{"branch_id":3,"scores":[]}')$$, 'FORBIDDEN|غير موجود|foreign', 'فرع غير مسند مرفوض');
select test.ok(perf_save_report((select v from pr where k = 'r1'), jsonb_build_object('branch_id', 1, 'scores', (select pi.all_items from pi))) = (select v from pr where k = 'r1'), 'يعدّل مسودته ويعيد التقييمات كاملة');
select test.fails($$insert into perf_reports (branch_id, author_id) values (1, 1)$$, 'permission denied', 'لا كتابة مباشرة');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000e04');   -- مراقب آخر في نفس الفرع
select test.fails(format($$select perf_save_report(%s, '{"scores":[]}')$$, (select v from pr where k = 'r1')), 'FORBIDDEN', 'مراقب آخر لا يعدّل مسودة غيره');
select test.fails(format($$select perf_get(%s)$$, (select v from pr where k = 'r1')), 'غير موجود', 'ولا يقرؤها');
select test.ok(jsonb_array_length(perf_list()) = 0, 'ولا يراها في قائمته');
select test.logout();

-- ---------------------------------------------------------------------
-- المسودة لا يراها أحد غيره، والمرفقات
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000e01');   -- مدير الفروع
select test.ok(jsonb_array_length(perf_list()) = 0, 'مدير الفروع لا يرى المسودة');
select test.fails(format($$select perf_get(%s)$$, (select v from pr where k = 'r1')), 'غير موجود', 'ولا يفتحها');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000e03');
select test.ok(perf_add_attachment((select v from pr where k = 'r1'), 'building', 'صورة.png', 'reports/' || (select v from pr where k = 'r1') || '/a.png', 'image/png', 1000) is not null, 'مرفق على المسودة');
select test.fails(format($$select perf_add_attachment(%s, null, 'x', 'reports/999/a.png', 'image/png', 1000)$$, (select v from pr where k = 'r1')), 'مسار', 'مسار تقرير آخر مرفوض');
select test.fails(format($$select perf_add_attachment(%s, 'zzz', 'x', 'reports/%s/b.png', 'image/png', 1000)$$, (select v from pr where k = 'r1'), (select v from pr where k = 'r1')), 'قسم غير معروف', 'قسم مجهول مرفوض');
select test.logout();

-- ---------------------------------------------------------------------
-- الإرسال
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000e03');
insert into pr select 'r2', perf_save_report(null, jsonb_build_object('branch_id', 1, 'scores', (select jsonb_agg(x) from (select * from jsonb_array_elements((select pi.all_items from pi)) limit 5) q(x))));
select test.fails(format($$select perf_send_report(%s)$$, (select v from pr where k = 'r2')), 'أكمل تقييم', 'لا إرسال قبل اكتمال البنود');
select perf_delete_draft((select v from pr where k = 'r2'));
select test.ok(test.peek(format('select count(*) from perf_reports where id = %s', (select v from pr where k = 'r2'))) = '0', 'ويحذف مسودته');
select test.ok(perf_send_report((select v from pr where k = 'r1')) = 1, 'الإرسال يعيد عدد مديري الفروع المستلمين (1)');
select test.fails(format($$select perf_save_report(%s, '{"scores":[]}')$$, (select v from pr where k = 'r1')), 'أُرسل', 'لا تعديل بعد الإرسال');
select test.fails(format($$select perf_delete_draft(%s)$$, (select v from pr where k = 'r1')), 'أُرسل', 'ولا حذف');
select test.fails(format($$select perf_add_attachment(%s, null, 'x', 'reports/%s/c.png', 'image/png', 1000)$$, (select v from pr where k = 'r1'), (select v from pr where k = 'r1')), 'FORBIDDEN', 'ولا مرفق جديد');
select test.fails(format($$select perf_send_report(%s)$$, (select v from pr where k = 'r1')), 'أُرسل', 'ولا إرسال مكرر');
select test.logout();

-- ---------------------------------------------------------------------
-- القراءة بعد الإرسال
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000e01');   -- مدير فروع 1
select test.ok((select (e ->> 'unread')::boolean from jsonb_array_elements(perf_list()) e where (e ->> 'id')::bigint = (select v from pr where k = 'r1')), 'يصله غير مقروء');
select test.ok(perf_get((select v from pr where k = 'r1')) ->> 'status' = 'sent', 'ويفتحه');
select test.ok(not (select (e ->> 'unread')::boolean from jsonb_array_elements(perf_list()) e where (e ->> 'id')::bigint = (select v from pr where k = 'r1')), 'ويُعلَّم مقروءًا');
select test.ok(perf_attachment_path((select id from perf_attachments limit 1)) is not null, 'ويحصل على مسار المرفق');
select test.ok((select count(*) from perf_scores) >= 28, 'ويرى التقييمات');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000e02');   -- مدير فروع 2: الفرع 1 ليس له
select test.ok(jsonb_array_length(perf_list()) = 0, 'مدير فروع آخر لا يرى تقرير فرع غير مسند');
select test.fails(format($$select perf_get(%s)$$, (select v from pr where k = 'r1')), 'غير موجود', 'ولا يفتحه');
select test.ok(perf_attachment_path((select v from pr where k = 'r1')) is null, 'ولا مرفقاته');
select test.ok((select count(*) from perf_reports) = 0 and (select count(*) from perf_scores) = 0 and (select count(*) from perf_attachments) = 0, 'ولا يقرأ الجداول');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000e05');   -- مدير فرع
select test.ok(jsonb_array_length(perf_list()) = 0 and (select count(*) from perf_reports) = 0, 'مدير الفرع لا يرى تقارير الأداء');
select test.fails(format($$select perf_get(%s)$$, (select v from pr where k = 'r1')), 'غير موجود', 'ولا يفتحها');
select test.fails(format($$select perf_acknowledge(%s, 'x')$$, (select v from pr where k = 'r1')), 'FORBIDDEN', 'ولا يعتمدها');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000e08');   -- معلم عادي
select test.ok(jsonb_array_length(perf_list()) = 0, 'المعلم العادي لا يرى شيئًا');
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000a0');
select test.ok(perf_get((select v from pr where k = 'r1')) ->> 'status' = 'sent', 'الإداري يقرأ الكل');
select test.logout();
set role anon;
select test.fails($$select perf_list()$$, 'permission denied', 'الزائر لا يستدعي');
reset role;

-- ---------------------------------------------------------------------
-- الاعتماد والرد
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000e03');
select test.fails(format($$select perf_acknowledge(%s, 'x')$$, (select v from pr where k = 'r1')), 'FORBIDDEN', 'المراقب لا يعتمد تقريره');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000e02');
select test.fails(format($$select perf_acknowledge(%s, 'x')$$, (select v from pr where k = 'r1')), 'FORBIDDEN', 'ولا مدير فروع غير مسند');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000e01');
select perf_acknowledge((select v from pr where k = 'r1'), 'شكرًا، سنعالج النظافة');
select test.ok(perf_get((select v from pr where k = 'r1')) ->> 'status' = 'acknowledged' and perf_get((select v from pr where k = 'r1')) ->> 'director_reply' like '%النظافة%', 'مدير الفروع يعتمد ويردّ');
select test.fails(format($$select perf_acknowledge(%s, 'x')$$, (select v from pr where k = 'r1')), 'مُرسَل', 'ولا يعتمد مرتين');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000e03');
select test.ok(perf_get((select v from pr where k = 'r1')) ->> 'director_reply' is not null, 'المراقب يرى الرد');
select test.logout();
select test.ok((select count(*) from audit_log where table_name = 'perf_reports') >= 3, 'العمليات في سجل النشاط');
