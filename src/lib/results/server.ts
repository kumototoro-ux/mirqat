import 'server-only';
import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { REF_TAG, getSchoolName } from '@/lib/data';
import type { NoticeSettings } from './shared';

/** نص الإشعار (اسم المدير والملاحظة) — إعداد داخلي يقرؤه الخادم للطالب والإدارة */
export const getNoticeSettings = unstable_cache(
  async (): Promise<NoticeSettings> => {
    const { data } = await createAdminClient().from('app_settings').select('value').eq('key', 'results_notice').maybeSingle();
    const v = (data?.value ?? {}) as Partial<NoticeSettings>;
    return { principal: typeof v.principal === 'string' ? v.principal : '', note: typeof v.note === 'string' ? v.note : '' };
  },
  ['results-notice'],
  { revalidate: 300, tags: [REF_TAG] },
);

/**
 * الشعار كـ data URI: يُضمَّن في الإشعار فيُصدَّر صورةً وPDF دون أي طلب خارجي
 * (لا مشاكل CORS ولا صورة فارغة إن كان التخزين بطيئًا)
 */
const cachedLogo = unstable_cache(
  async (): Promise<string | null> => {
    const { data } = await createAdminClient().from('app_settings').select('value').eq('key', 'school_logo_url').maybeSingle();
    const url = typeof data?.value === 'string' ? data.value : '';
    if (!/^https:\/\//.test(url)) return null;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return null;
      const type = res.headers.get('content-type') ?? '';
      if (!/^image\/(png|jpeg|webp)/.test(type)) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > 1_400_000) return null;
      return `data:${type.split(';')[0]};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  },
  ['school-logo-data'],
  { revalidate: 3600, tags: [REF_TAG] },
);

export async function getSchoolBrand() {
  const [name, logo] = await Promise.all([getSchoolName(), cachedLogo()]);
  return { name, logo };
}
