-- =====================================================================
-- مِرقاة — 03: الأشخاص والحسابات
-- Students + Employees + Users + Students_Users
-- السجل الدراسي/الوظيفي منفصل عن حساب الدخول (كما هو الآن)، لكن الربط بمعرّف حقيقي.
-- =====================================================================

-- ---------------------------------------------------------------------
-- الطلاب
-- ---------------------------------------------------------------------
create table public.students (
  id               bigint generated always as identity primary key,
  code             text not null unique,            -- Students_id الحالي كما هو حرفيًا (نص، يحفظ الأصفار البادئة)
  national_id      text,
  name_ar          text not null,
  name_en          text,
  nationality      text,
  birth_date       date,
  birth_date_text  text,                            -- القيمة الأصلية إن لم تُفهم كتاريخ (هجري مثلًا) — لا تُفقد
  gender           text,
  class_id         integer references public.classes(id),
  fee_status       text,
  status           public.student_status not null default 'active',
  enrolled_at      timestamptz,                     -- "تاريخ التسجيل": فارغ = مسجَّل قبل وجود العمود (يخضع لكل النماذج)
  is_edited        boolean not null default false,  -- "تم التعديل"
  source_row       integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index students_national_id_uq on public.students (national_id) where national_id is not null and national_id <> '';
create index students_class_idx on public.students (class_id) where status = 'active';
create index students_name_idx on public.students using gin (to_tsvector('simple', name_ar));
create trigger students_touch before update on public.students
  for each row execute function app.touch_updated_at();
comment on table public.students is 'Students — العمود L (subject) معادلة بالشيت ولا يُنقل: المواد تُشتق من subject_matrix';

-- سجل انتقال الطالب بين الفصول (يُكتب تلقائيًا) — يحفظ أين كان الطالب في كل فترة
create table public.student_enrollments (
  id          bigint generated always as identity primary key,
  student_id  bigint not null references public.students(id) on delete cascade,
  class_id    integer not null references public.classes(id),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  constraint student_enrollments_dates_chk check (ended_at is null or ended_at >= started_at)
);
create unique index student_enrollments_open_uq on public.student_enrollments (student_id) where ended_at is null;

create or replace function app.track_student_class() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.class_id is not distinct from old.class_id then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    update public.student_enrollments set ended_at = now()
     where student_id = new.id and ended_at is null;
  end if;
  if new.class_id is not null then
    insert into public.student_enrollments (student_id, class_id, started_at)
    values (new.id, new.class_id, coalesce(new.enrolled_at, now()));
  end if;
  return new;
end $$;
create trigger students_track_class after insert or update of class_id on public.students
  for each row execute function app.track_student_class();

-- ---------------------------------------------------------------------
-- الموظفون
-- ---------------------------------------------------------------------
create table public.employees (
  id           bigint generated always as identity primary key,
  code         text not null unique,                -- Employees_id الحالي كما هو
  national_id  text,
  name_ar      text not null,
  name_en      text,
  user_type    text,                                -- كما في الشيت (user_types)
  job_role     text,                                -- كما في الشيت (role)
  gender       text,
  is_active    boolean not null default true,
  is_edited    boolean not null default false,
  source_row   integer,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index employees_national_id_uq on public.employees (national_id) where national_id is not null and national_id <> '';
create trigger employees_touch before update on public.employees
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------
-- نطاق صلاحية الموظف
-- لكل بُعد (فرع/مرحلة/صف/شعبة/مادة) قائمة مستقلة، كل صف يملأ عمودًا واحدًا (بمفتاح أجنبي حقيقي).
-- ⚠️ الرفض هو الأصل: بُعد بلا أي صف هنا = لا صلاحية فيه (تغيير مقصود عن النظام القديم).
-- ---------------------------------------------------------------------
create table public.staff_scope (
  id           bigint generated always as identity primary key,
  employee_id  bigint not null references public.employees(id) on delete cascade,
  branch_id    smallint references public.branches(id),
  stage_id     smallint references public.stages(id),
  grade_id     smallint references public.grades(id),
  section_id   smallint references public.sections(id),
  subject_id   smallint references public.subjects(id),
  created_at   timestamptz not null default now(),
  constraint staff_scope_one_dimension_chk
    check (num_nonnulls(branch_id, stage_id, grade_id, section_id, subject_id) = 1),
  constraint staff_scope_unique
    unique nulls not distinct (employee_id, branch_id, stage_id, grade_id, section_id, subject_id)
);
create index staff_scope_employee_idx on public.staff_scope (employee_id);
comment on table public.staff_scope is 'نطاق المعلم: يرى فقط ما خُوِّل به صراحةً في الفرع والصف والشعبة والمادة';

-- ---------------------------------------------------------------------
-- حسابات الدخول — مرتبطة بـ Supabase Auth
-- ---------------------------------------------------------------------
create table public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  username              citext not null unique,       -- الدخول باسم المستخدم كما الآن (بلا حساسية لحالة الأحرف)
  role                  public.app_role not null,
  student_id            bigint unique references public.students(id) on delete restrict,
  employee_id           bigint unique references public.employees(id) on delete restrict,
  status                public.account_status not null default 'active',
  legacy_status         text,                          -- قيمة account_statuses الأصلية إن لم تكن active
  legacy_role           text,                          -- role الأصلي (role_admin, role_teacher, ...)
  legacy_password_hash  text,                          -- SHA-256 القديم: يُتحقق منه عند أول دخول ثم يُمسح
  password_migrated_at  timestamptz,
  last_login_at         timestamptz,
  last_seen_at          timestamptz,                   -- كاشف الحضور
  source_sheet          text,
  source_row            integer,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint profiles_owner_chk check (
    (role = 'student' and student_id is not null and employee_id is null) or
    (role <> 'student' and employee_id is not null and student_id is null)
  )
);
create index profiles_last_seen_idx on public.profiles (last_seen_at) where last_seen_at is not null;
create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------
-- محاولات الدخول (حماية brute-force: 5 محاولات فاشلة = قفل 15 دقيقة)
-- يكتب فيها خادم الدخول فقط (service_role)
-- ---------------------------------------------------------------------
create table public.login_attempts (
  id            bigint generated always as identity primary key,
  username      citext not null,
  succeeded     boolean not null,
  ip            inet,
  attempted_at  timestamptz not null default now()
);
create index login_attempts_lookup_idx on public.login_attempts (username, attempted_at desc);

create or replace function app.login_is_locked(p_username citext) returns boolean
language sql stable security definer set search_path = '' as $$
  select count(*) >= 5
    from public.login_attempts a
   where a.username = p_username
     and not a.succeeded
     and a.attempted_at > now() - interval '15 minutes'
     and a.attempted_at > coalesce((select max(s.attempted_at) from public.login_attempts s
                                     where s.username = p_username and s.succeeded), '-infinity')
$$;
