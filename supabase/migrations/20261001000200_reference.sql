-- =====================================================================
-- مِرقاة — 02: البنية التنظيمية والقوائم المرجعية
-- بديل أعمدة شيت Settings (كل عمود كان قائمة مستقلة) + Subject Distribution Matrix
-- + Grade Distribution. كل قائمة صارت جدولًا بمعرّف، فلا تُكرَّر الأسماء النصية في كل مكان.
-- =====================================================================

-- ---------------------------------------------------------------------
-- العام الدراسي والفصول
-- ⚠️ جديد: النظام الحالي يميّز الترم بالاسم فقط ("الترم الأول")، فيتصادم ترم هذا العام مع
-- ترم العام القادم. ربط الترم بعام دراسي يسمح بالأرشفة والمقارنة بين الأعوام مستقبلًا.
-- ---------------------------------------------------------------------
create table public.academic_years (
  id          smallint generated always as identity primary key,
  name        text not null unique,                -- مثال: 1448هـ أو 2026-2027
  starts_on   date,
  ends_on     date,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint academic_years_dates_chk check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create unique index academic_years_one_current_idx on public.academic_years (is_current) where is_current;
comment on table public.academic_years is 'الأعوام الدراسية — عام واحد فقط يكون الحالي';

create table public.terms (
  id                smallint generated always as identity primary key,
  academic_year_id  smallint not null references public.academic_years(id),
  name              text not null,                 -- كما هو حرفيًا من Settings عمود J
  sort_order        smallint not null default 0,
  created_at        timestamptz not null default now(),
  unique (academic_year_id, name)
);
comment on table public.terms is 'الفصول الدراسية (Settings → terms)';

-- ---------------------------------------------------------------------
-- الفروع والمراحل والصفوف والشعب والمواد
-- ---------------------------------------------------------------------
create table public.branches (
  id          smallint generated always as identity primary key,
  name        text not null unique,
  sort_order  smallint not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.stages (
  id          smallint generated always as identity primary key,
  name        text not null unique,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now()
);

-- الصف ينتمي لمرحلة: "الأول" في الابتدائي غير "الأول" في المتوسط
create table public.grades (
  id          smallint generated always as identity primary key,
  stage_id    smallint not null references public.stages(id),
  name        text not null,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now(),
  unique (stage_id, name)
);

create table public.sections (
  id          smallint generated always as identity primary key,
  name        text not null unique,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now()
);

create table public.subjects (
  id          smallint generated always as identity primary key,
  name        text not null unique,
  sort_order  smallint not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- الفصل الدراسي الفعلي (فرع + صف + شعبة) — الوحدة التي يُسجَّل فيها الطالب ويُكلَّف
-- ---------------------------------------------------------------------
create table public.classes (
  id          integer generated always as identity primary key,
  branch_id   smallint not null references public.branches(id),
  grade_id    smallint not null references public.grades(id),
  section_id  smallint not null references public.sections(id),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (branch_id, grade_id, section_id)
);
create index classes_grade_idx on public.classes (grade_id);
comment on table public.classes is 'الفصول: كل تركيبة (فرع، صف، شعبة) فصل واحد. المرحلة تُعرف من الصف';

-- ---------------------------------------------------------------------
-- توزيع المواد (Subject Distribution Matrix)
-- section_id فارغ = كل شعب هذا الصف في هذا الفرع (نفس سلوك الشيت الحالي حرفيًا)
-- ---------------------------------------------------------------------
create table public.subject_matrix (
  id          integer generated always as identity primary key,
  branch_id   smallint not null references public.branches(id),
  grade_id    smallint not null references public.grades(id),
  section_id  smallint references public.sections(id),
  subject_id  smallint not null references public.subjects(id),
  source_row  integer,
  created_at  timestamptz not null default now(),
  constraint subject_matrix_unique unique nulls not distinct (branch_id, grade_id, section_id, subject_id)
);
create index subject_matrix_lookup_idx on public.subject_matrix (branch_id, grade_id);
comment on table public.subject_matrix is 'المواد الموزعة على كل صف/شعبة. مواد الطالب تُشتق من هنا ولا تُخزَّن بحسابه';

-- ---------------------------------------------------------------------
-- أنواع التقييم ونسبها
-- ⚠️ النظام الحالي يثبّت 9 أعمدة لأنواع التقييم في شيت التجميع. هنا كل نوع صف مستقل،
-- فإضافة نوع تقييم جديد مستقبلًا لا تحتاج أي تعديل على بنية القاعدة.
-- ---------------------------------------------------------------------
create table public.eval_types (
  id          smallint generated always as identity primary key,
  name        text not null unique,
  category    text not null default 'continuous' check (category in ('continuous', 'exam')),
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now()
);
comment on table public.eval_types is 'أنواع التقييم: continuous من Settings عمود L، و exam من عمود M';

create table public.grade_weights (
  id            integer generated always as identity primary key,
  subject_id    smallint not null references public.subjects(id),
  eval_type_id  smallint not null references public.eval_types(id),
  weight        numeric(6,2) not null check (weight >= 0 and weight <= 100),
  source_row    integer,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (subject_id, eval_type_id)
);
create trigger grade_weights_touch before update on public.grade_weights
  for each row execute function app.touch_updated_at();
comment on table public.grade_weights is 'Grade Distribution: نسبة كل نوع تقييم من 100 لكل مادة';

-- ---------------------------------------------------------------------
-- قوائم الحالات
-- ---------------------------------------------------------------------
create table public.attendance_statuses (
  id          smallint generated always as identity primary key,
  name        text not null unique,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now()
);

create table public.behavior_statuses (
  id          smallint generated always as identity primary key,
  name        text not null unique,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- إعدادات النظام (اسم المدرسة، الشعار، التحكم بالرؤية...)
-- يشمل ما كان مخزّنًا خارج الشيت في Script Properties (calendar_visibility, exam_visibility)
-- ---------------------------------------------------------------------
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  is_public   boolean not null default false,   -- true = يُقرأ قبل تسجيل الدخول (اسم المدرسة والشعار)
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create trigger app_settings_touch before update on public.app_settings
  for each row execute function app.touch_updated_at();
comment on table public.app_settings is 'إعدادات عامة بصيغة مفتاح/قيمة JSON';
