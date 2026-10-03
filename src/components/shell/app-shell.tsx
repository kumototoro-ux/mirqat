'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from './icons';
import type { NavGroup } from './nav';
import { ROLE_LABEL, type AppRole } from '@/lib/auth/roles';
import { LogoMark } from '@/components/home/logo-mark';
import { SaduPattern } from '@/components/home/sadu-pattern';
import { Brand } from '@/components/motion';

type Props = {
  nav: NavGroup[];
  home: string;
  user: { displayName: string; role: AppRole; code: string | null };
  schoolName: string;
  children: React.ReactNode;
};

/** الرابط نشط إن طابق الصفحة أو كان أبًا لها (الرئيسية تطابق نفسها فقط) */
function isActive(path: string, href: string, home: string) {
  return href === home ? path === home : path === href || path.startsWith(href + '/');
}

function SidebarContent({ nav, home, user, schoolName, path, onNavigate }: Omit<Props, 'children'> & { path: string; onNavigate?: () => void }) {
  return (
    <div className="relative flex h-full flex-col">
      <SaduPattern id="side-sadu" opacity={0.05} />
      <Link href={home} onClick={onNavigate} className="relative flex items-center gap-2.5 px-5 pb-4 pt-5">
        <LogoMark className="h-8 w-9" tone="light" />
        <span>
          <Brand>
            <span className="block font-display text-2xl font-bold leading-none text-chalk">مِرقاة</span>
          </Brand>
          <span className="mt-1 block text-xs text-chalk/60">{schoolName}</span>
        </span>
      </Link>

      <nav aria-label="القائمة الرئيسية" className="relative flex-1 overflow-y-auto px-3 pb-4 [scrollbar-width:thin]">
        {nav.map((g, gi) => (
          <div key={gi} className={gi ? 'mt-4' : ''}>
            {g.title && <p className="mb-1.5 px-3 text-[0.7rem] font-semibold tracking-wide text-chalk/45">{g.title}</p>}
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const on = isActive(path, item.href, home);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={on ? 'page' : undefined}
                      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[0.92rem] transition-colors duration-200 ${
                        on ? 'bg-chalk/12 font-semibold text-chalk' : 'text-chalk/72 hover:bg-chalk/[0.07] hover:text-chalk'
                      }`}
                    >
                      {on && <span aria-hidden className="absolute inset-y-2 start-0 w-1 rounded-full bg-gold" />}
                      <Icon name={item.icon} className={`size-5 shrink-0 transition-colors ${on ? 'text-gold' : 'text-chalk/55 group-hover:text-chalk/85'}`} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="relative border-t border-chalk/10 p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold/90 font-semibold text-ink">
            {user.displayName.trim().charAt(0)}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-medium text-chalk">{user.displayName}</span>
            <span className="block text-xs text-chalk/55">
              {ROLE_LABEL[user.role]}
              {user.code ? ` · ${user.code}` : ''}
            </span>
          </span>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <Link
            href="/change-password"
            onClick={onNavigate}
            className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs text-chalk/70 transition-colors hover:bg-chalk/[0.07] hover:text-chalk"
          >
            <Icon name="key" className="size-4" />
            كلمة المرور
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs text-chalk/70 transition-colors hover:bg-danger/25 hover:text-chalk"
            >
              <Icon name="logout" className="size-4" />
              خروج
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * هيكل الموقع بعد الدخول: قائمة جانبية ثابتة على الحاسوب، ودرج منزلق على الجوال.
 */
export function AppShell(props: Props) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  const current = props.nav.flatMap((g) => g.items).find((i) => isActive(path, i.href, props.home));

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh overflow-hidden bg-board text-chalk lg:block">
        <SidebarContent {...props} path={path} />
      </aside>

      {/* الجوال: شريط علوي + درج */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur-md lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="grid size-10 place-items-center rounded-lg transition-colors hover:bg-paper"
          aria-label="فتح القائمة"
          aria-expanded={open}
        >
          <Icon name="menu" className="size-6" />
        </button>
        <span className="truncate font-semibold">{current?.label ?? 'مِرقاة'}</span>
        <LogoMark className="ms-auto h-6 w-7" />
      </header>
      <div
        aria-hidden={!open}
        className={`fixed inset-0 z-40 lg:hidden ${open ? '' : 'pointer-events-none'}`}
      >
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-ink/40 backdrop-blur-[2px] transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
        />
        <aside
          className={`absolute inset-y-0 start-0 w-[18rem] max-w-[85vw] overflow-hidden bg-board text-chalk shadow-2xl transition-transform duration-300 ease-out-soft ${
            open ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute end-3 top-5 z-10 grid size-9 place-items-center rounded-lg text-chalk/70 hover:bg-chalk/10"
            aria-label="إغلاق القائمة"
          >
            <Icon name="close" className="size-5" />
          </button>
          <SidebarContent {...props} path={path} onNavigate={() => setOpen(false)} />
        </aside>
      </div>

      <main className="min-w-0 px-4 py-6 sm:px-8 lg:py-9">
        <div key={path} className="mx-auto max-w-6xl animate-fade-up">
          {props.children}
        </div>
      </main>
    </div>
  );
}
