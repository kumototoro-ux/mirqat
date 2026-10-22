import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui';
import { Icon, type IconName } from '@/components/shell/icons';

export const metadata: Metadata = { title: 'التقارير' };

const REPORTS: { href: string; title: string; lead: string; icon: IconName; tone: string }[] = [
  { href: '/staff/reports/students', title: 'تقرير الطلاب', lead: 'التوزيع على الفروع والفصول، والحركة خلال ستة أشهر، والمنتظمون والمنسحبون.', icon: 'students', tone: 'bg-board text-chalk' },
  { href: '/staff/reports/employees', title: 'تقرير الموظفين', lead: 'المعلمون والإداريون، ونطاق كل معلم، والنصاب، والنواقص في الصلاحيات.', icon: 'employees', tone: 'bg-[#2a6f8a] text-chalk' },
  { href: '/staff/reports/accounts', title: 'تقرير الحسابات', lead: 'من فعّل حسابه، ومن لم يغيّر كلمته المؤقتة، ونشاط الدخول.', icon: 'key', tone: 'bg-gold text-ink' },
  { href: '/staff/reports/activity', title: 'تقرير النشاط', lead: 'حركة النظام حسب القسم والمستخدم والوقت من سجل التدقيق.', icon: 'audit', tone: 'bg-brass text-chalk' },
  { href: '/staff/results', title: 'النتائج', lead: 'كشوف الفصول ومعدلاتها، وملف Excel لكل فصل، وإشعارات الطلاب.', icon: 'results', tone: 'bg-ok text-chalk' },
  { href: '/staff/attendance', title: 'متابعة الغياب', lead: 'نسبة الحضور لكل طالب بمعادلة الغياب والتأخر، والأكثر غيابًا.', icon: 'attendance', tone: 'bg-danger text-chalk' },
];

export default async function ReportsIndex() {
  await requireUser(['admin']);
  return (
    <>
      <PageHeader title="التقارير" lead="تقارير جاهزة للطباعة وحفظها PDF، محسوبة لحظيًا من بيانات المنصة." />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((r, i) => (
          <li key={r.href} className="animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
            <Link href={r.href} className="group flex h-full flex-col rounded-[1.5rem] border border-line bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-board/30 hover:shadow-[0_18px_40px_-28px_rgb(53_104_84/0.8)]">
              <span className={`grid size-12 place-items-center rounded-2xl ${r.tone} transition-transform duration-300 group-hover:scale-105`}>
                <Icon name={r.icon} className="size-6" />
              </span>
              <span className="mt-4 text-lg font-bold group-hover:text-board">{r.title}</span>
              <span className="mt-1 flex-1 text-sm leading-relaxed text-muted">{r.lead}</span>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-board">
                فتح التقرير <Icon name="chevron" className="size-4 transition-transform group-hover:-translate-x-1" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
