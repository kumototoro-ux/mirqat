'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CERT_BUCKET, CERT_TAG } from './cert-server';
import { CERT_IMAGES, normalizeCert, type CertImageKind, type CertSettings } from './certificate';
import type { ClassReport, TermInfo } from './shared';

/* =====================================================================
   شهادة نهاية العام — إعدادها وصورها (للإدارة فقط)
   ===================================================================== */

type Res = { ok: true; message: string } | { ok: false; error: string };
const ADMIN = ['admin'] as const;
const MAX_BYTES = 1024 * 1024;
const friendly = (m: string) =>
  /row-level security|FORBIDDEN|42501|permission denied/.test(m) ? 'هذه العملية للإدارة فقط' : /JWT|AUTH_REQUIRED/.test(m) ? 'انتهت الجلسة. سجّل الدخول من جديد' : m.replace(/^ERROR:\s*/, '');

async function readRaw() {
  const { data } = await createAdminClient().from('app_settings').select('value').eq('key', 'certificate').maybeSingle();
  return normalizeCert(data?.value);
}

async function write(value: CertSettings, by: string): Promise<Res | null> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'certificate', value, is_public: false, updated_at: new Date().toISOString(), updated_by: by });
  if (error) return { ok: false, error: friendly(error.message) };
  updateTag(CERT_TAG);
  revalidatePath('/staff/results');
  revalidatePath('/student/results');
  return null;
}

/** حفظ نصوص الشهادة (الصور تُحفظ من رفعها فقط فلا تُمس هنا) */
export async function saveCertSettings(input: Omit<CertSettings, 'images'>): Promise<Res> {
  const me = await requireUser(ADMIN);
  const current = await readRaw();
  const value = normalizeCert({ ...input, images: current.images });
  return (await write(value, me.id)) ?? { ok: true, message: 'حُفظ إعداد الشهادة' };
}

function sniff(b: Uint8Array): { ext: string; type: string } | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: 'png', type: 'image/png' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return { ext: 'webp', type: 'image/webp' };
  return null;
}

const isKind = (k: string): k is CertImageKind => CERT_IMAGES.some((x) => x.kind === k);

export async function uploadCertImage(kind: string, formData: FormData): Promise<Res> {
  const me = await requireUser(ADMIN);
  if (!isKind(kind)) return { ok: false, error: 'نوع الصورة غير معروف' };
  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'اختر صورة' };
  if (file.size > MAX_BYTES) return { ok: false, error: 'حجم الصورة أكبر من 1 ميجابايت' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const t = sniff(bytes);
  if (!t) return { ok: false, error: 'الصيغة غير مدعومة: PNG أو JPG أو WEBP فقط' };

  const admin = createAdminClient();
  // مجلد خاص (غير عام): لا تصل إليه الصور إلا عبر الخادم
  const { error: bErr } = await admin.storage.getBucket(CERT_BUCKET);
  if (bErr) {
    const { error } = await admin.storage.createBucket(CERT_BUCKET, { public: false, fileSizeLimit: MAX_BYTES, allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'] });
    if (error && !/already exists/i.test(error.message)) return { ok: false, error: `تعذّر تجهيز مجلد الصور: ${error.message}` };
  }
  const path = `certificate/${kind}-${Date.now()}.${t.ext}`;
  const { error: upErr } = await admin.storage.from(CERT_BUCKET).upload(path, bytes, { contentType: t.type, upsert: false });
  if (upErr) return { ok: false, error: `تعذّر رفع الصورة: ${upErr.message}` };

  const current = await readRaw();
  const old = current.images[kind];
  const failed = await write({ ...current, images: { ...current.images, [kind]: path } }, me.id);
  if (failed) {
    await admin.storage.from(CERT_BUCKET).remove([path]);
    return failed;
  }
  if (old) await admin.storage.from(CERT_BUCKET).remove([old]);
  return { ok: true, message: `رُفعت ${CERT_IMAGES.find((x) => x.kind === kind)!.ar}` };
}

export async function removeCertImage(kind: string): Promise<Res> {
  const me = await requireUser(ADMIN);
  if (!isKind(kind)) return { ok: false, error: 'نوع الصورة غير معروف' };
  const current = await readRaw();
  const old = current.images[kind];
  if (!old) return { ok: true, message: 'لا صورة لحذفها' };
  const images = { ...current.images };
  delete images[kind];
  const failed = await write({ ...current, images }, me.id);
  if (failed) return failed;
  await createAdminClient().storage.from(CERT_BUCKET).remove([old]);
  return { ok: true, message: 'حُذفت الصورة' };
}

/** كشوف الفصل لكل فصول العام الدراسي (لبناء الشهادات) */
export async function classYear(classId: number, terms: TermInfo[]): Promise<{ term: TermInfo; report: ClassReport | null }[]> {
  await requireUser(ADMIN);
  const supabase = await createClient();
  return Promise.all(
    terms.slice(0, 4).map(async (term) => {
      const { data, error } = await supabase.rpc('class_results', { p_class_id: classId, p_term_id: term.id });
      if (error) throw new Error(friendly(error.message));
      return { term, report: data as ClassReport };
    }),
  );
}

/** معاينة صور الشهادة لصفحة الإعدادات (تُحمَّل عند فتح القسم فقط) */
export async function certImagesPreview(): Promise<Partial<Record<CertImageKind, string>>> {
  await requireUser(ADMIN);
  const { getCertImages, getCertSettings } = await import('./cert-server');
  return getCertImages(await getCertSettings());
}
