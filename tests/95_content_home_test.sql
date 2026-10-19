-- =====================================================================
-- هجرة 24: الفيديوهات والإثراءات + الرئيسية (المعلم E60 للفصل 1 مادة 1، والطالبان S60A وS60B)
-- =====================================================================
\set ON_ERROR_STOP 1
create temp table ct (k text primary key, v bigint);
grant all on ct to authenticated, service_role;

select test.login('00000000-0000-0000-0000-0000000000e6');
insert into ct select 'vid', (save_content(null, '{"kind":"video","title":"شرح الكسور","subject_id":1,"term_id":1,"url":"https://youtu.be/dQw4w9WgXcQ","minutes":12}', array[1]))[1];
insert into ct select 'enr', (save_content(null, '{"kind":"enrichment","title":"ملخص الوحدة","subject_id":1,"body":"نقاط مهمة للمراجعة"}', array[1]))[1];
insert into ct select 'draft', (save_content(null, '{"kind":"video","title":"مسودة","subject_id":1,"url":"https://youtu.be/x","is_draft":true}', array[1]))[1];
insert into ct select 'later', (save_content(null, '{"kind":"video","title":"لاحقًا","subject_id":1,"url":"https://youtu.be/y","published_at":"2099-01-01T00:00:00Z"}', array[1]))[1];
select test.ok((select count(*) from ct) = 4, 'المعلم ينشر فيديو وإثراء ومسودة ومجدولًا');
select test.fails($$select save_content(null, '{"kind":"video","title":"خارج","subject_id":1,"url":"https://a.b"}', array[2])$$, 'نطاقك', 'لا نشر لفصل خارج النطاق');
select test.fails($$select save_content(null, '{"kind":"video","title":"بلا رابط","subject_id":1}', array[1])$$, 'رابط الفيديو', 'الفيديو يحتاج رابطًا');
select test.fails($$select save_content(null, '{"kind":"video","title":"رابط","subject_id":1,"url":"http://a.b"}', array[1])$$, 'https', 'الرابط https فقط');
select test.fails($$select save_content(null, '{"kind":"enrichment","title":"فارغ","subject_id":1}', array[1])$$, 'رابطًا أو نصًا', 'الإثراء يحتاج محتوى');
select test.fails($$select save_content(null, '{"kind":"enrichment","title":"مرفق","subject_id":1,"attachments":[{"storage_path":"../etc/passwd"}]}', array[1])$$, 'مرفق غير صالح', 'مسار مرفق غير صالح مرفوض');
select test.fails($$insert into content_items (kind, class_id, subject_id, title) values ('video', 1, 1, 'x')$$, 'permission denied', 'لا كتابة مباشرة في المحتوى');
select set_content_flags((select v from ct where k = 'vid'), '{"is_pinned":true}');
select test.ok((select is_pinned from content_items where id = (select v from ct where k = 'vid')), 'تثبيت المحتوى');
select test.ok((staff_content('{"mine":true}') ->> 'total')::int = 4, 'قائمة محتواي (مرقّمة من الخادم)');
select test.ok((staff_content('{"status":"scheduled"}') ->> 'total')::int = 1, 'تصفية المجدول');
select test.logout();

-- الطالب
select test.login('00000000-0000-0000-0000-000000000061');
select test.ok(jsonb_array_length(my_content()) = 2, 'الطالب يرى المنشور فقط (لا المسودة ولا المجدول)');
select test.ok((select count(*) from content_items) = 2, 'وكذلك بالقراءة المباشرة');
select test.ok((my_content() -> 0 ->> 'id')::bigint = (select v from ct where k = 'vid'), 'المثبّت أولًا');
select open_content((select v from ct where k = 'vid'));
select open_content((select v from ct where k = 'vid'));
select test.ok((select opens from content_progress where content_item_id = (select v from ct where k = 'vid')) = 1, 'الفتح المتكرر خلال دقيقة يُحسب مرة');
select test.ok((select count(*) from student_views where content_item_id = (select v from ct where k = 'vid')) = 1, 'وتُسجَّل مشاهدة');
select test.fails(format('select open_content(%s)', (select v from ct where k = 'draft')), 'غير متاح', 'لا فتح لمسودة');
select set_content_progress((select v from ct where k = 'vid'), true, null);
select set_content_progress((select v from ct where k = 'enr'), null, true);
select test.ok((select completed_at is not null from content_progress where content_item_id = (select v from ct where k = 'vid')), 'تعليم الفيديو كمكتمل');
select test.ok((select saved_at is not null and first_opened_at is null from content_progress where content_item_id = (select v from ct where k = 'enr')), 'الحفظ لاحقًا لا يُعد مشاهدة');
select test.ok((student_home() -> 'content' ->> 'unseen')::int = 1 and (student_home() -> 'content' ->> 'completed')::int = 1, 'رئيسية الطالب: الجديد والمكتمل');
select test.ok(student_home() ? 'lessons' and student_home() ? 'attendance' and student_home() ? 'grades', 'رئيسية الطالب كاملة');
select test.fails($$select staff_home()$$, 'FORBIDDEN', 'الطالب لا يرى رئيسية الموظف');
select test.fails($$select staff_content('{}')$$, 'FORBIDDEN', 'ولا قائمة المحتوى');
select test.logout();

select test.login('00000000-0000-0000-0000-000000000062');
select test.ok((select count(*) from content_progress) = 0, 'الطالب لا يرى تقدم غيره');
select test.logout();

-- تحليل المشاهدة للمعلم
select test.login('00000000-0000-0000-0000-0000000000e6');
select test.ok((select count(*) from jsonb_array_elements(content_viewers((select v from ct where k = 'vid'))) x where x ->> 'completed_at' is not null) = 1,
  'من أكمل المشاهدة');
select test.ok((select (x ->> 'viewers')::int from jsonb_array_elements(staff_content('{"kind":"video"}') -> 'rows') x
                 where (x ->> 'id')::bigint = (select v from ct where k = 'vid')) = 1, 'عدد المشاهدين في القائمة');
select test.ok((content_stats() ->> 'videos')::int >= 3, 'إحصاءات المحتوى');
select test.ok((staff_home() ->> 'students')::int >= 2 and staff_home() -> 'admin' = 'null'::jsonb, 'رئيسية المعلم بلا بيانات الإدارة');
select test.ok(jsonb_array_length(staff_home() -> 'activity') = 14, 'نشاط 14 يومًا');
select test.logout();

-- الإداري: نشر لعدة فصول بمرفق مشترك، والحذف لا يمس ملف نسخة أخرى
select test.login('00000000-0000-0000-0000-0000000000a0');
insert into ct select 'm' || i, x from unnest(save_content(null,
  '{"kind":"enrichment","title":"ورقة عمل","subject_id":1,"attachments":[{"name":"ورقة.pdf","storage_path":"content/11111111-1111-1111-1111-111111111111/a.pdf","mime":"application/pdf","size_bytes":1000}]}',
  array[1, 2])) with ordinality as t(x, i);
select test.ok((select count(*) from ct where k like 'm%') = 2, 'نشر لفصلين دفعة واحدة');
select test.ok(cardinality(delete_content((select v from ct where k = 'm1'))) = 0, 'المرفق المشترك لا يُحذف مع النسخة الأولى');
select test.ok(cardinality(delete_content((select v from ct where k = 'm2'))) = 1, 'ويُحذف مع آخر نسخة');
select test.ok(staff_home() -> 'admin' ->> 'employees' is not null, 'رئيسية الإداري');
select test.logout();
