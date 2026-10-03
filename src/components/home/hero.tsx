import { ViewTransition } from 'react';
import { SaduPattern } from './sadu-pattern';

/** بطاقة صغيرة تطفو فوق الدرج — مشهد من يوم الطالب داخل المنصة */
function FloatCard({
  className,
  delay,
  icon,
  title,
  sub,
}: {
  className: string;
  delay: number;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <div className={`absolute animate-fade-up ${className}`} style={{ animationDelay: `${delay}ms` }}>
      <div
        className="flex animate-float items-center gap-3 rounded-2xl bg-surface/95 px-4 py-3 text-ink shadow-[0_20px_40px_-18px_rgb(0_0_0/0.55)] ring-1 ring-black/5"
        style={{ animationDelay: `${delay + 600}ms` }}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-board/10 text-board">{icon}</span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block text-xs text-muted">{sub}</span>
        </span>
      </div>
    </div>
  );
}

const STEPS = [30, 46, 62, 78];

export function Hero({ schoolName }: { schoolName: string }) {
  return (
    <ViewTransition name="board" share="morph" default="none">
      <section id="top" className="relative isolate overflow-hidden bg-board text-chalk">
        <SaduPattern id="hero-sadu" />
        {/* توهج خفيف خلف الدرج يعطي العمق */}
        <div aria-hidden className="absolute -start-40 top-1/3 -z-10 size-[38rem] rounded-full bg-gold/15 blur-3xl" />

        <div className="relative mx-auto grid max-w-6xl items-center gap-x-12 gap-y-4 px-5 pt-14 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
          <div className="lg:pb-28">
            <p className="inline-flex animate-fade-up items-center gap-2 rounded-full border border-chalk/20 bg-chalk/10 px-3.5 py-1 text-sm text-chalk/90">
              <span className="size-1.5 rounded-full bg-gold" aria-hidden />
              {schoolName}
            </p>
            <h1 className="mt-6 animate-fade-up text-[clamp(2.4rem,5.4vw,4.1rem)] font-bold leading-[1.15] [animation-delay:120ms]">
              كل يوم درجة جديدة
              <br />
              <span className="text-gold">نحو التميّز</span>
            </h1>
            <p className="mt-6 max-w-lg animate-fade-up text-lg leading-relaxed text-chalk/80 [animation-delay:240ms]">
              مِرقاة منصة المدرسة التعليمية: الجدول والواجبات والاختبارات والنتائج في مكان واحد، للطالب
              والمعلم والإدارة.
            </p>
            <div className="mt-9 flex animate-fade-up flex-wrap gap-3 [animation-delay:360ms]">
              <a
                href="#beneficiaries"
                className="btn rounded-full bg-gold px-7 py-3.5 text-base text-ink hover:bg-[#e3b25a] hover:shadow-[0_10px_28px_-10px_rgb(217_164_65/0.9)]"
              >
                ادخل من بوابتك
              </a>
              <a
                href="#about"
                className="btn rounded-full border border-chalk/30 px-7 py-3.5 text-base text-chalk hover:border-chalk/60 hover:bg-chalk/10"
              >
                تعرّف على المنصة
              </a>
            </div>
          </div>

          {/* المشهد: درج مِرقاة وعليه بطاقات من يوم دراسي */}
          <div aria-hidden className="relative mx-auto mt-6 h-[20rem] w-full max-w-md self-end sm:h-[26rem] lg:mt-0">
            <div className="absolute inset-x-0 bottom-0 flex h-[78%] items-end gap-2.5">
              {STEPS.map((h, i) => (
                <div
                  key={h}
                  className="flex-1 origin-bottom animate-rise rounded-t-lg bg-chalk"
                  style={{ height: `${h}%`, opacity: 0.18 + i * 0.12, animationDelay: `${200 + i * 120}ms` }}
                />
              ))}
              <div
                className="h-[96%] flex-1 origin-bottom animate-rise rounded-t-lg bg-gold shadow-[0_0_60px_-10px_rgb(217_164_65/0.8)]"
                style={{ animationDelay: '700ms' }}
              />
            </div>
            <FloatCard
              className="start-0 top-[44%] sm:-start-6"
              delay={900}
              title="واجب الرياضيات"
              sub="تم التسليم"
              icon={
                <svg viewBox="0 0 20 20" className="size-5"><path d="m4.5 10.5 3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              }
            />
            <FloatCard
              className="end-4 top-[16%] sm:-end-4"
              delay={1100}
              title="الحصة القادمة"
              sub="العلوم، الحصة الثالثة"
              icon={
                <svg viewBox="0 0 20 20" className="size-5"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M10 6v4l2.5 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              }
            />
            <FloatCard
              className="-top-2 start-[18%]"
              delay={1300}
              title="الاختبار القصير"
              sub="9 من 10"
              icon={
                <svg viewBox="0 0 20 20" className="size-5"><path d="m10 2.8 2.2 4.5 4.9.7-3.6 3.5.9 4.9-4.4-2.3-4.4 2.3.9-4.9L2.9 8l4.9-.7z" fill="currentColor" /></svg>
              }
            />
          </div>
        </div>

      </section>
    </ViewTransition>
  );
}
