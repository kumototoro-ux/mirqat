import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Badge, Empty, ErrorNote, FilterBar, PageHeader, Select } from '@/components/ui';
import { CLASS_SELECT, classLabel, fmtDate, fmtHijri, fmtTime, fmtWeekday, todayISO, type ClassRef } from '@/lib/format';
import { classOptions } from '@/lib/data';
import { subjectColor } from '@/components/timetable-grid';

export const metadata: Metadata = { title: 'جدول الاختبارات' };

type Row = {
  id: number;
  exam_date: string;
  starts_at: string | null;
  exam_period: string | null;
  subject: { name: string } | null;
  teacher: { name_ar: string } | null;
  class: ClassRef;
};

export default async function ExamsPage({ searchParams }: { searchParams: Promise<{ class?: string; past?: string }> }) {
  await requireUser(['admin', 'teacher']);
  const sp = await searchParams;
  const options = await classOptions();
  const classId = Number(sp.class) || null;
  const showPast = sp.past === '1';

  const supabase = await createClient();
  let q = supabase
    .from('exam_schedule')
    .select(`id, exam_date, starts_at, exam_period, subject:subjects(name), teacher:employees(name_ar), class:classes(${CLASS_SELECT})`)
    .order('exam_date')
    .order('starts_at');
  if (classId) q = q.eq('class_id', classId);
  if (!showPast) q = q.gte('exam_date', todayISO());
  const { data, error } = await q.limit(500).returns<Row[]>();
  const rows = data ?? [];
  const days = [...new Set(rows.map((r) => r.exam_date))];

  return (
    <>
      <PageHeader title="جدول الاختبارات" lead={showPast ? 'كل الاختبارات المسجلة.' : 'الاختبارات القادمة مرتبة باليوم.'} />
      <FilterBar>
        <Select name="class" label="الفصل" value={classId} options={options} placeholder="كل الفصول" className="w-72" />
        <Select name="past" label="الفترة" value={sp.past ?? ''} options={[{ value: '1', label: 'الكل مع السابقة' }]} placeholder="القادمة فقط" />
      </FilterBar>
      <ErrorNote error={error} />
      {days.length === 0 ? (
        <Empty title={showPast ? 'لا اختبارات' : 'لا اختبارات قادمة'}>
          {!showPast && 'جرّب عرض الاختبارات السابقة من خانة الفترة.'}
        </Empty>
      ) : (
        <div className="space-y-6">
          {days.map((d) => (
            <section key={d} className="grid gap-3 md:grid-cols-[9rem_1fr]">
              <div className="md:pt-3">
                <p className="font-semibold">{fmtWeekday(d)}</p>
                <p className="text-sm text-muted">{fmtDate(d)}</p>
                <p className="text-xs text-muted">{fmtHijri(d)}</p>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {rows
                  .filter((r) => r.exam_date === d)
                  .map((r) => (
                    <li
                      key={r.id}
                      className="rounded-2xl border border-line bg-surface p-4 transition-transform duration-200 hover:-translate-y-0.5"
                      style={{ boxShadow: `inset -3px 0 0 ${subjectColor(r.subject?.name ?? '')}` }}
                    >
                      <p className="font-semibold">{r.subject?.name}</p>
                      <p className="text-sm text-muted">{classLabel(r.class, !classId)}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {r.exam_period && <Badge tone="board">{r.exam_period}</Badge>}
                        {r.starts_at && <Badge>{fmtTime(r.starts_at)}</Badge>}
                        {r.teacher && <Badge>{r.teacher.name_ar}</Badge>}
                      </div>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
