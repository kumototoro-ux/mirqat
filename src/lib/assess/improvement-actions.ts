'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

/* تحسين درجة الطالب — كل القواعد والصلاحيات في القاعدة (هجرة 27) */

type Res<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string };
const STAFF = ['admin', 'teacher'] as const;
const friendly = (m: string) =>
  /FORBIDDEN|42501|permission denied|row-level security/.test(m) ? 'هذه المادة ليست ضمن صلاحيتك لهذا الطالب' : m.replace(/^ERROR:\s*/, '');

export type ImpType = { eval_type_id: number; name: string; weight: number; base: number | null; current: number };
export type ImpHistory = { id: number; type: string; earned: number; max: number; reason: string; before: number | null; after: number | null; at: string };
export type ImpState = { used: number; max: number; types: ImpType[]; history: ImpHistory[] };

export async function improvementState(studentId: number, subjectId: number, termId: number): Promise<Res<ImpState>> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('improvement_state', { p_student: studentId, p_subject: subjectId, p_term: termId });
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true, data: data as ImpState };
}

export async function improvementPreview(studentId: number, subjectId: number, termId: number, typeId: number, earned: number, max: number): Promise<Res<{ weight: number; current: number; after: number }>> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('improvement_preview', { p_student: studentId, p_subject: subjectId, p_term: termId, p_type: typeId, p_earned: earned, p_max: max });
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true, data: data as { weight: number; current: number; after: number } };
}

export async function saveImprovement(input: { student_id: number; subject_id: number; term_id: number; eval_type_id: number; earned: number; max: number; reason: string }): Promise<Res<{ before: number; after: number; weight: number }>> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('save_improvement', { p: input });
  if (error) return { ok: false, error: friendly(error.message) };
  const d = data as { before: number; after: number; weight: number };
  revalidatePath('/staff/results');
  return { ok: true, data: d, message: `حُفظ التحسين: ${d.before} ← ${d.after} من ${d.weight}` };
}

export async function deleteImprovement(id: number): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_improvement', { p_id: id });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath('/staff/results');
  return { ok: true, message: 'حُذف التحسين' };
}

export type ImpRow = {
  id: number; code: string; student: string; subject: string; term: string; type: string; earned: number; max: number;
  reason: string; before: number | null; after: number | null; at: string; teacher: string | null; can_delete: boolean;
};
export async function listImprovements(q: string, offset = 0): Promise<{ total: number; rows: ImpRow[] }> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data } = await supabase.rpc('list_improvements', { p_q: q.trim().slice(0, 40) || null, p_limit: 15, p_offset: offset });
  return (data as { total: number; rows: ImpRow[] } | null) ?? { total: 0, rows: [] };
}
