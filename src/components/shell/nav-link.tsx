'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';

/*
  الرابط المضغوط "قيد الانتقال": تُبرز القائمة الجانبية والسفلية وعنوان الصفحة الوجهةَ فور الضغط،
  لا بعد اكتمال تحميل الصفحة — فيشعر المستخدم أن التنقل استجاب لحظيًا.
*/
let pending: string | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
let timer: ReturnType<typeof setTimeout> | undefined;
export function setPendingHref(href: string | null) {
  if (pending === href) return;
  pending = href;
  clearTimeout(timer);
  // إن فشل الانتقال أو أُلغي لا يبقى الإبراز معلّقًا
  if (href) timer = setTimeout(() => setPendingHref(null), 12000);
  emit();
}
export function usePendingHref() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => pending,
    () => null,
  );
}

/**
 * رابط يُجهَّز مسبقًا عند المرور أو اللمس فقط، لا لمجرد ظهوره في الشاشة:
 * القائمة فيها ~17 رابطًا، والتجهيز التلقائي لكلها مع كل صفحة يعني 17 طلبًا بلا داعٍ.
 */
export function NavLink(props: React.ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={intent ? null : false}
      onClick={(e) => {
        props.onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const href = typeof props.href === 'string' ? props.href : props.href.pathname ?? null;
        if (href && href.startsWith('/') && href.split('?')[0] !== location.pathname) setPendingHref(href.split('?')[0]);
      }}
      onMouseEnter={(e) => {
        setIntent(true);
        props.onMouseEnter?.(e);
      }}
      onTouchStart={(e) => {
        setIntent(true);
        props.onTouchStart?.(e);
      }}
      onFocus={(e) => {
        setIntent(true);
        props.onFocus?.(e);
      }}
    />
  );
}
