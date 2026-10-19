-- =====================================================================
-- مِرقاة — 20: المهام والنماذج في مكان واحد
--
-- المهام:   مرفقات (صورة/ملف/رابط) + تسليم الطالب (نص و/أو ملفات ≤ 1 ميقا) + تصحيح ورصد
--           حذف ملفات التسليم المصحَّحة تلقائيًا بعد مدة (إعداد للإداري) — النصوص لا تُحذف أبدًا
-- النماذج:  أنواع أسئلة (اختيار، صح/خطأ، قصيرة، مقالية، توصيل، فراغات) + رياضيات (LaTeX)
--           جلسة حل على الخادم: حفظ تلقائي، استكمال من أي جهاز، مدة لكل طالب، خلط لكل طالب
--           تعديل الإجابة الصحيحة بعد التسليم = إعادة تصحيح تلقائية لكل المحاولات
--           سجل الخروج من الصفحة/تبديل التبويب، وتصحيح يدوي للمقالي
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) أعمدة المهام
-- ---------------------------------------------------------------------
alter table public.assessments
  add column is_draft         boolean not null default false,
  add column submission_mode  text not null default 'none'
    check (submission_mode in ('none', 'text', 'file', 'any')),
  add column allow_late       boolean not null default false;
comment on column public.assessments.submission_mode is 'none = بلا تسليم (رصد فقط)، text = جواب نصي، file = ملف/صورة، any = نص أو ملف';

-- الطالب يرى المهمة بعد نشرها وحلول تاريخ طرحها؛ والنموذج بعد نشره (كما كان)
create or replace function app.student_sees_assessment(p_assessment_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select a.class_id = app.my_class_id()
       and not a.is_draft
       and (a.kind <> 'task' or a.published_at is null or a.published_at <= now())
       and (a.kind <> 'form' or exists (
             select 1 from public.form_details f
              where f.assessment_id = a.id and f.status in ('published', 'closed')))
      from public.assessments a where a.id = p_assessment_id
  ), false)
$$;

-- مرفقات المعلم (صورة/ملف في مخزن الموقع، أو رابط خارجي)
create table public.assessment_attachments (
  id             bigint generated always as identity primary key,
  assessment_id  bigint not null references public.assessments(id) on delete cascade,
  kind           text not null check (kind in ('image', 'file', 'link')),
  name           text not null check (char_length(name) between 1 and 200),
  url            text check (url is null or url ~* '^https?://'),
  storage_path   text,
  mime           text,
  size_bytes     integer check (size_bytes is null or size_bytes between 1 and 3145728),
  position       smallint not null default 0,
  created_at     timestamptz not null default now(),
  constraint attachments_target_chk check ((kind = 'link') = (url is not null) and (kind = 'link') = (storage_path is null))
);
create index assessment_attachments_idx on public.assessment_attachments (assessment_id, position);

-- تسليم الطالب: نص واحد لكل طالب لكل مهمة، والملفات في جدول مستقل
create table public.task_submissions (
  id               bigint generated always as identity primary key,
  assessment_id    bigint not null references public.assessments(id) on delete cascade,
  student_id       bigint not null references public.students(id) on delete restrict,
  body             text check (body is null or char_length(body) <= 20000),
  is_late          boolean not null default false,
  submitted_at     timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  graded_at        timestamptz,
  graded_by        bigint references public.employees(id),
  feedback         text check (feedback is null or char_length(feedback) <= 4000),
  files_purged_at  timestamptz,
  unique (assessment_id, student_id)
);
create index task_submissions_graded_idx on public.task_submissions (graded_at) where graded_at is not null;
create index task_submissions_student_idx on public.task_submissions (student_id);

create table public.submission_files (
  id             bigint generated always as identity primary key,
  submission_id  bigint not null references public.task_submissions(id) on delete cascade,
  storage_path   text not null unique,
  name           text not null check (char_length(name) between 1 and 200),
  mime           text not null,
  size_bytes     integer not null check (size_bytes between 1 and 1048576),
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index submission_files_live_idx on public.submission_files (submission_id) where deleted_at is null;

-- ملف رفعه الطالب ولم يُسلَّم بعد: التسليم لا يقبل إلا مسارًا رفعه نفس الطالب فعلًا
create table public.pending_uploads (
  storage_path   text primary key,
  student_id     bigint not null references public.students(id) on delete cascade,
  assessment_id  bigint not null references public.assessments(id) on delete cascade,
  name           text not null,
  mime           text not null,
  size_bytes     integer not null check (size_bytes between 1 and 1048576),
  created_at     timestamptz not null default now()
);
create index pending_uploads_created_idx on public.pending_uploads (created_at);

-- ---------------------------------------------------------------------
-- 2) أعمدة النماذج
-- ---------------------------------------------------------------------
alter table public.form_details
  add column shuffle_questions   boolean not null default false,
  add column shuffle_options     boolean not null default false,
  add column time_limit_minutes  smallint check (time_limit_minutes is null or time_limit_minutes between 1 and 600),
  add column show_results        text not null default 'after_submit'
    check (show_results in ('after_submit', 'after_close', 'never')),
  add column track_focus         boolean not null default true;

alter table public.form_questions
  add column qtype        text not null default 'mcq'
    check (qtype in ('mcq', 'tf', 'short', 'long', 'match', 'fill')),
  add column config       jsonb not null default '{}'::jsonb,
  add column explanation  text;
comment on column public.form_questions.config is
  'short: {answers:[..]} | long: {max_chars} | match: {pairs:[{l,r}]} | fill: {blanks:[[..],[..]]} والنص فيه [[1]] [[2]]';

-- الإجابة صارت عامة: خيار (اختيار/صح وخطأ) أو نص أو توصيل أو فراغات
alter table public.attempt_answers
  alter column option_id drop not null,
  add column response  jsonb,
  add column points    numeric(7,2) not null default 0 check (points >= 0),
  add column status    text not null default 'auto' check (status in ('auto', 'pending', 'manual')),
  add column feedback  text;

-- الإجابات المنقولة من النظام القديم: درجتها تُحسب الآن من الخيار نفسه
update public.attempt_answers aa
   set points = case when o.is_correct then q.points else 0 end
  from public.question_options o, public.form_questions q
 where o.id = aa.option_id and q.id = aa.question_id;

alter table public.form_attempts
  add column pending_review    smallint not null default 0,
  add column duration_seconds  integer,
  add column focus_events      integer not null default 0;

-- جلسة الحل: تبدأ عند فتح الطالب للنموذج وتُحفظ إجاباته فيها أولًا بأول
create table public.form_sessions (
  id              bigint generated always as identity primary key,
  assessment_id   bigint not null references public.assessments(id) on delete cascade,
  student_id      bigint not null references public.students(id) on delete cascade,
  started_at      timestamptz not null default now(),
  deadline_at     timestamptz,
  question_order  bigint[] not null,
  option_order    jsonb not null default '{}'::jsonb,
  answers         jsonb not null default '{}'::jsonb,
  saved_at        timestamptz,
  submitted_at    timestamptz,
  attempt_id      bigint references public.form_attempts(id) on delete set null,
  focus_events    integer not null default 0
);
create unique index form_sessions_open_uq on public.form_sessions (assessment_id, student_id) where submitted_at is null;
create index form_sessions_deadline_idx on public.form_sessions (deadline_at) where submitted_at is null;

create table public.form_events (
  id          bigint generated always as identity primary key,
  session_id  bigint not null references public.form_sessions(id) on delete cascade,
  kind        text not null check (kind in ('blur', 'hidden', 'paste', 'copy', 'fullscreen_exit', 'resume')),
  at          timestamptz not null default now()
);
create index form_events_session_idx on public.form_events (session_id, at);

-- إعداد حذف ملفات التسليم
insert into public.app_settings (key, value, is_public)
values ('submission_purge', '{"enabled": true, "hours": 48}', false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 3) الصلاحيات (RLS) — القراءة بالسياسات، والكتابة كلها عبر الدوال
-- ---------------------------------------------------------------------
alter table public.assessment_attachments enable row level security;
alter table public.task_submissions enable row level security;
alter table public.submission_files enable row level security;
alter table public.pending_uploads enable row level security;
alter table public.form_sessions enable row level security;
alter table public.form_events enable row level security;

grant select on public.assessment_attachments, public.task_submissions, public.submission_files,
                public.form_sessions, public.form_events to authenticated;
grant all on public.assessment_attachments, public.task_submissions, public.submission_files,
             public.pending_uploads, public.form_sessions, public.form_events to service_role;

create policy attachments_read on public.assessment_attachments for select to authenticated
  using (exists (select 1 from public.assessments a where a.id = assessment_id));

create policy submissions_read on public.task_submissions for select to authenticated
  using (student_id = (select app.my_student_id())
         or ((select app.is_staff()) and exists (select 1 from public.assessments a where a.id = assessment_id)));

create policy submission_files_read on public.submission_files for select to authenticated
  using (exists (select 1 from public.task_submissions s where s.id = submission_id));

create policy form_sessions_read on public.form_sessions for select to authenticated
  using ((select app.is_staff()) and exists (select 1 from public.assessments a where a.id = assessment_id));

create policy form_events_read on public.form_events for select to authenticated
  using (exists (select 1 from public.form_sessions s where s.id = session_id));

-- ---------------------------------------------------------------------
-- 4) أدوات مشتركة
-- ---------------------------------------------------------------------
-- مقارنة الإجابات النصية: بلا تشكيل ولا تطويل ولا مسافات، الهمزات ألفًا، التاء المربوطة هاءً،
-- والأرقام العربية/الفارسية لاتينية. النقطة والفاصلة تبقى (2.5 ≠ 25)
create or replace function app.norm_answer(p text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(
           translate(regexp_replace(coalesce(p, ''), '[ً-ْٰـ]', '', 'g'),
                     'أإآٱةى٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹−',
                     'ااااهي01234567890123456789-'),
           '[[:space:]"«»؟?!،؛]+', '', 'g'))
$$;

-- من يُنشئ تقييمًا لهذا الفصل وهذه المادة
create or replace function app.assert_can_author(p_class_id integer, p_subject_id smallint) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(app.is_staff(), false) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not app.is_admin() and not app.staff_can_access(p_class_id, p_subject_id) then
    raise exception 'هذا الفصل أو هذه المادة خارج نطاق صلاحياتك' using errcode = '42501';
  end if;
end $$;

create or replace function app.assert_can_edit(p_assessment_id bigint) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.can_edit_assessment(p_assessment_id) then
    raise exception 'لا تملك تعديل هذا التقييم' using errcode = '42501';
  end if;
end $$;

-- مسارات التخزين التي لم يعد يشير إليها أي مرفق (تُحذف من المخزن بعد العملية)
create or replace function app.orphan_paths(p_paths text[]) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct p), '{}')
    from unnest(p_paths) p
   where p is not null
     and not exists (select 1 from public.assessment_attachments x where x.storage_path = p)
     and not exists (select 1 from public.form_questions q where q.image_url = 'storage:' || p)
$$;

-- ---------------------------------------------------------------------
-- 5) حماية النموذج بعد التسليم (تحلّ محل حماية الهجرة 09)
--    ممنوع: إضافة/حذف أسئلة أو خيارات، تغيير نوع السؤال، تغيير عدد أزواج التوصيل أو الفراغات
--    مسموح: النص، الصورة، الدرجة، الإجابة الصحيحة، الإجابات المقبولة ← ثم إعادة تصحيح تلقائية
-- ---------------------------------------------------------------------
create or replace function app.protect_answered_questions() returns trigger
language plpgsql as $$
declare v_assessment bigint := coalesce(new.assessment_id, old.assessment_id);
begin
  if app.is_migrating() then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' then
    if new.assessment_id <> old.assessment_id then raise exception 'لا يمكن نقل سؤال إلى نموذج آخر'; end if;
    if not app.form_has_real_attempts(v_assessment) then return new; end if;
    if new.qtype <> old.qtype then
      raise exception 'لا يمكن تغيير نوع السؤال بعد وجود إجابات مُسلَّمة';
    end if;
    if new.qtype = 'match' and jsonb_array_length(coalesce(new.config -> 'pairs', '[]')) <> jsonb_array_length(coalesce(old.config -> 'pairs', '[]')) then
      raise exception 'لا يمكن تغيير عدد أزواج التوصيل بعد وجود إجابات مُسلَّمة';
    end if;
    if new.qtype = 'fill' and jsonb_array_length(coalesce(new.config -> 'blanks', '[]')) <> jsonb_array_length(coalesce(old.config -> 'blanks', '[]')) then
      raise exception 'لا يمكن تغيير عدد الفراغات بعد وجود إجابات مُسلَّمة';
    end if;
    return new;
  end if;
  if app.form_has_real_attempts(v_assessment) then
    raise exception 'لا يمكن إضافة أو حذف أسئلة بعد وجود إجابات مُسلَّمة. يمكنك تعديل النص والدرجة والإجابة الصحيحة، وسيُعاد التصحيح تلقائيًا.';
  end if;
  return coalesce(new, old);
end $$;

create or replace function app.protect_answered_options() returns trigger
language plpgsql as $$
declare v_assessment bigint;
begin
  if app.is_migrating() then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and new.question_id = old.question_id then return new; end if;
  select q.assessment_id into v_assessment from public.form_questions q
   where q.id = coalesce(new.question_id, old.question_id);
  if v_assessment is not null and app.form_has_real_attempts(v_assessment) then
    raise exception 'لا يمكن إضافة أو حذف خيارات بعد وجود إجابات مُسلَّمة. يمكنك تغيير الإجابة الصحيحة وسيُعاد التصحيح تلقائيًا.';
  end if;
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------
-- 6) التصحيح
-- ---------------------------------------------------------------------
-- درجة إجابة واحدة من بياناتها المخزّنة (تُستعمل عند التسليم وعند إعادة التصحيح)
create or replace function app.score_answer(p_question_id bigint, p_option_id bigint, p_response jsonb,
                                            out pts numeric, out st text)
language plpgsql stable security definer set search_path = '' as $$
declare
  q        public.form_questions;
  v_ok     boolean;
  v_n      integer;
  v_hits   integer := 0;
  v_text   text;
  i        integer;
begin
  select * into q from public.form_questions where id = p_question_id;
  pts := 0; st := 'auto';
  if q.id is null then return; end if;

  if q.qtype in ('mcq', 'tf') then
    select o.is_correct into v_ok from public.question_options o where o.id = p_option_id and o.question_id = q.id;
    pts := case when coalesce(v_ok, false) then q.points else 0 end;

  elsif q.qtype = 'short' then
    v_text := p_response #>> '{}';
    if coalesce(btrim(v_text), '') = '' then return; end if;
    if jsonb_array_length(coalesce(q.config -> 'answers', '[]')) = 0 then
      st := 'pending';
    elsif exists (select 1 from jsonb_array_elements_text(q.config -> 'answers') a
                   where app.norm_answer(a) = app.norm_answer(v_text) and app.norm_answer(a) <> '') then
      pts := q.points;
    end if;

  elsif q.qtype = 'long' then
    if coalesce(btrim(p_response #>> '{}'), '') <> '' then st := 'pending'; end if;

  elsif q.qtype = 'match' then
    v_n := jsonb_array_length(coalesce(q.config -> 'pairs', '[]'));
    if v_n = 0 or jsonb_typeof(p_response) <> 'object' then return; end if;
    for i in 0 .. v_n - 1 loop
      if (p_response ->> i::text) = i::text then v_hits := v_hits + 1; end if;
    end loop;
    pts := round(q.points * v_hits / v_n, 2);

  elsif q.qtype = 'fill' then
    v_n := jsonb_array_length(coalesce(q.config -> 'blanks', '[]'));
    if v_n = 0 or jsonb_typeof(p_response) <> 'array' then return; end if;
    for i in 0 .. v_n - 1 loop
      v_text := p_response ->> i;
      if coalesce(btrim(v_text), '') <> ''
         and exists (select 1 from jsonb_array_elements_text(q.config -> 'blanks' -> i) a
                      where app.norm_answer(a) = app.norm_answer(v_text)) then
        v_hits := v_hits + 1;
      end if;
    end loop;
    pts := round(q.points * v_hits / v_n, 2);
  end if;
end $$;

-- مجموع المحاولة من إجاباتها، ثم الرصد (المعتمد = آخر محاولة، ولا يُمس رصد عدّله المعلم يدويًا)
create or replace function app.recompute_attempt(p_attempt_id bigint) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  t        public.form_attempts;
  v_score  numeric(7,2);
  v_max    numeric(7,2);
  v_pend   integer;
  v_latest bigint;
begin
  select * into t from public.form_attempts where id = p_attempt_id;
  if t.id is null or t.is_auto_absent then return; end if;
  select coalesce(sum(points), 0) into v_max from public.form_questions where assessment_id = t.assessment_id;
  select coalesce(sum(aa.points), 0), count(*) filter (where aa.status = 'pending')
    into v_score, v_pend
    from public.attempt_answers aa where aa.attempt_id = t.id;
  v_score := least(v_score, v_max);
  update public.form_attempts set score = v_score, max_score = v_max, pending_review = v_pend where id = t.id;

  select id into v_latest from public.form_attempts
   where assessment_id = t.assessment_id and student_id = t.student_id and not is_auto_absent
   order by attempt_no desc limit 1;
  if v_latest = t.id and v_max > 0 then
    insert into public.grade_entries as g (assessment_id, student_id, score, max_score, source, recorded_by)
    values (t.assessment_id, t.student_id, v_score, v_max, 'form', null)
    on conflict (assessment_id, student_id) do update
       set score = excluded.score, max_score = excluded.max_score, source = 'form'
     where g.source in ('form', 'auto_absent');
  end if;
end $$;

-- إعادة تصحيح كل محاولات نموذج (بعد تعديل الإجابة الصحيحة أو الدرجات)
create or replace function app.regrade_form(p_assessment_id bigint) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare r record; v_n integer := 0;
begin
  update public.attempt_answers aa
     set points = x.pts, status = x.st
    from (select a2.attempt_id, a2.question_id, s.pts, s.st
            from public.attempt_answers a2
            join public.form_attempts t on t.id = a2.attempt_id
            cross join lateral app.score_answer(a2.question_id, a2.option_id, a2.response) s
           where t.assessment_id = p_assessment_id and not t.is_auto_absent and a2.status <> 'manual') x
   where aa.attempt_id = x.attempt_id and aa.question_id = x.question_id
     and (aa.points, aa.status) is distinct from (x.pts, x.st);

  -- المقالي المصحَّح يدويًا: لا تتجاوز درجته درجة السؤال الجديدة
  update public.attempt_answers aa
     set points = least(aa.points, q.points)
    from public.form_attempts t, public.form_questions q
   where t.id = aa.attempt_id and t.assessment_id = p_assessment_id and q.id = aa.question_id
     and aa.status = 'manual' and aa.points > q.points;

  for r in select id from public.form_attempts
            where assessment_id = p_assessment_id and not is_auto_absent
              and exists (select 1 from public.attempt_answers aa where aa.attempt_id = form_attempts.id)
  loop
    perform app.recompute_attempt(r.id);
    v_n := v_n + 1;
  end loop;

  -- الأصفار التلقائية تتبع الدرجة العظمى الجديدة
  update public.grade_entries g set max_score = m.max_score
    from public.form_max_scores m
   where g.assessment_id = p_assessment_id and m.assessment_id = p_assessment_id
     and g.source = 'auto_absent' and m.max_score > 0 and g.max_score <> m.max_score;
  return v_n;
end $$;

-- مشغّل مؤجَّل حتى نهاية المعاملة: يعيد التصحيح مرة واحدة لكل نموذج مهما تعددت التعديلات
create or replace function app.queue_regrade() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_assessment bigint;
  v_done text;
begin
  if app.is_migrating() then return null; end if;
  if tg_table_name = 'form_questions' then
    v_assessment := coalesce(new.assessment_id, old.assessment_id);
  else
    select q.assessment_id into v_assessment from public.form_questions q where q.id = coalesce(new.question_id, old.question_id);
  end if;
  if v_assessment is null or not app.form_has_real_attempts(v_assessment) then return null; end if;
  v_done := coalesce(current_setting('mirqat.regraded', true), '');
  if position(',' || v_assessment || ',' in v_done) > 0 then return null; end if;
  perform set_config('mirqat.regraded', v_done || ',' || v_assessment || ',', true);
  perform app.regrade_form(v_assessment);
  return null;
end $$;

create constraint trigger form_questions_regrade after update on public.form_questions
  deferrable initially deferred for each row
  when (old.points is distinct from new.points or old.config is distinct from new.config)
  execute function app.queue_regrade();
create constraint trigger question_options_regrade after update on public.question_options
  deferrable initially deferred for each row
  when (old.is_correct is distinct from new.is_correct)
  execute function app.queue_regrade();

-- ---------------------------------------------------------------------
-- 7) جلسة حل الطالب
-- ---------------------------------------------------------------------
-- الأسئلة كما يراها الطالب: بلا أي إجابة صحيحة، وبترتيب جلسته
create or replace function app.session_payload(p_session_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s  public.form_sessions;
  a  public.assessments;
  f  public.form_details;
begin
  select * into s from public.form_sessions where id = p_session_id;
  select * into a from public.assessments where id = s.assessment_id;
  select * into f from public.form_details where assessment_id = s.assessment_id;
  return jsonb_build_object(
    'session_id', s.id,
    'assessment_id', a.id,
    'title', a.title,
    'description', a.description,
    'intro_video_url', f.intro_video_url,
    'started_at', s.started_at,
    'deadline_at', s.deadline_at,
    'closes_at', f.closes_at,
    'time_limit_minutes', f.time_limit_minutes,
    'track_focus', f.track_focus,
    'server_now', now(),
    'answers', s.answers,
    'saved_at', s.saved_at,
    'questions', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', q.id, 'qtype', q.qtype, 'body', q.body, 'image_url', q.image_url, 'points', q.points,
                 'section_title', q.section_title, 'section_instructions', q.section_instructions,
                 'max_chars', q.config -> 'max_chars',
                 'blanks', case when q.qtype = 'fill' then jsonb_array_length(coalesce(q.config -> 'blanks', '[]')) end,
                 'lefts', case when q.qtype = 'match' then (select jsonb_agg(p -> 'l' order by n) from jsonb_array_elements(q.config -> 'pairs') with ordinality x(p, n)) end,
                 'rights', case when q.qtype = 'match' then (
                     select jsonb_agg((q.config -> 'pairs' -> (r.v)::int) -> 'r' order by r.n)
                       from jsonb_array_elements_text(s.option_order -> q.id::text) with ordinality r(v, n)) end,
                 'options', case when q.qtype in ('mcq', 'tf') then (
                     select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'body', o.body)
                                               order by coalesce(array_position(
                                                 array(select jsonb_array_elements_text(s.option_order -> q.id::text)::bigint), o.id), o.position)), '[]')
                       from public.question_options o where o.question_id = q.id) end)
               order by array_position(s.question_order, q.id))
        from public.form_questions q where q.assessment_id = a.id), '[]'::jsonb));
end $$;

-- إنهاء الجلسة: محاولة + إجابات مصحّحة + رصد — ذرّي، ومتكرر بأمان (الضغط المزدوج يعيد نفس النتيجة)
create or replace function app.finalize_session(p_session_id bigint) returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare
  s          public.form_sessions;
  q          record;
  v_resp     jsonb;
  v_opt      bigint;
  v_store    jsonb;
  v_sc       record;
  v_no       smallint;
  v_attempt  bigint;
  v_max      numeric(7,2);
  v_perm     jsonb;
  v_map      jsonb;
  k          text;
begin
  select * into s from public.form_sessions where id = p_session_id for update;
  if s.id is null then raise exception 'الجلسة غير موجودة'; end if;
  if s.submitted_at is not null then return s.attempt_id; end if;

  -- صفر تلقائي سابق (نموذج أُعيد فتحه) يُستبدل بالمحاولة الحقيقية
  delete from public.form_attempts t
   where t.assessment_id = s.assessment_id and t.student_id = s.student_id and t.is_auto_absent;

  select coalesce(max(attempt_no), 0) + 1 into v_no from public.form_attempts
   where assessment_id = s.assessment_id and student_id = s.student_id and not is_auto_absent;
  select coalesce(sum(points), 0) into v_max from public.form_questions where assessment_id = s.assessment_id;

  insert into public.form_attempts (assessment_id, student_id, attempt_no, score, max_score, raw_answers,
                                    duration_seconds, focus_events, submitted_at)
  values (s.assessment_id, s.student_id, v_no, 0, v_max, s.answers,
          greatest(0, extract(epoch from (least(now(), coalesce(s.deadline_at + interval '2 minutes', now())) - s.started_at)))::int,
          s.focus_events, now())
  returning id into v_attempt;

  for q in select * from public.form_questions where assessment_id = s.assessment_id loop
    v_resp := s.answers -> q.id::text;
    continue when v_resp is null or jsonb_typeof(v_resp) = 'null';
    v_opt := null; v_store := null;

    if q.qtype in ('mcq', 'tf') then
      continue when jsonb_typeof(v_resp) not in ('number', 'string') or (v_resp #>> '{}') !~ '^\d{1,18}$';
      select o.id into v_opt from public.question_options o where o.id = (v_resp #>> '{}')::bigint and o.question_id = q.id;
      continue when v_opt is null;
    elsif q.qtype in ('short', 'long') then
      continue when jsonb_typeof(v_resp) <> 'string' or btrim(v_resp #>> '{}') = '';
      v_store := to_jsonb(left(v_resp #>> '{}', 10000));
    elsif q.qtype = 'match' then
      continue when jsonb_typeof(v_resp) <> 'object';
      -- الطالب يرى الجهة اليمنى مخلوطة: نحوّل اختياره من ترتيب العرض إلى الترتيب الأصلي
      v_perm := s.option_order -> q.id::text;
      v_map := '{}'::jsonb;
      for k in select jsonb_object_keys(v_resp) loop
        if k ~ '^\d{1,3}$' and (v_resp ->> k) ~ '^\d{1,3}$' and (v_perm ->> (v_resp ->> k)::int) is not null then
          v_map := v_map || jsonb_build_object(k, (v_perm ->> (v_resp ->> k)::int)::int);
        end if;
      end loop;
      continue when v_map = '{}'::jsonb;
      v_store := v_map;
    elsif q.qtype = 'fill' then
      continue when jsonb_typeof(v_resp) <> 'array';
      v_store := (select coalesce(jsonb_agg(left(coalesce(e #>> '{}', ''), 500) order by n), '[]')
                    from jsonb_array_elements(v_resp) with ordinality x(e, n) where n <= 50);
    end if;

    select * into v_sc from app.score_answer(q.id, v_opt, v_store);
    insert into public.attempt_answers (attempt_id, question_id, option_id, response, points, status)
    values (v_attempt, q.id, v_opt, v_store, v_sc.pts, v_sc.st);
  end loop;

  update public.form_sessions set submitted_at = now(), attempt_id = v_attempt where id = s.id;
  perform app.recompute_attempt(v_attempt);
  return v_attempt;
end $$;

-- يبدأ جلسة أو يستكملها (من أي جهاز). الخلط والمدة يُثبَّتان لحظة البدء
create or replace function public.start_form_session(p_assessment_id bigint) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_student  bigint := app.my_student_id();
  s          public.form_sessions;
  f          public.form_details;
  chk        record;
  v_order    bigint[];
  v_opts     jsonb := '{}'::jsonb;
  q          record;
begin
  if v_student is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('form:' || p_assessment_id || ':' || v_student, 0));

  select * into s from public.form_sessions
   where assessment_id = p_assessment_id and student_id = v_student and submitted_at is null;
  if s.id is not null then
    if s.deadline_at is not null and now() > s.deadline_at + interval '2 minutes' then
      perform app.finalize_session(s.id);
      return jsonb_build_object('status', 'submitted', 'reason', 'انتهى وقتك وسُلّمت إجاباتك المحفوظة تلقائيًا');
    end if;
    -- الصف أو حالة النموذج قد تغيّرت منذ البدء
    if (select class_id from public.assessments where id = p_assessment_id) is distinct from app.my_class_id() then
      raise exception 'FORBIDDEN: هذا النموذج ليس لصفك';
    end if;
    return jsonb_build_object('status', 'open') || app.session_payload(s.id);
  end if;

  select * into chk from app.assert_student_can_open_form(p_assessment_id);
  select * into f from public.form_details where assessment_id = p_assessment_id;
  if not exists (select 1 from public.form_questions where assessment_id = p_assessment_id) then
    raise exception 'هذا النموذج بلا أسئلة';
  end if;

  select array_agg(id order by case when f.shuffle_questions then random() else position end, id)
    into v_order from public.form_questions where assessment_id = p_assessment_id;

  for q in select id, qtype, config from public.form_questions where assessment_id = p_assessment_id loop
    if q.qtype = 'match' then
      -- الجهة اليمنى مخلوطة دائمًا (وإلا انكشف التوصيل)
      v_opts := v_opts || jsonb_build_object(q.id::text,
        (select jsonb_agg(i order by random()) from generate_series(0, jsonb_array_length(coalesce(q.config -> 'pairs', '[]')) - 1) i));
    elsif q.qtype = 'mcq' and f.shuffle_options then
      v_opts := v_opts || jsonb_build_object(q.id::text,
        (select jsonb_agg(o.id order by random()) from public.question_options o where o.question_id = q.id));
    end if;
  end loop;

  insert into public.form_sessions (assessment_id, student_id, deadline_at, question_order, option_order)
  values (p_assessment_id, v_student,
          case
            when f.time_limit_minutes is not null and f.closes_at is not null
              then least(now() + make_interval(mins => f.time_limit_minutes), f.closes_at)
            when f.time_limit_minutes is not null then now() + make_interval(mins => f.time_limit_minutes)
            else f.closes_at
          end,
          v_order, v_opts)
  returning * into s;
  return jsonb_build_object('status', 'open') || app.session_payload(s.id);
end $$;

-- الحفظ التلقائي: يدمج ما تغيّر فقط. صغير وسريع، يُستدعى كل بضع ثوانٍ أثناء الحل
create or replace function public.save_form_answers(p_session_id bigint, p_patch jsonb) returns timestamptz
language plpgsql volatile security definer set search_path = '' as $$
declare
  s     public.form_sessions;
  v_now timestamptz := now();
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'صيغة الإجابات غير صحيحة'; end if;
  if octet_length(p_patch::text) > 65536 then raise exception 'الإجابات أكبر من المسموح'; end if;

  select * into s from public.form_sessions where id = p_session_id for update;
  if s.id is null or s.student_id is distinct from app.my_student_id() then raise exception 'FORBIDDEN'; end if;
  if s.submitted_at is not null then raise exception 'سُلّمت هذه المحاولة'; end if;
  if s.deadline_at is not null and v_now > s.deadline_at + interval '15 seconds' then raise exception 'انتهى الوقت'; end if;
  if exists (select 1 from jsonb_object_keys(p_patch) k where k !~ '^\d{1,18}$' or not (k::bigint = any (s.question_order))) then
    raise exception 'إجابات لأسئلة ليست في هذا النموذج';
  end if;

  update public.form_sessions
     set answers = jsonb_strip_nulls(answers || p_patch), saved_at = v_now
   where id = s.id;
  if octet_length((select answers::text from public.form_sessions where id = s.id)) > 262144 then
    raise exception 'الإجابات أكبر من المسموح';
  end if;
  return v_now;
end $$;

-- التسليم: آخر ما تغيّر + الإنهاء. بعد انتهاء الوقت بدقيقتين يُعتمد المحفوظ فقط
create or replace function public.submit_form_session(p_session_id bigint, p_patch jsonb default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  s          public.form_sessions;
  v_attempt  bigint;
  t          public.form_attempts;
  f          public.form_details;
begin
  select * into s from public.form_sessions where id = p_session_id;
  if s.id is null or s.student_id is distinct from app.my_student_id() then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('form:' || s.assessment_id || ':' || s.student_id, 0));
  select * into s from public.form_sessions where id = p_session_id;

  if s.submitted_at is null and p_patch is not null and p_patch <> '{}'::jsonb
     and (s.deadline_at is null or now() <= s.deadline_at + interval '2 minutes') then
    perform public.save_form_answers_internal(s.id, p_patch);
  end if;
  v_attempt := app.finalize_session(s.id);

  select * into t from public.form_attempts where id = v_attempt;
  select * into f from public.form_details where assessment_id = s.assessment_id;
  return jsonb_build_object(
    'attempt_no', t.attempt_no,
    'submitted_at', t.submitted_at,
    'show_score', f.show_results = 'after_submit',
    'score', case when f.show_results = 'after_submit' then t.score end,
    'max_score', case when f.show_results = 'after_submit' then t.max_score end,
    'pending_review', t.pending_review);
end $$;

-- نفس الحفظ بلا فحص المهلة القصيرة (يُستدعى من التسليم فقط ضمن مهلة الدقيقتين)
create or replace function public.save_form_answers_internal(p_session_id bigint, p_patch jsonb) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare s public.form_sessions;
begin
  if jsonb_typeof(p_patch) <> 'object' or octet_length(p_patch::text) > 65536 then raise exception 'صيغة الإجابات غير صحيحة'; end if;
  select * into s from public.form_sessions where id = p_session_id;
  if exists (select 1 from jsonb_object_keys(p_patch) k where k !~ '^\d{1,18}$' or not (k::bigint = any (s.question_order))) then
    raise exception 'إجابات لأسئلة ليست في هذا النموذج';
  end if;
  update public.form_sessions set answers = jsonb_strip_nulls(answers || p_patch), saved_at = now() where id = p_session_id;
end $$;

-- سجل الخروج من الصفحة/تبديل التبويب: بحد أقصى 300 حدث لكل جلسة
create or replace function public.log_form_event(p_session_id bigint, p_kind text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare s public.form_sessions;
begin
  select * into s from public.form_sessions where id = p_session_id;
  if s.id is null or s.student_id is distinct from app.my_student_id() or s.submitted_at is not null then return; end if;
  if p_kind not in ('blur', 'hidden', 'paste', 'copy', 'fullscreen_exit', 'resume') then return; end if;
  if (select count(*) from public.form_events where session_id = s.id) >= 300 then return; end if;
  insert into public.form_events (session_id, kind) values (s.id, p_kind);
  if p_kind in ('blur', 'hidden') then
    update public.form_sessions set focus_events = focus_events + 1 where id = s.id;
  end if;
end $$;

-- مراجعة الطالب: حسب إعداد إظهار النتائج
create or replace function public.get_form_review(p_assessment_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_student bigint := app.my_student_id();
  t         public.form_attempts;
  f         public.form_details;
  v_show    boolean;
begin
  if v_student is null then raise exception 'AUTH_REQUIRED'; end if;
  if not app.student_sees_assessment(p_assessment_id) then raise exception 'FORBIDDEN'; end if;
  select * into f from public.form_details where assessment_id = p_assessment_id;
  select * into t from public.form_attempts
   where assessment_id = p_assessment_id and student_id = v_student and not is_auto_absent
   order by attempt_no desc limit 1;
  if t.id is null then return jsonb_build_object('status', 'none'); end if;

  v_show := f.show_results = 'after_submit'
         or (f.show_results = 'after_close' and (f.status = 'closed' or (f.closes_at is not null and f.closes_at <= now())));
  if not v_show then
    return jsonb_build_object('status', 'hidden', 'submitted_at', t.submitted_at, 'attempt_no', t.attempt_no,
                              'show_results', f.show_results, 'closes_at', f.closes_at);
  end if;

  return jsonb_build_object(
    'status', 'shown',
    'score', t.score, 'max_score', t.max_score, 'pending_review', t.pending_review,
    'submitted_at', t.submitted_at, 'attempt_no', t.attempt_no,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q.id, 'qtype', q.qtype, 'body', q.body, 'image_url', q.image_url, 'points', q.points,
               'explanation', q.explanation,
               'earned', coalesce(aa.points, 0), 'status', coalesce(aa.status, 'auto'), 'feedback', aa.feedback,
               'chosen_option_id', aa.option_id, 'response', aa.response,
               'accepted', case when q.qtype = 'short' then q.config -> 'answers' when q.qtype = 'fill' then q.config -> 'blanks' end,
               'pairs', case when q.qtype = 'match' then q.config -> 'pairs' end,
               'options', case when q.qtype in ('mcq', 'tf') then (
                 select jsonb_agg(jsonb_build_object('id', o.id, 'body', o.body, 'is_correct', o.is_correct) order by o.position)
                   from public.question_options o where o.question_id = q.id) end)
             order by q.position)
        from public.form_questions q
        left join public.attempt_answers aa on aa.attempt_id = t.id and aa.question_id = q.id
       where q.assessment_id = p_assessment_id), '[]'::jsonb));
end $$;

-- الواجهة القديمة (تسليم بخطوة واحدة) تبقى للتوافق، وتمر الآن بنفس مسار الجلسات
create or replace function public.submit_form_attempt(p_assessment_id bigint, p_answers jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_session  jsonb;
  v_missing  integer;
  v_bad      integer;
  v_attempt  bigint;
  t          public.form_attempts;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then raise exception 'صيغة الإجابات غير صحيحة'; end if;
  select count(*) into v_missing from public.form_questions q
   where q.assessment_id = p_assessment_id and not (p_answers ? q.id::text);
  if v_missing > 0 then raise exception 'يجب الإجابة على جميع الأسئلة — بقي % سؤال بلا إجابة', v_missing; end if;
  if exists (select 1 from jsonb_object_keys(p_answers) k
              where not exists (select 1 from public.form_questions q where q.assessment_id = p_assessment_id and q.id::text = k)) then
    raise exception 'إجابات لأسئلة ليست في هذا النموذج';
  end if;
  select count(*) into v_bad from jsonb_each_text(p_answers) e
    join public.form_questions q on q.id = e.key::bigint
   where q.qtype in ('mcq', 'tf')
     and (e.value !~ '^\d+$' or not exists (select 1 from public.question_options o where o.id = e.value::bigint and o.question_id = q.id));
  if v_bad > 0 then raise exception 'إجابة غير صالحة: الخيار لا ينتمي للسؤال'; end if;

  v_session := public.start_form_session(p_assessment_id);
  if v_session ->> 'status' <> 'open' then raise exception 'انتهت مهلة هذا النموذج'; end if;
  perform public.save_form_answers_internal((v_session ->> 'session_id')::bigint, p_answers);
  v_attempt := app.finalize_session((v_session ->> 'session_id')::bigint);
  select * into t from public.form_attempts where id = v_attempt;
  return jsonb_build_object('score', t.score, 'max_score', t.max_score, 'attempt_no', t.attempt_no);
end $$;

-- ---------------------------------------------------------------------
-- 8) الإغلاق وتسوية الغياب (يُعاد تعريفها: تُنهى الجلسات المفتوحة أولًا)
-- ---------------------------------------------------------------------
create or replace function app.finalize_expired(p_assessment_id bigint default null) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare r record; v_n integer := 0;
begin
  for r in
    select s.id from public.form_sessions s
      join public.form_details f on f.assessment_id = s.assessment_id
     where s.submitted_at is null
       and (p_assessment_id is null or s.assessment_id = p_assessment_id)
       and ((s.deadline_at is not null and s.deadline_at + interval '2 minutes' < now())
            or f.status = 'closed'
            or (f.closes_at is not null and f.closes_at + interval '2 minutes' < now()))
  loop
    perform app.finalize_session(r.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.settle_due_forms() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare r record; v_total integer := 0;
begin
  perform app.finalize_expired(null);
  for r in select f.assessment_id from public.form_details f
            where f.absence_settled_at is null
              and (f.status = 'closed' or (f.status = 'published' and f.closes_at <= now()))
  loop
    v_total := v_total + app.settle_form_absences(r.assessment_id);
  end loop;
  return v_total;
end $$;
revoke all on function public.settle_due_forms() from public, anon, authenticated;
grant execute on function public.settle_due_forms() to service_role;

-- للمعلم عند فتح نتائج نموذجه: يُنهي الجلسات المنتهية ويسوّي الغياب إن أُغلق
create or replace function public.refresh_form(p_assessment_id bigint) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.assert_can_edit(p_assessment_id);
  perform app.finalize_expired(p_assessment_id);
  perform app.settle_form_absences(p_assessment_id);
end $$;

-- ---------------------------------------------------------------------
-- 9) إنشاء النموذج وحفظه (ذرّي: البيانات + الإعدادات + كل الأسئلة)
-- ---------------------------------------------------------------------
create or replace function app.save_form_questions(p_assessment_id bigint, p_questions jsonb) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  qj      jsonb;
  oj      jsonb;
  v_qid   bigint;
  v_oid   bigint;
  v_pos   integer := 0;
  v_opos  integer;
  v_type  text;
  v_keep  bigint[] := '{}';
  v_okeep bigint[];
  v_corr  integer;
  v_cfg   jsonb;
  v_n     integer;
begin
  if jsonb_typeof(p_questions) <> 'array' then raise exception 'صيغة الأسئلة غير صحيحة'; end if;
  if jsonb_array_length(p_questions) > 200 then raise exception 'الحد الأقصى 200 سؤال'; end if;

  -- إزاحة الترتيب الحالي مؤقتًا حتى لا يتعارض مع الترتيب الجديد
  update public.form_questions set position = position + 100000 where assessment_id = p_assessment_id;

  for qj in select * from jsonb_array_elements(p_questions) loop
    v_pos := v_pos + 1;
    v_type := coalesce(qj ->> 'qtype', 'mcq');
    if v_type not in ('mcq', 'tf', 'short', 'long', 'match', 'fill') then raise exception 'نوع سؤال غير معروف: %', v_type; end if;
    if coalesce(btrim(qj ->> 'body'), '') = '' then raise exception 'السؤال % بلا نص', v_pos; end if;
    if char_length(qj ->> 'body') > 8000 then raise exception 'نص السؤال % طويل جدًا', v_pos; end if;
    if coalesce((qj ->> 'points')::numeric, -1) < 0 or (qj ->> 'points')::numeric > 1000 then
      raise exception 'درجة السؤال % غير صحيحة', v_pos;
    end if;
    if (qj ->> 'image_url') is not null and (qj ->> 'image_url') !~ '^(https://|storage:forms/)' then
      raise exception 'صورة السؤال % غير صالحة', v_pos;
    end if;

    v_cfg := '{}'::jsonb;
    if v_type = 'short' then
      v_cfg := jsonb_build_object('answers', coalesce((
        select jsonb_agg(btrim(a)) from jsonb_array_elements_text(coalesce(qj -> 'config' -> 'answers', '[]')) a where btrim(a) <> ''), '[]'));
      if jsonb_array_length(v_cfg -> 'answers') > 30 then raise exception 'السؤال %: الإجابات المقبولة كثيرة', v_pos; end if;
    elsif v_type = 'long' then
      if (qj -> 'config' ->> 'max_chars') ~ '^\d+$' then
        v_cfg := jsonb_build_object('max_chars', least(10000, greatest(50, (qj -> 'config' ->> 'max_chars')::int)));
      end if;
    elsif v_type = 'match' then
      v_cfg := jsonb_build_object('pairs', coalesce((
        select jsonb_agg(jsonb_build_object('l', btrim(p ->> 'l'), 'r', btrim(p ->> 'r')) order by n)
          from jsonb_array_elements(coalesce(qj -> 'config' -> 'pairs', '[]')) with ordinality x(p, n)
         where coalesce(btrim(p ->> 'l'), '') <> '' and coalesce(btrim(p ->> 'r'), '') <> ''), '[]'));
      v_n := jsonb_array_length(v_cfg -> 'pairs');
      if v_n < 2 or v_n > 12 then raise exception 'السؤال %: التوصيل من 2 إلى 12 زوجًا', v_pos; end if;
    elsif v_type = 'fill' then
      v_cfg := jsonb_build_object('blanks', coalesce((
        select jsonb_agg(coalesce((select jsonb_agg(btrim(a)) from jsonb_array_elements_text(b) a where btrim(a) <> ''), '[]') order by n)
          from jsonb_array_elements(coalesce(qj -> 'config' -> 'blanks', '[]')) with ordinality x(b, n)), '[]'));
      v_n := jsonb_array_length(v_cfg -> 'blanks');
      if v_n < 1 or v_n > 20 then raise exception 'السؤال %: ضع من فراغ إلى 20 فراغًا', v_pos; end if;
      if (select count(*) from regexp_matches(qj ->> 'body', '\[\[\d+\]\]', 'g')) <> v_n then
        raise exception 'السؤال %: عدد الفراغات في النص لا يطابق إجاباتها', v_pos;
      end if;
      if exists (select 1 from jsonb_array_elements(v_cfg -> 'blanks') b where jsonb_array_length(b) = 0) then
        raise exception 'السؤال %: لكل فراغ إجابة صحيحة واحدة على الأقل', v_pos;
      end if;
    end if;

    v_qid := nullif(qj ->> 'id', '')::bigint;
    if v_qid is not null and not exists (select 1 from public.form_questions where id = v_qid and assessment_id = p_assessment_id) then
      v_qid := null;
    end if;
    if v_qid is null then
      insert into public.form_questions (assessment_id, position, body, image_url, points, section_title,
                                         section_instructions, qtype, config, explanation)
      values (p_assessment_id, v_pos, qj ->> 'body', nullif(qj ->> 'image_url', ''), (qj ->> 'points')::numeric,
              app.nz(qj, 'section_title'), app.nz(qj, 'section_instructions'), v_type, v_cfg, app.nz(qj, 'explanation'))
      returning id into v_qid;
    else
      update public.form_questions
         set position = v_pos, body = qj ->> 'body', image_url = nullif(qj ->> 'image_url', ''),
             points = (qj ->> 'points')::numeric, section_title = app.nz(qj, 'section_title'),
             section_instructions = app.nz(qj, 'section_instructions'), qtype = v_type, config = v_cfg,
             explanation = app.nz(qj, 'explanation')
       where id = v_qid;
    end if;
    v_keep := v_keep || v_qid;

    -- الخيارات
    if v_type in ('mcq', 'tf') then
      if jsonb_typeof(qj -> 'options') <> 'array' then raise exception 'السؤال % بلا خيارات', v_pos; end if;
      v_n := jsonb_array_length(qj -> 'options');
      if v_type = 'tf' and v_n <> 2 then raise exception 'السؤال %: صح وخطأ خياران فقط', v_pos; end if;
      if v_n < 2 or v_n > 10 then raise exception 'السؤال %: من خيارين إلى 10 خيارات', v_pos; end if;
      select count(*) into v_corr from jsonb_array_elements(qj -> 'options') o where (o ->> 'is_correct')::boolean;
      if v_corr <> 1 then raise exception 'السؤال %: حدّد إجابة صحيحة واحدة', v_pos; end if;

      update public.question_options set position = position + 1000, is_correct = false
       where question_id = v_qid and is_correct;
      update public.question_options set position = position + 1000
       where question_id = v_qid and position < 1000;
      v_opos := 0; v_okeep := '{}';
      for oj in select * from jsonb_array_elements(qj -> 'options') loop
        v_opos := v_opos + 1;
        if coalesce(btrim(oj ->> 'body'), '') = '' then raise exception 'السؤال %: خيار فارغ', v_pos; end if;
        v_oid := nullif(oj ->> 'id', '')::bigint;
        if v_oid is not null and not exists (select 1 from public.question_options where id = v_oid and question_id = v_qid) then
          v_oid := null;
        end if;
        if v_oid is null then
          insert into public.question_options (question_id, position, body, is_correct)
          values (v_qid, v_opos, oj ->> 'body', false) returning id into v_oid;
        else
          update public.question_options set position = v_opos, body = oj ->> 'body' where id = v_oid;
        end if;
        v_okeep := v_okeep || v_oid;
      end loop;
      delete from public.question_options where question_id = v_qid and not (id = any (v_okeep));
      update public.question_options set is_correct = true
       where id = (v_okeep)[(select n from jsonb_array_elements(qj -> 'options') with ordinality x(o, n)
                             where (o ->> 'is_correct')::boolean limit 1)::int];
    else
      delete from public.question_options where question_id = v_qid;
    end if;
  end loop;

  delete from public.form_questions where assessment_id = p_assessment_id and not (id = any (v_keep));
end $$;

create or replace function app.apply_form_details(p_assessment_id bigint, d jsonb, p_publish_check boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_status   text := coalesce(d ->> 'status', 'draft');
  v_opens    timestamptz := nullif(d ->> 'opens_at', '')::timestamptz;
  v_closes   timestamptz := nullif(d ->> 'closes_at', '')::timestamptz;
  v_old      public.form_details;
begin
  if v_status not in ('draft', 'published', 'closed') then raise exception 'حالة غير معروفة'; end if;
  if v_opens is not null and v_closes is not null and v_closes <= v_opens then
    raise exception 'وقت الإغلاق يجب أن يكون بعد وقت الفتح';
  end if;
  if v_status = 'published' and p_publish_check then
    if v_closes is null then raise exception 'حدّد وقت إغلاق النموذج قبل نشره'; end if;
    if not exists (select 1 from public.form_questions where assessment_id = p_assessment_id) then
      raise exception 'أضف سؤالًا واحدًا على الأقل قبل النشر';
    end if;
  end if;

  select * into v_old from public.form_details where assessment_id = p_assessment_id;
  insert into public.form_details (assessment_id, opens_at, closes_at, max_attempts, status, intro_video_url,
                                   shuffle_questions, shuffle_options, time_limit_minutes, show_results, track_focus)
  values (p_assessment_id, v_opens, v_closes,
          greatest(1, least(20, coalesce((d ->> 'max_attempts')::int, 1))),
          v_status::public.form_status,
          case when (d ->> 'intro_video_url') ~* '^https://' then d ->> 'intro_video_url' end,
          coalesce((d ->> 'shuffle_questions')::boolean, false),
          coalesce((d ->> 'shuffle_options')::boolean, false),
          nullif(d ->> 'time_limit_minutes', '')::smallint,
          coalesce(d ->> 'show_results', 'after_submit'),
          coalesce((d ->> 'track_focus')::boolean, true))
  on conflict (assessment_id) do update set
     opens_at = excluded.opens_at, closes_at = excluded.closes_at, max_attempts = excluded.max_attempts,
     status = excluded.status, intro_video_url = excluded.intro_video_url,
     shuffle_questions = excluded.shuffle_questions, shuffle_options = excluded.shuffle_options,
     time_limit_minutes = excluded.time_limit_minutes, show_results = excluded.show_results,
     track_focus = excluded.track_focus,
     -- تمديد وقت الإغلاق لنموذج مسوّى = إعادة فتح (تُحذف الأصفار التلقائية)
     absence_settled_at = case when excluded.status = 'published' and excluded.closes_at > now() then null
                               else public.form_details.absence_settled_at end;

  if v_old.absence_settled_at is not null and v_status = 'published' and v_closes > now() then
    delete from public.grade_entries where assessment_id = p_assessment_id and source = 'auto_absent';
    delete from public.form_attempts where assessment_id = p_assessment_id and is_auto_absent;
  end if;
end $$;

-- البيانات الأساسية المشتركة بين المهمة والنموذج
create or replace function app.assessment_base(p jsonb, out v_title text, out v_subject smallint, out v_term smallint,
                                               out v_eval smallint, out v_teacher bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  v_title := app.nz(p, 'title');
  if v_title is null then raise exception 'اكتب عنوانًا'; end if;
  if char_length(v_title) > 200 then raise exception 'العنوان طويل جدًا'; end if;
  v_subject := nullif(p ->> 'subject_id', '')::smallint;
  if v_subject is null then raise exception 'اختر المادة'; end if;
  v_term := nullif(p ->> 'term_id', '')::smallint;
  if v_term is null then raise exception 'اختر الفصل الدراسي'; end if;
  v_eval := nullif(p ->> 'eval_type_id', '')::smallint;
  if v_eval is null then raise exception 'اختر نوع التقييم'; end if;
  if app.is_admin() and nullif(p ->> 'teacher_id', '') is not null then
    v_teacher := (p ->> 'teacher_id')::bigint;
  else
    v_teacher := app.my_employee_id();
  end if;
end $$;

-- إنشاء نموذج لفصل أو أكثر، أو حفظ نموذج قائم (p_id)
create or replace function public.save_form(p_id bigint, p jsonb, p_class_ids integer[] default null) returns bigint[]
language plpgsql volatile security definer set search_path = '' as $$
declare
  b        record;
  v_ids    bigint[] := '{}';
  v_id     bigint;
  c        integer;
  v_old    public.assessments;
begin
  select * into b from app.assessment_base(p);

  if p_id is not null then
    perform app.assert_can_edit(p_id);
    select * into v_old from public.assessments where id = p_id and kind = 'form';
    if v_old.id is null then raise exception 'النموذج غير موجود'; end if;
    perform app.assert_can_author(v_old.class_id, b.v_subject);
    update public.assessments
       set title = b.v_title, description = app.nz(p, 'description'), subject_id = b.v_subject,
           term_id = b.v_term, eval_type_id = b.v_eval
     where id = p_id;
    if p ? 'questions' then perform app.save_form_questions(p_id, p -> 'questions'); end if;
    perform app.apply_form_details(p_id, coalesce(p -> 'details', '{}'), true);
    return array[p_id];
  end if;

  if p_class_ids is null or cardinality(p_class_ids) = 0 then raise exception 'اختر فصلًا واحدًا على الأقل'; end if;
  if cardinality(p_class_ids) > 30 then raise exception 'الحد الأقصى 30 فصلًا دفعة واحدة'; end if;
  foreach c in array p_class_ids loop
    perform app.assert_can_author(c, b.v_subject);
    insert into public.assessments (kind, class_id, subject_id, term_id, eval_type_id, teacher_id, title, description)
    values ('form', c, b.v_subject, b.v_term, b.v_eval, b.v_teacher, b.v_title, app.nz(p, 'description'))
    returning id into v_id;
    perform app.save_form_questions(v_id, coalesce(p -> 'questions', '[]'));
    perform app.apply_form_details(v_id, coalesce(p -> 'details', '{}'), true);
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end $$;

-- تغيير حالة النموذج فقط (نشر/إغلاق/مسودة) دون إعادة إرسال الأسئلة
create or replace function public.set_form_status(p_id bigint, p_status text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare d public.form_details;
begin
  perform app.assert_can_edit(p_id);
  select * into d from public.form_details where assessment_id = p_id;
  if d.assessment_id is null then raise exception 'النموذج غير موجود'; end if;
  perform app.apply_form_details(p_id, to_jsonb(d) || jsonb_build_object('status', p_status), true);
  if p_status = 'closed' then perform app.finalize_expired(p_id); end if;
end $$;

-- التصحيح اليدوي لإجابة (مقالي/قصيرة بلا إجابة مقبولة، أو تعديل درجة آلية)
create or replace function public.grade_form_answer(p_attempt_id bigint, p_question_id bigint, p_points numeric, p_feedback text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  t public.form_attempts;
  q public.form_questions;
begin
  select * into t from public.form_attempts where id = p_attempt_id and not is_auto_absent;
  if t.id is null then raise exception 'المحاولة غير موجودة'; end if;
  perform app.assert_can_edit(t.assessment_id);
  select * into q from public.form_questions where id = p_question_id and assessment_id = t.assessment_id;
  if q.id is null then raise exception 'السؤال ليس من هذا النموذج'; end if;
  if p_points is null or p_points < 0 or p_points > q.points then
    raise exception 'الدرجة بين 0 و %', trim_scale(q.points);
  end if;
  insert into public.attempt_answers (attempt_id, question_id, option_id, response, points, status, feedback)
  values (t.id, q.id, null, null, round(p_points, 2), 'manual', nullif(btrim(coalesce(p_feedback, '')), ''))
  on conflict (attempt_id, question_id) do update
     set points = excluded.points, status = 'manual', feedback = excluded.feedback;
  perform app.recompute_attempt(t.id);
  select * into t from public.form_attempts where id = p_attempt_id;
  return jsonb_build_object('score', t.score, 'max_score', t.max_score, 'pending_review', t.pending_review);
end $$;

-- تصفير محاولة طالب (يعيد له فرصة الحل)
create or replace function public.reset_form_attempt(p_attempt_id bigint) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare t public.form_attempts;
begin
  select * into t from public.form_attempts where id = p_attempt_id;
  if t.id is null then raise exception 'المحاولة غير موجودة'; end if;
  perform app.assert_can_edit(t.assessment_id);
  delete from public.form_attempts where id = t.id;
  delete from public.form_sessions where assessment_id = t.assessment_id and student_id = t.student_id and submitted_at is null;
  if not exists (select 1 from public.form_attempts where assessment_id = t.assessment_id and student_id = t.student_id and not is_auto_absent) then
    delete from public.grade_entries where assessment_id = t.assessment_id and student_id = t.student_id and source = 'form';
  else
    perform app.recompute_attempt((select id from public.form_attempts
                                    where assessment_id = t.assessment_id and student_id = t.student_id and not is_auto_absent
                                    order by attempt_no desc limit 1));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 10) المهام: إنشاء/حفظ، تسليم الطالب، التصحيح
-- ---------------------------------------------------------------------
create or replace function app.save_attachments(p_assessment_id bigint, p_items jsonb) returns text[]
language plpgsql volatile security definer set search_path = '' as $$
declare
  j       jsonb;
  v_pos   integer := 0;
  v_old   text[];
  v_keep  text[] := '{}';
  v_kind  text;
begin
  if p_items is null then return '{}'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 10 then raise exception 'المرفقات 10 كحد أقصى'; end if;
  select coalesce(array_agg(storage_path), '{}') into v_old from public.assessment_attachments
   where assessment_id = p_assessment_id and storage_path is not null;
  delete from public.assessment_attachments where assessment_id = p_assessment_id;
  for j in select * from jsonb_array_elements(p_items) loop
    v_pos := v_pos + 1;
    v_kind := j ->> 'kind';
    if v_kind = 'link' then
      if coalesce(j ->> 'url', '') !~* '^https?://[^\s]+$' then raise exception 'الرابط % غير صحيح', v_pos; end if;
    elsif v_kind in ('image', 'file') then
      if coalesce(j ->> 'storage_path', '') !~ '^tasks/[0-9a-f-]{36}/[A-Za-z0-9._-]+$' then raise exception 'ملف المرفق % غير صالح', v_pos; end if;
    else
      raise exception 'نوع مرفق غير معروف';
    end if;
    insert into public.assessment_attachments (assessment_id, kind, name, url, storage_path, mime, size_bytes, position)
    values (p_assessment_id, v_kind, left(coalesce(app.nz(j, 'name'), 'مرفق'), 200),
            case when v_kind = 'link' then j ->> 'url' end,
            case when v_kind <> 'link' then j ->> 'storage_path' end,
            case when v_kind <> 'link' then left(j ->> 'mime', 100) end,
            case when v_kind <> 'link' then (j ->> 'size_bytes')::int end,
            v_pos);
    if v_kind <> 'link' then v_keep := v_keep || (j ->> 'storage_path'); end if;
  end loop;
  return app.orphan_paths(array(select unnest(v_old) except select unnest(v_keep)));
end $$;

create or replace function public.save_task(p_id bigint, p jsonb, p_class_ids integer[] default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  b         record;
  v_ids     bigint[] := '{}';
  v_id      bigint;
  c         integer;
  v_old     public.assessments;
  v_max     numeric(7,2) := nullif(p ->> 'max_score', '')::numeric;
  v_mode    text := coalesce(p ->> 'submission_mode', 'none');
  v_pub     timestamptz := nullif(p ->> 'published_at', '')::timestamptz;
  v_due     timestamptz := nullif(p ->> 'due_at', '')::timestamptz;
  v_removed text[] := '{}';
begin
  select * into b from app.assessment_base(p);
  if v_max is null or v_max <= 0 or v_max > 1000 then raise exception 'حدّد الدرجة العظمى (أكبر من صفر)'; end if;
  if v_mode not in ('none', 'text', 'file', 'any') then raise exception 'نوع التسليم غير معروف'; end if;
  if v_pub is not null and v_due is not null and v_due <= v_pub then raise exception 'موعد التسليم يجب أن يكون بعد تاريخ الطرح'; end if;
  if v_mode <> 'none' and v_due is null then raise exception 'حدّد موعد التسليم'; end if;

  if p_id is not null then
    perform app.assert_can_edit(p_id);
    select * into v_old from public.assessments where id = p_id and kind = 'task';
    if v_old.id is null then raise exception 'المهمة غير موجودة'; end if;
    perform app.assert_can_author(v_old.class_id, b.v_subject);
    if exists (select 1 from public.grade_entries where assessment_id = p_id and score > v_max) then
      raise exception 'توجد درجات مرصودة أعلى من الدرجة العظمى الجديدة';
    end if;
    if v_old.submission_mode <> v_mode and exists (select 1 from public.task_submissions where assessment_id = p_id) then
      raise exception 'لا يمكن تغيير نوع التسليم بعد وصول تسليمات';
    end if;
    update public.assessments
       set title = b.v_title, description = app.nz(p, 'description'), subject_id = b.v_subject, term_id = b.v_term,
           eval_type_id = b.v_eval, max_score = v_max, published_at = v_pub, due_at = v_due,
           submission_mode = v_mode, allow_late = coalesce((p ->> 'allow_late')::boolean, false),
           is_draft = coalesce((p ->> 'is_draft')::boolean, false), link_url = null
     where id = p_id;
    update public.grade_entries set max_score = v_max where assessment_id = p_id and max_score <> v_max;
    if p ? 'attachments' then v_removed := app.save_attachments(p_id, p -> 'attachments'); end if;
    return jsonb_build_object('ids', jsonb_build_array(p_id), 'removed_paths', to_jsonb(v_removed));
  end if;

  if p_class_ids is null or cardinality(p_class_ids) = 0 then raise exception 'اختر فصلًا واحدًا على الأقل'; end if;
  if cardinality(p_class_ids) > 30 then raise exception 'الحد الأقصى 30 فصلًا دفعة واحدة'; end if;
  foreach c in array p_class_ids loop
    perform app.assert_can_author(c, b.v_subject);
    insert into public.assessments (kind, class_id, subject_id, term_id, eval_type_id, teacher_id, title, description,
                                    max_score, published_at, due_at, submission_mode, allow_late, is_draft)
    values ('task', c, b.v_subject, b.v_term, b.v_eval, b.v_teacher, b.v_title, app.nz(p, 'description'),
            v_max, v_pub, v_due, v_mode, coalesce((p ->> 'allow_late')::boolean, false), coalesce((p ->> 'is_draft')::boolean, false))
    returning id into v_id;
    perform app.save_attachments(v_id, coalesce(p -> 'attachments', '[]'));
    v_ids := v_ids || v_id;
  end loop;
  return jsonb_build_object('ids', to_jsonb(v_ids), 'removed_paths', '[]'::jsonb);
end $$;

-- الملف يُرفع أولًا (من الخادم)، ويُسجَّل هنا باسم الطالب نفسه
create or replace function public.register_upload(p_student_id bigint, p_assessment_id bigint, p_path text,
                                                  p_name text, p_mime text, p_size integer) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_path !~ ('^subs/' || p_assessment_id || '/' || p_student_id || '/[0-9a-f-]{36}\.[a-z0-9]{2,5}$') then
    raise exception 'مسار غير صالح';
  end if;
  if p_size < 1 or p_size > 1048576 then raise exception 'حجم الملف أكبر من 1 ميقا'; end if;
  if (select count(*) from public.pending_uploads where student_id = p_student_id and created_at > now() - interval '1 hour') >= 40 then
    raise exception 'رفعت ملفات كثيرة خلال ساعة. حاول لاحقًا';
  end if;
  insert into public.pending_uploads (storage_path, student_id, assessment_id, name, mime, size_bytes)
  values (p_path, p_student_id, p_assessment_id, left(p_name, 200), p_mime, p_size);
end $$;
revoke all on function public.register_upload(bigint, bigint, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.register_upload(bigint, bigint, text, text, text, integer) to service_role;

-- هل يستطيع الطالب الحالي التسليم الآن (يُستدعى قبل رفع الملفات)
create or replace function app.assert_can_submit(p_assessment_id bigint) returns public.assessments
language plpgsql stable security definer set search_path = '' as $$
declare
  a  public.assessments;
  v_student bigint := app.my_student_id();
begin
  if v_student is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from public.assessments where id = p_assessment_id and kind = 'task';
  if a.id is null or not app.student_sees_assessment(a.id) then raise exception 'المهمة غير متاحة'; end if;
  if a.submission_mode = 'none' then raise exception 'هذه المهمة لا تحتاج تسليمًا من المنصة'; end if;
  if a.due_at is not null and now() > a.due_at and not a.allow_late then raise exception 'انتهى موعد التسليم'; end if;
  if exists (select 1 from public.task_submissions where assessment_id = a.id and student_id = v_student and graded_at is not null) then
    raise exception 'صُحّح تسليمك، فلا يمكن تعديله';
  end if;
  return a;
end $$;

create or replace function public.can_submit_task(p_assessment_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.assessments;
begin
  a := app.assert_can_submit(p_assessment_id);
  return jsonb_build_object('student_id', app.my_student_id(), 'mode', a.submission_mode);
end $$;

create or replace function public.submit_task(p_assessment_id bigint, p_body text, p_files text[]) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  a          public.assessments;
  v_student  bigint := app.my_student_id();
  v_sub      bigint;
  v_body     text := nullif(btrim(coalesce(p_body, '')), '');
  v_files    text[] := coalesce(p_files, '{}');
  v_removed  text[];
  v_count    integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('task:' || p_assessment_id || ':' || coalesce(v_student, 0), 0));
  a := app.assert_can_submit(p_assessment_id);
  if char_length(v_body) > 20000 then raise exception 'النص أطول من المسموح'; end if;
  if cardinality(v_files) > 5 then raise exception 'خمسة ملفات كحد أقصى'; end if;
  if a.submission_mode = 'text' and (v_body is null or cardinality(v_files) > 0) then raise exception 'اكتب إجابتك نصًا'; end if;
  if a.submission_mode = 'file' and cardinality(v_files) = 0 then raise exception 'أرفق ملفًا أو صورة'; end if;
  if a.submission_mode = 'any' and v_body is null and cardinality(v_files) = 0 then raise exception 'اكتب إجابتك أو أرفق ملفًا'; end if;

  insert into public.task_submissions (assessment_id, student_id, body, is_late)
  values (a.id, v_student, v_body, a.due_at is not null and now() > a.due_at)
  on conflict (assessment_id, student_id) do update
     set body = excluded.body, is_late = excluded.is_late, updated_at = now()
  returning id into v_sub;

  -- ملفات سابقة لم تعد ضمن التسليم
  select coalesce(array_agg(storage_path), '{}') into v_removed from public.submission_files
   where submission_id = v_sub and deleted_at is null and not (storage_path = any (v_files));
  delete from public.submission_files where submission_id = v_sub and not (storage_path = any (v_files));

  -- ملفات جديدة: يجب أن تكون مرفوعة من نفس الطالب لنفس المهمة
  select count(*) into v_count from unnest(v_files) p
   where not exists (select 1 from public.submission_files f where f.submission_id = v_sub and f.storage_path = p)
     and not exists (select 1 from public.pending_uploads u where u.storage_path = p and u.student_id = v_student and u.assessment_id = a.id);
  if v_count > 0 then raise exception 'ملف غير معروف في التسليم'; end if;

  insert into public.submission_files (submission_id, storage_path, name, mime, size_bytes)
  select v_sub, u.storage_path, u.name, u.mime, u.size_bytes
    from public.pending_uploads u
   where u.storage_path = any (v_files) and u.student_id = v_student and u.assessment_id = a.id;
  delete from public.pending_uploads where storage_path = any (v_files) and student_id = v_student;

  return jsonb_build_object('submission_id', v_sub, 'removed_paths', to_jsonb(v_removed),
                            'late', a.due_at is not null and now() > a.due_at);
end $$;

-- الرصد والتصحيح دفعة واحدة: [{student_id, score, feedback}] — score فارغ = بلا تغيير في الدرجة
create or replace function public.grade_task(p_id bigint, p_rows jsonb) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  a        public.assessments;
  r        jsonb;
  v_sid    bigint;
  v_score  numeric;
  v_old    public.grade_entries;
  v_emp    bigint := app.my_employee_id();
  v_admin  boolean := app.is_admin();
  v_n      integer := 0;
begin
  perform app.assert_can_edit(p_id);
  select * into a from public.assessments where id = p_id;
  if a.kind = 'form' then raise exception 'درجات النموذج تُصحَّح من نتائجه'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'صيغة الرصد غير صحيحة'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_sid := (r ->> 'student_id')::bigint;
    if not exists (select 1 from public.students s where s.id = v_sid and s.class_id = a.class_id) then
      raise exception 'طالب ليس في فصل هذه المهمة';
    end if;
    v_score := nullif(r ->> 'score', '')::numeric;
    if v_score is not null then
      if v_score < 0 or v_score > a.max_score then raise exception 'الدرجة بين 0 و %', trim_scale(a.max_score); end if;
      select * into v_old from public.grade_entries where assessment_id = a.id and student_id = v_sid;
      if v_old.id is null then
        insert into public.grade_entries (assessment_id, student_id, score, max_score, source, recorded_by)
        values (a.id, v_sid, round(v_score, 2), a.max_score, 'manual', v_emp);
      elsif v_old.score <> round(v_score, 2) then
        if not v_admin and v_old.recorded_at < now() - interval '3 days' then
          raise exception 'انتهت مهلة تعديل الرصد (3 أيام). اطلب التعديل من الإدارة';
        end if;
        update public.grade_entries set score = round(v_score, 2), max_score = a.max_score where id = v_old.id;
      end if;
    end if;
    update public.task_submissions
       set graded_at = case when v_score is not null or graded_at is not null then coalesce(graded_at, now()) end,
           graded_by = coalesce(v_emp, graded_by),
           feedback = case when r ? 'feedback' then nullif(btrim(coalesce(r ->> 'feedback', '')), '') else feedback end
     where assessment_id = a.id and student_id = v_sid;
    v_n := v_n + 1;
  end loop;
  update public.assessments set grades_recorded_at = coalesce(grades_recorded_at, now()) where id = a.id;
  return v_n;
end $$;

-- إعادة التسليم للطالب (يُلغي التصحيح ليتمكن من التعديل)
create or replace function public.return_submission(p_submission_id bigint) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare s public.task_submissions;
begin
  select * into s from public.task_submissions where id = p_submission_id;
  if s.id is null then raise exception 'التسليم غير موجود'; end if;
  perform app.assert_can_edit(s.assessment_id);
  if s.files_purged_at is not null then raise exception 'حُذفت ملفات هذا التسليم، فلا يمكن إعادته'; end if;
  update public.task_submissions set graded_at = null where id = s.id;
end $$;

-- ---------------------------------------------------------------------
-- 11) نسخ وحذف
-- ---------------------------------------------------------------------
create or replace function public.duplicate_assessment(p_id bigint, p_class_ids integer[]) returns bigint[]
language plpgsql volatile security definer set search_path = '' as $$
declare
  a      public.assessments;
  c      integer;
  v_new  bigint;
  v_ids  bigint[] := '{}';
  q      record;
  v_q    bigint;
begin
  select * into a from public.assessments where id = p_id;
  if a.id is null or not (app.is_admin() or app.staff_can_access(a.class_id, a.subject_id)) then
    raise exception 'التقييم غير موجود';
  end if;
  if p_class_ids is null or cardinality(p_class_ids) = 0 then p_class_ids := array[a.class_id]; end if;
  if cardinality(p_class_ids) > 30 then raise exception 'الحد الأقصى 30 فصلًا'; end if;

  foreach c in array p_class_ids loop
    perform app.assert_can_author(c, a.subject_id);
    insert into public.assessments (kind, class_id, subject_id, term_id, eval_type_id, teacher_id, title, description,
                                    max_score, published_at, due_at, submission_mode, allow_late, is_draft)
    values (a.kind, c, a.subject_id, a.term_id, a.eval_type_id,
            case when app.is_admin() then a.teacher_id else app.my_employee_id() end,
            left(a.title || case when c = a.class_id then ' (نسخة)' else '' end, 200), a.description,
            a.max_score, null, null, a.submission_mode, a.allow_late, true)
    returning id into v_new;

    insert into public.assessment_attachments (assessment_id, kind, name, url, storage_path, mime, size_bytes, position)
    select v_new, kind, name, url, storage_path, mime, size_bytes, position
      from public.assessment_attachments where assessment_id = a.id;

    if a.kind = 'form' then
      insert into public.form_details (assessment_id, max_attempts, status, intro_video_url, shuffle_questions,
                                       shuffle_options, time_limit_minutes, show_results, track_focus)
      select v_new, max_attempts, 'draft', intro_video_url, shuffle_questions, shuffle_options,
             time_limit_minutes, show_results, track_focus
        from public.form_details where assessment_id = a.id;
      for q in select * from public.form_questions where assessment_id = a.id order by position loop
        insert into public.form_questions (assessment_id, position, body, image_url, points, section_title,
                                           section_instructions, qtype, config, explanation)
        values (v_new, q.position, q.body, q.image_url, q.points, q.section_title, q.section_instructions,
                q.qtype, q.config, q.explanation)
        returning id into v_q;
        insert into public.question_options (question_id, position, body, is_correct)
        select v_q, position, body, is_correct from public.question_options where question_id = q.id;
      end loop;
    end if;
    v_ids := v_ids || v_new;
  end loop;
  return v_ids;
end $$;

-- الحذف: مسموح فقط قبل وجود درجات أو محاولات. يعيد مسارات الملفات لحذفها من المخزن
create or replace function public.delete_assessment(p_id bigint) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_att    text[];
  v_subs   text[];
  v_imgs   text[];
begin
  perform app.assert_can_edit(p_id);
  if exists (select 1 from public.grade_entries where assessment_id = p_id) then
    raise exception 'لا يمكن حذف تقييم له درجات مرصودة. احذف الرصد أولًا أو أبقه كمسودة';
  end if;
  if exists (select 1 from public.form_attempts where assessment_id = p_id) then
    raise exception 'لا يمكن حذف نموذج له محاولات طلاب';
  end if;
  select coalesce(array_agg(storage_path), '{}') into v_att from public.assessment_attachments where assessment_id = p_id and storage_path is not null;
  select coalesce(array_agg(f.storage_path), '{}') into v_subs
    from public.submission_files f join public.task_submissions s on s.id = f.submission_id
   where s.assessment_id = p_id and f.deleted_at is null;
  select coalesce(array_agg(substr(image_url, 9)), '{}') into v_imgs from public.form_questions
   where assessment_id = p_id and image_url like 'storage:%';
  v_subs := v_subs || coalesce((select array_agg(storage_path) from public.pending_uploads where assessment_id = p_id), '{}');

  delete from public.form_sessions where assessment_id = p_id;
  delete from public.assessments where id = p_id;
  return jsonb_build_object('paths', to_jsonb(app.orphan_paths(v_att || v_imgs) || v_subs));
end $$;

-- ---------------------------------------------------------------------
-- 12) حذف ملفات التسليم المصحّحة (المخزن يُحذف من الخادم، والسجل هنا)
-- ---------------------------------------------------------------------
create or replace function public.purge_candidates(p_manual boolean, p_limit integer default 500)
returns table (id bigint, storage_path text, size_bytes integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cfg     jsonb := coalesce((select value from public.app_settings where key = 'submission_purge'), '{"enabled": true, "hours": 48}');
  v_hours   integer := greatest(1, coalesce((v_cfg ->> 'hours')::int, 48));
begin
  if not p_manual and not coalesce((v_cfg ->> 'enabled')::boolean, true) then return; end if;
  return query
    select f.id, f.storage_path, f.size_bytes
      from public.submission_files f join public.task_submissions s on s.id = f.submission_id
     where f.deleted_at is null and s.graded_at is not null
       and (p_manual or s.graded_at < now() - make_interval(hours => v_hours))
     order by s.graded_at
     limit greatest(1, least(p_limit, 1000));
end $$;

create or replace function public.mark_files_purged(p_ids bigint[]) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_n integer;
begin
  update public.submission_files set deleted_at = now() where id = any (p_ids) and deleted_at is null;
  get diagnostics v_n = row_count;
  update public.task_submissions s set files_purged_at = now()
   where s.files_purged_at is null
     and exists (select 1 from public.submission_files f where f.submission_id = s.id and f.id = any (p_ids))
     and not exists (select 1 from public.submission_files f where f.submission_id = s.id and f.deleted_at is null);
  return v_n;
end $$;

-- رفعات لم تُسلَّم خلال يوم: تُحذف
create or replace function public.stale_uploads(p_limit integer default 500) returns setof text
language sql stable security definer set search_path = '' as $$
  select storage_path from public.pending_uploads where created_at < now() - interval '1 day' order by created_at limit p_limit
$$;
create or replace function public.forget_uploads(p_paths text[]) returns void
language sql volatile security definer set search_path = '' as $$
  delete from public.pending_uploads where storage_path = any (p_paths)
$$;

revoke all on function public.purge_candidates(boolean, integer), public.mark_files_purged(bigint[]),
                       public.stale_uploads(integer), public.forget_uploads(text[])
  from public, anon, authenticated;
grant execute on function public.purge_candidates(boolean, integer), public.mark_files_purged(bigint[]),
                          public.stale_uploads(integer), public.forget_uploads(text[])
  to service_role;

-- للإداري: حجم ما يُخزَّن وما ينتظر الحذف
create or replace function public.purge_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_admin();
  return jsonb_build_object(
    'settings', coalesce((select value from public.app_settings where key = 'submission_purge'), '{"enabled": true, "hours": 48}'),
    'stored_files', (select count(*) from public.submission_files where deleted_at is null),
    'stored_bytes', (select coalesce(sum(size_bytes), 0) from public.submission_files where deleted_at is null),
    'graded_files', (select count(*) from public.submission_files f join public.task_submissions s on s.id = f.submission_id
                      where f.deleted_at is null and s.graded_at is not null),
    'graded_bytes', (select coalesce(sum(f.size_bytes), 0) from public.submission_files f join public.task_submissions s on s.id = f.submission_id
                      where f.deleted_at is null and s.graded_at is not null),
    'purged_files', (select count(*) from public.submission_files where deleted_at is not null));
end $$;

-- ---------------------------------------------------------------------
-- 13) القوائم (بصلاحيات المستخدم نفسه — RLS تحدد ما يظهر)
-- ---------------------------------------------------------------------
create or replace function public.staff_assessments(p jsonb) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_page   integer := greatest(1, coalesce((p ->> 'page')::int, 1));
  v_size   integer := least(50, greatest(5, coalesce((p ->> 'size')::int, 15)));
  v_kind   text := nullif(p ->> 'kind', '');
  v_class  integer := nullif(p ->> 'class_id', '')::int;
  v_subj   smallint := nullif(p ->> 'subject_id', '')::smallint;
  v_status text := nullif(p ->> 'status', '');
  v_q      text := nullif(btrim(p ->> 'q'), '');
  v_mine   boolean := coalesce((p ->> 'mine')::boolean, false);
  v_sort   text := coalesce(p ->> 'sort', 'newest');
  v_me     bigint := app.my_employee_id();
  result   jsonb;
begin
  with base as (
    select a.id, a.kind, a.title, a.class_id, a.subject_id, a.teacher_id, a.created_at, a.is_draft,
           a.max_score, a.published_at, a.due_at, a.submission_mode, a.grades_recorded_at,
           f.status as form_status, f.opens_at, f.closes_at, f.time_limit_minutes,
           case
             when a.kind = 'form' then
               case when f.status = 'draft' then 'draft'
                    when f.status = 'closed' or (f.closes_at is not null and f.closes_at <= now()) then 'closed'
                    when f.opens_at is not null and f.opens_at > now() then 'scheduled'
                    else 'open' end
             else
               case when a.is_draft then 'draft'
                    when a.published_at is not null and a.published_at > now() then 'scheduled'
                    when a.due_at is not null and a.due_at <= now() then 'closed'
                    else 'open' end
           end as status
      from public.assessments a
      left join public.form_details f on f.assessment_id = a.id
     where a.kind in ('task', 'form')
       and (v_kind is null or a.kind::text = v_kind)
       and (v_class is null or a.class_id = v_class)
       and (v_subj is null or a.subject_id = v_subj)
       and (not v_mine or a.teacher_id = v_me)
       and (v_q is null or a.title ilike '%' || replace(replace(v_q, '%', ''), '_', '') || '%')
  ), counted as (
    select b.*,
           (select count(*) from public.students s where s.class_id = b.class_id and s.status = 'active') as class_size,
           case when b.kind = 'form'
                then (select count(distinct t.student_id) from public.form_attempts t where t.assessment_id = b.id and not t.is_auto_absent)
                else (select count(*) from public.task_submissions s where s.assessment_id = b.id) end as submitted,
           (select count(*) from public.grade_entries g where g.assessment_id = b.id) as graded,
           case when b.kind = 'form'
                then (select count(*) from public.form_attempts t where t.assessment_id = b.id and t.pending_review > 0)
                else (select count(*) from public.task_submissions s where s.assessment_id = b.id and s.graded_at is null) end as to_grade,
           (select count(*) from public.form_questions q where q.assessment_id = b.id) as questions
      from base b
  ), filtered as (
    select * from counted c
     where v_status is null
        or (v_status = 'needs_grading' and c.to_grade > 0)
        or c.status = v_status
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.ord)
        from (
          select f.*, row_number() over (order by
                   case when v_sort = 'due' then coalesce(f.due_at, f.closes_at) end asc nulls last,
                   case when v_sort = 'title' then f.title end asc,
                   f.created_at desc, f.id desc) as ord
            from filtered f
           order by ord
           offset (v_page - 1) * v_size limit v_size
        ) x), '[]'::jsonb))
    into result;
  return result;
end $$;

create or replace function public.staff_assessment_stats() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'tasks', count(*) filter (where a.kind = 'task'),
    'forms', count(*) filter (where a.kind = 'form'),
    'open', count(*) filter (where (a.kind = 'task' and not a.is_draft and (a.published_at is null or a.published_at <= now()) and (a.due_at is null or a.due_at > now()))
                              or (a.kind = 'form' and f.status = 'published' and (f.opens_at is null or f.opens_at <= now()) and (f.closes_at is null or f.closes_at > now()))),
    'drafts', count(*) filter (where (a.kind = 'task' and a.is_draft) or (a.kind = 'form' and f.status = 'draft')),
    'closing_soon', count(*) filter (where (a.kind = 'task' and not a.is_draft and a.due_at between now() and now() + interval '24 hours')
                                      or (a.kind = 'form' and f.status = 'published' and f.closes_at between now() and now() + interval '24 hours')),
    'to_grade', (select count(*) from public.task_submissions s where s.graded_at is null)
              + (select count(*) from public.form_attempts t where t.pending_review > 0))
    from public.assessments a left join public.form_details f on f.assessment_id = a.id
   where a.kind in ('task', 'form')
$$;

-- قائمة الطالب: كل مهام ونماذج فصله مع حالته في كل منها — طلب واحد
create or replace function public.my_assessments() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x.sort_at desc nulls last, x.id desc), '[]'::jsonb) from (
    select a.id, a.kind, a.title, a.description, a.max_score, a.published_at, a.due_at, a.submission_mode, a.allow_late,
           a.created_at, s.name as subject, e.name as eval_type,
           f.opens_at, f.closes_at, f.time_limit_minutes, f.max_attempts, f.status as form_status, f.show_results,
           (select count(*) from public.form_questions q where q.assessment_id = a.id) as questions,
           (select count(*) from public.form_attempts t where t.assessment_id = a.id and not t.is_auto_absent
               and t.student_id = app.my_student_id()) as attempts,
           exists (select 1 from public.form_sessions fs where fs.assessment_id = a.id and fs.submitted_at is null
                      and fs.student_id = app.my_student_id()) as in_progress,
           (select jsonb_build_object('submitted_at', ts.submitted_at, 'graded_at', ts.graded_at, 'is_late', ts.is_late,
                                      'feedback', ts.feedback)
              from public.task_submissions ts where ts.assessment_id = a.id and ts.student_id = app.my_student_id()) as submission,
           (select jsonb_build_object('score', g.score, 'max_score', g.max_score, 'source', g.source)
              from public.grade_entries g where g.assessment_id = a.id and g.student_id = app.my_student_id()
               and not exists (select 1 from public.grade_visibility v
                                where v.student_id = g.student_id and v.subject_id = a.subject_id
                                  and v.term_id = a.term_id and not v.is_visible)) as grade,
           coalesce(f.closes_at, a.due_at, a.published_at, a.created_at) as sort_at
      from public.assessments a
      left join public.form_details f on f.assessment_id = a.id
      left join public.subjects s on s.id = a.subject_id
      left join public.eval_types e on e.id = a.eval_type_id
     where a.kind in ('task', 'form') and a.class_id = app.my_class_id() and app.student_sees_assessment(a.id)
  ) x
$$;

-- ---------------------------------------------------------------------
-- 14) صلاحيات الاستدعاء
-- ---------------------------------------------------------------------
revoke all on function
  public.start_form_session(bigint), public.save_form_answers(bigint, jsonb), public.submit_form_session(bigint, jsonb),
  public.save_form_answers_internal(bigint, jsonb), public.log_form_event(bigint, text), public.get_form_review(bigint),
  public.refresh_form(bigint), public.save_form(bigint, jsonb, integer[]), public.set_form_status(bigint, text),
  public.grade_form_answer(bigint, bigint, numeric, text), public.reset_form_attempt(bigint),
  public.save_task(bigint, jsonb, integer[]), public.can_submit_task(bigint), public.submit_task(bigint, text, text[]),
  public.grade_task(bigint, jsonb), public.return_submission(bigint), public.duplicate_assessment(bigint, integer[]),
  public.delete_assessment(bigint), public.purge_stats(), public.staff_assessments(jsonb),
  public.staff_assessment_stats(), public.my_assessments()
  from public, anon;
grant execute on function
  public.start_form_session(bigint), public.save_form_answers(bigint, jsonb), public.submit_form_session(bigint, jsonb),
  public.log_form_event(bigint, text), public.get_form_review(bigint),
  public.refresh_form(bigint), public.save_form(bigint, jsonb, integer[]), public.set_form_status(bigint, text),
  public.grade_form_answer(bigint, bigint, numeric, text), public.reset_form_attempt(bigint),
  public.save_task(bigint, jsonb, integer[]), public.can_submit_task(bigint), public.submit_task(bigint, text, text[]),
  public.grade_task(bigint, jsonb), public.return_submission(bigint), public.duplicate_assessment(bigint, integer[]),
  public.delete_assessment(bigint), public.purge_stats(), public.staff_assessments(jsonb),
  public.staff_assessment_stats(), public.my_assessments()
  to authenticated;
-- الحفظ الداخلي لا يُستدعى من المتصفح مباشرة
revoke all on function public.save_form_answers_internal(bigint, jsonb) from authenticated;

revoke all on function app.finalize_session(bigint), app.regrade_form(bigint), app.recompute_attempt(bigint),
                       app.save_form_questions(bigint, jsonb), app.apply_form_details(bigint, jsonb, boolean),
                       app.save_attachments(bigint, jsonb), app.finalize_expired(bigint)
  from public, anon, authenticated;

-- سجل التدقيق للجداول الجديدة المهمة
create trigger assessment_attachments_audit after insert or update or delete on public.assessment_attachments
  for each row execute function app.audit_row();
create trigger task_submissions_audit after update or delete on public.task_submissions
  for each row execute function app.audit_row();
