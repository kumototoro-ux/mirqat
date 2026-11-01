import 'server-only';
import { getNoticeSettings, getSchoolBrand } from '@/lib/results/server';
import { getCertImages, getCertSettings } from '@/lib/results/cert-server';
import { principalTitle } from '@/lib/results/certificate';
import type { AppreciationBrand } from './appreciation';

/** هوية شهادات الشكر من إعدادات الشهادة نفسها: لا إعداد جديد على الإدارة */
export async function getAppreciationBrand(): Promise<AppreciationBrand> {
  const [cs, brand, notice] = await Promise.all([getCertSettings(), getSchoolBrand(), getNoticeSettings()]);
  const images = await getCertImages(cs);
  return {
    school: cs.school_ar || brand.name || 'المدرسة',
    principal: { name: cs.principal_name || notice.principal || '', title: principalTitle(cs).ar },
    images: { ...images, logo: images.logo ?? brand.logo ?? undefined },
    showBasmala: cs.show_basmala,
  };
}
