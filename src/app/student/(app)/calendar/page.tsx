import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getCalendarFor } from '@/lib/schedule/view';
import { CalendarJourney } from '@/components/schedule/calendar-journey';

export const metadata: Metadata = { title: 'التقويم الدراسي' };

export default async function StudentCalendar() {
  await requireUser(['student']);
  const { terms, weeks } = await getCalendarFor(false);
  return <CalendarJourney terms={terms} weeks={weeks} />;
}
