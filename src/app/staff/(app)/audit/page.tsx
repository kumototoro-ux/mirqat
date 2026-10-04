import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { listAudit } from './actions';
import { AuditRegistry, type ActivityReport } from './audit-registry';

export const metadata: Metadata = { title: 'سجل النشاط' };

export default async function AuditPage() {
  await requireUser(['admin']);
  const supabase = await createClient();
  const initialParams = { page: 1, size: 15, q: '', sort: 'newest', filters: {} };
  const [first, report] = await Promise.all([listAudit(initialParams), supabase.rpc('report_activity')]);
  return <AuditRegistry initial={first} initialParams={initialParams} report={(report.data ?? null) as ActivityReport | null} />;
}
