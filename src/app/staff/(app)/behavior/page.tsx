import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Badge, Empty, ErrorNote, FilterBar, PageHeader, PreviewNote, Select, Table, Td } from '@/components/ui';
import { CLASS_SELECT, DAYS, classLabel, fmtDateTime, fmtNum, type ClassRef } from '@/lib/format';
import { classOptions } from '@/lib/data';

export const metadata: Metadata = { title: 'السلوك' };

type Row = {
  id: number;
  day_of_week: number | null;
  score: number | null;
  note: string | null;
  recorded_at: string;
  student: { name_ar: string; code: string; class: ClassRef } | null;
  week: { week_label: string | null } | null;
  status: { name: string } | null;
};

export default async function BehaviorPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  await requireUser(['admin']);
  const sp = await searchParams;
  const classId = Number(sp.class) || null;
  const supabase = await createClient();
  let q = supabase
    .from('behavior_records')
    .select(
      `id, day_of_week, score, note, recorded_at,
       student:students!inner(name_ar, code, class_id, class:classes(${CLASS_SELECT})),
       week:calendar_entries(week_label), status:behavior_statuses(name)`,
      { count: 'exact' },
    )
    .order('recorded_at', { ascending: false })
    .limit(200);
  if (classId) q = q.eq('student.class_id', classId);
  const [{ data, error, count }, classes] = await Promise.all([q.returns<Row[]>(), classOptions()]);
  const rows = data ?? [];

  return (
    <>
      <PageHeader title="السلوك" lead={`${fmtNum(count ?? 0)} ملاحظة سلوكية.`} />
      <PreviewNote>للعرض الآن. تسجيل السلوك يأتي بعد الإطلاق كما في الخطة.</PreviewNote>
      <FilterBar>
        <Select name="class" label="الفصل" value={classId} options={classes} placeholder="كل الفصول" className="w-64" />
      </FilterBar>
      <ErrorNote error={error} />
      {rows.length === 0 ? (
        <Empty title="لا ملاحظات سلوكية" />
      ) : (
        <Table head={['الطالب', 'الفصل', 'الأسبوع واليوم', 'الحالة', 'الدرجة', 'ملاحظة', 'سُجّل']} minWidth={860}>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td><p className="font-medium">{r.student?.name_ar}</p><p className="text-xs text-muted"><bdi>{r.student?.code}</bdi></p></Td>
              <Td className="whitespace-nowrap">{classLabel(r.student?.class ?? null)}</Td>
              <Td className="whitespace-nowrap text-muted">{r.week?.week_label ?? '—'}{r.day_of_week != null ? ` · ${DAYS[r.day_of_week]}` : ''}</Td>
              <Td>{r.status ? <Badge tone="board">{r.status.name}</Badge> : '—'}</Td>
              <Td className="tabular-nums">{r.score != null ? fmtNum(r.score, 2) : '—'}</Td>
              <Td className="max-w-56 truncate text-muted">{r.note ?? '—'}</Td>
              <Td className="whitespace-nowrap text-xs text-muted">{fmtDateTime(r.recorded_at)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
