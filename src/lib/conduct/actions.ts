'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { PageParams, PageResult } from '@/components/registry/types';
import { pageSize } from '@/components/registry/types';

/* =====================================================================
   التحضير والسلوك — كل كتابة عبر دالة قاعدة تتحقق من النطاق والمهل بنفسها
   ===================================================================== */

type Res<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; error: string };
const STAFF = ['admin', 'teacher'] as const;
const friendly = (m: string) =>
  /row-level security|FORBIDDEN|42501|permission denied/.test(m) ? 'لا تملك صلاحية هذه العملية' : /JWT|AUTH_REQUIRED/.test(m) ? 'انتهت الجلسة. سجّل الدخول من جديد' : m.replace(/^ERROR:\s*/, '');

/* ------------------------------- التحضير ------------------------------- */
export type Period = { slot_id: number; class_id: number; subject_id: number; period_no: number; starts_at: string | null; subject: string; recorded: number; absent: number; students: number };

export async function myPeriods(date: string | null): Promise<Period[]> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_periods', { p_date: date });
  return (data as Period[]) ?? [];
}

export type SessionKey = { class_id: number; subject_id: number | null; period_no: number; date: string };
export type SessionRow = { id: number; code: string; name_ar: string; status_id: number | null; note: string | null; recorded_at: string | null };

/** كشف الحصة: طلاب الفصل وحالاتهم المسجّلة إن وُجدت */
export async function getSessionRoster(k: SessionKey): Promise<SessionRow[]> {
  await requireUser(STAFF);
  const supabase = await createClient();
  let q = supabase.from('attendance_records').select('student_id, status_id, note, recorded_at').eq('class_id', k.class_id).eq('occurred_on', k.date).eq('period_no', k.period_no);
  q = k.subject_id ? q.eq('subject_id', k.subject_id) : q.is('subject_id', null);
  const [students, recs] = await Promise.all([
    supabase.from('students').select('id, code, name_ar').eq('class_id', k.class_id).eq('status', 'active').order('name_ar'),
    q,
  ]);
  const by = new Map((recs.data ?? []).map((r) => [r.student_id, r]));
  return (students.data ?? []).map((s) => ({ ...s, status_id: by.get(s.id)?.status_id ?? null, note: by.get(s.id)?.note ?? null, recorded_at: by.get(s.id)?.recorded_at ?? null }));
}

export async function saveAttendance(k: SessionKey, rows: { student_id: number; status_id: number; note: string | null }[]): Promise<Res<{ n: number }>> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('save_attendance', { p: { ...k, rows } });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath('/staff/attendance');
  return { ok: true, message: data ? `حُفظ تحضير ${rows.length} طالب` : 'لا تغييرات', data: { n: data as number } };
}

export async function deleteSession(k: SessionKey): Promise<Res> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_attendance_session', { p_class_id: k.class_id, p_date: k.date, p_period: k.period_no, p_subject_id: k.subject_id });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath('/staff/attendance');
  return { ok: true, message: 'حُذف تحضير الحصة' };
}

export type SessionSummary = {
  class_id: number; occurred_on: string; period_no: number; subject_id: number | null; subject: string | null; recorder: string | null;
  total: number; present: number; absent: number; late: number; excused: number; recorded_at: string; edited: boolean;
};

export async function listSessions(p: PageParams): Promise<PageResult<SessionSummary>> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const f = p.filters ?? {};
  const { data, error } = await supabase.rpc('attendance_sessions', { p: { page: p.page, size: pageSize(p), class_id: f.class || null, from: f.from || null, mine: f.mine === '1' } });
  if (error) throw new Error(friendly(error.message));
  return data as PageResult<SessionSummary>;
}

export type AbsenceRow = { student_id: number; code: string; name_ar: string; total: number; absent: number; late: number; excused: number; pct: number | null; last_absent: string | null };

export async function attendanceSummary(classId: number, termId: number): Promise<AbsenceRow[]> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('attendance_summary', { p_class_id: classId, p_term_id: termId });
  if (error) throw new Error(friendly(error.message));
  return (data as AbsenceRow[]) ?? [];
}

/* -------------------------------- السلوك -------------------------------- */
export type BehaviorRecord = {
  id: number; student_id: number; status_id: number; status: string; score: number; note: string | null; occurred_on: string | null;
  recorded_at: string; recorder: string | null; recorded_by: number | null; subject: string | null; student?: string; code?: string;
};
export type BehaviorSummary = { score: number; negative: number; positive: number; neutral: number; total: number };

type RawBeh = Omit<BehaviorRecord, 'status' | 'recorder' | 'subject' | 'student' | 'code'> & {
  st: { name: string } | null; sub: { name: string } | null; stu?: { name_ar: string; code: string } | null;
};
const mapBeh = (r: RawBeh): BehaviorRecord => ({
  id: r.id, student_id: r.student_id, status_id: r.status_id, status: r.st?.name ?? '', score: Number(r.score ?? 0), note: r.note, occurred_on: r.occurred_on,
  recorded_at: r.recorded_at, recorded_by: r.recorded_by, recorder: null, subject: r.sub?.name ?? null, student: r.stu?.name_ar, code: r.stu?.code,
});
/** أسماء المسجّلين من دليل الموظفين (المعلم لا يقرأ سجلات زملائه الوظيفية) */
async function withRecorders(supabase: Awaited<ReturnType<typeof createClient>>, rows: BehaviorRecord[]) {
  const ids = [...new Set(rows.map((r) => r.recorded_by).filter((x): x is number => x != null))];
  if (!ids.length) return rows;
  const { data } = await supabase.from('staff_directory').select('id, name_ar').in('id', ids);
  const m = new Map((data ?? []).map((d) => [d.id, d.name_ar]));
  return rows.map((r) => ({ ...r, recorder: r.recorded_by != null ? (m.get(r.recorded_by) ?? null) : null }));
}
const BEH_SELECT = 'id, student_id, status_id, score, note, occurred_on, recorded_at, recorded_by, st:behavior_statuses(name), sub:subjects(name)';

export async function studentBehavior(studentId: number, termId: number | null): Promise<{ summary: BehaviorSummary; records: BehaviorRecord[] }> {
  await requireUser(STAFF);
  const supabase = await createClient();
  let q = supabase.from('behavior_records').select(BEH_SELECT).eq('student_id', studentId).order('occurred_on', { ascending: false }).order('recorded_at', { ascending: false }).limit(200);
  if (termId) q = q.eq('term_id', termId);
  const [sum, recs] = await Promise.all([supabase.rpc('behavior_summary', { p_student_id: studentId, p_term_id: termId }), q.returns<RawBeh[]>()]);
  return { summary: (sum.data as BehaviorSummary) ?? { score: 100, negative: 0, positive: 0, neutral: 0, total: 0 }, records: await withRecorders(supabase, (recs.data ?? []).map(mapBeh)) };
}

export async function recentBehavior(limit = 25): Promise<BehaviorRecord[]> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data } = await supabase.from('behavior_records').select(`${BEH_SELECT}, stu:students(name_ar, code)`).order('recorded_at', { ascending: false }).limit(Math.min(limit, 60)).returns<RawBeh[]>();
  return withRecorders(supabase, (data ?? []).map(mapBeh));
}

export type BoardRow = { student_id: number; name_ar: string; code: string; score: number; negative: number; positive: number };
export type Board = { lowest: BoardRow[]; top: BoardRow[]; week: { positive: number; negative: number } };

export async function behaviorBoard(termId: number | null): Promise<Board> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data } = await supabase.rpc('behavior_board', { p_term_id: termId });
  return (data as Board) ?? { lowest: [], top: [], week: { positive: 0, negative: 0 } };
}

export async function saveBehavior(id: number | null, p: { student_id: number; status_id: number; score: number; note: string | null; date: string; subject_id: number | null }): Promise<Res<{ id: number }>> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('save_behavior', { p_id: id, p });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath('/staff/behavior');
  return { ok: true, message: id ? 'حُفظ التعديل' : 'سُجّل السلوك', data: { id: data as number } };
}

export async function deleteBehavior(id: number): Promise<Res> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_behavior', { p_id: id });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath('/staff/behavior');
  return { ok: true, message: 'حُذف السجل' };
}
