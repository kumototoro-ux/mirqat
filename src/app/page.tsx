import Link from 'next/link';
import { Brand, PageTransition } from '@/components/motion';

// شعار الدرجات من الموقع القديم: أربع خضراء متدرجة والخامسة ذهبية
const BARS = [
  { x: 4, y: 58, h: 24, fill: '#356854', o: 0.55 },
  { x: 22, y: 46, h: 36, fill: '#356854', o: 0.7 },
  { x: 40, y: 34, h: 48, fill: '#356854', o: 0.85 },
  { x: 58, y: 22, h: 60, fill: '#356854', o: 1 },
  { x: 76, y: 10, h: 72, fill: '#d9a441', o: 1 },
];

/**
 * الجذر لغير المسجّلين: اختيار البوابة. المسجّل يوجّهه proxy.ts لصفحته مباشرة.
 * اسم المنصة هنا هو نفسه الذي ينتقل إلى لوحة الدخول عند اختيار البوابة.
 */
export default function Root() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-12">
      <svg width="88" height="72" viewBox="0 0 110 90" aria-hidden className="mb-5">
        {BARS.map((b, i) => (
          <rect
            key={b.x}
            x={b.x}
            y={b.y}
            width="16"
            height={b.h}
            rx="2"
            fill={b.fill}
            fillOpacity={b.o}
            className="origin-bottom animate-rise [transform-box:fill-box]"
            style={{ animationDelay: `${i * 90}ms` }}
          />
        ))}
      </svg>
      <Brand>
        <h1 className="font-display text-5xl font-bold text-board">مِرقاة</h1>
      </Brand>
      <PageTransition>
        <div className="flex w-full max-w-md animate-fade-up flex-col items-center [animation-delay:350ms]">
          <p className="mt-3 text-muted">اختر بوابة الدخول</p>
          <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
            <Link href="/student/login" className="btn-primary py-4 text-base">بوابة الطالب</Link>
            <Link href="/login" className="btn-quiet py-4 text-base">بوابة الموظفين</Link>
          </div>
        </div>
      </PageTransition>
    </main>
  );
}
