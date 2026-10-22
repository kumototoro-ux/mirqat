import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getClasses, getCurrentTermId, getSubjects, getTerms, REF_TAG } from '@/lib/data';
import type { CurrentUser } from '@/lib/auth/session';
import { CLASS_SELECT, classLabel, type ClassRef } from '@/lib/format';
import type { ServerQuestion } from './draft';
import type { QType, ShowResults, SubmissionMode } from './shared';
import { publicUrl, signedUrls } from './storage';

const cachedClassDims = unstable_cache(
  async () => {
    const { data } = await createAdminClient()
      .from('classes')
      .select('id, branch_id, grade_id, section_id, grade:grades(stage_id)')
      .eq('is_active', true)
      .returns<{ id: number; branch_id: number; grade_id: number; section_id: number; grade: { stage_id: number } | null }[]>();
    return data ?? [];
  },
  ['class-dims'],
  { revalidate: 600, tags: [REF_TAG] },
);

const cachedEvalTypes = unstable_cache(
  async () => {
    const { data } = await createAdminClient().from('eval_types').select('id, name').order('sort_order').order('name');
    return data ?? [];
  },
  ['eval-types'],
  { revalidate: 600, tags: [REF_TAG] },
);
export const getEvalTypes = cache(() => cachedEvalTypes());

export type Opt = { value: number; label: string };
export type AuthorContext = {
  classes: (Opt & { branch: string; grade_id: number; branch_id: number; section_id: number })[];
  subjects: Opt[];
  /** المواد المتاحة لكل فصل (من توزيع المواد ∩ مواد المعلم) */
  subjectsByClass: Record<number, number[]>;
  terms: Opt[];
  currentTerm: number | null;
  evalTypes: Opt[];
  teachers: Opt[];
  isAdmin: boolean;
};

/** ما يستطيع المستخدم إنشاءه: فصوله ومواده من نطاقه الصريح فقط (الإداري: الكل) */
export const getAuthorContext = cache(async (user: CurrentUser): Promise<AuthorContext> => {
  const supabase = await createClient();
  const isAdmin = user.role === 'admin';
  const [classes, subjects, terms, currentTerm, evalTypes, scope, matrix, teachers, dimsList] = await Promise.all([
    getClasses(),
    getSubjects(),
    getTerms(),
    getCurrentTermId(),
    getEvalTypes(),
    isAdmin || !user.employeeId
      ? Promise.resolve({ data: [] as ScopeRow[] })
      : supabase.from('staff_scope').select('branch_id, stage_id, grade_id, section_id, subject_id').eq('employee_id', user.employeeId).returns<ScopeRow[]>(),
    createAdminClient().from('subject_matrix').select('branch_id, grade_id, section_id, subject_id').limit(5000),
    isAdmin ? supabase.from('staff_directory').select('id, name_ar').order('name_ar') : Promise.resolve({ data: [] as { id: number; name_ar: string }[] }),
    cachedClassDims(),
  ]);
  const dims = new Map(dimsList.map((d) => [d.id, d]));
  const sc = scope.data ?? [];
  const has = (k: keyof ScopeRow, v: number | null | undefined) => sc.some((s) => s[k] === v);
  const anyStage = sc.some((s) => s.stage_id != null);
  const mySubjects = new Set(isAdmin ? subjects.map((s) => s.id) : sc.filter((s) => s.subject_id != null).map((s) => s.subject_id!));

  const allowed = classes.filter((c) => {
    const r = dims.get(c.id);
    if (!r) return false;
    if (isAdmin) return true;
    return has('branch_id', r.branch_id) && has('grade_id', r.grade_id) && has('section_id', r.section_id) && (!anyStage || has('stage_id', r.grade?.stage_id));
  });
  const m = matrix.data ?? [];
  const subjectsByClass: Record<number, number[]> = {};
  for (const c of allowed) {
    const r = dims.get(c.id)!;
    const inMatrix = m.filter((x) => x.branch_id === r.branch_id && x.grade_id === r.grade_id && (x.section_id == null || x.section_id === r.section_id)).map((x) => x.subject_id);
    const list = (inMatrix.length ? inMatrix : [...mySubjects]).filter((s) => mySubjects.has(s));
    subjectsByClass[c.id] = [...new Set(list)];
  }
  const multiBranch = new Set(allowed.map((c) => c.branch)).size > 1;
  return {
    classes: allowed.map((c) => ({
      value: c.id,
      label: multiBranch ? `${c.label} · ${c.branch}` : c.label,
      branch: c.branch,
      branch_id: dims.get(c.id)!.branch_id,
      grade_id: dims.get(c.id)!.grade_id,
      section_id: dims.get(c.id)!.section_id,
    })),
    subjects: subjects.filter((s) => mySubjects.has(s.id)).map((s) => ({ value: s.id, label: s.name })),
    subjectsByClass,
    terms: terms.map((t) => ({ value: t.id, label: `${t.name}${t.year ? ` ${t.year}` : ''}` })),
    currentTerm,
    evalTypes: evalTypes.map((e) => ({ value: e.id, label: e.name })),
    teachers: (teachers.data ?? []).map((t) => ({ value: t.id, label: t.name_ar })),
    isAdmin,
  };
});
type ScopeRow = { branch_id: number | null; stage_id: number | null; grade_id: number | null; section_id: number | null; subject_id: number | null };

/* =====================================================================
   تفاصيل مهمة أو نموذج للمعلم
   ===================================================================== */
export type Attachment = { id?: number; kind: 'image' | 'file' | 'link'; name: string; url: string | null; storage_path: string | null; mime: string | null; size_bytes: number | null; href: string };

export type AssessmentBase = {
  id: number;
  kind: 'task' | 'form';
  title: string;
  description: string | null;
  class_id: number;
  class_label: string;
  subject_id: number;
  subject: string;
  term_id: number;
  eval_type_id: number | null;
  eval_type: string | null;
  teacher_id: number | null;
  teacher: string | null;
  max_score: number | null;
  published_at: string | null;
  due_at: string | null;
  submission_mode: SubmissionMode;
  allow_late: boolean;
  is_draft: boolean;
  created_at: string;
  canEdit: boolean;
};

type BaseRow = Omit<AssessmentBase, 'class_label' | 'subject' | 'eval_type' | 'teacher' | 'canEdit'> & {
  class: ClassRef;
  subj: { name: string } | null;
  ev: { name: string } | null;
  t: { name_ar: string } | null;
};

async function loadBase(id: number, user: CurrentUser) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('assessments')
    .select(
      `id, kind, title, description, class_id, subject_id, term_id, eval_type_id, teacher_id, max_score, published_at, due_at,
       submission_mode, allow_late, is_draft, created_at,
       class:classes(${CLASS_SELECT}), subj:subjects(name), ev:eval_types(name), t:staff_directory(name_ar)`,
    )
    .eq('id', id)
    .in('kind', ['task', 'form'])
    .maybeSingle<BaseRow>();
  if (!data) return null;
  const { class: c, subj, ev, t, ...rest } = data;
  return {
    supabase,
    base: {
      ...rest,
      max_score: rest.max_score != null ? Number(rest.max_score) : null,
      class_label: classLabel(c, true),
      subject: subj?.name ?? '',
      eval_type: ev?.name ?? null,
      teacher: t?.name_ar ?? null,
      canEdit: user.role === 'admin' || (rest.teacher_id != null && rest.teacher_id === user.employeeId),
    } satisfies AssessmentBase,
  };
}

function withHref(a: Omit<Attachment, 'href'>): Attachment {
  return { ...a, href: a.kind === 'link' ? a.url! : publicUrl(a.storage_path!) };
}

export type RosterStudent = { id: number; code: string; name_ar: string };

export type TaskSubmission = {
  id: number;
  student_id: number;
  body: string | null;
  is_late: boolean;
  submitted_at: string;
  updated_at: string;
  graded_at: string | null;
  feedback: string | null;
  files_purged_at: string | null;
  files: { id: number; name: string; mime: string; size_bytes: number; deleted_at: string | null; url: string | null }[];
};
export type GradeRow = { student_id: number; score: number; max_score: number; source: string; recorded_at: string; is_edited: boolean };

export type TaskDetail = AssessmentBase & {
  attachments: Attachment[];
  roster: RosterStudent[];
  submissions: TaskSubmission[];
  grades: GradeRow[];
};

export async function getTaskDetail(id: number, user: CurrentUser): Promise<TaskDetail | null> {
  const loaded = await loadBase(id, user);
  if (!loaded || loaded.base.kind !== 'task') return null;
  const { supabase, base } = loaded;
  const [att, roster, subs, grades] = await Promise.all([
    supabase.from('assessment_attachments').select('id, kind, name, url, storage_path, mime, size_bytes').eq('assessment_id', id).order('position'),
    supabase.from('students').select('id, code, name_ar').eq('class_id', base.class_id).eq('status', 'active').order('name_ar'),
    supabase
      .from('task_submissions')
      .select('id, student_id, body, is_late, submitted_at, updated_at, graded_at, feedback, files_purged_at, files:submission_files(id, name, mime, size_bytes, deleted_at, storage_path)')
      .eq('assessment_id', id),
    supabase.from('grade_entries').select('student_id, score, max_score, source, recorded_at, is_edited').eq('assessment_id', id),
  ]);
  type RawSub = Omit<TaskSubmission, 'files'> & { files: (TaskSubmission['files'][number] & { storage_path: string })[] };
  const rawSubs = (subs.data ?? []) as RawSub[];
  const live = rawSubs.flatMap((s) => s.files.filter((f) => !f.deleted_at).map((f) => f.storage_path));
  const urls = await signedUrls(live, 3600);
  // طالب سلّم ثم نُقل لفصل آخر: يبقى ظاهرًا في القائمة
  const rosterIds = new Set((roster.data ?? []).map((r) => r.id));
  const extra = rawSubs.filter((s) => !rosterIds.has(s.student_id)).map((s) => s.student_id);
  let extraRows: RosterStudent[] = [];
  if (extra.length) {
    const { data } = await supabase.from('students').select('id, code, name_ar').in('id', extra);
    extraRows = data ?? [];
  }
  return {
    ...base,
    attachments: ((att.data ?? []) as Omit<Attachment, 'href'>[]).map(withHref),
    roster: [...(roster.data ?? []), ...extraRows],
    submissions: rawSubs.map(({ files, ...s }) => ({
      ...s,
      files: files.map(({ storage_path, ...f }) => ({ ...f, url: f.deleted_at ? null : (urls[storage_path] ?? null) })),
    })),
    grades: ((grades.data ?? []) as GradeRow[]).map((g) => ({ ...g, score: Number(g.score), max_score: Number(g.max_score) })),
  };
}

export type FormDetails = {
  status: 'draft' | 'published' | 'closed';
  opens_at: string | null;
  closes_at: string | null;
  max_attempts: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  time_limit_minutes: number | null;
  show_results: ShowResults;
  track_focus: boolean;
  allow_review: boolean;
  intro_video_url: string | null;
  absence_settled_at: string | null;
};
export type AttemptRow = {
  id: number;
  student_id: number;
  attempt_no: number;
  is_auto_absent: boolean;
  score: number;
  max_score: number;
  submitted_at: string;
  pending_review: number;
  duration_seconds: number | null;
  focus_events: number;
  answers: { question_id: number; option_id: number | null; response: unknown; points: number; status: 'auto' | 'pending' | 'manual'; feedback: string | null }[];
};
export type FormDetail = AssessmentBase & {
  details: FormDetails;
  questions: ServerQuestion[];
  roster: RosterStudent[];
  attempts: AttemptRow[];
  sessions: { id: number; student_id: number; started_at: string; deadline_at: string | null; saved_at: string | null; submitted_at: string | null; focus_events: number; answered: number }[];
  events: { session_id: number; kind: string; at: string }[];
};

export async function getFormDetail(id: number, user: CurrentUser): Promise<FormDetail | null> {
  const loaded = await loadBase(id, user);
  if (!loaded || loaded.base.kind !== 'form') return null;
  const { supabase, base } = loaded;
  // الجلسات المنتهية تُسلَّم والغياب يُسوّى قبل العرض (لصاحب النموذج فقط)
  if (base.canEdit) await supabase.rpc('refresh_form', { p_assessment_id: id });
  const [details, qs, roster, attempts, sessions] = await Promise.all([
    supabase
      .from('form_details')
      .select('status, opens_at, closes_at, max_attempts, shuffle_questions, shuffle_options, time_limit_minutes, show_results, track_focus, allow_review, intro_video_url, absence_settled_at')
      .eq('assessment_id', id)
      .maybeSingle<FormDetails>(),
    supabase
      .from('form_questions')
      .select('id, qtype, body, image_url, points, section_title, explanation, config, options:question_options(id, body, is_correct, position)')
      .eq('assessment_id', id)
      .order('position'),
    supabase.from('students').select('id, code, name_ar').eq('class_id', base.class_id).eq('status', 'active').order('name_ar'),
    supabase
      .from('form_attempts')
      .select('id, student_id, attempt_no, is_auto_absent, score, max_score, submitted_at, pending_review, duration_seconds, focus_events, answers:attempt_answers(question_id, option_id, response, points, status, feedback)')
      .eq('assessment_id', id)
      .order('attempt_no'),
    supabase.from('form_sessions').select('id, student_id, started_at, deadline_at, saved_at, submitted_at, focus_events, answers').eq('assessment_id', id),
  ]);
  const sessionIds = (sessions.data ?? []).map((s) => s.id);
  const events = sessionIds.length
    ? await supabase.from('form_events').select('session_id, kind, at').in('session_id', sessionIds).order('at').limit(3000)
    : { data: [] };
  const atts = (attempts.data ?? []) as AttemptRow[];
  const rosterIds = new Set((roster.data ?? []).map((r) => r.id));
  const extra = [...new Set(atts.map((a) => a.student_id).filter((s) => !rosterIds.has(s)))];
  let extraRows: RosterStudent[] = [];
  if (extra.length) {
    const { data } = await supabase.from('students').select('id, code, name_ar').in('id', extra);
    extraRows = data ?? [];
  }
  type RawQ = Omit<ServerQuestion, 'options'> & { options: (ServerQuestion['options'][number] & { position: number })[] };
  return {
    ...base,
    details: details.data ?? {
      status: 'draft', opens_at: null, closes_at: null, max_attempts: 1, shuffle_questions: false, shuffle_options: false,
      time_limit_minutes: null, show_results: 'after_submit', track_focus: true, allow_review: true, intro_video_url: null, absence_settled_at: null,
    },
    questions: ((qs.data ?? []) as RawQ[]).map((q) => ({
      ...q,
      qtype: q.qtype as QType,
      points: Number(q.points),
      options: [...q.options].sort((a, b) => a.position - b.position).map(({ id, body, is_correct }) => ({ id, body, is_correct })),
    })),
    roster: [...(roster.data ?? []), ...extraRows],
    attempts: atts.map((a) => ({
      ...a,
      score: Number(a.score),
      max_score: Number(a.max_score),
      answers: a.answers.map((x) => ({ ...x, points: Number(x.points) })),
    })),
    sessions: (sessions.data ?? []).map(({ answers, ...s }) => ({ ...s, answered: Object.keys((answers as object) ?? {}).length })),
    events: (events.data ?? []) as FormDetail['events'],
  };
}

/* =====================================================================
   رصد يدوي (كشف أو طالب واحد)
   ===================================================================== */
export type ManualDetail = {
  id: number;
  title: string;
  description: string | null;
  class_id: number;
  class_label: string;
  subject_id: number;
  subject: string;
  term_id: number;
  eval_type_id: number | null;
  eval_type: string | null;
  teacher: string | null;
  max_score: number;
  date: string | null;
  target_student_id: number | null;
  canEdit: boolean;
  roster: RosterStudent[];
  grades: (GradeRow & { note: string | null })[];
};

export async function getManualDetail(id: number, user: CurrentUser): Promise<ManualDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('assessments')
    .select(`id, title, description, class_id, subject_id, term_id, eval_type_id, teacher_id, max_score, published_at, target_student_id,
             class:classes(${CLASS_SELECT}), subj:subjects(name), ev:eval_types(name), t:staff_directory(name_ar)`)
    .eq('id', id)
    .eq('kind', 'manual')
    .maybeSingle<{
      id: number; title: string; description: string | null; class_id: number; subject_id: number; term_id: number; eval_type_id: number | null;
      teacher_id: number | null; max_score: number; published_at: string | null; target_student_id: number | null;
      class: ClassRef; subj: { name: string } | null; ev: { name: string } | null; t: { name_ar: string } | null;
    }>();
  if (!data) return null;
  const [roster, grades] = await Promise.all([
    data.target_student_id
      ? supabase.from('students').select('id, code, name_ar').eq('id', data.target_student_id)
      : supabase.from('students').select('id, code, name_ar').eq('class_id', data.class_id).eq('status', 'active').order('name_ar'),
    supabase.from('grade_entries').select('student_id, score, max_score, source, recorded_at, is_edited, note').eq('assessment_id', id),
  ]);
  const g = ((grades.data ?? []) as (GradeRow & { note: string | null })[]).map((x) => ({ ...x, score: Number(x.score), max_score: Number(x.max_score) }));
  const ids = new Set((roster.data ?? []).map((r) => r.id));
  const extra = g.filter((x) => !ids.has(x.student_id)).map((x) => x.student_id);
  const extraRows = extra.length ? ((await supabase.from('students').select('id, code, name_ar').in('id', extra)).data ?? []) : [];
  return {
    id: data.id,
    title: data.title,
    description: data.description,
    class_id: data.class_id,
    class_label: classLabel(data.class, true),
    subject_id: data.subject_id,
    subject: data.subj?.name ?? '',
    term_id: data.term_id,
    eval_type_id: data.eval_type_id,
    eval_type: data.ev?.name ?? null,
    teacher: data.t?.name_ar ?? null,
    max_score: Number(data.max_score),
    date: data.published_at,
    target_student_id: data.target_student_id,
    canEdit: user.role === 'admin' || (data.teacher_id != null && data.teacher_id === user.employeeId),
    roster: [...(roster.data ?? []), ...extraRows],
    grades: g,
  };
}
