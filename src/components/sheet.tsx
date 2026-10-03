'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/shell/icons';

/**
 * لوحة جانبية للنماذج (تسجيل/تعديل): تنزلق من اليسار على الحاسوب، وتملأ الشاشة على الجوال.
 * الإغلاق بزر Esc أو بالضغط خارجها أو بزر ×، مع حركة خروج.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const [render, setRender] = useState(open);
  const [closing, setClosing] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setRender(true);
      setClosing(false);
    } else if (render) {
      setClosing(true);
      const t = setTimeout(() => setRender(false), 200);
      return () => clearTimeout(t);
    }
  }, [open, render]);

  useEffect(() => {
    if (!render) return;
    document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', key);
    setTimeout(() => panel.current?.querySelector<HTMLElement>('input,select,textarea')?.focus(), 350);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', key);
    };
  }, [render, onClose]);

  if (!render) return null;
  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div onClick={onClose} className={`absolute inset-0 bg-ink/40 backdrop-blur-[3px] ${closing ? 'animate-fade-out' : 'animate-fade-in'}`} />
      <div
        ref={panel}
        className={`absolute inset-y-0 end-0 flex w-full flex-col bg-surface shadow-[0_0_60px_-10px_rgb(0_0_0/0.35)] sm:w-[34rem] sm:rounded-s-3xl ${
          closing ? 'animate-panel-out' : 'animate-panel-in'
        }`}
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="grid size-9 place-items-center rounded-xl text-muted transition-colors hover:bg-paper hover:text-ink">
            <Icon name="close" className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <footer className="border-t border-line bg-paper/50 px-5 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:px-6">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/** حقل نموذج موحّد: عنوان، مدخل، وتلميح أو خطأ */
export function Field({
  label,
  hint,
  required,
  children,
  className = '',
}: {
  label: string;
  hint?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-medium">
        {label}
        {required && <span className="ms-0.5 text-danger">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** اختيار متعدد بشرائح قابلة للضغط (صفوف/شعب/مواد المعلم) */
export function ChipSelect({
  options,
  value,
  onChange,
}: {
  options: { value: number; label: string }[];
  value: number[];
  onChange: (v: number[]) => void;
}) {
  if (!options.length) return <p className="rounded-xl border border-dashed border-line px-3 py-3 text-sm text-muted">لا خيارات</p>;
  return (
    <div className="flex flex-wrap gap-1.5 rounded-xl border border-line p-2.5">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-all duration-200 active:scale-95 ${
              on ? 'bg-board text-chalk shadow-[0_4px_10px_-6px_rgb(53_104_84/0.9)]' : 'bg-paper text-ink hover:bg-board/10'
            }`}
          >
            {on && (
              <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
                <path d="m3.5 8.5 3 3 6-6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
