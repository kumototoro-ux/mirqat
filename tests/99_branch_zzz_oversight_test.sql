-- =====================================================================
-- هجرة 40: الإشراف على الفرع — تقرير الفرع، سجل نشاط الفرع، متابعة المهام والرصد
-- يعتمد على الفرعين 1 و2 (الفصلان 1 و2 في الفرع 1، والفصل 3 في الفرع 2)
-- =====================================================================
\set ON_ERROR_STOP 1
insert into employees (code, name_ar, user_type) values
  ('OVD', 'مدير فروع', 'teacher'), ('OVM', 'مدير فرع 1', 'teacher'), ('OVM2', 'مدير فرع 2', 'teacher'),
  ('OVS', 'مشرف طلاب 1', 'teacher'), ('OVT', 'مشرف معلمات 1', 'teacher'), ('OVN', 'معلم عادي', 'teacher'), ('OVA', 'قبول 1', 'teacher');
insert into auth.users (id) select ('00000000-0000-0000-0000-000000000f' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 7) n;
insert into profiles (id, username, role, employee_id, status, must_change_password)
select ('00000000-0000-0000-0000-000000000f' || lpad(v.n::text, 2, '0'))::uuid, 'ov' || v.n, 'teacher', e.id, 'active', false
  from (values (1, 'OVD'), (2, 'OVM'), (3, 'OVM2'), (4, 'OVS'), (5, 'OVT'), (6, 'OVN'), (7, 'OVA')) v(n, c) join employees e on e.code = v.c;
insert into employee_positions (employee_id, position, branch_id)
select e.id, v.p, v.b from (values ('OVD', 'branches_director', 1), ('OVM', 'branch_manager', 1), ('OVM2', 'branch_manager', 2),
  ('OVS', 'students_supervisor', 1), ('OVT', 'teachers_supervisor', 1), ('OVA', 'admissions', 1)) v(c, p, b) join employees e on e.code = v.c;
insert into staff_scope (employee_id, branch_id) select id, 1 from employees where code = 'OVN';
create temp table ov as select (select id from employees where code = 'OVN') as n, (select id from employees where code = 'OVT') as t;
grant select on ov to public;

-- نشاط: طالب في فرع 1 وآخر في فرع 2 (التريغر يسجّل في سجل التدقيق)
insert into students (code, name_ar, class_id) values ('OV1', 'طالب نشاط فرع 1', 1), ('OV2', 'طالب نشاط فرع 2', 3);
-- مهمة في فرع 1 وأخرى في فرع 2
insert into assessments (kind, class_id, subject_id, term_id, teacher_id, title, max_score, submission_mode, is_draft)
select 'task', v.cls, (select min(id) from subjects), (select min(id) from terms), (select n from ov), v.t, 10, 'text', false
  from (values (1, 'مهمة فرع 1 للمتابعة'), (3, 'مهمة فرع 2 للمتابعة')) v(cls, t);

-- قدرات المجال الجديد
select test.ok((select count(*) from position_caps where area = 'audit') = 2, 'سجل النشاط: منصبان فقط');
select test.ok(not exists (select 1 from position_caps where area = 'audit' and position not in ('branch_manager', 'branches_director')), 'ولا غيرهما');

-- ---------------------------------------------------------------------
-- cap_branches
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000f02');   -- مدير فرع 1
select test.ok(jsonb_array_length(cap_branches('audit', 1)) = 1 and cap_branches('audit', 1) -> 0 ->> 'id' = '1', 'مدير الفرع: فرعه وحده');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000f06');   -- معلم عادي
select test.ok(jsonb_array_length(cap_branches('reports', 1)) = 0, 'المعلم العادي: لا فروع');
select test.logout();

-- ---------------------------------------------------------------------
-- تقرير الفرع
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000f02');
select test.ok((branch_report(1::smallint) -> 'students' ->> 'all')::int >= 1, 'مدير الفرع يقرأ تقرير فرعه');
select test.ok((branch_report(1::smallint) -> 'students' ->> 'all')::int = (select count(*) from students s join classes c on c.id = s.class_id where c.branch_id = 1), 'العدد = طلاب الفرع فقط');
select test.fails($$select branch_report(2::smallint)$$, 'FORBIDDEN', 'ولا تقرير فرع آخر');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000f04');   -- مشرف طلاب
select test.ok(branch_report(1::smallint) ->> 'branch' is not null, 'مشرف الطلاب يرى التقرير (عرض)');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000f07');   -- قبول وتسجيل: لا تقارير
select test.fails($$select branch_report(1::smallint)$$, 'FORBIDDEN', 'مسؤول القبول لا يرى التقارير');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000f06');
select test.fails($$select branch_report(1::smallint)$$, 'FORBIDDEN', 'المعلم العادي لا يرى التقارير');
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000a0');   -- إداري
select test.ok(branch_report(2::smallint) ->> 'branch' is not null, 'الإداري يرى كل فرع');
select test.logout();

-- ---------------------------------------------------------------------
-- سجل نشاط الفرع
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000f02');
select test.ok((branch_audit(1::smallint, null, null, 0, 20) ->> 'total')::int > 0, 'مدير الفرع يرى نشاط فرعه');
select test.ok(exists (select 1 from jsonb_array_elements(branch_audit(1::smallint, 'نشاط', null, 0, 50) -> 'rows') r where r ->> 'table_name' = 'students') or
               (branch_audit(1::smallint, null, 'students', 0, 50) ->> 'total')::int > 0, 'تسجيل طالب الفرع ظاهر');
select test.ok(not exists (select 1 from jsonb_array_elements(branch_audit(1::smallint, null, 'students', 0, 50) -> 'rows') r
                            where (select class_id from students where id = (r ->> 'record_id')::bigint) = 3), 'ولا شيء من طلاب الفرع الآخر');
select test.ok(not (branch_audit(1::smallint, null, null, 0, 50) -> 'rows' -> 0 ? 'old_data'), 'الصف بلا بيانات خام (old/new)');
select test.fails($$select branch_audit(2::smallint)$$, 'FORBIDDEN', 'ولا نشاط فرع آخر');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000f01');   -- مدير الفروع
select test.ok((branch_audit(1::smallint) ->> 'total')::int > 0, 'مدير الفروع يرى نشاط فرعه');
select test.fails($$select branch_audit(2::smallint)$$, 'FORBIDDEN', 'وفرعه فقط');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000f04');   -- مشرف طلاب
select test.fails($$select branch_audit(1::smallint)$$, 'FORBIDDEN', 'مشرف الطلاب لا يرى سجل النشاط');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000f06');
select test.fails($$select branch_audit(1::smallint)$$, 'FORBIDDEN', 'المعلم العادي لا يرى سجل النشاط');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000f03');   -- مدير فرع 2
select test.ok(not exists (select 1 from jsonb_array_elements(branch_audit(2::smallint, null, 'students', 0, 50) -> 'rows') r
                            where (select class_id from students where id = (r ->> 'record_id')::bigint) in (1, 2)), 'فرع 2 لا يرى طلاب فرع 1');
select test.logout();

-- ---------------------------------------------------------------------
-- متابعة المهام والرصد
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-000000000f05');   -- مشرف معلمات
select test.ok(exists (select 1 from jsonb_array_elements(branch_tasks('{"branch":1}') -> 'rows') r where r ->> 'title' = 'مهمة فرع 1 للمتابعة'), 'مشرف المعلمات يرى مهام فرعه');
select test.ok(not exists (select 1 from jsonb_array_elements(branch_tasks('{"branch":1,"limit":50}') -> 'rows') r where r ->> 'title' = 'مهمة فرع 2 للمتابعة'), 'ولا مهام الفرع الآخر');
select test.fails($$select branch_tasks('{"branch":2}')$$, 'FORBIDDEN', 'ولا يطلب فرعًا آخر');
select test.ok(branch_grading('{"branch":1}') ? 'teachers', 'ملخص الرصد لفرعه');
select test.fails($$select branch_grading('{"branch":2}')$$, 'FORBIDDEN', 'ولا رصد فرع آخر');
select test.fails($$select * from assessments where title = 'x' for update$$ || '; select save_student(null, ''{}'')', 'FORBIDDEN|permission|row-level', 'القراءة لا تمنح كتابة');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000f04');   -- مشرف طلاب: لا مهام ولا رصد
select test.fails($$select branch_tasks('{"branch":1}')$$, 'FORBIDDEN', 'مشرف الطلاب لا يرى المهام');
select test.fails($$select branch_grading('{"branch":1}')$$, 'FORBIDDEN', 'ولا الرصد');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000f07');   -- قبول
select test.fails($$select branch_tasks('{"branch":1}')$$, 'FORBIDDEN', 'مسؤول القبول لا يرى المهام');
select test.fails($$select branch_grading('{"branch":1}')$$, 'FORBIDDEN', 'ولا الرصد');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000f06');
select test.fails($$select branch_tasks('{"branch":1}')$$, 'FORBIDDEN', 'المعلم العادي لا يرى متابعة الفرع');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000f02');
select test.ok((branch_tasks('{"branch":1}') -> 'summary' ->> 'tasks')::int >= 1, 'مدير الفرع يرى ملخص المهام');
select test.logout();
do $$ begin raise notice '✅ اختبارات هجرة 40'; end $$;
