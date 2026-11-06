import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NO_PERMS, PERM_KEYS, type PermKey, type PermMap } from './keys';

/** مفاتيح الحساب الحالي الفعلية (الاستثناء الفردي أو الافتراضي؛ الإداري كلها). استعلام واحد لكل طلب. */
export const getMyPerms = cache(async (): Promise<PermMap> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_permissions');
  if (error || !data) return { ...NO_PERMS };
  const raw = data as Record<string, unknown>;
  const out = { ...NO_PERMS };
  for (const k of PERM_KEYS) out[k] = raw[k] === true;
  return out;
});

/** لصفحة لا يدخلها إلا من يملك المفتاح: من لا يملكه يعود للرئيسية (والقاعدة تمنع الكتابة على أي حال). */
export async function requirePerm(key: PermKey, back = '/staff'): Promise<void> {
  if (!(await getMyPerms())[key]) redirect(back);
}
