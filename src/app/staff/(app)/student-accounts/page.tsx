import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getMyAccess } from '@/lib/access/server';
import { levelOf } from '@/lib/access/areas';
import { getAccountsReport, getStudentsReport } from '@/lib/reports';
import { classOptions } from '@/lib/data';
import { listAccounts } from '@/lib/accounts/actions';
import { AccountsRegistry } from '@/components/accounts/accounts-registry';

export const metadata: Metadata = { title: 'حسابات الطلاب' };
export const maxDuration = 120;

export default async function StudentAccountsPage() {
  const user = await requireUser(['admin', 'teacher']);
  const level = levelOf(await getMyAccess(), 'student_accounts');
  if (level < 1) redirect('/staff');
  const isAdmin = user.role === 'admin';
  const initialParams = { page: 1, size: 15, q: '', sort: 'name', filters: {} };
  // طلبان: أول صفحة، والتقرير المجمّع (للبطاقات والرسم) بدل خمسة استعلامات عدّ منفصلة
  const [first, acc, st, classes] = await Promise.all([listAccounts('student', initialParams), isAdmin ? getAccountsReport() : null, isAdmin ? getStudentsReport() : null, classOptions()]);
  const r = acc?.by_role.find((x) => x.role === 'student');
  return (
    <AccountsRegistry
      kind="student"
      initial={first}
      initialParams={initialParams}
      stats={acc && st && r ? { total: st.totals.active, withAccount: st.totals.active - acc.students_without, temp: r.temp, disabled: r.disabled, activated: r.activated, login7: r.login_7d } : null}
      level={level}
      isAdmin={isAdmin}
      classes={classes.map((c) => ({ value: String(c.value), label: c.label }))}
    />
  );
}
