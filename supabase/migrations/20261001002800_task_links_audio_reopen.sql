-- =====================================================================
-- هجرة 28 — تسليم المهام: روابط وتسجيل صوتي وحد 3 ملفات، وإعادة فتح المهمة
--   submission_mode: + link (روابط فقط) + audio (تسجيل صوتي واحد يسجّله الطالب، للتسميع والإلقاء)
--   الملفات: 3 كحد أقصى (صور/PDF ≤ 1 ميقا بعد الضغط، والتسجيل الصوتي ≤ 6 ميقا ≈ 5 دقائق)
--   إعادة الفتح (مهمة أو نموذج): موعد جديد، وتُربط بالأسبوع الدراسي الحالي فتظهر فيه
-- =====================================================================

alter table public.assessments drop constraint if exists assessments_submission_mode_check;
alter table public.assessments add constraint assessments_submission_mode_check
  check (submission_mode in ('none', 'text', 'file', 'any', 'link', 'audio'));
comment on column public.assessments.submission_mode is
  'none = بلا تسليم، text = جواب نصي، file = ملف/صورة، any = نص أو ملف أو رابط، link = رابط، audio = تسجيل صوتي';

alter table public.task_submissions add column if not exists links text[] not null default '{}';

-- الحجم: الصوت حتى 6 ميقا (والتحقق الدقيق حسب النوع في register_upload)
alter table public.pending_uploads drop constraint if exists pending_uploads_size_bytes_check;
alter table public.pending_uploads add constraint pending_uploads_size_bytes_check
  check (size_bytes between 1 and 6291456 and (mime like 'audio/%' or size_bytes <= 1048576));
alter table public.submission_files drop constraint if exists submission_files_size_bytes_check;
alter table public.submission_files add constraint submission_files_size_bytes_check
  check (size_bytes between 1 and 6291456 and (mime like 'audio/%' or size_bytes <= 1048576));

-- حفظ المهمة: نفس هجرة 20 مع النوعين الجديدين
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
  if v_mode not in ('none', 'text', 'file', 'any', 'link', 'audio') then raise exception 'نوع التسليم غير معروف'; end if;
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

-- الرفع: الصوت حتى 6 ميقا، وغيره 1 ميقا
create or replace function public.register_upload(p_student_id bigint, p_assessment_id bigint, p_path text,
                                                  p_name text, p_mime text, p_size integer) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_audio boolean := coalesce(p_mime, '') like 'audio/%';
  v_max   integer := 1048576;
begin
  if v_audio then v_max := 6291456; end if;
  if p_path !~ ('^subs/' || p_assessment_id || '/' || p_student_id || '/[0-9a-f-]{36}\.[a-z0-9]{2,5}$') then
    raise exception 'مسار غير صالح';
  end if;
  if p_size < 1 or p_size > v_max then
    if v_audio then raise exception 'التسجيل أطول من المسموح (6 ميقا ≈ 5 دقائق)'; end if;
    raise exception 'حجم الملف أكبر من 1 ميقا';
  end if;
  if (select count(*) from public.pending_uploads where student_id = p_student_id and created_at > now() - interval '1 hour') >= 40 then
    raise exception 'رفعت ملفات كثيرة خلال ساعة. حاول لاحقًا';
  end if;
  insert into public.pending_uploads (storage_path, student_id, assessment_id, name, mime, size_bytes)
  values (p_path, p_student_id, p_assessment_id, left(p_name, 200), p_mime, p_size);
end $$;
revoke all on function public.register_upload(bigint, bigint, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.register_upload(bigint, bigint, text, text, text, integer) to service_role;

-- التسليم بالروابط والصوت (يحل محل نسخة الوسائط الثلاث)
drop function if exists public.submit_task(bigint, text, text[]);
create or replace function public.submit_task(p_assessment_id bigint, p_body text, p_files text[], p_links text[] default '{}')
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  a          public.assessments;
  v_student  bigint := app.my_student_id();
  v_sub      bigint;
  v_body     text := nullif(btrim(coalesce(p_body, '')), '');
  v_files    text[] := coalesce(p_files, '{}');
  v_links    text[];
  v_removed  text[];
  v_count    integer;
  v_audio    integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('task:' || p_assessment_id || ':' || coalesce(v_student, 0), 0));
  a := app.assert_can_submit(p_assessment_id);
  select coalesce(array_agg(distinct btrim(l)), '{}') into v_links from unnest(coalesce(p_links, '{}')) l where btrim(l) <> '';
  if char_length(v_body) > 20000 then raise exception 'النص أطول من المسموح'; end if;
  if cardinality(v_files) > 3 then raise exception 'ثلاثة ملفات كحد أقصى'; end if;
  if cardinality(v_links) > 3 then raise exception 'ثلاثة روابط كحد أقصى'; end if;
  if exists (select 1 from unnest(v_links) l where l !~* '^https?://[^\s]{3,}$' or char_length(l) > 500) then
    raise exception 'رابط غير صحيح: يبدأ بـ https://';
  end if;

  -- نوع الملفات (صوت أو غيره) من سجلات الرفع
  select count(*) into v_audio from unnest(v_files) p
   where exists (select 1 from public.pending_uploads u where u.storage_path = p and u.mime like 'audio/%')
      or exists (select 1 from public.submission_files f where f.storage_path = p and f.mime like 'audio/%');

  if a.submission_mode = 'text' and (v_body is null or cardinality(v_files) > 0 or cardinality(v_links) > 0) then raise exception 'اكتب إجابتك نصًا'; end if;
  if a.submission_mode = 'file' and (cardinality(v_files) = 0 or v_audio > 0) then raise exception 'أرفق صورة أو ملفًا'; end if;
  if a.submission_mode = 'link' and (cardinality(v_links) = 0 or cardinality(v_files) > 0) then raise exception 'أضف رابط عملك'; end if;
  if a.submission_mode = 'audio' and (cardinality(v_files) <> 1 or v_audio <> 1) then raise exception 'سجّل مقطعًا صوتيًا واحدًا'; end if;
  if a.submission_mode = 'any' and (v_body is null and cardinality(v_files) = 0 and cardinality(v_links) = 0) then
    raise exception 'اكتب إجابتك أو أرفق ملفًا أو رابطًا';
  end if;
  if a.submission_mode <> 'audio' and v_audio > 0 then raise exception 'هذه المهمة لا تقبل تسجيلًا صوتيًا'; end if;

  insert into public.task_submissions (assessment_id, student_id, body, links, is_late)
  values (a.id, v_student, v_body, v_links, a.due_at is not null and now() > a.due_at)
  on conflict (assessment_id, student_id) do update
     set body = excluded.body, links = excluded.links, is_late = excluded.is_late, updated_at = now()
  returning id into v_sub;

  select coalesce(array_agg(storage_path), '{}') into v_removed from public.submission_files
   where submission_id = v_sub and deleted_at is null and not (storage_path = any (v_files));
  delete from public.submission_files where submission_id = v_sub and not (storage_path = any (v_files));

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
revoke all on function public.submit_task(bigint, text, text[], text[]) from public, anon;
grant execute on function public.submit_task(bigint, text, text[], text[]) to authenticated;

-- الأسبوع الدراسي الحالي (أو null خارج التقويم)
create or replace function app.current_week_id() returns integer
language sql stable security definer set search_path = '' as $$
  select w.week_id from public.school_weeks w
   where (now() at time zone 'Asia/Riyadh')::date between w.starts_on and w.ends_on
   order by w.starts_on desc limit 1
$$;

-- إعادة فتح نموذج: كما كان + ربطه بالأسبوع الحالي
create or replace function public.reopen_form(p_assessment_id bigint, p_closes_at timestamptz) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.can_edit_assessment(p_assessment_id) then raise exception 'FORBIDDEN'; end if;
  if p_closes_at is null or p_closes_at <= now() then
    raise exception 'حدّد تاريخ ووقت إغلاق جديد في المستقبل';
  end if;
  if not exists (select 1 from public.form_questions where assessment_id = p_assessment_id) then
    raise exception 'لا يمكن فتح نموذج بلا أسئلة';
  end if;
  delete from public.grade_entries where assessment_id = p_assessment_id and source = 'auto_absent';
  delete from public.form_attempts where assessment_id = p_assessment_id and is_auto_absent;
  update public.form_details
     set status = 'published', closes_at = p_closes_at, absence_settled_at = null
   where assessment_id = p_assessment_id;
  update public.assessments set week_id = coalesce(app.current_week_id(), week_id) where id = p_assessment_id;
end $$;
revoke all on function public.reopen_form(bigint, timestamptz) from public, anon;
grant execute on function public.reopen_form(bigint, timestamptz) to authenticated;

-- إعادة فتح مهمة: موعد تسليم جديد، وتظهر في الأسبوع الحالي. التسليمات السابقة تبقى كما هي.
create or replace function public.reopen_task(p_assessment_id bigint, p_due_at timestamptz) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.can_edit_assessment(p_assessment_id) then raise exception 'FORBIDDEN'; end if;
  if (select kind from public.assessments where id = p_assessment_id) <> 'task' then raise exception 'ليست مهمة'; end if;
  if p_due_at is null or p_due_at <= now() then raise exception 'حدّد موعد تسليم جديدًا في المستقبل'; end if;
  update public.assessments
     set due_at = p_due_at,
         published_at = case when published_at is null or published_at > now() then now() else published_at end,
         week_id = coalesce(app.current_week_id(), week_id)
   where id = p_assessment_id;
end $$;
revoke all on function public.reopen_task(bigint, timestamptz) from public, anon;
grant execute on function public.reopen_task(bigint, timestamptz) to authenticated;

do $$ begin raise notice '✅ هجرة 28: الروابط والتسجيل الصوتي وإعادة فتح المهام'; end $$;
