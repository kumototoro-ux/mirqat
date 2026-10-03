-- =====================================================================
-- مِرقاة — 13: الدخول وإنشاء الحسابات (المرحلة 1)
--
-- قرار التشفير الجديد: كل الحسابات تُنشأ عبر Supabase Auth (bcrypt)، فلا تحقق بالملح القديم.
-- كل دوال هذا الملف للخادم وحده (service_role): يستدعيها موقع Next.js من Server Actions
-- بالمفتاح السري. لا يصلها anon ولا authenticated إطلاقًا.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) تغيير كلمة المرور إلزامي عند أول دخول
--    كل حساب جديد يبدأ بـ true، ويصير false بعد أن يغيّر صاحبه كلمته.
--    يُنسخ أيضًا في app_metadata للحساب ليقرأه الموقع من الجلسة دون استعلام.
-- ---------------------------------------------------------------------
alter table public.profiles add column must_change_password boolean not null default true;
comment on column public.profiles.must_change_password is
  'true = كلمة المرور أصدرها الإداري ولم يغيّرها صاحبها بعد — يُوجَّه لصفحة التغيير قبل أي شيء';

-- ---------------------------------------------------------------------
-- 2) مقارنة الأسماء بـ lower() صراحةً
--    دوال security definer تعمل بـ search_path فارغ، فلا ترى نوع citext ولا معامِلاته
--    (المقارنة تسقط صامتةً إلى مقارنة نصية حساسة لحالة الأحرف). lower() هي نفس قاعدة citext.
-- ---------------------------------------------------------------------
create index profiles_username_lower_idx on public.profiles (lower(username::text));
create index login_attempts_username_lower_idx on public.login_attempts (lower(username::text), attempted_at desc);

create or replace function app.login_is_locked_text(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select count(*) >= 5
    from public.login_attempts a
   where lower(a.username::text) = p_name
     and not a.succeeded
     and a.attempted_at > now() - interval '15 minutes'
     and a.attempted_at > coalesce((select max(s.attempted_at) from public.login_attempts s
                                     where lower(s.username::text) = p_name and s.succeeded), '-infinity')
$$;
revoke all on function app.login_is_locked_text(text) from public, anon, authenticated;
grant execute on function app.login_is_locked_text(text) to service_role;

-- ---------------------------------------------------------------------
-- 3) بوابة الدخول: هل الاسم مقفل؟ ومن صاحبه؟ (الدخول باسم المستخدم لا بالبريد)
--    مساران للدخول كالنظام القديم: بوابة الموظفين لا تقبل حساب طالب، وبوابة الطالب
--    لا تقبل حساب موظف. حساب من البوابة الأخرى يُعامل كاسم غير موجود (رسالة موحّدة).
-- ---------------------------------------------------------------------
create or replace function public.auth_login_gate(p_username text, p_portal text)
returns table (locked boolean, user_id uuid, email text, status public.account_status)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_name text := lower(nullif(btrim(p_username), ''));
begin
  if p_portal is null or p_portal not in ('staff', 'student') then
    raise exception 'بوابة غير معروفة: %', p_portal;
  end if;
  if v_name is null then
    return query select false, null::uuid, null::text, null::public.account_status;
    return;
  end if;
  return query
    select app.login_is_locked_text(v_name), p.id, u.email::text, p.status
      from (select 1) dummy
      left join public.profiles p
        on lower(p.username::text) = v_name
       and (p.role = 'student') = (p_portal = 'student')
      left join auth.users u on u.id = p.id;
end $$;
comment on function public.auth_login_gate(text, text) is
  'للخادم فقط: قفل 15 دقيقة بعد 5 محاولات فاشلة، ومعرّف الحساب وبريده الداخلي لاسم المستخدم في بوابته';

-- ---------------------------------------------------------------------
-- 4) تسجيل نتيجة المحاولة: نجاحها يحدّث آخر دخول، ودخول الموظف يُكتب في سجل النشاط
--    (كالنظام القديم: "تسجيل دخول — دخول ناجح إلى النظام"، ودخول الطالب لا يُسجَّل)
-- ---------------------------------------------------------------------
create or replace function public.auth_record_login(p_username text, p_succeeded boolean, p_ip text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := lower(nullif(btrim(p_username), ''));
  v_ip   inet;
  v_who  record;
begin
  if v_name is null then return; end if;
  begin
    v_ip := nullif(btrim(p_ip), '')::inet;
  exception when others then
    v_ip := null;   -- عنوان غير مفهوم لا يُفشل تسجيل المحاولة
  end;
  insert into public.login_attempts (username, succeeded, ip) values (v_name, p_succeeded, v_ip);
  if not p_succeeded then return; end if;

  update public.profiles set last_login_at = now() where lower(username::text) = v_name;

  select p.id, p.role, e.code, e.name_ar into v_who
    from public.profiles p join public.employees e on e.id = p.employee_id
   where lower(p.username::text) = v_name and p.role <> 'student';
  if found then
    insert into public.audit_log (actor_id, actor_code, actor_name, actor_role, action, details)
    values (v_who.id, v_who.code, v_who.name_ar, v_who.role::text, 'تسجيل دخول', 'دخول ناجح إلى النظام');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5) ربط حساب Auth المُنشأ للتو بسجله (موظف أو طالب) — خطوة واحدة ذرية
--    الخادم ينشئ المستخدم عبر Admin API أولًا، ثم يستدعي هذه الدالة.
--    إن فشلت، يحذف الخادم مستخدم Auth الذي أنشأه، فلا يبقى حساب بلا سجل.
-- ---------------------------------------------------------------------
create or replace function public.admin_attach_profile(
  p_user_id        uuid,
  p_username       text,
  p_role           public.app_role,
  p_employee_id    bigint default null,
  p_student_id     bigint default null,
  p_status         public.account_status default 'active',
  p_legacy_id      integer default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_name   text := nullif(btrim(p_username), '');
  v_legacy migration.legacy_accounts;
begin
  if v_name is null then
    raise exception 'اسم المستخدم فارغ';
  end if;
  if v_name ~ '\s' then
    raise exception 'اسم المستخدم لا يقبل المسافات: %', v_name;
  end if;
  if exists (select 1 from public.profiles where lower(username::text) = lower(v_name)) then
    raise exception 'اسم المستخدم مستخدم من قبل: %', v_name;
  end if;

  if p_legacy_id is not null then
    select * into v_legacy from migration.legacy_accounts where id = p_legacy_id for update;
    if not found then
      raise exception 'الحساب القديم % غير موجود', p_legacy_id;
    end if;
    if v_legacy.auth_user_id is not null then
      raise exception 'الحساب القديم % (%) أُنشئ له حساب من قبل', p_legacy_id, v_legacy.username;
    end if;
  end if;

  insert into public.profiles (id, username, role, employee_id, student_id, status,
                               legacy_status, legacy_role, source_sheet, source_row, must_change_password)
  values (p_user_id, v_name, p_role, p_employee_id, p_student_id, p_status,
          case when v_legacy.id is not null then v_legacy.status_raw end,
          case when v_legacy.id is not null then v_legacy.role_raw end,
          v_legacy.source_sheet, v_legacy.source_row, true);

  if v_legacy.id is not null then
    -- الرمز القديم (وكلمة المرور الصريحة إن وُجدت) لا حاجة له بعد الآن: يُمسح لحظة الإنشاء
    update migration.legacy_accounts
       set auth_user_id = p_user_id, password_value = null
     where id = v_legacy.id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6) الحسابات القديمة الـ46 جاهزة للإنشاء: مربوطة بسجلها الجديد بالرمز
--    (لا تُعاد كلمة المرور القديمة — قرار التشفير الجديد)
-- ---------------------------------------------------------------------
create or replace function public.admin_legacy_accounts()
returns table (
  id            integer,
  kind          text,
  code          text,
  username      text,
  status_raw    text,
  user_type     text,
  role_raw      text,
  full_name     text,
  employee_id   bigint,
  student_id    bigint,
  auth_user_id  uuid
)
language sql stable security definer set search_path = '' as $$
  select l.id, l.kind, l.code, l.username, l.status_raw, l.user_type, l.role_raw, l.full_name,
         (select e.id from public.employees e where l.kind = 'staff' and e.code = l.code),
         (select s.id from public.students s where l.kind = 'student' and s.code = l.code),
         l.auth_user_id
    from migration.legacy_accounts l
   order by l.kind, l.source_row
$$;

-- ---------------------------------------------------------------------
-- 7) الصلاحيات: للخادم وحده
-- ---------------------------------------------------------------------
revoke all on function public.auth_login_gate(text, text) from public, anon, authenticated;
revoke all on function public.auth_record_login(text, boolean, text) from public, anon, authenticated;
revoke all on function public.admin_attach_profile(uuid, text, public.app_role, bigint, bigint, public.account_status, integer)
  from public, anon, authenticated;
revoke all on function public.admin_legacy_accounts() from public, anon, authenticated;

grant execute on function public.auth_login_gate(text, text) to service_role;
grant execute on function public.auth_record_login(text, boolean, text) to service_role;
grant execute on function public.admin_attach_profile(uuid, text, public.app_role, bigint, bigint, public.account_status, integer)
  to service_role;
grant execute on function public.admin_legacy_accounts() to service_role;

-- ---------------------------------------------------------------------
-- 8) فحص ذاتي: يُلغي الملف كاملًا إن تسرّبت صلاحية لغير الخادم
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.auth_login_gate(text, text)',
    'public.auth_record_login(text, boolean, text)',
    'public.admin_attach_profile(uuid, text, public.app_role, bigint, bigint, public.account_status, integer)',
    'public.admin_legacy_accounts()'
  ] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception 'فحص 13: الدالة % متاحة لغير الخادم', f;
    end if;
    if not has_function_privilege('service_role', f, 'execute') then
      raise exception 'فحص 13: الخادم لا يملك تنفيذ %', f;
    end if;
  end loop;
  raise notice '✅ هجرة 13: دوال الدخول والحسابات جاهزة، ومحصورة بالخادم';
end $$;
