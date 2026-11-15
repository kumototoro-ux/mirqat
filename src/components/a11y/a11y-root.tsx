'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { A11Y_COOKIE, a11yAttrs, isDefault, serializeA11y, type A11y } from '@/lib/a11y';

const YEAR = 60 * 60 * 24 * 365;

function apply(a: A11y) {
  const el = document.documentElement;
  for (const [k, v] of Object.entries(a11yAttrs(a))) {
    if (v === undefined) el.removeAttribute(k);
    else el.setAttribute(k, v);
  }
}

/** يلفّ الموقع: يضبط الحركة حسب الاختيار، ويعرض زر إمكانية الوصول الثابت */
export function A11yRoot({ initial, children }: { initial: A11y; children: React.ReactNode }) {
  const [a, setA] = useState<A11y>(initial);
  const change = useCallback((patch: Partial<A11y>) => {
    setA((cur) => {
      const next = { ...cur, ...patch };
      apply(next);
      try { document.cookie = `${A11Y_COOKIE}=${encodeURIComponent(serializeA11y(next))}; path=/; max-age=${YEAR}; samesite=lax`; } catch {}
      return next;
    });
  }, []);
  return (
    <MotionConfig reducedMotion={a.motion ? 'always' : 'user'}>
      {children}
      <A11yPanel a={a} change={change} reset={() => change({ text: 0, contrast: false, font: false, motion: false, links: false, cursor: false })} />
    </MotionConfig>
  );
}

const SIZES = ['عادي', 'كبير', 'أكبر', 'الأكبر'];

function A11yPanel({ a, change, reset }: { a: A11y; change: (p: Partial<A11y>) => void; reset: () => void }) {
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setCanSpeak(typeof window !== 'undefined' && 'speechSynthesis' in window), []);

  // Esc يغلق اللوحة، والنقر خارجها كذلك
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const click = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', key);
    document.addEventListener('mousedown', click);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', click); };
  }, [open]);
  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch {} }, []);

  const stop = () => { try { window.speechSynthesis.cancel(); } catch {} setReading(false); };
  const read = () => {
    if (reading) return stop();
    const sel = window.getSelection()?.toString().trim();
    const text = sel || (document.getElementById('main-content') ?? document.body).innerText;
    // المتصفح يقطع النصوص الطويلة: نقسمها إلى جمل قصيرة
    const parts = text.replace(/\s+/g, ' ').match(/[^.!؟?،]{1,180}[.!؟?،]?/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
    if (!parts.length) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('ar'));
    parts.slice(0, 120).forEach((s, i, arr) => {
      const u = new SpeechSynthesisUtterance(s);
      u.lang = voice?.lang ?? 'ar-SA';
      if (voice) u.voice = voice;
      if (i === arr.length - 1) u.onend = () => setReading(false);
      u.onerror = () => setReading(false);
      synth.speak(u);
    });
    setReading(true);
  };

  return (
    <div ref={box} data-local="1" className="fixed bottom-24 end-3 z-50 print:hidden lg:bottom-4">
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label="خدمات إمكانية الوصول"
          className="absolute bottom-14 end-0 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-line bg-surface p-4 text-ink shadow-[0_24px_60px_-20px_rgb(0_0_0/0.45)]"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold">خدمات إمكانية الوصول</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-paper">
              <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m5 5 10 10M15 5 5 15" /></svg>
            </button>
          </div>

          <p className="mb-1.5 text-xs font-medium text-muted">حجم الخط</p>
          <div role="radiogroup" aria-label="حجم الخط" className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-paper p-1">
            {SIZES.map((l, i) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={a.text === i}
                onClick={() => change({ text: i as A11y['text'] })}
                className={`rounded-lg py-1.5 text-sm transition-colors ${a.text === i ? 'bg-surface font-semibold text-accent shadow-sm' : 'text-muted hover:text-ink'}`}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Toggle label="تباين عالٍ" hint="ألوان أوضح ونصوص أغمق" on={a.contrast} set={(v) => change({ contrast: v })} />
            <Toggle label="خط أوضح" hint="خط بسيط ومسافات أوسع" on={a.font} set={(v) => change({ font: v })} />
            <Toggle label="إيقاف الحركات" hint="بلا انتقالات أو تحريك" on={a.motion} set={(v) => change({ motion: v })} />
            <Toggle label="تمييز الروابط" hint="خط تحت كل رابط" on={a.links} set={(v) => change({ links: v })} />
            <Toggle label="مؤشر أكبر" hint="مؤشر فأرة كبير" on={a.cursor} set={(v) => change({ cursor: v })} />
          </div>

          <div className="mt-3 grid gap-2">
            {canSpeak && (
              <button type="button" onClick={read} aria-pressed={reading} className="btn-quiet w-full py-2.5">
                {reading ? '■ إيقاف القراءة' : '🔊 قراءة الصفحة بصوت عالٍ'}
              </button>
            )}
            {canSpeak && !reading && <p className="text-center text-[11px] text-muted">حدّد نصًا لقراءته وحده</p>}
            <a href="#main-content" onClick={() => setOpen(false)} className="btn-quiet w-full py-2.5 text-center">انتقل للمحتوى</a>
            {!isDefault(a) && <button type="button" onClick={reset} className="text-sm text-danger hover:underline">إعادة الضبط</button>}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label="خدمات إمكانية الوصول"
        title="خدمات إمكانية الوصول"
        className="grid size-12 place-items-center rounded-full bg-board text-chalk shadow-[0_10px_26px_-10px_rgb(0_0_0/0.6)] ring-2 ring-surface transition-transform hover:scale-105 active:scale-95"
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="4.6" r="1.7" />
          <path d="M5 8.2c4.6 1.3 9.4 1.3 14 0M12 8.6v5.2M12 13.8l-3.2 6.2M12 13.8l3.2 6.2" />
        </svg>
      </button>
    </div>
  );
}

function Toggle({ label, hint, on, set }: { label: string; hint: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => set(!on)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-start transition-colors hover:border-muted"
    >
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <span aria-hidden className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? 'bg-board' : 'bg-line'}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-surface shadow transition-all ${on ? 'start-[1.1rem]' : 'start-0.5'}`} />
      </span>
    </button>
  );
}
