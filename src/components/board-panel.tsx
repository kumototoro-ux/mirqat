import { Brand } from '@/components/motion';

/**
 * لوحة الهوية في صفحات الدخول: شعار مِرقاة (الدرجات الخمس كما في الموقع القديم —
 * أربع خضراء والأخيرة ذهبية) مكبّرًا ليصير الدرج نفسه أرضية اللوحة.
 * عند فتح الصفحة يصعد الدرج درجةً بعد درجة — الحركة الوحيدة التي تبدأ بلا ضغطة.
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
        <Brand>
          <p className="font-display text-[clamp(3.25rem,9vw,7.5rem)] font-bold leading-none">مِرقاة</p>
        </Brand>
        <p className="mt-4 animate-fade-up text-lg font-medium text-gold [animation-delay:700ms]">{portal}</p>
        <p className="mt-1 max-w-xs animate-fade-up text-chalk/75 [animation-delay:800ms]">
          {schoolName ?? 'مدرسة دار الهدى'}
        </p>
      </div>

      {/* الدرج يصعد مع اتجاه القراءة، والدرجة الأعلى ذهبية تصل أخيرًا */}
      <div aria-hidden className="mt-8 flex h-24 items-end gap-1.5 lg:h-60">
        {STEPS.map((s, i) => (
          <div
            key={s.h}
            className="flex-1 origin-bottom animate-rise rounded-t-sm bg-chalk"
            style={{ height: `${s.h}%`, opacity: s.o, animationDelay: `${120 + i * 110}ms` }}
          />
        ))}
        <div
          className="h-[95%] flex-1 origin-bottom animate-rise rounded-t-sm bg-gold"
          style={{ animationDelay: '600ms' }}
        />
      </div>
    </section>
  );
}
