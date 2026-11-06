import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NO_ACCESS, levelOf, type Area, type MyAccess } from './areas';

/** مناصب الحساب الحالي وقدراته لكل مجال وفرع. استعلام واحد لكل طلب. */
export const getMyAccess = cache(async (): Promise<MyAccess> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_access');
  if (error || !data) return NO_ACCESS;
  const raw = data as Partial<MyAccess>;
  return { admin: raw.admin === true, positions: raw.positions ?? [], areas: raw.areas ?? {} };
});

/** لصفحة لا يدخلها إلا من يملك مستوى في المجال: غيره يعود للرئيسية (والقاعدة تمنع على أي حال). */
export async function requireAccess(area: Area, min = 1, back = '/staff'): Promise<MyAccess> {
  const a = await getMyAccess();
  if (levelOf(a, area) < min) redirect(back);
  return a;
}

/** فروع المجال بمستوى لا يقل عن min؛ null = كل الفروع (الإداري) */
export function branchesFor(a: MyAccess, area: Area, min: number): number[] | null {
  if (a.admin) return null;
  const e = a.areas[area];
  return e && e.level >= min ? e.branches : [];
}
