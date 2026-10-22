-- =====================================================================
-- هجرة 25: الأداء حتى الآن (يعتمد على بيانات 90: S90A مرصود له كل الأنواع، S90B الواجب فقط)
-- =====================================================================
\set ON_ERROR_STOP 1
select test.login('00000000-0000-0000-0000-0000000000a0');
select test.ok((select (x ->> 'progress')::numeric from jsonb_array_elements(class_results((select class_id from students where code = 'S90B'), 1::smallint) -> 'students') x
                 where x ->> 'code' = 'S90B') = 100, 'الأداء حتى الآن: الواجب وحده كامل = 100%');
select test.ok((select (x ->> 'average')::numeric from jsonb_array_elements(class_results((select class_id from students where code = 'S90B'), 1::smallint) -> 'students') x
                 where x ->> 'code' = 'S90B') = 20, 'والمعدل الرسمي من 100 يبقى كما هو (20)');
select test.ok((select (x ->> 'progress')::numeric from jsonb_array_elements(class_results((select class_id from students where code = 'S90A'), 1::smallint) -> 'students') x
                 where x ->> 'code' = 'S90A') = 78.5, 'اكتمل الرصد: الأداء = المعدل');
select test.ok((select (x -> 'progress')::text::numeric from jsonb_array_elements(results_overview(1::smallint)) x
                 where (x ->> 'class_id')::int = (select class_id from students where code = 'S90A')) = 89.25, 'نظرة عامة: متوسط الأداء حتى الآن');
select test.logout();
