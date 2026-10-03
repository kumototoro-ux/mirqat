import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { AssessmentsView } from '@/components/assessments-view';

export const metadata: Metadata = { title: 'المهام والتكاليف' };

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser(['admin', 'teacher']);
  return <AssessmentsView kind="task" searchParams={await searchParams} teacherId={user.role === 'teacher' ? user.employeeId : null} />;
}
