import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getLookups } from '@/lib/lookups';
import { listEmployees } from './actions';
import { EmployeesRegistry } from './employees-registry';

export const metadata: Metadata = { title: 'تسجيل الموظفين' };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser(['admin']);
  const { q = '' } = await searchParams;
  const supabase = await createClient();
  const initialParams = { page: 1, q, sort: 'name', filters: {} };
  const c = async (f: (x: any) => any) => (await f(supabase.from('employees').select('*', { count: 'exact', head: true }))).count ?? 0;
  const [first, active, teachers, admins, lookups] = await Promise.all([
    listEmployees(initialParams),
    c((x) => x.eq('is_active', true)),
    c((x) => x.eq('is_active', true).eq('user_type', 'teacher')),
    c((x) => x.eq('is_active', true).eq('user_type', 'admin')),
    getLookups(),
  ]);
  return <EmployeesRegistry initial={first} initialParams={initialParams} stats={{ active, teachers, admins }} lookups={lookups} />;
}
