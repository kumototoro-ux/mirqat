import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getMyAccess } from '@/lib/access/server';
import { levelOf } from '@/lib/access/areas';
import { getAccountsReport, getEmployeesReport } from '@/lib/reports';
import { listAccounts } from '@/lib/accounts/actions';
import { AccountsRegistry } from '@/components/accounts/accounts-registry';

export const metadata: Metadata = { title: 'حسابات الموظفين' };
export const maxDuration = 120;

export default async function EmployeeAccountsPage() {
  const user = await requireUser(['admin', 'teacher']);
  const level = levelOf(await getMyAccess(), 'employee_accounts');
  if (level < 1) redirect('/staff');
  const isAdmin = user.role === 'admin';
  const initialParams = { page: 1, size: 15, q: '', sort: 'name', filters: {} };
  const [first, acc, em] = await Promise.all([listAccounts('employee', initialParams), isAdmin ? getAccountsReport() : null, isAdmin ? getEmployeesReport() : null]);
  const staff = acc?.by_role.filter((x) => x.role !== 'student') ?? [];
  const sum = (k: 'temp' | 'disabled' | 'activated' | 'login_7d') => staff.reduce((a, x) => a + x[k], 0);
  return (
    <AccountsRegistry
      kind="employee"
      initial={first}
      initialParams={initialParams}
      stats={acc && em ? { total: em.totals.active, withAccount: em.totals.active - acc.employees_without, temp: sum('temp'), disabled: sum('disabled'), activated: sum('activated'), login7: sum('login_7d') } : null}
      level={level}
      isAdmin={isAdmin}
    />
  );
}
