import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui';
import { GradingHub } from '@/components/assess/grading-hub';
import { getAuthorContext } from '@/lib/assess/queries';
import { listToRecord } from '@/lib/assess/grading-actions';
import { getClasses, getSubjects } from '@/lib/data';

export const metadata: Metadata = { title: 'الرصد اليومي' };

const MODES = ['tasks', 'manual', 'single', 'records'] as const;

export default async function GradingPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const user = await requireUser(['admin', 'teacher']);
  const { mode } = await searchParams;
  const [ctx, pending, classes, subjects] = await Promise.all([
    getAuthorContext(user),
    listToRecord({ page: 1, size: 50, q: '', sort: 'due', filters: {} }),
    getClasses(),
    getSubjects(),
  ]);
  return (
    <>
      <PageHeader title="الرصد اليومي" lead="ارصد من مهامك ونماذجك، أو رصدًا يدويًا لكشف الفصل، أو درجة مشاركة لطالب واحد." />
      <GradingHub
        initialMode={(MODES as readonly string[]).includes(mode ?? '') ? (mode as (typeof MODES)[number]) : 'tasks'}
        ctx={ctx}
        pending={pending}
        classNames={Object.fromEntries(classes.map((c) => [c.id, c.label]))}
        subjectNames={Object.fromEntries(subjects.map((s) => [s.id, s.name]))}
      />
    </>
  );
}
