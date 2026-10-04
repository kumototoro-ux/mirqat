import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getAccountsReport, getEmployeesReport } from '@/lib/reports';
import { listAccounts } from '@/lib/accounts/actions';
import { AccountsRegistry } from '@/components/accounts/accounts-registry';

export const metadata: Metadata = { title: 'حسابات الموظفين' };
export const maxDuration = 120;

export default async function EmployeeAccountsPage() {
  await requireUser(['admin']);
  const initialParams = { page: 1, size: 15, q: '', sort: 'name', filters: {} };
  const [first, acc, em] = await Promise.all([listAccounts('employee', initialParams), getAccountsReport(), getEmployeesReport()]);
  const staff = acc.by_role.filter((x) => x.role !== 'student');
  const sum = (k: 'temp' | 'disabled' | 'activated' | 'login_7d') => staff.reduce((a, x) => a + x[k], 0);
  return (
    <AccountsRegistry
      kind="employee"
      initial={first}
      initialParams={initialParams}
      stats={{ total: em.totals.active, withAccount: em.totals.active - acc.employees_without, temp: sum('temp'), disabled: sum('disabled'), activated: sum('activated'), login7: sum('login_7d') }}
    />
  );
}
