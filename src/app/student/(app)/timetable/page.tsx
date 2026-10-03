import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Empty, PageHeader } from '@/components/ui';
import { TimetableGrid } from '@/components/timetable-grid';
import { classLabel } from '@/lib/format';
import { getMe } from '@/lib/student';

export const metadata: Metadata = { title: 'جدولي' };

export default async function StudentTimetable() {
  await requireUser(['student']);
  const me = await getMe();
  const supabase = await createClient();
  const { data } = await supabase
    .from('timetable_slots')
    .select('id, day_of_week, period_no, starts_at, delivery_mode, subject:subjects(name), teacher:employees(name_ar)')
    .eq('class_id', me?.class_id ?? -1)
    .returns<{ id: number; day_of_week: number; period_no: number; starts_at: string | null; delivery_mode: string | null; subject: { name: string } | null; teacher: { name_ar: string } | null }[]>();
  const slots = (data ?? []).map((r) => ({
    id: r.id, day: r.day_of_week, period: r.period_no, startsAt: r.starts_at,
    subject: r.subject?.name ?? '—', sub: r.teacher?.name_ar ?? null, mode: r.delivery_mode,
  }));
  return (
    <>
      <PageHeader title="جدولي" lead={me ? `الجدول الأسبوعي لفصل ${classLabel(me.class)}.` : undefined} />
      {slots.length ? <TimetableGrid slots={slots} /> : <Empty title="لم يُنشر جدول فصلك بعد" />}
    </>
  );
}
