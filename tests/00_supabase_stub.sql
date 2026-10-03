-- =====================================================================
-- محاكاة بيئة Supabase للاختبار المحلي فقط — لا تُرفع إلى Supabase أبدًا.
-- Supabase توفّر هذه الأشياء تلقائيًا: الأدوار anon/authenticated/service_role،
-- ومخطط auth بجدول users، والدالة auth.uid() التي تقرأ هوية المستخدم من JWT.
-- =====================================================================
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(coalesce(
    current_setting('request.jwt.claim.sub', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  ), '')::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;


-- ⚠️ تحاكي سلوك مشاريع Supabase بعد 30 مايو 2026: لا صلاحيات افتراضية على الجداول الجديدة،
-- ولا صلاحية تنفيذ للعامة على الدوال الجديدة. ملف الهجرة 11 هو الذي يمنحها صراحةً.
alter default privileges in schema public revoke execute on functions from public;
create schema if not exists app;
alter default privileges in schema app revoke execute on functions from public;
