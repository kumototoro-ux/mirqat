-- =====================================================================
-- مِرقاة — 44: قائمة المسميات الوظيفية (تُدار من الإعدادات)
-- كانت خانة المسمى في تسجيل الموظف نصًا حرًا؛ تصبح اختيارًا من قائمة يديرها الإداري.
-- العمود employees.job_role يبقى نصًا (لا يتأثر السجل القديم ولا الاستيراد).
-- =====================================================================
create table if not exists public.job_titles (
  id          smallint generated always as identity primary key,
  name        text not null unique,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.job_titles enable row level security;
revoke all on public.job_titles from anon;
grant select, insert, update, delete on public.job_titles to authenticated;
grant all on public.job_titles to service_role;

drop policy if exists job_titles_read on public.job_titles;
create policy job_titles_read on public.job_titles for select to authenticated
  using ((select app.my_role()) is not null);
drop policy if exists job_titles_admin_write on public.job_titles;
create policy job_titles_admin_write on public.job_titles for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

drop trigger if exists job_titles_audit on public.job_titles;
create trigger job_titles_audit after insert or update or delete on public.job_titles
  for each row execute function app.audit_row();

-- تعبئة أولية: الأكثر شيوعًا، ثم القيم الموجودة فعلًا في سجلات الموظفين
insert into public.job_titles (name, sort_order)
select v.n, v.o from (values
  ('معلم', 1), ('وكيل', 2), ('مدير', 3), ('مشرف', 4), ('موجّه طلابي', 5),
  ('محاسب', 6), ('سكرتير', 7), ('إداري', 8)
) v(n, o)
on conflict (name) do nothing;

insert into public.job_titles (name, sort_order)
select d.jr, 100 + row_number() over (order by d.jr)
  from (select distinct btrim(job_role) jr from public.employees where nullif(btrim(job_role), '') is not null) d
on conflict (name) do nothing;

do $$ begin raise notice '✅ هجرة 44: قائمة المسميات الوظيفية'; end $$;
