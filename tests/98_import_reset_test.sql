-- =====================================================================
-- هجرة 26: الاستيراد من Excel، النسخة الاحتياطية، والتصفير
-- =====================================================================
\set ON_ERROR_STOP 1
create temp table r (k text primary key, v bigint);
grant all on r to authenticated, service_role;

-- فصل في فرع الشمال (للتأكد أن التصفير بالفرع لا يمس غيره)
insert into classes (branch_id, grade_id, section_id) values (2, 1, 1) on conflict do nothing;
insert into r select 'north', id from classes where branch_id = 2 and grade_id = 1 and section_id = 1;
insert into r select 'main', id from classes where branch_id = 1 and grade_id = 1 and section_id = 1;

-- المعلم لا يستورد
select test.login('00000000-0000-0000-0000-0000000000e2');
select test.fails($$select import_students('[{"name_ar":"x y","branch_id":1,"grade_id":1}]')$$, 'للإدارة', 'الاستيراد للإدارة فقط');
select test.fails($$select backup_rows('students', null, 0, 10)$$, 'للإدارة', 'النسخة الاحتياطية للإدارة فقط');
select test.logout();

select test.login('00000000-0000-0000-0000-0000000000a0');
-- طالبان جديدان (أحدهما بلا رقم ← رقم تلقائي)، وصف برقم هوية مكرر ← خطأ في صفه فقط
select test.ok((select (x ->> 'created')::int = 3 and jsonb_array_length(x -> 'errors') = 1
                  from import_students(jsonb_build_array(
                    jsonb_build_object('code', 'A900', 'name_ar', 'طالب مستورد أول', 'national_id', '7700000001', 'birth_date', '2012-03-04', 'branch_id', 1, 'grade_id', 1, 'section_id', 1),
                    jsonb_build_object('name_ar', 'طالب بلا رقم', 'birth_date', '1434/05/01', 'branch_id', 1, 'grade_id', 1, 'section_id', 1),
                    jsonb_build_object('code', 'N900', 'name_ar', 'طالب الشمال', 'branch_id', 2, 'grade_id', 1, 'section_id', 1),
                    jsonb_build_object('code', 'A901', 'name_ar', 'هوية مكررة', 'national_id', '7700000001', 'branch_id', 1, 'grade_id', 1, 'section_id', 1)
                  )) x), 'استيراد: 3 جدد وخطأ واحد لا يوقف البقية');
select test.ok((select class_id from students where code = 'A900') = (select v from r where k = 'main'), 'الفصل من الفرع والصف والشعبة');
select test.ok((select birth_date from students where code = 'A900') = '2012-03-04', 'التاريخ الميلادي يُحفظ تاريخًا');
select test.ok((select birth_date_text from students where name_ar = 'طالب بلا رقم') = '1434/05/01', 'الهجري يُحفظ نصًا لا يضيع');
select test.ok((select code from students where name_ar = 'طالب بلا رقم') ~ '^S\d+$', 'بلا رقم ← رقم تلقائي');
-- إعادة الرفع: تحديث لا تكرار، والفصل يبقى إن لم تُحدد الشعبة
select test.ok((select (x ->> 'updated')::int = 1 from import_students('[{"code":"A900","name_ar":"طالب مستورد معدّل","branch_id":1,"grade_id":1}]') x), 'إعادة الرفع تحدّث');
select test.ok((select count(*) from students where code = 'A900') = 1 and (select name_ar from students where code = 'A900') = 'طالب مستورد معدّل'
           and (select class_id from students where code = 'A900') = (select v from r where k = 'main'), 'بلا تكرار، والفصل كما هو');

-- مجاميع الترم الأول المنقولة: قيمة موزونة ← نفس المجموع في النتائج
insert into r select 'stu', id from students where code = 'A900';
insert into r select 'et', w.eval_type_id from grade_weights w where w.subject_id = 1 and w.weight > 0 order by w.weight desc limit 1;
insert into r select 'w', (select weight from grade_weights where subject_id = 1 and eval_type_id = (select v from r where k = 'et'))::bigint;
select test.ok((select (x ->> 'saved')::int = 1 and jsonb_array_length(x -> 'errors') = 1
                  from import_term_grades(1::smallint, jsonb_build_array(
                    jsonb_build_object('student_id', (select v from r where k = 'stu'), 'subject_id', 1, 'eval_type_id', (select v from r where k = 'et'), 'value', (select v from r where k = 'w') / 2.0),
                    jsonb_build_object('student_id', (select v from r where k = 'stu'), 'subject_id', 1, 'eval_type_id', (select v from r where k = 'et'), 'value', (select v from r where k = 'w') + 1)
                  )) x), 'المجاميع: قيمة صحيحة تُحفظ، وقيمة فوق الوزن تُرفض');
select test.ok((select (s -> 'total')::text::numeric
                  from jsonb_array_elements(class_results((select v from r where k = 'main')::int, 1::smallint) -> 'students') x,
                       jsonb_array_elements(x -> 'subjects') s
                 where x ->> 'code' = 'A900' and (s ->> 'subject_id')::int = 1) = round((select v from r where k = 'w') / 2.0, 2),
               'النتائج تحسب المجموع المنقول كما هو تمامًا');
select import_term_grades(1::smallint, jsonb_build_array(jsonb_build_object('student_id', (select v from r where k = 'stu'), 'subject_id', 1, 'eval_type_id', (select v from r where k = 'et'), 'value', 1)));
select test.ok((select count(*) from grade_entries ge join assessments a on a.id = ge.assessment_id
                 where ge.student_id = (select v from r where k = 'stu') and a.source_sheet = 'import:term_totals') = 1
           and (select ge.score from grade_entries ge join assessments a on a.id = ge.assessment_id
                 where ge.student_id = (select v from r where k = 'stu') and a.source_sheet = 'import:term_totals') = 1, 'إعادة رفع المجاميع تحدّث ولا تكرر');

-- النسخة الاحتياطية: أسماء مقروءة ومقيّدة بالفرع
select test.ok((select bool_or(x ->> 'الرقم' = 'A900') from json_array_elements(backup_rows('students', 1::smallint, 0, 5000)) x), 'نسخة الطلاب فيها المستورد');
select test.ok(not (select coalesce(bool_or(x ->> 'الرقم' = 'N900'), false) from json_array_elements(backup_rows('students', 1::smallint, 0, 5000)) x), 'ونسخة الفرع لا تشمل فرعًا آخر');
select test.ok((select bool_or(x ->> 'رقم الطالب' = 'A900') from json_array_elements(backup_rows('totals', 1::smallint, 0, 5000)) x), 'نسخة المجاميع');
select test.ok(json_array_length(backup_rows('grades', null, 0, 5)) <= 5, 'الصفحات تحترم الحد');
select test.ok((select bool_and(json_array_length(backup_rows(t, null, 0, 50)) >= 0) from unnest(array['students','employees','totals','grades','assessments','questions','attendance','behavior','content','settings']) t), 'كل جداول النسخة تعمل');
select test.ok((select string_agg(k, ',') from json_object_keys(backup_rows('students', null, 0, 1) -> 0) k) like 'الرقم,الاسم,%', 'ترتيب الأعمدة كما كُتب (json لا jsonb)');

-- التصفير: كلمة التأكيد، والنسخة الحديثة، والنطاق
select test.fails($$select admin_reset_data(2::smallint, array['students'], 'تصفير')$$, 'نسخة احتياطية', 'لا تصفير بلا نسخة احتياطية حديثة');
select test.logout();
insert into app_settings (key, value, is_public) values ('last_backup', jsonb_build_object('at', now(), 'branch', 2), false)
  on conflict (key) do update set value = excluded.value;
select test.login('00000000-0000-0000-0000-0000000000a0');
select test.fails($$select admin_reset_data(2::smallint, array['students'], 'نعم')$$, 'كلمة التأكيد', 'كلمة التأكيد إلزامية');
select test.fails($$select admin_reset_data(2::smallint, array['employees'], 'تصفير')$$, 'لكل الفروع', 'الموظفون لا يُصفَّرون بفرع واحد');
select test.ok((select (admin_reset_preview(2::smallint) ->> 'students')::int) >= 1, 'المعاينة تعدّ طلاب الفرع');
select test.ok((select (x -> 'counts' ->> 'students')::int >= 1 from admin_reset_data(2::smallint, array['students', 'assessments', 'conduct', 'content'], 'تصفير') x), 'تصفير فرع الشمال');
select test.ok(not exists (select 1 from students where code = 'N900'), 'طلاب الفرع حُذفوا');
select test.ok(exists (select 1 from students where code = 'A900'), 'والفرع الآخر لم يُمس');
select test.ok((select count(*) from audit_log where action = 'RESET') = 1, 'سطر واحد في سجل العمليات للتصفير');
select test.logout();
