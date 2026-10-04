import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getLookups } from '@/lib/lookups';
import { getEmployeesReport } from '@/lib/reports';
import { listEmployees } from './actions';
import { EmployeesRegistry } from './employees-registry';

export const metadata: Metadata = { title: 'تسجيل الموظفين' };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser(['admin']);
  const { q = '' } = await searchParams;
  const initialParams = { page: 1, size: 15, q, sort: 'name', filters: {} };
  const [first, report, lookups] = await Promise.all([listEmployees(initialParams), getEmployeesReport(), getLookups()]);
  return <EmployeesRegistry initial={first} initialParams={initialParams} report={report} lookups={lookups} />;
}
