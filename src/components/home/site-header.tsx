'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { LogoMark } from './logo-mark';
import { Brand } from '@/components/motion';

export const BENEFICIARIES = [
  { key: 'student', label: 'طالب', href: '/student/login' },
  { key: 'teacher', label: 'معلم', href: '/login' },
  { key: 'admin', label: 'إداري', href: '/login' },
] as const;

const PORTALS = [
  { label: 'بوابة الطالب', hint: 'الجدول والمهام والنتائج', href: '/student/login' },
  { label: 'بوابة الموظفين', hint: 'للمعلمين والإداريين', href: '/login' },
];

/** قائمة منسدلة: تُفتح بالضغط، وتُغلق بالضغط خارجها أو بزر Esc */
function Dropdown({
  label,
  children,
  buttonClassName,
  align = 'start',
}: {
  label: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  buttonClassName: string;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={buttonClassName}>
        {label}
        <svg viewBox="0 0 12 12" className={`size-3 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} aria-hidden>
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div
          className={`absolute top-full z-30 mt-3 min-w-52 origin-top animate-menu rounded-xl border border-line bg-surface p-1.5 shadow-[0_18px_40px_-16px_rgb(31_42_36/0.35)] ${align === 'end' ? 'end-0' : 'start-0'}`}
        >
          <span aria-hidden className={`absolute -top-1.5 size-3 rotate-45 border-s border-t border-line bg-surface ${align === 'end' ? 'end-6' : 'start-6'}`} />
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function SiteHeader({ logoUrl }: { logoUrl: string | null }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoOk, setLogoOk] = useState(true);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLink =
    'relative rounded-md px-3 py-2 text-[0.95rem] text-ink/80 transition-colors duration-200 hover:text-board ' +
    "after:absolute after:inset-x-3 after:-bottom-0.5 after:h-0.5 after:origin-center after:scale-x-0 after:rounded-full after:bg-board after:transition-transform after:duration-300 hover:after:scale-x-100";

  return (
    <header
      className={`sticky top-0 z-40 border-b bg-surface/85 backdrop-blur-md transition-[box-shadow,border-color] duration-300 ${scrolled ? 'border-line shadow-[0_8px_24px_-18px_rgb(31_42_36/0.45)]' : 'border-transparent'}`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <Link href="/" className="flex items-center gap-2" aria-label="مِرقاة — الرئيسية">
          <LogoMark className="h-8 w-9" />
          <Brand>
            <span className="font-display text-2xl font-bold text-board">مِرقاة</span>
          </Brand>
        </Link>

        <nav aria-label="التنقل الرئيسي" className="hidden items-center gap-1 md:flex">
          <a href="#top" className={navLink + ' text-board after:scale-x-100'}>الرئيسية</a>
          <a href="#about" className={navLink}>عن مِرقاة</a>
          <Dropdown label="المستفيدون" buttonClassName={navLink + ' inline-flex items-center gap-1.5'}>
            {(close) =>
              BENEFICIARIES.map((b) => (
                <Link
                  key={b.key}
                  href={b.href}
                  onClick={close}
                  className="block rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-paper hover:text-board"
                >
                  {b.label}
                </Link>
              ))
            }
          </Dropdown>
          <a href="#contact" className={navLink}>تواصل معنا</a>
        </nav>

        <div className="ms-auto flex items-center gap-3">
          <div className="hidden sm:block">
            <Dropdown
              label="تسجيل الدخول"
              align="end"
              buttonClassName="btn-primary inline-flex items-center gap-2 rounded-full px-5"
            >
              {(close) =>
                PORTALS.map((p) => (
                  <Link
                    key={p.href}
                    href={p.href}
                    onClick={close}
                    className="group flex flex-col rounded-lg px-3 py-2.5 transition-colors hover:bg-paper"
                  >
                    <span className="text-sm font-semibold group-hover:text-board">{p.label}</span>
                    <span className="text-xs text-muted">{p.hint}</span>
                  </Link>
                ))
              }
            </Dropdown>
          </div>
          {logoUrl && logoOk && (
            // شعار المدرسة من الإعدادات (رابط خارجي، فلا يمر عبر next/image)
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="شعار المدرسة"
              referrerPolicy="no-referrer"
              onError={() => setLogoOk(false)}
              className="hidden h-10 w-auto max-w-28 object-contain lg:block"
            />
          )}
          <button
            type="button"
            className="grid size-10 place-items-center rounded-md transition-colors hover:bg-paper md:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="sr-only">{menuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}</span>
            <span aria-hidden className="relative block h-3.5 w-5">
              <span className={`absolute inset-x-0 top-0 h-0.5 rounded bg-ink transition-transform duration-300 ${menuOpen ? 'translate-y-1.5 rotate-45' : ''}`} />
              <span className={`absolute inset-x-0 top-1.5 h-0.5 rounded bg-ink transition-opacity duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
              <span className={`absolute inset-x-0 top-3 h-0.5 rounded bg-ink transition-transform duration-300 ${menuOpen ? '-translate-y-1.5 -rotate-45' : ''}`} />
            </span>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div id="mobile-menu" className="animate-menu border-t border-line bg-surface px-5 pb-5 pt-2 md:hidden">
          <nav aria-label="القائمة" className="flex flex-col">
            {[
              ['#top', 'الرئيسية'],
              ['#about', 'عن مِرقاة'],
              ['#beneficiaries', 'المستفيدون'],
              ['#contact', 'تواصل معنا'],
            ].map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)} className="border-b border-line py-3 text-ink/85">
                {label}
              </a>
            ))}
          </nav>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {PORTALS.map((p, i) => (
              <Link key={p.href} href={p.href} className={i === 0 ? 'btn-primary' : 'btn-quiet'}>
                {p.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
