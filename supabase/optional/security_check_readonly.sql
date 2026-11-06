-- =====================================================================
-- مِرقاة — فحص أمني للقراءة فقط (لا يغيّر أي شيء في القاعدة)
-- شغّله في Supabase SQL Editor على المشروع الحقيقي وأرسل النتيجة.
-- كل سطر في النتيجة = ملاحظة. النتيجة المثالية: سطر واحد فقط «✅ لا ملاحظات».
-- =====================================================================
with findings as (
  -- 1) جداول بلا RLS
  select '1 جدول بلا RLS' as check_name, c.relname::text as item
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  union all
  -- 2) أي صلاحية للزائر (anon) على جدول أو عرض
  select '2 صلاحية للزائر على جدول', table_name || ' (' || string_agg(privilege_type, ',') || ')'
    from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'
   group by table_name
  union all
  -- 3) دوال SECURITY DEFINER يستطيع الزائر تنفيذها (المسموح: get_public_settings فقط)
  select '3 دالة يستطيع الزائر تنفيذها', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and has_function_privilege('anon', p.oid, 'execute')
     and p.proname not in ('get_public_settings', 'rls_auto_enable')  -- الثانية من Supabase (event trigger لا يُستدعى)
  union all
  -- 4) دوال الخادم وحده: يجب ألا يستطيع المستخدم المسجّل تنفيذها
  select '4 دالة داخلية مفتوحة للمستخدمين', p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('save_form_answers_internal', 'track_log', 'track_purge', 'auth_login_gate', 'auth_record_login',
                       'admin_attach_profile', 'admin_legacy_accounts', 'register_upload', 'forget_uploads',
                       'mark_files_purged', 'purge_candidates', 'stale_uploads', 'settle_due_forms')
     and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
  union all
  -- 5) صلاحيات تلقائية للجداول/الدوال الجديدة (الإعداد القديم في Supabase)
  select '5 صلاحية تلقائية للعناصر الجديدة', d.defaclrole::regrole::text || ' → ' || d.defaclobjtype::text || ' ' || d.defaclacl::text
    from pg_default_acl d
   where d.defaclnamespace = 'public'::regnamespace
     -- هجراتنا تُنشأ بالدور postgres. أما supabase_admin فعناصره داخلية تخص Supabase نفسها
     and d.defaclrole = 'postgres'::regrole
     and (d.defaclacl::text like '%anon=%' or d.defaclacl::text like '%authenticated=%')
  union all
  -- 6) مخازن الملفات العامة (المتوقع: task-files و school-assets فقط)
  select '6 مخزن ملفات عام', b.id::text
    from storage.buckets b
   where b.public and b.id not in ('task-files', 'school-assets')
  union all
  -- 7) سياسات على ملفات المخزن تسمح بالقراءة أو الكتابة من المتصفح (المتوقع: لا شيء — كل شيء عبر الخادم)
  select '7 سياسة على ملفات المخزن', pol.policyname || ' (' || pol.cmd || ')'
    from pg_policies pol
   where pol.schemaname = 'storage' and pol.tablename = 'objects'
  union all
  -- 9) مفاتيح الصلاحيات (هجرة 35): المستخدم يقرأ فقط، والكتابة عبر admin_set_permission وحدها
  select '9 كتابة مباشرة على المفاتيح', table_name || ' (' || string_agg(privilege_type, ',') || ')'
    from information_schema.role_table_grants
   where grantee = 'authenticated' and table_schema = 'public'
     and table_name in ('user_permissions', 'permission_keys')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
   group by table_name
  union all
  -- 8) حسابات دخول بلا سجل في profiles (قد تعني أن التسجيل الذاتي مفتوح)
  select '8 حساب دخول بلا سجل', count(*)::text
    from auth.users u
   where not exists (select 1 from public.profiles p where p.id = u.id)
  having count(*) > 0
)
select check_name, item from findings
union all
select '✅ لا ملاحظات', '' where not exists (select 1 from findings)
order by 1, 2;
