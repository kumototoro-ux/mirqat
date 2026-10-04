'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { Icon } from './icons';
import { NavLink } from './nav-link';
import { tabsFor, type NavGroup, type NavLink as NavItem } from './nav';
import { ROLE_LABEL, type AppRole } from '@/lib/auth/roles';
import { LogoMark } from '@/components/home/logo-mark';
import { SaduPattern } from '@/components/home/sadu-pattern';
import { FeedbackProvider } from '@/components/feedback';
import { Providers } from '@/components/providers';
import { QuickSearch, TodayButton, useHideOnScroll } from './mobile-tools';

type User = { displayName: string; role: AppRole; code: string | null };
type Props = {
  nav: NavGroup[];
  home: string;
  user: User;
  schoolName: string;
  week: { label: string; range: string } | null;
  today: { day: string; date: string; hijri: string };
  initialCollapsed: boolean;
  children: React.ReactNode;
};

const EASE = [0.22, 1, 0.36, 1] as const;

function isActive(path: string, href: string, home: string) {
  return href === home ? path === home : path === href || path.startsWith(href + '/');
}
// صفحات خارج القائمة لها عنوان أيضًا في الشريط العلوي
const EXTRA: { prefix: string; label: string; group?: string }[] = [
  { prefix: '/staff/reports/students', label: 'تقرير الطلاب', group: 'التقارير' },
  { prefix: '/staff/reports/employees', label: 'تقرير الموظفين', group: 'التقارير' },
  { prefix: '/staff/reports/accounts', label: 'تقرير الحسابات', group: 'التقارير' },
  { prefix: '/staff/reports/activity', label: 'تقرير النشاط', group: 'التقارير' },
  { prefix: '/staff/password', label: 'تغيير كلمة المرور', group: 'حسابي' },
  { prefix: '/student/password', label: 'تغيير كلمة المرور', group: 'حسابي' },
];

function findCurrent(nav: NavGroup[], path: string, home: string) {
  for (const e of EXTRA) if (path.startsWith(e.prefix)) return { group: e.group, item: { href: e.prefix, label: e.label, icon: 'home' as const } };
  for (const g of nav) for (const i of g.items) if (isActive(path, i.href, home)) return { group: g.title, item: i };
  return null;
}
const initial = (name: string) => name.trim().charAt(0);

/* ---------------------------------------------------------------------
   شريط تقدّم التنقل أعلى الشاشة
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
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
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
      <div className={`h-full rounded-l-full bg-gradient-to-l from-board via-gold to-gold ${state === 'loading' ? 'animate-progress' : 'w-full opacity-0 transition-opacity duration-300'}`} />
    </div>
  );
}

/* ---------------------------------------------------------------------
   قائمة الحساب المنسدلة (تُستخدم في الشريط العلوي وأسفل القائمة الجانبية)
--------------------------------------------------------------------- */
function AccountMenu({ user, home, children, align, up }: { user: User; home: string; children: (open: boolean) => React.ReactNode; align: 'start' | 'end'; up?: boolean }) {
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
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="قائمة الحساب" className="w-full">
        {children(open)}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: up ? 8 : -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: up ? 6 : -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: EASE }}
            className={`absolute z-50 w-64 rounded-2xl border border-line bg-surface p-1.5 text-ink shadow-[0_24px_50px_-20px_rgb(31_42_36/0.45)] ${align === 'end' ? 'end-0' : 'start-0'} ${up ? 'bottom-full mb-2' : 'top-full mt-2'}`}
          >
            <div className="flex items-center gap-3 border-b border-line px-3 pb-3 pt-2">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold to-[#c48d2e] text-lg font-bold text-ink">{initial(user.displayName)}</span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate font-semibold">{user.displayName}</span>
                <span className="block text-xs text-muted">{ROLE_LABEL[user.role]}{user.code ? ` · ${user.code}` : ''}</span>
              </span>
            </div>
            <NavLink href={`${home}/password`} className="mt-1 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-paper">
              <Icon name="key" className="size-4 text-muted" />
              تغيير كلمة المرور
            </NavLink>
            <form action="/auth/signout" method="post" data-local="1">
              <button type="submit" className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-danger transition-colors hover:bg-danger-soft">
                <Icon name="logout" className="size-4" />
                تسجيل الخروج
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------------------------------------------------
   القائمة الجانبية (الحاسوب): خضراء بنقشة السدو، وتُطوى إلى أيقونات
--------------------------------------------------------------------- */
function Sidebar({ nav, home, user, schoolName, week, path, collapsed }: Omit<Props, 'children' | 'today' | 'initialCollapsed'> & { path: string; collapsed: boolean }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <SaduPattern id="side-sadu" opacity={0.055} />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -start-24 size-72 rounded-full bg-gold/15 blur-3xl" />

      <NavLink href={home} className={`relative flex items-center gap-3 pb-6 pt-6 transition-[padding] duration-300 ${collapsed ? 'justify-center px-0' : 'px-6'}`}>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-chalk/10 ring-1 ring-chalk/15">
          <LogoMark className="h-6 w-7" tone="light" />
        </span>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.span initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.2 }} className="min-w-0">
              <span className="block font-display text-[1.75rem] font-bold leading-none text-chalk">مِرقاة</span>
              <span className="mt-1 block truncate text-xs text-chalk/60">{schoolName}</span>
            </motion.span>
          )}
        </AnimatePresence>
      </NavLink>

      <nav aria-label="القائمة الرئيسية" className={`relative flex-1 overflow-y-auto overflow-x-hidden pb-4 [scrollbar-color:rgb(255_255_255/0.15)_transparent] [scrollbar-width:thin] ${collapsed ? 'px-3' : 'px-4'}`}>
        <LayoutGroup id="side">
          {nav.map((g, gi) => (
            <div key={gi} className={gi ? 'mt-5' : ''}>
              {g.title &&
                (collapsed ? (
                  <span aria-hidden className="mx-auto mb-2 block h-px w-6 bg-chalk/15" />
                ) : (
                  <p className="mb-1.5 px-3 text-xs font-semibold tracking-wide text-chalk/45">{g.title}</p>
                ))}
              <ul className="space-y-1">
                {g.items.map((item) => {
                  const on = isActive(path, item.href, home);
                  return (
                    <li key={item.href} className="group/item relative">
                      <NavLink
                        href={item.href}
                        aria-current={on ? 'page' : undefined}
                        aria-label={collapsed ? item.label : undefined}
                        title={collapsed ? item.label : undefined}
                        className={`relative flex items-center gap-3 rounded-xl py-2.5 text-[0.95rem] transition-colors duration-200 ${collapsed ? 'justify-center px-0' : 'px-3'} ${
                          on ? 'font-semibold text-board' : 'text-chalk/75 hover:bg-chalk/[0.08] hover:text-chalk'
                        }`}
                      >
                        {on && (
                          <motion.span
                            layoutId="side-active"
                            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                            className="absolute inset-0 rounded-xl bg-chalk shadow-[0_10px_24px_-12px_rgb(0_0_0/0.55)]"
                          />
                        )}
                        <Icon name={item.icon} className={`relative size-5 shrink-0 ${on ? 'text-board' : 'text-chalk/60'}`} />
                        {!collapsed && <span className="relative truncate">{item.label}</span>}
                        {on && !collapsed && <span aria-hidden className="relative ms-auto size-1.5 rounded-full bg-gold" />}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </LayoutGroup>
      </nav>

      {week && !collapsed && (
        <div className="relative mx-4 mb-3 rounded-2xl bg-chalk/[0.08] p-3.5 ring-1 ring-chalk/10">
          <p className="flex items-center justify-between text-xs text-chalk/60">
            الأسبوع الحالي
            <span aria-hidden className="flex h-3.5 items-end gap-0.5">
              {[35, 55, 75].map((h) => <span key={h} className="w-1 rounded-sm bg-chalk/40" style={{ height: `${h}%` }} />)}
              <span className="h-full w-1 rounded-sm bg-gold" />
            </span>
          </p>
          <p className="mt-1 font-bold text-chalk">{week.label}</p>
          <p className="text-xs text-chalk/60">{week.range}</p>
        </div>
      )}

      {/* بطاقة المستخدم */}
      <div className={`relative border-t border-chalk/10 ${collapsed ? 'p-2.5' : 'p-3'}`}>
        <AccountMenu user={user} home={home} align="start" up>
          {(open) => (
            <span className={`flex items-center gap-3 rounded-xl p-2 text-start transition-colors hover:bg-chalk/[0.08] ${open ? 'bg-chalk/[0.08]' : ''} ${collapsed ? 'justify-center' : ''}`}>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold to-[#c48d2e] text-lg font-bold text-ink ring-2 ring-chalk/20">{initial(user.displayName)}</span>
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-sm font-semibold text-chalk">{user.displayName}</span>
                    <span className="block truncate text-xs text-chalk/55">{ROLE_LABEL[user.role]}{user.code ? ` · ${user.code}` : ''}</span>
                  </span>
                  <Icon name="more" className="size-5 text-chalk/50" />
                </>
              )}
            </span>
          )}
        </AccountMenu>
      </div>

    </div>
  );
}

/* ---------------------------------------------------------------------
   الهيكل
--------------------------------------------------------------------- */
export function AppShell(props: Props) {
  return (
    <Providers>
      <FeedbackProvider>
        <ShellInner {...props} />
      </FeedbackProvider>
    </Providers>
  );
}

function ShellInner(props: Props) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(props.initialCollapsed);
  const [moreOpen, setMoreOpen] = useState(false);
  const current = findCurrent(props.nav, path, props.home);
  const tabs = tabsFor(props.user.role);
  const onTab = tabs.some((t) => isActive(path, t.href, props.home));
  const { hidden, scrolled } = useHideOnScroll();

  const toggle = () => {
    setCollapsed((c) => {
      document.cookie = `mirqat_sidebar=${c ? 'open' : 'collapsed'}; path=/; max-age=31536000; samesite=lax`;
      return !c;
    });
  };

  useEffect(() => setMoreOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = moreOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [moreOpen]);

  return (
    <>
      <Suspense>
        <NavProgress />
      </Suspense>
      <style>{`@media print{.mq-shell{display:block!important}}@media (min-width:1024px){.mq-shell{grid-template-columns:${collapsed ? '5.5rem' : '17.5rem'} minmax(0,1fr)}}`}</style>
        <div className="mq-shell min-h-dvh lg:grid lg:transition-[grid-template-columns] lg:duration-300">
          <aside className="sticky top-0 z-40 hidden h-dvh bg-board text-chalk lg:block print:!hidden">
            <Sidebar {...props} path={path} collapsed={collapsed} />
              {/* زر الطي على حافة القائمة */}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
        aria-expanded={!collapsed}
        className="absolute -end-3.5 top-[1.85rem] z-10 grid size-7 place-items-center rounded-full border border-line bg-surface text-board shadow-md transition-transform duration-200 hover:scale-110"
      >
        <Icon name="chevron" className={`size-4 transition-transform duration-300 ${collapsed ? '' : 'rotate-180'}`} />
      </button>
          </aside>

          <div className="flex min-w-0 flex-col">
            {/* الشريط العلوي */}
            <header
              className={`sticky top-0 z-30 border-b bg-paper/80 backdrop-blur-xl backdrop-saturate-150 transition-[transform,box-shadow,border-color] duration-300 ease-out-soft print:hidden ${
                hidden ? '-translate-y-full' : 'translate-y-0'
              } ${scrolled ? 'border-line/70 shadow-[0_10px_30px_-22px_rgb(31_42_36/0.5)]' : 'border-transparent lg:border-line/70'}`}
            >
              <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-2.5 px-4 pt-[env(safe-area-inset-top)] sm:px-8 lg:h-[4.25rem] lg:gap-3">
                <NavLink href={props.home} className="grid size-10 shrink-0 place-items-center rounded-xl bg-board lg:hidden" aria-label="الرئيسية">
                  <LogoMark className="h-5 w-6" tone="light" />
                </NavLink>
                <div className="min-w-0 flex-1">
                  {current?.group && <p className="truncate text-[0.7rem] font-medium text-muted sm:hidden">{current.group}</p>}
                  <nav aria-label="مسار الصفحة" className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
                    <NavLink href={props.home} className="transition-colors hover:text-board">الرئيسية</NavLink>
                    {current?.group && (<><Icon name="chevron" className="size-3" /><span>{current.group}</span></>)}
                    {current && current.item.href !== props.home && (<><Icon name="chevron" className="size-3" /><span className="font-medium text-board">{current.item.label}</span></>)}
                  </nav>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.h1
                      key={current?.item.href ?? path}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18, ease: EASE }}
                      className="truncate text-lg font-bold leading-tight sm:text-xl"
                    >
                      {current?.item.label ?? 'مِرقاة'}
                    </motion.h1>
                  </AnimatePresence>
                </div>

                <span className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-sm xl:flex">
                  <Icon name="calendar" className="size-4 text-board" />
                  <span className="font-medium">{props.today.day}</span>
                  <span className="text-muted">{props.today.date}</span>
                  <span className="text-xs text-muted/80">· {props.today.hijri}</span>
                </span>

                <div className="flex items-center gap-2 lg:hidden">
                  {props.user.role === 'admin' && <QuickSearch />}
                  <TodayButton today={props.today} week={props.week} />
                </div>

                {props.user.role === 'admin' && (
                  <form action="/staff/students" className="relative hidden lg:block" role="search">
                    <Icon name="search" className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-4 text-muted" />
                    <input
                      name="q"
                      aria-label="بحث عن طالب"
                      placeholder="ابحث عن طالب…"
                      className="h-11 w-52 rounded-full border border-line bg-surface pe-4 ps-10 text-sm transition-[width,border-color,box-shadow] duration-300 placeholder:text-muted/70 focus:w-72 focus:border-board focus:outline-none focus:ring-4 focus:ring-gold/20"
                    />
                  </form>
                )}

                <AccountMenu user={props.user} home={props.home} align="end">
                  {(open) => (
                    <span className={`flex items-center gap-2.5 rounded-full border p-1 transition-colors sm:pe-3 ${open ? 'border-board/30 bg-surface' : 'border-transparent hover:border-line hover:bg-surface'}`}>
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold to-[#c48d2e] font-bold text-ink">{initial(props.user.displayName)}</span>
                      <span className="hidden text-start leading-tight sm:block">
                        <span className="block max-w-36 truncate text-sm font-semibold">{props.user.displayName}</span>
                        <span className="block text-xs text-muted">{ROLE_LABEL[props.user.role]}</span>
                      </span>
                      <Icon name="chevron" className={`hidden size-4 text-muted transition-transform duration-300 sm:block ${open ? 'rotate-90' : '-rotate-90'}`} />
                    </span>
                  )}
                </AccountMenu>
              </div>
            </header>

            <main className="flex-1 px-4 pb-32 pt-6 sm:px-8 lg:pb-12 lg:pt-8 print:p-0">
              <motion.div
                key={path}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.38, ease: EASE }}
                className="mx-auto max-w-[90rem]"
              >
                {props.children}
              </motion.div>
            </main>
          </div>
      </div>

      {/* الشريط السفلي العائم (الجوال) */}
      <nav aria-label="التنقل السريع" className="print:hidden fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 lg:hidden">
        <ul className="relative mx-auto grid h-[4.25rem] max-w-md grid-cols-5 overflow-hidden rounded-[1.4rem] bg-board px-1.5 text-chalk shadow-[0_18px_40px_-14px_rgb(21_48_42/0.7)] ring-1 ring-black/5">
          <SaduPattern id="tab-sadu" opacity={0.05} />
          <LayoutGroup id="tabs">
            {[...tabs, { href: '#more', label: 'المزيد', icon: 'more' } as NavItem].map((t) => {
              const isMore = t.href === '#more';
              const on = isMore ? moreOpen || !onTab : isActive(path, t.href, props.home) && !moreOpen;
              const inner = (
                <>
                  {on && (
                    <motion.span
                      layoutId="tab-active"
                      transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                      className="absolute inset-x-1 inset-y-1.5 rounded-2xl bg-chalk"
                    />
                  )}
                  <Icon name={t.icon} className={`relative size-[1.35rem] transition-colors ${on ? 'text-board' : 'text-chalk/70'}`} />
                  <span className={`relative text-[0.7rem] transition-colors ${on ? 'font-bold text-board' : 'text-chalk/70'}`}>{t.label}</span>
                </>
              );
              const cls = 'relative flex flex-1 flex-col items-center justify-center gap-1 transition-transform active:scale-95';
              return (
                <li key={t.href} className="relative flex">
                  {isMore ? (
                    <button type="button" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen} className={cls}>{inner}</button>
                  ) : (
                    <NavLink href={t.href} className={cls}>{inner}</NavLink>
                  )}
                </li>
              );
            })}
          </LayoutGroup>
        </ul>
      </nav>

      {/* "المزيد" */}
      <AnimatePresence>
        {moreOpen && (
          <div className="fixed inset-0 z-30 lg:hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMoreOpen(false)} className="absolute inset-0 bg-ink/40 backdrop-blur-[3px]" />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.4 }}
              onDragEnd={(_, i) => i.offset.y > 90 && setMoreOpen(false)}
              className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[1.75rem] bg-surface px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl"
            >
              <span className="mx-auto mb-4 block h-1.5 w-12 rounded-full bg-line" />
              {/* بطاقة المستخدم */}
              <div className="relative mb-5 overflow-hidden rounded-2xl bg-board p-4 text-chalk">
                <SaduPattern id="more-sadu" opacity={0.06} />
                <div className="relative flex items-center gap-3">
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold to-[#c48d2e] text-xl font-bold text-ink ring-2 ring-chalk/25">{initial(props.user.displayName)}</span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate font-bold">{props.user.displayName}</span>
                    <span className="block text-sm text-chalk/65">{ROLE_LABEL[props.user.role]}{props.user.code ? ` · ${props.user.code}` : ''}</span>
                  </span>
                </div>
                <div className="relative mt-3 grid grid-cols-2 gap-2">
                  <NavLink href={`${props.home}/password`} className="flex items-center justify-center gap-1.5 rounded-xl bg-chalk/10 py-2.5 text-sm transition-colors active:bg-chalk/20">
                    <Icon name="key" className="size-4" /> كلمة المرور
                  </NavLink>
                  <form action="/auth/signout" method="post" data-local="1">
                    <button type="submit" className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-chalk/10 py-2.5 text-sm transition-colors active:bg-danger/40">
                      <Icon name="logout" className="size-4" /> خروج
                    </button>
                  </form>
                </div>
              </div>
              {props.nav.map((g, gi) => (
                <div key={gi} className="mb-4">
                  {g.title && <p className="mb-2 px-1 text-xs font-semibold text-muted">{g.title}</p>}
                  <ul className="grid grid-cols-3 gap-2">
                    {g.items.map((item, ii) => {
                      const on = isActive(path, item.href, props.home);
                      return (
                        <motion.li key={item.href} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * (gi * 3 + ii), duration: 0.25 }}>
                          <NavLink
                            href={item.href}
                            className={`flex h-full flex-col items-center gap-2 rounded-2xl border px-2 py-3.5 text-center text-xs font-medium transition-colors active:scale-95 ${on ? 'border-board bg-board text-chalk' : 'border-line bg-paper/60 text-ink'}`}
                          >
                            <span className={`grid size-9 place-items-center rounded-xl ${on ? 'bg-chalk/15 text-gold' : 'bg-board/10 text-board'}`}>
                              <Icon name={item.icon} className="size-5" />
                            </span>
                            <span className="leading-tight">{item.label}</span>
                          </NavLink>
                        </motion.li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
