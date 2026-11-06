import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getMyAccess } from '@/lib/access/server';
import { levelOf } from '@/lib/access/areas';
import { branchesFor } from '@/lib/access/server';
import { getLookups } from '@/lib/lookups';
import { getEmployeesReport } from '@/lib/reports';
import { listEmployees } from './actions';
import { EmployeesRegistry } from './employees-registry';

export const metadata: Metadata = { title: 'تسجيل الموظفين' };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser(['admin', 'teacher']);
  const access = await getMyAccess();
  const level = levelOf(access, 'employees');
  if (level < 1) redirect('/staff');
  const isAdmin = user.role === 'admin';
  const { q = '' } = await searchParams;
  const initialParams = { page: 1, size: 15, q, sort: 'name', filters: {} };
  const [first, report, lookups] = await Promise.all([listEmployees(initialParams), (isAdmin ? getEmployeesReport() : Promise.resolve(null)), getLookups()]);
  // صاحب المنصب يرى فروعه فقط في النموذج (القاعدة تفرضها أيضًا)
  const mine = branchesFor(access, 'employees', 2);
  const scoped = mine ? { ...lookups, branches: lookups.branches.filter((b) => mine.includes(b.id)) } : lookups;
  return <EmployeesRegistry initial={first} initialParams={initialParams} report={report} level={level} isAdmin={isAdmin} lookups={scoped} />;
}
