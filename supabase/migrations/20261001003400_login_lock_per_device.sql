-- =====================================================================
-- مِرقاة — 34: قفل الدخول على (الاسم + الجهاز) بدل الاسم وحده
--
-- قبلها: 5 محاولات خاطئة على اسم = قفل 15 دقيقة على الجميع. أسماء الطلاب أرقامهم (معروفة ومتسلسلة)،
--        فمن يعرفها يستطيع قفل حساباتهم وقت الاختبار (التدقيق الأمني م-2).
-- بعدها:
--   1) 5 محاولات خاطئة على اسم من نفس الجهاز = يُقفل ذلك الجهاز عن هذا الاسم فقط،
--      وصاحب الحساب يدخل من جهازه عاديًا.
--   2) شبكة أمان ضد التخمين الموزّع (أجهزة كثيرة على حساب واحد): 30 محاولة خاطئة على الاسم
--      من كل الأجهزة خلال 15 دقيقة = قفل الحساب. لا يبلغها مهاجم من جهاز واحد (يُقفل عند 5)،
--      فيحتاج 6 أجهزة على الأقل لكل حساب.
--   3) قفل الجهاز العام (40 محاولة على أي أسماء) باقٍ كما هو.
--   4) جهاز غير معروف العنوان: يبقى القفل على الاسم عند 5 كما كان (الأحوط).
-- الدخول الناجح يصفّر العدّاد كما كان. نوع الإرجاع لم يتغير، فالكود الحالي يعمل معه.
-- =====================================================================

create index if not exists login_attempts_name_ip_fail_idx
  on public.login_attempts (lower(username::text), ip, attempted_at desc) where not succeeded;

create or replace function app.login_is_locked_for(p_name text, p_ip inet) returns boolean
language sql stable security definer set search_path = '' as $$
  with since as (
    select greatest(now() - interval '15 minutes',
                    coalesce((select max(s.attempted_at) from public.login_attempts s
                               where lower(s.username::text) = p_name and s.succeeded), '-infinity')) as t
  ),
  f as (
    select count(*) as all_fails,
           count(*) filter (where p_ip is not null and a.ip = p_ip) as device_fails
      from public.login_attempts a, since
     where lower(a.username::text) = p_name and not a.succeeded and a.attempted_at > since.t
  )
  select case when p_ip is null then all_fails >= 5
              else device_fails >= 5 or all_fails >= 30 end
    from f
$$;
revoke all on function app.login_is_locked_for(text, inet) from public, anon, authenticated;
grant execute on function app.login_is_locked_for(text, inet) to service_role;

create or replace function public.auth_login_gate(p_username text, p_portal text, p_ip text default null)
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
    select app.login_is_locked_for(v_name, v_ip), app.ip_is_throttled(v_ip), p.id, u.email::text, p.status
      from (select 1) dummy
      left join public.profiles p
        on lower(p.username::text) = v_name
       and (p.role = 'student') = (p_portal = 'student')
      left join auth.users u on u.id = p.id;
end $$;
comment on function public.auth_login_gate(text, text, text) is
  'للخادم فقط: قفل (الاسم + الجهاز) بعد 5 محاولات، والاسم بعد 30 من كل الأجهزة، والجهاز بعد 40 — لمدة 15 دقيقة';
revoke all on function public.auth_login_gate(text, text, text) from public, anon, authenticated;
grant execute on function public.auth_login_gate(text, text, text) to service_role;

-- دوال القفل القديمة (على الاسم وحده) لم يعد يستدعيها شيء
drop function if exists app.login_is_locked_text(text);
drop function if exists app.login_is_locked(citext);
