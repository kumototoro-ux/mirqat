import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Badge, Empty, ErrorNote, FilterBar, PageHeader, PreviewNote, Select, StatGrid, Table, Td } from '@/components/ui';
import { CLASS_SELECT, DAYS, classLabel, fmtDateTime, fmtNum, type ClassRef } from '@/lib/format';
import { classOptions, getCurrentWeek } from '@/lib/data';

export const metadata: Metadata = { title: 'التحضير' };

type Row = {
  id: number;
  day_of_week: number;
  period_no: number;
  note: string | null;
  recorded_at: string;
  student: { name_ar: string; code: string; class: ClassRef } | null;
  week: { week_label: string | null } | null;
  subject: { name: string } | null;
  status: { name: string } | null;
};

function statusTone(name = ''): 'ok' | 'danger' | 'gold' | 'neutral' {
  if (/حاضر|حضور/.test(name)) return 'ok';
  if (/غائب|غياب/.test(name)) return 'danger';
  if (/متأخر|تأخر|استئذان|عذر/.test(name)) return 'gold';
  return 'neutral';
}

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ class?: string; week?: string; status?: string }> }) {
  await requireUser(['admin', 'teacher']);
  const sp = await searchParams;
  const supabase = await createClient();
  const current = await getCurrentWeek();
  const [classes, weeksRes, statusesRes] = await Promise.all([
    classOptions(),
    supabase.from('school_weeks').select('week_id, week_label, week_no, starts_on').order('starts_on', { ascending: false }).limit(60),
    supabase.from('attendance_statuses').select('id, name').order('sort_order'),
  ]);
  const classId = Number(sp.class) || null;
  const weekId = sp.week === 'all' ? null : Number(sp.week) || current?.week_id || null;
  const statusId = Number(sp.status) || null;

  let q = supabase
    .from('attendance_records')
    .select(
      `id, day_of_week, period_no, note, recorded_at,
       student:students!inner(name_ar, code, class_id, class:classes(${CLASS_SELECT})),
       week:calendar_entries(week_label), subject:subjects(name), status:attendance_statuses(name)`,
      { count: 'exact' },
    )
    .order('recorded_at', { ascending: false })
    .limit(200);
  if (classId) q = q.eq('student.class_id', classId);
  if (weekId) q = q.eq('week_id', weekId);
  if (statusId) q = q.eq('status_id', statusId);
  const { data, error, count } = await q.returns<Row[]>();
  const rows = data ?? [];

  const byStatus = new Map<string, number>();
  rows.forEach((r) => byStatus.set(r.status?.name ?? '—', (byStatus.get(r.status?.name ?? '—') ?? 0) + 1));

  return (
    <>
      <PageHeader title="التحضير" lead="سجلات الحضور والغياب لكل حصة." />
      <PreviewNote>هذه الصفحة للعرض الآن. شاشة التحضير السريع للحصة (طالبًا طالبًا بضغطة) تأتي في مرحلة الرصد والتحضير.</PreviewNote>
      <FilterBar>
        <Select name="class" label="الفصل" value={classId} options={classes} placeholder="كل الفصول" className="w-60" />
        <Select
          name="week"
          label="الأسبوع"
          value={sp.week === 'all' ? 'all' : weekId}
          options={[{ value: 'all', label: 'كل الأسابيع' }, ...(weeksRes.data ?? []).map((w) => ({ value: w.week_id, label: w.week_label ?? `الأسبوع ${w.week_no}` }))]}
          className="w-52"
        />
        <Select name="status" label="الحالة" value={statusId} options={(statusesRes.data ?? []).map((s) => ({ value: s.id, label: s.name }))} placeholder="كل الحالات" className="w-40" />
      </FilterBar>
      <ErrorNote error={error} />
      {rows.length > 0 && (
        <div className="mb-5">
          <StatGrid
            items={[
              { label: 'السجلات', value: fmtNum(count ?? rows.length) },
              ...[...byStatus.entries()].slice(0, 3).map(([name, n]) => ({
                label: name,
                value: fmtNum(n),
                tone: statusTone(name) === 'danger' ? ('danger' as const) : statusTone(name) === 'gold' ? ('gold' as const) : ('board' as const),
              })),
            ]}
          />
        </div>
      )}
      {rows.length === 0 ? (
        <Empty title="لا سجلات تحضير مطابقة">جرّب اختيار "كل الأسابيع".</Empty>
      ) : (
        <Table head={['الطالب', 'الفصل', 'الأسبوع', 'اليوم والحصة', 'المادة', 'الحالة', 'سُجّل']} minWidth={880}>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td>
                <p className="font-medium">{r.student?.name_ar}</p>
                <p className="text-xs text-muted"><bdi>{r.student?.code}</bdi></p>
              </Td>
              <Td className="whitespace-nowrap">{classLabel(r.student?.class ?? null, true)}</Td>
              <Td className="whitespace-nowrap text-muted">{r.week?.week_label ?? '—'}</Td>
              <Td className="whitespace-nowrap">{DAYS[r.day_of_week]} · الحصة {r.period_no}</Td>
              <Td className="whitespace-nowrap">{r.subject?.name ?? '—'}</Td>
              <Td>
                <Badge tone={statusTone(r.status?.name)}>{r.status?.name ?? '—'}</Badge>
                {r.note && <p className="mt-1 max-w-40 truncate text-xs text-muted">{r.note}</p>}
              </Td>
              <Td className="whitespace-nowrap text-xs text-muted">{fmtDateTime(r.recorded_at)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
