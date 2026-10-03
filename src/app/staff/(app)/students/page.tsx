import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { classOptions } from '@/lib/data';
import { getLookups } from '@/lib/lookups';
import { listStudents } from './actions';
import { StudentsRegistry } from './students-registry';

export const metadata: Metadata = { title: 'تسجيل الطلاب' };

async function count(f?: (q: any) => any) {
  const supabase = await createClient();
  let q = supabase.from('students').select('*', { count: 'exact', head: true });
  if (f) q = f(q);
  const { count } = await q;
  return count ?? 0;
}

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser(['admin']);
  const { q = '' } = await searchParams;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const initialParams = { page: 1, q, sort: 'name', filters: {} };

  // الصفحة الأولى تُجلب مع الصفحة نفسها (لا طلب إضافي بعد الفتح)
  const [first, active, newThisMonth, withdrawn, classes, lookups] = await Promise.all([
    listStudents(initialParams),
    count((x) => x.eq('status', 'active')),
    count((x) => x.gte('enrolled_at', monthStart)),
    count((x) => x.eq('status', 'withdrawn')),
    classOptions(),
    getLookups(),
  ]);

  return (
    <StudentsRegistry
      initial={first}
      initialParams={initialParams}
      stats={{ active, newThisMonth, withdrawn }}
      classes={classes.map((c) => ({ value: String(c.value), label: c.label }))}
      lookups={lookups}
    />
  );
}
