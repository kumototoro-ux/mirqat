import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { listAccounts } from '@/lib/accounts/actions';
import { AccountsRegistry } from '@/components/accounts/accounts-registry';

export const metadata: Metadata = { title: 'حسابات الموظفين' };
export const maxDuration = 120;

export default async function EmployeeAccountsPage() {
  await requireUser(['admin']);
  const supabase = await createClient();
  const initialParams = { page: 1, q: '', sort: 'name', filters: {} };
  const head = { count: 'exact' as const, head: true };
  const [first, total, withAccount, temp, disabled] = await Promise.all([
    listAccounts('employee', initialParams),
    supabase.from('employees').select('*', head).eq('is_active', true),
    supabase.from('profiles').select('*', head).neq('role', 'student'),
    supabase.from('profiles').select('*', head).neq('role', 'student').eq('must_change_password', true).eq('status', 'active'),
    supabase.from('profiles').select('*', head).neq('role', 'student').eq('status', 'disabled'),
  ]);
  return (
    <AccountsRegistry
      kind="employee"
      initial={first}
      initialParams={initialParams}
      stats={{ total: total.count ?? 0, withAccount: withAccount.count ?? 0, temp: temp.count ?? 0, disabled: disabled.count ?? 0 }}
    />
  );
}
