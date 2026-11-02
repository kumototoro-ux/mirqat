-- =====================================================================
-- هجرة 32: مركز التتبع
-- =====================================================================
\set ON_ERROR_STOP 1

-- الكتابة بالمفتاح السري فقط
select test.login('00000000-0000-0000-0000-0000000000e6');
select test.fails($$select track_log('{"action":"db.error"}')$$, 'permission denied', 'المستخدم لا يكتب في التتبع مباشرة');
select test.fails($$select count(*) from app_events$$, 'permission denied', 'ولا يقرأ جدول الأحداث');
select test.fails($$select track_summary(24)$$, 'للإدارة فقط', 'المعلم لا يرى مركز التتبع');
select test.logout();

set role service_role;
select test.ok(track_log(jsonb_build_object('action', 'db.error', 'kind', 'system', 'needs_action', true, 'fingerprint', 'db:sys:rpc:x:500',
  'actor_id', '00000000-0000-0000-0000-0000000000e6', 'path', '/staff/tasks', 'message', 'boom', 'code', '500', 'details', '{"op":"rpc:save_form"}')), 'سُجّل حدث');
select test.ok(not track_log(jsonb_build_object('action', 'db.error', 'fingerprint', 'db:sys:rpc:x:500',
  'actor_id', '00000000-0000-0000-0000-0000000000e6', 'path', '/staff/tasks')), 'نفس الحدث خلال 10 ثوانٍ لا يتكرر');
select test.ok(track_log(jsonb_build_object('action', 'auth.login_failed', 'kind', 'user', 'fingerprint', 'auth:wrong', 'ip', '1.2.3.4',
  'details', '{"username":"ghost"}')), 'حدث بلا مستخدم');
select test.ok(not track_log('{"action":""}'), 'حدث بلا اسم يُتجاهل');
reset role;
select test.ok((select actor_name is not null and actor_role = 'teacher' from app_events where fingerprint = 'db:sys:rpc:x:500'), 'الاسم والدور من الحساب');

-- حد الإغراق: 40 في الدقيقة
set role service_role;
select track_log(jsonb_build_object('action', 'client.error', 'fingerprint', 'flood:' || n, 'ip', '9.9.9.9')) from generate_series(1, 45) n;
reset role;
select test.ok((select count(*) from app_events where ip = '9.9.9.9') = 40, 'الإغراق محدود بـ 40 حدثًا في الدقيقة');

-- القراءة للإداري
select test.login('00000000-0000-0000-0000-0000000000a0');
select test.ok((track_summary(24) -> 'counts' ->> 'needs_action')::int = 1, 'مشكلة واحدة تحتاج تدخلًا');
select test.ok((track_alert() ->> 'groups')::int = 1, 'تنبيه الرئيسية');
select test.ok((track_events('{"view":"problems"}') ->> 'total')::int = 2, 'المشاكل: الخطأ + الدخول الفاشل (العادية لا تظهر)');
select test.ok((track_events('{"view":"all","q":"ghost"}') ->> 'total')::int = 0, 'البحث بالاسم لا يطابق اسم المستخدم المكتوب');
select test.ok((track_events('{"fingerprint":"db:sys:rpc:x:500"}') ->> 'total')::int = 1, 'تصفية بالمشكلة');
select test.ok((track_events('{"actor_id":"00000000-0000-0000-0000-0000000000e6"}') ->> 'total')::int = 1, 'تصفية بالمستخدم');

-- «تم الحل» يخفيها، وتكرارها بعده يعيدها
select track_resolve('db:sys:rpc:x:500', true, 'أُصلح في التحديث');
select test.ok((track_summary(24) -> 'counts' ->> 'needs_action')::int = 0, 'بعد الحل: لا شيء يحتاج تدخلًا');
select test.ok(track_alert() ->> 'count' is null or (track_alert() ->> 'count')::int = 0, 'ولا تنبيه في الرئيسية');
select test.ok((select (g ->> 'resolved')::boolean from jsonb_array_elements(track_summary(24) -> 'groups') g where g ->> 'fingerprint' = 'db:sys:rpc:x:500'), 'المجموعة محلولة');
select test.logout();
update app_event_groups set resolved_at = now() - interval '1 minute' where fingerprint = 'db:sys:rpc:x:500';
set role service_role;
select track_log(jsonb_build_object('action', 'db.error', 'kind', 'system', 'needs_action', true, 'fingerprint', 'db:sys:rpc:x:500', 'path', '/staff/other'));
reset role;
select test.login('00000000-0000-0000-0000-0000000000a0');
select test.ok((track_summary(24) -> 'counts' ->> 'needs_action')::int = 2, 'تكررت بعد الحل فعادت');

-- الخط الزمني وبحث الأشخاص
select test.ok((track_timeline('00000000-0000-0000-0000-0000000000e6', 7) -> 'stats' ->> 'problems')::int = 1, 'الخط الزمني يعد مشاكل المستخدم');
select test.ok(jsonb_array_length(track_timeline('00000000-0000-0000-0000-0000000000e6', 7) -> 'items') >= 1, 'وفيه الأحداث');
select test.ok(jsonb_array_length(track_people(null)) >= 1, 'قائمة الأشخاص');
select test.fails($$select track_timeline('00000000-0000-0000-0000-00000000dead', 7)$$, 'غير موجود', 'مستخدم غير موجود');
select test.logout();

-- التنظيف
update app_events set at = now() - interval '200 days' where fingerprint = 'db:sys:rpc:x:500';
update app_events set at = now() - interval '40 days', kind = 'ok' where ip = '9.9.9.9';
set role service_role;
select test.ok(track_purge() = 42, 'التنظيف: المشاكل الأقدم من 180 يومًا والعادية الأقدم من 30');
reset role;
select test.ok(not exists (select 1 from app_event_groups where fingerprint = 'db:sys:rpc:x:500'), 'وحالة المجموعة المنتهية تُحذف');
