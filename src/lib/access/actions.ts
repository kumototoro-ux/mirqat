'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { selectAll } from '@/lib/supabase/all';
import type { ActionResult } from '@/components/registry/types';

export type PositionInfo = { code: string; name: string; nameF: string; caps: { area: string; level: number }[] };
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
    supabase.from('positions').select('code, name_ar, name_f').order('sort'),
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
  revalidatePath('/staff/positions');
  return { ok: true, message: on ? 'تم الإسناد' : 'تم السحب' };
}
