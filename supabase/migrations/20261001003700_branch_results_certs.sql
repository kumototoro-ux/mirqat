-- =====================================================================
-- هجرة 37: مناصب الفروع (دفعة 2ب-1) — النتائج وإتاحتها والشهادات
--  • النتائج: العرض لمن يملك «النتائج» ≥ 1 في فرع الطالب؛ وإتاحتها/حجبها (قواعد الإتاحة) لمن يملك ≥ 2
--    ضمن قواعد محصورة في فرعه حصرًا (لا مرحلة ولا صف ولا نطاق مفتوح) — الإداري كما كان
--  • الشهادات: الإصدار والإلغاء وأوائل الفرع لمن يملك «الشهادات» ≥ 2 في فرعه؛ والعرض ≥ 1
--  • منح المواظبة وتسميات الإشعار تبقى للإداري وحده
-- =====================================================================

-- هل القاعدة محصورة كلها في فروع أملك فيها مستوى النتائج المطلوب؟ (الإداري: دائمًا)
create or replace function app.rule_in_scope(p_br smallint[], p_st smallint[], p_gr smallint[], p_cl integer[], p_sd bigint[], p_min integer)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_admin() or (
    cardinality(coalesce(p_st, '{}')) = 0 and cardinality(coalesce(p_gr, '{}')) = 0
    and cardinality(coalesce(p_br, '{}')) + cardinality(coalesce(p_cl, '{}')) + cardinality(coalesce(p_sd, '{}')) > 0
    and not exists (select 1 from unnest(coalesce(p_br, '{}')) b where app.cap_level('results', b) < p_min)
    and not exists (select 1 from unnest(coalesce(p_cl, '{}')) c where app.cap_level('results', app.class_branch(c)) < p_min)
    and not exists (select 1 from unnest(coalesce(p_sd, '{}')) s where app.cap_level('results', app.student_branch(s)) < p_min))
$$;
revoke all on function app.rule_in_scope(smallint[], smallint[], smallint[], integer[], bigint[], integer) from public, anon;
grant execute on function app.rule_in_scope(smallint[], smallint[], smallint[], integer[], bigint[], integer) to authenticated;   -- تستعملها سياسة القراءة

drop policy if exists result_rules_read on public.result_release_rules;
create policy result_rules_read on public.result_release_rules for select to authenticated
  using ((select app.is_admin()) or app.rule_in_scope(branch_ids, stage_ids, grade_ids, class_ids, student_ids, 1));

create or replace FUNCTION public.class_results(p_class_id integer, p_term_id smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ids bigint[];
  v_rep jsonb;
begin
  perform app.require_cap('results', 1, app.class_branch(p_class_id));
  select coalesce(array_agg(id), '{}') into v_ids from public.students where class_id = p_class_id and status = 'active';
  v_rep := app.build_report(v_ids, p_term_id, false);
  return v_rep || jsonb_build_object(
    'access', coalesce((select jsonb_object_agg(i::text, app.result_access(i, p_term_id)) from unnest(v_ids) i), '{}'::jsonb));
end $function$;

create or replace FUNCTION public.student_report_card(p_student_id bigint, p_term_id smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rep jsonb;
begin
  perform app.require_cap('results', 1, app.student_branch(p_student_id));
  v_rep := app.build_report(array[p_student_id], p_term_id, true);
  return jsonb_build_object('status', 'ok', 'access', app.result_access(p_student_id, p_term_id), 'term', v_rep -> 'term',
                            'subjects', v_rep -> 'subjects', 'student', v_rep -> 'students' -> 0);
end $function$;

create or replace FUNCTION public.results_overview(p_term_id smallint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with ev as (
    select ge.student_id, a.subject_id, a.eval_type_id, sum(ge.score) as earned, sum(ge.max_score) as mx
      from public.grade_entries ge join public.assessments a on a.id = ge.assessment_id
     where a.term_id = p_term_id and coalesce(app.cap_any('results', 1), false)
     group by 1, 2, 3),
  ss as (
    select ev.student_id, ev.subject_id,
           sum(case when ev.mx > 0 then round(ev.earned / ev.mx * coalesce(w.weight, 0), 2) else 0 end) as total,
           sum(coalesce(w.weight, 0)) as rec_max
      from ev left join public.grade_weights w on w.subject_id = ev.subject_id and w.eval_type_id = ev.eval_type_id
     group by 1, 2),
  wt as (select subject_id, sum(weight) as mx from public.grade_weights where weight > 0 group by 1),
  sp as (
    select ss.student_id, avg(ss.total / wt.mx * 100) as pct,
           avg(case when ss.rec_max > 0 then ss.total / ss.rec_max * 100 end) as progress
      from ss join wt on wt.subject_id = ss.subject_id and wt.mx > 0
     group by 1),
  cls as (
    select s.class_id, count(*) as students, count(sp.pct) as graded, round(avg(sp.pct), 2) as average,
           round(avg(sp.progress), 2) as progress,
           count(*) filter (where app.results_visible(s.id, p_term_id)) as visible
      from public.students s left join sp on sp.student_id = s.id
     where s.status = 'active' and s.class_id is not null
       and s.class_id in (select c.id from public.classes c where c.branch_id in (select b.id from public.branches b where app.has_cap('results', 1, b.id)))
     group by s.class_id)
  select case when not coalesce(app.cap_any('results', 1), false) then null else
    coalesce(jsonb_agg(jsonb_build_object('class_id', class_id, 'students', students, 'graded', graded,
                                          'average', average, 'progress', progress, 'visible', visible)), '[]'::jsonb) end
    from cls
$function$;

create or replace FUNCTION public.release_rule_reach(p jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_br smallint[] := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'branch_ids', '[]')))::smallint[], '{}');
  v_st smallint[] := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'stage_ids', '[]')))::smallint[], '{}');
  v_gr smallint[] := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'grade_ids', '[]')))::smallint[], '{}');
  v_cl integer[]  := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'class_ids', '[]')))::integer[], '{}');
  v_sd bigint[]   := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'student_ids', '[]')))::bigint[], '{}');
  v_n integer;
begin
  if not app.rule_in_scope(v_br, v_st, v_gr, v_cl, v_sd, 2) then raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية في فرعه' using errcode = '42501'; end if;
  select count(*) into v_n
    from public.students s
    left join public.classes c on c.id = s.class_id
    left join public.grades g on g.id = c.grade_id
   where s.status = 'active'
     and ((cardinality(v_br) + cardinality(v_st) + cardinality(v_gr) + cardinality(v_cl) + cardinality(v_sd) = 0)
          or s.id = any(v_sd) or s.class_id = any(v_cl) or c.grade_id = any(v_gr)
          or g.stage_id = any(v_st) or c.branch_id = any(v_br));
  return v_n;
end $function$;

create or replace FUNCTION public.save_release_rule(p_id bigint, p jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_kind  text := coalesce(p ->> 'kind', 'block');
  v_open  timestamptz := nullif(p ->> 'opens_at', '')::timestamptz;
  v_close timestamptz := nullif(p ->> 'closes_at', '')::timestamptz;
  v_id    bigint;
  v_tm smallint[] := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'term_ids', '[]')))::smallint[], '{}');
  v_br smallint[] := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'branch_ids', '[]')))::smallint[], '{}');
  v_st smallint[] := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'stage_ids', '[]')))::smallint[], '{}');
  v_gr smallint[] := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'grade_ids', '[]')))::smallint[], '{}');
  v_cl integer[]  := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'class_ids', '[]')))::integer[], '{}');
  v_sd bigint[]   := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'student_ids', '[]')))::bigint[], '{}');
begin
  if not app.is_admin() then
    if not app.rule_in_scope(v_br, v_st, v_gr, v_cl, v_sd, 2) then raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية في فرعه' using errcode = '42501'; end if;
    if p_id is not null and not exists (select 1 from public.result_release_rules r where r.id = p_id
         and app.rule_in_scope(r.branch_ids, r.stage_ids, r.grade_ids, r.class_ids, r.student_ids, 2)) then raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية في فرعه' using errcode = '42501'; end if;
  end if;
  if v_kind not in ('block', 'allow') then raise exception 'نوع قاعدة غير معروف'; end if;
  if v_kind = 'allow' then v_open := null; v_close := null; end if;
  if v_open is not null and v_close is not null and v_close <= v_open then
    raise exception 'تاريخ إغلاق العرض يجب أن يكون بعد تاريخ الإتاحة';
  end if;
  if v_kind = 'allow' and cardinality(v_br) + cardinality(v_st) + cardinality(v_gr) + cardinality(v_cl) + cardinality(v_sd) = 0 then
    raise exception 'الإتاحة الاستثنائية تحتاج طالبًا أو فصلًا أو صفًا أو مرحلة أو فرعًا';
  end if;
  if exists (select 1 from unnest(v_sd) i where not exists (select 1 from public.students where id = i))
     or exists (select 1 from unnest(v_cl) i where not exists (select 1 from public.classes where id = i))
     or exists (select 1 from unnest(v_tm) i where not exists (select 1 from public.terms where id = i)) then
    raise exception 'بعض الاختيارات لم تعد موجودة — حدّث الصفحة';
  end if;

  if p_id is null then
    insert into public.result_release_rules (kind, term_ids, branch_ids, stage_ids, grade_ids, class_ids, student_ids,
                                             opens_at, closes_at, note, is_active)
    values (v_kind, v_tm, v_br, v_st, v_gr, v_cl, v_sd, v_open, v_close,
            nullif(btrim(p ->> 'note'), ''), coalesce((p ->> 'is_active')::boolean, true))
    returning id into v_id;
  else
    update public.result_release_rules
       set kind = v_kind, term_ids = v_tm, branch_ids = v_br, stage_ids = v_st, grade_ids = v_gr,
           class_ids = v_cl, student_ids = v_sd, opens_at = v_open, closes_at = v_close,
           note = nullif(btrim(p ->> 'note'), ''), is_active = coalesce((p ->> 'is_active')::boolean, is_active)
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'القاعدة غير موجودة'; end if;
  end if;
  return v_id;
end $function$;

create or replace FUNCTION public.set_release_rule_active(p_id bigint, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (app.is_admin() or exists (select 1 from public.result_release_rules r where r.id = p_id
       and app.rule_in_scope(r.branch_ids, r.stage_ids, r.grade_ids, r.class_ids, r.student_ids, 2))) then raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية في فرعه' using errcode = '42501'; end if;
  update public.result_release_rules set is_active = p_active where id = p_id;
  if not found then raise exception 'القاعدة غير موجودة'; end if;
end $function$;

create or replace FUNCTION public.delete_release_rule(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (app.is_admin() or exists (select 1 from public.result_release_rules r where r.id = p_id
       and app.rule_in_scope(r.branch_ids, r.stage_ids, r.grade_ids, r.class_ids, r.student_ids, 2))) then raise exception 'FORBIDDEN: هذه العملية للإدارة فقط أو لصاحب الصلاحية في فرعه' using errcode = '42501'; end if;
  delete from public.result_release_rules where id = p_id;
end $function$;

create or replace FUNCTION app.cert_compute(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_type    text := p ->> 'type';
  v_sid     bigint := nullif(p ->> 'student_id', '')::bigint;
  v_term    smallint := nullif(p ->> 'term_id', '')::smallint;
  v_subject smallint := nullif(p ->> 'subject_id', '')::smallint;
  v_reason  text := nullif(btrim(coalesce(p ->> 'reason', '')), '');
  v_admin   boolean;
  v_class   int;
  v_branch  smallint;
  v_terms   smallint[] := app.cert_terms(v_term);
  v_m       jsonb := '{}'::jsonb;
  r         record;
  v_subs    smallint[];
begin
  if not app.is_staff() then raise exception 'FORBIDDEN'; end if;
  if v_type is null or v_type not in ('behavior', 'attendance', 'activities', 'subject', 'top', 'custom') then raise exception 'نوع الشهادة غير معروف'; end if;
  select s.class_id, c.branch_id into v_class, v_branch from public.students s join public.classes c on c.id = s.class_id
   where s.id = v_sid and s.status = 'active';
  if not found then raise exception 'الطالب غير موجود'; end if;
  v_admin := app.has_cap('certificates', 2, v_branch);   -- الإداري أو صاحب منصب بتعديل الشهادات في فرع الطالب
  if not v_admin and v_type not in ('subject', 'activities', 'custom') then raise exception 'FORBIDDEN: هذا النوع من الشهادات للإدارة فقط'; end if;
  if not v_admin and not app.staff_can_access(v_class, null) then raise exception 'FORBIDDEN: هذا الطالب خارج نطاق صلاحيتك'; end if;
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
    if not v_admin and not app.staff_can_access(v_class, v_subject) then raise exception 'FORBIDDEN: هذه المادة ليست ضمن صلاحيتك لهذا الطالب'; end if;
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
    if v_subject is not null and not v_admin and not app.staff_can_access(v_class, v_subject) then raise exception 'FORBIDDEN: هذه المادة ليست ضمن صلاحيتك لهذا الطالب'; end if;
    if not v_admin and v_subject is null then raise exception 'اختر المادة'; end if;
  end if;

  return jsonb_build_object('student_id', v_sid, 'type', v_type, 'subject_id', v_subject, 'term_id', v_term, 'metrics', v_m, 'reason', v_reason);
end $function$;

create or replace FUNCTION public.cert_issue(p jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v jsonb := app.cert_compute(p); c public.appreciation_certs; v_emp bigint := app.my_employee_id();
begin
  if v ->> 'type' <> 'custom' then
    update public.appreciation_certs x
       set metrics = v -> 'metrics', issued_by = v_emp, issuer_name = (select name_ar from public.employees where id = v_emp), issued_at = now()
     where x.student_id = (v ->> 'student_id')::bigint and x.type = v ->> 'type' and x.revoked_at is null
       and coalesce(x.subject_id, 0) = coalesce(nullif(v ->> 'subject_id', '')::smallint, 0)
       and coalesce(x.term_id, 0) = coalesce(nullif(v ->> 'term_id', '')::smallint, 0)
       and (x.issued_by = v_emp or app.has_cap('certificates', 2, app.student_branch(x.student_id)))
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
end $function$;

create or replace FUNCTION public.cert_top(p_kind text, p_branch smallint, p_term smallint)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform app.require_cap('certificates', 2, p_branch);
  if p_kind not in ('top', 'attendance') then raise exception 'نوع غير معروف'; end if;
  return coalesce((
    select json_agg(json_build_object('rank', r.rk, 'student_id', r.sid, 'name', s.name_ar, 'code', s.code, 'class_label', concat_ws(' / ', g.name, sec.name),
             'pct', r.pct, 'n', r.cnt, 'absent', r.absent, 'late', r.late,
             'issued', exists (select 1 from public.appreciation_certs x where x.student_id = r.sid and x.type = p_kind and x.revoked_at is null
                                and coalesce(x.term_id, 0) = coalesce(p_term, 0))) order by r.rk)
      from app.cert_ranking(p_kind, p_branch, p_term) r
      join public.students s on s.id = r.sid
      join public.classes cl on cl.id = s.class_id join public.grades g on g.id = cl.grade_id join public.sections sec on sec.id = cl.section_id), '[]'::json);
end $function$;

create or replace FUNCTION public.cert_subject_top(p_subject smallint, p_term smallint, p_class integer DEFAULT NULL::integer)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_terms smallint[] := app.cert_terms(p_term);
begin
  if not app.is_staff() then raise exception 'FORBIDDEN'; end if;
  if p_subject is null then raise exception 'اختر المادة'; end if;
  return coalesce((
    with cls as (
      select c.id from public.classes c
       where (p_class is null or c.id = p_class) and (app.staff_can_access(c.id, p_subject) or app.has_cap('certificates', 2, c.branch_id))
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
end $function$;

create or replace FUNCTION public.cert_list(p_q text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_branch smallint DEFAULT NULL::smallint, p_offset integer DEFAULT 0, p_limit integer DEFAULT 12)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_admin boolean := app.is_admin(); v_emp bigint := app.my_employee_id(); v_total int; v_rows json;
begin
  if not app.is_staff() then raise exception 'FORBIDDEN'; end if;
  with f as (
    select c.* from public.appreciation_certs c
      join public.students s on s.id = c.student_id
      left join public.classes cl on cl.id = s.class_id
     where c.revoked_at is null
       and (c.issued_by = v_emp or app.has_cap('certificates', 1, cl.branch_id))
       and (p_type is null or c.type = p_type)
       and (p_branch is null or cl.branch_id = p_branch)
       and (coalesce(btrim(p_q), '') = '' or s.name_ar ilike '%' || btrim(p_q) || '%' or s.code ilike btrim(p_q) || '%')
  )
  select (select count(*) from f),
         (select coalesce(json_agg(app.cert_view(x) order by x.issued_at desc, x.id desc), '[]'::json)
            from (select * from f order by issued_at desc, id desc offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 60)) x)
    into v_total, v_rows;
  return json_build_object('total', v_total, 'rows', v_rows);
end $function$;

create or replace FUNCTION public.cert_revoke(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.is_staff() then raise exception 'FORBIDDEN'; end if;
  update public.appreciation_certs set revoked_at = now()
   where id = p_id and revoked_at is null and (issued_by = app.my_employee_id() or app.has_cap('certificates', 2, app.student_branch(student_id)));
  if not found then raise exception 'FORBIDDEN: الشهادة غير موجودة أو ليست من إصدارك'; end if;
end $function$;

do $$ begin raise notice '✅ هجرة 37: النتائج والإتاحة والشهادات بنطاق الفرع'; end $$;
