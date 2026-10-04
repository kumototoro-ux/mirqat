-- =====================================================================
-- مِرقاة — 17: تقرير النشاط (سجل التدقيق) — استدعاء واحد مجمّع للإداري
-- =====================================================================
create index if not exists audit_log_occurred_idx on public.audit_log (occurred_at desc);

create or replace function public.report_activity()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today timestamptz := date_trunc('day', now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh';
  v_week  timestamptz := v_today - interval '6 days';
  v_prev  timestamptz := v_week - interval '7 days';
  v_result jsonb;
begin
  perform app.require_admin();
  select jsonb_build_object(
    'generated_at', now(),
    'totals', (select jsonb_build_object(
        'all', count(*),
        'today', count(*) filter (where occurred_at >= v_today),
        'week', count(*) filter (where occurred_at >= v_week),
        'prev_week', count(*) filter (where occurred_at >= v_prev and occurred_at < v_week),
        'logins_week', count(*) filter (where occurred_at >= v_week and action = 'تسجيل دخول'),
        'deletes_week', count(*) filter (where occurred_at >= v_week and action = 'DELETE'),
        'actors_week', count(distinct actor_id) filter (where occurred_at >= v_week)
      ) from public.audit_log),
    'by_action', coalesce((select jsonb_agg(jsonb_build_object('name', a, 'count', n) order by n desc) from (
        select case action when 'INSERT' then 'إضافة' when 'UPDATE' then 'تعديل' when 'DELETE' then 'حذف' else action end a, count(*) n
          from public.audit_log where occurred_at >= v_week group by 1) t), '[]'::jsonb),
    'by_table', coalesce((select jsonb_agg(jsonb_build_object('name', table_name, 'count', n) order by n desc) from (
        select table_name, count(*) n from public.audit_log
         where occurred_at >= v_week and table_name is not null group by table_name) t), '[]'::jsonb),
    'top_actors', coalesce((select jsonb_agg(jsonb_build_object('name', actor_name, 'role', actor_role, 'count', n) order by n desc) from (
        select actor_name, max(actor_role) actor_role, count(*) n from public.audit_log
         where occurred_at >= v_week and actor_name is not null group by actor_name order by n desc limit 8) t), '[]'::jsonb),
    'daily', (select jsonb_agg(jsonb_build_object('day', to_char(d, 'YYYY-MM-DD'),
        'changes', (select count(*) from public.audit_log a where a.occurred_at >= d and a.occurred_at < d + interval '1 day' and a.action in ('INSERT','UPDATE','DELETE')),
        'logins', (select count(*) from public.audit_log a where a.occurred_at >= d and a.occurred_at < d + interval '1 day' and a.action = 'تسجيل دخول')
      ) order by d)
      from generate_series(v_today - interval '13 days', v_today, interval '1 day') d)
  ) into v_result;
  return v_result;
end $$;

revoke all on function public.report_activity() from public, anon;
grant execute on function public.report_activity() to authenticated, service_role;

do $$ begin raise notice '✅ هجرة 17: تقرير النشاط جاهز'; end $$;
