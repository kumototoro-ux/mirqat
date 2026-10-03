import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Badge, Empty, ErrorNote, FilterBar, PageHeader, SearchInput, Select, Table, Td } from '@/components/ui';
import { fmtDateTime, fmtNum } from '@/lib/format';

export const metadata: Metadata = { title: 'سجل النشاط' };

const TABLES: Record<string, string> = {
  students: 'الطلاب', employees: 'الموظفون', profiles: 'الحسابات', assessments: 'المهام والنماذج',
  grade_entries: 'الرصد', attendance_records: 'التحضير', behavior_records: 'السلوك', staff_scope: 'النطاقات',
  timetable_slots: 'جدول الحصص', exam_schedule: 'الاختبارات', calendar_entries: 'التقويم', app_settings: 'الإعدادات',
  form_details: 'النماذج', form_questions: 'أسئلة النماذج', content_items: 'المحتوى',
};
const OPS: Record<string, { label: string; tone: 'ok' | 'gold' | 'danger' }> = {
  INSERT: { label: 'إضافة', tone: 'ok' },
  UPDATE: { label: 'تعديل', tone: 'gold' },
  DELETE: { label: 'حذف', tone: 'danger' },
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; table?: string }> }) {
  await requireUser(['admin']);
  const sp = await searchParams;
  const q = (sp.q ?? '').replace(/[,()*%\\"]/g, ' ').trim().slice(0, 60);
  const supabase = await createClient();
  let query = supabase
    .from('audit_log')
    .select('id, occurred_at, actor_name, actor_code, actor_role, action, table_name, record_id, details', { count: 'exact' })
    .order('occurred_at', { ascending: false })
    .limit(200);
  if (sp.table) query = query.eq('table_name', sp.table);
  if (q) query = query.or(`actor_name.ilike.%${q}%,action.ilike.%${q}%,details.ilike.%${q}%`);
  const { data, error, count } = await query;
  const rows = data ?? [];

  return (
    <>
      <PageHeader title="سجل النشاط" lead={`${fmtNum(count ?? 0)} حركة: كل إضافة وتعديل وحذف ودخول موظف.`} />
      <FilterBar>
        <SearchInput value={q} placeholder="الشخص أو الحركة أو التفاصيل" className="w-64" />
        <Select name="table" label="القسم" value={sp.table} options={Object.entries(TABLES).map(([v, l]) => ({ value: v, label: l }))} placeholder="كل الأقسام" />
      </FilterBar>
      <ErrorNote error={error} />
      {rows.length === 0 ? (
        <Empty title="لا حركات مطابقة" />
      ) : (
        <Table head={['الوقت', 'الشخص', 'الحركة', 'القسم', 'التفاصيل']} minWidth={860}>
          {rows.map((r) => {
            const op = OPS[r.action];
            return (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-xs text-muted">{fmtDateTime(r.occurred_at)}</Td>
                <Td>
                  <p className="font-medium">{r.actor_name ?? 'النظام'}</p>
                  {r.actor_code && <p className="text-xs text-muted"><bdi>{r.actor_code}</bdi></p>}
                </Td>
                <Td>{op ? <Badge tone={op.tone}>{op.label}</Badge> : <Badge tone="board">{r.action}</Badge>}</Td>
                <Td className="whitespace-nowrap">{r.table_name ? (TABLES[r.table_name] ?? r.table_name) : '—'}</Td>
                <Td className="max-w-md truncate text-muted" >{r.details ?? (r.record_id ? `#${r.record_id}` : '—')}</Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
