-- =====================================================================
-- مِرقاة — 07: سجل التدقيق (Audit Log)
-- ⚠️ الفرق الجوهري: كان logAudit_ يُستدعى يدويًا من كل دالة (ويُنسى أحيانًا، ويسبب قفلًا
-- متداخلًا). هنا تريجر داخل القاعدة يسجّل كل إضافة/تعديل/حذف تلقائيًا، أيًا كان مصدره.
-- =====================================================================

create table public.audit_log (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  actor_id     uuid,                 -- حساب Supabase (فارغ = النظام أو سجل منقول)
  actor_code   text,                 -- EmpId / Students_id
  actor_name   text,
  actor_role   text,
  action       text not null,        -- INSERT / UPDATE / DELETE أو وصف عربي للسجلات المنقولة
  table_name   text,
  record_id    text,
  details      text,
  old_data     jsonb,
  new_data     jsonb,
  source_row   integer
);
create index audit_log_occurred_idx on public.audit_log (occurred_at desc);
create index audit_log_actor_idx on public.audit_log (actor_code, occurred_at desc);
create index audit_log_record_idx on public.audit_log (table_name, record_id);

create or replace function app.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_code  text;
  v_name  text;
  v_role  text;
  v_id    text;
begin
  if app.is_migrating() then
    return coalesce(new, old);
  end if;

  if v_uid is not null then
    select coalesce(e.code, s.code), coalesce(e.name_ar, s.name_ar), p.role::text
      into v_code, v_name, v_role
      from public.profiles p
      left join public.employees e on e.id = p.employee_id
      left join public.students  s on s.id = p.student_id
     where p.id = v_uid;
  end if;

  v_id := coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id',
                   to_jsonb(new) ->> 'assessment_id', to_jsonb(old) ->> 'assessment_id',
                   to_jsonb(new) ->> 'key', to_jsonb(old) ->> 'key');

  insert into public.audit_log (actor_id, actor_code, actor_name, actor_role, action, table_name, record_id, old_data, new_data)
  values (v_uid, v_code, coalesce(v_name, case when v_uid is null then 'النظام' end), v_role,
          tg_op, tg_table_name, v_id,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- الجداول المراقبة. form_attempts وattempt_answers غير مراقبة عمدًا: هي نفسها سجل لا يُعدَّل،
-- وحجمها الأكبر بالنظام. login_attempts وprofiles.last_seen_at كذلك (ضوضاء بلا قيمة).
do $$
declare t text;
begin
  foreach t in array array[
    'students', 'employees', 'staff_scope', 'profiles',
    'classes', 'subject_matrix', 'grade_weights', 'app_settings',
    'calendar_entries', 'timetable_slots', 'exam_schedule',
    'assessments', 'form_details', 'form_questions', 'question_options',
    'grade_entries', 'grade_visibility',
    'content_items', 'period_links', 'attendance_records', 'behavior_records'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_row()',
      t || '_audit', t);
  end loop;
end $$;

-- تحديثات last_seen_at / last_login_at وحدها لا تُسجَّل في التدقيق
create or replace function app.profiles_audit_filter() returns trigger
language plpgsql as $$
begin
  return new;
end $$;
drop trigger profiles_audit on public.profiles;
create trigger profiles_audit after insert or delete on public.profiles
  for each row execute function app.audit_row();
create trigger profiles_audit_update after update on public.profiles
  for each row
  when ((to_jsonb(old) - 'last_seen_at' - 'last_login_at' - 'updated_at')
        is distinct from (to_jsonb(new) - 'last_seen_at' - 'last_login_at' - 'updated_at'))
  execute function app.audit_row();
drop function app.profiles_audit_filter();
