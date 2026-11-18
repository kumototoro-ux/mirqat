'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { selectAll } from '@/lib/supabase/all';
import type { ActionResult } from '@/components/registry/types';

export type PositionInfo = {
  code: string;
  name: string;
  nameF: string;
  /** school = يعمل على عدة فروع بالإسناد، branch = داخل فرع */
  tier: 'school' | 'branch';
  rank: number;
  isSystem: boolean;
  description: string;
  holders: number;
  caps: { area: string; level: number }[];
};
export type PositionEmployee = {
  id: number;
  code: string;
  name: string;
  assigned: { position: string; branchId: number }[];
};
export type PositionBoard = {
  positions: PositionInfo[];
  areas: { area: string; name: string }[];
  branches: { id: number; name: string; hasBuilding: boolean }[];
  employees: PositionEmployee[];
};

/** المناصب والموظفون وإسنادهم — للإداري وحده (والقاعدة تفرض ذلك أيضًا) */
export async function getPositionBoard(): Promise<PositionBoard> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const [pos, caps, areas, branches, emps, assigned] = await Promise.all([
    supabase.from('positions').select('code, name_ar, name_f, tier, rank, is_system, description').order('sort'),
    supabase.from('position_caps').select('position, area, level'),
    supabase.from('cap_areas').select('area, name_ar').order('sort'),
    supabase.from('branches').select('id, name, has_building').order('id'),
    selectAll<{ id: number; code: string; name_ar: string }>((a, b) => supabase.from('employees').select('id, code, name_ar').eq('is_active', true).neq('user_type', 'admin').order('name_ar').order('id').range(a, b)),
    selectAll<{ employee_id: number; position: string; branch_id: number }>((a, b) => supabase.from('employee_positions').select('employee_id, position, branch_id').order('employee_id').order('position').order('branch_id').range(a, b)),
  ]);
  for (const r of [pos, caps, areas, branches, emps, assigned]) if (r.error) throw new Error(r.error.message);

  const by = new Map<number, { position: string; branchId: number }[]>();
  for (const a of assigned.data ?? []) {
    const l = by.get(a.employee_id as number) ?? [];
    l.push({ position: a.position as string, branchId: a.branch_id as number });
    by.set(a.employee_id as number, l);
  }
  return {
    positions: (pos.data ?? []).map((p) => ({
      code: p.code as string,
      name: p.name_ar as string,
      nameF: p.name_f as string,
      tier: p.tier as 'school' | 'branch',
      rank: p.rank as number,
      isSystem: p.is_system as boolean,
      description: (p.description as string | null) ?? '',
      holders: new Set((assigned.data ?? []).filter((a) => a.position === p.code).map((a) => a.employee_id)).size,
      caps: (caps.data ?? []).filter((c) => c.position === p.code).map((c) => ({ area: c.area as string, level: c.level as number })),
    })),
    areas: (areas.data ?? []).map((a) => ({ area: a.area as string, name: a.name_ar as string })),
    branches: (branches.data ?? []).map((b) => ({ id: b.id as number, name: b.name as string, hasBuilding: b.has_building as boolean })),
    employees: (emps.data ?? []).map((e) => ({ id: e.id as number, code: e.code as string, name: e.name_ar as string, assigned: by.get(e.id as number) ?? [] })),
  };
}

/** إسناد منصب في فرع (on=true) أو سحبه (on=false) */
export async function setPosition(employeeId: number, position: string, branchId: number, on: boolean): Promise<ActionResult> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_position', { p_employee_id: employeeId, p_position: position, p_branch: branchId, p_on: on });
  if (error) return { ok: false, error: error.message.replace(/^ERROR:\s*/, '') };
  revalidatePath('/staff/roles');
  return { ok: true, message: on ? 'تم الإسناد' : 'تم السحب' };
}

const clean = (m: string) => m.replace(/^ERROR:\s*/, '');

export type PositionInput = { code?: string; name: string; nameF: string; tier: 'school' | 'branch'; rank: number; description: string };

/** منصب جديد أو تعديل اسمه ووصفه (المستوى والرتبة للمخصّص فقط — تفرضه القاعدة) */
export async function savePosition(input: PositionInput): Promise<ActionResult & { code?: string }> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_save_position', {
    p_code: input.code ?? null,
    p_name: input.name,
    p_name_f: input.nameF,
    p_tier: input.tier,
    p_rank: input.rank,
    p_desc: input.description,
  });
  if (error) return { ok: false, error: clean(error.message) };
  revalidatePath('/staff/roles');
  return { ok: true, message: input.code ? 'حُفظ المنصب' : 'أُضيف المنصب', code: data as string };
}

export async function deletePosition(code: string): Promise<ActionResult> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_delete_position', { p_code: code });
  if (error) return { ok: false, error: clean(error.message) };
  revalidatePath('/staff/roles');
  return { ok: true, message: 'حُذف المنصب' };
}

/** قدرات المنصب كلها دفعة واحدة: {area: 0..3} */
export async function setPositionCaps(code: string, caps: Record<string, number>): Promise<ActionResult> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_position_caps', { p_code: code, p_caps: caps });
  if (error) return { ok: false, error: clean(error.message) };
  revalidatePath('/staff/roles');
  return { ok: true, message: 'حُفظت صلاحيات المنصب' };
}

/** فروع منصب موظف بالمجموعة (فارغة = سحب المنصب منه) */
export async function setPositionBranches(employeeId: number, position: string, branchIds: number[]): Promise<ActionResult> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_position_branches', { p_employee_id: employeeId, p_position: position, p_branches: branchIds });
  if (error) return { ok: false, error: clean(error.message) };
  revalidatePath('/staff/roles');
  return { ok: true, message: branchIds.length ? 'حُفظ الإسناد' : 'سُحب المنصب' };
}
