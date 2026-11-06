'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { selectAll } from '@/lib/supabase/all';
import type { ActionResult } from '@/components/registry/types';
import { PERM_KEYS, type PermKey } from './keys';

export type PermKeyInfo = { key: PermKey; name: string; hint: string | null; teacherDefault: boolean };
export type PermRow = {
  id: number;
  code: string;
  name: string;
  hasAccount: boolean;
  /** الاستثناء الفردي إن وُجد: true منح، false سحب، غيابه = الافتراضي */
  overrides: Partial<Record<PermKey, boolean>>;
};
export type PermMatrix = { keys: PermKeyInfo[]; rows: PermRow[] };

/** المعلمون النشطون ومفاتيحهم — للإداري وحده (والقاعدة تفرض ذلك أيضًا) */
export async function getPermMatrix(): Promise<PermMatrix> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const [keysRes, empRes, permRes] = await Promise.all([
    supabase.from('permission_keys').select('key, name_ar, hint, teacher_default').order('sort'),
    selectAll<{ id: number; code: string; name_ar: string; profiles: unknown }>((a, b) => supabase.from('employees').select('id, code, name_ar, profiles(id)').eq('is_active', true).neq('user_type', 'admin').order('name_ar').order('id').range(a, b)),
    selectAll<{ employee_id: number; key: string; granted: boolean }>((a, b) => supabase.from('user_permissions').select('employee_id, key, granted').order('employee_id').order('key').range(a, b)),
  ]);
  if (keysRes.error) throw new Error(keysRes.error.message);
  if (empRes.error) throw new Error(empRes.error.message);
  if (permRes.error) throw new Error(permRes.error.message);

  const over = new Map<number, Partial<Record<PermKey, boolean>>>();
  for (const p of permRes.data ?? []) {
    const m = over.get(p.employee_id as number) ?? {};
    m[p.key as PermKey] = p.granted as boolean;
    over.set(p.employee_id as number, m);
  }
  type E = { id: number; code: string; name_ar: string; profiles: unknown };
  return {
    keys: (keysRes.data ?? []).map((k) => ({ key: k.key as PermKey, name: k.name_ar as string, hint: (k.hint as string | null) ?? null, teacherDefault: k.teacher_default as boolean })),
    rows: ((empRes.data ?? []) as E[]).map((e) => ({
      id: e.id,
      code: e.code,
      name: e.name_ar,
      hasAccount: Array.isArray(e.profiles) ? e.profiles.length > 0 : e.profiles != null,
      overrides: over.get(e.id) ?? {},
    })),
  };
}

/** منح مفتاح (true) أو سحبه (false) أو إعادته للافتراضي (null) */
export async function setPermission(employeeId: number, key: PermKey, granted: boolean | null): Promise<ActionResult> {
  await requireUser(['admin']);
  if (!(PERM_KEYS as readonly string[]).includes(key)) return { ok: false, error: 'مفتاح غير معروف' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_permission', { p_employee_id: employeeId, p_key: key, p_granted: granted });
  if (error) return { ok: false, error: error.message.replace(/^ERROR:\s*/, '') };
  revalidatePath('/staff/permissions');
  return { ok: true, message: granted === null ? 'عادت للافتراضي' : granted ? 'تم المنح' : 'تم السحب' };
}
