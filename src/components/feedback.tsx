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

const TONE: Record<ToastTone, { box: string; icon: React.ReactNode }> = {
  ok: {
    box: 'border-ok/25 bg-surface text-ink',
    icon: (
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ok text-chalk">
        <svg viewBox="0 0 20 20" className="size-4"><path d="m5 10.5 3.2 3.2L15 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    ),
  },
  error: {
    box: 'border-danger/25 bg-surface text-ink',
    icon: (
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-danger text-chalk">
        <svg viewBox="0 0 20 20" className="size-4"><path d="M10 5.5v5.5M10 14.2v.3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
      </span>
    ),
  },
  info: {
    box: 'border-board/25 bg-surface text-ink',
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

  const toast = useCallback((text: string, tone: ToastTone = 'ok') => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-3), { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x))), tone === 'error' ? 5200 : 3200);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 5600 : 3600);
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
                  className={`pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border px-3.5 py-3 text-sm font-medium shadow-[0_18px_40px_-18px_rgb(31_42_36/0.45)] ${TONE[t.tone].box} ${
                    t.leaving ? 'animate-toast-out' : 'animate-toast-in'
                  }`}
                >
                  {TONE[t.tone].icon}
                  <span className="flex-1 leading-snug">{t.text}</span>
                </div>
              ))}
            </div>

            {dialog && (
              <ConfirmDialog
                {...dialog}
                closing={closing}
                onCancel={() => close(false)}
                onConfirm={() => close(true)}
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
}: ConfirmOptions & { closing: boolean; onCancel: () => void; onConfirm: () => void }) {
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-end p-3 sm:place-items-center" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div onClick={onCancel} className={`absolute inset-0 bg-ink/45 backdrop-blur-[3px] ${closing ? 'animate-fade-out' : 'animate-fade-in'}`} />
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
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="btn-quiet py-3">{cancelLabel}</button>
          <button
            ref={okRef}
            type="button"
            onClick={onConfirm}
            className={`btn py-3 text-chalk ${danger ? 'bg-danger hover:bg-[#93281f]' : 'bg-board hover:bg-board-deep'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
