-- =====================================================================
-- مِرقاة — 05: التقييم (قلب النظام)
-- Task_Log (المهام) + Forms + Form_Questions + Form_Responses + Daily Follow up + Grade Aggregation
--
-- الفكرة: كل شيء له درجة = "تقييم" واحد بمعرّف حقيقي (assessment). الرصد يرتبط به بالمعرّف،
-- لا بالعنوان النصي كما الآن. والتجميع لم يعد جدولًا يُحدَّث، بل View يُحسب لحظيًا من الرصد،
-- فيختفي كل خلل "نسيت إعادة حساب التجميع" و"القفل المتداخل" نهائيًا.
-- =====================================================================

create table public.assessments (
  id                   bigint generated always as identity primary key,
  kind                 public.assessment_kind not null,
  class_id             integer not null references public.classes(id),
  subject_id           smallint not null references public.subjects(id),
  term_id              smallint not null references public.terms(id),
  eval_type_id         smallint references public.eval_types(id),
  teacher_id           bigint references public.employees(id),
  title                text not null,
  description          text,
  link_url             text,
  max_score            numeric(7,2) check (max_score > 0),   -- للنماذج: يُحسب من مجموع درجات الأسئلة
  published_at         timestamptz,                          -- "تاريخ الطرح"
  due_at               timestamptz,                          -- "تاريخ الانتهاء" + "وقت الانتهاء"
  week_id              integer references public.calendar_entries(id),
  period_no            smallint check (period_no between 1 and 12),
  grades_recorded_at   timestamptz,                          -- "وقت وتاريخ تسجيل الرصد"
  grades_edited        boolean not null default false,       -- "هل تم التعديل على رصد التكليف"
  legacy_code          text,                                 -- Form_id الحالي (FM0011) للنماذج
  source_sheet         text,
  source_row           integer,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint assessments_max_score_chk check (kind = 'form' or max_score is not null)
);
create unique index assessments_legacy_code_uq on public.assessments (legacy_code) where legacy_code is not null;
create index assessments_class_subject_idx on public.assessments (class_id, subject_id, term_id);
create index assessments_teacher_idx on public.assessments (teacher_id);
create index assessments_published_idx on public.assessments (published_at);
create trigger assessments_touch before update on public.assessments
  for each row execute function app.touch_updated_at();

-- منع تغيير نوع التقييم بعد إنشائه (يكسر علاقاته بالنماذج والرصد)
create or replace function app.assessment_kind_immutable() returns trigger
language plpgsql as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'لا يمكن تغيير نوع التقييم بعد إنشائه';
  end if;
  return new;
end $$;
create trigger assessments_kind_immutable before update of kind on public.assessments
  for each row execute function app.assessment_kind_immutable();

-- ---------------------------------------------------------------------
-- إعدادات النموذج الإلكتروني (1:1 مع assessment من نوع form)
-- ---------------------------------------------------------------------
create table public.form_details (
  assessment_id       bigint primary key references public.assessments(id) on delete cascade,
  opens_at            timestamptz,
  closes_at           timestamptz,
  max_attempts        smallint not null default 1 check (max_attempts >= 1),
  status              public.form_status not null default 'draft',
  intro_video_url     text,
  absence_settled_at  timestamptz,                 -- "تمت تسوية الغياب"
  updated_at          timestamptz not null default now(),
  constraint form_details_window_chk check (opens_at is null or closes_at is null or closes_at > opens_at)
);
create index form_details_open_idx on public.form_details (status, closes_at);
create trigger form_details_touch before update on public.form_details
  for each row execute function app.touch_updated_at();

create or replace function app.form_details_kind_check() returns trigger
language plpgsql as $$
begin
  if (select kind from public.assessments where id = new.assessment_id) <> 'form' then
    raise exception 'form_details مسموح فقط لتقييم من نوع form';
  end if;
  return new;
end $$;
create trigger form_details_kind_check before insert on public.form_details
  for each row execute function app.form_details_kind_check();

-- ---------------------------------------------------------------------
-- الأسئلة والخيارات
-- ⚠️ الخيارات كانت نصًا واحدًا مفصولًا بـ || والإجابة الصحيحة نصًا. هنا كل خيار صف بمعرّف،
-- والصحيح علم على الخيار نفسه — فلا تتكرر مشكلة FM0011 (تحوّل "True" إلى TRUE) أبدًا.
-- ---------------------------------------------------------------------
create table public.form_questions (
  id                    bigint generated always as identity primary key,
  assessment_id         bigint not null references public.assessments(id) on delete cascade,
  position              integer not null,
  body                  text not null,
  image_url             text,
  points                numeric(7,2) not null default 0 check (points >= 0),
  section_title         text,                    -- "اسم القسم"
  section_instructions  text,                    -- "نص تعليمات القسم"
  legacy_code           text,                    -- Question_id الحالي
  legacy_correct_raw    text,                    -- الإجابة الصحيحة كما كانت نصًا (للتدقيق فقط)
  source_row            integer,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (assessment_id, position) deferrable initially immediate,
  unique (id, assessment_id)
);
create unique index form_questions_legacy_uq on public.form_questions (legacy_code) where legacy_code is not null;
create trigger form_questions_touch before update on public.form_questions
  for each row execute function app.touch_updated_at();

create table public.question_options (
  id           bigint generated always as identity primary key,
  question_id  bigint not null references public.form_questions(id) on delete cascade,
  position     smallint not null,
  body         text not null,
  is_correct   boolean not null default false,
  unique (question_id, position) deferrable initially immediate,
  unique (id, question_id)
);
create unique index question_options_one_correct_uq on public.question_options (question_id) where is_correct;
comment on column public.question_options.is_correct is '⚠️ لا يُكشف للطالب أبدًا قبل التسليم — يقرأ الطالب الأسئلة عبر get_form_for_student فقط';

-- ---------------------------------------------------------------------
-- محاولات الطلاب (Form_Responses)
-- attempt_no = 0 محجوز للصفر التلقائي (__AUTO_ABSENT__): لا يُحتسب محاولة مستهلكة
-- ---------------------------------------------------------------------
create table public.form_attempts (
  id              bigint generated always as identity primary key,
  assessment_id   bigint not null references public.assessments(id) on delete restrict,
  student_id      bigint not null references public.students(id) on delete restrict,
  attempt_no      smallint not null check (attempt_no >= 0),
  is_auto_absent  boolean not null default false,
  score           numeric(7,2) not null default 0 check (score >= 0),
  max_score       numeric(7,2) not null default 0 check (max_score >= 0),
  submitted_at    timestamptz not null default now(),
  raw_answers     jsonb,                          -- نص الإجابات الأصلي من الشيت كما هو (للنقل) — لا يُفقد
  legacy_code     text,                           -- Response_id الحالي
  source_row      integer,
  created_at      timestamptz not null default now(),
  unique (assessment_id, student_id, attempt_no),
  constraint form_attempts_absent_chk check (is_auto_absent = (attempt_no = 0)),
  constraint form_attempts_score_chk check (score <= max_score or max_score = 0)
);
create index form_attempts_student_idx on public.form_attempts (student_id);
create index form_attempts_submitted_idx on public.form_attempts (assessment_id, submitted_at desc);

-- الإجابة = معرّف الخيار. المفتاح المركّب يضمن أن الخيار ينتمي لنفس السؤال فعلًا
create table public.attempt_answers (
  attempt_id   bigint not null references public.form_attempts(id) on delete cascade,
  question_id  bigint not null references public.form_questions(id) on delete restrict,
  option_id    bigint not null,
  primary key (attempt_id, question_id),
  foreign key (option_id, question_id) references public.question_options(id, question_id) on delete restrict
);
create index attempt_answers_option_idx on public.attempt_answers (option_id);

-- ---------------------------------------------------------------------
-- الرصد (Daily Follow up) — رصد واحد لكل طالب لكل تقييم
-- ---------------------------------------------------------------------
create table public.grade_entries (
  id             bigint generated always as identity primary key,
  assessment_id  bigint not null references public.assessments(id) on delete restrict,
  student_id     bigint not null references public.students(id) on delete restrict,
  score          numeric(7,2) not null check (score >= 0),
  max_score      numeric(7,2) not null check (max_score > 0),
  source         public.grade_source not null default 'manual',
  recorded_by    bigint references public.employees(id),   -- فارغ = تسليم طالب أو النظام
  recorded_at    timestamptz not null default now(),       -- "تاريخ الرصد" — لا يتغيّر بالتعديل
  is_edited      boolean not null default false,
  edited_at      timestamptz,
  edited_by      uuid,
  source_row     integer,
  created_at     timestamptz not null default now(),
  constraint grade_entries_score_chk check (score <= max_score),
  unique (assessment_id, student_id)
);
create index grade_entries_student_idx on public.grade_entries (student_id);
create index grade_entries_recorded_by_idx on public.grade_entries (recorded_by, recorded_at desc);

-- التعديل: يحفظ تاريخ الرصد الأصلي ومن رصده، ويعلّم السجل كمعدَّل (نفس منطق apiSaveRoster)
create or replace function app.grade_entries_on_update() returns trigger
language plpgsql as $$
begin
  if new.student_id <> old.student_id or new.assessment_id <> old.assessment_id then
    raise exception 'لا يمكن نقل رصد إلى طالب أو تقييم آخر — احذفه وأنشئ رصدًا جديدًا';
  end if;
  if app.is_migrating() then return new; end if;
  new.recorded_at := old.recorded_at;
  new.recorded_by := old.recorded_by;
  if (new.score, new.max_score) is distinct from (old.score, old.max_score) then
    new.is_edited := true;
    new.edited_at := now();
    new.edited_by := auth.uid();
  end if;
  return new;
end $$;
create trigger grade_entries_on_update before update on public.grade_entries
  for each row execute function app.grade_entries_on_update();

-- إخفاء نتيجة مادة لطالب في فصل دراسي ("امكانية الرؤية" = لا). غياب الصف = ظاهرة
create table public.grade_visibility (
  student_id  bigint not null references public.students(id) on delete cascade,
  subject_id  smallint not null references public.subjects(id),
  term_id     smallint not null references public.terms(id),
  is_visible  boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  primary key (student_id, subject_id, term_id)
);

-- ---------------------------------------------------------------------
-- التجميع — نفس معادلة recalcMyGradeAggregation_ حرفيًا:
--   لكل (طالب، مادة، فصل، نوع تقييم): round((مجموع المستحق / مجموع العظمى) × النسبة, 2)
--   نوع تقييم بلا نسبة مسجّلة = نسبته 0 (كما الآن)
-- ---------------------------------------------------------------------
create view public.grade_breakdown with (security_invoker = true) as
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
 group by g.student_id, a.term_id, a.subject_id, a.eval_type_id, w.weight;
comment on view public.grade_breakdown is 'Grade Aggregation مفصّلًا: صف لكل نوع تقييم بدل 9 أعمدة ثابتة';

create view public.grade_totals with (security_invoker = true) as
select b.student_id,
       b.term_id,
       b.subject_id,
       sum(b.weighted_score)                             as total,
       coalesce(v.is_visible, true)                      as is_visible
  from public.grade_breakdown b
  left join public.grade_visibility v
         on v.student_id = b.student_id and v.subject_id = b.subject_id and v.term_id = b.term_id
 group by b.student_id, b.term_id, b.subject_id, v.is_visible;
comment on view public.grade_totals is 'مجموع الطالب في كل مادة لكل فصل — يُحسب لحظيًا، لا يحتاج إعادة حساب';

-- الدرجة العظمى الفعلية لكل نموذج = مجموع درجات أسئلته
create view public.form_max_scores with (security_invoker = true) as
select q.assessment_id, sum(q.points) as max_score, count(*) as questions_count
  from public.form_questions q
 group by q.assessment_id;
