import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DashboardSkeleton } from '@/components/dashboard/skeleton';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getClasses } from '@/lib/data';
import { StaffDashboard, type MyPeriod, type StaffHomeData } from '@/components/dashboard/staff-dashboard';

export const metadata: Metadata = { title: 'الرئيسية' };

const riyadh = (o: Intl.DateTimeFormatOptions, cal = 'gregory') => new Intl.DateTimeFormat(`ar-SA-u-ca-${cal}-nu-latn`, { timeZone: 'Asia/Riyadh', ...o }).format(new Date());

export default function StaffHome() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <HomeData />
    </Suspense>
  );
}

async function HomeData() {
  const user = await requireUser(['admin', 'teacher']);
  const supabase = await createClient();
  const teacher = user.role === 'teacher';
  const [home, periods, classes, scope] = await Promise.all([
    supabase.rpc('staff_home'),
    teacher ? supabase.rpc('my_periods', { p_date: null }) : Promise.resolve({ data: [] }),
    getClasses(),
    teacher && user.employeeId
      ? supabase.from('staff_scope').select('branch_id, grade_id, section_id, subject_id').eq('employee_id', user.employeeId)
      : Promise.resolve({ data: null }),
  ]);
  const rows = (scope.data ?? []) as { branch_id: number | null; grade_id: number | null; section_id: number | null; subject_id: number | null }[];
  const scopeWarning = teacher && (['branch_id', 'grade_id', 'section_id', 'subject_id'] as const).some((k) => !rows.some((r) => r[k] != null));
  const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Riyadh' }).format(new Date()));

  return (
    <StaffDashboard
      role={teacher ? 'teacher' : 'admin'}
      name={user.displayName}
      greet={h < 5 ? 'مساء الخير' : h < 12 ? 'صباح الخير' : h < 17 ? 'نهارك سعيد' : 'مساء الخير'}
      date={{ g: riyadh({ weekday: 'long', day: 'numeric', month: 'long' }), h: riyadh({ day: 'numeric', month: 'long', year: 'numeric' }, 'islamic-umalqura') }}
      data={home.data as StaffHomeData}
      periods={(periods.data as MyPeriod[]) ?? []}
      classNames={Object.fromEntries(classes.map((c) => [c.id, c.label]))}
      scopeWarning={scopeWarning}
    />
  );
}
