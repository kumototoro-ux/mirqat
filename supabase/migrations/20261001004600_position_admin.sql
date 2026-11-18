-- =====================================================================
-- مِرقاة — 46: إدارة المناصب من الواجهة (إضافة منصب، تعديل ما يملكه، مستويات واضحة)
--
-- قبل هذه الهجرة: المناصب وقدراتها تُضاف بالهجرات وحدها، فلا يستطيع الإداري تعديلها.
-- الآن (للإداري وحده، والقاعدة تفرض ذلك):
--   • admin_save_position   إنشاء منصب جديد أو تعديل اسمه ووصفه (والمستوى والرتبة للمنصب غير الأساسي)
--   • admin_delete_position حذف منصب مخصّص لا يشغله أحد
--   • admin_set_position_caps  ضبط قدرات المنصب على كل المجالات دفعة واحدة (0 = لا شيء، 1 عرض، 2 تعديل، 3 كامل)
--   • admin_set_position_branches  ضبط فروع منصب موظف دفعة واحدة (بما فيها «كل الفروع»)
-- المناصب الأساسية السبعة محمية من الحذف وتبقى أكوادها ثابتة لأن دوال الرتبة وتقارير الأداء تعتمد عليها.
--
-- المستويات الثلاثة (تمييز ثابت):
--   الأدمن (المنصة كلها) ← مدير المدرسة (الفروع المسندة إليه، «مدير الفروع» سابقًا) ← مدير الفرع (فرع واحد)
-- tier: school = يعمل على عدة فروع بالإسناد | branch = يعمل داخل فرع.
-- rank: رتبة الحماية بين المناصب: لا يمسّ منصب حساب من هو في رتبة مساوية أو أعلى.
-- لا تُحذف بيانات، ولا يُمنح أحد منصبًا. آمنة لإعادة التشغيل.
-- =====================================================================

alter table public.positions
  add column if not exists tier text not null default 'branch' check (tier in ('school', 'branch')),
  add column if not exists rank smallint not null default 0 check (rank between 0 and 3),
  add column if not exists is_system boolean not null default false,
  add column if not exists description text;

update public.positions set is_system = true, tier = 'school', rank = 3, name_ar = 'مدير المدرسة', name_f = 'مديرة المدرسة',
  description = 'يشرف على الفروع المسندة إليه (يمكن إسناد كل الفروع). أقل من الأدمن: لا ينشئ فروعًا ولا يدير إعدادات المنصة.'
  where code = 'branches_director';
update public.positions set is_system = true, tier = 'school', rank = 2,
  description = 'يراقب أداء الفروع المسندة إليه ويكتب تقارير الأداء ويرسلها لمدير المدرسة. للعرض فقط في باقي المجالات.'
  where code = 'performance_monitor';
update public.positions set is_system = true, tier = 'branch', rank = 2,
  description = 'يدير فرعه الواحد: الطلاب والجداول والتحضير والسلوك، ويعلن النتائج ويحجبها لفرعه.'
  where code = 'branch_manager';
update public.positions set is_system = true, tier = 'branch', rank = 0,
  description = 'يساعد مدير الفرع في الجداول والتحضير والسلوك وتسجيل الطلاب.'
  where code = 'deputy';
update public.positions set is_system = true, tier = 'branch', rank = 0,
  description = 'يتابع المعلمات في فرعه (عرض).'
  where code = 'teachers_supervisor';
update public.positions set is_system = true, tier = 'branch', rank = 0,
  description = 'يتابع الطلاب: التحضير والسلوك وكلمات مرور الطلاب وشهادات الشكر.'
  where code = 'students_supervisor';
update public.positions set is_system = true, tier = 'branch', rank = 0,
  description = 'يسجّل الطلاب الجدد ويستورد بياناتهم ويدير حساباتهم. لا يرى أي درجات.'
  where code = 'admissions';

-- الرتبة من الجدول لا من الأكواد المكتوبة (القيم نفسها للمناصب الأساسية)
create or replace function app.pos_rank(p_emp bigint) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(max(p.rank), 0)::integer
    from public.employee_positions ep join public.positions p on p.code = ep.position
   where ep.employee_id = p_emp
$$;

-- مراقبة التغييرات في سجل النشاط
drop trigger if exists positions_audit on public.positions;
create trigger positions_audit after insert or update or delete on public.positions
  for each row execute function app.audit_row();
drop trigger if exists position_caps_audit on public.position_caps;
create trigger position_caps_audit after insert or update or delete on public.position_caps
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------
-- إنشاء منصب أو تعديله
-- ---------------------------------------------------------------------
create or replace function public.admin_save_position(
  p_code text, p_name text, p_name_f text, p_tier text, p_rank smallint, p_desc text
) returns text
language plpgsql security definer set search_path = '' as $$
declare v_code text; v_sys boolean; v_name text := btrim(coalesce(p_name, '')); v_f text := btrim(coalesce(p_name_f, ''));
begin
  perform app.require_admin();
  if v_name = '' or char_length(v_name) > 60 then raise exception 'اسم المنصب مطلوب (حتى 60 حرفًا)'; end if;
  if v_f = '' then v_f := v_name; end if;
  if char_length(v_f) > 60 then raise exception 'اسم المنصب بصيغة المؤنث طويل'; end if;
  if p_desc is not null and char_length(p_desc) > 300 then raise exception 'الوصف طويل (حتى 300 حرف)'; end if;
  if p_tier not in ('school', 'branch') then raise exception 'مستوى المنصب غير صالح'; end if;
  if p_rank is null or p_rank < 0 or p_rank > 1 then raise exception 'رتبة المنصب المخصّص 0 أو 1'; end if;

  if coalesce(btrim(p_code), '') = '' then
    if exists (select 1 from public.positions where name_ar = v_name) then raise exception 'يوجد منصب بهذا الاسم'; end if;
    v_code := 'custom_' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    insert into public.positions (code, name_ar, name_f, sort, tier, rank, is_system, description)
    values (v_code, v_name, v_f, coalesce((select max(sort) from public.positions), 0) + 1, p_tier, p_rank, false, nullif(btrim(coalesce(p_desc, '')), ''));
    return v_code;
  end if;

  select is_system into v_sys from public.positions where code = p_code;
  if not found then raise exception 'منصب غير معروف'; end if;
  if exists (select 1 from public.positions where name_ar = v_name and code <> p_code) then raise exception 'يوجد منصب بهذا الاسم'; end if;
  if v_sys then
    update public.positions set name_ar = v_name, name_f = v_f, description = nullif(btrim(coalesce(p_desc, '')), '') where code = p_code;
  else
    update public.positions set name_ar = v_name, name_f = v_f, tier = p_tier, rank = p_rank, description = nullif(btrim(coalesce(p_desc, '')), '') where code = p_code;
  end if;
  return p_code;
end $$;

-- ---------------------------------------------------------------------
-- حذف منصب مخصّص لا يشغله أحد
-- ---------------------------------------------------------------------
create or replace function public.admin_delete_position(p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_sys boolean; v_n integer;
begin
  perform app.require_admin();
  select is_system into v_sys from public.positions where code = p_code;
  if not found then raise exception 'منصب غير معروف'; end if;
  if v_sys then raise exception 'المناصب الأساسية لا تُحذف'; end if;
  select count(*) into v_n from public.employee_positions where position = p_code;
  if v_n > 0 then raise exception 'يشغل هذا المنصب % موظف. اسحبه منهم أولًا', v_n; end if;
  delete from public.positions where code = p_code;
end $$;

-- ---------------------------------------------------------------------
-- ضبط قدرات المنصب كلها: {"students":3,"results":1,...}؛ المجال الغائب أو 0 = لا قدرة
-- ---------------------------------------------------------------------
create or replace function public.admin_set_position_caps(p_code text, p_caps jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare r record; v_lvl integer;
begin
  perform app.require_admin();
  if not exists (select 1 from public.positions where code = p_code) then raise exception 'منصب غير معروف'; end if;
  if p_caps is null or jsonb_typeof(p_caps) <> 'object' then raise exception 'قدرات غير صالحة'; end if;
  for r in select key, value from jsonb_each(p_caps) loop
    if not exists (select 1 from public.cap_areas where area = r.key) then raise exception 'مجال غير معروف: %', r.key; end if;
    if jsonb_typeof(r.value) <> 'number' then raise exception 'مستوى غير صالح لمجال %', r.key; end if;
    v_lvl := (r.value)::text::numeric::integer;
    if v_lvl < 0 or v_lvl > 3 then raise exception 'المستوى بين 0 و3'; end if;
  end loop;
  delete from public.position_caps pc
   where pc.position = p_code
     and coalesce((p_caps ->> pc.area)::numeric, 0) = 0;
  insert into public.position_caps (position, area, level)
  select p_code, a.area, (p_caps ->> a.area)::numeric::smallint
    from public.cap_areas a
   where coalesce((p_caps ->> a.area)::numeric, 0) > 0
  on conflict (position, area) do update set level = excluded.level;
end $$;

-- ---------------------------------------------------------------------
-- ضبط فروع منصب موظف بالمجموعة (الموجود خارجها يُسحب، والناقص يُضاف)
-- ---------------------------------------------------------------------
create or replace function public.admin_set_position_branches(p_employee_id bigint, p_position text, p_branches smallint[])
returns void
language plpgsql security definer set search_path = '' as $$
declare v_type text; v_active boolean; v_b smallint;
begin
  perform app.require_admin();
  if not exists (select 1 from public.positions where code = p_position) then raise exception 'منصب غير معروف'; end if;
  select user_type, is_active into v_type, v_active from public.employees where id = p_employee_id;
  if not found then raise exception 'الموظف غير موجود'; end if;
  if v_type = 'admin' then raise exception 'الإداري يملك كل الصلاحيات ولا يُسند له منصب'; end if;
  p_branches := coalesce(p_branches, '{}'::smallint[]);
  if exists (select 1 from unnest(p_branches) b where not exists (select 1 from public.branches br where br.id = b)) then
    raise exception 'فرع غير موجود';
  end if;
  if cardinality(p_branches) > 0 and not v_active then raise exception 'لا يُسند منصب لموظف غير نشط'; end if;
  delete from public.employee_positions where employee_id = p_employee_id and position = p_position and not (branch_id = any(p_branches));
  foreach v_b in array p_branches loop
    insert into public.employee_positions (employee_id, position, branch_id, assigned_by)
    values (p_employee_id, p_position, v_b, auth.uid()) on conflict do nothing;
  end loop;
end $$;

revoke all on function public.admin_save_position(text, text, text, text, smallint, text),
  public.admin_delete_position(text), public.admin_set_position_caps(text, jsonb),
  public.admin_set_position_branches(bigint, text, smallint[]) from public, anon;
grant execute on function public.admin_save_position(text, text, text, text, smallint, text),
  public.admin_delete_position(text), public.admin_set_position_caps(text, jsonb),
  public.admin_set_position_branches(bigint, text, smallint[]) to authenticated;
