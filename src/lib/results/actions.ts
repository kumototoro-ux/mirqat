'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { REF_TAG } from '@/lib/data';
import type { ClassReport, NoticeSettings, ReleaseRule, Section, StudentCard } from './shared';

/* =====================================================================
   النتائج — كل حساب وكل تحقق في القاعدة (class_results / my_report_card ...)
   الإدارة فقط هنا، والطالب يقرأ إشعاره عبر my_report_card مباشرة من صفحته
   ===================================================================== */

type Res<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; error: string };
const friendly = (m: string) =>
  /row-level security|FORBIDDEN|42501|permission denied|للإدارة/.test(m) ? 'هذه العملية للإدارة فقط' : /JWT|AUTH_REQUIRED/.test(m) ? 'انتهت الجلسة. سجّل الدخول من جديد' : m.replace(/^ERROR:\s*/, '');
const ADMIN = ['admin'] as const;

export async function classResults(classId: number, termId: number): Promise<ClassReport | null> {
  await requireUser(ADMIN);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('class_results', { p_class_id: classId, p_term_id: termId });
  if (error) throw new Error(friendly(error.message));
  return data as ClassReport;
}

export async function studentCard(studentId: number, termId: number): Promise<StudentCard> {
  await requireUser(ADMIN);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('student_report_card', { p_student_id: studentId, p_term_id: termId });
  if (error) throw new Error(friendly(error.message));
  return data as StudentCard;
}

export type OverviewRow = { class_id: number; students: number; graded: number; average: number | null; visible: number };
export async function resultsOverview(termId: number): Promise<OverviewRow[]> {
  await requireUser(ADMIN);
  const supabase = await createClient();
  const { data } = await supabase.rpc('results_overview', { p_term_id: termId });
  return (data as OverviewRow[]) ?? [];
}

/* ------------------------------ قواعد الإتاحة ------------------------------ */
export type RuleInput = Omit<ReleaseRule, 'id' | 'updated_at' | 'is_active'> & { is_active?: boolean };

export async function listRules(): Promise<ReleaseRule[]> {
  await requireUser(ADMIN);
  const supabase = await createClient();
  const { data } = await supabase.from('result_release_rules').select('*').order('is_active', { ascending: false }).order('updated_at', { ascending: false });
  return (data as ReleaseRule[]) ?? [];
}

export async function ruleReach(input: Pick<RuleInput, 'branch_ids' | 'stage_ids' | 'grade_ids' | 'class_ids' | 'student_ids'>): Promise<number> {
  await requireUser(ADMIN);
  const supabase = await createClient();
  const { data } = await supabase.rpc('release_rule_reach', { p: input });
  return Number(data ?? 0);
}

export async function saveRule(id: number | null, input: RuleInput): Promise<Res<{ id: number }>> {
  await requireUser(ADMIN);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('save_release_rule', { p_id: id, p: input });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath('/staff/results');
  revalidatePath('/student/results');
  return { ok: true, message: id ? 'حُدّثت القاعدة' : 'أُضيفت القاعدة — تُطبَّق فورًا', data: { id: Number(data) } };
}

export async function setRuleActive(id: number, active: boolean): Promise<Res> {
  await requireUser(ADMIN);
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_release_rule_active', { p_id: id, p_active: active });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath('/staff/results');
  return { ok: true, message: active ? 'فُعّلت القاعدة' : 'عُطّلت القاعدة' };
}

export async function deleteRule(id: number): Promise<Res> {
  await requireUser(ADMIN);
  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_release_rule', { p_id: id });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath('/staff/results');
  return { ok: true, message: 'حُذفت القاعدة' };
}

/* ------------------------------ منح المواظبة ------------------------------ */
export type Grant = { id: number; student_id: number; term_id: number | null; score: number; note: string | null; granted_at: string; student?: { code: string; name_ar: string } | null };

export async function listGrants(): Promise<Grant[]> {
  await requireUser(ADMIN);
  const supabase = await createClient();
  const { data } = await supabase
    .from('attendance_grants')
    .select('id, student_id, term_id, score, note, granted_at, student:students(code, name_ar)')
    .order('granted_at', { ascending: false })
    .returns<Grant[]>();
  return data ?? [];
}

export async function saveGrant(studentId: number, termId: number | null, score: number, note: string | null): Promise<Res> {
  await requireUser(ADMIN);
  const supabase = await createClient();
  const { error } = await supabase.rpc('save_attendance_grant', { p_student_id: studentId, p_term_id: termId, p_score: score, p_note: note });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath('/staff/results');
  return { ok: true, message: 'مُنحت درجة المواظبة' };
}

export async function deleteGrant(id: number): Promise<Res> {
  await requireUser(ADMIN);
  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_attendance_grant', { p_id: id });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath('/staff/results');
  return { ok: true, message: 'أُلغي المنح' };
}

/** بحث طالب بالاسم أو الرقم أو الهوية (لقواعد الإتاحة ومنح المواظبة) */
export type StudentHit = { id: number; code: string; name_ar: string; class_id: number | null };
export async function findStudents(q: string): Promise<StudentHit[]> {
  await requireUser(ADMIN);
  const term = q.trim().replace(/[%,()]/g, ' ').slice(0, 40);
  if (term.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('students')
    .select('id, code, name_ar, class_id')
    .eq('status', 'active')
    .or(`name_ar.ilike.%${term}%,code.ilike.%${term}%,national_id.ilike.%${term}%`)
    .order('name_ar')
    .limit(12);
  return (data as StudentHit[]) ?? [];
}

export async function studentsByIds(ids: number[]): Promise<StudentHit[]> {
  await requireUser(ADMIN);
  if (!ids.length) return [];
  const supabase = await createClient();
  const { data } = await supabase.from('students').select('id, code, name_ar, class_id').in('id', ids.slice(0, 500));
  return (data as StudentHit[]) ?? [];
}

/* ------------------------------ الأسماء والأقسام ------------------------------ */
export type LabelsInput = {
  subjects: { id: number; name_en: string }[];
  eval_types: { id: number; name_en: string; report_section: Section }[];
  branches: { id: number; is_intisab: boolean }[];
};

export async function saveLabels(input: LabelsInput): Promise<Res> {
  await requireUser(ADMIN);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('save_report_labels', { p: input });
  if (error) return { ok: false, error: friendly(error.message) };
  updateTag(REF_TAG);
  revalidatePath('/staff/results');
  return { ok: true, message: Number(data) ? `حُفظ ${data} تعديل` : 'لا تغييرات' };
}

export async function saveNotice(v: NoticeSettings): Promise<Res> {
  const me = await requireUser(ADMIN);
  const value = { principal: String(v.principal ?? '').trim().slice(0, 80), note: String(v.note ?? '').trim().slice(0, 300) };
  const supabase = await createClient();
  const { error } = await supabase.from('app_settings').upsert({ key: 'results_notice', value, is_public: false, updated_at: new Date().toISOString(), updated_by: me.id });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath('/staff/results');
  revalidatePath('/student/results');
  return { ok: true, message: 'حُفظ نص الإشعار' };
}
