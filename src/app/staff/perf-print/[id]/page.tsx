import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { requireAccess } from '@/lib/access/server';
import { perfGet } from '@/lib/perf/actions';
import { getSchoolName } from '@/lib/data';
import { PerfReportView } from '@/components/perf/perf-report-view';
import { PrintButton } from '@/components/perf/print-button';

export const metadata: Metadata = { title: 'تقرير أداء — طباعة' };

/** نسخة للطباعة أو الحفظ PDF بلا إطار الموقع */
export default async function PerfPrint({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(['admin', 'teacher']);
  await requireAccess('performance', 2);
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [r, school] = await Promise.all([perfGet(id), getSchoolName()]);
  if (!r) notFound();
  return (
    <main className="mx-auto max-w-3xl p-6 print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <p className="text-sm text-muted">اختر «حفظ كـ PDF» من نافذة الطباعة</p>
        <PrintButton />
      </div>
      <h1 className="mb-1 text-2xl font-bold">تقرير أداء الفرع</h1>
      <p className="mb-5 text-sm text-muted">{school}</p>
      <PerfReportView r={r} />
    </main>
  );
}
