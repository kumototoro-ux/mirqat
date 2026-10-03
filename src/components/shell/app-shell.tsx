'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { tabsFor, type NavGroup, type NavLink } from './nav';
import { ROLE_LABEL, type AppRole } from '@/lib/auth/roles';
import { LogoMark } from '@/components/home/logo-mark';
import { Brand } from '@/components/motion';
import { FeedbackProvider } from '@/components/feedback';

type Props = {
  nav: NavGroup[];
  home: string;
  user: { displayName: string; role: AppRole; code: string | null };
  schoolName: string;
  week: { label: string; range: string } | null;
  children: React.ReactNode;
};

function isActive(path: string, href: string, home: string) {
  return href === home ? path === home : path === href || path.startsWith(href + '/');
}

function findCurrent(nav: NavGroup[], path: string, home: string) {
  for (const g of nav) for (const i of g.items) if (isActive(path, i.href, home)) return { group: g.title, item: i };
  return null;
}

/* ---------------------------------------------------------------------
   شريط تقدّم التنقل: خط ذهبي رفيع أعلى الشاشة من لحظة الضغط حتى تصل الصفحة
--------------------------------------------------------------------- */
function NavProgress() {
  const path = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as HTMLElement).closest('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download') || !a.href) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setState('loading');
    };
    const onSubmit = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement;
      if ((f.getAttribute('method') || 'get').toLowerCase() === 'get' && !f.dataset.local) setState('loading');
    };
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('submit', onSubmit);
    };
  }, []);

  useEffect(() => {
    setState((s) => (s === 'loading' ? 'done' : s));
    const t = setTimeout(() => setState('idle'), 450);
    return () => clearTimeout(t);
  }, [path, search]);

  if (state === 'idle') return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[80] h-[3px]">
      <div
        className={`h-full origin-right rounded-l-full bg-gradient-to-l from-board via-gold to-gold ${
          state === 'loading' ? 'animate-progress' : 'w-full opacity-0 transition-opacity duration-300'
        }`}
      />
    </div>
  );
}

/* ---------------------------------------------------------------------
   القائمة الجانبية (الحاسوب)
--------------------------------------------------------------------- */
function Sidebar({ nav, home, schoolName, week, path }: Omit<Props, 'children' | 'user'> & { path: string }) {
  return (
    <div className="flex h-full flex-col">
      <Link href={home} className="flex items-center gap-2.5 px-6 pb-5 pt-6">
        <LogoMark className="h-8 w-9" />
        <span>
          <Brand>
            <span className="block font-display text-[1.7rem] font-bold leading-none text-board">مِرقاة</span>
          </Brand>
          <span className="mt-1 block text-[0.7rem] text-muted">{schoolName}</span>
        </span>
      </Link>

      <nav aria-label="القائمة الرئيسية" className="flex-1 overflow-y-auto px-3.5 pb-4 [scrollbar-width:thin]">
        {nav.map((g, gi) => (
          <div key={gi} className={gi ? 'mt-4' : ''}>
            {g.title && <p className="mb-1 px-3 text-[0.7rem] font-semibold text-muted/80">{g.title}</p>}
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const on = isActive(path, item.href, home);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={on ? 'page' : undefined}
                      className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-[0.9rem] transition-all duration-200 ${
                        on
                          ? 'bg-board font-semibold text-chalk shadow-[0_8px_18px_-10px_rgb(53_104_84/0.9)]'
                          : 'text-ink/75 hover:bg-board/[0.07] hover:text-ink'
                      }`}
                    >
                      <Icon name={item.icon} className={`size-[1.15rem] shrink-0 ${on ? 'text-gold' : 'text-muted group-hover:text-board'}`} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {week && (
        <div className="relative m-3.5 overflow-hidden rounded-2xl bg-board p-4 text-chalk">
          <div aria-hidden className="absolute -end-6 -top-6 size-24 rounded-full bg-gold/25 blur-2xl" />
          <p className="text-xs text-chalk/70">الأسبوع الحالي</p>
          <p className="mt-0.5 font-bold">{week.label}</p>
          <p className="mt-1 text-xs text-chalk/70">{week.range}</p>
          <div aria-hidden className="mt-3 flex h-6 items-end gap-1">
            {[30, 48, 66, 84].map((h) => (
              <span key={h} className="w-2 rounded-sm bg-chalk/40" style={{ height: `${h}%` }} />
            ))}
            <span className="h-full w-2 rounded-sm bg-gold" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   قائمة الحساب (الصورة الرمزية في الشريط العلوي)
--------------------------------------------------------------------- */
function AccountMenu({ user }: { user: Props['user'] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="قائمة الحساب"
        className="flex items-center gap-2.5 rounded-full p-1 transition-colors hover:bg-surface sm:pe-3"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold to-[#c48d2e] font-bold text-ink shadow-sm">
          {user.displayName.trim().charAt(0)}
        </span>
        <span className="hidden text-start leading-tight sm:block">
          <span className="block max-w-36 truncate text-sm font-semibold">{user.displayName}</span>
          <span className="block text-xs text-muted">{ROLE_LABEL[user.role]}</span>
        </span>
        <Icon name="chevron" className={`hidden size-4 text-muted transition-transform duration-300 sm:block ${open ? 'rotate-90' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="absolute end-0 top-full z-40 mt-2 w-60 origin-top animate-menu rounded-2xl border border-line bg-surface p-1.5 shadow-[0_24px_50px_-20px_rgb(31_42_36/0.4)]">
          <div className="border-b border-line px-3 pb-2.5 pt-1.5">
            <p className="truncate font-semibold">{user.displayName}</p>
            <p className="text-xs text-muted">
              {ROLE_LABEL[user.role]}
              {user.code ? ` · ${user.code}` : ''}
            </p>
          </div>
          <Link href="/change-password" className="mt-1 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-paper">
            <Icon name="key" className="size-4 text-muted" />
            تغيير كلمة المرور
          </Link>
          <form action="/auth/signout" method="post" data-local="1">
            <button type="submit" className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-danger transition-colors hover:bg-danger-soft">
              <Icon name="logout" className="size-4" />
              تسجيل الخروج
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   الهيكل
--------------------------------------------------------------------- */
export function AppShell(props: Props) {
  const path = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const current = findCurrent(props.nav, path, props.home);
  const tabs = tabsFor(props.user.role);
  const onTab = tabs.some((t) => isActive(path, t.href, props.home));

  useEffect(() => setMoreOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = moreOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [moreOpen]);

  return (
    <FeedbackProvider>
      <Suspense>
        <NavProgress />
      </Suspense>
      <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-dvh border-e border-line bg-surface lg:block">
          <Sidebar {...props} path={path} />
        </aside>

        <div className="min-w-0">
          {/* الشريط العلوي */}
          <header className="sticky top-0 z-30 border-b border-line/80 bg-paper/80 backdrop-blur-xl">
            <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-8">
              <Link href={props.home} className="shrink-0 lg:hidden" aria-label="الرئيسية">
                <LogoMark className="h-7 w-8" />
              </Link>
              <div className="min-w-0 flex-1">
                <nav aria-label="مسار الصفحة" className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
                  <Link href={props.home} className="transition-colors hover:text-board">الرئيسية</Link>
                  {current?.group && (
                    <>
                      <Icon name="chevron" className="size-3" />
                      <span>{current.group}</span>
                    </>
                  )}
                  {current && current.item.href !== props.home && (
                    <>
                      <Icon name="chevron" className="size-3" />
                      <span className="text-board">{current.item.label}</span>
                    </>
                  )}
                </nav>
                <p key={path} className="animate-fade-in truncate text-[1.05rem] font-bold leading-tight sm:text-lg">
                  {current?.item.label ?? 'مِرقاة'}
                </p>
              </div>

              {props.user.role === 'admin' && (
                <form action="/staff/students" className="relative hidden md:block" role="search">
                  <Icon name="search" className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted" />
                  <input
                    name="q"
                    aria-label="بحث عن طالب"
                    placeholder="ابحث عن طالب بالاسم أو الرقم…"
                    className="h-10 w-60 rounded-full border border-line bg-surface pe-4 ps-9 text-sm transition-[width,border-color,box-shadow] duration-300 placeholder:text-muted/70 focus:w-80 focus:border-board focus:outline-none focus:ring-2 focus:ring-gold/30"
                  />
                </form>
              )}
              <AccountMenu user={props.user} />
            </div>
          </header>

          <main className="px-4 pb-28 pt-6 sm:px-8 lg:pb-12 lg:pt-8">
            <div key={path} className="mx-auto max-w-6xl animate-fade-up">
              {props.children}
            </div>
          </main>
        </div>
      </div>

      {/* الشريط السفلي (الجوال) */}
      <nav
        aria-label="التنقل السريع"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-md grid-cols-5">
          {[...tabs, { href: '#more', label: 'المزيد', icon: 'more' } as NavLink].map((t) => {
            const isMore = t.href === '#more';
            const on = isMore ? moreOpen || !onTab : isActive(path, t.href, props.home) && !moreOpen;
            const inner = (
              <>
                <span className={`grid h-8 w-14 place-items-center rounded-full transition-all duration-300 ${on ? 'bg-board text-chalk shadow-[0_6px_14px_-8px_rgb(53_104_84/0.9)]' : 'text-muted'}`}>
                  <Icon name={t.icon} className="size-5" />
                </span>
                <span className={`text-[0.68rem] transition-colors ${on ? 'font-semibold text-board' : 'text-muted'}`}>{t.label}</span>
              </>
            );
            const cls = 'flex flex-1 flex-col items-center justify-center gap-0.5 transition-transform active:scale-95';
            return (
              <li key={t.href} className="flex">
                {isMore ? (
                  <button type="button" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen} className={cls}>
                    {inner}
                  </button>
                ) : (
                  <Link href={t.href} className={cls}>
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* "المزيد": لوحة تصعد من الأسفل بكل أقسام القائمة */}
      <div className={`fixed inset-0 z-30 lg:hidden ${moreOpen ? '' : 'pointer-events-none'}`} aria-hidden={!moreOpen}>
        <div
          onClick={() => setMoreOpen(false)}
          className={`absolute inset-0 bg-ink/35 backdrop-blur-[2px] transition-opacity duration-300 ${moreOpen ? 'opacity-100' : 'opacity-0'}`}
        />
        <div
          className={`absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-3xl bg-surface px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl transition-[transform,visibility] duration-[400ms] ease-out-soft ${
            moreOpen ? 'visible translate-y-0' : 'invisible translate-y-full'
          }`}
        >
          <span className="mx-auto mb-4 block h-1 w-10 rounded-full bg-line" />
          {props.nav.map((g, gi) => (
            <div key={gi} className="mb-4">
              {g.title && <p className="mb-2 px-1 text-xs font-semibold text-muted">{g.title}</p>}
              <ul className="grid grid-cols-3 gap-2">
                {g.items.map((item) => {
                  const on = isActive(path, item.href, props.home);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex h-full flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-center text-xs transition-colors active:scale-95 ${
                          on ? 'border-board bg-board text-chalk' : 'border-line bg-paper/60 text-ink'
                        }`}
                      >
                        <Icon name={item.icon} className={`size-5 ${on ? 'text-gold' : 'text-board'}`} />
                        <span className="leading-tight">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </FeedbackProvider>
  );
}
