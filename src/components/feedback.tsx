'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/* =====================================================================
   التنبيهات (toast) وبطاقات التأكيد — لكل عملية في الموقع
   ===================================================================== */

type ToastTone = 'ok' | 'error' | 'info';
type Toast = { id: number; tone: ToastTone; text: string; leaving?: boolean };

type ConfirmOptions = {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /**
   * العملية نفسها (اختياري): تبقى البطاقة مفتوحة وزرها يدور حتى تنتهي،
   * فإن فشلت ظهر الخطأ داخل البطاقة دون إغلاقها، وإن نجحت أُغلقت وظهر تنبيه النجاح.
   */
  run?: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>;
};

type Ctx = {
  toast: (text: string, tone?: ToastTone) => void;
  confirm: (o: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<Ctx | null>(null);

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback خارج FeedbackProvider');
  return ctx;
}

const TONE: Record<ToastTone, { box: string; icon: React.ReactNode; bar: string }> = {
  ok: {
    box: 'border-ok/25 bg-surface text-ink',
    bar: 'bg-ok/50',
    icon: (
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ok text-chalk">
        <svg viewBox="0 0 20 20" className="size-4"><path d="m5 10.5 3.2 3.2L15 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    ),
  },
  error: {
    box: 'border-danger/25 bg-surface text-ink',
    bar: 'bg-danger/50',
    icon: (
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-danger text-chalk">
        <svg viewBox="0 0 20 20" className="size-4"><path d="M10 5.5v5.5M10 14.2v.3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
      </span>
    ),
  },
  info: {
    box: 'border-board/25 bg-surface text-ink',
    bar: 'bg-board/40',
    icon: (
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-board text-chalk">
        <svg viewBox="0 0 20 20" className="size-4"><path d="M10 9v5M10 5.8v.3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
      </span>
    ),
  },
};

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [closing, setClosing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const seq = useRef(0);
  useEffect(() => setMounted(true), []);

  // التنبيه يختفي حين ينتهي شريط العدّ التنازلي داخله (يتوقف عند مرور الفأرة أو اللمس)
  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 380);
  }, []);
  const toast = useCallback((text: string, tone: ToastTone = 'ok') => {
    if (!text) return;
    const id = ++seq.current;
    // نفس الرسالة مرتين متتاليتين = تنبيه واحد يُجدَّد
    setToasts((t) => [...t.filter((x) => !(x.text === text && x.tone === tone)).slice(-3), { id, tone, text }]);
  }, []);

  const confirm = useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ ...o, resolve })),
    [],
  );

  const close = (v: boolean) => {
    if (!dialog) return;
    setClosing(true);
    setTimeout(() => {
      dialog.resolve(v);
      setDialog(null);
      setClosing(false);
    }, 160);
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}
      {mounted &&
        createPortal(
          <>
            {/* التنبيهات: أعلى الشاشة في الوسط، فوق كل شيء */}
            <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-3">
              {toasts.map((t) => (
                <div
                  key={t.id}
                  role={t.tone === 'error' ? 'alert' : 'status'}
                  className={`group/toast pointer-events-auto relative flex w-full max-w-sm items-center gap-3 overflow-hidden rounded-2xl border px-3.5 py-3 text-sm font-medium shadow-[0_18px_40px_-18px_rgb(31_42_36/0.45)] ${TONE[t.tone].box} ${
                    t.leaving ? 'animate-toast-out' : 'animate-toast-in'
                  }`}
                >
                  {TONE[t.tone].icon}
                  <span className="flex-1 leading-snug">{t.text}</span>
                  <button type="button" onClick={() => dismiss(t.id)} aria-label="إغلاق التنبيه" className="-me-1 grid size-7 shrink-0 place-items-center rounded-lg text-muted opacity-60 transition-opacity hover:bg-paper hover:opacity-100">
                    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 8 8M14 6l-8 8" /></svg>
                  </button>
                  {!t.leaving && (
                    <span
                      aria-hidden
                      onAnimationEnd={() => dismiss(t.id)}
                      className={`toast-timer absolute bottom-0 start-0 h-[3px] w-full origin-right group-hover/toast:[animation-play-state:paused] ${TONE[t.tone].bar}`}
                      style={{ '--toast-ms': `${t.tone === 'error' ? 6000 : 3400}ms` } as React.CSSProperties}
                    />
                  )}
                </div>
              ))}
            </div>

            {dialog && (
              <ConfirmDialog
                {...dialog}
                closing={closing}
                onCancel={() => close(false)}
                onConfirm={async () => {
                  if (!dialog.run) return close(true) as undefined;
                  const res = await dialog.run();
                  if (!res.ok) return res.error;
                  if (res.message) toast(res.message);
                  close(true);
                }}
              />
            )}
          </>,
          document.body,
        )}
    </FeedbackContext.Provider>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  danger,
  closing,
  onCancel,
  onConfirm,
}: ConfirmOptions & { closing: boolean; onCancel: () => void; onConfirm: () => Promise<string | undefined> }) {
  const okRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = useCallback(() => !busy && onCancel(), [busy, onCancel]);
  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [cancel]);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const err = await onConfirm();
      if (err) setError(err);
    } catch {
      setError('تعذّر الاتصال. تحقق من الإنترنت وحاول مجددًا');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-end p-3 sm:place-items-center" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div onClick={cancel} className={`absolute inset-0 bg-ink/45 backdrop-blur-[3px] ${closing ? 'animate-fade-out' : 'animate-fade-in'}`} />
      <div
        className={`relative w-full max-w-md rounded-3xl bg-surface p-6 shadow-[0_30px_80px_-24px_rgb(0_0_0/0.5)] ${closing ? 'animate-sheet-out' : 'animate-sheet-in'}`}
      >
        <span className={`grid size-12 place-items-center rounded-2xl ${danger ? 'bg-danger-soft text-danger' : 'bg-board/10 text-board'}`}>
          {danger ? (
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          )}
        </span>
        <h2 id="confirm-title" className="mt-4 text-lg font-bold">{title}</h2>
        {body && <div className="mt-2 text-sm leading-relaxed text-muted">{body}</div>}
        {error && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger animate-shake">
            <svg viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M10 5.5v5.5M10 14.2v.3" /></svg>
            {error}
          </p>
        )}
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button type="button" onClick={cancel} disabled={busy} className="btn-quiet py-3">{cancelLabel}</button>
          <button
            ref={okRef}
            type="button"
            onClick={go}
            disabled={busy}
            aria-busy={busy}
            className={`btn py-3 text-chalk disabled:opacity-90 ${danger ? 'bg-danger hover:bg-[#93281f]' : 'bg-board hover:bg-board-deep'}`}
          >
            {busy ? <span className="spinner border-chalk/30 border-t-chalk" /> : null}
            {busy ? 'جارٍ التنفيذ…' : error ? 'إعادة المحاولة' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
