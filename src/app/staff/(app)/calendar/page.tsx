import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui';
import { CalendarView } from '@/components/calendar-view';

export const metadata: Metadata = { title: 'التقويم الدراسي' };

export default async function CalendarPage() {
  await requireUser(['admin', 'teacher']);
  return (
    <>
      <PageHeader title="التقويم الدراسي" lead="أسابيع الدراسة والإجازات لكل فصل دراسي." />
      <CalendarView />
    </>
  );
}
