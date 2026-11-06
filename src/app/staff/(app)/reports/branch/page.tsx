import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAccess } from '@/lib/access/server';
import { capBranches, getBranchReport, pickBranch } from '@/lib/oversight/queries';
import { getSchoolName } from '@/lib/data';
import { fmtDateTime, fmtHijri } from '@/lib/format';
import { monthName } from '@/lib/reports';
import { LogoMark } from '@/components/home/logo-mark';
import { Empty } from '@/components/ui';
import { GroupedBars, MiniDonut, PrintButton } from '@/components/reports/report-charts';
import { BranchSwitch } from '@/components/oversight/branch-switch';

export const metadata: Metadata = { title: 'تقرير الفرع' };

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function Kpis({ items }: { items: { label: string; value: React.ReactNode; sub?: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-4">
      {items.map((k) => (
        <div key={k.label} className="bg-surface px-4 py-4">
          <dt className="text-xs font-medium text-muted">{k.label}</dt>
          <dd className="mt-1.5 text-[1.7rem] font-bold leading-none tabular-nums">{k.value}</dd>
          {k.sub && <dd className="mt-1.5 text-xs text-muted">{k.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid border-t border-line px-6 py-7 sm:px-10">
      <h2 className="flex items-center gap-3 text-lg font-bold">
        <span className="grid size-7 place-items-center rounded-lg bg-board text-sm text-chalk">{n}</span>
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default async function BranchReportPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  await requireAccess('reports', 1);
  const sp = await searchParams;
  const branches = await capBranches('reports');
  const branch = pickBranch(branches, sp.branch);
  if (!branch) return <Empty title="لا فرع مسند لك">يظهر تقرير الفرع لأصحاب المناصب في فروعهم المسندة.</Empty>;
  const [school, r] = await Promise.all([getSchoolName(), getBranchReport(branch.id)]);
  const s = r.students;
  const st = r.accounts.by_role.find((x) => x.role === 'student');
  const tc = r.accounts.by_role.find((x) => x.role === 'teacher');

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/staff/reports" className="text-sm text-muted hover:text-accent">← التقارير</Link>
          <BranchSwitch branches={branches} value={branch.id} />
        </div>
        <PrintButton />
      </div>
      <article className="overflow-hidden rounded-[1.6rem] border border-line bg-surface shadow-[0_30px_60px_-40px_rgb(31_42_36/0.35)] print:rounded-none print:border-0 print:shadow-none">
        <header className="relative overflow-hidden bg-board px-6 py-7 text-chalk sm:px-10 print:bg-board">
          <div aria-hidden className="absolute -end-16 -top-16 size-56 rounded-full bg-gold/20 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-chalk/10 ring-1 ring-chalk/20"><LogoMark className="h-7 w-8" tone="light" /></span>
              <div>
                <p className="text-sm text-chalk/70">{school}</p>
                <h1 className="text-2xl font-bold sm:text-[1.75rem]">تقرير فرع {r.branch}</h1>
              </div>
            </div>
            <div className="text-end text-sm text-chalk/75"><p>أُنشئ: {fmtDateTime(r.generated_at)}</p><p>{fmtHijri(r.generated_at)}</p></div>
          </div>
        </header>

        <Section n={1} title="الطلاب">
          <Kpis items={[
            { label: 'منتظمون', value: s.active, sub: `من ${s.all} سجل · استمرار ${pct(s.active, s.all)}%` },
            { label: 'منسحبون', value: s.withdrawn },
            { label: 'متخرجون', value: s.graduated },
            { label: 'سُجّلوا هذا الشهر', value: s.new_this_month },
          ]} />
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted">المنتظمون حسب الصف</h3>
              {s.by_grade.length ? (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-line">
                    {s.by_grade.map((g) => (
                      <tr key={g.name}>
                        <td className="py-2">{g.name}</td>
                        <td className="w-1/2 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper"><div className="h-full rounded-full bg-board" style={{ width: `${pct(g.active, s.active)}%` }} /></div>
                            <span className="w-8 text-end tabular-nums">{g.active}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-sm text-muted">لا طلاب منتظمون.</p>}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted">التوزيع حسب الجنس</h3>
              <MiniDonut items={s.by_gender.map((g) => ({ name: g.name, value: g.count }))} />
            </div>
          </div>
          <h3 className="mb-2 mt-6 text-sm font-semibold text-muted">التسجيل خلال ستة أشهر</h3>
          <GroupedBars data={s.monthly.map((m) => ({ label: monthName(m.month), enrolled: m.enrolled }))} series={[{ key: 'enrolled', label: 'تسجيل جديد', color: 'var(--color-accent)' }]} height={220} />
        </Section>

        <Section n={2} title="المعلمون">
          <Kpis items={[
            { label: 'معلمون نشطون', value: r.employees.teachers },
            { label: 'حصص أسبوعية', value: r.employees.weekly_periods },
            { label: 'بلا مواد في نطاقهم', value: r.employees.no_subject, sub: r.employees.no_subject ? 'يحتاجون ضبط النطاق' : 'لا نواقص' },
            { label: 'غير نشطين', value: r.employees.inactive },
          ]} />
        </Section>

        <Section n={3} title="الحسابات">
          <Kpis items={[
            { label: 'طلاب بلا حساب', value: r.accounts.students_without, sub: r.accounts.students_without ? 'يحتاجون إنشاء حساب' : 'مكتمل' },
            { label: 'معلمون بلا حساب', value: r.accounts.teachers_without },
            { label: 'طلاب فعّلوا حسابهم', value: st ? `${pct(st.activated, st.all)}%` : '—', sub: st ? `${st.temp} ما زالوا بكلمة مؤقتة` : undefined },
            { label: 'معلمون فعّلوا حسابهم', value: tc ? `${pct(tc.activated, tc.all)}%` : '—', sub: tc ? `${tc.temp} ما زالوا بكلمة مؤقتة` : undefined },
          ]} />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-start text-xs text-muted"><th className="py-2 text-start font-semibold">الفئة</th><th className="text-start font-semibold">الحسابات</th><th className="text-start font-semibold">دخلوا آخر 7 أيام</th><th className="text-start font-semibold">لم يدخلوا أبدًا</th><th className="text-start font-semibold">موقوفة</th></tr></thead>
              <tbody className="divide-y divide-line tabular-nums">
                {[{ n: 'الطلاب', x: st }, { n: 'المعلمون', x: tc }].map(({ n, x }) => (
                  <tr key={n}><td className="py-2 font-medium">{n}</td><td>{x?.all ?? 0}</td><td>{x?.login_7d ?? 0}</td><td>{x?.never ?? 0}</td><td>{x?.disabled ?? 0}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <footer className="border-t border-line bg-paper/60 px-6 py-4 text-center text-xs text-muted sm:px-10">
          تقرير آلي من منصة مِرقاة لفرع {r.branch} — الأرقام محسوبة لحظة إنشائه من قاعدة البيانات مباشرة.
        </footer>
      </article>
    </div>
  );
}
