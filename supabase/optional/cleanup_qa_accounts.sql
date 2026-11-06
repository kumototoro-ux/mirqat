-- =====================================================================
-- تنظيف حسابات الاختبار (qa_*) قبل الإطلاق
-- يحذف حسابات الدخول فقط (auth.users، وتُحذف معها صفوف profiles تلقائيًا).
-- سجلات الطلاب والموظفين نفسها لا تُمس.
-- الخطوة 1: شغّل هذا الاستعلام وحده وراجع القائمة، ولا تتجاوز الخطوة 2 قبل مراجعتها.
-- =====================================================================
select p.id, p.username, p.role, p.status, coalesce(s.code, e.code) as record_code, coalesce(s.name_ar, e.name_ar) as record_name
  from public.profiles p
  left join public.students s on s.id = p.student_id
  left join public.employees e on e.id = p.employee_id
 where p.username ilike 'qa\_%' escape '\'
 order by p.role, p.username;

-- الخطوة 2: بعد التأكد أن القائمة كلها حسابات اختبار، شغّل الكتلة التالية.
-- (احذف علامتي التعليق /* و */ من حولها)
/*
begin;
  delete from auth.users
   where id in (select id from public.profiles where username ilike 'qa\_%' escape '\' and role <> 'admin');
  select count(*) as "المتبقي من qa_*" from public.profiles where username ilike 'qa\_%' escape '\';
commit;
*/
