'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { REF_TAG, getClasses } from '@/lib/data';
import type { ActionResult } from '@/components/registry/types';

/* =====================================================================
   التقويم الدراسي وجدول الحصص وجدول الاختبارات — للإداري (RLS تفرض ذلك أيضًا)
   كل تعديل يُكتب في سجل النشاط بالمشغّلات الموجودة.
   ===================================================================== */

const fail = (m: string): ActionResult => ({ ok: false, error: friendly(m) });
function friendly(m: string) {
  if (m.includes('calendar_entries_dates_chk')) return 'تاريخ النهاية قبل تاريخ البداية';
  if (m.includes('timetable_slots_class_id_day_of_week_period_no_subject_id_key')) return 'هذه المادة موجودة في نفس الحصة لهذا الفصل';
  if (m.includes('duplicate key')) return 'العنصر موجود من قبل';
  if (m.includes('violates foreign key')) return 'لا يمكن الحذف: مرتبط بسجلات أخرى';
  if (m.includes('row-level security')) return 'هذه العملية للإدارة فقط';
  return m;
}
const done = (message: string, paths: string[]): ActionResult => {
  paths.forEach((p) => revalidatePath(p));
  updateTag(REF_TAG);
  return { ok: true, message };
};
const isDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s: unknown) => s === null || s === '' || (typeof s === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(s));
const txt = (s: unknown, max = 80) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, max) : null);

/* ---------------------------------------------------------------------
   القوائم اللازمة لنماذج الجداول (مرة واحدة عند فتح القسم)
--------------------------------------------------------------------- */
export type ScheduleLookups = {
  classes: { id: number; label: string }[];
  subjects: { id: number; name: string }[];
  teachers: { id: number; name: string; subjects: number[] }[];
  terms: { id: number; label: string }[];
  matrix: { class_id: number; subject_id: number }[];
  modes: string[];
};

export async function getScheduleLookups(): Promise<ScheduleLookups> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const [classes, subjects, teachers, terms, matrix, modes] = await Promise.all([
    getClasses(),
    supabase.from('subjects').select('id, name').eq('is_active', true).order('sort_order'),
    supabase.from('employees').select('id, name_ar, staff_scope(subject_id)').eq('is_active', true).order('name_ar'),
    supabase.from('terms').select('id, name, year:academic_years(name, is_current)').order('sort_order'),
    supabase.from('classes').select('id, branch_id, grade_id, section_id').eq('is_active', true),
    supabase.from('timetable_slots').select('delivery_mode').not('delivery_mode', 'is', null).limit(500),
  ]);
  const sm = await supabase.from('subject_matrix').select('branch_id, grade_id, section_id, subject_id').limit(5000);
  const cls = (matrix.data ?? []) as { id: number; branch_id: number; grade_id: number; section_id: number }[];
  const pairs: { class_id: number; subject_id: number }[] = [];
  for (const c of cls)
    for (const m of (sm.data ?? []) as { branch_id: number; grade_id: number; section_id: number | null; subject_id: number }[])
      if (m.branch_id === c.branch_id && m.grade_id === c.grade_id && (m.section_id === null || m.section_id === c.section_id))
        pairs.push({ class_id: c.id, subject_id: m.subject_id });
  return {
    classes: classes.map((c) => ({ id: c.id, label: `${c.label}${c.branch ? ` · ${c.branch}` : ''}` })),
    subjects: subjects.data ?? [],
    teachers: ((teachers.data ?? []) as unknown as { id: number; name_ar: string; staff_scope: { subject_id: number | null }[] }[]).map((t) => ({
      id: t.id,
      name: t.name_ar,
      subjects: t.staff_scope.flatMap((s) => (s.subject_id ? [s.subject_id] : [])),
    })),
    terms: ((terms.data ?? []) as unknown as { id: number; name: string; year: { name: string; is_current: boolean } | null }[]).map((t) => ({
      id: t.id,
      label: `${t.name}${t.year ? ` ${t.year.name}` : ''}`,
    })),
    matrix: pairs,
    modes: [...new Set(((modes.data ?? []) as { delivery_mode: string }[]).map((m) => m.delivery_mode))],
  };
}

/* ---------------------------------------------------------------------
   التقويم الدراسي
--------------------------------------------------------------------- */
export type CalendarEntry = {
  id: number; term_id: number; period_label: string | null; week_label: string | null;
  starts_on: string; ends_on: string; event: string | null; color: string | null;
};

export async function getCalendar(termId: number): Promise<CalendarEntry[]> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('calendar_entries')
    .select('id, term_id, period_label, week_label, starts_on, ends_on, event, color')
    .eq('term_id', termId)
    .order('starts_on')
    .order('ends_on', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function saveCalendarEntry(id: number | null, e: Omit<CalendarEntry, 'id'>): Promise<ActionResult> {
  await requireUser(['admin']);
  if (!e.term_id) return fail('اختر الفصل الدراسي');
  if (!isDate(e.starts_on) || !isDate(e.ends_on)) return fail('أدخل تاريخي البداية والنهاية');
  if (!txt(e.week_label) && !txt(e.event)) return fail('أدخل اسم الأسبوع أو المناسبة');
  const row = {
    term_id: e.term_id, starts_on: e.starts_on, ends_on: e.ends_on,
    week_label: txt(e.week_label), period_label: txt(e.period_label), event: txt(e.event, 120), color: txt(e.color, 20),
    updated_at: new Date().toISOString(),
  };
  const supabase = await createClient();
  const { error } = id ? await supabase.from('calendar_entries').update(row).eq('id', id) : await supabase.from('calendar_entries').insert(row);
  if (error) return fail(error.message);
  return done(id ? 'حُفظ التعديل' : 'أُضيف إلى التقويم', ['/staff/calendar', '/student/calendar']);
}

export async function deleteCalendarEntry(id: number): Promise<ActionResult> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const { error } = await supabase.from('calendar_entries').delete().eq('id', id);
  if (error) return fail(error.message);
  return done('حُذف من التقويم', ['/staff/calendar', '/student/calendar']);
}

/* ---------------------------------------------------------------------
   جدول الحصص
--------------------------------------------------------------------- */
export type Slot = {
  id: number; class_id: number; subject_id: number; teacher_id: number | null;
  day_of_week: number; period_no: number; starts_at: string | null; delivery_mode: string | null;
};

export async function getTimetable(classId: number): Promise<Slot[]> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('timetable_slots')
    .select('id, class_id, subject_id, teacher_id, day_of_week, period_no, starts_at, delivery_mode')
    .eq('class_id', classId)
    .order('day_of_week')
    .order('period_no');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function saveSlot(id: number | null, s: Omit<Slot, 'id'>): Promise<ActionResult> {
  await requireUser(['admin']);
  if (!s.class_id || !s.subject_id) return fail('اختر الفصل والمادة');
  if (!(s.day_of_week >= 0 && s.day_of_week <= 4) || !(s.period_no >= 1 && s.period_no <= 12)) return fail('اليوم أو رقم الحصة غير صحيح');
  if (!isTime(s.starts_at)) return fail('وقت البداية غير صحيح');
  const row = {
    class_id: s.class_id, subject_id: s.subject_id, teacher_id: s.teacher_id || null,
    day_of_week: s.day_of_week, period_no: s.period_no, starts_at: s.starts_at || null,
    delivery_mode: txt(s.delivery_mode, 40), updated_at: new Date().toISOString(),
  };
  const supabase = await createClient();
  const { error } = id ? await supabase.from('timetable_slots').update(row).eq('id', id) : await supabase.from('timetable_slots').insert(row);
  if (error) return fail(error.message);
  return done(id ? 'حُفظت الحصة' : 'أُضيفت الحصة', ['/staff/timetable', '/student/timetable']);
}

export async function deleteSlot(id: number): Promise<ActionResult> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const { error } = await supabase.from('timetable_slots').delete().eq('id', id);
  if (error) return fail(error.message);
  return done('حُذفت الحصة', ['/staff/timetable', '/student/timetable']);
}

/* ---------------------------------------------------------------------
   جدول الاختبارات
--------------------------------------------------------------------- */
export type Exam = {
  id: number; class_id: number; subject_id: number; teacher_id: number | null; term_id: number | null;
  exam_date: string; starts_at: string | null; exam_period: string | null;
};

export async function getExams(classId: number | null): Promise<Exam[]> {
  await requireUser(['admin']);
  const supabase = await createClient();
  let q = supabase
    .from('exam_schedule')
    .select('id, class_id, subject_id, teacher_id, term_id, exam_date, starts_at, exam_period')
    .order('exam_date')
    .order('starts_at')
    .limit(500);
  if (classId) q = q.eq('class_id', classId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function saveExam(id: number | null, x: Omit<Exam, 'id'>): Promise<ActionResult> {
  await requireUser(['admin']);
  if (!x.class_id || !x.subject_id) return fail('اختر الفصل والمادة');
  if (!isDate(x.exam_date)) return fail('أدخل تاريخ الاختبار');
  if (!isTime(x.starts_at)) return fail('وقت البداية غير صحيح');
  const row = {
    class_id: x.class_id, subject_id: x.subject_id, teacher_id: x.teacher_id || null, term_id: x.term_id || null,
    exam_date: x.exam_date, starts_at: x.starts_at || null, exam_period: txt(x.exam_period, 40), updated_at: new Date().toISOString(),
  };
  const supabase = await createClient();
  const { error } = id ? await supabase.from('exam_schedule').update(row).eq('id', id) : await supabase.from('exam_schedule').insert(row);
  if (error) return fail(error.message);
  return done(id ? 'حُفظ الاختبار' : 'أُضيف الاختبار', ['/staff/exams']);
}

export async function deleteExam(id: number): Promise<ActionResult> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const { error } = await supabase.from('exam_schedule').delete().eq('id', id);
  if (error) return fail(error.message);
  return done('حُذف الاختبار', ['/staff/exams']);
}

/* ---------------------------------------------------------------------
   استخدام الفروع (لشرح رفض الحذف)
--------------------------------------------------------------------- */
export async function getBranchUsage(): Promise<Record<number, { classes: number; students: number; staff: number }>> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const { data } = await supabase.rpc('branch_usage');
  return Object.fromEntries(((data ?? []) as { branch_id: number; classes: number; students: number; staff: number }[]).map((r) => [r.branch_id, r]));
}
