import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Empty, ErrorNote, FilterBar, PageHeader, Select } from '@/components/ui';
import { TimetableGrid, type Slot } from '@/components/timetable-grid';
import { CLASS_SELECT, classLabel, type ClassRef } from '@/lib/format';
import { classOptions } from '@/lib/data';

export const metadata: Metadata = { title: 'جدول الحصص' };

type Row = {
  id: number;
  day_of_week: number;
  period_no: number;
  starts_at: string | null;
  delivery_mode: string | null;
  subject: { name: string } | null;
  teacher: { name_ar: string } | null;
  class: ClassRef;
};

export default async function TimetablePage({ searchParams }: { searchParams: Promise<{ class?: string; mine?: string }> }) {
  const user = await requireUser(['admin', 'teacher']);
  const sp = await searchParams;
  const options = await classOptions();
  // المعلم يرى جدوله أولًا، والإداري جدول أول فصل
  const mine = sp.mine === '1' || (user.role === 'teacher' && !sp.class);
  const classId = mine ? null : Number(sp.class) || (options[0]?.value as number | undefined) || null;

  const supabase = await createClient();
  let q = supabase
    .from('timetable_slots')
    .select(`id, day_of_week, period_no, starts_at, delivery_mode, subject:subjects(name), teacher:employees(name_ar), class:classes(${CLASS_SELECT})`);
  q = mine ? q.eq('teacher_id', user.employeeId ?? -1) : q.eq('class_id', classId ?? -1);
  const { data, error } = await q.returns<Row[]>();

  const slots: Slot[] = (data ?? []).map((r) => ({
    id: r.id,
    day: r.day_of_week,
    period: r.period_no,
    startsAt: r.starts_at,
    subject: r.subject?.name ?? '—',
    sub: mine ? classLabel(r.class, true) : (r.teacher?.name_ar ?? null),
    mode: r.delivery_mode,
  }));
  const label = options.find((o) => o.value === classId)?.label ?? '';

  return (
    <>
      <PageHeader
        title="جدول الحصص"
        lead={mine ? 'حصصك في الأسبوع.' : `الجدول الأسبوعي لفصل ${label}.`}
        actions={
          user.employeeId ? (
            <Link href={mine ? `/staff/timetable?class=${options[0]?.value ?? ''}` : '/staff/timetable?mine=1'} className="btn-quiet">
              {mine ? 'جداول الفصول' : 'جدولي'}
            </Link>
          ) : null
        }
      />
      {!mine && (
        <FilterBar>
          <Select name="class" label="الفصل" value={classId} options={options} className="w-72" />
        </FilterBar>
      )}
      <ErrorNote error={error} />
      {slots.length ? <TimetableGrid slots={slots} /> : <Empty title="لا حصص في هذا الجدول" />}
    </>
  );
}
