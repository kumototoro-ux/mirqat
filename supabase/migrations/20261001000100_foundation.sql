-- =====================================================================
-- مِرقاة — 01: الأساس
-- الإضافات، المخططات الخاصة، الأنواع (enums)، ودوال التريجر المشتركة.
--
-- المخططات:
--   public    : جداول النظام (تعرضها Supabase عبر API، وتحميها RLS)
--   app       : دوال مساعدة داخلية للصلاحيات والتريجرات (غير معروضة عبر API)
--   staging   : نسخة طبق الأصل من الشيتات وقت النقل (غير معروضة عبر API)
--   migration : الحجر وسجل عمليات النقل (غير معروض عبر API)
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists app;
create schema if not exists staging;
create schema if not exists migration;

revoke all on schema staging, migration from public;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------
-- الأنواع
-- ---------------------------------------------------------------------
create type public.app_role as enum ('admin', 'teacher', 'student');
comment on type public.app_role is 'دور الحساب في النظام. الإداري يتخطى كل القيود، المعلم مقيّد بنطاقه، الطالب يرى صفه فقط';

create type public.account_status as enum ('active', 'disabled');

create type public.assessment_kind as enum ('task', 'form', 'manual');
comment on type public.assessment_kind is
  'task = تكليف عادي يُرصد يدويًا، form = نموذج إلكتروني يُصحَّح آليًا، manual = رصد يدوي كامل بلا تكليف مسبق';

create type public.form_status as enum ('draft', 'published', 'closed');
comment on type public.form_status is 'draft = مسودة، published = منشور، closed = مغلق';

create type public.content_kind as enum ('video', 'enrichment');

create type public.grade_source as enum ('manual', 'form', 'auto_absent');
comment on type public.grade_source is 'manual = رصد معلم، form = تسليم نموذج، auto_absent = صفر تلقائي لعدم الإجابة';

create type public.student_status as enum ('active', 'withdrawn', 'graduated');

-- ---------------------------------------------------------------------
-- دوال تريجر مشتركة
-- ---------------------------------------------------------------------

-- تحديث updated_at تلقائيًا عند أي تعديل
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- هل نحن داخل عملية نقل البيانات؟ (تُضبط بـ set local app.migrating = 'on')
-- تُستخدم لتعطيل التريجرات التي لا معنى لها أثناء النقل (التدقيق، قيود التعديل الزمنية)
create or replace function app.is_migrating() returns boolean
language sql stable as $$
  select coalesce(current_setting('app.migrating', true), '') = 'on'
$$;
