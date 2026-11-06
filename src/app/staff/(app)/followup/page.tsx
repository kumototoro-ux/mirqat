import type { Metadata } from 'next';
import Link from 'next/link';
import { getMyAccess } from '@/lib/access/server';
import { levelOf } from '@/lib/access/areas';
import { redirect } from 'next/navigation';
import { capBranches, getBranchGrading, getBranchTasks, pickBranch } from '@/lib/oversight/queries';
import { getCurrentTermId, getTerms } from '@/lib/data';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { Badge, Card, Empty, PageHeader, StatGrid, Tabs } from '@/components/ui';
import { BranchSwitch } from '@/components/oversight/branch-switch';
import { Pager, withParams } from '@/components/oversight/pager';

export const metadata: Metadata = { title: 'متابعة المهام والرصد' };

const STATUS: Record<string, { label: string; tone: 'ok' | 'board' | 'neutral' | 'gold' }> = {
  open: { label: 'مفتوحة', tone: 'ok' }, closed: { label: 'مغلقة', tone: 'neutral' }, draft: { label: 'مسودة', tone: 'gold' }, scheduled: { label: 'مجدولة', tone: 'board' },
};
const KIND = { task: 'مهمة', form: 'نموذج', manual: 'رصد يدوي' } as const;
const SIZE = 15;

type SP = { tab?: string; branch?: string; q?: string; kind?: string; status?: string; teacher?: string; term?: string; page?: string };

export default async function Followup({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const access = await getMyAccess();
  const canTasks = levelOf(access, 'tasks') >= 1;
  const canGrading = levelOf(access, 'grading') >= 1;
  if (!canTasks && !canGrading) redirect('/staff');
  const tab = sp.tab === 'grading' && canGrading ? 'grading' : canTasks ? 'tasks' : 'grading';
  const branches = await capBranches(tab === 'tasks' ? 'tasks' : 'grading');
  const branch = pickBranch(branches, sp.branch);
  const tabs = [
    ...(canTasks ? [{ key: 'tasks', label: 'المهام والنماذج', href: withParams('/staff/followup', { branch: branch?.id }) }] : []),
    ...(canGrading ? [{ key: 'grading', label: 'الرصد', href: withParams('/staff/followup', { tab: 'grading', branch: branch?.id }) }] : []),
  ];
  const head = (
    <PageHeader title="متابعة المهام والرصد" lead="ما ينشئه معلمو الفرع من مهام ونماذج، وما رصدوه من درجات. للعرض والمتابعة فقط." actions={branch ? <BranchSwitch branches={branches} value={branch.id} /> : undefined} />
  );
  if (!branch) return <>{head}<Empty title="لا فرع مسند لك">تظهر المتابعة لأصحاب المناصب في فروعهم المسندة.</Empty></>;
  const page = Math.max(1, Number(sp.page) || 1);

  if (tab === 'tasks') {
    const kind = sp.kind === 'task' || sp.kind === 'form' ? sp.kind : '';
    const status = ['open', 'closed', 'draft', 'scheduled'].includes(sp.status ?? '') ? sp.status! : '';
    const q = (sp.q ?? '').slice(0, 40);
    const teacher = /^\d+$/.test(sp.teacher ?? '') ? sp.teacher! : '';
    const d = await getBranchTasks({ branch: branch.id, q, kind, status, teacher, offset: (page - 1) * SIZE, limit: SIZE });
    const keep = { branch: branch.id, q, kind, status, teacher };
    return (
      <>
        {head}
        <Tabs items={tabs} active="tasks" />
        <StatGrid items={[
          { label: 'مهام', value: d.summary.tasks }, { label: 'نماذج', value: d.summary.forms },
          { label: 'مفتوحة الآن', value: d.summary.open }, { label: 'مسودات', value: d.summary.draft, tone: d.summary.draft ? 'gold' : undefined },
        ]} />
        <form className="my-4 flex flex-wrap items-center gap-2" action="/staff/followup">
          <input type="hidden" name="branch" value={branch.id} />
          <input name="q" defaultValue={q} placeholder="ابحث بعنوان المهمة" className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm sm:max-w-xs" />
          <select name="kind" defaultValue={kind} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm"><option value="">مهام ونماذج</option><option value="task">مهام</option><option value="form">نماذج</option></select>
          <select name="status" defaultValue={status} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm"><option value="">كل الحالات</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <select name="teacher" defaultValue={teacher} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm"><option value="">كل المعلمين</option>{d.teachers.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.n})</option>)}</select>
          <button className="btn-primary">تصفية</button>
        </form>
        {d.rows.length === 0 ? <Empty title="لا مهام مطابقة">لم يُنشئ معلمو الفرع شيئًا بهذه التصفية.</Empty> : (
          <Card pad={false}>
            <ul className="divide-y divide-line">
              {d.rows.map((r) => {
                const st = STATUS[r.status];
                const done = r.class_size ? Math.round((r.submitted / r.class_size) * 100) : 0;
                return (
                  <li key={r.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{r.title}</p>
                        <p className="mt-0.5 text-xs text-muted">{KIND[r.kind]} · {r.subject} · {r.grade} / {r.section} · {r.teacher ?? '—'}{r.due_at ? ` · التسليم ${fmtDate(r.due_at)}` : ''}</p>
                      </div>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-paper"><span className="block h-full rounded-full bg-board" style={{ width: `${Math.min(100, done)}%` }} /></span>
                        <span className="tabular-nums">سلّم {r.submitted} من {r.class_size}</span>
                      </span>
                      <span className="tabular-nums">رُصد {r.graded}</span>
                      {r.avg_pct != null && <span className="tabular-nums">المتوسط {r.avg_pct}%</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
        <Pager total={d.total} page={page} size={SIZE} href={(n) => withParams('/staff/followup', { ...keep, page: n })} />
      </>
    );
  }

  const terms = await getTerms();
  const termId = sp.term === 'all' ? null : Number(sp.term) || (await getCurrentTermId());
  const d = await getBranchGrading({ branch: branch.id, term: termId, offset: (page - 1) * SIZE, limit: SIZE });
  const keep = { tab: 'grading', branch: branch.id, term: sp.term };
  return (
    <>
      {head}
      <Tabs items={tabs} active="grading" />
      <form className="mb-4 flex items-center gap-2" action="/staff/followup">
        <input type="hidden" name="tab" value="grading" /><input type="hidden" name="branch" value={branch.id} />
        <select name="term" defaultValue={termId ?? 'all'} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">
          <option value="all">كل الفصول الدراسية</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button className="btn-primary">عرض</button>
      </form>
      <StatGrid items={[
        { label: 'تقييمات الفرع', value: d.summary.assessments }, { label: 'رُصدت درجاتها', value: d.summary.graded },
        { label: 'متأخرة بلا رصد', value: d.summary.overdue_ungraded, tone: d.summary.overdue_ungraded ? 'danger' : undefined },
        { label: 'معلمون', value: d.teachers.length },
      ]} />
      <h2 className="mb-2 mt-6 text-base font-bold">المعلمون</h2>
      {d.teachers.length === 0 ? <Empty title="لا بيانات رصد">لا تقييمات في هذا الفصل لمعلمي الفرع.</Empty> : (
        <Card pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-xs text-muted"><th className="px-4 py-2.5 text-start font-semibold">المعلم</th><th className="px-3 text-start font-semibold">التقييمات</th><th className="px-3 text-start font-semibold">رُصد</th><th className="px-3 text-start font-semibold">متأخر بلا رصد</th><th className="px-3 text-start font-semibold">متوسط الدرجات</th><th className="px-3 text-start font-semibold">آخر رصد</th></tr></thead>
              <tbody className="divide-y divide-line tabular-nums">
                {d.teachers.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2.5 font-medium">{t.name}</td><td className="px-3">{t.assessments}</td><td className="px-3">{t.graded}</td>
                    <td className="px-3">{t.ungraded_overdue ? <Badge tone="danger">{t.ungraded_overdue}</Badge> : <span className="text-muted">0</span>}</td>
                    <td className="px-3">{t.avg_pct != null ? `${t.avg_pct}%` : '—'}</td><td className="px-3 text-xs text-muted">{t.last_recorded ? fmtDateTime(t.last_recorded) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <h2 className="mb-2 mt-8 text-base font-bold">آخر ما رُصد</h2>
      {d.rows.length === 0 ? <Empty title="لا رصد بعد">لم تُرصد درجات في هذا الفصل.</Empty> : (
        <Card pad={false}>
          <ul className="divide-y divide-line">
            {d.rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="font-semibold">{r.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{KIND[r.kind]} · {r.subject} · {r.grade} / {r.section} · {r.teacher ?? '—'}</p>
                </div>
                <div className="flex items-center gap-2 text-xs tabular-nums text-muted">
                  <Badge tone="board">{r.graded} طالبًا</Badge>
                  {r.avg_pct != null && <Badge tone="neutral">{r.avg_pct}%</Badge>}
                  <time>{r.last_recorded ? fmtDate(r.last_recorded) : ''}</time>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Pager total={d.total} page={page} size={SIZE} href={(n) => withParams('/staff/followup', { ...keep, page: n })} />
    </>
  );
}
