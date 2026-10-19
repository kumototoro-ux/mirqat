import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui';
import { getAuthorContext } from '@/lib/assess/queries';
import { contentStats, listContent } from '@/lib/content/actions';
import { ContentStudio } from '@/components/content/studio';

export const metadata: Metadata = { title: 'الفيديوهات والإثراءات' };

export default async function ContentPage() {
  const user = await requireUser(['admin', 'teacher']);
  const ctx = await getAuthorContext(user);
  const [initial, stats] = await Promise.all([
    listContent({ page: 1, size: 15, q: '', sort: 'newest', filters: { kind: '', class: '', subject: '', status: '', mine: '' } }),
    contentStats(),
  ]);
  return (
    <>
      <PageHeader title="الفيديوهات والإثراءات" lead="انشر شروحات وإثراءات لطلابك، وتابع من شاهد ومن أكمل." />
      <ContentStudio ctx={ctx} initial={initial} initialStats={stats} myEmployeeId={user.employeeId} />
    </>
  );
}
