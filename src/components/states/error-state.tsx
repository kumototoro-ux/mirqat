'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { motion } from 'motion/react';
import { Icon } from '@/components/shell/icons';

/** واجهة خطأ موحّدة: رسالة مفهومة، إعادة المحاولة، والعودة للرئيسية — بلا تفاصيل تقنية للمستخدم */
export function ErrorState({ error, reset, home }: { error: Error & { digest?: string }; reset: () => void; home: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  const session = /JWT|AUTH_REQUIRED|session/i.test(error.message);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative mx-auto mt-6 grid max-w-xl place-items-center overflow-hidden rounded-[1.75rem] border border-line bg-surface px-6 py-14 text-center">
      <div aria-hidden className="absolute -top-24 size-72 rounded-full bg-gold/10 blur-3xl" />
      <span className="relative grid size-16 place-items-center rounded-2xl bg-danger-soft text-danger">
        <Icon name="alert" className="size-8" />
      </span>
      <h1 className="relative mt-4 text-xl font-bold">{offline ? 'لا يوجد اتصال بالإنترنت' : session ? 'انتهت الجلسة' : 'تعذّر تحميل هذه الصفحة'}</h1>
      <p className="relative mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
        {offline ? 'تحقق من اتصالك ثم أعد المحاولة. لم يُفقد شيء مما حفظته.' : session ? 'سجّل الدخول من جديد لتكمل.' : 'حدث خطأ غير متوقع. أعد المحاولة، وإن تكرر فأبلغ الإدارة برمز الخطأ.'}
      </p>
      {error.digest && !offline && <p className="relative mt-2 rounded-lg bg-paper px-2.5 py-1 font-mono text-xs text-muted" dir="ltr">{error.digest}</p>}
      <div className="relative mt-6 flex flex-wrap justify-center gap-2">
        {session ? (
          <Link href="/auth/signout?reason=session" className="btn-primary">تسجيل الدخول</Link>
        ) : (
          <button type="button" onClick={reset} className="btn-primary"><Icon name="undo" className="size-4" /> إعادة المحاولة</button>
        )}
        <Link href={home} className="btn-quiet"><Icon name="home" className="size-4" /> الرئيسية</Link>
      </div>
    </motion.div>
  );
}

/** صفحة غير موجودة */
export function NotFoundState({ home, label = 'الرئيسية' }: { home: string; label?: string }) {
  return (
    <div className="relative mx-auto mt-6 grid max-w-xl place-items-center overflow-hidden rounded-[1.75rem] border border-line bg-surface px-6 py-14 text-center">
      <div aria-hidden className="absolute -top-24 size-72 rounded-full bg-gold/10 blur-3xl" />
      <p className="relative font-display text-6xl font-bold text-board/20">404</p>
      <h1 className="relative mt-2 text-xl font-bold">الصفحة غير موجودة</h1>
      <p className="relative mt-1.5 max-w-sm text-sm text-muted">ربما نُقلت أو حُذفت، أو أن الرابط غير صحيح.</p>
      <Link href={home} className="btn-primary relative mt-6"><Icon name="home" className="size-4" /> {label}</Link>
    </div>
  );
}
