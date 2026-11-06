-- =====================================================================
-- هجرة 35: مفاتيح الصلاحيات الفردية — الافتراضي، المنح، السحب، المنع في القاعدة، والتدقيق
-- =====================================================================
\set ON_ERROR_STOP 1

-- يرجع نص الخطأ (أو '' إن نجح) لاختبار أن المنع هو الفاصل وليس خطأ آخر
create function test.err(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return '';
exception when others then
  return sqlerrm;
end $$;
grant execute on function test.err(text) to authenticated, service_role;

-- معلم جديد (بلا استثناءات فردية) ومعلم ثانٍ لاختبار العزل
insert into employees (code, name_ar, user_type) values ('PK1', 'معلم جديد', 'teacher'), ('PK2', 'معلم آخر', 'teacher');
insert into staff_scope (employee_id, branch_id)  select id, 1 from employees where code in ('PK1', 'PK2');
insert into staff_scope (employee_id, grade_id)   select id, 1 from employees where code in ('PK1', 'PK2');
insert into staff_scope (employee_id, section_id) select id, 1 from employees where code in ('PK1', 'PK2');
insert into staff_scope (employee_id, subject_id) select id, 1 from employees where code in ('PK1', 'PK2');
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000009a1'), ('00000000-0000-0000-0000-0000000009a2');
insert into profiles (id, username, role, employee_id, status, must_change_password)
select '00000000-0000-0000-0000-0000000009a1', 'pk1', 'teacher', id, 'active', false from employees where code = 'PK1';
insert into profiles (id, username, role, employee_id, status, must_change_password)
select '00000000-0000-0000-0000-0000000009a2', 'pk2', 'teacher', id, 'active', false from employees where code = 'PK2';
create temp table pk as select
  (select id from employees where code = 'PK1') as e1, (select id from employees where code = 'PK2') as e2;
grant select on pk to public;

-- ---------------------------------------------------------------------
-- القائمة والافتراضيات
-- ---------------------------------------------------------------------
select test.ok((select count(*) from permission_keys) = 8, 'ثمانية مفاتيح');
select test.ok((select array_agg(key order by key) from permission_keys where not teacher_default) = array['camera_grading', 'create_exams', 'reopen'],
  'المغلق افتراضيًا: إنشاء الاختبارات والتصحيح بالكاميرا وإعادة الفتح');

-- ---------------------------------------------------------------------
-- معلم جديد: المغلق مغلق في القاعدة نفسها، والمفتوح مفتوح
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-0000000009a1');
select test.ok((my_permissions() ->> 'create_exams')::boolean = false, 'مفاتيحي: إنشاء الاختبارات مغلق');
select test.ok((my_permissions() ->> 'camera_grading')::boolean = false, 'مفاتيحي: التصحيح بالكاميرا مغلق');
select test.ok((my_permissions() ->> 'reopen')::boolean = false, 'مفاتيحي: إعادة الفتح مغلق');
select test.ok((my_permissions() ->> 'daily_grading')::boolean and (my_permissions() ->> 'print_exams')::boolean, 'مفاتيحي: الرصد والطباعة مفتوحان');
select test.fails($$select save_form(null, '{"title":"ن","subject_id":1,"term_id":1,"eval_type_id":2,"questions":[]}', array[1])$$,
  'FORBIDDEN', 'لا يُنشأ نموذج بلا مفتاح');
select test.fails($$select save_paper_attempt(1, 1, '[]'::jsonb, null, null)$$, 'FORBIDDEN|does not exist', 'لا تصحيح بالكاميرا بلا مفتاح');
select test.fails($$select reopen_task(1, now() + interval '1 day')$$, 'FORBIDDEN', 'لا إعادة فتح مهمة بلا مفتاح');
select test.fails($$select reopen_form(1, now() + interval '1 day')$$, 'FORBIDDEN', 'ولا نموذج');
-- المفتوح لا يقف عند المفتاح (يفشل لسبب آخر: التقييم غير موجود)
select test.ok(test.err($$select grade_task(0, '[]')$$) !~ 'لا تملك صلاحية هذه العملية', 'الرصد اليومي لا يُمنع بالمفتاح');
select test.ok(test.err($$select duplicate_assessment(0, null)$$) !~ 'لا تملك صلاحية هذه العملية', 'النسخ لا يُمنع بالمفتاح');
select test.logout();

-- ---------------------------------------------------------------------
-- العزل: لا كتابة مباشرة، ولا منح للنفس، ولا قراءة استثناءات الغير
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-0000000009a1');
select test.fails(format($$select admin_set_permission(%s, 'create_exams', true)$$, (select e1 from pk)), 'FORBIDDEN|للإدارة|permission denied', 'المعلم لا يمنح نفسه مفتاحًا');
select test.fails(format($$insert into user_permissions (employee_id, key, granted) values (%s, 'create_exams', true)$$, (select e1 from pk)),
  'permission denied|row-level security', 'ولا يكتب في الجدول مباشرة');
select test.fails(format($$update user_permissions set granted = true where employee_id = %s$$, (select e1 from pk)), 'permission denied', 'ولا يعدّله');
select test.fails($$delete from user_permissions$$, 'permission denied', 'ولا يحذف');
select test.logout();

select test.login('00000000-0000-0000-0000-0000000000a0');   -- الإداري
select admin_set_permission((select e1 from pk), 'create_exams', true);
select admin_set_permission((select e2 from pk), 'reopen', true);
select test.logout();
select test.login('00000000-0000-0000-0000-0000000009a1');
select test.ok((select count(*) from user_permissions) = 1, 'المعلم يرى استثناءاته هو فقط');
select test.ok((select count(*) from user_permissions where employee_id = (select e2 from pk)) = 0, 'ولا يرى استثناءات غيره');
select test.logout();

-- ---------------------------------------------------------------------
-- المنح والسحب والإعادة للافتراضي (الإداري وحده)
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-0000000009a1');
select test.ok((my_permissions() ->> 'create_exams')::boolean, 'بعد المنح: إنشاء الاختبارات مفتوح');
select test.ok(test.err($$select save_form(null, '{"title":"ن","subject_id":1,"term_id":1,"eval_type_id":2,"questions":[]}', array[1])$$) !~ 'لا تملك صلاحية هذه العملية',
  'بعد المنح لا يوقفه المفتاح (قد يفشل لسبب آخر)');
select test.logout();

select test.login('00000000-0000-0000-0000-0000000000a0');
select admin_set_permission((select e1 from pk), 'create_exams', false);          -- سحب صريح
select admin_set_permission((select e1 from pk), 'daily_grading', false);         -- سحب مفتاح مفتوح افتراضيًا
select test.logout();
select test.login('00000000-0000-0000-0000-0000000009a1');
select test.fails($$select save_form(null, '{"title":"ن","subject_id":1,"term_id":1,"eval_type_id":2,"questions":[]}', array[1])$$, 'FORBIDDEN', 'بعد السحب يُمنع من جديد');
select test.fails($$select grade_task(0, '[]')$$, 'FORBIDDEN', 'والرصد اليومي يُسحب حتى من الافتراضي');
select test.fails($$select save_manual(null, '{}', 1, null, '[]')$$, 'FORBIDDEN', 'والرصد اليدوي كذلك');
select test.fails($$select save_improvement('{}')$$, 'FORBIDDEN', 'وتحسين الدرجات');
select test.logout();

select test.login('00000000-0000-0000-0000-0000000000a0');
select admin_set_permission((select e1 from pk), 'daily_grading', null);          -- إعادة للافتراضي (مفتوح)
select test.ok((select count(*) from user_permissions where employee_id = (select e1 from pk) and key = 'daily_grading') = 0, 'الإعادة للافتراضي تحذف الاستثناء');
select test.fails($$select admin_set_permission(1, 'غير_موجود', true)$$, 'مفتاح غير معروف', 'مفتاح مجهول مرفوض');
select test.fails($$select admin_set_permission(999999, 'reopen', true)$$, 'الموظف غير موجود', 'موظف مجهول مرفوض');
select test.fails($$select admin_set_permission((select id from employees where user_type = 'admin' limit 1), 'reopen', false)$$,
  'الإداري يملك كل الصلاحيات', 'لا يُسحب مفتاح من إداري');
select test.logout();
select test.login('00000000-0000-0000-0000-0000000009a1');
select test.ok((my_permissions() ->> 'daily_grading')::boolean, 'عاد الرصد مفتوحًا');
select test.logout();

-- ---------------------------------------------------------------------
-- الإداري يملك كل شيء، والطالب لا شيء، ومن بلا سجل لا شيء
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-0000000000a0');
select test.ok((select bool_and(v::text::boolean) from jsonb_each(my_permissions()) t(k, v)), 'الإداري يملك كل المفاتيح');
select test.ok(test.err($$select reopen_task(0, now() + interval '1 day')$$) !~ 'لا تملك صلاحية هذه العملية', 'ولا يوقفه المفتاح');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000052');
select test.ok(not (select bool_or(v::text::boolean) from jsonb_each(my_permissions()) t(k, v)), 'الطالب لا يملك أي مفتاح');
select test.fails($$select reopen_task(0, now() + interval '1 day')$$, 'FORBIDDEN', 'والطالب مُنع');
select test.fails($$select save_content(null, '{}', array[1])$$, 'FORBIDDEN', 'ولا ينشر محتوى');
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000dd');   -- حساب بلا سجل
select test.ok(not (select bool_or(v::text::boolean) from jsonb_each(my_permissions()) t(k, v)), 'حساب بلا سجل لا يملك شيئًا');
select test.logout();

-- الزائر (anon) لا يصل إلى الدوال ولا الجداول
set role anon;
select test.fails($$select my_permissions()$$, 'permission denied', 'الزائر لا ينفّذ مفاتيحي');
select test.fails($$select count(*) from permission_keys$$, 'permission denied', 'ولا يقرأ القائمة');
select test.fails($$select count(*) from user_permissions$$, 'permission denied', 'ولا الاستثناءات');
reset role;
select test.ok(not has_function_privilege('anon', 'app.has_perm(text)', 'execute'), 'الفحص الداخلي مغلق على الزائر');

-- ---------------------------------------------------------------------
-- التدقيق: من منح من ومتى
-- ---------------------------------------------------------------------
select test.ok((select count(*) from audit_log where table_name = 'user_permissions' and actor_role = 'admin') >= 3, 'كل منح وسحب في سجل النشاط');
select test.ok((select count(*) from audit_log where table_name = 'user_permissions' and new_data ->> 'granted' = 'false') >= 1, 'والسحب مسجّل بقيمته');

-- ---------------------------------------------------------------------
-- ما أُنشئ سابقًا لا يضيع بسحب المفتاح: المعلم يبقى يرى تقييماته
-- ---------------------------------------------------------------------
select test.login('00000000-0000-0000-0000-0000000000e6');
select test.ok((select count(*) from assessments) > 0, 'معلم له تقييمات سابقة يبقى يراها (القراءة لا تتأثر بالمفاتيح)');
select test.logout();
