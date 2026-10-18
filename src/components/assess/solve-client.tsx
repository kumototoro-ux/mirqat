'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/shell/icons';
import { FeedbackProvider } from '@/components/feedback';
import { Providers } from '@/components/providers';
import { browserClient } from '@/lib/supabase/browser';
import { FormPlayer, type SessionPayload } from './form-player';

/**
 * يبدأ الجلسة (أو يستكملها) من المتصفح عند فتح الصفحة فعلًا — لا عند التحميل المسبق.
 * الأسئلة تصل بلا أي إجابة صحيحة، مع ساعة الخادم للعدّاد.
 */
export function SolveClient({ id }: { id: number }) {
  const router = useRouter();
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'open'; payload: SessionPayload }>({ kind: 'loading' });

  useEffect(() => {
    let alive = true;
    (async () => {
      for (let i = 0; i < 4; i++) {
        const { data, error } = await browserClient().rpc('start_form_session', { p_assessment_id: id });
        if (!alive) return;
        if (!error) {
          const p = data as SessionPayload | { status: 'submitted'; reason: string };
          if (p.status === 'submitted') {
            router.replace(`/student/tasks/${id}`);
            return;
          }
          setState({ kind: 'open', payload: p as SessionPayload });
          return;
        }
        // أخطاء منطقية (مغلق، استنفدت المحاولات…) تُعرض مباشرة؛ أخطاء الشبكة تُعاد
        if (!/fetch|network|Failed|timeout|503|502/i.test(error.message)) {
          setState({ kind: 'error', message: error.message.replace(/^FORBIDDEN:\s*/, '') });
          return;
        }
        await new Promise((r) => setTimeout(r, 800 * 2 ** i));
      }
      if (alive) setState({ kind: 'error', message: 'تعذّر الاتصال. تحقق من الإنترنت ثم أعد المحاولة' });
    })();
    return () => {
      alive = false;
    };
  }, [id, router]);

  return (
    <Providers>
      <FeedbackProvider>
        {state.kind === 'open' ? (
          <FormPlayer payload={state.payload} backHref="/student/tasks" />
        ) : state.kind === 'error' ? (
          <div className="grid min-h-dvh place-items-center bg-paper px-4">
            <div className="w-full max-w-sm rounded-[1.6rem] border border-line bg-surface p-7 text-center">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-danger-soft text-danger"><Icon name="alert" className="size-7" /></span>
              <p className="mt-4 font-bold">{state.message}</p>
              <Link href={`/student/tasks/${id}`} className="btn-primary mt-6 w-full py-3">رجوع</Link>
            </div>
          </div>
        ) : (
          <div className="min-h-dvh bg-paper">
            <div className="h-14 border-b border-line bg-surface" />
            <div className="mx-auto max-w-3xl space-y-4 p-4">
              <div className="skeleton h-6 w-1/3" />
              <div className="rounded-[1.4rem] border border-line bg-surface p-6">
                <div className="skeleton h-5 w-3/4" />
                <div className="skeleton mt-6 h-14 w-full" />
                <div className="skeleton mt-2.5 h-14 w-full" />
                <div className="skeleton mt-2.5 h-14 w-full" />
              </div>
              <p className="text-center text-sm text-muted">جارٍ تجهيز النموذج…</p>
            </div>
          </div>
        )}
      </FeedbackProvider>
    </Providers>
  );
}
