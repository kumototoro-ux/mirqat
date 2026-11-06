import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAccess } from '@/lib/access/server';
import { perfBranches, perfForm, perfGet } from '@/lib/perf/actions';
import { getTerms } from '@/lib/data';
import { Card, PageHeader } from '@/components/ui';
import { PerfEditor } from '@/components/perf/perf-editor';
import { PerfReportView } from '@/components/perf/perf-report-view';
import { PerfAck } from '@/components/perf/perf-ack';

export const metadata: Metadata = { title: 'تقرير أداء' };

export default async function PerfReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccess('performance', 2);
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const r = await perfGet(id);
  if (!r) notFound();

  if (r.can_edit) {
    const [branches, form, terms] = await Promise.all([perfBranches(), perfForm(r.branch_id), getTerms()]);
    if (!form) notFound();
    return (
      <>
        <PageHeader title="تعديل المسودة" lead={r.branch} />
        <PerfEditor branches={branches} branchId={r.branch_id} form={form} report={r} terms={terms.map((t) => ({ id: t.id, name: `${t.name} ${t.year ?? ''}`.trim() }))} />
      </>
    );
  }
  return (
    <>
      <Link href="/staff/performance" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-board">‹ تقارير الأداء</Link>
      <PageHeader title="تقرير أداء" lead={r.branch} actions={<Link href={`/staff/perf-print/${r.id}`} target="_blank" className="btn-quiet">طباعة / PDF</Link>} />
      <div className="space-y-5">
        <PerfReportView r={r} />
        {r.can_ack && (
          <Card title="اعتماد التقرير">
            <PerfAck id={r.id} />
          </Card>
        )}
      </div>
    </>
  );
}
