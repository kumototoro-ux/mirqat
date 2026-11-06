-- =====================================================================
-- هجرة 39: مدير الفروع + مراقب أداء الفروع + تقارير الأداء
--  • منصبان جديدان على نفس طبقة المناصب (فروعهما المسندة هي نطاقهما)
--  • قاعدة الرتبة: لا يدير حساب/سجل موظف إلا من رتبته أعلى من رتبة الهدف
--    (مدير الفروع > مدير الفرع = المراقب > الباقون) — يمنع أن يستولي مدير فرع على حساب زميله أو مدير فروع
--  • تقرير الأداء: نموذج ثابت (أقسام وبنود)، تقييم رباعي + «لا ينطبق»، مرفقات، إرسال داخل الموقع لمدير الفروع المسند له الفرع نفسه
--    المراقب يرى تقاريره فقط، ومدير الفروع يرى المُرسَل لفروعه، والإداري الكل. مدير الفرع لا يراها.
-- =====================================================================

alter table public.branches add column if not exists has_building boolean not null default false;
comment on column public.branches.has_building is 'للفرع مبنى دراسي: تظهر بنود المبنى والبيئة في تقرير الأداء';

create or replace function public.admin_set_branch_building(p_branch smallint, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  update public.branches set has_building = p_on where id = p_branch;
  if not found then raise exception 'الفرع غير موجود'; end if;
end $$;
revoke all on function public.admin_set_branch_building(smallint, boolean) from public, anon;
grant execute on function public.admin_set_branch_building(smallint, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- المنصبان وقدراتهما
-- ---------------------------------------------------------------------
insert into public.cap_areas (area, name_ar, sort) values ('performance', 'تقارير الأداء', 13);
insert into public.positions (code, name_ar, name_f, sort) values
  ('branches_director', 'مدير الفروع', 'مديرة الفروع', 6),
  ('performance_monitor', 'مراقب أداء الفروع', 'مراقبة أداء الفروع', 7);
insert into public.position_caps (position, area, level) values
  ('branches_director','students',3), ('branches_director','student_accounts',3), ('branches_director','employees',2), ('branches_director','employee_accounts',2),
  ('branches_director','schedule',2), ('branches_director','attendance',2), ('branches_director','behavior',2), ('branches_director','tasks',1),
  ('branches_director','grading',1), ('branches_director','results',2), ('branches_director','certificates',2), ('branches_director','reports',1),
  ('branches_director','performance',2),
  ('performance_monitor','students',1), ('performance_monitor','employees',1), ('performance_monitor','schedule',1), ('performance_monitor','attendance',1),
  ('performance_monitor','behavior',1), ('performance_monitor','tasks',1), ('performance_monitor','grading',1), ('performance_monitor','results',1),
  ('performance_monitor','certificates',1), ('performance_monitor','reports',1), ('performance_monitor','performance',3);

-- ---------------------------------------------------------------------
-- قاعدة الرتبة
-- ---------------------------------------------------------------------
create or replace function app.pos_rank(p_emp bigint) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(max(case position when 'branches_director' then 3 when 'branch_manager' then 2 when 'performance_monitor' then 2 else 0 end), 0)
    from public.employee_positions where employee_id = p_emp
$$;
revoke all on function app.pos_rank(bigint) from public, anon;
grant execute on function app.pos_rank(bigint) to authenticated;

create or replace function app.emp_cap(p_area text, p_min integer, p_emp bigint, p_all boolean) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_br smallint[]; v_ok boolean;
begin
  if app.is_admin() then return true; end if;
  if app.my_role() is null then return false; end if;
  if not exists (select 1 from public.employees where id = p_emp and user_type = 'teacher') then return false; end if;
  -- الكتابة: رتبتي أعلى من رتبة الهدف (لا يمسّ مدير فرع زميله ولا مدير الفروع)
  if p_min >= 2 and app.pos_rank(app.my_employee_id()) <= app.pos_rank(p_emp) then return false; end if;
  v_br := app.employee_branches(p_emp);
  if cardinality(v_br) = 0 then return false; end if;
  if p_all then
    select bool_and(app.cap_level(p_area, b) >= p_min) into v_ok from unnest(v_br) b;
  else
    select bool_or(app.cap_level(p_area, b) >= p_min) into v_ok from unnest(v_br) b;
  end if;
  return coalesce(v_ok, false);
end $$;

-- ---------------------------------------------------------------------
-- نموذج التقرير الثابت
-- ---------------------------------------------------------------------
create table public.perf_sections (
  code          text primary key,
  name_ar       text not null,
  building_only boolean not null default false,
  sort          smallint not null
);
create table public.perf_items (
  code     text primary key,
  section  text not null references public.perf_sections(code) on delete cascade,
  title_ar text not null,
  sort     smallint not null
);
insert into public.perf_sections (code, name_ar, building_only, sort) values
  ('building', 'المبنى والبيئة المدرسية', true, 1), ('discipline', 'الانضباط والحضور', false, 2), ('teaching', 'العملية التعليمية', false, 3),
  ('staff', 'الكادر', false, 4), ('students', 'الطلاب والسلوك', false, 5), ('admin', 'الإدارة والعمل الإداري', false, 6);
insert into public.perf_items (code, section, title_ar, sort) values
  ('b_clean', 'building', 'نظافة الفصول والممرات', 1), ('b_wc', 'building', 'نظافة دورات المياه وجاهزيتها', 2),
  ('b_safety', 'building', 'السلامة والأمن (المخارج، الطفايات، الإسعافات الأولية)', 3), ('b_air', 'building', 'الإضاءة والتكييف والتهوية', 4),
  ('b_furn', 'building', 'الأثاث والتجهيزات والوسائل', 5), ('b_yard', 'building', 'الساحات والمرافق (المصلى، المقصف، الملاعب)', 6),
  ('b_maint', 'building', 'الصيانة وسرعة معالجة الأعطال', 7),
  ('d_students', 'discipline', 'حضور الطلاب', 1), ('d_staff', 'discipline', 'حضور الموظفين والمعلمين', 2),
  ('d_line', 'discipline', 'الطابور والانضباط العام', 3), ('d_late', 'discipline', 'الاستئذان والتأخر', 4), ('d_duty', 'discipline', 'المناوبة والإشراف اليومي', 5),
  ('t_schedule', 'teaching', 'انتظام الحصص والجدول', 1), ('t_prep', 'teaching', 'التحضير في المنصة', 2), ('t_grading', 'teaching', 'رصد الدرجات ونشر المهام', 3),
  ('t_visits', 'teaching', 'الزيارات الصفية وجودة الشرح', 4), ('t_activities', 'teaching', 'الأنشطة والإثراءات', 5),
  ('s_commit', 'staff', 'الالتزام والمظهر', 1), ('s_team', 'staff', 'التعاون والعمل الجماعي', 2), ('s_training', 'staff', 'احتياج التدريب', 3), ('s_gaps', 'staff', 'الشواغر أو النقص في الكادر', 4),
  ('u_behavior', 'students', 'السلوك العام للطلاب', 1), ('u_cases', 'students', 'متابعة الحالات الخاصة', 2), ('u_init', 'students', 'المبادرات والأنشطة الطلابية', 3),
  ('a_records', 'admin', 'سجلات الطلاب والقبول', 1), ('a_parents', 'admin', 'التواصل مع أولياء الأمور', 2),
  ('a_circulars', 'admin', 'الالتزام بالتعاميم والاجتماعات', 3), ('a_platform', 'admin', 'استخدام منصة مِرقاة', 4);

-- ---------------------------------------------------------------------
-- التقارير
-- ---------------------------------------------------------------------
create table public.perf_reports (
  id              bigint generated always as identity primary key,
  branch_id       smallint not null references public.branches(id),
  term_id         smallint references public.terms(id),
  visit_type      text not null default 'field' check (visit_type in ('field', 'remote')),
  visit_date      date not null default current_date,
  status          text not null default 'draft' check (status in ('draft', 'sent', 'acknowledged')),
  author_id       bigint not null references public.employees(id),
  has_building    boolean not null default false,
  strengths       text check (char_length(strengths) <= 4000),
  improvements    text check (char_length(improvements) <= 4000),
  recommendations text check (char_length(recommendations) <= 4000),
  actions         text check (char_length(actions) <= 4000),
  overall_pct     numeric(5,2),
  sent_at         timestamptz,
  ack_by          bigint references public.employees(id),
  ack_at          timestamptz,
  director_reply  text check (char_length(director_reply) <= 2000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index perf_reports_branch_idx on public.perf_reports (branch_id, status);
create index perf_reports_author_idx on public.perf_reports (author_id);
create trigger perf_reports_touch before update on public.perf_reports for each row execute function app.touch_updated_at();

-- التقييم: 4 ممتاز، 3 جيد، 2 يحتاج تحسين، 1 ضعيف، 0 لا ينطبق
create table public.perf_scores (
  report_id bigint not null references public.perf_reports(id) on delete cascade,
  item_code text   not null references public.perf_items(code),
  rating    smallint not null check (rating between 0 and 4),
  note      text check (char_length(note) <= 1000),
  primary key (report_id, item_code)
);
create table public.perf_attachments (
  id         bigint generated always as identity primary key,
  report_id  bigint not null references public.perf_reports(id) on delete cascade,
  section    text references public.perf_sections(code),
  name       text not null check (char_length(name) between 1 and 150),
  path       text not null unique,
  mime       text,
  size_bytes integer check (size_bytes between 1 and 10485760),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index perf_attachments_report_idx on public.perf_attachments (report_id);
create table public.perf_reads (
  report_id   bigint not null references public.perf_reports(id) on delete cascade,
  employee_id bigint not null references public.employees(id) on delete cascade,
  read_at     timestamptz not null default now(),
  primary key (report_id, employee_id)
);

-- هل أنا مراقب هذا الفرع (أو إداري)؟ وهل أنا مدير فروعه؟
create or replace function app.perf_is_monitor(p_branch smallint) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_admin() or (app.my_role() is not null and exists (
    select 1 from public.employee_positions ep
     where ep.employee_id = app.my_employee_id() and ep.position = 'performance_monitor' and ep.branch_id = p_branch))
$$;
create or replace function app.perf_is_director(p_branch smallint) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.my_role() is not null and exists (
    select 1 from public.employee_positions ep
     where ep.employee_id = app.my_employee_id() and ep.position = 'branches_director' and ep.branch_id = p_branch)
$$;
-- من يقرأ: الإداري، كاتب التقرير، أو مدير فروع الفرع بعد الإرسال (مدير الفرع لا يقرأ)
create or replace function app.perf_can_read(p_branch smallint, p_author bigint, p_status text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_admin()
      or (p_author = app.my_employee_id() and app.my_role() is not null)
      or (p_status <> 'draft' and app.perf_is_director(p_branch))
$$;
revoke all on function app.perf_is_monitor(smallint), app.perf_is_director(smallint), app.perf_can_read(smallint, bigint, text) from public, anon;
grant execute on function app.perf_is_monitor(smallint), app.perf_is_director(smallint), app.perf_can_read(smallint, bigint, text) to authenticated;

alter table public.perf_sections enable row level security;
alter table public.perf_items enable row level security;
alter table public.perf_reports enable row level security;
alter table public.perf_scores enable row level security;
alter table public.perf_attachments enable row level security;
alter table public.perf_reads enable row level security;
grant select on public.perf_sections, public.perf_items, public.perf_reports, public.perf_scores, public.perf_attachments, public.perf_reads to authenticated;
grant all on public.perf_sections, public.perf_items, public.perf_reports, public.perf_scores, public.perf_attachments, public.perf_reads to service_role;
create policy perf_sections_read on public.perf_sections for select to authenticated using ((select app.my_role()) is not null);
create policy perf_items_read on public.perf_items for select to authenticated using ((select app.my_role()) is not null);
create policy perf_reports_read on public.perf_reports for select to authenticated using (app.perf_can_read(branch_id, author_id, status));
create policy perf_scores_read on public.perf_scores for select to authenticated using (exists (select 1 from public.perf_reports r where r.id = report_id));
create policy perf_attachments_read on public.perf_attachments for select to authenticated using (exists (select 1 from public.perf_reports r where r.id = report_id));
create policy perf_reads_read on public.perf_reads for select to authenticated using ((select app.is_admin()) or employee_id = (select app.my_employee_id()));

create trigger perf_reports_audit after insert or update or delete on public.perf_reports for each row execute function app.audit_row();
create trigger perf_attachments_audit after insert or update or delete on public.perf_attachments for each row execute function app.audit_row();

-- النسبة الكلية: مجموع التقييمات ÷ (4 × عدد البنود المقيَّمة) — «لا ينطبق» لا يدخل
create or replace function app.perf_pct(p_report bigint, p_section text default null) returns numeric
language sql stable security definer set search_path = '' as $$
  select case when count(*) = 0 then null else round(sum(s.rating) * 100.0 / (4 * count(*)), 2) end
    from public.perf_scores s join public.perf_items i on i.code = s.item_code
   where s.report_id = p_report and s.rating > 0 and (p_section is null or i.section = p_section)
$$;
revoke all on function app.perf_pct(bigint, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- الدوال
-- ---------------------------------------------------------------------
create or replace function public.perf_form(p_branch smallint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_b boolean;
begin
  if not (app.perf_is_monitor(p_branch) or app.perf_is_director(p_branch)) then
    raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية في فرعه' using errcode = '42501';
  end if;
  select has_building into v_b from public.branches where id = p_branch;
  if not found then raise exception 'الفرع غير موجود'; end if;
  return jsonb_build_object('has_building', v_b, 'sections', coalesce((
    select jsonb_agg(jsonb_build_object('code', s.code, 'name', s.name_ar, 'items', (
             select jsonb_agg(jsonb_build_object('code', i.code, 'title', i.title_ar) order by i.sort) from public.perf_items i where i.section = s.code))
           order by s.sort)
      from public.perf_sections s where v_b or not s.building_only), '[]'::jsonb));
end $$;

-- الفروع التي أكتب لها تقارير (المراقب: فروعه، الإداري: الكل) مع مديري فروعها
create or replace function public.perf_my_branches() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'has_building', b.has_building,
           'directors', (select coalesce(jsonb_agg(distinct e.name_ar), '[]'::jsonb) from public.employee_positions ep join public.employees e on e.id = ep.employee_id
                          where ep.position = 'branches_director' and ep.branch_id = b.id)) order by b.sort_order, b.id), '[]'::jsonb)
    from public.branches b where b.is_active and app.perf_is_monitor(b.id)
$$;

create or replace function public.perf_save_report(p_id bigint, p jsonb) returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id bigint := p_id; v_branch smallint; v_r public.perf_reports; v_b boolean; v_type text := coalesce(p ->> 'visit_type', 'field');
  v_date date := coalesce(nullif(p ->> 'visit_date', '')::date, current_date); v_term smallint := nullif(p ->> 'term_id', '')::smallint;
  v_me bigint := app.my_employee_id(); x jsonb;
begin
  if v_me is null then raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية في فرعه' using errcode = '42501'; end if;
  if p_id is null then
    v_branch := (p ->> 'branch_id')::smallint;
  else
    select * into v_r from public.perf_reports where id = p_id;
    if not found then raise exception 'التقرير غير موجود'; end if;
    v_branch := v_r.branch_id;
    if v_r.status <> 'draft' then raise exception 'التقرير أُرسل ولا يُعدَّل'; end if;
    if v_r.author_id <> v_me and not app.is_admin() then raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية في فرعه' using errcode = '42501'; end if;
  end if;
  if v_branch is null or not app.perf_is_monitor(v_branch) then
    raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية في فرعه' using errcode = '42501';
  end if;
  select has_building into v_b from public.branches where id = v_branch;
  if not found then raise exception 'الفرع غير موجود'; end if;
  if v_type not in ('field', 'remote') then raise exception 'نوع المتابعة غير معروف'; end if;
  if v_date > current_date then raise exception 'تاريخ الزيارة لا يكون في المستقبل'; end if;
  if v_term is not null and not exists (select 1 from public.terms where id = v_term) then raise exception 'الفصل الدراسي غير موجود'; end if;
  if jsonb_typeof(coalesce(p -> 'scores', '[]'::jsonb)) <> 'array' then raise exception 'صيغة التقييمات غير صحيحة'; end if;

  if p_id is null then
    insert into public.perf_reports (branch_id, term_id, visit_type, visit_date, author_id, has_building, strengths, improvements, recommendations, actions)
    values (v_branch, v_term, v_type, v_date, v_me, v_b, nullif(btrim(p ->> 'strengths'), ''), nullif(btrim(p ->> 'improvements'), ''),
            nullif(btrim(p ->> 'recommendations'), ''), nullif(btrim(p ->> 'actions'), ''))
    returning id into v_id;
  else
    update public.perf_reports set term_id = v_term, visit_type = v_type, visit_date = v_date, has_building = v_b,
           strengths = nullif(btrim(p ->> 'strengths'), ''), improvements = nullif(btrim(p ->> 'improvements'), ''),
           recommendations = nullif(btrim(p ->> 'recommendations'), ''), actions = nullif(btrim(p ->> 'actions'), '')
     where id = p_id;
  end if;

  delete from public.perf_scores where report_id = v_id;
  for x in select * from jsonb_array_elements(coalesce(p -> 'scores', '[]'::jsonb)) loop
    if not exists (select 1 from public.perf_items i join public.perf_sections s on s.code = i.section
                    where i.code = x ->> 'item' and (v_b or not s.building_only)) then
      raise exception 'بند غير معروف أو لا ينطبق على هذا الفرع: %', x ->> 'item';
    end if;
    if (x ->> 'rating') is null or (x ->> 'rating')::int not between 0 and 4 then raise exception 'تقييم غير صحيح'; end if;
    insert into public.perf_scores (report_id, item_code, rating, note) values (v_id, x ->> 'item', (x ->> 'rating')::smallint, nullif(btrim(x ->> 'note'), ''));
  end loop;
  update public.perf_reports set overall_pct = app.perf_pct(v_id) where id = v_id;
  return v_id;
end $$;

-- الإرسال: كل بنود النموذج مقيَّمة (ولو «لا ينطبق»). يعيد عدد مديري الفروع المستلمين
create or replace function public.perf_send_report(p_id bigint) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_r public.perf_reports; v_need integer; v_have integer;
begin
  select * into v_r from public.perf_reports where id = p_id;
  if not found then raise exception 'التقرير غير موجود'; end if;
  if (v_r.author_id <> app.my_employee_id() and not app.is_admin()) or not app.perf_is_monitor(v_r.branch_id) then
    raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية في فرعه' using errcode = '42501';
  end if;
  if v_r.status <> 'draft' then raise exception 'التقرير أُرسل من قبل'; end if;
  select count(*) into v_need from public.perf_items i join public.perf_sections s on s.code = i.section where v_r.has_building or not s.building_only;
  select count(*) into v_have from public.perf_scores where report_id = p_id;
  if v_have < v_need then raise exception 'أكمل تقييم كل البنود قبل الإرسال (ناقص % بندًا)', v_need - v_have; end if;
  update public.perf_reports set status = 'sent', sent_at = now(), overall_pct = app.perf_pct(p_id) where id = p_id;
  return (select count(distinct employee_id)::int from public.employee_positions where position = 'branches_director' and branch_id = v_r.branch_id);
end $$;

create or replace function public.perf_delete_draft(p_id bigint) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_r public.perf_reports;
begin
  select * into v_r from public.perf_reports where id = p_id;
  if not found then raise exception 'التقرير غير موجود'; end if;
  if (v_r.author_id <> app.my_employee_id() and not app.is_admin()) or not app.perf_is_monitor(v_r.branch_id) then
    raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية في فرعه' using errcode = '42501';
  end if;
  if v_r.status <> 'draft' then raise exception 'لا يُحذف تقرير أُرسل'; end if;
  delete from public.perf_reports where id = p_id;
end $$;

-- قائمتي: المراقب تقاريره، مدير الفروع المُرسَل لفروعه (مع غير المقروء)، الإداري الكل
create or replace function public.perf_list() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'branch_id', r.branch_id, 'branch', b.name, 'status', r.status, 'visit_date', r.visit_date, 'visit_type', r.visit_type,
           'author', e.name_ar, 'mine', r.author_id = app.my_employee_id(), 'overall_pct', r.overall_pct, 'sent_at', r.sent_at, 'ack_at', r.ack_at,
           'unread', r.status = 'sent' and app.perf_is_director(r.branch_id) and not exists (select 1 from public.perf_reads d where d.report_id = r.id and d.employee_id = app.my_employee_id()))
         order by coalesce(r.sent_at, r.updated_at) desc), '[]'::jsonb)
    from public.perf_reports r join public.branches b on b.id = r.branch_id join public.employees e on e.id = r.author_id
   where app.perf_can_read(r.branch_id, r.author_id, r.status)
$$;

create or replace function public.perf_get(p_id bigint) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_r public.perf_reports; v_out jsonb;
begin
  select * into v_r from public.perf_reports where id = p_id;
  if not found or not app.perf_can_read(v_r.branch_id, v_r.author_id, v_r.status) then raise exception 'التقرير غير موجود أو ليس لك'; end if;
  if v_r.status <> 'draft' and app.perf_is_director(v_r.branch_id) then
    insert into public.perf_reads (report_id, employee_id) values (p_id, app.my_employee_id()) on conflict do nothing;
  end if;
  select jsonb_build_object(
    'id', v_r.id, 'branch_id', v_r.branch_id, 'branch', (select name from public.branches where id = v_r.branch_id), 'term_id', v_r.term_id,
    'visit_type', v_r.visit_type, 'visit_date', v_r.visit_date, 'status', v_r.status, 'has_building', v_r.has_building,
    'author', (select name_ar from public.employees where id = v_r.author_id), 'mine', v_r.author_id = app.my_employee_id(),
    'strengths', v_r.strengths, 'improvements', v_r.improvements, 'recommendations', v_r.recommendations, 'actions', v_r.actions,
    'overall_pct', coalesce(v_r.overall_pct, app.perf_pct(v_r.id)), 'sent_at', v_r.sent_at, 'ack_at', v_r.ack_at,
    'ack_by', (select name_ar from public.employees where id = v_r.ack_by), 'director_reply', v_r.director_reply,
    'can_edit', v_r.status = 'draft' and (v_r.author_id = app.my_employee_id() or app.is_admin()) and app.perf_is_monitor(v_r.branch_id),
    'can_ack', v_r.status = 'sent' and (app.perf_is_director(v_r.branch_id) or app.is_admin()),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object('code', s.code, 'name', s.name_ar, 'pct', app.perf_pct(v_r.id, s.code),
               'items', (select jsonb_agg(jsonb_build_object('code', i.code, 'title', i.title_ar, 'rating', sc.rating, 'note', sc.note) order by i.sort)
                           from public.perf_items i left join public.perf_scores sc on sc.item_code = i.code and sc.report_id = v_r.id where i.section = s.code))
             order by s.sort)
        from public.perf_sections s where v_r.has_building or not s.building_only), '[]'::jsonb),
    'attachments', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'section', a.section, 'name', a.name, 'mime', a.mime, 'size', a.size_bytes, 'path', a.path) order by a.id)
                               from public.perf_attachments a where a.report_id = v_r.id), '[]'::jsonb),
    'directors', (select coalesce(jsonb_agg(distinct e.name_ar), '[]'::jsonb) from public.employee_positions ep join public.employees e on e.id = ep.employee_id
                   where ep.position = 'branches_director' and ep.branch_id = v_r.branch_id)
  ) into v_out;
  return v_out;
end $$;

create or replace function public.perf_acknowledge(p_id bigint, p_reply text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_r public.perf_reports; v_reply text := nullif(btrim(p_reply), '');
begin
  select * into v_r from public.perf_reports where id = p_id;
  if not found then raise exception 'التقرير غير موجود'; end if;
  if not (app.perf_is_director(v_r.branch_id) or app.is_admin()) then
    raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية في فرعه' using errcode = '42501';
  end if;
  if v_r.status <> 'sent' then raise exception 'لا يُعتمد إلا تقرير مُرسَل لم يُعتمد بعد'; end if;
  update public.perf_reports set status = 'acknowledged', ack_by = app.my_employee_id(), ack_at = now(), director_reply = v_reply where id = p_id;
end $$;

-- المرفقات: يتحقق الخادم من الصلاحية، يرفع بمفتاح الخدمة، ثم يسجّل هنا (والتسجيل يتحقق ثانيةً)
create or replace function public.perf_can_edit(p_report bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perf_reports r where r.id = p_report and r.status = 'draft'
                    and (r.author_id = app.my_employee_id() or app.is_admin()) and app.perf_is_monitor(r.branch_id))
$$;
create or replace function public.perf_add_attachment(p_report bigint, p_section text, p_name text, p_path text, p_mime text, p_size integer) returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare v_id bigint;
begin
  if not public.perf_can_edit(p_report) then raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية في فرعه' using errcode = '42501'; end if;
  if p_path is null or p_path not like 'reports/' || p_report || '/%' then raise exception 'مسار الملف غير صحيح'; end if;
  if (select count(*) from public.perf_attachments where report_id = p_report) >= 30 then raise exception 'الحد الأقصى 30 مرفقًا للتقرير'; end if;
  if p_section is not null and not exists (select 1 from public.perf_sections where code = p_section) then raise exception 'قسم غير معروف'; end if;
  insert into public.perf_attachments (report_id, section, name, path, mime, size_bytes) values (p_report, p_section, left(btrim(p_name), 150), p_path, p_mime, p_size)
  returning id into v_id;
  return v_id;
end $$;
create or replace function public.perf_remove_attachment(p_id bigint) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_a public.perf_attachments;
begin
  select * into v_a from public.perf_attachments where id = p_id;
  if not found then raise exception 'المرفق غير موجود'; end if;
  if not public.perf_can_edit(v_a.report_id) then raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية في فرعه' using errcode = '42501'; end if;
  delete from public.perf_attachments where id = p_id;
  return v_a.path;
end $$;
-- هل أستطيع قراءة هذا المرفق (للرابط المؤقت)؟ يعيد مساره إن كان في تقرير أقرؤه
create or replace function public.perf_attachment_path(p_id bigint) returns text
language sql stable security definer set search_path = '' as $$
  select a.path from public.perf_attachments a join public.perf_reports r on r.id = a.report_id
   where a.id = p_id and app.perf_can_read(r.branch_id, r.author_id, r.status)
$$;

revoke all on function public.perf_form(smallint), public.perf_my_branches(), public.perf_save_report(bigint, jsonb), public.perf_send_report(bigint),
  public.perf_delete_draft(bigint), public.perf_list(), public.perf_get(bigint), public.perf_acknowledge(bigint, text), public.perf_can_edit(bigint),
  public.perf_add_attachment(bigint, text, text, text, text, integer), public.perf_remove_attachment(bigint), public.perf_attachment_path(bigint) from public, anon;
grant execute on function public.perf_form(smallint), public.perf_my_branches(), public.perf_save_report(bigint, jsonb), public.perf_send_report(bigint),
  public.perf_delete_draft(bigint), public.perf_list(), public.perf_get(bigint), public.perf_acknowledge(bigint, text), public.perf_can_edit(bigint),
  public.perf_add_attachment(bigint, text, text, text, text, integer), public.perf_remove_attachment(bigint), public.perf_attachment_path(bigint) to authenticated;

do $$ begin raise notice '✅ هجرة 39: مدير الفروع ومراقب الأداء وتقارير الأداء'; end $$;
