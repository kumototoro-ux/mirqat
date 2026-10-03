# مِرقاة

موقع واحد (Next.js على Vercel) للموظفين والطلاب، وقاعدة واحدة (Supabase / PostgreSQL) بديلة Google Sheets.

## الموقع

| المسار | الصفحة |
|---|---|
| `/` | اختيار البوابة |
| `/login` | بوابة الموظفين (لا تقبل حساب طالب) |
| `/student/login` | بوابة الطالب (لا تقبل حساب موظف) |
| `/change-password` | تغيير كلمة المرور — إلزامي عند أول دخول |
| `/staff` | رئيسية المعلم (نطاقه) والإداري (ملخص) |
| `/staff/accounts` | الحسابات — للإداري فقط |
| `/student` | رئيسية الطالب |

**التشغيل المحلي:** `npm install` ← انسخ `.env.example` إلى `.env.local` واملأه ← `npm run dev`.

**إنشاء الحسابات الـ46 القديمة (مرة واحدة من جهازك):**

```bash
npm run provision:legacy              # معاينة: من سيُنشأ، وأي مشكلة
npm run provision:legacy -- --apply   # الإنشاء، وكلمات المرور في secrets/ (لا تُرفع)
```

**قبل أول نشر:** Supabase ← Authentication ← Sign In / Providers ← أطفئ **Allow new users to sign up**
(الحسابات يُنشئها الخادم وحده).

**الأمان:** المفتاح السري يُقرأ في `src/lib/supabase/admin.ts` وحده (`server-only` يمنع وصوله للمتصفح).
الصلاحيات تُفرض في RLS، و`proxy.ts` للتوجيه فقط، وكل صفحة تتحقق من الحساب في القاعدة (`requireUser`).

# قاعدة البيانات

مخطط قاعدة البيانات الموحّدة لموقعي مِرقاة (الموظفين + بوابة الطالب)، بديل Google Sheets.

## البنية

```
supabase/
  migrations/                      ← تُطبَّق بالترتيب، ولا يُعدَّل ملف بعد تطبيقه (أي تغيير = ملف جديد)
    ..._foundation.sql              الإضافات، المخططات، الأنواع
    ..._reference.sql               الأعوام، الفصول الدراسية، الفروع، الصفوف، الفصول، المواد، النسب، الإعدادات
    ..._people.sql                  الطلاب، الموظفون، النطاق، الحسابات، محاولات الدخول
    ..._calendar_timetable.sql      التقويم، الأسابيع، جدول الحصص، جدول الاختبارات
    ..._assessments.sql             التقييمات، النماذج، الأسئلة، المحاولات، الرصد، التجميع
    ..._content_attendance.sql      الفيديو والإثراء، المشاهدات، ربط الحصص، التحضير، السلوك
    ..._audit.sql                   سجل التدقيق التلقائي
    ..._security.sql                RLS على كل جدول
    ..._core_functions.sql          تسليم النموذج، المراجعة، تسوية الغياب، إعادة الفتح
    ..._migration_support.sql       الحجر وسجل النقل
    ..._grants.sql                  الصلاحيات الصريحة
    ..._migration_adjustments.sql   تعديلات النقل
    ..._auth_accounts.sql           الدخول بالبوابتين وإنشاء الحسابات (للخادم وحده)
  optional/pg_cron_schedule.sql    جدولة تسوية الغياب كل 5 دقائق (بعد تفعيل pg_cron)
tests/                             اختبارات محلية
run_tests.sh
```

## التطبيق على Supabase

**الطريقة المفضّلة (Supabase CLI):**

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push
```

**أو يدويًا:** SQL Editor ← لصق كل ملف من `migrations/` بالترتيب وتشغيله.

ثم مرة واحدة: Database ← Extensions ← تفعيل `pg_cron`، وتشغيل `optional/pg_cron_schedule.sql`.

> ⚠️ لا تشغّل `tests/00_supabase_stub.sql` على Supabase أبدًا — هو محاكاة محلية فقط.

## من الشيت إلى الجدول

| الشيت الحالي | الجدول الجديد | ملاحظة |
|---|---|---|
| Settings | `branches` `stages` `grades` `sections` `subjects` `terms` `eval_types` `attendance_statuses` `behavior_statuses` `app_settings` | كل عمود قائمة صار جدولًا |
| Subject Distribution Matrix | `subject_matrix` | شعبة فارغة = كل الشعب |
| Grade Distribution | `grade_weights` | |
| Students | `students` + `classes` | العمود L (معادلة) لا يُنقل |
| Employees | `employees` + `staff_scope` | قوائم النطاق المفصولة بفواصل صارت صفوفًا |
| Users / Students_Users | `profiles` + Supabase Auth | |
| School Calendar | `calendar_entries` + View `school_weeks` | |
| Class Timetable | `timetable_slots` (حصص) / `exam_schedule` (اختبارات) | اليوم والحصة أرقام |
| Task_Log | `assessments` (kind = task) | |
| Forms | `assessments` (kind = form) + `form_details` | |
| Form_Questions | `form_questions` + `question_options` | الخيارات صفوف، الصحيح علم |
| Form_Responses | `form_attempts` + `attempt_answers` | الإجابة بمعرّف الخيار |
| Daily Follow up | `grade_entries` | مرتبط بالتقييم بالمعرّف لا بالعنوان |
| Grade Aggregation | View `grade_breakdown` + `grade_totals` + `grade_visibility` | يُحسب لحظيًا |
| Enrichment Log | `content_items` | |
| Student_Views | `student_views` | |
| Period Links | `period_links` | مفاتيح حقيقية بدل أرقام الصفوف |
| Attendance and Absence | `attendance_records` | |
| Behavior | `behavior_records` | |
| Audit Log | `audit_log` | يُكتب تلقائيًا بتريجر |

## الاختبارات

```bash
./run_tests.sh   # يحتاج PostgreSQL 15+ محليًا
```
