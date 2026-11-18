import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type PosBadge = { code: string; name: string; tier: 'school' | 'branch'; branches: string[]; all: boolean };

/**
 * مناصب مجموعة موظفين مجمّعة بالمنصب مع فروعه — للإداري وحده (جدول الإسناد مقروء له فقط).
 * all = المنصب في كل الفروع الفعالة.
 */
export async function positionBadges(supabase: SupabaseClient, ids: number[]): Promise<Map<number, PosBadge[]>> {
  const out = new Map<number, PosBadge[]>();
  if (!ids.length) return out;
  const [rows, br] = await Promise.all([
    supabase
      .from('employee_positions')
      .select('employee_id, position, branch:branches(name), pos:positions(name_ar, tier, sort)')
      .in('employee_id', ids),
    supabase.from('branches').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ]);
  if (rows.error) throw new Error(rows.error.message);
  const total = br.count ?? 0;
  type R = { employee_id: number; position: string; branch: { name: string } | { name: string }[] | null; pos: { name_ar: string; tier: 'school' | 'branch'; sort: number } | { name_ar: string; tier: 'school' | 'branch'; sort: number }[] | null };
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] ?? null : v);
  const grouped = new Map<string, { emp: number; code: string; name: string; tier: 'school' | 'branch'; sort: number; branches: string[] }>();
  for (const r of (rows.data ?? []) as unknown as R[]) {
    const p = one(r.pos);
    if (!p) continue;
    const key = `${r.employee_id}:${r.position}`;
    const g = grouped.get(key) ?? { emp: r.employee_id, code: r.position, name: p.name_ar, tier: p.tier, sort: p.sort, branches: [] };
    const b = one(r.branch);
    if (b) g.branches.push(b.name);
    grouped.set(key, g);
  }
  for (const g of [...grouped.values()].sort((a, b) => a.sort - b.sort)) {
    const list = out.get(g.emp) ?? [];
    list.push({ code: g.code, name: g.name, tier: g.tier, branches: g.branches, all: total > 1 && g.branches.length >= total });
    out.set(g.emp, list);
  }
  return out;
}
