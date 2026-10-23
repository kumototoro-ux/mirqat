'use client';

import { useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

/*
  التنقل داخل الصفحة نفسها (تبويب، فصل دراسي، فلتر في الرابط ?tab=…):
  Next لا يُظهر loading.tsx هنا لأن المسار لم يتغير، فتبقى الصفحة القديمة جامدة حتى يصل الجديد.
  هذا المخزن يلتقط الضغط فورًا، و<PendingSwap> يعرض هيكل التحميل مكان المحتوى حتى يصل.
*/

let pending: string | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
let timer: ReturnType<typeof setTimeout> | undefined;

export function setPendingSearch(href: string | null) {
  if (pending === href) return;
  pending = href;
  clearTimeout(timer);
  if (href) timer = setTimeout(() => setPendingSearch(null), 15000);
  emit();
}

/** يعيد الرابط الوجهة إن كان انتقالًا داخل الصفحة الحالية ولم يكتمل بعد */
export function usePendingSearch(): URL | null {
  const href = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => pending,
    () => null,
  );
  const path = usePathname();
  if (!href) return null;
  const url = new URL(href, 'http://x');
  return url.pathname === path ? url : null;
}

const sameSearch = (a: URLSearchParams, b: URLSearchParams) => {
  const s = (p: URLSearchParams) => [...p.entries()].sort().join('&');
  return s(a) === s(b);
};

/** يُستدعى قبل router.push لرابط في الصفحة نفسها */
export function markSearchNav(href: string) {
  if (typeof window === 'undefined') return;
  const url = new URL(href, location.href);
  if (url.origin !== location.origin || url.pathname !== location.pathname) return;
  if (sameSearch(url.searchParams, new URLSearchParams(location.search))) return;
  setPendingSearch(url.pathname + url.search);
}

/** يلتقط كل ضغطة على رابط داخلي يغيّر معاملات الرابط فقط (يُركَّب مرة في الهيكل) */
export function useSearchNavTracker() {
  const path = usePathname();
  useEffect(() => setPendingSearch(null), [path]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      markSearchNav(a.href);
    };
    // مرحلة الالتقاط: Link في Next يُلغي السلوك الافتراضي (preventDefault) للتنقل داخل التطبيق
    document.addEventListener('click', onClick, true);
    const onPop = () => setPendingSearch(null);
    window.addEventListener('popstate', onPop);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPop);
    };
  }, []);
}

/**
 * يعرض هيكل التحميل مكان المحتوى أثناء الانتقال داخل الصفحة، ويعود للمحتوى فور وصول الجديد.
 * fallback قد يكون دالة تأخذ الرابط الوجهة لتختار الهيكل المناسب للتبويب المقصود.
 */
export function PendingSwap({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode | ((to: URL) => React.ReactNode) }) {
  const to = usePendingSearch();
  const sp = useSearchParams();
  const key = sp.toString();
  useEffect(() => {
    // وصل المحتوى الجديد (تغيّرت معاملات الرابط) → أزل حالة الانتظار
    setPendingSearch(null);
  }, [key]);
  if (to && !sameSearch(to.searchParams, sp)) return <>{typeof fallback === 'function' ? fallback(to) : fallback}</>;
  return <>{children}</>;
}

/**
 * رابط تبويب/فلتر يُبرز نفسه فور الضغط (قبل وصول الصفحة)، ويرجع للحالة الفعلية بعدها.
 * on / off: أصناف الحالتين، base: المشترك.
 */
export function PendingLink({ href, active, base = '', on, off, children, ...rest }: Omit<React.ComponentProps<typeof Link>, 'href' | 'className'> & { href: string; active: boolean; base?: string; on: string; off: string }) {
  const to = usePendingSearch();
  let isOn = active;
  if (to) {
    const u = new URL(href, 'http://x');
    isOn = u.pathname === to.pathname && sameSearch(u.searchParams, to.searchParams);
  }
  return (
    <Link href={href} aria-current={isOn ? 'page' : undefined} className={`${base} ${isOn ? on : off}`} {...rest}>
      {children}
    </Link>
  );
}
