'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PageParams, PageResult } from '@/components/registry/types';
import { pageSize } from '@/components/registry/types';
import { MAX_ATTACHMENT_BYTES } from './shared';
import { TASK_BUCKET, ensureBucket, publicUrl, removePaths, safeName, signedUrls, sniff } from './storage';
import { runPurge } from './purge';

/* =====================================================================
   المهام والنماذج — إجراءات المعلم والإداري
   كل كتابة عبر دالة قاعدة واحدة ذرّية تتحقق من الصلاحية بنفسها (لا ثقة بالمتصفح).
   ===================================================================== */

export type Result<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; error: string };

const STAFF = ['admin', 'teacher'] as const;

function friendly(m: string) {
  if (/row-level security|FORBIDDEN|42501/.test(m)) return 'لا تملك صلاحية هذه العملية';
  if (/violates foreign key/.test(m)) return 'لا يمكن الحذف: مرتبط بسجلات أخرى';
  if (/JWT|AUTH_REQUIRED/.test(m)) return 'انتهت الجلسة. سجّل الدخول من جديد';
  return m.replace(/^ERROR:\s*/, '');
}
const fail = (e: { message: string } | string): { ok: false; error: string } => ({ ok: false, error: friendly(typeof e === 'string' ? e : e.message) });

function refresh(id?: number) {
  revalidatePath('/staff/tasks');
  if (id) revalidatePath(`/staff/tasks/${id}`);
  revalidatePath('/student/tasks');
}

/* ---------------------------------------------------------------------
   القائمة
--------------------------------------------------------------------- */
export type HubRow = {
  id: number;
  kind: 'task' | 'form';
  title: string;
  class_id: number;
  subject_id: number;
  teacher_id: number | null;
  created_at: string;
  is_draft: boolean;
  max_score: number | null;
  published_at: string | null;
  due_at: string | null;
  submission_mode: string;
  form_status: string | null;
  opens_at: string | null;
  closes_at: string | null;
  time_limit_minutes: number | null;
  status: 'draft' | 'scheduled' | 'open' | 'closed';
  class_size: number;
  submitted: number;
  graded: number;
  to_grade: number;
  questions: number;
};

export async function listAssessments(p: PageParams): Promise<PageResult<HubRow>> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const f = p.filters ?? {};
  const { data, error } = await supabase.rpc('staff_assessments', {
    p: {
      page: p.page,
      size: pageSize(p),
      q: (p.q ?? '').slice(0, 60),
      sort: p.sort,
      kind: f.kind || null,
      class_id: f.class || null,
      subject_id: f.subject || null,
      status: f.status || null,
      mine: f.mine === '1',
    },
  });
  if (error) throw new Error(friendly(error.message));
  const d = data as { total: number; rows: HubRow[] };
  return { total: d.total, rows: d.rows };
}

export type HubStats = { tasks: number; forms: number; open: number; drafts: number; closing_soon: number; to_grade: number };
export async function getHubStats(): Promise<HubStats> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data } = await supabase.rpc('staff_assessment_stats');
  return (data as HubStats) ?? { tasks: 0, forms: 0, open: 0, drafts: 0, closing_soon: 0, to_grade: 0 };
}

/* ---------------------------------------------------------------------
   الإنشاء والحفظ
--------------------------------------------------------------------- */
export async function saveTask(id: number | null, payload: Record<string, unknown>, classIds: number[]): Promise<Result<{ ids: number[] }>> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('save_task', { p_id: id, p: payload, p_class_ids: id ? null : classIds });
  if (error) return fail(error);
  const res = data as { ids: number[]; removed_paths: string[] };
  await removePaths(res.removed_paths ?? []);
  refresh(id ?? undefined);
  const n = res.ids.length;
  return {
    ok: true,
    message: id ? 'حُفظت المهمة' : n > 1 ? `أُنشئت المهمة في ${n} فصول` : payload.is_draft ? 'حُفظت المهمة مسودة' : 'نُشرت المهمة',
    data: { ids: res.ids },
  };
}

export async function saveForm(id: number | null, payload: Record<string, unknown>, classIds: number[]): Promise<Result<{ ids: number[] }>> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('save_form', { p_id: id, p: payload, p_class_ids: id ? null : classIds });
  if (error) return fail(error);
  const ids = (data as number[]) ?? [];
  refresh(id ?? undefined);
  const status = (payload.details as { status?: string } | undefined)?.status;
  return {
    ok: true,
    message: id ? 'حُفظ النموذج' : ids.length > 1 ? `أُنشئ النموذج في ${ids.length} فصول` : status === 'published' ? 'نُشر النموذج' : 'حُفظ النموذج مسودة',
    data: { ids },
  };
}

export async function setFormStatus(id: number, status: 'draft' | 'published' | 'closed'): Promise<Result> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_form_status', { p_id: id, p_status: status });
  if (error) return fail(error);
  refresh(id);
  return { ok: true, message: status === 'published' ? 'نُشر النموذج' : status === 'closed' ? 'أُغلق النموذج' : 'أُعيد النموذج مسودة' };
}

export async function reopenForm(id: number, closesAt: string): Promise<Result> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { error } = await supabase.rpc('reopen_form', { p_assessment_id: id, p_closes_at: closesAt });
  if (error) return fail(error);
  refresh(id);
  return { ok: true, message: 'أُعيد فتح النموذج — حُذفت الأصفار التلقائية لمن لم يحل' };
}

export async function duplicateAssessment(id: number, classIds: number[]): Promise<Result<{ ids: number[] }>> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('duplicate_assessment', { p_id: id, p_class_ids: classIds.length ? classIds : null });
  if (error) return fail(error);
  const ids = (data as number[]) ?? [];
  refresh();
  return { ok: true, message: ids.length > 1 ? `نُسخ إلى ${ids.length} فصول كمسودات` : 'نُسخ كمسودة — راجع المواعيد ثم انشره', data: { ids } };
}

export async function deleteAssessment(id: number): Promise<Result> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('delete_assessment', { p_id: id });
  if (error) return fail(error);
  await removePaths(((data as { paths: string[] })?.paths ?? []).map((p) => (p.startsWith('storage:') ? p.slice(8) : p)));
  refresh();
  return { ok: true, message: 'حُذف' };
}

/* ---------------------------------------------------------------------
   رفع مرفقات المعلم وصور الأسئلة (مخزن عام بمسار عشوائي)
--------------------------------------------------------------------- */
export type UploadedAttachment = { kind: 'image' | 'file'; name: string; storage_path: string; mime: string; size_bytes: number; href: string };

export async function uploadAttachment(fd: FormData): Promise<Result<UploadedAttachment>> {
  await requireUser(STAFF);
  const file = fd.get('file');
  const purpose = fd.get('purpose') === 'question' ? 'question' : 'task';
  if (!(file instanceof File) || !file.size) return fail('اختر ملفًا');
  if (file.size > MAX_ATTACHMENT_BYTES) return fail('حجم الملف أكبر من 3 ميقا');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes, file.name);
  if (!kind) return fail('نوع الملف غير مدعوم: صورة أو PDF أو Word أو PowerPoint أو Excel');
  if (purpose === 'question' && !kind.mime.startsWith('image/')) return fail('صورة السؤال يجب أن تكون صورة');
  await ensureBucket(TASK_BUCKET);
  const uid = crypto.randomUUID();
  const path = purpose === 'question' ? `forms/${uid}.${kind.ext}` : `tasks/${uid}/a.${kind.ext}`;
  const { error } = await createAdminClient().storage.from(TASK_BUCKET).upload(path, bytes, { contentType: kind.mime, cacheControl: '31536000', upsert: false });
  if (error) return fail(`تعذّر الرفع: ${error.message}`);
  return {
    ok: true,
    message: 'رُفع الملف',
    data: {
      kind: kind.mime.startsWith('image/') ? 'image' : 'file',
      name: safeName(file.name),
      storage_path: purpose === 'question' ? `storage:${path}` : path,
      mime: kind.mime,
      size_bytes: bytes.length,
      href: publicUrl(path),
    },
  };
}

/* ---------------------------------------------------------------------
   التصحيح
--------------------------------------------------------------------- */
export async function gradeTask(id: number, rows: { student_id: number; score: number | null; feedback?: string | null }[]): Promise<Result> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('grade_task', { p_id: id, p_rows: rows });
  if (error) return fail(error);
  refresh(id);
  return { ok: true, message: rows.length === 1 ? 'حُفظ الرصد' : `حُفظ رصد ${data} طالب` };
}

export async function returnSubmission(submissionId: number, assessmentId: number): Promise<Result> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { error } = await supabase.rpc('return_submission', { p_submission_id: submissionId });
  if (error) return fail(error);
  refresh(assessmentId);
  return { ok: true, message: 'أُعيد التسليم للطالب ليعدّله' };
}

/** رابط مؤقت لملف تسليم — بعد التأكد أن المستخدم يرى الملف تحت صلاحياته */
export async function submissionFileUrl(fileId: number): Promise<Result<{ url: string }>> {
  await requireUser(['admin', 'teacher', 'student']);
  const supabase = await createClient();
  const { data } = await supabase.from('submission_files').select('storage_path, deleted_at').eq('id', fileId).maybeSingle();
  if (!data) return fail('الملف غير موجود');
  if (data.deleted_at) return fail('حُذف هذا الملف بعد التصحيح لتوفير المساحة');
  const urls = await signedUrls([data.storage_path], 900);
  const url = urls[data.storage_path];
  if (!url) return fail('تعذّر فتح الملف');
  return { ok: true, message: '', data: { url } };
}

export async function gradeFormAnswer(attemptId: number, questionId: number, points: number, feedback: string | null, assessmentId: number): Promise<Result<{ score: number; max_score: number; pending_review: number }>> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('grade_form_answer', { p_attempt_id: attemptId, p_question_id: questionId, p_points: points, p_feedback: feedback });
  if (error) return fail(error);
  refresh(assessmentId);
  return { ok: true, message: 'حُفظت الدرجة', data: data as { score: number; max_score: number; pending_review: number } };
}

export async function resetAttempt(attemptId: number, assessmentId: number): Promise<Result> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { error } = await supabase.rpc('reset_form_attempt', { p_attempt_id: attemptId });
  if (error) return fail(error);
  refresh(assessmentId);
  return { ok: true, message: 'صُفّرت المحاولة — يستطيع الطالب الحل من جديد' };
}

/* ---------------------------------------------------------------------
   الحذف اليدوي لملفات التسليم المصحّحة (الإداري) + إعداد الحذف التلقائي
--------------------------------------------------------------------- */
export type PurgeStats = {
  settings: { enabled: boolean; hours: number };
  stored_files: number;
  stored_bytes: number;
  graded_files: number;
  graded_bytes: number;
  purged_files: number;
};

export async function getPurgeStats(): Promise<PurgeStats | null> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const { data } = await supabase.rpc('purge_stats');
  return (data as PurgeStats) ?? null;
}

export async function savePurgeSettings(enabled: boolean, hours: number): Promise<Result> {
  await requireUser(['admin']);
  if (![24, 48, 72, 168].includes(hours)) return fail('مدة غير مسموحة');
  const supabase = await createClient();
  const { error } = await supabase.from('app_settings').upsert({ key: 'submission_purge', value: { enabled, hours }, is_public: false });
  if (error) return fail(error);
  revalidatePath('/staff/settings');
  return { ok: true, message: enabled ? `الحذف التلقائي مفعّل: بعد ${hours} ساعة من التصحيح` : 'أُوقف الحذف التلقائي' };
}

export async function purgeGradedNow(): Promise<Result<{ files: number; bytes: number }>> {
  await requireUser(['admin']);
  const res = await runPurge(true);
  revalidatePath('/staff/settings');
  return { ok: true, message: res.files ? `حُذف ${res.files} ملف مصحّح` : 'لا ملفات مصحّحة للحذف', data: res };
}
