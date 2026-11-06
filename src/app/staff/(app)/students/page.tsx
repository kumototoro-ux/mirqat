import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getMyAccess } from '@/lib/access/server';
import { levelOf } from '@/lib/access/areas';
import { redirect } from 'next/navigation';
import { classOptions } from '@/lib/data';
import { getLookups } from '@/lib/lookups';
import { getStudentsReport } from '@/lib/reports';
import { listStudents } from './actions';
import { StudentsRegistry } from './students-registry';

export const metadata: Metadata = { title: 'تسجيل الطلاب' };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser(['admin', 'teacher']);
  const access = await getMyAccess();
  const level = levelOf(access, 'students');
  if (level < 1) redirect('/staff');
  const isAdmin = user.role === 'admin';
  const { q = '' } = await searchParams;
  const initialParams = { page: 1, size: 15, q, sort: 'name', filters: {} };
  // ثلاثة طلبات فقط للصفحة كلها: أول 15 طالبًا، والتقرير المجمّع (للبطاقات والرسم)، والقوائم من الذاكرة المشتركة
  const [first, report, classes, lookups] = await Promise.all([listStudents(initialParams), (isAdmin ? getStudentsReport() : Promise.resolve(null)), classOptions(), getLookups()]);
  return (
    <StudentsRegistry
      initial={first}
      initialParams={initialParams}
      report={report}
      level={level}
      isAdmin={isAdmin}
      classes={classes.map((c) => ({ value: String(c.value), label: c.label }))}
      lookups={lookups}
    />
  );
}
