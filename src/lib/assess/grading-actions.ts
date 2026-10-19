'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { PageParams, PageResult } from '@/components/registry/types';
import { pageSize } from '@/components/registry/types';
import { CLASS_SELECT, classLabel, type ClassRef } from '@/lib/format';
import type { HubRow, GradeRowInput } from './actions';

/* =====================================================================
   الرصد اليومي — من المهام، ويدوي، ولطالب واحد
   ===================================================================== */

type Res<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; error: string };
const STAFF = ['admin', 'teacher'] as const;
const friendly = (m: string) =>
  /row-level security|FORBIDDEN|42501/.test(m) ? 'لا تملك صلاحية هذه العملية' : /JWT|AUTH_REQUIRED/.test(m) ? 'انتهت الجلسة. سجّل الدخول من جديد' : m.replace(/^ERROR:\s*/, '');

export type RecordRow = Omit<HubRow, 'kind'> & { kind: 'task' | 'form' | 'manual'; target_student_id: number | null; target_student: string | null; description: string | null; avg_pct: number | null; grades_recorded_at: string | null };

async function page(p: PageParams, extra: Record<string, unknown>): Promise<PageResult<RecordRow>> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const f = p.filters ?? {};
  const { data, error } = await supabase.rpc('staff_assessments', {
    p: {
      page: p.page,
      size: pageSize(p),
      q: (p.q ?? '').slice(0, 60),
      sort: p.sort,
      kind: f.kind || null,
      class_id: f.class || null,
      subject_id: f.subject || null,
      mine: f.mine === '1',
      ...extra,
    },
  });
  if (error) throw new Error(friendly(error.message));
  return data as PageResult<RecordRow>;
}

/** مهام ونماذج بانتظار الرصد/التصحيح */
export async function listToRecord(p: PageParams) {
  return page(p, { status: 'to_record' });
}

/** سجلات الرصد: كل ما رُصدت فيه درجة (يدوي ومهام ونماذج) */
export async function listRecords(p: PageParams) {
  return page(p, { include_manual: true, recorded: true, status: p.filters?.status || null });
}

export type RosterRow = { id: number; code: string; name_ar: string };

export async function getRoster(classId: number): Promise<RosterRow[]> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data } = await supabase.from('students').select('id, code, name_ar').eq('class_id', classId).eq('status', 'active').order('name_ar');
  return data ?? [];
}

export type StudentHit = { id: number; code: string; name_ar: string; class_id: number; class_label: string };

/** البحث عن طالب ضمن نطاق المعلم (RLS تقصر النتائج على فصوله) */
export async function searchStudents(q: string): Promise<StudentHit[]> {
  await requireUser(STAFF);
  const term = q.replace(/[,()*%\\"]/g, ' ').trim().slice(0, 40);
  if (term.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('students')
    .select(`id, code, name_ar, class_id, class:classes(${CLASS_SELECT})`)
    .eq('status', 'active')
    .or(`name_ar.ilike.%${term}%,code.ilike.%${term}%`)
    .order('name_ar')
    .limit(12)
    .returns<{ id: number; code: string; name_ar: string; class_id: number; class: ClassRef }[]>();
  return (data ?? []).map(({ class: c, ...s }) => ({ ...s, class_label: classLabel(c, true) }));
}

export async function saveManual(
  id: number | null,
  meta: { title: string; description: string | null; subject_id: number | null; term_id: number | null; eval_type_id: number | null; max_score: number; date: string | null; teacher_id?: number | null },
  classId: number | null,
  studentId: number | null,
  rows: GradeRowInput[],
): Promise<Res<{ id: number }>> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('save_manual', { p_id: id, p: meta, p_class_id: classId, p_student_id: studentId, p_rows: rows });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath('/staff/grading');
  revalidatePath('/student');
  const n = rows.filter((r) => r.score != null && !r.clear).length;
  return { ok: true, message: studentId ? 'رُصدت الدرجة' : id ? 'حُفظ الرصد' : `رُصدت درجات ${n} طالب`, data: { id: data as number } };
}

export async function deleteManual(id: number): Promise<Res> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_manual', { p_id: id });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath('/staff/grading');
  return { ok: true, message: 'حُذف الرصد' };
}

export type SingleRecent = { id: number; title: string; student: string; code: string; subject: string | null; score: number; max_score: number; note: string | null; recorded_at: string; can_undo: boolean };

export async function recentSingle(): Promise<SingleRecent[]> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_recent_single', { p_limit: 12 });
  return (data as SingleRecent[]) ?? [];
}
