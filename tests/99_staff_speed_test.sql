-- =====================================================================
-- هجرة 31: الدوال صارت security definer — يجب أن تبقى النتائج بنفس نطاق سياسات القراءة
-- نقارن ما تعيده الدالة بما يراه المستخدم نفسه مباشرة من الجداول (عبر سياسات الصفوف)
-- =====================================================================
\set ON_ERROR_STOP 1
do $$
declare
  u uuid;
begin
  foreach u in array array['00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000e1',
                           '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a0']::uuid[] loop
    perform test.login(u);
    perform test.ok((public.staff_assessments('{"size":50,"include_manual":true}') ->> 'total')::int
                    = (select count(*) from public.assessments), 'قائمة التقييمات = ما تسمح به سياسة القراءة — ' || u);
    perform test.ok((public.attendance_sessions('{}') ->> 'total')::int
                    = (select count(*) from (select distinct class_id, occurred_on, period_no, subject_id from public.attendance_records
                                              where class_id is not null and occurred_on is not null) x),
                    'جلسات التحضير = ما تسمح به سياسة القراءة — ' || u);
    perform test.ok((public.staff_home() ->> 'students')::int = (select count(*) from public.students where status = 'active'),
                    'عدد الطلاب في الرئيسية = طلاب النطاق — ' || u);
    perform test.logout();
  end loop;
end $$;
