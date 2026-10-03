-- =====================================================================
-- مِرقاة — 12: تعديلات اكتُشفت من البيانات الحقيقية + أدوات النقل
-- =====================================================================

-- 1) التحضير: الحصة الواحدة قد تجمع مادتين (قرار سابق) — القيد الفريد يشمل المادة
alter table public.attendance_records
  drop constraint attendance_records_student_id_week_id_day_of_week_period_no_key;
alter table public.attendance_records
  add constraint attendance_records_unique
  unique nulls not distinct (student_id, week_id, day_of_week, period_no, subject_id);

-- 2) المحتوى يأتي من شيتين (Enrichment Log وصفوف الفيديو/الإثراء في Task Log) — نحفظ المصدر
alter table public.content_items add column source_sheet text;

-- 3) محاسبة الصفوف: كل صف في كل شيت يجب أن يظهر هنا مرة واحدة بالضبط عند نهاية النقل
create table migration.row_map (
  source_sheet  text not null,
  source_row    integer not null,
  status        text not null check (status in ('migrated', 'quarantined', 'merged', 'derived')),
  target_table  text,
  target_id     text,
  note          text,
  primary key (source_sheet, source_row)
);
comment on table migration.row_map is
  'migrated = نُقل، quarantined = في الحجر، merged = مدموج في صف آخر (مثل صف التكليف المرافق لنموذج)، derived = بيانات محسوبة لا تُنقل (التجميع)';

-- 4) حسابات الدخول القديمة — تُحفظ هنا إلى أن تُنشأ حسابات Supabase Auth لاحقًا بأداة من الخادم
create table migration.legacy_accounts (
  id               integer generated always as identity primary key,
  kind             text not null check (kind in ('staff', 'student')),
  code             text not null,
  username         text not null,
  password_value   text,
  password_hashed  boolean not null,
  status_raw       text,
  user_type        text,
  role_raw         text,
  full_name        text,
  scope_branch     text,
  scope_subject    text,
  scope_grades     text,
  scope_sections   text,
  source_sheet     text not null,
  source_row       integer not null,
  auth_user_id     uuid,          -- يُملأ عند إنشاء الحساب الحقيقي
  unique (kind, code)
);

-- 5) أدوات بحث صارمة: إن لم تجد القيمة ترمي خطأ، فتُلغى المعاملة كاملة بدل ربط خاطئ صامت
create or replace function migration.must(v anyelement, what text) returns anyelement
language plpgsql immutable as $$
begin
  if v is null then raise exception 'النقل: لم يُعثر على %', what; end if;
  return v;
end $$;

create or replace function migration.branch_id(p text) returns smallint language sql stable as
$$ select migration.must((select id from public.branches where name = p), 'فرع ' || p) $$;
create or replace function migration.stage_id(p text) returns smallint language sql stable as
$$ select migration.must((select id from public.stages where name = p), 'مرحلة ' || p) $$;
create or replace function migration.grade_id(p_stage text, p_grade text) returns smallint language sql stable as
$$ select migration.must((select g.id from public.grades g join public.stages s on s.id = g.stage_id
                            where s.name = p_stage and g.name = p_grade), 'صف ' || p_stage || '/' || p_grade) $$;
create or replace function migration.section_id(p text) returns smallint language sql stable as
$$ select migration.must((select id from public.sections where name = p), 'شعبة ' || p) $$;
create or replace function migration.subject_id(p text) returns smallint language sql stable as
$$ select migration.must((select id from public.subjects where name = p), 'مادة ' || p) $$;
create or replace function migration.term_id(p text) returns smallint language sql stable as
$$ select migration.must((select t.id from public.terms t join public.academic_years y on y.id = t.academic_year_id
                            where y.is_current and t.name = p), 'فصل دراسي ' || p) $$;
create or replace function migration.eval_type_id(p text) returns smallint language sql stable as
$$ select migration.must((select id from public.eval_types where name = p), 'نوع تقييم ' || p) $$;
create or replace function migration.class_id(p_branch text, p_stage text, p_grade text, p_section text) returns integer language sql stable as
$$ select migration.must((select c.id from public.classes c
                            where c.branch_id = migration.branch_id(p_branch)
                              and c.grade_id = migration.grade_id(p_stage, p_grade)
                              and c.section_id = migration.section_id(p_section)),
                         'فصل ' || p_branch || '/' || p_grade || '/' || p_section) $$;
create or replace function migration.employee_id(p text) returns bigint language sql stable as
$$ select migration.must((select id from public.employees where code = p), 'موظف ' || p) $$;
create or replace function migration.student_id(p text) returns bigint language sql stable as
$$ select migration.must((select id from public.students where code = p), 'طالب ' || p) $$;
create or replace function migration.calendar_id(p_term text, p_start date, p_end date) returns integer language sql stable as
$$ select migration.must((select id from public.calendar_entries
                            where term_id = migration.term_id(p_term) and starts_on = p_start and ends_on = p_end),
                         'صف تقويم ' || p_term || ' ' || p_start) $$;
create or replace function migration.task_id(p_row integer) returns bigint language sql stable as
$$ select migration.must((select id from public.assessments where source_sheet = 'Task Log' and source_row = p_row),
                         'تكليف صف ' || p_row) $$;
create or replace function migration.content_id(p_sheet text, p_row integer) returns bigint language sql stable as
$$ select migration.must((select id from public.content_items where source_sheet = p_sheet and source_row = p_row),
                         'محتوى ' || p_sheet || ' صف ' || p_row) $$;
create or replace function migration.slot_id(p_row integer) returns integer language sql stable as
$$ select migration.must((select id from public.timetable_slots where source_row = p_row), 'حصة صف ' || p_row) $$;
create or replace function migration.form_id(p_code text) returns bigint language sql stable as
$$ select migration.must((select id from public.assessments where kind = 'form' and legacy_code = p_code), 'نموذج ' || p_code) $$;
create or replace function migration.question_id(p_form text, p_code text) returns bigint language sql stable as
$$ select migration.must((select q.id from public.form_questions q
                            where q.assessment_id = migration.form_id(p_form) and q.legacy_code = p_code),
                         'سؤال ' || p_form || '/' || p_code) $$;

-- 6) حذف مؤقت لـ unique على legacy_code للأسئلة: معرّف السؤال قد يتكرر بين نموذجين في البيانات القديمة
drop index public.form_questions_legacy_uq;
create unique index form_questions_legacy_uq on public.form_questions (assessment_id, legacy_code) where legacy_code is not null;
