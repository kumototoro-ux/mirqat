-- =====================================================================
-- مِرقاة — 11: الصلاحيات الصريحة (GRANT)
-- منذ 30 مايو 2026، مشاريع Supabase الجديدة لا تمنح anon/authenticated أي صلاحية تلقائيًا على
-- جداول public. هذا الملف يمنحها صراحةً، فيعمل النظام سواء أُنشئ المشروع بالإعداد القديم أو الجديد.
-- الصلاحية هنا تفتح الباب فقط؛ RLS هي التي تحدد أي صف يراه كل مستخدم.
-- =====================================================================

-- authenticated: عمليات الجداول (RLS تقيّدها صفًا صفًا)
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Views القراءة فقط
revoke insert, update, delete on public.school_weeks, public.grade_breakdown, public.grade_totals,
       public.form_max_scores, public.staff_directory from authenticated;

-- سجل التدقيق ومحاولات الدخول: لا كتابة من المتصفح إطلاقًا
revoke insert, update, delete on public.audit_log from authenticated;
revoke all on public.login_attempts from authenticated;

-- anon: لا شيء على الجداول (اسم المدرسة عبر get_public_settings فقط)
revoke all on all tables in schema public from anon;

-- service_role (الخادم فقط — إنشاء الحسابات، الدخول، المهام المجدولة)
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant usage on schema app to service_role;
grant execute on all functions in schema app to service_role;

-- دوال الصلاحيات التي تستدعيها سياسات RLS
grant usage on schema app to authenticated;
grant execute on function
  app.my_role(), app.is_admin(), app.is_staff(), app.my_employee_id(), app.my_student_id(),
  app.my_class_id(), app.staff_can_access(integer, smallint), app.staff_can_access_student(bigint),
  app.can_edit_assessment(bigint), app.student_sees_assessment(bigint)
to authenticated;
