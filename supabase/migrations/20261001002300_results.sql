-- =====================================================================
-- مِرقاة — 23: النتائج وإشعار الدرجات
--   • أسماء إنجليزية للمواد وأنواع التقييم + قسم كل نوع في الإشعار:
--       أعمال الترم (Term Work) · الاختبارات القصيرة/التحريرية (Quizzes & Written) · الاختبار النهائي (Final)
--   • قواعد إتاحة النتائج: حجب/إتاحة لطالب أو فصل أو صف أو مرحلة أو فرع، لترم أو أكثر،
--     مع تاريخ إتاحة وتاريخ إغلاق. الأخص يغلب الأعم (الطالب ← الفصل ← الصف ← المرحلة ← الفرع ← الكل)
--   • فروع الانتساب: لا مواظبة إلا بمنح من الإدارة بطلب الطالب
--   • كشف الطالب وكشف الفصل محسوبان في القاعدة بنفس معادلة النظام القديم
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) الأسماء الإنجليزية وأقسام الإشعار
-- ---------------------------------------------------------------------
alter table public.subjects add column if not exists name_en text;
alter table public.eval_types
  add column if not exists name_en text,
  add column if not exists report_section text check (report_section in ('term_work', 'quizzes', 'final'));

-- القسم الافتراضي من الاسم (كما كان الكشف القديم): النهائي، ثم القصيرة والشهرية والتحريرية،
-- وكل ما سواها أعمال ترم (ومنها الشفهي، كما كان في "أعمال السنة")
create or replace function app.default_report_section(p_name text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_name ~ 'نهائي' then 'final'
    when p_name ~ '(قصير|شهري|تحريري|فتر)' then 'quizzes'
    else 'term_work' end
$$;

create or replace function app.eval_types_fill_section() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.report_section is null then new.report_section := app.default_report_section(new.name); end if;
  if tg_op = 'INSERT' and new.name_en is null then new.name_en := app.default_eval_name_en(new.name); end if;
  return new;
end $$;
drop trigger if exists eval_types_fill_section on public.eval_types;
create trigger eval_types_fill_section before insert or update on public.eval_types
  for each row execute function app.eval_types_fill_section();

select set_config('app.migrating', 'on', false);
update public.eval_types set report_section = app.default_report_section(name) where report_section is null;

-- ترجمات مبدئية للأسماء الشائعة (المطابقة بعد توحيد الهمزات والتاء المربوطة) — تُعدَّل من إعدادات النتائج
create or replace function app.default_eval_name_en(p_name text) returns text
language sql immutable set search_path = '' as $$
  select m.en
    from (values (1, 'نهائي', 'Final Exam'), (2, 'شهري', 'Monthly Tests'), (3, 'قصير', 'Quizzes'),
                 (4, 'تحريري', 'Written Test'), (5, 'شفهي|شفوي', 'Oral Test'), (6, 'واجب', 'Homework'),
                 (7, 'بحوث|بحث', 'Research & Reports'), (8, 'اوراق عمل', 'Worksheets'),
                 (9, 'مشارك|تفاعل', 'Participation'), (10, 'مشروع|مشاريع', 'Projects')) as m(o, p, en)
   where translate(p_name, 'أإآةى', 'اااهي') ~ m.p
   order by m.o limit 1
$$;

create or replace function app.default_subject_name_en(p_name text) returns text
language sql immutable set search_path = '' as $$
  select m.en
    from (values
      (1, 'قران', 'Holy Quran'), (2, 'تجويد', 'Tajweed'), (3, 'توحيد', 'Tawheed'), (4, 'عقيده', 'Aqeedah'),
      (5, 'فقه', 'Fiqh'), (6, 'حديث', 'Hadith'), (7, 'تفسير', 'Tafsir'), (8, 'سيره', 'Seerah'),
      (9, 'دراسات اسلاميه|تربيه اسلاميه', 'Islamic Studies'), (10, 'نحو', 'Arabic Grammar'), (11, 'صرف', 'Morphology'),
      (12, 'بلاغه', 'Rhetoric'), (13, 'املاء', 'Dictation'), (14, 'خط', 'Calligraphy'),
      (15, 'قراءه|مطالعه', 'Reading'), (16, 'تعبير|كتابه', 'Writing'), (17, 'لغه عربيه|^(ال)?عربي', 'Arabic Language'),
      (18, 'ادب', 'Literature'), (19, 'رياضيات', 'Mathematics'), (20, 'انجليزي|انقليزي', 'English Language'),
      (21, 'حاسب|حاسوب|رقميه', 'Computer Science'), (22, 'اجتماعيات|دراسات اجتماعيه', 'Social Studies'),
      (23, 'تاريخ', 'History'), (24, 'جغرافيا', 'Geography'), (25, 'فنيه', 'Art Education'),
      (26, 'بدنيه|رياضه', 'Physical Education'), (27, 'فيزياء', 'Physics'), (28, 'كيمياء', 'Chemistry'),
      (29, 'احياء', 'Biology'), (30, 'علوم', 'Science'), (31, 'تفكير', 'Critical Thinking'),
      (32, 'وطنيه', 'National Education'), (33, 'مهارات', 'Life Skills')) as m(o, p, en)
   where translate(p_name, 'أإآةى', 'اااهي') ~ m.p
   order by m.o limit 1
$$;

create or replace function app.subjects_fill_name_en() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.name_en is null then new.name_en := app.default_subject_name_en(new.name); end if;
  return new;
end $$;
drop trigger if exists subjects_fill_name_en on public.subjects;
create trigger subjects_fill_name_en before insert on public.subjects
  for each row execute function app.subjects_fill_name_en();

update public.eval_types set name_en = app.default_eval_name_en(name) where name_en is null;
update public.subjects set name_en = app.default_subject_name_en(name) where name_en is null;
select set_config('app.migrating', 'off', false);

alter table public.eval_types alter column report_section set not null;

-- ---------------------------------------------------------------------
-- 2) فروع الانتساب
-- ---------------------------------------------------------------------
alter table public.branches add column if not exists is_intisab boolean not null default false;
select set_config('app.migrating', 'on', false);
update public.branches set is_intisab = true where name ~ 'انتساب' and not is_intisab;
select set_config('app.migrating', 'off', false);

-- منح المواظبة: طالب منتسب طلب احتساب المواظبة (أو أي طالب تقرر الإدارة منحه درجة محددة)
create table public.attendance_grants (
  id          bigint generated always as identity primary key,
  student_id  bigint not null references public.students(id) on delete cascade,
  term_id     smallint references public.terms(id) on delete cascade,  -- فارغ = كل الفصول الدراسية
  score       numeric(5,2) not null default 100 check (score >= 0 and score <= 100),
  note        text check (char_length(note) <= 300),
  granted_by  uuid default auth.uid(),
  granted_at  timestamptz not null default now(),
  constraint attendance_grants_unique unique nulls not distinct (student_id, term_id)
);
comment on table public.attendance_grants is 'منح درجة المواظبة (طلاب الانتساب بطلبهم) — تُقدَّم على المحسوب من التحضير';

-- ---------------------------------------------------------------------
-- 3) قواعد إتاحة النتائج
--   block: محجوبة، وتُتاح فقط بين opens_at و closes_at إن حُدّد أحدهما
--          (بلا تاريخين = محجوبة حتى تُلغى القاعدة)
--   allow: ظاهرة دائمًا — استثناء من حجب أعم (مثل: حجب الفصل إلا هذا الطالب)
--   الأهداف: أي تطابق (طالب أو فصل أو صف أو مرحلة أو فرع)؛ كلها فارغة = كل الطلاب
--   term_ids فارغة = كل الفصول الدراسية
-- ---------------------------------------------------------------------
create table public.result_release_rules (
  id           bigint generated always as identity primary key,
  kind         text not null default 'block' check (kind in ('block', 'allow')),
  term_ids     smallint[] not null default '{}',
  branch_ids   smallint[] not null default '{}',
  stage_ids    smallint[] not null default '{}',
  grade_ids    smallint[] not null default '{}',
  class_ids    integer[]  not null default '{}',
  student_ids  bigint[]   not null default '{}',
  opens_at     timestamptz,
  closes_at    timestamptz,
  note         text check (char_length(note) <= 200),
  is_active    boolean not null default true,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint result_rules_window_chk check (closes_at is null or opens_at is null or closes_at > opens_at),
  constraint result_rules_allow_chk check (kind = 'block' or (opens_at is null and closes_at is null))
);
create trigger result_release_rules_touch before update on public.result_release_rules
  for each row execute function app.touch_updated_at();
comment on table public.result_release_rules is 'إتاحة النتائج للطلاب: الأخص يغلب الأعم، وعند التساوي يغلب الحجب';

alter table public.attendance_grants enable row level security;
alter table public.result_release_rules enable row level security;
grant select on public.attendance_grants, public.result_release_rules to authenticated;
grant all on public.attendance_grants, public.result_release_rules to service_role;
create policy attendance_grants_read on public.attendance_grants for select to authenticated
  using ((select app.is_admin()) or student_id = (select app.my_student_id()));
create policy result_rules_read on public.result_release_rules for select to authenticated
  using ((select app.is_admin()));

create trigger attendance_grants_audit after insert or update or delete on public.attendance_grants
  for each row execute function app.audit_row();
create trigger result_release_rules_audit after insert or update or delete on public.result_release_rules
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------
-- 4) هل نتيجة الطالب في هذا الفصل الدراسي متاحة له الآن؟
-- ---------------------------------------------------------------------
create or replace function app.result_access(p_student_id bigint, p_term_id smallint) returns jsonb
language sql stable security definer set search_path = '' as $$
  with s as (
    select st.id, st.class_id, c.branch_id, c.grade_id, g.stage_id
      from public.students st
      left join public.classes c on c.id = st.class_id
      left join public.grades g on g.id = c.grade_id
     where st.id = p_student_id),
  m as (
    select r.id, r.kind, r.opens_at, r.closes_at,
           case when s.id = any(r.student_ids) then 5
                when s.class_id = any(r.class_ids) then 4
                when s.grade_id = any(r.grade_ids) then 3
                when s.stage_id = any(r.stage_ids) then 2
                when s.branch_id = any(r.branch_ids) then 1
                when cardinality(r.student_ids) + cardinality(r.class_ids) + cardinality(r.grade_ids)
                     + cardinality(r.stage_ids) + cardinality(r.branch_ids) = 0 then 0 end as spec
      from public.result_release_rules r cross join s
     where r.is_active and (cardinality(r.term_ids) = 0 or p_term_id = any(r.term_ids))),
  top as (select * from m where spec = (select max(spec) from m)),
  blk as (
    select * from top
     where kind = 'block'
       and not ((opens_at is not null or closes_at is not null)
                and (opens_at is null or opens_at <= now())
                and (closes_at is null or closes_at > now()))
     order by opens_at desc nulls first
     limit 1)
  select coalesce(
    (select jsonb_build_object('visible', false, 'rule_id', id, 'opens_at', opens_at, 'closes_at', closes_at,
                               'reason', case when opens_at > now() then 'not_yet'
                                              when closes_at <= now() then 'ended' else 'blocked' end)
       from blk),
    jsonb_build_object('visible', true,
                       'closes_at', (select min(closes_at) from top where kind = 'block' and closes_at > now())))
$$;

create or replace function app.results_visible(p_student_id bigint, p_term_id smallint) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((app.result_access(p_student_id, p_term_id) ->> 'visible')::boolean, false)
$$;

-- مجاميع الطالب (grade_breakdown/grade_totals) تتبع الإتاحة أيضًا، فلا تُستنتج النتيجة المحجوبة منها.
-- درجات المهام والنماذج اليومية تبقى بإعدادات كل مهمة كما هي.
create or replace view public.grade_breakdown with (security_invoker = true) as
select g.student_id,
       a.term_id,
       a.subject_id,
       a.eval_type_id,
       sum(g.score)                       as earned,
       sum(g.max_score)                   as max_total,
       coalesce(w.weight, 0)              as weight,
       case when sum(g.max_score) > 0
            then round((sum(g.score) / sum(g.max_score)) * coalesce(w.weight, 0), 2)
            else 0 end                    as weighted_score,
       count(*)                           as entries_count
  from public.grade_entries g
  join public.assessments a on a.id = g.assessment_id
  left join public.grade_weights w on w.subject_id = a.subject_id and w.eval_type_id = a.eval_type_id
 where (select app.is_staff()) or app.results_visible(g.student_id, a.term_id)
 group by g.student_id, a.term_id, a.subject_id, a.eval_type_id, w.weight;

-- ---------------------------------------------------------------------
-- 5) التقدير
-- ---------------------------------------------------------------------
create or replace function app.rating_ar(p numeric) returns text
language sql immutable set search_path = '' as $$
  select case when p is null then null when p >= 90 then 'ممتاز' when p >= 80 then 'جيد جدًا'
              when p >= 70 then 'جيد' when p >= 60 then 'مقبول' else 'ضعيف' end
$$;
create or replace function app.rating_en(p numeric) returns text
language sql immutable set search_path = '' as $$
  select case when p is null then null when p >= 90 then 'Excellent' when p >= 80 then 'Very Good'
              when p >= 70 then 'Good' when p >= 60 then 'Pass' else 'Weak' end
$$;

-- ---------------------------------------------------------------------
-- 6) بناء الكشف (داخلية — تستدعيها الدوال العامة بعد التحقق)
--   المادة: مجموع (المستحق/العظمى × النسبة) لكل نوع تقييم، مقسّمًا على الأقسام الثلاثة
--   المعدل: متوسط نسب المواد المرصودة · المواظبة: (الكل − الغياب − ¼ التأخر) / الكل
--   السلوك: 100 − مجموع خصم السلبي
-- ---------------------------------------------------------------------
create or replace function app.build_report(p_student_ids bigint[], p_term_id smallint, p_student_view boolean)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  with st as (
    select s.id, s.code, s.name_ar, s.name_en, s.national_id, s.nationality, s.birth_date, s.birth_date_text,
           s.gender, s.fee_status, s.status::text as status, s.enrolled_at, s.class_id,
           c.branch_id, c.grade_id, c.section_id, g.stage_id,
           b.name as branch, coalesce(b.is_intisab, false) as is_intisab, sg.name as stage, g.name as grade, sec.name as section
      from public.students s
      left join public.classes c on c.id = s.class_id
      left join public.branches b on b.id = c.branch_id
      left join public.grades g on g.id = c.grade_id
      left join public.stages sg on sg.id = g.stage_id
      left join public.sections sec on sec.id = c.section_id
     where s.id = any(p_student_ids)),
  ev as (   -- لكل طالب ومادة ونوع تقييم: المرصود
    select ge.student_id, a.subject_id, a.eval_type_id, sum(ge.score) as earned, sum(ge.max_score) as mx, count(*) as n
      from public.grade_entries ge join public.assessments a on a.id = ge.assessment_id
     where ge.student_id = any(p_student_ids) and a.term_id = p_term_id
     group by 1, 2, 3),
  pairs as (   -- مواد الطالب: موزعة على فصله + أي مادة رُصدت له في هذا الفصل الدراسي
    select st.id as student_id, m.subject_id
      from st join public.subject_matrix m
        on m.branch_id = st.branch_id and m.grade_id = st.grade_id and (m.section_id is null or m.section_id = st.section_id)
    union
    select student_id, subject_id from ev),
  vis as (
    select p.student_id, p.subject_id, coalesce(v.is_visible, true) as visible
      from pairs p left join public.grade_visibility v
        on v.student_id = p.student_id and v.subject_id = p.subject_id and v.term_id = p_term_id),
  wsec as (   -- عظمى كل قسم لكل مادة = مجموع نسب أنواعه
    select w.subject_id,
           coalesce(sum(w.weight) filter (where e.report_section = 'term_work'), 0) as tw_max,
           coalesce(sum(w.weight) filter (where e.report_section = 'quizzes'), 0) as qz_max,
           coalesce(sum(w.weight) filter (where e.report_section = 'final'), 0) as fn_max,
           sum(w.weight) as max_total
      from public.grade_weights w join public.eval_types e on e.id = w.eval_type_id
     where w.weight > 0
     group by w.subject_id),
  evw as (
    select ev.*, coalesce(w.weight, 0) as weight, e.report_section,
           case when ev.mx > 0 then round(ev.earned / ev.mx * coalesce(w.weight, 0), 2) else 0 end as weighted
      from ev
      left join public.grade_weights w on w.subject_id = ev.subject_id and w.eval_type_id = ev.eval_type_id
      left join public.eval_types e on e.id = ev.eval_type_id),
  esec as (
    select student_id, subject_id,
           sum(weighted) filter (where report_section = 'term_work') as tw,
           sum(weighted) filter (where report_section = 'quizzes') as qz,
           sum(weighted) filter (where report_section = 'final') as fn,
           sum(weighted) as total,
           sum(n) as entries,
           jsonb_object_agg(coalesce(eval_type_id, 0)::text, weighted) as evals
      from evw group by 1, 2),
  subj_rows as (
    select vis.student_id, vis.subject_id, vis.visible, sj.sort_order, sj.name,
           ws.tw_max, ws.qz_max, ws.fn_max, ws.max_total,
           es.tw, es.qz, es.fn, es.total, es.entries, es.evals,
           case when es.total is not null and ws.max_total > 0 then round(es.total / ws.max_total * 100, 2) end as pct
      from vis
      join public.subjects sj on sj.id = vis.subject_id
      left join wsec ws on ws.subject_id = vis.subject_id
      left join esec es on es.student_id = vis.student_id and es.subject_id = vis.subject_id
     where not p_student_view or vis.visible),
  per_student as (
    select student_id,
           jsonb_agg(jsonb_build_object(
             'subject_id', subject_id, 'visible', visible,
             'term_work', tw, 'quizzes', qz, 'final', fn, 'total', total, 'max', max_total,
             'pct', pct, 'rating_ar', app.rating_ar(pct), 'rating_en', app.rating_en(pct),
             'entries', coalesce(entries, 0), 'evals', coalesce(evals, '{}'::jsonb))
             order by sort_order, name) as subjects,
           sum(total) filter (where total is not null) as total,
           sum(max_total) filter (where total is not null) as max_total,
           round(avg(pct), 2) as average,
           count(*) filter (where total is not null) as graded
      from subj_rows group by student_id),
  att as (
    select a.student_id, count(*) as total,
           count(*) filter (where app.att_kind(s.name) = 'absent') as absent,
           count(*) filter (where app.att_kind(s.name) = 'late') as late,
           count(*) filter (where app.att_kind(s.name) = 'excused') as excused
      from public.attendance_records a
      join public.calendar_entries w on w.id = a.week_id and w.term_id = p_term_id
      join public.attendance_statuses s on s.id = a.status_id
     where a.student_id = any(p_student_ids)
     group by a.student_id),
  grant_row as (
    select distinct on (student_id) student_id, score
      from public.attendance_grants
     where student_id = any(p_student_ids) and (term_id = p_term_id or term_id is null)
     order by student_id, term_id nulls last),
  beh as (
    select b.student_id,
           greatest(0, 100 - coalesce(sum(b.score) filter (where app.beh_kind(s.name) = 'negative'), 0)) as score,
           count(*) filter (where app.beh_kind(s.name) = 'negative') as negative,
           count(*) filter (where app.beh_kind(s.name) = 'positive') as positive
      from public.behavior_records b join public.behavior_statuses s on s.id = b.status_id
     where b.student_id = any(p_student_ids) and b.term_id = p_term_id
     group by b.student_id),
  full_rows as (
    select st.*, ps.subjects, ps.total, ps.max_total, ps.average, ps.graded,
           case when gr.student_id is not null then gr.score
                when st.is_intisab then null
                when att.total > 0 then greatest(0, round(100 * (att.total - att.absent - 0.25 * att.late) / att.total)) end as att_pct,
           gr.student_id is not null as granted, att.total as att_total, att.absent, att.late, att.excused,
           coalesce(beh.score, 100) as beh_score, coalesce(beh.negative, 0) as beh_negative, coalesce(beh.positive, 0) as beh_positive
      from st
      left join per_student ps on ps.student_id = st.id
      left join att on att.student_id = st.id
      left join grant_row gr on gr.student_id = st.id
      left join beh on beh.student_id = st.id),
  ranked as (
    select f.*, case when f.average is not null then rank() over (order by f.average desc nulls last) end as rnk
      from full_rows f)
  select jsonb_build_object(
    'term', (select jsonb_build_object('id', t.id, 'name', t.name, 'year', y.name)
               from public.terms t join public.academic_years y on y.id = t.academic_year_id where t.id = p_term_id),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', sj.id, 'name', sj.name, 'name_en', sj.name_en,
               'term_work', coalesce(ws.tw_max, 0), 'quizzes', coalesce(ws.qz_max, 0), 'final', coalesce(ws.fn_max, 0),
               'max', coalesce(ws.max_total, 0),
               'evals', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'name_en', e.name_en,
                                                                       'section', e.report_section, 'weight', w.weight)
                                                    order by e.sort_order, e.id)
                                    from public.grade_weights w join public.eval_types e on e.id = w.eval_type_id
                                   where w.subject_id = sj.id and w.weight > 0), '[]'::jsonb))
               order by sj.sort_order, sj.name)
        from public.subjects sj left join wsec ws on ws.subject_id = sj.id
       where sj.id in (select subject_id from subj_rows)), '[]'::jsonb),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'code', x.code, 'name_ar', x.name_ar, 'name_en', x.name_en,
               'national_id', x.national_id, 'nationality', x.nationality,
               'birth_date', coalesce(x.birth_date::text, x.birth_date_text), 'gender', x.gender,
               'fee_status', x.fee_status, 'status', x.status, 'enrolled_at', x.enrolled_at,
               'class_id', x.class_id, 'branch', x.branch, 'stage', x.stage, 'grade', x.grade, 'section', x.section,
               'is_intisab', x.is_intisab,
               'subjects', coalesce(x.subjects, '[]'::jsonb),
               'total', x.total, 'max_total', x.max_total, 'average', x.average, 'graded', coalesce(x.graded, 0),
               'rating_ar', app.rating_ar(x.average), 'rating_en', app.rating_en(x.average),
               'rank', case when p_student_view then null else x.rnk end,
               'attendance', jsonb_build_object(
                  'pct', x.att_pct, 'intisab', x.is_intisab, 'granted', x.granted,
                  'total', coalesce(x.att_total, 0), 'absent', coalesce(x.absent, 0), 'late', coalesce(x.late, 0),
                  'excused', coalesce(x.excused, 0),
                  'rating_ar', app.rating_ar(x.att_pct), 'rating_en', app.rating_en(x.att_pct)),
               'behavior', jsonb_build_object(
                  'score', x.beh_score, 'negative', x.beh_negative, 'positive', x.beh_positive,
                  'rating_ar', app.rating_ar(x.beh_score), 'rating_en', app.rating_en(x.beh_score)))
               order by x.name_ar)
        from ranked x), '[]'::jsonb))
    into r;
  return r;
end $$;
revoke all on function app.build_report(bigint[], smallint, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7) الدوال العامة
-- ---------------------------------------------------------------------
-- الطالب: فصوله الدراسية في العام الحالي وحالة إتاحة كل منها
create or replace function public.my_result_terms() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_sid bigint := app.my_student_id();
begin
  if v_sid is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'year', y.name,
                                        'access', app.result_access(v_sid, t.id))
                     order by y.is_current desc, y.starts_on desc nulls last, t.sort_order, t.id)
      from public.terms t join public.academic_years y on y.id = t.academic_year_id
     where y.is_current
        or exists (select 1 from public.grade_entries g join public.assessments a on a.id = g.assessment_id
                    where g.student_id = v_sid and a.term_id = t.id)), '[]'::jsonb);
end $$;

-- الطالب: إشعار درجاته (إن كان متاحًا)
create or replace function public.my_report_card(p_term_id smallint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_sid bigint := app.my_student_id();
  v_acc jsonb;
  v_rep jsonb;
begin
  if v_sid is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  v_acc := app.result_access(v_sid, p_term_id);
  if not (v_acc ->> 'visible')::boolean then
    return jsonb_build_object('status', 'hidden', 'access', v_acc);
  end if;
  v_rep := app.build_report(array[v_sid], p_term_id, true);
  return jsonb_build_object('status', 'ok', 'access', v_acc, 'term', v_rep -> 'term',
                            'subjects', v_rep -> 'subjects', 'student', v_rep -> 'students' -> 0);
end $$;

-- الإدارة: كشف فصل كامل (للعرض وملف Excel) مع حالة الإتاحة لكل طالب
create or replace function public.class_results(p_class_id integer, p_term_id smallint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ids bigint[];
  v_rep jsonb;
begin
  perform app.require_admin();
  select coalesce(array_agg(id), '{}') into v_ids from public.students where class_id = p_class_id and status = 'active';
  v_rep := app.build_report(v_ids, p_term_id, false);
  return v_rep || jsonb_build_object(
    'access', coalesce((select jsonb_object_agg(i::text, app.result_access(i, p_term_id)) from unnest(v_ids) i), '{}'::jsonb));
end $$;

-- الإدارة: إشعار طالب واحد (معاينة/تنزيل نيابة عنه)
create or replace function public.student_report_card(p_student_id bigint, p_term_id smallint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_rep jsonb;
begin
  perform app.require_admin();
  v_rep := app.build_report(array[p_student_id], p_term_id, true);
  return jsonb_build_object('status', 'ok', 'access', app.result_access(p_student_id, p_term_id), 'term', v_rep -> 'term',
                            'subjects', v_rep -> 'subjects', 'student', v_rep -> 'students' -> 0);
end $$;

-- الإدارة: نظرة عامة على كل الفصول (المعدل، المرصود، المتاح للطلاب)
create or replace function public.results_overview(p_term_id smallint) returns jsonb
language sql stable security definer set search_path = '' as $$
  with ev as (
    select ge.student_id, a.subject_id, a.eval_type_id, sum(ge.score) as earned, sum(ge.max_score) as mx
      from public.grade_entries ge join public.assessments a on a.id = ge.assessment_id
     where a.term_id = p_term_id and coalesce(app.is_admin(), false)
     group by 1, 2, 3),
  ss as (
    select ev.student_id, ev.subject_id,
           sum(case when ev.mx > 0 then round(ev.earned / ev.mx * coalesce(w.weight, 0), 2) else 0 end) as total
      from ev left join public.grade_weights w on w.subject_id = ev.subject_id and w.eval_type_id = ev.eval_type_id
     group by 1, 2),
  wt as (select subject_id, sum(weight) as mx from public.grade_weights where weight > 0 group by 1),
  sp as (
    select ss.student_id, avg(ss.total / wt.mx * 100) as pct
      from ss join wt on wt.subject_id = ss.subject_id and wt.mx > 0
     group by 1),
  cls as (
    select s.class_id, count(*) as students, count(sp.pct) as graded, round(avg(sp.pct), 2) as average,
           count(*) filter (where app.results_visible(s.id, p_term_id)) as visible
      from public.students s left join sp on sp.student_id = s.id
     where s.status = 'active' and s.class_id is not null and coalesce(app.is_admin(), false)
     group by s.class_id)
  select case when not coalesce(app.is_admin(), false) then null else
    coalesce(jsonb_agg(jsonb_build_object('class_id', class_id, 'students', students, 'graded', graded,
                                          'average', average, 'visible', visible)), '[]'::jsonb) end
    from cls
$$;

-- كم طالبًا تشملهم قاعدة (معاينة قبل الحفظ)
create or replace function public.release_rule_reach(p jsonb) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare
  v_br smallint[] := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'branch_ids', '[]')))::smallint[], '{}');
  v_st smallint[] := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'stage_ids', '[]')))::smallint[], '{}');
  v_gr smallint[] := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'grade_ids', '[]')))::smallint[], '{}');
  v_cl integer[]  := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'class_ids', '[]')))::integer[], '{}');
  v_sd bigint[]   := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'student_ids', '[]')))::bigint[], '{}');
  v_n integer;
begin
  perform app.require_admin();
  select count(*) into v_n
    from public.students s
    left join public.classes c on c.id = s.class_id
    left join public.grades g on g.id = c.grade_id
   where s.status = 'active'
     and ((cardinality(v_br) + cardinality(v_st) + cardinality(v_gr) + cardinality(v_cl) + cardinality(v_sd) = 0)
          or s.id = any(v_sd) or s.class_id = any(v_cl) or c.grade_id = any(v_gr)
          or g.stage_id = any(v_st) or c.branch_id = any(v_br));
  return v_n;
end $$;

create or replace function public.save_release_rule(p_id bigint, p jsonb) returns bigint
language plpgsql volatile security definer set search_path = '' as $$
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
  perform app.require_admin();
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
end $$;

create or replace function public.set_release_rule_active(p_id bigint, p_active boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_admin();
  update public.result_release_rules set is_active = p_active where id = p_id;
  if not found then raise exception 'القاعدة غير موجودة'; end if;
end $$;

create or replace function public.delete_release_rule(p_id bigint) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_admin();
  delete from public.result_release_rules where id = p_id;
end $$;

-- منح المواظبة
create or replace function public.save_attendance_grant(p_student_id bigint, p_term_id smallint, p_score numeric, p_note text)
returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare v_id bigint;
begin
  perform app.require_admin();
  if not exists (select 1 from public.students where id = p_student_id) then raise exception 'الطالب غير موجود'; end if;
  if p_score is null or p_score < 0 or p_score > 100 then raise exception 'الدرجة بين 0 و 100'; end if;
  insert into public.attendance_grants (student_id, term_id, score, note)
  values (p_student_id, p_term_id, p_score, nullif(btrim(p_note), ''))
  on conflict on constraint attendance_grants_unique
  do update set score = excluded.score, note = excluded.note, granted_by = auth.uid(), granted_at = now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.delete_attendance_grant(p_id bigint) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_admin();
  delete from public.attendance_grants where id = p_id;
end $$;

-- الأسماء الإنجليزية وأقسام الإشعار وفروع الانتساب — حفظ دفعة واحدة
create or replace function public.save_report_labels(p jsonb) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_n integer := 0; v_c integer; x jsonb;
begin
  perform app.require_admin();
  for x in select * from jsonb_array_elements(coalesce(p -> 'subjects', '[]')) loop
    update public.subjects set name_en = nullif(btrim(x ->> 'name_en'), '')
     where id = (x ->> 'id')::smallint and name_en is distinct from nullif(btrim(x ->> 'name_en'), '');
    get diagnostics v_c = row_count; v_n := v_n + v_c;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p -> 'eval_types', '[]')) loop
    if coalesce(x ->> 'report_section', 'term_work') not in ('term_work', 'quizzes', 'final') then
      raise exception 'قسم غير معروف';
    end if;
    update public.eval_types
       set name_en = nullif(btrim(x ->> 'name_en'), ''), report_section = coalesce(x ->> 'report_section', report_section)
     where id = (x ->> 'id')::smallint
       and (name_en is distinct from nullif(btrim(x ->> 'name_en'), '') or report_section is distinct from coalesce(x ->> 'report_section', report_section));
    get diagnostics v_c = row_count; v_n := v_n + v_c;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p -> 'branches', '[]')) loop
    update public.branches set is_intisab = coalesce((x ->> 'is_intisab')::boolean, false)
     where id = (x ->> 'id')::smallint and is_intisab is distinct from coalesce((x ->> 'is_intisab')::boolean, false);
    get diagnostics v_c = row_count; v_n := v_n + v_c;
  end loop;
  return v_n;
end $$;

-- نص الإشعار القابل للتعديل (التذييل واسم المدير)
insert into public.app_settings (key, value, is_public)
values ('results_notice', '{"principal": "", "note": ""}', false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 8) الصلاحيات
-- ---------------------------------------------------------------------
revoke all on function public.my_result_terms(), public.my_report_card(smallint), public.class_results(integer, smallint),
                       public.student_report_card(bigint, smallint), public.results_overview(smallint),
                       public.release_rule_reach(jsonb), public.save_release_rule(bigint, jsonb),
                       public.set_release_rule_active(bigint, boolean), public.delete_release_rule(bigint),
                       public.save_attendance_grant(bigint, smallint, numeric, text), public.delete_attendance_grant(bigint),
                       public.save_report_labels(jsonb)
  from public, anon;
grant execute on function public.my_result_terms(), public.my_report_card(smallint), public.class_results(integer, smallint),
                          public.student_report_card(bigint, smallint), public.results_overview(smallint),
                          public.release_rule_reach(jsonb), public.save_release_rule(bigint, jsonb),
                          public.set_release_rule_active(bigint, boolean), public.delete_release_rule(bigint),
                          public.save_attendance_grant(bigint, smallint, numeric, text), public.delete_attendance_grant(bigint),
                          public.save_report_labels(jsonb)
  to authenticated;
grant execute on function app.result_access(bigint, smallint), app.results_visible(bigint, smallint),
                          app.rating_ar(numeric), app.rating_en(numeric), app.default_report_section(text)
  to authenticated;

do $$ begin raise notice '✅ هجرة 23: النتائج وإشعار الدرجات'; end $$;
