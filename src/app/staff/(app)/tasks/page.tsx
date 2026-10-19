import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui';
import { AssessHub } from '@/components/assess/hub';
import { getHubStats, listAssessments } from '@/lib/assess/actions';
import { getAuthorContext } from '@/lib/assess/queries';
import { getClasses, getSubjects } from '@/lib/data';

export const metadata: Metadata = { title: 'المهام والنماذج' };

export default async function TasksHub({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const user = await requireUser(['admin', 'teacher']);
  const { kind } = await searchParams;
  const k = kind === 'task' || kind === 'form' ? kind : '';
  const initialParams = { page: 1, size: 15, q: '', sort: 'newest', filters: { kind: k } };
  const [first, stats, ctx, classes, subjects] = await Promise.all([
    listAssessments(initialParams),
    getHubStats(),
    getAuthorContext(user),
    getClasses(),
    getSubjects(),
  ]);
  return (
    <>
      <PageHeader
        title="المهام والنماذج"
        lead={user.role === 'admin' ? 'كل مهام ونماذج المدرسة في مكان واحد: الإنشاء، التسليمات، التصحيح، والتحليل.' : 'مهامك ونماذجك لفصولك ومواد نطاقك فقط.'}
      />
      <AssessHub
        initial={first}
        initialParams={initialParams}
        stats={stats}
        ctx={ctx}
        classNames={Object.fromEntries(classes.map((c) => [c.id, c.label]))}
        subjectNames={Object.fromEntries(subjects.map((s) => [s.id, s.name]))}
      />
    </>
  );
}
