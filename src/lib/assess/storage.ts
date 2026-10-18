import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { MAX_ATTACHMENT_BYTES, MAX_SUBMISSION_BYTES, SUBMISSION_MIME } from './shared';

/*
  مخزنان:
  - task-files (عام للقراءة بمسارات عشوائية لا تُخمَّن): مرفقات المعلم وصور الأسئلة
  - submissions (خاص): ملفات تسليم الطلاب — لا تُفتح إلا برابط مؤقت يُصدره الخادم لمن يملك رؤيتها
  الكتابة في الاثنين من الخادم فقط (بالمفتاح السري)، بعد التحقق من الصلاحية والحجم ونوع الملف الفعلي.
*/
export const TASK_BUCKET = 'task-files';
export const SUB_BUCKET = 'submissions';

const MIMES = Object.keys(SUBMISSION_MIME);
const ready = new Set<string>();

export async function ensureBucket(name: string) {
  if (ready.has(name)) return;
  const admin = createAdminClient();
  const { error } = await admin.storage.getBucket(name);
  if (error) {
    const { error: e } = await admin.storage.createBucket(name, {
      public: name === TASK_BUCKET,
      fileSizeLimit: name === TASK_BUCKET ? MAX_ATTACHMENT_BYTES : MAX_SUBMISSION_BYTES,
      allowedMimeTypes: MIMES,
    });
    if (e && !/already exists/i.test(e.message)) throw new Error(`تعذّر تجهيز مخزن الملفات: ${e.message}`);
  }
  ready.add(name);
}

/** نوع الملف من بايتاته الأولى (لا من اسمه أو مما يدّعيه المتصفح) */
export function sniff(b: Uint8Array, name: string): { mime: string; ext: string } | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: 'image/png', ext: 'png' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return { mime: 'image/webp', ext: 'webp' };
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return { mime: 'application/pdf', ext: 'pdf' };
  // ملفات Office الحديثة حزمة ZIP: النوع من الامتداد بعد التأكد أنها ZIP فعلًا
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) {
    const ext = name.toLowerCase().split('.').pop() ?? '';
    const mime = Object.entries(SUBMISSION_MIME).find(([, e]) => e === ext)?.[0];
    if (mime && ['docx', 'pptx', 'xlsx'].includes(ext)) return { mime, ext };
  }
  return null;
}

export const isImage = (mime: string) => mime.startsWith('image/');

/** اسم ملف آمن للعرض */
export const safeName = (n: string) => n.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 120) || 'ملف';

export function publicUrl(path: string) {
  return createAdminClient().storage.from(TASK_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** حذف مسارات من المخزنين حسب بادئتها — لا يُفشل العملية الأصلية إن تعذّر */
export async function removePaths(paths: string[]) {
  const clean = [...new Set(paths.filter(Boolean))];
  if (!clean.length) return;
  const admin = createAdminClient();
  const subs = clean.filter((p) => p.startsWith('subs/'));
  const tasks = clean.filter((p) => !p.startsWith('subs/'));
  await Promise.all([
    subs.length ? admin.storage.from(SUB_BUCKET).remove(subs) : null,
    tasks.length ? admin.storage.from(TASK_BUCKET).remove(tasks) : null,
  ]).catch(() => null);
}

export async function signedUrls(paths: string[], seconds = 900): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await createAdminClient().storage.from(SUB_BUCKET).createSignedUrls(paths, seconds);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl as string]));
}
