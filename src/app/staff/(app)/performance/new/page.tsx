import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAccess } from '@/lib/access/server';
import { perfBranches, perfForm } from '@/lib/perf/actions';
import { getTerms } from '@/lib/data';
import { PageHeader } from '@/components/ui';
import { PerfEditor } from '@/components/perf/perf-editor';

export const metadata: Metadata = { title: 'تقرير أداء جديد' };

export default async function NewPerfReport({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  await requireAccess('performance', 2);
  const branches = await perfBranches();
  if (!branches.length) redirect('/staff/performance');
  const asked = Number((await searchParams).branch);
  const branch = branches.find((b) => b.id === asked) ?? branches[0];
  const [form, terms] = await Promise.all([perfForm(branch.id), getTerms()]);
  if (!form) redirect('/staff/performance');
  return (
    <>
      <PageHeader title="تقرير أداء جديد" lead="النموذج ثابت لكل الفروع. قيّم كل بند، وأضف ملاحظاتك ومرفقاتك، ثم أرسله لمدير الفروع." />
      <PerfEditor key={branch.id} branches={branches} branchId={branch.id} form={form} report={null} terms={terms.map((t) => ({ id: t.id, name: `${t.name} ${t.year ?? ''}`.trim() }))} />
    </>
  );
}
