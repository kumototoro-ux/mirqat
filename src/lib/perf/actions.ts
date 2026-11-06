'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sniff, safeName } from '@/lib/assess/storage';
import { MAX_PERF_FILE, type PerfAttachment, type PerfBranch, type PerfDraft, type PerfForm, type PerfListRow, type PerfReport } from './shared';

/* تقارير الأداء — الصلاحيات كلها في القاعدة (هجرة 39)؛ هنا تنسيق الاستدعاء ورفع الملفات بمفتاح الخدمة بعد فحص القاعدة */
type Res<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; error: string };
const friendly = (m: string) =>
  /FORBIDDEN|42501|permission denied|row-level security/.test(m) ? 'هذه العملية لصاحب الصلاحية في فرعه فقط' : /JWT|AUTH_REQUIRED/.test(m) ? 'انتهت الجلسة. سجّل الدخول من جديد' : m.replace(/^ERROR:\s*/, '');
const STAFF = ['admin', 'teacher'] as const;
const PERF_BUCKET = 'perf-files';
const MIMES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

export async function perfBranches(): Promise<PerfBranch[]> {
  await requireUser(STAFF);
  const { data } = await (await createClient()).rpc('perf_my_branches');
  return (data as PerfBranch[]) ?? [];
}
export async function perfForm(branch: number): Promise<PerfForm | null> {
  await requireUser(STAFF);
  const { data, error } = await (await createClient()).rpc('perf_form', { p_branch: branch });
  return error ? null : (data as PerfForm);
}
export async function perfList(): Promise<PerfListRow[]> {
  await requireUser(STAFF);
  const { data } = await (await createClient()).rpc('perf_list');
  return (data as PerfListRow[]) ?? [];
}
export async function perfGet(id: number): Promise<PerfReport | null> {
  await requireUser(STAFF);
  const { data, error } = await (await createClient()).rpc('perf_get', { p_id: id });
  return error ? null : (data as PerfReport);
}

export async function perfSave(id: number | null, d: PerfDraft): Promise<Res<{ id: number }>> {
  await requireUser(STAFF);
  const { data, error } = await (await createClient()).rpc('perf_save_report', { p_id: id, p: d });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath('/staff/performance');
  return { ok: true, message: 'حُفظت المسودة', data: { id: data as number } };
}

export async function perfSend(id: number): Promise<Res<{ recipients: number }>> {
  await requireUser(STAFF);
  const { data, error } = await (await createClient()).rpc('perf_send_report', { p_id: id });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath('/staff/performance');
  const n = Number(data ?? 0);
  return { ok: true, message: n ? 'أُرسل التقرير لمدير الفروع' : 'أُرسل التقرير (لا مدير فروع مسند لهذا الفرع بعد، يراه الإداري)', data: { recipients: n } };
}

export async function perfDelete(id: number): Promise<Res> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data: rep } = await supabase.rpc('perf_get', { p_id: id });
  const { error } = await supabase.rpc('perf_delete_draft', { p_id: id });
  if (error) return { ok: false, error: friendly(error.message) };
  // ملفات المسودة المحذوفة
  const paths = ((rep as PerfReport | null)?.attachments ?? []).map((a) => a.path);
  if (paths.length) await createAdminClient().storage.from(PERF_BUCKET).remove(paths).catch(() => null);
  revalidatePath('/staff/performance');
  return { ok: true, message: 'حُذفت المسودة' };
}

export async function perfAcknowledge(id: number, reply: string): Promise<Res> {
  await requireUser(STAFF);
  const { error } = await (await createClient()).rpc('perf_acknowledge', { p_id: id, p_reply: reply });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath('/staff/performance');
  return { ok: true, message: 'اعتُمد التقرير وأُرسل ردّك للمراقب' };
}

async function ensurePerfBucket() {
  const admin = createAdminClient();
  const opts = { public: false, fileSizeLimit: MAX_PERF_FILE, allowedMimeTypes: MIMES };
  const { error } = await admin.storage.getBucket(PERF_BUCKET);
  if (error) {
    const { error: e } = await admin.storage.createBucket(PERF_BUCKET, opts);
    if (e && !/already exists/i.test(e.message)) throw new Error(`تعذّر تجهيز مخزن الملفات: ${e.message}`);
  }
}

/** رفع مرفق: القاعدة تقرر أنه يحق لي التعديل، والنوع من بايتات الملف، ثم يُسجَّل في القاعدة (وتتحقق ثانيةً) */
export async function uploadPerfFile(reportId: number, section: string | null, fd: FormData): Promise<Res<PerfAttachment>> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data: can } = await supabase.rpc('perf_can_edit', { p_report: reportId });
  if (can !== true) return { ok: false, error: 'لا يمكن إضافة مرفقات لهذا التقرير' };
  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'اختر ملفًا' };
  if (file.size > MAX_PERF_FILE) return { ok: false, error: 'الحد الأقصى 10 ميغابايت للملف' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes, file.name);
  if (!kind || !MIMES.includes(kind.mime)) return { ok: false, error: 'نوع الملف غير مقبول (صور، PDF، أو ملفات Office)' };
  await ensurePerfBucket();
  const path = `reports/${reportId}/${randomUUID()}.${kind.ext}`;
  const admin = createAdminClient();
  const { error: up } = await admin.storage.from(PERF_BUCKET).upload(path, bytes, { contentType: kind.mime, upsert: false });
  if (up) return { ok: false, error: 'تعذّر رفع الملف، حاول مرة أخرى' };
  const name = safeName(file.name);
  const { data, error } = await supabase.rpc('perf_add_attachment', { p_report: reportId, p_section: section, p_name: name, p_path: path, p_mime: kind.mime, p_size: file.size });
  if (error) {
    await admin.storage.from(PERF_BUCKET).remove([path]).catch(() => null);
    return { ok: false, error: friendly(error.message) };
  }
  return { ok: true, message: 'أُضيف المرفق', data: { id: data as number, section, name, mime: kind.mime, size: file.size, path } };
}

export async function removePerfFile(id: number): Promise<Res> {
  await requireUser(STAFF);
  const { data, error } = await (await createClient()).rpc('perf_remove_attachment', { p_id: id });
  if (error) return { ok: false, error: friendly(error.message) };
  if (data) await createAdminClient().storage.from(PERF_BUCKET).remove([data as string]).catch(() => null);
  return { ok: true, message: 'حُذف المرفق' };
}

/** رابط مؤقت (5 دقائق) لمن يحق له قراءة التقرير */
export async function perfFileUrl(id: number): Promise<Res<{ url: string }>> {
  await requireUser(STAFF);
  const { data: path } = await (await createClient()).rpc('perf_attachment_path', { p_id: id });
  if (typeof path !== 'string') return { ok: false, error: 'المرفق غير متاح لك' };
  const { data } = await createAdminClient().storage.from(PERF_BUCKET).createSignedUrl(path, 300);
  if (!data?.signedUrl) return { ok: false, error: 'تعذّر فتح الملف' };
  return { ok: true, message: '', data: { url: data.signedUrl } };
}

export async function setBranchBuilding(branchId: number, on: boolean): Promise<Res> {
  await requireUser(['admin']);
  const { error } = await (await createClient()).rpc('admin_set_branch_building', { p_branch: branchId, p_on: on });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath('/staff/positions');
  return { ok: true, message: on ? 'للفرع مبنى دراسي: تظهر بنود المبنى' : 'بلا مبنى دراسي: تختفي بنود المبنى' };
}
