import Link from 'next/link';

/**
 * الجذر لغير المسجّلين: اختيار البوابة. المسجّل يوجّهه proxy.ts لصفحته مباشرة.
 */
export default function Root() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-12">
      <svg width="88" height="72" viewBox="0 0 110 90" aria-hidden className="mb-5">
        <rect x="4" y="58" width="16" height="24" rx="2" fill="#356854" fillOpacity=".55" />
        <rect x="22" y="46" width="16" height="36" rx="2" fill="#356854" fillOpacity=".7" />
        <rect x="40" y="34" width="16" height="48" rx="2" fill="#356854" fillOpacity=".85" />
        <rect x="58" y="22" width="16" height="60" rx="2" fill="#356854" />
        <rect x="76" y="10" width="16" height="72" rx="2" fill="#d9a441" />
      </svg>
      <h1 className="font-display text-5xl font-bold text-board">مِرقاة</h1>
      <p className="mt-3 text-muted">اختر بوابة الدخول</p>
      <div className="mt-8 grid w-full max-w-md gap-3 sm:grid-cols-2">
        <Link href="/student/login" className="btn-primary py-4 text-base">بوابة الطالب</Link>
        <Link href="/login" className="btn-quiet py-4 text-base">بوابة الموظفين</Link>
      </div>
    </main>
  );
}
