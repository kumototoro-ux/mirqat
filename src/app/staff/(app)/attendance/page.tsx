import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';
import { AttendanceApp } from '@/components/conduct/attendance-app';
import { getAuthorContext } from '@/lib/assess/queries';
import { myPeriods } from '@/lib/conduct/actions';
import { riyadhToday } from '@/lib/conduct/shared';
import { getClasses, getSubjects } from '@/lib/data';

export const metadata: Metadata = { title: 'التحضير' };

export default async function AttendancePage() {
  const user = await requireUser(['admin', 'teacher']);
  const supabase = await createClient();
  const [ctx, statuses, periods, classes, subjects] = await Promise.all([
    getAuthorContext(user),
    supabase.from('attendance_statuses').select('id, name').order('sort_order').order('id'),
    myPeriods(riyadhToday()),
    getClasses(),
    getSubjects(),
  ]);
  return (
    <>
      <PageHeader title="التحضير" lead="حضّر حصصك من جدولك بضغطة، وراجع السجلات، وتابع غياب طلابك ونسبة حضورهم." />
      <AttendanceApp
        ctx={ctx}
        statuses={statuses.data ?? []}
        initialPeriods={periods}
        classNames={Object.fromEntries(classes.map((c) => [c.id, c.label]))}
        subjectNames={Object.fromEntries(subjects.map((s) => [s.id, s.name]))}
      />
    </>
  );
}
