import Link from 'next/link';
import { Reveal } from '@/components/reveal';
import { LogoMark } from './logo-mark';
import { SaduPattern } from './sadu-pattern';
import { AVATARS } from './avatars';

function SectionTitle({ title, lead }: { title: string; lead?: string }) {
  return (
    <Reveal className="mb-10 max-w-2xl">
      <h2 className="flex items-center gap-3 text-[clamp(1.6rem,3vw,2.1rem)] font-bold">
        <span aria-hidden className="flex h-6 items-end gap-0.5">
          <span className="h-2.5 w-1.5 rounded-sm bg-board/50" />
          <span className="h-4 w-1.5 rounded-sm bg-board/75" />
          <span className="h-6 w-1.5 rounded-sm bg-gold" />
        </span>
        {title}
      </h2>
      {lead && <p className="mt-3 text-lg leading-relaxed text-muted">{lead}</p>}
    </Reveal>
  );
}

const icon = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

const FEATURES = [
  {
    title: 'جدولك الأسبوعي',
    body: 'الحصص والاختبارات وأسابيع التقويم الدراسي، مرتبة بحسب يومك.',
    icon: icon(<><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>),
  },
  {
    title: 'التكاليف والنماذج',
    body: 'واجبات واختبارات إلكترونية تُحل من المنصة، وتُصحَّح آليًا لحظة التسليم.',
    icon: icon(<><path d="M7 3.5h7.5L19 8v12.5H7z" /><path d="M14 3.5V8h5M10 13l2 2 4-4" /></>),
  },
  {
    title: 'الرصد والنتائج',
    body: 'درجات كل مادة بحسب نوع التقييم، تُحسب لحظيًا من الرصد دون انتظار.',
    icon: icon(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>),
  },
  {
    title: 'الحضور والمتابعة',
    body: 'تحضير كل حصة ومتابعة السلوك، بصلاحيات تحفظ لكل معلم نطاقه.',
    icon: icon(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 11l2 2 4-4" /></>),
  },
];

export function About({ schoolName }: { schoolName: string }) {
  return (
    <section id="about" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <SectionTitle
          title="منصة مِرقاة"
          lead={`نظام ${schoolName} الموحّد للتعليم عن بعد والانتساب: يربط الطالب بمعلميه وبإدارة مدرسته من خلال قاعدة بيانات واحدة آمنة، فيرى كلٌّ ما يخصه فقط.`}
        />
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} as="li" delay={i * 90}>
              <div className="group h-full rounded-2xl border border-line bg-surface p-6 transition-[transform,box-shadow,border-color] duration-300 ease-out-soft hover:-translate-y-1 hover:border-board/30 hover:shadow-[0_22px_40px_-26px_rgb(53_104_84/0.55)]">
                <span className="grid size-12 place-items-center rounded-xl bg-board/10 text-board transition-colors duration-300 group-hover:bg-board group-hover:text-chalk">
                  {f.icon}
                </span>
                <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 leading-relaxed text-muted">{f.body}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

const PEOPLE = [
  { key: 'student', title: 'طالب', body: 'جدولك ومهامك ونماذجك ونتائجك', href: '/student/login', portal: 'بوابة الطالب' },
  { key: 'teacher', title: 'معلم', body: 'التكاليف والرصد والتحضير لفصولك', href: '/login', portal: 'بوابة الموظفين' },
  { key: 'admin', title: 'إداري', body: 'الحسابات والإعدادات والمتابعة الشاملة', href: '/login', portal: 'بوابة الموظفين' },
] as const;

export function Beneficiaries() {
  return (
    <section id="beneficiaries" className="scroll-mt-20 border-y border-line bg-surface py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <SectionTitle title="المستفيدون" lead="اختر صفتك لتصل إلى بوابتك مباشرة." />
        <ul className="grid gap-5 sm:grid-cols-3">
          {PEOPLE.map((p, i) => (
            <Reveal key={p.key} as="li" delay={i * 110}>
              <Link
                href={p.href}
                className="group relative flex h-full flex-col items-center overflow-hidden rounded-2xl border border-line bg-paper/60 px-6 pb-7 pt-9 text-center transition-[transform,box-shadow,border-color,background-color] duration-300 ease-out-soft hover:-translate-y-1.5 hover:border-board/40 hover:bg-surface hover:shadow-[0_26px_50px_-28px_rgb(53_104_84/0.6)]"
              >
                <span className="relative grid size-28 place-items-center rounded-full bg-board shadow-[inset_0_-10px_24px_rgb(0_0_0/0.18)] ring-8 ring-board/10 transition-transform duration-500 ease-out-soft group-hover:scale-105 group-hover:ring-board/20">
                  <svg viewBox="0 0 64 64" className="size-16">{AVATARS[p.key]}</svg>
                </span>
                <span className="mt-6 text-xl font-bold">{p.title}</span>
                <span className="mt-1.5 text-muted">{p.body}</span>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-board">
                  {p.portal}
                  <svg viewBox="0 0 16 16" className="size-4 transition-transform duration-300 group-hover:-translate-x-1" aria-hidden>
                    <path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 origin-center scale-x-0 bg-gold transition-transform duration-500 ease-out-soft group-hover:scale-x-100" />
              </Link>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

export type Announcement = { title: string; body?: string; date?: string };

/** الإعلانات: تُقرأ من الإعدادات العامة (announcements)، ويختفي القسم إن لم يوجد إعلان */
export function Announcements({ items }: { items: Announcement[] }) {
  if (!items.length) return null;
  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-l from-board via-[#2f7a5e] to-[#2a6f8a] py-20 text-chalk sm:py-24">
      <SaduPattern id="ann-sadu" opacity={0.06} />
      <div className="relative mx-auto max-w-6xl px-5">
        <Reveal className="mb-10">
          <h2 className="text-[clamp(1.6rem,3vw,2.1rem)] font-bold">الإعلانات</h2>
        </Reveal>
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {items.slice(0, 6).map((a, i) => (
            <Reveal key={a.title + i} as="li" delay={i * 90}>
              <article className="h-full rounded-2xl bg-surface p-6 text-ink shadow-[0_24px_48px_-28px_rgb(0_0_0/0.6)] transition-transform duration-300 hover:-translate-y-1">
                {a.date && <p className="text-sm text-brass">{a.date}</p>}
                <h3 className="mt-1 text-lg font-semibold">{a.title}</h3>
                {a.body && <p className="mt-2 whitespace-pre-line leading-relaxed text-muted">{a.body}</p>}
              </article>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function SiteFooter({ schoolName }: { schoolName: string }) {
  return (
    <footer id="contact" className="relative isolate scroll-mt-20 overflow-hidden bg-board-deep text-chalk">
      <SaduPattern id="footer-sadu" opacity={0.05} />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-[1.4fr_1fr_1fr]">
        <Reveal>
          <div className="flex items-center gap-2">
            <LogoMark className="h-9 w-10" tone="light" />
            <span className="font-display text-3xl font-bold">مِرقاة</span>
          </div>
          <p className="mt-4 max-w-sm leading-relaxed text-chalk/70">المنصة التعليمية لـ{schoolName}.</p>
        </Reveal>
        <Reveal delay={90}>
          <h2 className="text-lg font-semibold">تواصل معنا</h2>
          <p className="mt-3 leading-relaxed text-chalk/70">
            للاستفسار أو لاستلام بيانات الدخول أو استعادة كلمة المرور، تواصل مع إدارة {schoolName}.
          </p>
        </Reveal>
        <Reveal delay={180}>
          <h2 className="text-lg font-semibold">البوابات</h2>
          <ul className="mt-3 space-y-2">
            <li><Link href="/student/login" className="text-chalk/70 transition-colors hover:text-gold">بوابة الطالب</Link></li>
            <li><Link href="/login" className="text-chalk/70 transition-colors hover:text-gold">بوابة الموظفين</Link></li>
          </ul>
        </Reveal>
      </div>
      <div className="relative border-t border-chalk/10">
        <p className="mx-auto max-w-6xl px-5 py-5 text-sm text-chalk/55">
          © {new Date().getFullYear()} مِرقاة، {schoolName}. جميع الحقوق محفوظة.
        </p>
      </div>
    </footer>
  );
}
