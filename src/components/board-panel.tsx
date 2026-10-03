import Link from 'next/link';
import { ViewTransition } from 'react';
import { Brand } from '@/components/motion';
import { SaduPattern } from '@/components/home/sadu-pattern';

/**
 * لوحة الهوية في صفحات الدخول. هي نفسها خلفية البطل في الرئيسية:
 * عند الضغط على "تسجيل الدخول" ينكمش الأخضر الكبير إلى هذه اللوحة (انتقال "board").
 * الدرج يصعد عند أول فتح، واسم البوابة يتبدل بانسياب عند التنقل بين البوابتين.
 */
const STEPS = [
  { h: 27, o: 0.3 },
  { h: 44, o: 0.42 },
  { h: 61, o: 0.55 },
  { h: 78, o: 0.68 },
];

export function BoardPanel({ schoolName, portal }: { schoolName: string | null; portal: string }) {
  return (
    <ViewTransition name="board" share="morph" default="none">
      <section
        aria-label="مِرقاة"
        className="relative isolate flex flex-col justify-between overflow-hidden bg-board px-6 pt-8 text-chalk sm:px-10 lg:min-h-dvh lg:pt-14"
      >
        <SaduPattern id="panel-sadu" opacity={0.07} />
        <div aria-hidden className="absolute -start-32 bottom-10 -z-10 size-96 rounded-full bg-gold/15 blur-3xl" />

        <div className="relative">
          <Link href="/" className="inline-block" aria-label="مِرقاة — الرئيسية">
            <Brand>
              <span className="block font-display text-[clamp(3.25rem,9vw,7.5rem)] font-bold leading-none">مِرقاة</span>
            </Brand>
          </Link>
          <ViewTransition name="portal-label">
            <p className="mt-4 text-lg font-medium text-gold">{portal}</p>
          </ViewTransition>
          <p className="mt-1 max-w-xs text-chalk/75">{schoolName ?? 'مدرسة دار الهدى'}</p>
        </div>

        {/* الدرج يصعد مع اتجاه القراءة، والدرجة الأعلى ذهبية تصل أخيرًا */}
        <div aria-hidden className="relative mt-8 flex h-24 items-end gap-2 lg:h-60">
          {STEPS.map((s, i) => (
            <div
              key={s.h}
              className="flex-1 origin-bottom animate-rise rounded-t-md bg-chalk"
              style={{ height: `${s.h}%`, opacity: s.o, animationDelay: `${120 + i * 110}ms` }}
            />
          ))}
          <div
            className="h-[95%] flex-1 origin-bottom animate-rise rounded-t-md bg-gold shadow-[0_0_50px_-12px_rgb(217_164_65/0.9)]"
            style={{ animationDelay: '600ms' }}
          />
        </div>
      </section>
    </ViewTransition>
  );
}
