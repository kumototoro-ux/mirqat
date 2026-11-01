import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getPrintData } from '@/lib/assess/queries';
import { getAppreciationBrand } from '@/lib/certs/brand';
import { PrintStudio } from '@/components/assess/print-studio';

export const metadata: Metadata = { title: 'طباعة الاختبار' };

/** صفحة طباعة بلا إطار الموقع: ورقة الأسئلة ونسخة المعلم وأوراق الإجابة */
export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(['admin', 'teacher']);
  const id = Number((await params).id);
  if (!Number.isFinite(id)) notFound();
  const [data, brand] = await Promise.all([getPrintData(id, user), getAppreciationBrand()]);
  if (!data) notFound();
  return <PrintStudio data={data} brand={brand} />;
}
