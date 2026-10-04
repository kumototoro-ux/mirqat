'use server';

import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { pageSize, type PageParams, type PageResult } from '@/components/registry/types';

export type AuditRow = {
  id: number;
  occurred_at: string;
  actor_name: string | null;
  actor_code: string | null;
  actor_role: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  details: string | null;
};

const clean = (q: string) => q.replace(/[,()*%\\"]/g, ' ').trim().slice(0, 60);

export async function listAudit(p: PageParams): Promise<PageResult<AuditRow>> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const page = Math.max(1, Math.floor(p.page) || 1);
  const size = pageSize(p);
  let q = supabase
    .from('audit_log')
    .select('id, occurred_at, actor_name, actor_code, actor_role, action, table_name, record_id, details', { count: 'estimated' })
    .order('occurred_at', { ascending: p.sort === 'oldest' })
    .order('id', { ascending: p.sort === 'oldest' })
    .range((page - 1) * size, page * size - 1);
  const term = clean(p.q ?? '');
  if (term) q = q.or(`actor_name.ilike.%${term}%,details.ilike.%${term}%,actor_code.ilike.%${term}%`);
  const f = p.filters ?? {};
  if (f.action) q = q.eq('action', f.action);
  if (f.table) q = q.eq('table_name', f.table);
  if (f.period) {
    const days = { today: 0, week: 6, month: 29 }[f.period as 'today' | 'week' | 'month'];
    if (days !== undefined) {
      // بداية اليوم بتوقيت الرياض، ثم الرجوع بعدد الأيام
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
      const start = new Date(new Date(`${today}T00:00:00+03:00`).getTime() - days * 864e5);
      q = q.gte('occurred_at', start.toISOString());
    }
  }
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as AuditRow[], total: count ?? 0 };
}

export async function getAuditEntry(id: number) {
  await requireUser(['admin']);
  const supabase = await createClient();
  const { data } = await supabase.from('audit_log').select('id, old_data, new_data').eq('id', id).maybeSingle();
  return data as { id: number; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null } | null;
}
