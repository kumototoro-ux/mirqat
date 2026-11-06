import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAccess } from '@/lib/access/server';
import { capBranches, getBranchAudit, pickBranch } from '@/lib/oversight/queries';
import { TABLES } from '@/lib/track/labels';
import { fmtDateTime } from '@/lib/format';
import { Badge, Card, Empty, PageHeader } from '@/components/ui';
import { BranchSwitch } from '@/components/oversight/branch-switch';
import { Pager, withParams } from '@/components/oversight/pager';

export const metadata: Metadata = { title: 'نشاط الفرع' };

const OPS: Record<string, { label: string; tone: 'ok' | 'gold' | 'danger' }> = {
  INSERT: { label: 'إضافة', tone: 'ok' }, UPDATE: { label: 'تعديل', tone: 'gold' }, DELETE: { label: 'حذف', tone: 'danger' },
};
const SHOWN = ['students', 'employees', 'attendance_records', 'behavior_records', 'assessments', 'grade_entries', 'timetable_slots', 'exam_schedule', 'classes', 'staff_scope', 'content_items'];
const SIZE = 20;

export default async function BranchActivity({ searchParams }: { searchParams: Promise<{ branch?: string; q?: string; table?: string; page?: string }> }) {
  await requireAccess('audit', 1);
  const sp = await searchParams;
  const branches = await capBranches('audit');
  const branch = pickBranch(branches, sp.branch);
  if (!branch) return <Empty title="لا فرع مسند لك">يظهر سجل النشاط لمدير الفرع ومدير الفروع في فروعهم المسندة.</Empty>;
  const q = (sp.q ?? '').slice(0, 40);
  const table = SHOWN.includes(sp.table ?? '') ? sp.table! : '';
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await getBranchAudit(branch.id, q, table, (page - 1) * SIZE, SIZE);
  const keep = { branch: branch.id, q, table };

  return (
    <>
      <PageHeader title="نشاط الفرع" lead="كل إضافة وتعديل وحذف على بيانات الفرع خلال آخر 90 يومًا: من فعل ماذا ومتى. للعرض فقط." actions={<BranchSwitch branches={branches} value={branch.id} />} />
      <form className="mb-4 flex flex-wrap items-center gap-2" action="/staff/branch-activity">
        <input type="hidden" name="branch" value={branch.id} />
        <input name="q" defaultValue={q} placeholder="ابحث باسم الموظف أو الوصف" className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-board/30 sm:max-w-xs" />
        <select name="table" defaultValue={table} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">
          <option value="">كل الأقسام</option>
          {SHOWN.map((t) => <option key={t} value={t}>{TABLES[t] ?? t}</option>)}
        </select>
        <button className="btn-primary">تصفية</button>
        {(q || table) && <Link href={withParams('/staff/branch-activity', { branch: branch.id })} className="text-sm text-muted underline">مسح</Link>}
      </form>
      {data.rows.length === 0 ? (
        <Empty title="لا نشاط مطابق">لم يُسجَّل شيء بهذه التصفية في آخر 90 يومًا.</Empty>
      ) : (
        <Card pad={false}>
          <ul className="divide-y divide-line">
            {data.rows.map((r) => {
              const op = OPS[r.action];
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{r.actor_name ?? 'النظام'}{r.actor_code && <span className="ms-2 text-xs font-normal text-muted" dir="ltr">{r.actor_code}</span>}</p>
                    <p className="mt-0.5 text-xs text-muted">{TABLES[r.table_name ?? ''] ?? r.table_name}{r.details ? ` · ${r.details}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {op && <Badge tone={op.tone}>{op.label}</Badge>}
                    <time className="text-xs tabular-nums text-muted">{fmtDateTime(r.occurred_at)}</time>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <Pager total={data.total} page={page} size={SIZE} href={(n) => withParams('/staff/branch-activity', { ...keep, page: n })} />
    </>
  );
}
