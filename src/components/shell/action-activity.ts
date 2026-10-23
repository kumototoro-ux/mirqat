'use client';

import { useSyncExternalStore } from 'react';

/*
  نشاط الخادم العام: كل حفظ أو تعديل أو حذف في المنصة يمر عبر Server Action
  (طلب fetch بترويسة Next-Action). نعدّ الطلبات الجارية منها، فيظهر شريط تقدّم أعلى الشاشة
  أثناء أي عملية — دون تعديل كل زر في كل صفحة.
*/
let inflight = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function isAction(input: RequestInfo | URL, init?: RequestInit) {
  const h = init?.headers ?? (input instanceof Request ? input.headers : undefined);
  if (!h) return false;
  if (h instanceof Headers) return h.has('next-action');
  if (Array.isArray(h)) return h.some(([k]) => k.toLowerCase() === 'next-action');
  return Object.keys(h).some((k) => k.toLowerCase() === 'next-action');
}

export function installActionTracker() {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __mqTracked?: boolean };
  if (w.__mqTracked) return;
  w.__mqTracked = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isAction(input, init)) return original(input, init);
    inflight++;
    emit();
    try {
      return await original(input, init);
    } finally {
      inflight = Math.max(0, inflight - 1);
      emit();
    }
  };
}

export function useActionsInFlight() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => inflight,
    () => 0,
  );
}
