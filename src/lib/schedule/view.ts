import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { CLASS_SELECT, classLabel, type ClassRef } from '@/lib/format';
import { getTerms } from '@/lib/data';

/* =====================================================================
   بيانات صفحات العرض (التقويم، الحصص، الاختبارات) لكل دور.
   الإداري يرى كل شيء، والمعلم والطالب يخضعان لإعدادات "ما يراه الطلاب"
   (calendar_visibility و exam_visibility) كما في النظام القديم.
   ===================================================================== */

export type ViewSlot = {
  id: number;
  day: number;
  period: number;
  startsAt: string | null;
  subjectId: number;
  subject: string;
  teacherId: number | null;
  teacher: string | null;
  classId: number;
  classLabel: string;
  mode: string | null;
};

export type ViewExam = {
  id: number;
  date: string;
  startsAt: string | null;
  period: string | null;
  subject: string;
  classId: number;
  classLabel: string;
  branch: string;
  teacherId: number | null;
  teacher: string | null;
};

export type ViewWeek = {
  id: number;
  termId: number;
  week: string | null;
  period: string | null;
  from: string;
  to: string;
  event: string | null;
  color: string | null;
};

export const getVisibility = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from('app_settings').select('key, value').in('key', ['calendar_visibility', 'exam_visibility']);
  const v = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  return {
    calendarTerm: typeof v.calendar_visibility === 'string' && v.calendar_visibility !== 'all' ? (v.calendar_visibility as string) : null,
    examsHidden: v.exam_visibility === 'hidden',
  };
});

type RawSlot = {
  id: number; day_of_week: number; period_no: number; starts_at: string | null; delivery_mode: string | null;
  subject_id: number; teacher_id: number | null; class_id: number;
  subject: { name: string } | null; teacher: { name_ar: string } | null; class: ClassRef;
};
const SLOT_SELECT = `id, day_of_week, period_no, starts_at, delivery_mode, subject_id, teacher_id, class_id,
  subject:subjects(name), teacher:employees(name_ar), class:classes(${CLASS_SELECT})`;

const toSlot = (r: RawSlot): ViewSlot => ({
  id: r.id, day: r.day_of_week, period: r.period_no, startsAt: r.starts_at, subjectId: r.subject_id,
  subject: r.subject?.name ?? '—', teacherId: r.teacher_id, teacher: r.teacher?.name_ar ?? null,
  classId: r.class_id, classLabel: classLabel(r.class, true), mode: r.delivery_mode,
});

/** كل الحصص (للإداري: تُحمَّل مرة ويُبدَّل بين الفصول والمعلمين في المتصفح بلا طلبات) */
export async function getAllSlots(): Promise<ViewSlot[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('timetable_slots').select(SLOT_SELECT).limit(8000).returns<RawSlot[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map(toSlot);
}

export async function getSlotsFor(filter: { classId?: number; teacherId?: number }): Promise<ViewSlot[]> {
  const supabase = await createClient();
  let q = supabase.from('timetable_slots').select(SLOT_SELECT);
  if (filter.classId) q = q.eq('class_id', filter.classId);
  if (filter.teacherId) q = q.eq('teacher_id', filter.teacherId);
  const { data, error } = await q.returns<RawSlot[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map(toSlot);
}

type RawExam = {
  id: number; exam_date: string; starts_at: string | null; exam_period: string | null; class_id: number; teacher_id: number | null;
  subject: { name: string } | null; teacher: { name_ar: string } | null; class: ClassRef;
};

export async function getExamsFor(filter: { classIds?: number[]; teacherId?: number } = {}): Promise<ViewExam[]> {
  const supabase = await createClient();
  let q = supabase
    .from('exam_schedule')
    .select(`id, exam_date, starts_at, exam_period, class_id, teacher_id, subject:subjects(name), teacher:employees(name_ar), class:classes(${CLASS_SELECT})`)
    .order('exam_date')
    .order('starts_at')
    .limit(3000);
  if (filter.classIds && filter.teacherId) q = q.or(`class_id.in.(${filter.classIds.join(',') || -1}),teacher_id.eq.${filter.teacherId}`);
  else if (filter.classIds) q = q.in('class_id', filter.classIds.length ? filter.classIds : [-1]);
  const { data, error } = await q.returns<RawExam[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id, date: r.exam_date, startsAt: r.starts_at, period: r.exam_period, subject: r.subject?.name ?? '—',
    classId: r.class_id, classLabel: classLabel(r.class), branch: r.class?.branch?.name ?? '', teacherId: r.teacher_id, teacher: r.teacher?.name_ar ?? null,
  }));
}

/** التقويم: كل الفصول الدراسية، أو الفصل المسموح فقط لغير الإداري */
export async function getCalendarFor(isAdmin: boolean) {
  const supabase = await createClient();
  const [{ data, error }, terms, vis] = await Promise.all([
    supabase.from('calendar_entries').select('id, term_id, period_label, week_label, starts_on, ends_on, event, color').order('starts_on').limit(2000),
    getTerms(),
    getVisibility(),
  ]);
  if (error) throw new Error(error.message);
  let allowed = terms;
  if (!isAdmin && vis.calendarTerm) allowed = terms.filter((t) => t.name === vis.calendarTerm);
  const ids = new Set(allowed.map((t) => t.id));
  const weeks: ViewWeek[] = (data ?? [])
    .filter((e) => ids.has(e.term_id))
    .map((e) => ({ id: e.id, termId: e.term_id, week: e.week_label, period: e.period_label, from: e.starts_on, to: e.ends_on, event: e.event, color: e.color }));
  return { terms: allowed.filter((t) => weeks.some((w) => w.termId === t.id)), weeks };
}
