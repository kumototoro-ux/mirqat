import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DashboardSkeleton } from '@/components/dashboard/skeleton';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { classLabel } from '@/lib/format';
import { getMe } from '@/lib/student';
import type { StudentItem } from '@/lib/assess/student';
import { StudentDashboard, type StudentHomeData } from '@/components/dashboard/student-dashboard';

export const metadata: Metadata = { title: 'الرئيسية' };

const riyadh = (o: Intl.DateTimeFormatOptions, cal = 'gregory') => new Intl.DateTimeFormat(`ar-SA-u-ca-${cal}-nu-latn`, { timeZone: 'Asia/Riyadh', ...o }).format(new Date());

export default function StudentHome() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <HomeData />
    </Suspense>
  );
}

async function HomeData() {
  const user = await requireUser(['student']);
  const supabase = await createClient();
  const [me, home, mine] = await Promise.all([getMe(), supabase.rpc('student_home'), supabase.rpc('my_assessments')]);
  const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Riyadh' }).format(new Date()));
  return (
    <StudentDashboard
      first={(me?.name_ar ?? user.displayName).split(' ')[0]}
      classLabel={me ? classLabel(me.class, true) : ''}
      code={me?.code ?? ''}
      greet={h < 5 ? 'مساء الخير' : h < 12 ? 'صباح الخير' : h < 17 ? 'نهارك سعيد' : 'مساء الخير'}
      date={{ g: riyadh({ weekday: 'long', day: 'numeric', month: 'long' }), h: riyadh({ day: 'numeric', month: 'long', year: 'numeric' }, 'islamic-umalqura') }}
      data={home.data as StudentHomeData}
      items={(mine.data as StudentItem[]) ?? []}
    />
  );
}
