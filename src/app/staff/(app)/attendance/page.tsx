import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';
import { AttendanceApp } from '@/components/conduct/attendance-app';
import { getAuthorContext, widenForBranches } from '@/lib/assess/queries';
import { getMyAccess, branchesFor } from '@/lib/access/server';
import { myPeriods } from '@/lib/conduct/actions';
import { riyadhToday } from '@/lib/conduct/shared';
import { getClasses, getSubjects } from '@/lib/data';

export const metadata: Metadata = { title: 'التحضير' };

export default async function AttendancePage() {
  const user = await requireUser(['admin', 'teacher']);
  const supabase = await createClient();
  const [baseCtx, statuses, periods, classes, subjects, access] = await Promise.all([
    getAuthorContext(user),
    supabase.from('attendance_statuses').select('id, name').order('sort_order').order('id'),
    myPeriods(riyadhToday()),
    getClasses(),
    getSubjects(),
    getMyAccess(),
  ]);
  const wide = user.role === 'admin' ? null : branchesFor(access, 'attendance', 2);
  const ctx = wide?.length ? await widenForBranches(baseCtx, wide) : baseCtx;
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
