import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getMe } from '@/lib/student';
import { getSlotsFor } from '@/lib/schedule/view';
import { NowNext, WeekTimetable } from '@/components/schedule/week-view';
import { classLabel } from '@/lib/format';

export const metadata: Metadata = { title: 'جدولي' };

export default async function StudentTimetable() {
  await requireUser(['student']);
  const me = await getMe();
  const slots = me?.class_id ? await getSlotsFor({ classId: me.class_id }) : [];
  const subjects = [...new Set(slots.map((s) => s.subject))];
  return (
    <div className="space-y-6">
      <NowNext slots={slots} secondary="teacher" />
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-surface px-3.5 py-1.5 text-sm ring-1 ring-line">{me ? classLabel(me.class, true) : '—'}</span>
        <span className="rounded-full bg-surface px-3.5 py-1.5 text-sm ring-1 ring-line"><b className="tabular-nums">{slots.length}</b> حصة أسبوعيًا</span>
        <span className="rounded-full bg-surface px-3.5 py-1.5 text-sm ring-1 ring-line"><b className="tabular-nums">{subjects.length}</b> مادة</span>
      </div>
      {slots.length ? (
        <WeekTimetable slots={slots} secondary="teacher" />
      ) : (
        <p className="rounded-2xl border border-dashed border-line bg-surface py-14 text-center text-muted">لم يُنشر جدول فصلك بعد</p>
      )}
    </div>
  );
}
