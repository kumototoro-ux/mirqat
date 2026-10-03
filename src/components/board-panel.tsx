/**
 * لوحة الهوية في صفحات الدخول: شعار مِرقاة (الدرجات الخمس كما في الموقع القديم —
 * أربع خضراء والأخيرة ذهبية) مكبّرًا ليصير الدرج نفسه أرضية اللوحة.
 */
const STEPS = [
  { h: 27, o: 0.35 },
  { h: 44, o: 0.5 },
  { h: 61, o: 0.65 },
  { h: 78, o: 0.8 },
];

export function BoardPanel({ schoolName, portal }: { schoolName: string | null; portal: string }) {
  return (
    <section
      aria-label="مِرقاة"
      className="relative flex flex-col justify-between overflow-hidden bg-board px-6 pt-8 text-chalk sm:px-10 lg:min-h-dvh lg:pt-14"
    >
      <div>
        <p className="font-display text-[clamp(3.25rem,9vw,7.5rem)] font-bold leading-none">مِرقاة</p>
        <p className="mt-4 text-lg font-medium text-gold">{portal}</p>
        <p className="mt-1 max-w-xs text-chalk/75">{schoolName ?? 'مدرسة دار الهدى'}</p>
      </div>

      {/* الدرج يصعد مع اتجاه القراءة، والدرجة الأعلى ذهبية */}
      <div aria-hidden className="mt-8 flex h-24 items-end gap-1.5 lg:h-60">
        {STEPS.map((s) => (
          <div key={s.h} className="flex-1 rounded-t-sm bg-chalk" style={{ height: `${s.h}%`, opacity: s.o }} />
        ))}
        <div className="h-[95%] flex-1 rounded-t-sm bg-gold" />
      </div>
    </section>
  );
}
