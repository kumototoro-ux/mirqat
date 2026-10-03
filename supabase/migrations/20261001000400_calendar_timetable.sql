-- =====================================================================
-- مِرقاة — 04: التقويم والجداول
-- School Calendar + Class Timetable (جدول الحصص وجدول الاختبارات صارا جدولين منفصلين)
-- =====================================================================

-- ---------------------------------------------------------------------
-- التقويم الدراسي — صفوف الشيت كما هي (أسابيع + إجازات + أحداث)
-- ---------------------------------------------------------------------
create table public.calendar_entries (
  id            integer generated always as identity primary key,
  term_id       smallint not null references public.terms(id),
  period_label  text,                 -- "الفترة"
  week_label    text,                 -- "الاسبوع" كما هو نصًا
  starts_on     date not null,
  ends_on       date not null,
  event         text,                 -- "الحدث"
  color         text,
  source_row    integer,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint calendar_entries_dates_chk check (ends_on >= starts_on)
);
create index calendar_entries_range_idx on public.calendar_entries (starts_on, ends_on);
create trigger calendar_entries_touch before update on public.calendar_entries
  for each row execute function app.touch_updated_at();

-- الأسابيع القابلة للتصفح: نفس منطق النظام الحالي — أي صف مداه محتوى بالكامل داخل صف أوسع
-- (إجازة داخل أسبوع مثل "اليوم الوطني") لا يُعدّ أسبوعًا، بل حدثًا يوميًا فقط.
create view public.school_weeks with (security_invoker = true) as
select e.id            as week_id,
       e.term_id,
       e.week_label,
       e.period_label,
       e.starts_on,
       e.ends_on,
       row_number() over (partition by e.term_id order by e.starts_on, e.id) as week_no
  from public.calendar_entries e
 where not exists (
   select 1 from public.calendar_entries o
    where o.id <> e.id
      and o.starts_on <= e.starts_on and o.ends_on >= e.ends_on
      and (o.ends_on - o.starts_on) > (e.ends_on - e.starts_on)
 );
comment on view public.school_weeks is 'الأسابيع الفعلية فقط، بلا صفوف الإجازات المحتواة داخل أسابيع';

-- ---------------------------------------------------------------------
-- جدول الحصص الأسبوعي
-- اليوم رقم: 0 الأحد ... 4 الخميس. الحصة رقم 1–12. لا حاجة بعد اليوم لـ dayKey_ أو periodOrder_.
-- ---------------------------------------------------------------------
create table public.timetable_slots (
  id             integer generated always as identity primary key,
  class_id       integer not null references public.classes(id),
  subject_id     smallint not null references public.subjects(id),
  teacher_id     bigint references public.employees(id),
  day_of_week    smallint not null check (day_of_week between 0 and 4),
  period_no      smallint not null check (period_no between 1 and 12),
  starts_at      time,                  -- "الوقت" إن وُجد
  delivery_mode  text,                  -- "نوع الحصة": افتراضي / ذاتي
  color          text,
  source_row     integer,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- يسمح بأكثر من مادة في نفس الحصة (مجموعات منفصلة)، ويمنع تكرار نفس المادة في نفس الحصة
  unique (class_id, day_of_week, period_no, subject_id)
);
create index timetable_slots_class_idx on public.timetable_slots (class_id, day_of_week, period_no);
create index timetable_slots_teacher_idx on public.timetable_slots (teacher_id);
create trigger timetable_slots_touch before update on public.timetable_slots
  for each row execute function app.touch_updated_at();
comment on table public.timetable_slots is 'Class Timetable حيث النوع = جدول حصص';

-- ---------------------------------------------------------------------
-- جدول الاختبارات
-- ---------------------------------------------------------------------
create table public.exam_schedule (
  id           integer generated always as identity primary key,
  class_id     integer not null references public.classes(id),
  subject_id   smallint not null references public.subjects(id),
  teacher_id   bigint references public.employees(id),
  term_id      smallint references public.terms(id),
  exam_date    date not null,
  starts_at    time,
  exam_period  text,                    -- "فتره الاختبار"
  color        text,
  source_row   integer,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index exam_schedule_class_idx on public.exam_schedule (class_id, exam_date);
create trigger exam_schedule_touch before update on public.exam_schedule
  for each row execute function app.touch_updated_at();
comment on table public.exam_schedule is 'Class Timetable حيث النوع = جدول اختبارات';
