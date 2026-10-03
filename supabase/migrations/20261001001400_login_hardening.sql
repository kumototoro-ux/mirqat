-- =====================================================================
-- مِرقاة — 14: تشديد الدخول
--
-- 1) قفل على مستوى الجهاز (IP) فوق قفل اسم المستخدم:
--    من يجرّب كلمات مرور على أسماء كثيرة (تخمين حسابات الموظفين مثلًا) يُوقف 15 دقيقة
--    بعد 40 محاولة فاشلة من نفس العنوان، حتى لو لم يتجاوز 5 محاولات لكل اسم.
--    40 لا 10: طلاب كثيرون قد يدخلون من شبكة واحدة (نفس العنوان) ويخطئون في الكتابة.
-- 2) بوابة الدخول تُرجع الحالتين، والخادم يرفض قبل أي تحقق من كلمة المرور.
--
-- طبّقه قبل رفع كود الموقع الجديد: الكود القديم يبقى يعمل معه (المعامل الجديد اختياري).
-- =====================================================================

create index if not exists login_attempts_ip_fail_idx
  on public.login_attempts (ip, attempted_at desc) where not succeeded;

create or replace function app.ip_is_throttled(p_ip inet) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_ip is not null and count(*) >= 40
    from public.login_attempts a
   where a.ip = p_ip
     and not a.succeeded
     and a.attempted_at > now() - interval '15 minutes'
$$;
revoke all on function app.ip_is_throttled(inet) from public, anon, authenticated;
grant execute on function app.ip_is_throttled(inet) to service_role;

-- نوع الإرجاع تغيّر (عمود ip_locked)، فلا بد من الحذف ثم الإنشاء
drop function if exists public.auth_login_gate(text, text);

create function public.auth_login_gate(p_username text, p_portal text, p_ip text default null)
returns table (locked boolean, ip_locked boolean, user_id uuid, email text, status public.account_status)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_name text := lower(nullif(btrim(p_username), ''));
  v_ip   inet;
begin
  if p_portal is null or p_portal not in ('staff', 'student') then
    raise exception 'بوابة غير معروفة: %', p_portal;
  end if;
  begin
    v_ip := nullif(btrim(p_ip), '')::inet;
  exception when others then
    v_ip := null;
  end;
  if v_name is null or length(v_name) > 64 then
    return query select false, app.ip_is_throttled(v_ip), null::uuid, null::text, null::public.account_status;
    return;
  end if;
  return query
    select app.login_is_locked_text(v_name), app.ip_is_throttled(v_ip), p.id, u.email::text, p.status
      from (select 1) dummy
      left join public.profiles p
        on lower(p.username::text) = v_name
       and (p.role = 'student') = (p_portal = 'student')
      left join auth.users u on u.id = p.id;
end $$;
comment on function public.auth_login_gate(text, text, text) is
  'للخادم فقط: قفل الاسم (5 محاولات) وقفل الجهاز (40 محاولة) لمدة 15 دقيقة، وصاحب الاسم في بوابته';

revoke all on function public.auth_login_gate(text, text, text) from public, anon, authenticated;
grant execute on function public.auth_login_gate(text, text, text) to service_role;

-- ---------------------------------------------------------------------
-- فحص ذاتي: لا تصل دوال الدخول لغير الخادم، ولا يملك العميل أي كتابة على profiles
-- ---------------------------------------------------------------------
do $$
begin
  if has_function_privilege('anon', 'public.auth_login_gate(text, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.auth_login_gate(text, text, text)', 'execute') then
    raise exception 'فحص 14: بوابة الدخول متاحة لغير الخادم';
  end if;
  if has_table_privilege('anon', 'public.profiles', 'insert')
     or has_table_privilege('anon', 'public.profiles', 'update')
     or has_table_privilege('anon', 'public.login_attempts', 'select') then
    raise exception 'فحص 14: صلاحية كتابة متسربة للزائر';
  end if;
  raise notice '✅ هجرة 14: قفل الجهاز مفعّل وبوابة الدخول محصورة بالخادم';
end $$;
