import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { classOptions } from '@/lib/data';
import { listAccounts } from '@/lib/accounts/actions';
import { AccountsRegistry } from '@/components/accounts/accounts-registry';

export const metadata: Metadata = { title: 'حسابات الطلاب' };
export const maxDuration = 120;

export default async function StudentAccountsPage() {
  await requireUser(['admin']);
  const supabase = await createClient();
  const initialParams = { page: 1, q: '', sort: 'name', filters: {} };
  const head = { count: 'exact' as const, head: true };
  const [first, total, withAccount, temp, disabled, classes] = await Promise.all([
    listAccounts('student', initialParams),
    supabase.from('students').select('*', head).eq('status', 'active'),
    supabase.from('profiles').select('*', head).eq('role', 'student'),
    supabase.from('profiles').select('*', head).eq('role', 'student').eq('must_change_password', true).eq('status', 'active'),
    supabase.from('profiles').select('*', head).eq('role', 'student').eq('status', 'disabled'),
    classOptions(),
  ]);
  return (
    <AccountsRegistry
      kind="student"
      initial={first}
      initialParams={initialParams}
      stats={{ total: total.count ?? 0, withAccount: withAccount.count ?? 0, temp: temp.count ?? 0, disabled: disabled.count ?? 0 }}
      classes={classes.map((c) => ({ value: String(c.value), label: c.label }))}
    />
  );
}
