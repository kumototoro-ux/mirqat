import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getCalendarFor } from '@/lib/schedule/view';
import { CalendarJourney } from '@/components/schedule/calendar-journey';

export const metadata: Metadata = { title: 'التقويم الدراسي' };

export default async function CalendarPage() {
  const user = await requireUser(['admin', 'teacher']);
  const admin = user.role === 'admin';
  const { terms, weeks } = await getCalendarFor(admin);
  return <CalendarJourney terms={terms} weeks={weeks} admin={admin} />;
}
