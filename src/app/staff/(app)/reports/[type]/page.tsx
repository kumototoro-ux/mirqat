import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getSchoolName } from '@/lib/data';
import { fmtDateTime, fmtHijri } from '@/lib/format';
import {
  getAccountsReport,
  getActivityReport,
  getEmployeesReport,
  getStudentsReport,
  monthName,
  type AccountsReport,
  type ActivityReport,
  type EmployeesReport,
  type StudentsReport,
} from '@/lib/reports';
import { LogoMark } from '@/components/home/logo-mark';
import { GroupedBars, MiniDonut, PrintButton } from '@/components/reports/report-charts';

const TITLES = { students: 'تقرير الطلاب', employees: 'تقرير الموظفين', accounts: 'تقرير الحسابات', activity: 'تقرير النشاط' } as const;
type Kind = keyof typeof TITLES;

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }): Promise<Metadata> {
  const { type } = await params;
  return { title: TITLES[type as Kind] ?? 'تقرير' };
}

/* ---------------------------------------------------------------------
   عناصر مشتركة
--------------------------------------------------------------------- */
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function Change({ now, before, upIsGood = true }: { now: number; before: number; upIsGood?: boolean }) {
  if (!now && !before) return <span className="text-muted">—</span>;
  const p = before ? Math.round(((now - before) / before) * 100) : 100;
  const good = (now >= before) === upIsGood;
  return (
    <span dir="ltr" className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${now === before ? 'bg-paper text-muted' : good ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger'}`}>
      {now === before ? '0%' : `${p > 0 ? '+' : ''}${p}%`}
    </span>
  );
}

function Section({ n, title, lead, children }: { n: number; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid border-t border-line px-6 py-7 sm:px-10">
      <h2 className="flex items-center gap-3 text-lg font-bold">
        <span className="grid size-7 place-items-center rounded-lg bg-board text-sm text-chalk">{n}</span>
        {title}
      </h2>
      {lead && <p className="mt-1 text-sm text-muted">{lead}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

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

function Findings({ items }: { items: string[] }) {
  return (
    <ul className="mt-5 grid gap-2 sm:grid-cols-2">
      {items.map((t) => (
        <li key={t} className="flex gap-2.5 rounded-xl bg-paper px-3.5 py-3 text-sm leading-relaxed">
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold" />
          {t}
        </li>
      ))}
    </ul>
  );
}

function ShareBar({ value, total }: { value: number; total: number }) {
  const p = pct(value, total);
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper">
        <div className="h-full rounded-full bg-board" style={{ width: `${p}%` }} />
      </div>
      <span className="w-9 text-end text-xs tabular-nums text-muted">{p}%</span>
    </div>
  );
}

const th = 'px-3 py-2.5 text-start text-xs font-semibold text-muted whitespace-nowrap';
const td = 'px-3 py-2.5 tabular-nums';

/* ---------------------------------------------------------------------
   الصفحة
--------------------------------------------------------------------- */
export default async function ReportPage({ params }: { params: Promise<{ type: string }> }) {
  await requireUser(['admin']);
  const { type } = await params;
  if (!(type in TITLES)) notFound();
  const kind = type as Kind;
  const [school, data] = await Promise.all([
    getSchoolName(),
    kind === 'students' ? getStudentsReport() : kind === 'employees' ? getEmployeesReport() : kind === 'activity' ? getActivityReport() : getAccountsReport(),
  ]);
  const back = { students: '/staff/students', employees: '/staff/employees', accounts: '/staff/student-accounts', activity: '/staff/audit' }[kind];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Link href={back} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-board">
          <svg viewBox="0 0 16 16" className="size-4"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          رجوع
        </Link>
        <PrintButton />
      </div>

      <article className="overflow-hidden rounded-[1.6rem] border border-line bg-surface shadow-[0_30px_60px_-40px_rgb(31_42_36/0.35)] print:rounded-none print:border-0 print:shadow-none">
        {/* الترويسة */}
        <header className="relative overflow-hidden bg-board px-6 py-7 text-chalk sm:px-10 print:bg-board">
          <div aria-hidden className="absolute -end-16 -top-16 size-56 rounded-full bg-gold/20 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-chalk/10 ring-1 ring-chalk/20">
                <LogoMark className="h-7 w-8" tone="light" />
              </span>
              <div>
                <p className="text-sm text-chalk/70">{school}</p>
                <h1 className="text-2xl font-bold sm:text-[1.75rem]">{TITLES[kind]}</h1>
              </div>
            </div>
            <div className="text-end text-sm text-chalk/75">
              <p>أُنشئ: {fmtDateTime(data.generated_at)}</p>
              <p>{fmtHijri(data.generated_at)}</p>
            </div>
          </div>
        </header>

        {kind === 'students' && <Students r={data as StudentsReport} />}
        {kind === 'employees' && <Employees r={data as EmployeesReport} />}
        {kind === 'accounts' && <Accounts r={data as AccountsReport} />}
        {kind === 'activity' && <Activity r={data as ActivityReport} />}

        <footer className="border-t border-line bg-paper/60 px-6 py-4 text-center text-xs text-muted sm:px-10">
          تقرير آلي من منصة مِرقاة — الأرقام محسوبة لحظة إنشائه من قاعدة البيانات مباشرة.
        </footer>
      </article>
    </div>
  );
}

/* ---------------------------------------------------------------------
   تقرير الطلاب
--------------------------------------------------------------------- */
function Students({ r }: { r: StudentsReport }) {
  const t = r.totals;
  const branches = [...r.by_branch].sort((a, b) => b.active - a.active);
  const top = branches[0];
  const grow = t.new_this_month - t.new_last_month;
  const findings = [
    `يدرس حاليًا ${t.active} طالبًا منتظمًا من أصل ${t.all} سجل، بنسبة استمرار ${pct(t.active, t.all)}%.`,
    t.new_last_month || t.new_this_month
      ? `سُجّل هذا الشهر ${t.new_this_month} طالبًا مقابل ${t.new_last_month} الشهر الماضي (${grow >= 0 ? 'زيادة' : 'انخفاض'} ${Math.abs(grow)}).`
      : 'لم يُسجَّل طلاب جدد في الشهرين الأخيرين.',
    t.withdrawn_this_month
      ? `انسحب ${t.withdrawn_this_month} طالبًا هذا الشهر مقابل ${t.withdrawn_last_month} الشهر الماضي.`
      : 'لا انسحابات مسجلة هذا الشهر.',
    top ? `أكبر الفروع "${top.name}" بـ ${top.active} طالبًا (${pct(top.active, t.active)}% من المنتظمين).` : 'لا فروع بعد.',
  ];
  if (t.before_system) findings.push(`${t.before_system} سجلًا نُقل من النظام القديم بلا تاريخ تسجيل، فلا يدخل في مقارنات الأشهر.`);

  return (
    <>
      <div className="px-6 py-7 sm:px-10">
        <Kpis
          items={[
            { label: 'إجمالي السجلات', value: t.all },
            { label: 'منتظمون', value: t.active, sub: `${pct(t.active, t.all)}% من الإجمالي` },
            { label: 'جدد هذا الشهر', value: t.new_this_month, sub: <Change now={t.new_this_month} before={t.new_last_month} /> },
            { label: 'انسحبوا هذا الشهر', value: t.withdrawn_this_month, sub: <Change now={t.withdrawn_this_month} before={t.withdrawn_last_month} upIsGood={false} /> },
          ]}
        />
        <Findings items={findings} />
      </div>

      <Section n={1} title="الطلاب حسب الفرع" lead="الحصة محسوبة من مجموع الطلاب المنتظمين، والتغير مقارنة بتسجيلات الشهر الماضي.">
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-paper/70">
              <tr>{['الفرع', 'الإجمالي', 'منتظم', 'منسحب', 'متخرج', 'جدد الشهر', 'التغير', 'الحصة'].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {branches.map((b) => (
                <tr key={b.name}>
                  <td className="px-3 py-2.5 font-semibold">{b.name}</td>
                  <td className={td}>{b.all}</td>
                  <td className={`${td} font-semibold text-ok`}>{b.active}</td>
                  <td className={`${td} ${b.withdrawn ? 'text-danger' : ''}`}>{b.withdrawn}</td>
                  <td className={td}>{b.graduated}</td>
                  <td className={td}>{b.new_this_month}</td>
                  <td className={td}><Change now={b.new_this_month} before={b.new_last_month} /></td>
                  <td className="w-40 px-3 py-2.5"><ShareBar value={b.active} total={t.active} /></td>
                </tr>
              ))}
              <tr className="bg-paper/60 font-bold">
                <td className="px-3 py-2.5">الإجمالي</td>
                <td className={td}>{t.all}</td>
                <td className={td}>{t.active}</td>
                <td className={td}>{t.withdrawn}</td>
                <td className={td}>{t.graduated}</td>
                <td className={td}>{t.new_this_month}</td>
                <td className={td}><Change now={t.new_this_month} before={t.new_last_month} /></td>
                <td className="px-3 py-2.5" />
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section n={2} title="الحركة خلال آخر ستة أشهر" lead="التسجيلات الجديدة مقابل الانسحابات (من سجل النشاط) لكل شهر.">
        <GroupedBars
          data={r.monthly.map((m) => ({ label: monthName(m.month), enrolled: m.enrolled, withdrawn: m.withdrawn }))}
          series={[
            { key: 'enrolled', label: 'تسجيل جديد', color: '#356854' },
            { key: 'withdrawn', label: 'انسحاب', color: '#d9a441' },
          ]}
        />
      </Section>

      <Section n={3} title="التوزيعات" lead="للطلاب المنتظمين.">
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <h3 className="mb-3 text-sm font-semibold">الحالة (كل السجلات)</h3>
            <MiniDonut items={[{ name: 'منتظم', value: t.active }, { name: 'منسحب', value: t.withdrawn }, { name: 'متخرج', value: t.graduated }].filter((x) => x.value)} />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold">الجنس</h3>
            <MiniDonut items={r.by_gender.map((g) => ({ name: g.name, value: g.count }))} />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold">الرسوم</h3>
            <MiniDonut items={r.by_fee.map((g) => ({ name: g.name, value: g.count }))} />
          </div>
        </div>
      </Section>

      <Section n={4} title="الطلاب حسب الصف" lead="نسبة الاستمرار = المنتظمون ÷ (المنتظمون + المنسحبون).">
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-paper/70"><tr>{['الصف', 'منتظم', 'منسحب', 'نسبة الاستمرار'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {r.by_grade.map((g) => (
                <tr key={g.name}>
                  <td className="px-3 py-2.5 font-semibold">{g.name}</td>
                  <td className={td}>{g.active}</td>
                  <td className={`${td} ${g.withdrawn ? 'text-danger' : ''}`}>{g.withdrawn}</td>
                  <td className="w-48 px-3 py-2.5"><ShareBar value={g.active} total={g.active + g.withdrawn} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}

/* ---------------------------------------------------------------------
   تقرير الموظفين
--------------------------------------------------------------------- */
function Employees({ r }: { r: EmployeesReport }) {
  const t = r.totals;
  const branches = [...r.by_branch].sort((a, b) => b.teachers - a.teachers);
  const findings = [
    `${t.active} موظفًا نشطًا: ${t.teachers} معلمًا و${t.admins} إداريًا.`,
    `مجموع الحصص الأسبوعية المسندة ${t.weekly_periods} حصة، بمتوسط ${t.teachers ? Math.round(t.weekly_periods / t.teachers) : 0} حصة لكل معلم.`,
    t.no_scope ? `${t.no_scope} معلمًا بلا مواد في نطاقهم، فلن يروا أي طالب حتى يُكمل نطاقهم.` : 'كل المعلمين النشطين لهم نطاق مواد مكتمل.',
    t.inactive ? `${t.inactive} موظفًا غير نشط (سجلاتهم محفوظة).` : 'لا موظفين موقوفين.',
  ];
  return (
    <>
      <div className="px-6 py-7 sm:px-10">
        <Kpis
          items={[
            { label: 'موظفون نشطون', value: t.active, sub: `من ${t.all} سجل` },
            { label: 'معلمون', value: t.teachers },
            { label: 'إداريون', value: t.admins },
            { label: 'حصص أسبوعية', value: t.weekly_periods },
          ]}
        />
        <Findings items={findings} />
      </div>
      <Section n={1} title="المعلمون حسب الفرع">
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-paper/70"><tr>{['الفرع', 'المعلمون', 'الحصص الأسبوعية', 'متوسط الحصص', 'الحصة من المعلمين'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {branches.map((b) => (
                <tr key={b.name}>
                  <td className="px-3 py-2.5 font-semibold">{b.name}</td>
                  <td className={td}>{b.teachers}</td>
                  <td className={td}>{b.periods}</td>
                  <td className={td}>{b.teachers ? Math.round(b.periods / b.teachers) : 0}</td>
                  <td className="w-44 px-3 py-2.5"><ShareBar value={b.teachers} total={t.teachers} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section n={2} title="تغطية المواد" lead="عدد المعلمين المسندة إليهم كل مادة.">
        <GroupedBars data={r.by_subject.slice(0, 14).map((s) => ({ label: s.name, teachers: s.teachers }))} series={[{ key: 'teachers', label: 'معلمون', color: '#356854' }]} height={280} />
      </Section>
      <Section n={3} title="التوزيعات">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-semibold">النوع</h3>
            <MiniDonut items={[{ name: 'معلم', value: t.teachers }, { name: 'إداري', value: t.admins }, { name: 'غير نشط', value: t.inactive }].filter((x) => x.value)} />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold">الجنس</h3>
            <MiniDonut items={r.by_gender.map((g) => ({ name: g.name, value: g.count }))} />
          </div>
        </div>
      </Section>
    </>
  );
}

/* ---------------------------------------------------------------------
   تقرير الحسابات
--------------------------------------------------------------------- */
const ROLE = { student: 'طلاب', teacher: 'معلمون', admin: 'إداريون' } as const;

function Accounts({ r }: { r: AccountsReport }) {
  const all = r.by_role.reduce((a, x) => a + x.all, 0);
  const activated = r.by_role.reduce((a, x) => a + x.activated, 0);
  const l7 = r.by_role.reduce((a, x) => a + x.login_7d, 0);
  const never = r.by_role.reduce((a, x) => a + x.never, 0);
  const st = r.by_role.find((x) => x.role === 'student');
  const findings = [
    `${all} حساب دخول، فعّل ${activated} منها (${pct(activated, all)}%) بتغيير كلمة المرور المؤقتة.`,
    `دخل ${l7} مستخدمًا خلال آخر 7 أيام (${pct(l7, all)}% من الحسابات).`,
    never ? `${never} حسابًا لم يدخل أصحابها أبدًا — تأكد من وصول بياناتهم.` : 'كل أصحاب الحسابات دخلوا مرة على الأقل.',
    r.students_without || r.employees_without
      ? `بلا حساب: ${r.students_without} طالبًا و${r.employees_without} موظفًا.`
      : 'لكل طالب وموظف نشط حساب دخول.',
  ];
  if (st) findings.push(`نسبة تفعيل الطلاب ${pct(st.activated, st.all)}%، ونسبة دخولهم الأسبوعي ${pct(st.login_7d, st.all)}%.`);
  return (
    <>
      <div className="px-6 py-7 sm:px-10">
        <Kpis
          items={[
            { label: 'حسابات الدخول', value: all },
            { label: 'مفعّلة', value: activated, sub: `${pct(activated, all)}%` },
            { label: 'دخلوا آخر 7 أيام', value: l7, sub: `${pct(l7, all)}%` },
            { label: 'بلا حساب', value: r.students_without + r.employees_without },
          ]}
        />
        <Findings items={findings} />
      </div>
      <Section n={1} title="الحسابات حسب الدور">
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-paper/70"><tr>{['الدور', 'الحسابات', 'مفعّلة', 'لم يدخل بعد', 'موقوفة', 'آخر 7 أيام', 'آخر 30 يومًا', 'التفعيل'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {r.by_role.map((x) => (
                <tr key={x.role}>
                  <td className="px-3 py-2.5 font-semibold">{ROLE[x.role]}</td>
                  <td className={td}>{x.all}</td>
                  <td className={`${td} text-ok`}>{x.activated}</td>
                  <td className={`${td} ${x.temp ? 'text-brass' : ''}`}>{x.temp}</td>
                  <td className={`${td} ${x.disabled ? 'text-danger' : ''}`}>{x.disabled}</td>
                  <td className={td}>{x.login_7d}</td>
                  <td className={td}>{x.login_30d}</td>
                  <td className="w-40 px-3 py-2.5"><ShareBar value={x.activated} total={x.all} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section n={2} title="الدخول اليومي خلال آخر 14 يومًا" lead="عدد المستخدمين المختلفين الذين دخلوا كل يوم.">
        <GroupedBars
          data={r.daily_logins.map((d) => ({ label: d.day.slice(5).replace('-', '/'), count: d.count }))}
          series={[{ key: 'count', label: 'مستخدمون', color: '#356854' }]}
        />
      </Section>
    </>
  );
}

/* ---------------------------------------------------------------------
   تقرير النشاط
--------------------------------------------------------------------- */
const SECTION_NAMES: Record<string, string> = {
  students: 'الطلاب', employees: 'الموظفون', profiles: 'الحسابات', assessments: 'المهام والنماذج', grade_entries: 'الرصد',
  attendance_records: 'التحضير', behavior_records: 'السلوك', staff_scope: 'نطاقات المعلمين', timetable_slots: 'جدول الحصص',
  exam_schedule: 'الاختبارات', calendar_entries: 'التقويم', app_settings: 'الإعدادات', content_items: 'المحتوى',
};

function Activity({ r }: { r: ActivityReport }) {
  const t = r.totals;
  const top = r.top_actors[0];
  const busiest = [...r.daily].sort((a, b) => b.changes - a.changes)[0];
  const findings = [
    `سُجّلت ${t.week} حركة خلال آخر 7 أيام مقابل ${t.prev_week} في الأسبوع الذي قبله.`,
    `${t.actors_week} مستخدمًا قاموا بعمليات هذا الأسبوع، و${t.logins_week} عملية دخول للموظفين.`,
    top ? `الأكثر نشاطًا: ${top.name} بـ ${top.count} حركة.` : 'لا نشاط مسجّل هذا الأسبوع.',
    t.deletes_week ? `${t.deletes_week} عملية حذف هذا الأسبوع — راجعها من سجل النشاط.` : 'لا عمليات حذف هذا الأسبوع.',
  ];
  if (busiest?.changes) findings.push(`أكثر الأيام نشاطًا ${busiest.day} بـ ${busiest.changes} تعديلًا.`);
  return (
    <>
      <div className="px-6 py-7 sm:px-10">
        <Kpis
          items={[
            { label: 'حركات اليوم', value: t.today },
            { label: 'آخر 7 أيام', value: t.week, sub: <Change now={t.week} before={t.prev_week} /> },
            { label: 'مستخدمون نشطون', value: t.actors_week },
            { label: 'عمليات حذف', value: t.deletes_week },
          ]}
        />
        <Findings items={findings} />
      </div>
      <Section n={1} title="النشاط اليومي خلال أسبوعين" lead="التعديلات (إضافة وتعديل وحذف) ودخول الموظفين لكل يوم.">
        <GroupedBars
          data={r.daily.map((d) => ({ label: d.day.slice(5).replace('-', '/'), changes: d.changes, logins: d.logins }))}
          series={[
            { key: 'changes', label: 'تعديلات', color: '#356854' },
            { key: 'logins', label: 'دخول', color: '#d9a441' },
          ]}
        />
      </Section>
      <Section n={2} title="الأكثر نشاطًا" lead="آخر 7 أيام.">
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[460px] text-sm">
            <thead className="bg-paper/70"><tr>{['المستخدم', 'الدور', 'الحركات', 'الحصة'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {r.top_actors.map((a) => (
                <tr key={a.name}>
                  <td className="px-3 py-2.5 font-semibold">{a.name}</td>
                  <td className="px-3 py-2.5 text-muted">{a.role ?? '—'}</td>
                  <td className={td}>{a.count}</td>
                  <td className="w-44 px-3 py-2.5"><ShareBar value={a.count} total={t.week} /></td>
                </tr>
              ))}
              {!r.top_actors.length && <tr><td colSpan={4} className="px-3 py-4 text-muted">لا نشاط.</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>
      <Section n={3} title="التوزيعات" lead="آخر 7 أيام.">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-semibold">نوع الحركة</h3>
            <MiniDonut items={r.by_action.map((x) => ({ name: x.name, value: x.count }))} />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold">القسم</h3>
            <MiniDonut items={r.by_table.slice(0, 7).map((x) => ({ name: SECTION_NAMES[x.name] ?? x.name, value: x.count }))} />
          </div>
        </div>
      </Section>
    </>
  );
}
