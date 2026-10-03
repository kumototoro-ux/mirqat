-- =====================================================================
-- مِرقاة — 06: المحتوى، ربط الحصص، التحضير، السلوك
-- Enrichment Log + Student_Views + Period Links + Attendance and Absence + Behavior
-- =====================================================================

-- ---------------------------------------------------------------------
-- الفيديوهات والإثراءات (لا درجة لها)
-- ---------------------------------------------------------------------
create table public.content_items (
  id            bigint generated always as identity primary key,
  kind          public.content_kind not null,
  class_id      integer not null references public.classes(id),
  subject_id    smallint not null references public.subjects(id),
  term_id       smallint references public.terms(id),
  teacher_id    bigint references public.employees(id),
  title         text not null,
  description   text,
  url           text,
  published_at  timestamptz,
  expires_at    timestamptz,
  source_row    integer,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index content_items_class_idx on public.content_items (class_id, subject_id);
create index content_items_teacher_idx on public.content_items (teacher_id);
create trigger content_items_touch before update on public.content_items
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------
-- رصد المشاهدة (Student_Views) — كان مرتبطًا بالعنوان النصي، صار بالمعرّف
-- ---------------------------------------------------------------------
create table public.student_views (
  id               bigint generated always as identity primary key,
  student_id       bigint not null references public.students(id) on delete cascade,
  assessment_id    bigint references public.assessments(id) on delete cascade,
  content_item_id  bigint references public.content_items(id) on delete cascade,
  viewed_at        timestamptz not null default now(),
  source_row       integer,
  constraint student_views_target_chk check (num_nonnulls(assessment_id, content_item_id) = 1),
  constraint student_views_unique unique nulls not distinct (student_id, assessment_id, content_item_id)
);

-- ---------------------------------------------------------------------
-- ربط الحصص بمحتواها الأسبوعي (Period Links)
-- ⚠️ كان يخزّن أرقام صفوف (Timetable_row، رقم صف المحتوى) فيتلف الربط بصمت عند حذف أي صف.
-- هنا مفاتيح أجنبية حقيقية: حذف تكليف يحذف روابطه فقط، ولا يُزيح أي رابط آخر.
-- ---------------------------------------------------------------------
create table public.period_links (
  id               bigint generated always as identity primary key,
  slot_id          integer not null references public.timetable_slots(id) on delete cascade,
  week_id          integer not null references public.calendar_entries(id),
  assessment_id    bigint references public.assessments(id) on delete cascade,
  content_item_id  bigint references public.content_items(id) on delete cascade,
  linked_by        bigint references public.employees(id),
  linked_at        timestamptz not null default now(),
  source_row       integer,
  constraint period_links_target_chk check (num_nonnulls(assessment_id, content_item_id) = 1),
  constraint period_links_unique unique nulls not distinct (slot_id, week_id, assessment_id, content_item_id)
);
create index period_links_week_idx on public.period_links (week_id, slot_id);

-- ---------------------------------------------------------------------
-- التحضير — سجل واحد لكل طالب لكل حصة في يوم محدد من أسبوع محدد
-- ---------------------------------------------------------------------
create table public.attendance_records (
  id             bigint generated always as identity primary key,
  student_id     bigint not null references public.students(id) on delete restrict,
  week_id        integer not null references public.calendar_entries(id),
  day_of_week    smallint not null check (day_of_week between 0 and 4),
  period_no      smallint not null check (period_no between 1 and 12),
  subject_id     smallint references public.subjects(id),
  status_id      smallint not null references public.attendance_statuses(id),
  note           text,
  recorded_by    bigint references public.employees(id),
  recorder_type  text,                     -- "نوع الشخص"
  recorded_at    timestamptz not null default now(),   -- "وقت التسجيل" — أساس مهل التعديل والحذف
  is_edited      boolean not null default false,
  edited_at      timestamptz,
  source_row     integer,
  unique (student_id, week_id, day_of_week, period_no)
);
create index attendance_records_week_idx on public.attendance_records (week_id, day_of_week, period_no);
create index attendance_records_recorded_by_idx on public.attendance_records (recorded_by, recorded_at desc);

create or replace function app.attendance_on_update() returns trigger
language plpgsql as $$
begin
  if new.student_id <> old.student_id then
    raise exception 'لا يمكن نقل سجل تحضير إلى طالب آخر';
  end if;
  if app.is_migrating() then return new; end if;
  new.recorded_at := old.recorded_at;
  new.recorded_by := old.recorded_by;
  new.is_edited := true;
  new.edited_at := now();
  return new;
end $$;
create trigger attendance_on_update before update on public.attendance_records
  for each row execute function app.attendance_on_update();

-- ---------------------------------------------------------------------
-- السلوك (إدارة فقط)
-- ---------------------------------------------------------------------
create table public.behavior_records (
  id             bigint generated always as identity primary key,
  student_id     bigint not null references public.students(id) on delete restrict,
  term_id        smallint references public.terms(id),
  week_id        integer references public.calendar_entries(id),
  day_of_week    smallint check (day_of_week between 0 and 4),
  status_id      smallint references public.behavior_statuses(id),
  score          numeric(7,2),
  note           text,
  recorded_by    bigint references public.employees(id),
  recorder_type  text,
  recorded_at    timestamptz not null default now(),
  source_row     integer
);
create index behavior_records_student_idx on public.behavior_records (student_id, term_id);
