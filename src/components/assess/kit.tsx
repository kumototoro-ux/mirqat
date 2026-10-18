'use client';

import { motion } from 'motion/react';
import { Icon, type IconName } from '@/components/shell/icons';
import { fromLocalInput, relTime, toLocalInput } from '@/lib/assess/shared';

/** قسم مرقّم في المحرر */
export function Section({ n, title, lead, children, icon, aside }: { n: number; title: string; lead?: string; children: React.ReactNode; icon?: IconName; aside?: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: n * 0.05, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-[1.4rem] border border-line bg-surface"
      id={`s${n}`}
    >
      <header className="flex items-center gap-3 border-b border-line px-4 py-3.5 sm:px-6">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-board text-sm font-bold text-chalk">{icon ? <Icon name={icon} className="size-[1.1rem]" /> : n}</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">{title}</h2>
          {lead && <p className="text-xs text-muted sm:text-sm">{lead}</p>}
        </div>
        {aside}
      </header>
      <div className="space-y-5 p-4 sm:p-6">{children}</div>
    </motion.section>
  );
}

export function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3.5 transition-colors hover:border-board/30 ${disabled ? 'pointer-events-none opacity-55' : ''}`}>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${checked ? 'bg-board' : 'bg-line'}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all duration-200 ${checked ? 'start-[1.375rem]' : 'start-0.5'}`} />
      </button>
    </label>
  );
}

/** بطاقات اختيار (نوع التسليم، إظهار النتائج…) */
export function CardChoice<T extends string>({ value, onChange, options, cols = 2 }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; hint?: string; icon?: IconName }[]; cols?: 2 | 3 | 4 }) {
  return (
    <div className={`grid gap-2 ${cols === 4 ? 'grid-cols-2 lg:grid-cols-4' : cols === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`} role="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`relative flex items-start gap-2.5 rounded-xl border p-3 text-start transition-all duration-200 active:scale-[0.98] ${on ? 'border-board bg-board/[0.06] shadow-[0_0_0_3px_rgb(53_104_84/0.12)]' : 'border-line hover:border-board/30'}`}
          >
            <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors ${on ? 'border-board bg-board' : 'border-line'}`}>
              {on && <span className="size-2 rounded-full bg-white" />}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                {o.icon && <Icon name={o.icon} className="size-4 text-board" />}
                {o.label}
              </span>
              {o.hint && <span className="mt-0.5 block text-xs leading-snug text-muted">{o.hint}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** تاريخ ووقت بتوقيت الرياض مع اختصارات سريعة */
export function DateTime({ value, onChange, quick = 'due', allowEmpty, emptyLabel = 'الآن' }: { value: string | null; onChange: (iso: string | null) => void; quick?: 'due' | 'open' | 'none'; allowEmpty?: boolean; emptyLabel?: string }) {
  const set = (days: number, h: number, m: number) => {
    const now = new Date(Date.now() + 3 * 3600000);
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, h, m));
    onChange(new Date(d.getTime() - 3 * 3600000).toISOString());
  };
  const chips =
    quick === 'due'
      ? [
          { label: 'اليوم 11:59 م', run: () => set(0, 23, 59) },
          { label: 'غدًا 11:59 م', run: () => set(1, 23, 59) },
          { label: 'بعد 3 أيام', run: () => set(3, 23, 59) },
          { label: 'بعد أسبوع', run: () => set(7, 23, 59) },
        ]
      : quick === 'open'
        ? [
            { label: 'الآن', run: () => onChange(allowEmpty ? null : new Date().toISOString()) },
            { label: 'غدًا 7:00 ص', run: () => set(1, 7, 0) },
            { label: 'غدًا 8:00 ص', run: () => set(1, 8, 0) },
          ]
        : [];
  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="datetime-local"
          value={toLocalInput(value)}
          onChange={(e) => onChange(fromLocalInput(e.target.value))}
          className="field min-w-0 flex-1 tabular-nums"
          dir="ltr"
        />
        {allowEmpty && value && (
          <button type="button" onClick={() => onChange(null)} className="btn-quiet shrink-0 px-3 py-2.5 text-xs">
            {emptyLabel}
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {chips.map((c) => (
          <button key={c.label} type="button" onClick={c.run} className="rounded-full bg-paper px-3 py-1 text-xs font-medium text-ink transition-colors hover:bg-board/10 hover:text-board">
            {c.label}
          </button>
        ))}
        <span className="ms-auto text-xs text-muted">{value ? `${fmtFull(value)} · ${relTime(value)}` : allowEmpty ? emptyLabel : ''}</span>
      </div>
    </div>
  );
}

const fullFmt = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
export const fmtFull = (iso: string) => fullFmt.format(new Date(iso));

/** ملخص المواعيد في بطاقة التأكيد قبل الحفظ */
export function TimesSummary({ rows }: { rows: { label: string; value: string | null; empty?: string; warn?: boolean }[] }) {
  return (
    <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line text-start">
      {rows.map((r) => (
        <li key={r.label} className={`flex items-start gap-3 px-3.5 py-2.5 ${r.warn ? 'bg-danger-soft/60' : ''}`}>
          <span className="w-24 shrink-0 text-xs font-semibold text-muted">{r.label}</span>
          <span className="min-w-0 flex-1 text-sm text-ink">
            {r.value ? (
              <>
                <b className="font-semibold">{fmtFull(r.value)}</b>
                <span className="block text-xs text-muted">{relTime(r.value)}</span>
              </>
            ) : (
              <span className="text-muted">{r.empty ?? '—'}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** شريط الإجراءات السفلي الثابت في المحرر */
export function ActionBar({ children, note }: { children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 mt-6 lg:bottom-4">
      <div className="mx-auto flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface/95 p-2.5 shadow-[0_20px_50px_-20px_rgb(31_42_36/0.45)] backdrop-blur sm:p-3">
        {note && <div className="min-w-0 flex-1 px-1 text-xs text-muted sm:text-sm">{note}</div>}
        <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">{children}</div>
      </div>
    </div>
  );
}
