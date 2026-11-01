-- =====================================================================
-- هجرة 29: شهادات الشكر والتقدير
--   ستة أنواع: سلوك وانضباط · مواظبة وحضور · أنشطة وبحوث · تفوق في مادة · الأوائل · تقدير خاص (سبب يكتبه المُصدِر)
--   الإدارة: كل الأنواع. المعلم: المادة والأنشطة والتقدير الخاص — لطلاب نطاقه ومواده فقط.
--   الاستحقاق يُحسب في القاعدة عند الإصدار (لا نثق بأرقام الواجهة): أوائل الفرع وأوائل الحضور الخمسة فقط،
--   والسلوك يحتاج ملاحظة إيجابية واحدة على الأقل، والمادة والأنشطة تحتاج درجات مرصودة.
--   تُخزَّن المقاييس فقط ويُبنى نص الشهادة عند العرض، فيظهر اسم الطالب وفصله محدَّثَين دائمًا.
-- =====================================================================

create table public.appreciation_certs (
  id          bigint generated always as identity primary key,
  student_id  bigint not null references public.students(id) on delete cascade,
  type        text not null check (type in ('behavior', 'attendance', 'activities', 'subject', 'top', 'custom')),
  subject_id  smallint references public.subjects(id) on delete set null,
  term_id     smallint references public.terms(id) on delete set null,
  metrics     jsonb not null default '{}'::jsonb,
  reason      text check (reason is null or char_length(reason) between 3 and 300),
  issued_by   bigint references public.employees(id) on delete set null,
  issuer_name text,
  issued_at   timestamptz not null default now(),
  revoked_at  timestamptz,
  constraint appreciation_custom_reason check (type <> 'custom' or reason is not null)
);
-- لا تتكرر الشهادة نفسها (نوع/مادة/فصل) للطالب — إعادة الإصدار تحدّثها. التقدير الخاص يتكرر بأسباب مختلفة.
create unique index appreciation_certs_once on public.appreciation_certs (student_id, type, coalesce(subject_id, 0), coalesce(term_id, 0))
  where revoked_at is null and type <> 'custom';
create index appreciation_certs_student on public.appreciation_certs (student_id) where revoked_at is null;
create index appreciation_certs_issuer on public.appreciation_certs (issued_by, issued_at desc);
alter table public.appreciation_certs enable row level security;
revoke all on public.appreciation_certs from anon, authenticated;
create trigger appreciation_certs_audit after insert or update or delete on public.appreciation_certs
  for each row execute function app.audit_row();

/* فصول المدى: فصل محدد، أو كل فصول العام الدراسي الحالي */
create or replace function app.cert_terms(p_term smallint) returns smallint[]
language sql stable security definer set search_path = '' as $$
  select case when p_term is not null then array[p_term]
    else coalesce((select array_agg(t.id) from public.terms t
                    where t.academic_year_id = (select t2.academic_year_id from public.terms t2 where t2.id = app.current_term())), '{}') end
$$;

/* أوائل الفرع (top: نسبة كل الدرجات المرصودة، 3 رصود فأكثر) أو أوائل الحضور (attendance: 5 حصص فأكثر) — الخمسة الأوائل */
create or replace function app.cert_ranking(p_kind text, p_branch smallint, p_term smallint)
returns table (rk int, sid bigint, pct int, cnt int, absent int, late int)
language sql stable security definer set search_path = '' as $$
  with st as (
    select s.id from public.students s join public.classes c on c.id = s.class_id
     where c.branch_id = p_branch and s.status = 'active'
  ), tm as (select unnest(app.cert_terms(p_term)) as id),
  g as (
    select ge.student_id as s_id, sum(ge.score) as e, sum(ge.max_score) as m, count(*) as n
      from public.grade_entries ge join public.assessments a on a.id = ge.assessment_id
     where p_kind = 'top' and ge.student_id in (select id from st) and a.term_id in (select id from tm)
       and ge.score is not null and ge.max_score > 0
     group by ge.student_id having count(*) >= 3
  ), at as (
    select ar.student_id as s_id, count(*) as t,
           count(*) filter (where s.name like '%غائب%' or s.name like '%غياب%') as ab,
           count(*) filter (where s.name like '%متأخر%' or s.name like '%تأخر%') as la
      from public.attendance_records ar
      join public.attendance_statuses s on s.id = ar.status_id
      join public.school_weeks w on w.week_id = ar.week_id
     where p_kind = 'attendance' and ar.student_id in (select id from st) and w.term_id in (select id from tm)
     group by ar.student_id having count(*) >= 5
  ), u as (
    select s_id, round(e * 100 / m)::int as p, n::int as n, 0 as ab, 0 as la from g
    union all
    select s_id, greatest(0, round(100 * (1 - (ab + 0.25 * la)::numeric / t)))::int, t::int, ab::int, la::int from at
  )
  select (row_number() over (order by u.p desc, u.ab, u.n desc, x.name_ar))::int, u.s_id, u.p, u.n, u.ab, u.la
    from u join public.students x on x.id = u.s_id
   order by 1
   limit 5
$$;

/* أنواع التقييم التي تُحسب «أنشطة وبحوث» */
create or replace function app.cert_activity_types() returns smallint[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(id), '{}') from public.eval_types
   where name like '%بحوث%' or name like '%تقارير%' or name like '%اوراق%' or name like '%أوراق%' or name like '%مشاركة%' or name like '%نشاط%' or name like '%أنشطة%'
$$;

/* يتحقق من الصلاحية والاستحقاق ويحسب المقاييس — يرمي خطأً مفهومًا إن لم يُستحق */
create or replace function app.cert_compute(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_type    text := p ->> 'type';
  v_sid     bigint := nullif(p ->> 'student_id', '')::bigint;
  v_term    smallint := nullif(p ->> 'term_id', '')::smallint;
  v_subject smallint := nullif(p ->> 'subject_id', '')::smallint;
  v_reason  text := nullif(btrim(coalesce(p ->> 'reason', '')), '');
  v_admin   boolean := app.is_admin();
  v_class   int;
  v_branch  smallint;
  v_terms   smallint[] := app.cert_terms(v_term);
  v_m       jsonb := '{}'::jsonb;
  r         record;
  v_subs    smallint[];
begin
  if not app.is_staff() then raise exception 'FORBIDDEN'; end if;
  if v_type is null or v_type not in ('behavior', 'attendance', 'activities', 'subject', 'top', 'custom') then raise exception 'نوع الشهادة غير معروف'; end if;
  if not v_admin and v_type not in ('subject', 'activities', 'custom') then raise exception 'FORBIDDEN: هذا النوع من الشهادات للإدارة فقط'; end if;
  select s.class_id, c.branch_id into v_class, v_branch from public.students s join public.classes c on c.id = s.class_id
   where s.id = v_sid and s.status = 'active';
  if not found then raise exception 'الطالب غير موجود'; end if;
  if not app.staff_can_access(v_class, null) then raise exception 'FORBIDDEN: هذا الطالب خارج نطاق صلاحيتك'; end if;
  if v_type <> 'custom' then v_reason := null; end if;

  if v_type = 'behavior' then
    v_subject := null;
    select count(*) filter (where s.name like '%إيجاب%' or s.name like '%ايجاب%') as pos,
           count(*) filter (where s.name like '%سلب%') as neg, count(*) as total
      into r
      from public.behavior_records b join public.behavior_statuses s on s.id = b.status_id
     where b.student_id = v_sid and b.term_id = any(v_terms);
    if r.total = 0 then raise exception 'لا توجد سجلات سلوك لهذا الطالب في المدة المختارة'; end if;
    if r.pos < 1 then raise exception 'لا توجد ملاحظات سلوك إيجابية لهذا الطالب — لا تُصدر شهادة سلوك'; end if;
    v_m := jsonb_build_object('positive', r.pos, 'negative', r.neg, 'total', r.total);

  elsif v_type in ('attendance', 'top') then
    v_subject := null;
    select * into r from app.cert_ranking(v_type, v_branch, v_term) x where x.sid = v_sid;
    if not found then
      raise exception '%', case when v_type = 'top' then 'الطالب ليس ضمن الخمسة الأوائل على فرعه في المدة المختارة'
                                 else 'الطالب ليس ضمن الخمسة الأوائل في الحضور على فرعه في المدة المختارة' end;
    end if;
    v_m := jsonb_build_object('rank', r.rk, 'pct', r.pct, 'n', r.cnt);
    if v_type = 'attendance' then v_m := v_m || jsonb_build_object('absent', r.absent, 'late', r.late); end if;

  elsif v_type = 'subject' then
    if v_subject is null then raise exception 'اختر المادة'; end if;
    if not app.staff_can_access(v_class, v_subject) then raise exception 'FORBIDDEN: هذه المادة ليست ضمن صلاحيتك لهذا الطالب'; end if;
    select sum(ge.score) as e, sum(ge.max_score) as m, count(*) as n into r
      from public.grade_entries ge join public.assessments a on a.id = ge.assessment_id
     where ge.student_id = v_sid and a.subject_id = v_subject and a.term_id = any(v_terms) and ge.score is not null and ge.max_score > 0;
    if coalesce(r.n, 0) = 0 then raise exception 'لا توجد درجات مرصودة لهذا الطالب في المادة'; end if;
    v_m := jsonb_build_object('pct', round(r.e * 100 / r.m), 'n', r.n);

  elsif v_type = 'activities' then
    select sum(ge.score) as e, sum(ge.max_score) as m, count(*) as n into r
      from public.grade_entries ge join public.assessments a on a.id = ge.assessment_id
     where ge.student_id = v_sid and a.term_id = any(v_terms) and a.eval_type_id = any(app.cert_activity_types())
       and ge.score is not null and ge.max_score > 0
       and (v_admin or (a.teacher_id = app.my_employee_id() and app.staff_can_access(a.class_id, a.subject_id)));
    if coalesce(r.n, 0) = 0 then
      raise exception '%', 'لا توجد أنشطة أو بحوث مرصودة لهذا الطالب' || case when v_admin then '' else ' من رصدك' end;
    end if;
    select array_agg(distinct a.subject_id) into v_subs
      from public.grade_entries ge join public.assessments a on a.id = ge.assessment_id
     where ge.student_id = v_sid and a.term_id = any(v_terms) and a.eval_type_id = any(app.cert_activity_types())
       and ge.score is not null and ge.max_score > 0
       and (v_admin or a.teacher_id = app.my_employee_id());
    v_subject := case when cardinality(v_subs) = 1 then v_subs[1] end;
    v_m := jsonb_build_object('pct', round(r.e * 100 / r.m), 'n', r.n);

  else -- custom
    if v_reason is null or char_length(v_reason) < 3 then raise exception 'اكتب سبب التقدير'; end if;
    if char_length(v_reason) > 300 then raise exception 'سبب التقدير أطول من 300 حرف'; end if;
    if v_subject is not null and not app.staff_can_access(v_class, v_subject) then raise exception 'FORBIDDEN: هذه المادة ليست ضمن صلاحيتك لهذا الطالب'; end if;
    if not v_admin and v_subject is null then raise exception 'اختر المادة'; end if;
  end if;

  return jsonb_build_object('student_id', v_sid, 'type', v_type, 'subject_id', v_subject, 'term_id', v_term, 'metrics', v_m, 'reason', v_reason);
end $$;

/* بيانات العرض: الطالب وفصله ومادته وفصله الدراسي والمُصدِر — json يحفظ ترتيب المفاتيح */
create or replace function app.cert_view(c public.appreciation_certs) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'id', c.id, 'type', c.type, 'student_id', s.id, 'student', s.name_ar, 'student_en', s.name_en, 'code', s.code,
    'gender', case when s.gender like '%أنث%' or s.gender like '%انث%' or lower(coalesce(s.gender, '')) like 'f%' then 'F' else 'M' end,
    'class_label', concat_ws(' / ', g.name, sec.name), 'branch', b.name, 'branch_id', b.id,
    'subject', sub.name, 'subject_id', c.subject_id, 'term', t.name, 'term_id', c.term_id, 'year', y.name,
    'metrics', c.metrics, 'reason', c.reason,
    'issuer', coalesce(e.name_ar, c.issuer_name), 'issuer_role', case when e.user_type = 'admin' or e.id is null then null
       when e.gender like '%أنث%' or e.gender like '%انث%' then 'المعلمة' else 'المعلم' end,
    'issued_by', c.issued_by, 'issued_at', c.issued_at)
  from public.students s
  left join public.classes cl on cl.id = s.class_id
  left join public.grades g on g.id = cl.grade_id
  left join public.sections sec on sec.id = cl.section_id
  left join public.branches b on b.id = cl.branch_id
  left join public.subjects sub on sub.id = c.subject_id
  left join public.terms t on t.id = c.term_id
  left join public.academic_years y on y.id = coalesce(t.academic_year_id, (select t2.academic_year_id from public.terms t2 where t2.id = app.current_term()))
  left join public.employees e on e.id = c.issued_by
  where s.id = c.student_id
$$;

/* معاينة قبل الإصدار (لا تحفظ) */
create or replace function public.cert_preview(p jsonb) returns json
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb := app.cert_compute(p); c public.appreciation_certs;
begin
  c.id := null; c.type := v ->> 'type'; c.student_id := (v ->> 'student_id')::bigint;
  c.subject_id := nullif(v ->> 'subject_id', '')::smallint; c.term_id := nullif(v ->> 'term_id', '')::smallint;
  c.metrics := v -> 'metrics'; c.reason := v ->> 'reason'; c.issued_by := app.my_employee_id(); c.issued_at := now();
  return app.cert_view(c);
end $$;

/* الإصدار: يحدّث الشهادة نفسها إن صدرت من قبل (نفس الطالب/النوع/المادة/الفصل) */
create or replace function public.cert_issue(p jsonb) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare v jsonb := app.cert_compute(p); c public.appreciation_certs; v_emp bigint := app.my_employee_id();
begin
  if v ->> 'type' <> 'custom' then
    update public.appreciation_certs x
       set metrics = v -> 'metrics', issued_by = v_emp, issuer_name = (select name_ar from public.employees where id = v_emp), issued_at = now()
     where x.student_id = (v ->> 'student_id')::bigint and x.type = v ->> 'type' and x.revoked_at is null
       and coalesce(x.subject_id, 0) = coalesce(nullif(v ->> 'subject_id', '')::smallint, 0)
       and coalesce(x.term_id, 0) = coalesce(nullif(v ->> 'term_id', '')::smallint, 0)
       and (app.is_admin() or x.issued_by = v_emp)
    returning * into c;
    if not found and exists (
      select 1 from public.appreciation_certs x
       where x.student_id = (v ->> 'student_id')::bigint and x.type = v ->> 'type' and x.revoked_at is null
         and coalesce(x.subject_id, 0) = coalesce(nullif(v ->> 'subject_id', '')::smallint, 0)
         and coalesce(x.term_id, 0) = coalesce(nullif(v ->> 'term_id', '')::smallint, 0)) then
      raise exception 'صدرت هذه الشهادة لهذا الطالب من معلم آخر';
    end if;
  end if;
  if c.id is null then
    insert into public.appreciation_certs (student_id, type, subject_id, term_id, metrics, reason, issued_by, issuer_name)
    values ((v ->> 'student_id')::bigint, v ->> 'type', nullif(v ->> 'subject_id', '')::smallint, nullif(v ->> 'term_id', '')::smallint,
            v -> 'metrics', v ->> 'reason', v_emp, (select name_ar from public.employees where id = v_emp))
    returning * into c;
  end if;
  return app.cert_view(c);
end $$;

/* أوائل الفرع/الحضور (الإدارة) مع حالة «صدرت» */
create or replace function public.cert_top(p_kind text, p_branch smallint, p_term smallint) returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_admin();
  if p_kind not in ('top', 'attendance') then raise exception 'نوع غير معروف'; end if;
  return coalesce((
    select json_agg(json_build_object('rank', r.rk, 'student_id', r.sid, 'name', s.name_ar, 'code', s.code, 'class_label', concat_ws(' / ', g.name, sec.name),
             'pct', r.pct, 'n', r.cnt, 'absent', r.absent, 'late', r.late,
             'issued', exists (select 1 from public.appreciation_certs x where x.student_id = r.sid and x.type = p_kind and x.revoked_at is null
                                and coalesce(x.term_id, 0) = coalesce(p_term, 0))) order by r.rk)
      from app.cert_ranking(p_kind, p_branch, p_term) r
      join public.students s on s.id = r.sid
      join public.classes cl on cl.id = s.class_id join public.grades g on g.id = cl.grade_id join public.sections sec on sec.id = cl.section_id), '[]'::json);
end $$;

/* أفضل 3 في مادة ضمن نطاق المستخدم (اختياريًا لفصل واحد) */
create or replace function public.cert_subject_top(p_subject smallint, p_term smallint, p_class int default null) returns json
language plpgsql stable security definer set search_path = '' as $$
declare v_terms smallint[] := app.cert_terms(p_term);
begin
  if not app.is_staff() then raise exception 'FORBIDDEN'; end if;
  if p_subject is null then raise exception 'اختر المادة'; end if;
  return coalesce((
    with cls as (
      select c.id from public.classes c
       where (p_class is null or c.id = p_class) and app.staff_can_access(c.id, p_subject)
    ), agg as (
      select ge.student_id as s_id, sum(ge.score) as e, sum(ge.max_score) as m, count(*) as n
        from public.grade_entries ge join public.assessments a on a.id = ge.assessment_id
        join public.students s on s.id = ge.student_id
       where a.subject_id = p_subject and a.term_id = any(v_terms) and s.class_id in (select id from cls) and s.status = 'active'
         and ge.score is not null and ge.max_score > 0
       group by ge.student_id
    ), solid as (
      select *, round(e * 100 / m)::int as pct from agg
       where n >= 2 or (select count(*) from agg where n >= 2) < 3
    ), ranked as (
      select solid.*, row_number() over (order by pct desc, n desc, s.name_ar) as rk, s.name_ar, s.code, s.class_id
        from solid join public.students s on s.id = solid.s_id
    )
    select json_agg(json_build_object('rank', r.rk, 'student_id', r.s_id, 'name', r.name_ar, 'code', r.code,
             'class_label', concat_ws(' / ', g.name, sec.name), 'pct', r.pct, 'n', r.n,
             'issued', exists (select 1 from public.appreciation_certs x where x.student_id = r.s_id and x.type = 'subject' and x.subject_id = p_subject
                                and x.revoked_at is null and coalesce(x.term_id, 0) = coalesce(p_term, 0))) order by r.rk)
      from ranked r join public.classes cl on cl.id = r.class_id join public.grades g on g.id = cl.grade_id join public.sections sec on sec.id = cl.section_id
     where r.rk <= 3), '[]'::json);
end $$;

/* الشهادات الصادرة: الإدارة الكل، والمعلم ما أصدره هو — بحث بالاسم/الرمز ونوع وفرع، 12 في الصفحة */
create or replace function public.cert_list(p_q text default null, p_type text default null, p_branch smallint default null, p_offset int default 0, p_limit int default 12)
returns json
language plpgsql stable security definer set search_path = '' as $$
declare v_admin boolean := app.is_admin(); v_emp bigint := app.my_employee_id(); v_total int; v_rows json;
begin
  if not app.is_staff() then raise exception 'FORBIDDEN'; end if;
  with f as (
    select c.* from public.appreciation_certs c
      join public.students s on s.id = c.student_id
      left join public.classes cl on cl.id = s.class_id
     where c.revoked_at is null
       and (v_admin or c.issued_by = v_emp)
       and (p_type is null or c.type = p_type)
       and (p_branch is null or cl.branch_id = p_branch)
       and (coalesce(btrim(p_q), '') = '' or s.name_ar ilike '%' || btrim(p_q) || '%' or s.code ilike btrim(p_q) || '%')
  )
  select (select count(*) from f),
         (select coalesce(json_agg(app.cert_view(x) order by x.issued_at desc, x.id desc), '[]'::json)
            from (select * from f order by issued_at desc, id desc offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 60)) x)
    into v_total, v_rows;
  return json_build_object('total', v_total, 'rows', v_rows);
end $$;

/* إلغاء شهادة: الإدارة، أو المعلم لما أصدره — تختفي من صفحة الطالب */
create or replace function public.cert_revoke(p_id bigint) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.is_staff() then raise exception 'FORBIDDEN'; end if;
  update public.appreciation_certs set revoked_at = now()
   where id = p_id and revoked_at is null and (app.is_admin() or issued_by = app.my_employee_id());
  if not found then raise exception 'FORBIDDEN: الشهادة غير موجودة أو ليست من إصدارك'; end if;
end $$;

/* شهادات الطالب نفسه */
create or replace function public.my_appreciation_certs() returns json
language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(app.cert_view(c) order by c.issued_at desc), '[]'::json)
    from public.appreciation_certs c
   where c.student_id = app.my_student_id() and c.revoked_at is null
$$;

revoke all on function public.cert_preview(jsonb), public.cert_issue(jsonb), public.cert_top(text, smallint, smallint),
  public.cert_subject_top(smallint, smallint, int), public.cert_list(text, text, smallint, int, int), public.cert_revoke(bigint),
  public.my_appreciation_certs() from public, anon;
grant execute on function public.cert_preview(jsonb), public.cert_issue(jsonb), public.cert_top(text, smallint, smallint),
  public.cert_subject_top(smallint, smallint, int), public.cert_list(text, text, smallint, int, int), public.cert_revoke(bigint),
  public.my_appreciation_certs() to authenticated;
revoke all on function app.cert_compute(jsonb), app.cert_view(public.appreciation_certs), app.cert_ranking(text, smallint, smallint),
  app.cert_terms(smallint), app.cert_activity_types() from public, anon, authenticated;


-- تصفير البيانات: يحذف شهادات الشكر مع المهام والرصد (نسخة هجرة 27 + سطر الشهادات)
create or replace function public.admin_reset_data(p_branch smallint, p_parts text[], p_confirm text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  sc        record;
  v_me      uuid := auth.uid();
  v_users   uuid[] := '{}';
  v_task    text[] := '{}';   -- task-files (عام)
  v_sub     text[] := '{}';   -- submissions (خاص)
  v_counts  jsonb := '{}'::jsonb;
  v_n       int;
  v_backup  timestamptz;
  v_ass     bigint[];
  v_stu     bigint[];
begin
  perform app.require_admin();
  if p_confirm is distinct from 'تصفير' then raise exception 'اكتب كلمة التأكيد كما هي'; end if;
  if coalesce(cardinality(p_parts), 0) = 0 then raise exception 'اختر ما يُصفَّر'; end if;
  if p_branch is not null and (p_parts && array['employees', 'audit']) then
    raise exception 'الموظفون وسجل العمليات يُصفَّران لكل الفروع فقط';
  end if;
  -- لا تصفير بلا نسخة احتياطية حديثة (آخر 24 ساعة) لنفس النطاق أو لكل الفروع
  select (s.value ->> 'at')::timestamptz into v_backup from public.app_settings s
   where s.key = 'last_backup' and ((s.value ->> 'branch') is null or (s.value ->> 'branch')::smallint is not distinct from p_branch);
  if v_backup is null or v_backup < now() - interval '24 hours' then
    raise exception 'نزّل نسخة احتياطية لهذا النطاق أولًا (خلال آخر 24 ساعة)';
  end if;

  perform set_config('app.migrating', 'on', true);   -- بلا سجل عمليات لكل صف ولا حمايات التعديل أثناء التصفير
  select * into sc from app.reset_scope(p_branch);
  v_ass := case when 'assessments' = any(p_parts) or 'students' = any(p_parts) then sc.assessment_ids else '{}' end;
  v_stu := case when 'students' = any(p_parts) then sc.student_ids else '{}' end;

  -- الملفات التي ستُحذف من التخزين
  if 'assessments' = any(p_parts) then
    v_task := v_task || coalesce((select array_agg(x.storage_path) from public.assessment_attachments x where x.assessment_id = any(v_ass) and x.storage_path is not null), '{}')
                     || coalesce((select array_agg(substr(q.image_url, 9)) from public.form_questions q where q.assessment_id = any(v_ass) and q.image_url like 'storage:%'), '{}');
  end if;
  v_sub := coalesce((select array_agg(f.storage_path) from public.submission_files f join public.task_submissions t on t.id = f.submission_id
                      where (t.assessment_id = any(v_ass) and 'assessments' = any(p_parts)) or t.student_id = any(v_stu)), '{}')
        || coalesce((select array_agg(pu.storage_path) from public.pending_uploads pu
                      where (pu.assessment_id = any(v_ass) and 'assessments' = any(p_parts)) or pu.student_id = any(v_stu)), '{}');

  -- التحضير والسلوك (سجلات الطلاب المحذوفين تُحذف معهم دائمًا)
  if 'conduct' = any(p_parts) then
    delete from public.attendance_records ar where ar.class_id = any(sc.class_ids) or ar.student_id = any(sc.student_ids);
    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('attendance', v_n);
    delete from public.behavior_records br where br.student_id = any(sc.student_ids);
    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('behavior', v_n);
  elsif 'students' = any(p_parts) then
    delete from public.attendance_records ar where ar.student_id = any(v_stu);
    delete from public.behavior_records br where br.student_id = any(v_stu);
  end if;

  -- المهام والنماذج والرصد (للطلاب المحذوفين تُحذف درجاتهم ومحاولاتهم وتسليماتهم أيضًا)
  delete from public.grade_entries ge where ('assessments' = any(p_parts) and ge.assessment_id = any(v_ass)) or ge.student_id = any(v_stu);
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('grades', v_n);
  -- التحسينات جزء من الرصد: تُحذف مع المهام والرصد لطلاب النطاق (ومع الطلاب تلقائيًا)
  if 'assessments' = any(p_parts) then
    delete from public.grade_improvements gi where gi.student_id = any(sc.student_ids);
    -- شهادات الشكر مبنية على الرصد: تُحذف معه (ومع الطلاب تلقائيًا)
    delete from public.appreciation_certs ac where ac.student_id = any(sc.student_ids);
  end if;
  delete from public.form_attempts fa where ('assessments' = any(p_parts) and fa.assessment_id = any(v_ass)) or fa.student_id = any(v_stu);
  delete from public.task_submissions ts where ('assessments' = any(p_parts) and ts.assessment_id = any(v_ass)) or ts.student_id = any(v_stu);
  if 'assessments' = any(p_parts) then
    delete from public.attempt_answers aa using public.form_questions q where aa.question_id = q.id and q.assessment_id = any(v_ass);
    delete from public.assessments a where a.id = any(v_ass);
    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('assessments', v_n);
  end if;

  -- المحتوى
  if 'content' = any(p_parts) then
    v_task := v_task || coalesce((select array_agg(att ->> 'storage_path') from public.content_items ci, jsonb_array_elements(coalesce(ci.attachments, '[]')) att
                                   where ci.class_id = any(sc.class_ids) and att ->> 'storage_path' is not null), '{}');
    delete from public.content_items ci where ci.class_id = any(sc.class_ids);
    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('content', v_n);
  end if;

  -- الطلاب وحساباتهم
  if 'students' = any(p_parts) then
    select coalesce(array_agg(p.id), '{}') into v_users from public.profiles p where p.student_id = any(v_stu);
    delete from public.profiles p where p.student_id = any(v_stu);
    delete from public.students s where s.id = any(v_stu);
    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('students', v_n);
  end if;

  -- الموظفون (عدا الإدارة وحسابك)
  if 'employees' = any(p_parts) then
    v_users := v_users || coalesce((select array_agg(p.id) from public.profiles p join public.employees e on e.id = p.employee_id
                                    where e.user_type <> 'admin' and p.id <> v_me), '{}');
    delete from public.profiles p using public.employees e where e.id = p.employee_id and e.user_type <> 'admin' and p.id <> v_me;
    create temp table _gone on commit drop as
      select e.id from public.employees e where e.user_type <> 'admin' and not exists (select 1 from public.profiles p where p.employee_id = e.id);
    -- ما يبقى من سجلات تشير إليهم (الجداول، التقييمات الباقية…) يُفصل عنهم بدل أن يمنع الحذف
    update public.timetable_slots x set teacher_id = null where x.teacher_id in (select id from pg_temp._gone);
    update public.exam_schedule x set teacher_id = null where x.teacher_id in (select id from pg_temp._gone);
    update public.assessments x set teacher_id = null where x.teacher_id in (select id from pg_temp._gone);
    update public.grade_entries x set recorded_by = null where x.recorded_by in (select id from pg_temp._gone);
    update public.content_items x set teacher_id = null where x.teacher_id in (select id from pg_temp._gone);
    update public.period_links x set linked_by = null where x.linked_by in (select id from pg_temp._gone);
    update public.attendance_records x set recorded_by = null where x.recorded_by in (select id from pg_temp._gone);
    update public.behavior_records x set recorded_by = null where x.recorded_by in (select id from pg_temp._gone);
    update public.task_submissions x set graded_by = null where x.graded_by in (select id from pg_temp._gone);
    delete from public.employees e where e.id in (select id from pg_temp._gone);
    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('employees', v_n);
  end if;

  if 'audit' = any(p_parts) then
    delete from public.audit_log;
    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('audit', v_n);
  end if;

  -- سطر واحد في سجل العمليات بدل آلاف السطور
  insert into public.audit_log (actor_id, actor_name, actor_role, action, table_name, record_id, new_data)
  values (v_me, (select coalesce(e.name_ar, p.username) from public.profiles p left join public.employees e on e.id = p.employee_id where p.id = v_me),
          'admin', 'RESET', 'all', coalesce(p_branch::text, 'all'),
          jsonb_build_object('parts', p_parts, 'branch', p_branch, 'counts', v_counts));

  return jsonb_build_object('counts', v_counts, 'users', to_jsonb(v_users),
                            'files', jsonb_build_object('task-files', to_jsonb(v_task), 'submissions', to_jsonb(v_sub)));
end $$;

do $$ begin raise notice '✅ هجرة 29: شهادات الشكر والتقدير'; end $$;
