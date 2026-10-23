import 'server-only';
import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { REF_TAG } from '@/lib/data';
import { CERT_IMAGES, normalizeCert, type CertImageKind, type CertSettings } from './certificate';

export const CERT_BUCKET = 'school-private';
export const CERT_TAG = 'certificate';

/** إعداد الشهادة — داخلي (is_public = false) يقرؤه الخادم فقط */
export const getCertSettings = unstable_cache(
  async (): Promise<CertSettings> => {
    const { data } = await createAdminClient().from('app_settings').select('value').eq('key', 'certificate').maybeSingle();
    return normalizeCert(data?.value);
  },
  ['certificate-settings'],
  { revalidate: 300, tags: [REF_TAG, CERT_TAG] },
);

/**
 * صور التوقيع والختم والرؤية في مجلد خاص (غير عام)، وتُضمَّن في الشهادة كـ data URI
 * فلا رابط مباشر لها، وتُصدَّر صورةً وPDF دون طلبات خارجية
 */
const imageData = unstable_cache(
  async (path: string): Promise<string | null> => {
    const { data, error } = await createAdminClient().storage.from(CERT_BUCKET).download(path);
    if (error || !data) return null;
    const type = data.type || (path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
    if (!/^image\/(png|jpeg|webp)$/.test(type)) return null;
    const buf = Buffer.from(await data.arrayBuffer());
    return `data:${type};base64,${buf.toString('base64')}`;
  },
  ['certificate-image'],
  { revalidate: 86400, tags: [CERT_TAG] },
);

export type CertImages = Partial<Record<CertImageKind, string>>;

export async function getCertImages(s: CertSettings): Promise<CertImages> {
  const out: CertImages = {};
  await Promise.all(
    CERT_IMAGES.map(async ({ kind }) => {
      const p = s.images[kind];
      if (!p) return;
      const d = await imageData(p).catch(() => null);
      if (d) out[kind] = d;
    }),
  );
  return out;
}
