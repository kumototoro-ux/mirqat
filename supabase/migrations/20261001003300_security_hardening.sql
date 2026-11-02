-- =====================================================================
-- مِرقاة — 33: التشديد الأمني (نتائج التدقيق الأمني، نوفمبر 2026)
--
-- 1) ع-1: المعلم كان يستطيع إدخال درجة مباشرة (عبر واجهة Supabase) في تقييم غيره
--    ولطالب خارج نطاقه. الكتابة على جداول التقييم والرصد والنماذج صارت عبر الدوال المحمية وحدها،
--    وسياسة إدخال الرصد صارت تشترط ملكية التقييم وأن يكون الطالب من فصله (دفاع ثانٍ).
-- 2) م-1: الطالب كان يقرأ درجاته ومحاولاته ونقاط إجاباته مباشرة حتى لو أخفاها المعلم
--    أو حجبت الإدارة النتائج. صار يراها عبر دوال صفحاته فقط (وهي تحترم الإخفاء).
-- 3) م-4: قاعدة الإنتاج على الإعداد القديم في Supabase (كل جدول/دالة جديدة مفتوحة للزائر تلقائيًا).
--    تُسحب كل صلاحيات الزائر، ويُصحَّح الإعداد التلقائي: لا يُمنح شيء إلا صراحةً.
-- 4) ع-2: الدالة الداخلية لحفظ الإجابات تُغلق صراحةً (كانت مغلقة فعليًا في الإنتاج).
-- 5) م-3: إعادة تعيين كلمة المرور تُخرج كل جلسات الحساب (دالة للخادم وحده).
-- 6) ن-2: دليل أسماء الموظفين لمن له حساب مكتمل فقط.
--
-- لا يغيّر أي بيانات. آمن لإعادة التشغيل.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) الزائر (anon): لا شيء إلا الإعدادات العامة
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
grant execute on function public.get_public_settings() to anon;

-- المستخدم المسجّل: لا تفريغ جداول ولا مشغّلات ولا مراجع (لا يحتاجها الموقع)
revoke truncate, trigger, references on all tables in schema public from authenticated;

-- العناصر الجديدة مستقبلًا: لا صلاحية تلقائية لأحد (كل هجرة تمنح صراحةً ما تحتاجه)
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) الجداول التي يُكتب فيها عبر الدوال المحمية وحدها: لا كتابة مباشرة
--    (الدوال SECURITY DEFINER لا تحتاج هذه الصلاحيات، والموقع لا يكتب فيها مباشرة)
-- ---------------------------------------------------------------------
revoke insert, update, delete on
  public.grade_entries, public.assessments, public.form_details, public.form_questions, public.question_options,
  public.form_attempts, public.attempt_answers, public.period_links, public.student_views, public.student_enrollments,
  public.assessment_attachments, public.attendance_grants, public.content_progress, public.form_events,
  public.form_sessions, public.pending_uploads, public.result_release_rules, public.submission_files,
  public.task_submissions, public.attendance_records, public.behavior_records, public.content_items
from authenticated;

-- جداول لا يصلها المستخدم إلا عبر الدوال (قراءةً وكتابةً)، وعروض للقراءة فقط
-- (في الإعداد القديم أخذت صلاحيات كاملة تلقائيًا عند إنشائها؛ تُوحَّد هنا مع ما تفترضه الهجرات)
revoke all on public.app_events, public.app_event_groups, public.appreciation_certs, public.grade_improvements,
              public.login_attempts, public.pending_uploads
from authenticated;
revoke insert, update, delete on public.audit_log, public.school_weeks, public.grade_breakdown, public.grade_totals,
       public.form_max_scores, public.staff_directory
from authenticated;

-- دفاع ثانٍ لو عادت الصلاحية يومًا: الرصد لمن يملك تعديل التقييم، ولطالب من فصله (أو الطالب المستهدف به)
drop policy if exists grade_entries_insert on public.grade_entries;
create policy grade_entries_insert on public.grade_entries for insert to authenticated
  with check (
    app.can_edit_assessment(assessment_id)
    and exists (
      select 1 from public.assessments a join public.students s on s.id = grade_entries.student_id
       where a.id = grade_entries.assessment_id
         and (a.target_student_id = s.id or (a.target_student_id is null and s.class_id = a.class_id))
    )
  );

-- ---------------------------------------------------------------------
-- 3) الطالب لا يقرأ درجاته الخام مباشرة (صفحاته تأخذها من دوال تحترم الإخفاء وإعلان النتائج)
-- ---------------------------------------------------------------------
drop policy if exists grade_entries_read on public.grade_entries;
create policy grade_entries_read on public.grade_entries for select to authenticated
  using (
    (select app.is_admin())
    or ((select app.is_staff()) and exists (select 1 from public.assessments a where a.id = grade_entries.assessment_id))
  );

drop policy if exists form_attempts_read on public.form_attempts;
create policy form_attempts_read on public.form_attempts for select to authenticated
  using ((select app.is_staff()) and exists (select 1 from public.assessments a where a.id = form_attempts.assessment_id));
-- attempt_answers تتبع form_attempts (سياستها: المحاولة مرئية)، فتُغلق على الطالب تلقائيًا

-- ---------------------------------------------------------------------
-- 4) الدوال الداخلية للخادم وحده
-- ---------------------------------------------------------------------
revoke all on function public.save_form_answers_internal(bigint, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) إخراج كل جلسات حساب (عند إعادة تعيين كلمة مروره من الإدارة)
--    حذف الجلسة يُبطل رمز التجديد فورًا؛ رمز الدخول الحالي ينتهي خلال ساعة على الأكثر.
-- ---------------------------------------------------------------------
create or replace function public.admin_revoke_sessions(p_user_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.admin_revoke_sessions(uuid) from public, anon, authenticated;
grant execute on function public.admin_revoke_sessions(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 6) دليل أسماء الموظفين: لمن له حساب مكتمل (الدوال المحمية التي تستخدمه تعمل كما هي)
-- ---------------------------------------------------------------------
create or replace view public.staff_directory as
select e.id, e.code, e.name_ar from public.employees e
 where e.is_active and (current_user <> 'authenticated' or app.my_role() is not null);
revoke all on public.staff_directory from anon;
grant select on public.staff_directory to authenticated;
