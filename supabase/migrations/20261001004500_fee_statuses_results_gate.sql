-- =====================================================================
-- مِرقاة — 45: أنواع الرسوم وشرطها على عرض النتائج للطالب
--
-- شرطان معًا لتظهر النتيجة للطالب (كما في موقع الطلاب القديم):
--   1) اعتماد الإدارة: قواعد الإتاحة الحالية، والأصل «مغلق» (إعداد results_default).
--   2) حالة الرسوم: كل حالة تفتح الأترام حتى رقم معيّن (unlocks_term؛ 0 لا شيء، 9 الكل).
-- الحالة الفارغة أو غير المعروفة = ممنوع. وحالة الرسوم تخص العام الدراسي الحالي فقط:
-- إذا تغيّر العام الحالي بطلت الحالات القديمة تلقائيًا (بلا حذف) وتبقى محفوظة في السجل.
-- قاعدة «سماح» على طالب بعينه تتجاوز شرط الرسوم (تأجيل بموافقة الإدارة).
-- =====================================================================

-- 1) قائمة أنواع الرسوم (تُدار من الإعدادات)
create table if not exists public.fee_statuses (
  id            smallint generated always as identity primary key,
  name          text not null unique check (char_length(btrim(name)) between 2 and 80),
  unlocks_term  smallint not null default 0 check (unlocks_term between 0 and 9),
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now()
);
comment on table public.fee_statuses is 'أنواع رسوم الطالب. unlocks_term: يُفتح له الترم رقم ≤ هذا (0 لا شيء، 9 كل الأترام)';

alter table public.fee_statuses enable row level security;
revoke all on public.fee_statuses from anon;
grant select, insert, update, delete on public.fee_statuses to authenticated;
grant all on public.fee_statuses to service_role;
drop policy if exists fee_statuses_read on public.fee_statuses;
create policy fee_statuses_read on public.fee_statuses for select to authenticated using ((select app.is_staff()));
drop policy if exists fee_statuses_admin_write on public.fee_statuses;
create policy fee_statuses_admin_write on public.fee_statuses for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));
drop trigger if exists fee_statuses_audit on public.fee_statuses;
create trigger fee_statuses_audit after insert or update or delete on public.fee_statuses
  for each row execute function app.audit_row();

insert into public.fee_statuses (name, unlocks_term, sort_order) values
  ('لم يدفع شيئًا', 0, 1),
  ('دفع جزءًا من رسوم الترم الأول', 0, 2),
  ('دفع رسوم الترم الأول', 1, 3),
  ('دفع جزءًا من رسوم الترم الثاني', 1, 4),
  ('دفع رسوم الترم الثاني', 2, 5),
  ('معفي من الرسوم', 9, 6)
on conflict (name) do nothing;

-- 2) الطالب: عام الحالة + سجل التغييرات
alter table public.students add column if not exists fee_year_id smallint references public.academic_years(id);
comment on column public.students.fee_year_id is 'العام الدراسي الذي تخصه حالة الرسوم الحالية';

create table if not exists public.student_fee_log (
  id          bigint generated always as identity primary key,
  student_id  bigint not null references public.students(id) on delete cascade,
  year_id     smallint references public.academic_years(id),
  old_status  text,
  new_status  text,
  changed_by  uuid default auth.uid(),
  changed_at  timestamptz not null default now()
);
create index if not exists student_fee_log_student_idx on public.student_fee_log (student_id, changed_at desc);
alter table public.student_fee_log enable row level security;
revoke all on public.student_fee_log from anon;
grant select on public.student_fee_log to authenticated;
grant all on public.student_fee_log to service_role;
drop policy if exists student_fee_log_read on public.student_fee_log;
create policy student_fee_log_read on public.student_fee_log for select to authenticated
  using ((select app.is_admin()) or app.staff_can_access_student(student_id));

-- 3) الحالة المسموحة وحدها تُحفظ، وتُختم بالعام الحالي، ويُسجَّل كل تغيير
create or replace function app.students_fee_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('app.fee_rename', true) = '1' then return new; end if;
  if tg_op = 'UPDATE' and new.fee_status is not distinct from old.fee_status then
    return new;
  end if;
  new.fee_status := nullif(btrim(coalesce(new.fee_status, '')), '');
  if new.fee_status is not null and not exists (select 1 from public.fee_statuses where name = new.fee_status) then
    raise exception 'حالة الرسوم "%" غير معروفة. اختر من القائمة المعتمدة', new.fee_status using errcode = '23514';
  end if;
  new.fee_year_id := case when new.fee_status is null then null
                          else (select id from public.academic_years where is_current) end;
  return new;
end $$;

-- السجل بعد الحفظ (المفتاح الأجنبي يحتاج الصف موجودًا)
create or replace function app.students_fee_log() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('app.fee_rename', true) = '1' then return null; end if;
  if tg_op = 'UPDATE' and new.fee_status is not distinct from old.fee_status then return null; end if;
  if tg_op = 'INSERT' and new.fee_status is null then return null; end if;
  insert into public.student_fee_log (student_id, year_id, old_status, new_status)
  values (new.id, new.fee_year_id, case when tg_op = 'UPDATE' then old.fee_status end, new.fee_status);
  return null;
end $$;

-- الطلاب الحاليون: كلهم «دفع جزءًا من رسوم الترم الأول» (قرار الإدارة) ثم تُحدَّد الحالة لكل طالب
update public.students
   set fee_status = 'دفع جزءًا من رسوم الترم الأول',
       fee_year_id = (select id from public.academic_years where is_current);

-- قبل الحارس: لا يُسجَّل التحديث الجماعي أعلاه سجلًا لكل طالب (هو بداية الاعتماد)
drop trigger if exists students_fee_guard on public.students;
create trigger students_fee_guard before insert or update of fee_status on public.students
  for each row execute function app.students_fee_guard();
drop trigger if exists students_fee_log on public.students;
create trigger students_fee_log after insert or update of fee_status on public.students
  for each row execute function app.students_fee_log();

-- تسمية الحالة تتبعها سجلات الطلاب، والحذف ممنوع ما دامت مستخدمة
create or replace function app.fee_status_rename() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.students where fee_status = old.name) then
      raise exception 'لا يمكن حذف حالة رسوم مستخدمة عند طلاب. يمكنك إعادة تسميتها' using errcode = '23503';
    end if;
    return old;
  end if;
  if new.name is distinct from old.name then
    -- الحارس والسجل يتجاوزان هذا التحديث: الحالة نفسها لم تتغير، والتسمية فقط
    perform set_config('app.fee_rename', '1', true);
    update public.students set fee_status = new.name where fee_status = old.name;
    perform set_config('app.fee_rename', '', true);
  end if;
  return new;
end $$;
drop trigger if exists fee_statuses_rename on public.fee_statuses;
drop trigger if exists fee_statuses_delete_guard on public.fee_statuses;
create trigger fee_statuses_delete_guard before delete on public.fee_statuses
  for each row execute function app.fee_status_rename();
create trigger fee_statuses_rename after update of name on public.fee_statuses
  for each row execute function app.fee_status_rename();

-- 4) تحديد حالة الرسوم لعدة طلاب (الصلاحية نفسها: تعديل الطلاب في فرعهم)
create or replace function public.set_students_fee(p_ids bigint[], p_status text) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_n integer := 0;
begin
  if coalesce(cardinality(p_ids), 0) = 0 or cardinality(p_ids) > 500 then
    raise exception 'حدد بين 1 و500 طالب' using errcode = '22023';
  end if;
  foreach v_id in array p_ids loop
    perform app.require_cap('students', 2, app.student_branch(v_id));
    update public.students set fee_status = p_status where id = v_id;
    if found then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;
revoke all on function public.set_students_fee(bigint[], text) from public, anon;
grant execute on function public.set_students_fee(bigint[], text) to authenticated;

-- 5) الإعدادات: الأصل في إتاحة النتائج (closed|open، والأصل مغلق كالنظام القديم)، وشرط الرسوم (on|off)
insert into public.app_settings (key, value, is_public)
values ('results_default', '"closed"'::jsonb, false), ('results_fee_gate', '"on"'::jsonb, false)
on conflict (key) do nothing;

-- 6) الإتاحة: اعتماد الإدارة + الرسوم
create or replace function app.result_access(p_student_id bigint, p_term_id smallint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_blocked jsonb;
  v_closes timestamptz;
  v_default text := coalesce((select value #>> '{}' from public.app_settings where key = 'results_default'), 'closed');
  v_fee_on boolean := coalesce((select value #>> '{}' from public.app_settings where key = 'results_fee_gate'), 'on') = 'on';
  v_approved boolean;
  v_student_allow boolean;
  v_fee record;
  v_term record;
begin
  with s as (
    select st.id, st.class_id, c.branch_id, c.grade_id, g.stage_id
      from public.students st
      left join public.classes c on c.id = st.class_id
      left join public.grades g on g.id = c.grade_id
     where st.id = p_student_id),
  m as (
    select r.id, r.kind, r.opens_at, r.closes_at,
           case when s.id = any(r.student_ids) then 5
                when s.class_id = any(r.class_ids) then 4
                when s.grade_id = any(r.grade_ids) then 3
                when s.stage_id = any(r.stage_ids) then 2
                when s.branch_id = any(r.branch_ids) then 1
                when cardinality(r.student_ids) + cardinality(r.class_ids) + cardinality(r.grade_ids)
                     + cardinality(r.stage_ids) + cardinality(r.branch_ids) = 0 then 0 end as spec
      from public.result_release_rules r cross join s
     where r.is_active and (cardinality(r.term_ids) = 0 or p_term_id = any(r.term_ids))),
  top as (select * from m where spec = (select max(spec) from m)),
  blk as (
    select * from top
     where kind = 'block'
       and not ((opens_at is not null or closes_at is not null)
                and (opens_at is null or opens_at <= now())
                and (closes_at is null or closes_at > now()))
     order by opens_at desc nulls first
     limit 1)
  select
    (select jsonb_build_object('visible', false, 'rule_id', id, 'opens_at', opens_at, 'closes_at', closes_at,
                               'reason', case when opens_at > now() then 'not_yet'
                                              when closes_at <= now() then 'ended' else 'blocked' end)
       from blk),
    (select min(closes_at) from top where kind = 'block' and closes_at > now()),
    -- معتمد صراحةً: سماح، أو حجب بنافذة زمنية نشطة الآن (= إتاحة بوقت)
    exists (select 1 from top where kind = 'allow'
             or (kind = 'block' and (opens_at is not null or closes_at is not null)
                 and (opens_at is null or opens_at <= now()) and (closes_at is null or closes_at > now()))),
    exists (select 1 from top where kind = 'allow' and spec = 5)
    into v_blocked, v_closes, v_approved, v_student_allow;

  if v_blocked is not null then return v_blocked; end if;

  if v_default = 'closed' and not v_approved then
    return jsonb_build_object('visible', false, 'reason', 'not_approved');
  end if;

  -- الرسوم: تخص فصول العام الحالي فقط، وقاعدة سماح على الطالب نفسه تتجاوزها
  select t.academic_year_id as year_id, y.is_current,
         (select count(*) from public.terms t2
           where t2.academic_year_id = t.academic_year_id
             and (t2.sort_order, t2.id) <= (t.sort_order, t.id)) as term_no
    into v_term
    from public.terms t join public.academic_years y on y.id = t.academic_year_id
   where t.id = p_term_id;

  if v_fee_on and v_term.is_current and not v_student_allow then
    select f.unlocks_term, st.fee_year_id into v_fee
      from public.students st left join public.fee_statuses f on f.name = st.fee_status
     where st.id = p_student_id;
    if v_fee.unlocks_term is null or v_fee.fee_year_id is distinct from v_term.year_id
       or v_fee.unlocks_term < v_term.term_no then
      return jsonb_build_object('visible', false, 'reason', 'fees');
    end if;
  end if;

  return jsonb_build_object('visible', true, 'closes_at', v_closes);
end $$;

do $$ begin raise notice '✅ هجرة 45: أنواع الرسوم وشرطها على النتائج'; end $$;
