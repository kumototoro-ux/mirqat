import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { AUDIO_MIME, MAX_ATTACHMENT_BYTES, MAX_AUDIO_BYTES, SUBMISSION_MIME } from './shared';

/*
  مخزنان:
  - task-files (عام للقراءة بمسارات عشوائية لا تُخمَّن): مرفقات المعلم وصور الأسئلة
  - submissions (خاص): ملفات تسليم الطلاب — لا تُفتح إلا برابط مؤقت يُصدره الخادم لمن يملك رؤيتها
  الكتابة في الاثنين من الخادم فقط (بالمفتاح السري)، بعد التحقق من الصلاحية والحجم ونوع الملف الفعلي.
*/
export const TASK_BUCKET = 'task-files';
export const SUB_BUCKET = 'submissions';

const MIMES = Object.keys(SUBMISSION_MIME);
const SUB_MIMES = [...MIMES, ...Object.keys(AUDIO_MIME)];
const ready = new Set<string>();

export async function ensureBucket(name: string) {
  if (ready.has(name)) return;
  const admin = createAdminClient();
  const sub = name !== TASK_BUCKET;
  // التسليمات تقبل الصوت (حتى 6 ميقا) — والتحقق الدقيق لكل نوع في الخادم والقاعدة
  const opts = {
    public: !sub,
    fileSizeLimit: sub ? MAX_AUDIO_BYTES : MAX_ATTACHMENT_BYTES,
    allowedMimeTypes: sub ? SUB_MIMES : MIMES,
  };
  const { error } = await admin.storage.getBucket(name);
  if (error) {
    const { error: e } = await admin.storage.createBucket(name, opts);
    if (e && !/already exists/i.test(e.message)) throw new Error(`تعذّر تجهيز مخزن الملفات: ${e.message}`);
  } else if (sub) {
    // مخزن قائم من قبل التسجيل الصوتي: يُحدَّث مرة لكل تشغيل
    await admin.storage.updateBucket(name, opts).catch(() => null);
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
  // الصوت (يسجّله المتصفح أو مسجّل الجوال): WebM، MP4/M4A (سفاري)، Ogg، WAV، MP3، AMR
  if (b.length > 12 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { mime: 'audio/webm', ext: 'webm' };
  if (b.length > 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return { mime: 'audio/mp4', ext: 'm4a' };
  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return { mime: 'audio/ogg', ext: 'ogg' };
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45) return { mime: 'audio/wav', ext: 'wav' };
  if (b[0] === 0x23 && b[1] === 0x21 && b[2] === 0x41 && b[3] === 0x4d && b[4] === 0x52) return { mime: 'audio/amr', ext: 'amr' };
  if ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && /\.mp3$/i.test(name))) return { mime: 'audio/mpeg', ext: 'mp3' };
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
