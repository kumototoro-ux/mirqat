-- =====================================================================
-- هجرة 32: مركز التتبع — كل مشكلة مشروحة: ماذا حدث، لماذا، وما الحل
--   (مستوحى من «سجل التتبع» في مرقاة للرصد الذكي، وموسّع)
--   يُلتقط تلقائيًا: أخطاء قاعدة البيانات من أي صفحة أو عملية، الاستعلامات البطيئة، أخطاء الخادم
--   والمتصفح، بطء الصفحات عند المستخدم، محاولات الدخول الفاشلة والمقفلة، فتح صفحات بلا صلاحية.
--   التشخيص (النوع والتجميع والحاجة لتدخل) يُحسب في الموقع ويُخزَّن مع الحدث، والشرح يُبنى عند العرض.
--   الكتابة بالمفتاح السري فقط (track_log)، والقراءة للإداري فقط عبر دوال.
-- =====================================================================

create table public.app_events (
  id            bigint generated always as identity primary key,
  at            timestamptz not null default now(),
  severity      text not null default 'info' check (severity in ('info', 'warning', 'error', 'security')),
  kind          text not null default 'ok' check (kind in ('ok', 'user', 'config', 'access', 'system', 'security', 'slow')),
  needs_action  boolean not null default false,
  action        text not null check (char_length(action) <= 120),
  fingerprint   text not null check (char_length(fingerprint) <= 200),
  actor_id      uuid,
  actor_name    text,
  actor_role    text,
  actor_code    text,
  path          text,
  message       text,
  code          text,
  duration_ms   integer,
  details       jsonb not null default '{}'::jsonb,
  ip            text,
  user_agent    text
);
create index app_events_at_idx on public.app_events (at desc);
create index app_events_fp_idx on public.app_events (fingerprint, at desc);
create index app_events_actor_idx on public.app_events (actor_id, at desc);
create index app_events_kind_idx on public.app_events (kind, at desc) where kind <> 'ok';
alter table public.app_events enable row level security;
revoke all on public.app_events from anon, authenticated;

-- حالة كل مجموعة مشاكل: «تم الحل» حتى يتكرر الحدث بعده
create table public.app_event_groups (
  fingerprint  text primary key,
  resolved_at  timestamptz,
  resolved_by  bigint references public.employees(id) on delete set null,
  note         text check (note is null or char_length(note) <= 300)
);
alter table public.app_event_groups enable row level security;
revoke all on public.app_event_groups from anon, authenticated;

-- ---------------------------------------------------------------------
-- الكتابة (الموقع فقط بالمفتاح السري): يملأ هوية المستخدم من حسابه، ويمنع إغراق السجل
-- ---------------------------------------------------------------------
create or replace function public.track_log(p jsonb) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actor uuid := case when (p ->> 'actor_id') ~* '^[0-9a-f-]{36}$' then (p ->> 'actor_id')::uuid end;
  v_fp    text := left(coalesce(nullif(p ->> 'fingerprint', ''), p ->> 'action'), 200);
  v_ip    text := left(p ->> 'ip', 60);
  v_name  text; v_role text; v_code text;
begin
  if coalesce(p ->> 'action', '') = '' then return false; end if;
  -- حد أقصى 40 حدثًا في الدقيقة لكل مستخدم/جهاز، وحدث واحد مكرر (نفس البصمة) كل 10 ثوانٍ
  if (select count(*) from public.app_events e
       where e.at > now() - interval '1 minute'
         and ((v_actor is not null and e.actor_id = v_actor) or (v_actor is null and e.ip = v_ip))) >= 40 then
    return false;
  end if;
  if exists (select 1 from public.app_events e
              where e.fingerprint = v_fp and e.at > now() - interval '10 seconds'
                and e.actor_id is not distinct from v_actor and e.path is not distinct from left(p ->> 'path', 300)
                and e.details ->> 'username' is not distinct from p -> 'details' ->> 'username') then
    return false;
  end if;
  if v_actor is not null then
    select pr.role::text, coalesce(em.name_ar, st.name_ar, pr.username::text), coalesce(em.code, st.code)
      into v_role, v_name, v_code
      from public.profiles pr
      left join public.employees em on em.id = pr.employee_id
      left join public.students st on st.id = pr.student_id
     where pr.id = v_actor;
  end if;
  insert into public.app_events (severity, kind, needs_action, action, fingerprint, actor_id, actor_name, actor_role, actor_code,
                                 path, message, code, duration_ms, details, ip, user_agent)
  values (coalesce(nullif(p ->> 'severity', ''), 'info'), coalesce(nullif(p ->> 'kind', ''), 'ok'),
          coalesce((p ->> 'needs_action')::boolean, false), left(p ->> 'action', 120), v_fp,
          v_actor, coalesce(v_name, left(p ->> 'actor_name', 120)), coalesce(v_role, left(p ->> 'actor_role', 20)), v_code,
          left(p ->> 'path', 300), left(p ->> 'message', 1000), left(p ->> 'code', 40),
          case when (p ->> 'duration_ms') ~ '^\d{1,9}$' then (p ->> 'duration_ms')::int end,
          coalesce(case when jsonb_typeof(p -> 'details') = 'object' then p -> 'details' end, '{}'::jsonb),
          v_ip, left(p ->> 'user_agent', 300));
  return true;
end $$;
revoke all on function public.track_log(jsonb) from public, anon, authenticated;
grant execute on function public.track_log(jsonb) to service_role;

-- ---------------------------------------------------------------------
-- القراءة (الإداري فقط)
-- ---------------------------------------------------------------------
/* الملخص: المؤشرات + أبرز المجموعات (غير المحلولة أولًا) */
create or replace function public.track_summary(p_hours integer default 24) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_since timestamptz := case when coalesce(p_hours, 0) <= 0 then '-infinity'::timestamptz else now() - make_interval(hours => p_hours) end;
begin
  perform app.require_admin();
  return (
    with ev as (
      select e.* from public.app_events e where e.at >= v_since and e.kind <> 'ok'
    ), g as (
      select e.fingerprint,
             count(*) as n, max(e.at) as last_at, min(e.at) as first_at,
             bool_or(e.needs_action) as needs_action,
             count(distinct coalesce(e.actor_id::text, e.ip)) as people_n,
             (array_agg(distinct e.actor_name) filter (where e.actor_name is not null))[1:4] as people,
             (array_agg(e.id order by e.at desc))[1] as sample_id
        from ev e group by e.fingerprint
    ), gx as (
      select g.*, gr.resolved_at, gr.note, em.name_ar as resolved_by,
             (gr.resolved_at is not null and gr.resolved_at >= g.last_at) as resolved
        from g left join public.app_event_groups gr on gr.fingerprint = g.fingerprint
        left join public.employees em on em.id = gr.resolved_by
    )
    select jsonb_build_object(
      'counts', jsonb_build_object(
        'needs_action', (select coalesce(sum(n), 0) from gx where needs_action and not resolved),
        'system', (select count(*) from ev where kind = 'system'),
        'user', (select count(*) from ev where kind = 'user'),
        'security', (select count(*) from ev where kind in ('security', 'access')),
        'slow', (select count(*) from ev where kind = 'slow'),
        'config', (select count(*) from ev where kind = 'config'),
        'total', (select count(*) from public.app_events e where e.at >= v_since),
        'people', (select count(distinct e.actor_id) from public.app_events e where e.at >= v_since and e.actor_id is not null)),
      'groups', coalesce((select jsonb_agg(jsonb_build_object(
                   'fingerprint', x.fingerprint, 'count', x.n, 'last_at', x.last_at, 'first_at', x.first_at,
                   'needs_action', x.needs_action, 'people', coalesce(to_jsonb(x.people), '[]'::jsonb), 'people_n', x.people_n,
                   'resolved', x.resolved, 'resolved_at', x.resolved_at, 'resolved_by', x.resolved_by, 'note', x.note,
                   'sample', (select to_jsonb(s) - 'ip' - 'user_agent' from public.app_events s where s.id = x.sample_id))
                   order by x.resolved, x.needs_action desc, x.n desc, x.last_at desc)
                  from (select * from gx order by resolved, needs_action desc, n desc, last_at desc limit 30) x), '[]'::jsonb),
      'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'problems', d.p, 'slow', d.s, 'security', d.sec) order by d.day)
                   from (select (e.at at time zone 'Asia/Riyadh')::date as day,
                                count(*) filter (where e.kind in ('system', 'config', 'user')) as p,
                                count(*) filter (where e.kind = 'slow') as s,
                                count(*) filter (where e.kind in ('security', 'access')) as sec
                           from public.app_events e where e.at >= greatest(v_since, now() - interval '30 days')
                          group by 1) d), '[]'::jsonb)
    ));
end $$;

/* قائمة الأحداث بفلاتر */
create or replace function public.track_events(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_since timestamptz := case when coalesce((p ->> 'hours')::int, 24) <= 0 then '-infinity'::timestamptz
                              else now() - make_interval(hours => coalesce((p ->> 'hours')::int, 24)) end;
  v_view  text := coalesce(nullif(p ->> 'view', ''), 'problems');
  v_kind  text := nullif(p ->> 'kind', '');
  v_fp    text := nullif(p ->> 'fingerprint', '');
  v_actor uuid := case when (p ->> 'actor_id') ~* '^[0-9a-f-]{36}$' then (p ->> 'actor_id')::uuid end;
  v_q     text := nullif(btrim(regexp_replace(coalesce(p ->> 'q', ''), '[%_\\]', '', 'g')), '');
  v_page  integer := greatest(1, coalesce((p ->> 'page')::int, 1));
  v_size  integer := least(100, greatest(10, coalesce((p ->> 'size')::int, 30)));
begin
  perform app.require_admin();
  return (
    with f as (
      select e.id, e.at, e.severity, e.kind, e.needs_action, e.action, e.fingerprint, e.actor_id, e.actor_name, e.actor_role,
             e.actor_code, e.path, e.message, e.code, e.duration_ms, e.details, e.ip, e.user_agent
        from public.app_events e
       where e.at >= v_since
         and (v_fp is not null or v_actor is not null or case v_view
               when 'all' then true when 'security' then e.kind in ('security', 'access')
               when 'slow' then e.kind = 'slow' when 'system' then e.kind in ('system', 'config')
               else e.kind <> 'ok' end)
         and (v_kind is null or e.kind = v_kind)
         and (v_fp is null or e.fingerprint = v_fp)
         and (v_actor is null or e.actor_id = v_actor)
         and (v_q is null or e.actor_name ilike '%' || v_q || '%' or e.actor_code ilike v_q || '%'
              or e.message ilike '%' || v_q || '%' or e.path ilike '%' || v_q || '%' or e.details ->> 'digest' = v_q)
    )
    select jsonb_build_object(
      'total', (select count(*) from f),
      'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.at desc, x.id desc)
                          from (select * from f order by at desc, id desc offset (v_page - 1) * v_size limit v_size) x), '[]'::jsonb))
  );
end $$;

/* الخط الزمني لمستخدم: الدخول + تعديلاته على البيانات + الأحداث والمشاكل */
create or replace function public.track_timeline(p_actor uuid, p_days integer default 7) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_since timestamptz := now() - make_interval(days => least(90, greatest(1, coalesce(p_days, 7))));
  v_user  record;
begin
  perform app.require_admin();
  select pr.id, pr.username::text as username, pr.role::text as role, pr.status::text as status,
         coalesce(em.name_ar, st.name_ar, pr.username::text) as name, coalesce(em.code, st.code) as code
    into v_user
    from public.profiles pr left join public.employees em on em.id = pr.employee_id left join public.students st on st.id = pr.student_id
   where pr.id = p_actor;
  if v_user.id is null then raise exception 'المستخدم غير موجود'; end if;
  return jsonb_build_object(
    'user', to_jsonb(v_user),
    'stats', jsonb_build_object(
      'logins', (select count(*) from public.login_attempts a where lower(a.username::text) = lower(v_user.username) and a.succeeded and a.attempted_at >= v_since),
      'failed_logins', (select count(*) from public.login_attempts a where lower(a.username::text) = lower(v_user.username) and not a.succeeded and a.attempted_at >= v_since),
      'changes', (select count(*) from public.audit_log l where l.actor_id = p_actor and l.occurred_at >= v_since and l.action in ('INSERT', 'UPDATE', 'DELETE')),
      'problems', (select count(*) from public.app_events e where e.actor_id = p_actor and e.at >= v_since and e.kind <> 'ok'),
      'last_seen', greatest((select max(e.at) from public.app_events e where e.actor_id = p_actor),
                            (select max(l.occurred_at) from public.audit_log l where l.actor_id = p_actor),
                            (select max(a.attempted_at) from public.login_attempts a where lower(a.username::text) = lower(v_user.username) and a.succeeded))),
    'items', coalesce((select jsonb_agg(x order by x.at desc) from (
        (select 'login' as src, a.attempted_at as at, case when a.succeeded then 'auth.login' else 'auth.login_failed' end as action,
                null::text as kind, null::text as table_name, null::text as details, a.ip::text as ip, null::bigint as id, null::jsonb as ev
           from public.login_attempts a where lower(a.username::text) = lower(v_user.username) and a.attempted_at >= v_since
          order by a.attempted_at desc limit 100)
        union all
        (select 'change', l.occurred_at, l.action, null, l.table_name, l.details, null, l.id, null::jsonb
           from public.audit_log l where l.actor_id = p_actor and l.occurred_at >= v_since and l.action in ('INSERT', 'UPDATE', 'DELETE')
          order by l.occurred_at desc limit 200)
        union all
        (select 'event', e.at, e.action, e.kind, null, null, null, e.id,
                jsonb_build_object('message', e.message, 'code', e.code, 'path', e.path, 'duration_ms', e.duration_ms, 'details', e.details)
           from public.app_events e where e.actor_id = p_actor and e.at >= v_since
          order by e.at desc limit 200)
        order by at desc limit 300) x), '[]'::jsonb));
end $$;

/* بحث المستخدمين للخط الزمني (الأكثر نشاطًا أولًا) */
create or replace function public.track_people(p_q text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(btrim(regexp_replace(coalesce(p_q, ''), '[%_\\]', '', 'g')), '');
begin
  perform app.require_admin();
  return coalesce((select jsonb_agg(x) from (
    select pr.id, coalesce(em.name_ar, st.name_ar, pr.username::text) as name, coalesce(em.code, st.code) as code, pr.role::text as role,
           (select count(*) from public.app_events e where e.actor_id = pr.id and e.at > now() - interval '7 days' and e.kind <> 'ok') as problems,
           (select max(l.occurred_at) from public.audit_log l where l.actor_id = pr.id) as last_change
      from public.profiles pr left join public.employees em on em.id = pr.employee_id left join public.students st on st.id = pr.student_id
     where v_q is null or em.name_ar ilike '%' || v_q || '%' or st.name_ar ilike '%' || v_q || '%'
        or em.code ilike v_q || '%' or st.code ilike v_q || '%' or pr.username::text ilike v_q || '%'
     order by problems desc, last_change desc nulls last
     limit 12) x), '[]'::jsonb);
end $$;

/* «تم الحل» / إعادة فتح */
create or replace function public.track_resolve(p_fingerprint text, p_resolved boolean, p_note text default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_admin();
  if p_resolved then
    insert into public.app_event_groups (fingerprint, resolved_at, resolved_by, note)
    values (left(p_fingerprint, 200), now(), app.my_employee_id(), nullif(btrim(left(coalesce(p_note, ''), 300)), ''))
    on conflict (fingerprint) do update set resolved_at = now(), resolved_by = excluded.resolved_by, note = excluded.note;
  else
    update public.app_event_groups set resolved_at = null, note = null where fingerprint = p_fingerprint;
  end if;
end $$;

/* تنبيه رئيسية الإداري: مشاكل تحتاج تدخلًا في آخر 24 ساعة ولم تُحل */
create or replace function public.track_alert() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(app.is_admin(), false) then return null; end if;
  return (select jsonb_build_object('count', coalesce(sum(n), 0), 'groups', count(*), 'top', (array_agg(fp order by n desc))[1])
            from (select e.fingerprint as fp, count(*) as n, max(e.at) as last_at
                    from public.app_events e
                   where e.at > now() - interval '24 hours' and e.needs_action
                   group by e.fingerprint) g
            left join public.app_event_groups gr on gr.fingerprint = g.fp
           where gr.resolved_at is null or gr.resolved_at < g.last_at);
end $$;

revoke all on function public.track_summary(integer), public.track_events(jsonb), public.track_timeline(uuid, integer),
                       public.track_people(text), public.track_resolve(text, boolean, text), public.track_alert() from public, anon;
grant execute on function public.track_summary(integer), public.track_events(jsonb), public.track_timeline(uuid, integer),
                          public.track_people(text), public.track_resolve(text, boolean, text), public.track_alert() to authenticated;

-- ---------------------------------------------------------------------
-- التنظيف (المهمة اليومية): الأحداث العادية 30 يومًا، والمشاكل 180 يومًا
-- ---------------------------------------------------------------------
create or replace function public.track_purge() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_n integer;
begin
  delete from public.app_events
   where (kind = 'ok' and at < now() - interval '30 days') or at < now() - interval '180 days';
  get diagnostics v_n = row_count;
  delete from public.app_event_groups g
   where not exists (select 1 from public.app_events e where e.fingerprint = g.fingerprint);
  return v_n;
end $$;
revoke all on function public.track_purge() from public, anon, authenticated;
grant execute on function public.track_purge() to service_role;

do $$ begin raise notice '✅ هجرة 32: مركز التتبع'; end $$;
