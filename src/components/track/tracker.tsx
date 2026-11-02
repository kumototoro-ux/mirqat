'use client';

import { useEffect } from 'react';
import { useReportWebVitals } from 'next/web-vitals';
import { reportClient, type ClientEvent } from '@/lib/track/actions';

/* =====================================================================
   مركز التتبع في المتصفح: أخطاء الواجهة + بطء الصفحات عند المستخدم الفعلي
   تُجمع وتُرسل دفعة واحدة كل ثانيتين (حد 20 حدثًا لكل صفحة) — لا تبطئ شيئًا.
   ===================================================================== */
const SLOW_LCP = 4000; // ظهور المحتوى الرئيسي
const SLOW_INP = 600; // الاستجابة بعد الضغط

let queue: ClientEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let sent = 0;
function push(e: ClientEvent) {
  if (sent >= 20) return;
  sent++;
  queue.push(e);
  if (!timer) timer = setTimeout(flush, 2000);
}
function flush() {
  timer = null;
  const batch = queue.splice(0, 5);
  if (batch.length) reportClient(batch).catch(() => {});
  if (queue.length) timer = setTimeout(flush, 2000);
}

export function Tracker() {
  useReportWebVitals((m) => {
    const slow = (m.name === 'LCP' && m.value >= SLOW_LCP) || (m.name === 'INP' && m.value >= SLOW_INP);
    if (!slow) return;
    const conn = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType;
    push({ action: 'perf.page', path: location.pathname, duration_ms: Math.round(m.value), details: { metric: m.name, rating: m.rating, net: conn ?? '', width: innerWidth } });
  });

  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      // أخطاء الإضافات والسكربتات الخارجية لا تخصنا
      if (!e.message || (e.filename && !e.filename.startsWith(location.origin))) return;
      push({ action: 'client.error', message: e.message, path: location.pathname, details: { source: e.filename?.replace(location.origin, '') ?? '', line: e.lineno, browser: navigator.userAgent.slice(0, 120) } });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = String((e.reason as Error)?.message ?? e.reason ?? '');
      if (!msg || /NEXT_REDIRECT|AbortError|aborted/i.test(msg)) return;
      push({ action: 'client.error', message: msg, path: location.pathname, details: { kind: 'promise' } });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}

/** لصفحات الخطأ: تسجيل ما ظهر للمستخدم مع رمزه */
export function reportBoundary(error: Error & { digest?: string }) {
  push({ action: 'client.error', message: error.message || 'صفحة الخطأ', path: location.pathname, details: { digest: error.digest ?? '', boundary: true } });
}
