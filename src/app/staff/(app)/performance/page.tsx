import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAccess } from '@/lib/access/server';
import { perfBranches, perfList } from '@/lib/perf/actions';
import { STATUS_LABEL, VISIT_LABEL } from '@/lib/perf/shared';
import { fmtDate } from '@/lib/format';
import { Badge, Card, Empty, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'تقارير الأداء' };

const tone = (p: number | null) => (p == null ? 'neutral' : p >= 85 ? 'ok' : p >= 65 ? 'board' : p >= 50 ? 'gold' : 'danger') as 'neutral' | 'ok' | 'board' | 'gold' | 'danger';

export default async function PerformancePage() {
  await requireAccess('performance', 2);
  const [rows, branches] = await Promise.all([perfList(), perfBranches()]);
  const canWrite = branches.length > 0;
  const unread = rows.filter((r) => r.unread).length;
  return (
    <>
      <PageHeader
        title="تقارير الأداء"
        lead={canWrite ? 'اكتب تقرير متابعة لفرعك من النموذج الثابت، أرفق الصور والملفات، ثم أرسله لمدير الفروع داخل الموقع.' : 'التقارير المُرسَلة إليك عن فروعك المسندة، لتقرأها وتعتمدها وتردّ عليها.'}
        actions={canWrite ? <Link href="/staff/performance/new" className="btn-primary">تقرير جديد</Link> : undefined}
      />
      {unread > 0 && <p className="mb-3 rounded-xl bg-gold/15 px-4 py-2 text-sm font-medium text-brass">لديك {unread} تقرير جديد لم تقرأه</p>}
      {rows.length === 0 ? (
        <Empty title="لا تقارير بعد">{canWrite ? 'ابدأ بتقرير جديد لأحد فروعك.' : 'ستظهر هنا التقارير التي تُرسَل لفروعك.'}</Empty>
      ) : (
        <Card pad={false}>
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/staff/performance/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-board/5">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {r.branch}
                      {r.unread && <span className="ms-2 inline-block size-2 rounded-full bg-gold align-middle" aria-label="جديد" />}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">{VISIT_LABEL[r.visit_type]} · {fmtDate(r.visit_date)} · {r.mine ? 'أعددتَه أنت' : r.author}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={tone(r.overall_pct)}>{r.overall_pct == null ? '—' : `${r.overall_pct}%`}</Badge>
                    <Badge tone={r.status === 'acknowledged' ? 'ok' : r.status === 'sent' ? 'board' : 'neutral'}>{STATUS_LABEL[r.status]}</Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
