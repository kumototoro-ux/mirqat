-- =====================================================================
-- هجرة 26 — الاستيراد من Excel، والنسخ الاحتياطي، وتصفير البيانات (للإدارة فقط)
--   1) import_students       : إضافة/تحديث طلاب دفعة واحدة (التدقيق في الخادم قبلها، وهنا ضمانات القاعدة)
--   2) import_term_grades    : مجاميع فصل دراسي منقولة (درجة كل نوع تقييم موزونة كما في «Grade Aggregation»)
--   3) backup_rows           : صفوف مقروءة (أسماء لا أرقام) لكل جدول، مقيّدة بالفرع، بصفحات
--   4) admin_reset_preview / admin_reset_data : تصفير بخطوات تأكيد، يعيد حسابات الدخول والملفات لحذفها
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) استيراد الطلاب
--   p_rows: [{code?, name_ar, name_en, nationality, birth_date, national_id, gender, fee_status,
--             branch_id, grade_id, section_id?}]
--   الرمز (الرقم الأكاديمي) هو المفتاح: موجود ← تحديث بياناته، وفصله لا يتغير إلا إن حُددت شعبته
-- ---------------------------------------------------------------------
create or replace function public.import_students(p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r        jsonb;
  v_id     bigint;
  v_code   text;
  v_nid    text;
  v_class  integer;
  v_birth  date;
  v_btext  text;
  v_new    int := 0;
  v_upd    int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_i      int := 0;
begin
  perform app.require_admin();
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'بيانات غير صالحة'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'الحد 5000 طالب في المرة'; end if;
  perform pg_advisory_xact_lock(hashtext('mirqat:student_code'));

  for r in select * from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1;
    begin
      v_code := app.nz(r, 'code');
      v_nid  := app.nz(r, 'national_id');
      v_class := case when app.nz(r, 'section_id') is not null
                      then app.class_for((r ->> 'branch_id')::smallint, (r ->> 'grade_id')::smallint, (r ->> 'section_id')::smallint) end;
      v_birth := null; v_btext := app.nz(r, 'birth_date');
      if v_btext ~ '^\d{4}-\d{2}-\d{2}$' then
        begin v_birth := v_btext::date; v_btext := null; exception when others then v_birth := null; end;
      end if;

      select s.id into v_id from public.students s where v_code is not null and s.code = v_code;
      if v_nid is not null and exists (select 1 from public.students s where s.national_id = v_nid and s.id is distinct from v_id) then
        raise exception 'رقم الهوية % مسجّل لطالب آخر', v_nid;
      end if;

      if v_id is null then
        if v_code is null then v_code := app.next_code('students', 'S', 4); end if;
        insert into public.students (code, national_id, name_ar, name_en, nationality, birth_date, birth_date_text, gender, class_id, fee_status, enrolled_at)
        values (v_code, v_nid, app.nz(r, 'name_ar'), app.nz(r, 'name_en'), app.nz(r, 'nationality'), v_birth, v_btext,
                app.nz(r, 'gender'), v_class, app.nz(r, 'fee_status'), now());
        v_new := v_new + 1;
      else
        update public.students s set
          name_ar = coalesce(app.nz(r, 'name_ar'), s.name_ar),
          name_en = coalesce(app.nz(r, 'name_en'), s.name_en),
          nationality = coalesce(app.nz(r, 'nationality'), s.nationality),
          national_id = coalesce(v_nid, s.national_id),
          birth_date = coalesce(v_birth, s.birth_date),
          birth_date_text = case when v_birth is not null then null else coalesce(v_btext, s.birth_date_text) end,
          gender = coalesce(app.nz(r, 'gender'), s.gender),
          fee_status = coalesce(app.nz(r, 'fee_status'), s.fee_status),
          class_id = coalesce(v_class, s.class_id),
          status = 'active',
          is_edited = true
        where s.id = v_id;
        v_upd := v_upd + 1;
      end if;
    exception when others then
      v_errors := v_errors || jsonb_build_object('i', v_i, 'code', v_code, 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('created', v_new, 'updated', v_upd, 'errors', v_errors);
end $$;

-- ---------------------------------------------------------------------
-- 2) مجاميع فصل دراسي منقولة
--   p_rows: [{student_id, subject_id, eval_type_id, value}] — value موزونة (من وزن النوع للمادة)
--   لكل (فصل الطالب، مادة، نوع) تقييم يدوي واحد «رصد منقول» عظماه = وزن النوع،
--   فيحسب محرك النتائج (المستحق ÷ العظمى × الوزن) القيمة نفسها تمامًا. إعادة الرفع تُحدّث الدرجات.
-- ---------------------------------------------------------------------
create or replace function public.import_term_grades(p_term smallint, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r        jsonb;
  v_class  integer;
  v_w      numeric;
  v_val    numeric;
  v_a      bigint;
  v_term   text;
  v_n      int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_i      int := 0;
  v_me     bigint := (select p.employee_id from public.profiles p where p.id = auth.uid());
begin
  perform app.require_admin();
  select t.name || ' ' || y.name into v_term from public.terms t join public.academic_years y on y.id = t.academic_year_id where t.id = p_term;
  if v_term is null then raise exception 'الفصل الدراسي غير موجود'; end if;
  if jsonb_array_length(p_rows) > 60000 then raise exception 'الحد 60000 درجة في المرة'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1;
    begin
      v_val := (r ->> 'value')::numeric;
      select s.class_id into v_class from public.students s where s.id = (r ->> 'student_id')::bigint;
      if v_class is null then raise exception 'الطالب بلا فصل'; end if;
      select w.weight into v_w from public.grade_weights w
       where w.subject_id = (r ->> 'subject_id')::smallint and w.eval_type_id = (r ->> 'eval_type_id')::smallint;
      if coalesce(v_w, 0) <= 0 then raise exception 'لا وزن لهذا النوع في هذه المادة (توزيع الدرجات)'; end if;
      if v_val < 0 or v_val > v_w then raise exception 'الدرجة % خارج المدى (0 – %)', v_val, v_w; end if;

      select a.id into v_a from public.assessments a
       where a.class_id = v_class and a.subject_id = (r ->> 'subject_id')::smallint and a.term_id = p_term
         and a.eval_type_id = (r ->> 'eval_type_id')::smallint and a.source_sheet = 'import:term_totals';
      if v_a is null then
        insert into public.assessments (kind, class_id, subject_id, term_id, eval_type_id, title, max_score, published_at, grades_recorded_at, source_sheet)
        values ('manual', v_class, (r ->> 'subject_id')::smallint, p_term, (r ->> 'eval_type_id')::smallint,
                'رصد منقول — ' || v_term, v_w, now(), now(), 'import:term_totals')
        returning id into v_a;
      elsif (select a.max_score from public.assessments a where a.id = v_a) <> v_w then
        update public.assessments a set max_score = v_w where a.id = v_a;
        update public.grade_entries ge set max_score = v_w, score = least(ge.score, v_w) where ge.assessment_id = v_a;
      end if;

      insert into public.grade_entries (assessment_id, student_id, score, max_score, source, recorded_by, recorded_at)
      values (v_a, (r ->> 'student_id')::bigint, round(v_val, 2), v_w, 'manual', v_me, now())
      on conflict (assessment_id, student_id) do update
        set score = excluded.score, max_score = excluded.max_score, is_edited = true, edited_at = now(), edited_by = auth.uid();
      v_n := v_n + 1;
    exception when others then
      v_errors := v_errors || jsonb_build_object('i', v_i, 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('saved', v_n, 'errors', v_errors);
end $$;

-- ---------------------------------------------------------------------
-- 3) النسخة الاحتياطية: صفوف مقروءة لكل جدول، مقيّدة بالفرع (null = كل الفروع)
-- ---------------------------------------------------------------------
create or replace function public.backup_rows(p_table text, p_branch smallint, p_offset int, p_limit int)
returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  v json;
  v_lim int := least(greatest(coalesce(p_limit, 2000), 1), 5000);
  v_off int := greatest(coalesce(p_offset, 0), 0);
begin
  perform app.require_admin();
  if p_table = 'students' then
    select coalesce(json_agg(x order by x."الفرع", x."الصف", x."الشعبة", x."الاسم"), '[]'::json) into v from (
      select s.code as "الرقم", s.name_ar as "الاسم", s.name_en as "الاسم بالإنجليزي", s.national_id as "رقم الهوية",
             s.nationality as "الجنسية", coalesce(s.birth_date::text, s.birth_date_text) as "تاريخ الميلاد", s.gender as "الجنس",
             b.name as "الفرع", st.name as "المرحلة", g.name as "الصف", sec.name as "الشعبة",
             s.fee_status as "حالة الرسوم", s.status::text as "الحالة", p.username as "اسم المستخدم", s.enrolled_at as "تاريخ التسجيل"
        from public.students s
        left join public.classes c on c.id = s.class_id
        left join public.branches b on b.id = c.branch_id
        left join public.grades g on g.id = c.grade_id
        left join public.stages st on st.id = g.stage_id
        left join public.sections sec on sec.id = c.section_id
        left join public.profiles p on p.student_id = s.id
       where p_branch is null or c.branch_id = p_branch
       order by b.name, g.name, sec.name, s.name_ar offset v_off limit v_lim) x;

  elsif p_table = 'employees' then
    select coalesce(json_agg(x), '[]'::json) into v from (
      select e.code as "الرقم", e.name_ar as "الاسم", e.name_en as "الاسم بالإنجليزي", e.national_id as "رقم الهوية",
             e.user_type as "النوع", e.job_role as "الوظيفة", e.gender as "الجنس",
             case when e.is_active then 'نشط' else 'موقوف' end as "الحالة", p.username as "اسم المستخدم",
             (select string_agg(distinct concat_ws(' / ', b.name, st.name, g.name, sec.name, sj.name), ' ، ')
                from public.staff_scope sc
                left join public.branches b on b.id = sc.branch_id left join public.stages st on st.id = sc.stage_id
                left join public.grades g on g.id = sc.grade_id left join public.sections sec on sec.id = sc.section_id
                left join public.subjects sj on sj.id = sc.subject_id
               where sc.employee_id = e.id) as "النطاق"
        from public.employees e left join public.profiles p on p.employee_id = e.id
       where p_branch is null or exists (select 1 from public.staff_scope sc where sc.employee_id = e.id and (sc.branch_id = p_branch or sc.branch_id is null))
       order by e.name_ar offset v_off limit v_lim) x;

  elsif p_table = 'grades' then
    select coalesce(json_agg(x), '[]'::json) into v from (
      select s.code as "رقم الطالب", s.name_ar as "اسم الطالب", concat_ws(' / ', g.name, sec.name) as "الفصل", b.name as "الفرع",
             t.name as "الفصل الدراسي", sj.name as "المادة", et.name as "نوع التقييم", a.title as "عنوان التقييم",
             a.kind::text as "طريقة التقييم", ge.score as "الدرجة", ge.max_score as "العظمى", ge.source::text as "المصدر",
             ge.recorded_at as "تاريخ الرصد", em.name_ar as "رصدها"
        from public.grade_entries ge
        join public.assessments a on a.id = ge.assessment_id
        join public.students s on s.id = ge.student_id
        join public.classes c on c.id = a.class_id
        join public.branches b on b.id = c.branch_id
        join public.grades g on g.id = c.grade_id
        join public.sections sec on sec.id = c.section_id
        join public.terms t on t.id = a.term_id
        join public.subjects sj on sj.id = a.subject_id
        left join public.eval_types et on et.id = a.eval_type_id
        left join public.employees em on em.id = ge.recorded_by
       where p_branch is null or c.branch_id = p_branch
       order by ge.id offset v_off limit v_lim) x;

  elsif p_table = 'totals' then
    -- مجاميع المواد بنفس قاعدة النتائج: لكل طالب ومادة وفصل دراسي ونوع ← (المستحق ÷ العظمى × الوزن)
    select coalesce(json_agg(x), '[]'::json) into v from (
      with ev as (
        select ge.student_id, a.subject_id, a.term_id, a.eval_type_id, sum(ge.score) as e, sum(ge.max_score) as m
          from public.grade_entries ge join public.assessments a on a.id = ge.assessment_id
          join public.classes c on c.id = a.class_id
         where p_branch is null or c.branch_id = p_branch
         group by 1, 2, 3, 4)
      select s.code as "رقم الطالب", s.name_ar as "اسم الطالب", t.name as "الفصل الدراسي", sj.name as "المادة",
             json_object_agg(coalesce(et.name, '—'), case when ev.m > 0 then round(ev.e / ev.m * coalesce(w.weight, 0), 2) end) as "الأنواع",
             round(sum(case when ev.m > 0 then ev.e / ev.m * coalesce(w.weight, 0) else 0 end), 2) as "المجموع"
        from ev
        join public.students s on s.id = ev.student_id
        join public.terms t on t.id = ev.term_id
        join public.subjects sj on sj.id = ev.subject_id
        left join public.eval_types et on et.id = ev.eval_type_id
        left join public.grade_weights w on w.subject_id = ev.subject_id and w.eval_type_id = ev.eval_type_id
       group by s.code, s.name_ar, t.name, sj.name, t.id, sj.id
       order by s.code, t.id, sj.name offset v_off limit v_lim) x;

  elsif p_table = 'assessments' then
    select coalesce(json_agg(x), '[]'::json) into v from (
      select a.id as "المعرّف", a.kind::text as "النوع", b.name as "الفرع", concat_ws(' / ', g.name, sec.name) as "الفصل",
             t.name as "الفصل الدراسي", sj.name as "المادة", et.name as "نوع التقييم", a.title as "العنوان",
             a.max_score as "العظمى", em.name_ar as "المعلم", a.published_at as "الطرح", a.due_at as "الانتهاء",
             a.grades_recorded_at as "تاريخ الرصد", a.description as "الوصف"
        from public.assessments a
        join public.classes c on c.id = a.class_id join public.branches b on b.id = c.branch_id
        join public.grades g on g.id = c.grade_id join public.sections sec on sec.id = c.section_id
        join public.terms t on t.id = a.term_id join public.subjects sj on sj.id = a.subject_id
        left join public.eval_types et on et.id = a.eval_type_id left join public.employees em on em.id = a.teacher_id
       where p_branch is null or c.branch_id = p_branch
       order by a.id offset v_off limit v_lim) x;

  elsif p_table = 'questions' then
    select coalesce(json_agg(x), '[]'::json) into v from (
      select a.id as "معرّف النموذج", a.title as "النموذج", q.position as "الترتيب", q.qtype::text as "نوع السؤال",
             q.body as "السؤال", q.points as "الدرجة",
             (select string_agg(o.body || case when o.is_correct then ' ✔' else '' end, ' | ' order by o.position)
                from public.question_options o where o.question_id = q.id) as "الخيارات",
             q.config::text as "إعدادات"
        from public.form_questions q join public.assessments a on a.id = q.assessment_id
        join public.classes c on c.id = a.class_id
       where p_branch is null or c.branch_id = p_branch
       order by a.id, q.position offset v_off limit v_lim) x;

  elsif p_table = 'attendance' then
    select coalesce(json_agg(x), '[]'::json) into v from (
      select ar.occurred_on as "التاريخ", ar.period_no as "الحصة", s.code as "رقم الطالب", s.name_ar as "اسم الطالب",
             concat_ws(' / ', g.name, sec.name) as "الفصل", sj.name as "المادة", ast.name as "الحالة", ar.note as "ملاحظة",
             em.name_ar as "سجّلها", ar.recorded_at as "وقت التسجيل"
        from public.attendance_records ar
        join public.students s on s.id = ar.student_id
        left join public.classes c on c.id = ar.class_id
        left join public.grades g on g.id = c.grade_id left join public.sections sec on sec.id = c.section_id
        left join public.subjects sj on sj.id = ar.subject_id
        left join public.attendance_statuses ast on ast.id = ar.status_id
        left join public.employees em on em.id = ar.recorded_by
       where p_branch is null or c.branch_id = p_branch
       order by ar.id offset v_off limit v_lim) x;

  elsif p_table = 'behavior' then
    select coalesce(json_agg(x), '[]'::json) into v from (
      select br.occurred_on as "التاريخ", s.code as "رقم الطالب", s.name_ar as "اسم الطالب", bs.name as "الحالة",
             br.score as "الدرجة", br.note as "ملاحظة", sj.name as "المادة", em.name_ar as "سجّلها", br.recorded_at as "وقت التسجيل"
        from public.behavior_records br
        join public.students s on s.id = br.student_id
        left join public.classes c on c.id = s.class_id
        left join public.behavior_statuses bs on bs.id = br.status_id
        left join public.subjects sj on sj.id = br.subject_id
        left join public.employees em on em.id = br.recorded_by
       where p_branch is null or c.branch_id = p_branch
       order by br.id offset v_off limit v_lim) x;

  elsif p_table = 'content' then
    select coalesce(json_agg(x), '[]'::json) into v from (
      select ci.kind::text as "النوع", ci.title as "العنوان", concat_ws(' / ', b.name, g.name, sec.name) as "الفصل",
             sj.name as "المادة", em.name_ar as "المعلم", ci.url as "الرابط", ci.body as "النص", ci.published_at as "النشر"
        from public.content_items ci
        join public.classes c on c.id = ci.class_id join public.branches b on b.id = c.branch_id
        join public.grades g on g.id = c.grade_id join public.sections sec on sec.id = c.section_id
        left join public.subjects sj on sj.id = ci.subject_id left join public.employees em on em.id = ci.teacher_id
       where p_branch is null or c.branch_id = p_branch
       order by ci.id offset v_off limit v_lim) x;

  elsif p_table = 'settings' then
    if v_off > 0 then return '[]'::json; end if;
    select coalesce(json_agg(json_build_object('المفتاح', s.key, 'القيمة', s.value::text)), '[]'::json) into v
      from public.app_settings s where s.key not in ('certificate');
  else
    raise exception 'جدول غير معروف';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 4) تصفير البيانات
--   p_parts: students (الطلاب وكل سجلاتهم وحساباتهم) · assessments (المهام والنماذج والرصد) ·
--            conduct (التحضير والسلوك) · content (الفيديوهات والإثراءات) · employees (الموظفون عدا الإدارة) · audit (سجل العمليات)
--   p_branch: فرع واحد أو null للكل. الموظفون وسجل العمليات للكل فقط.
--   يعيد: الأعداد + حسابات الدخول (يحذفها الخادم من Supabase Auth) + مسارات الملفات (يحذفها من التخزين)
-- ---------------------------------------------------------------------
create or replace function app.reset_scope(p_branch smallint)
returns table (student_ids bigint[], class_ids integer[], assessment_ids bigint[])
language plpgsql stable security definer set search_path = '' as $$
declare v_cls integer[];
begin
  select coalesce(array_agg(c.id), '{}') into v_cls from public.classes c where p_branch is null or c.branch_id = p_branch;
  return query select
    (select coalesce(array_agg(s.id), '{}') from public.students s where p_branch is null or s.class_id = any(v_cls)),
    v_cls,
    (select coalesce(array_agg(a.id), '{}') from public.assessments a where a.class_id = any(v_cls));
end $$;

create or replace function public.admin_reset_preview(p_branch smallint)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare sc record;
begin
  perform app.require_admin();
  select * into sc from app.reset_scope(p_branch);
  return jsonb_build_object(
    'students', cardinality(sc.student_ids),
    'accounts', (select count(*) from public.profiles p where p.student_id = any(sc.student_ids)),
    'assessments', cardinality(sc.assessment_ids),
    'grades', (select count(*) from public.grade_entries ge where ge.assessment_id = any(sc.assessment_ids) or ge.student_id = any(sc.student_ids)),
    'attendance', (select count(*) from public.attendance_records ar where ar.class_id = any(sc.class_ids) or ar.student_id = any(sc.student_ids)),
    'behavior', (select count(*) from public.behavior_records br where br.student_id = any(sc.student_ids)),
    'content', (select count(*) from public.content_items ci where ci.class_id = any(sc.class_ids)),
    'employees', case when p_branch is null then (select count(*) from public.employees e where e.user_type <> 'admin') end,
    'audit', case when p_branch is null then (select count(*) from public.audit_log) end,
    'last_backup', (select s.value from public.app_settings s where s.key = 'last_backup')
  );
end $$;

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

revoke all on function public.import_students(jsonb), public.import_term_grades(smallint, jsonb),
                       public.backup_rows(text, smallint, int, int), public.admin_reset_preview(smallint),
                       public.admin_reset_data(smallint, text[], text), app.reset_scope(smallint)
  from public, anon;
grant execute on function public.import_students(jsonb), public.import_term_grades(smallint, jsonb),
                          public.backup_rows(text, smallint, int, int), public.admin_reset_preview(smallint),
                          public.admin_reset_data(smallint, text[], text), app.reset_scope(smallint)
  to authenticated;
