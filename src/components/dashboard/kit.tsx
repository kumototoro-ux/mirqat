'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { animate, motion, useInView } from 'motion/react';
import { Icon, type IconName } from '@/components/shell/icons';
import { SaduPattern } from '@/components/home/sadu-pattern';

/* =====================================================================
   مكونات الصفحات الرئيسية: البطل، العدّاد المتحرك، البطاقات، الإجراءات السريعة،
   مخطط النشاط، والحصة الحالية/التالية
   ===================================================================== */

export function useNow(ms = 30000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** دقائق منذ منتصف الليل بتوقيت الرياض */
export function riyadhMinutes(now: number) {
  const p = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Riyadh' }).formatToParts(new Date(now));
  return Number(p.find((x) => x.type === 'hour')?.value) * 60 + Number(p.find((x) => x.type === 'minute')?.value);
}
export const timeToMin = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
export const fmtClock = (t: string | null) => {
  if (!t) return '';
  const h = Number(t.slice(0, 2));
  const m = t.slice(3, 5);
  return `${((h + 11) % 12) + 1}:${m} ${h < 12 ? 'ص' : 'م'}`;
};
export const inMinutes = (m: number) => (m < 1 ? 'الآن' : m < 60 ? `بعد ${m} دقيقة` : `بعد ${Math.floor(m / 60)} س ${m % 60 ? `و${m % 60} د` : ''}`.trim());

/** الحصة الجارية والتالية من أوقات البدء (مدة الحصة تقديرية 45 دقيقة إن لم تبدأ التالية قبلها) */
export function nowNext<T extends { starts_at: string | null; period_no: number }>(slots: T[], now: number | null): { current: T | null; next: T | null; minsToNext: number | null } {
  if (now == null) return { current: null, next: null, minsToNext: null };
  const m = riyadhMinutes(now);
  const timed = slots.filter((s) => s.starts_at).sort((a, b) => timeToMin(a.starts_at)! - timeToMin(b.starts_at)!);
  let current: T | null = null;
  let next: T | null = null;
  for (let i = 0; i < timed.length; i++) {
    const st = timeToMin(timed[i].starts_at)!;
    const end = Math.min(st + 45, timeToMin(timed[i + 1]?.starts_at ?? null) ?? Infinity);
    if (m >= st && m < end) current = timed[i];
    if (st > m && !next) next = timed[i];
  }
  return { current, next, minsToNext: next ? timeToMin(next.starts_at)! - m : null };
}

export function greeting(now = Date.now()) {
  const h = Math.floor(riyadhMinutes(now) / 60);
  return h < 5 ? 'مساء الخير' : h < 12 ? 'صباح الخير' : h < 17 ? 'نهارك سعيد' : 'مساء الخير';
}

export function todayLabel() {
  const d = new Date();
  return {
    g: new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Riyadh' }).format(d),
    h: new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh' }).format(d),
  };
}

/** عدّاد يتحرك من الصفر عند ظهوره */
export function CountUp({ value, suffix = '', decimals = 0 }: { value: number; suffix?: string; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView || !ref.current) return;
    const el = ref.current;
    const c = animate(0, value, {
      duration: Math.min(1.4, 0.5 + value / 400),
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => { el.textContent = `${v.toFixed(decimals)}${suffix}`; },
    });
    return () => c.stop();
  }, [inView, value, suffix, decimals]);
  return <span ref={ref} className="tabular-nums">{`${value.toFixed(decimals)}${suffix}`}</span>;
}

export function Hero({ eyebrow, title, lead, children, aside }: { eyebrow: React.ReactNode; title: React.ReactNode; lead?: React.ReactNode; children?: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="relative isolate overflow-hidden rounded-[2rem] bg-board p-5 text-chalk sm:p-7">
      <SaduPattern id="dash-sadu" opacity={0.06} />
      <div aria-hidden className="absolute -end-24 -top-32 -z-10 size-96 rounded-full bg-gold/20 blur-3xl" />
      <div aria-hidden className="absolute -bottom-40 start-1/3 -z-10 size-80 rounded-full bg-[#4f8f74]/40 blur-3xl" />
      <div className="relative flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gold">{eyebrow}</p>
          <h1 className="mt-1 font-display text-[clamp(1.6rem,4.5vw,2.4rem)] font-bold leading-tight">{title}</h1>
          {lead && <div className="mt-1.5 text-sm text-chalk/75">{lead}</div>}
          {children}
        </div>
        {aside && <div className="w-full sm:w-auto">{aside}</div>}
      </div>
    </motion.section>
  );
}

export type Tile = { label: string; value: number; suffix?: string; hint?: React.ReactNode; icon: IconName; tone?: 'board' | 'gold' | 'danger' | 'ok' | 'sky'; href?: string; of?: number };
const TONE: Record<NonNullable<Tile['tone']>, string> = {
  board: 'bg-board/10 text-board',
  gold: 'bg-brass-soft text-brass',
  danger: 'bg-danger-soft text-danger',
  ok: 'bg-ok-soft text-ok',
  sky: 'bg-[#e1eef3] text-[#2a6f8a]',
};

export function Tiles({ items }: { items: Tile[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((t, i) => {
        const inner = (
          <>
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm text-muted">{t.label}</span>
              <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${TONE[t.tone ?? 'board']}`}><Icon name={t.icon} className="size-[1.1rem]" /></span>
            </div>
            <p className="mt-1 text-[1.85rem] font-bold leading-none">
              <CountUp value={t.value} suffix={t.suffix} />
              {t.of != null && <span className="text-base font-semibold text-muted"> / {t.of}</span>}
            </p>
            {t.hint && <p className="mt-1.5 truncate text-xs text-muted">{t.hint}</p>}
            {t.of != null && t.of > 0 && (
              <span className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-paper">
                <motion.span className="block h-full rounded-full bg-board" initial={{ width: 0 }} animate={{ width: `${Math.min(100, (t.value / t.of) * 100)}%` }} transition={{ duration: 0.9, delay: 0.2 }} />
              </span>
            )}
          </>
        );
        return (
          <motion.div key={t.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.05 }}>
            {t.href ? (
              <Link href={t.href} className="block h-full rounded-[1.4rem] border border-line bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-board/30 hover:shadow-[0_14px_30px_-24px_rgb(53_104_84/0.8)]">{inner}</Link>
            ) : (
              <div className="h-full rounded-[1.4rem] border border-line bg-surface p-4">{inner}</div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

export function QuickActions({ items }: { items: { href: string; label: string; icon: IconName; hint?: string }[] }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {items.map((a, i) => (
        <motion.div key={a.href + a.label} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.12 + i * 0.03 }}>
          <Link href={a.href} className="group flex h-full flex-col items-center gap-2 rounded-2xl border border-line bg-surface px-2 py-3.5 text-center transition-all hover:-translate-y-0.5 hover:border-board/30 hover:bg-board/[0.03] active:scale-95">
            <span className="grid size-11 place-items-center rounded-2xl bg-paper text-board transition-colors group-hover:bg-board group-hover:text-chalk">
              <Icon name={a.icon} className="size-5" />
            </span>
            <span className="text-[0.8rem] font-semibold leading-tight">{a.label}</span>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

export function Panel({ title, action, children, className = '', pad = true }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; pad?: boolean }) {
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }} className={`rounded-[1.5rem] border border-line bg-surface ${className}`}>
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <h2 className="font-bold">{title}</h2>
        {action}
      </div>
      <div className={pad ? 'p-5 pt-3' : 'pt-2'}>{children}</div>
    </motion.section>
  );
}

export const MoreLink = ({ href, children = 'الكل' }: { href: string; children?: React.ReactNode }) => (
  <Link href={href} className="inline-flex items-center gap-0.5 text-sm font-medium text-board hover:underline">
    {children} <Icon name="chevron" className="size-3.5" />
  </Link>
);

/** مخطط نشاط آخر 14 يومًا: أعمدة مكدّسة بثلاث سلاسل */
export function ActivityChart({ days, series }: { days: { day: string; [k: string]: number | string }[]; series: { key: string; label: string; color: string }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = days.map((d) => series.reduce((a, s) => a + Number(d[s.key] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const fmt = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
  const h = hover ?? days.length - 1;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="font-semibold">{fmt.format(new Date(`${days[h]?.day}T12:00:00Z`))}</span>
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-muted">
            <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label} <b className="tabular-nums text-ink">{Number(days[h]?.[s.key] ?? 0)}</b>
          </span>
        ))}
      </div>
      <div className="flex h-36 items-end gap-1 sm:gap-1.5" onMouseLeave={() => setHover(null)}>
        {days.map((d, i) => (
          <button key={d.day} type="button" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} aria-label={`${d.day}: ${totals[i]}`} className="group flex h-full flex-1 flex-col justify-end">
            <motion.div initial={{ height: 0 }} animate={{ height: `${(totals[i] / max) * 100}%` }} transition={{ duration: 0.7, delay: i * 0.025, ease: [0.22, 1, 0.36, 1] }} className={`flex min-h-[3px] w-full flex-col-reverse overflow-hidden rounded-md transition-opacity ${hover != null && hover !== i ? 'opacity-45' : ''}`}>
              {totals[i] === 0 ? (
                <span className="h-[3px] bg-line" />
              ) : (
                series.map((s) => <span key={s.key} style={{ height: `${(Number(d[s.key] ?? 0) / totals[i]) * 100}%`, background: s.color }} />)
              )}
            </motion.div>
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[0.68rem] text-muted">
        <span>{fmt.format(new Date(`${days[0]?.day}T12:00:00Z`))}</span>
        <span>اليوم</span>
      </div>
    </div>
  );
}

export function DaysLeft({ date }: { date: string }) {
  const days = Math.round((Date.parse(`${date}T00:00:00+03:00`) - Date.parse(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date())}T00:00:00+03:00`)) / 864e5);
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${days <= 1 ? 'bg-danger-soft text-danger' : days <= 3 ? 'bg-brass-soft text-brass' : 'bg-paper text-muted'}`}>
      {days <= 0 ? 'اليوم' : days === 1 ? 'غدًا' : days === 2 ? 'بعد يومين' : `بعد ${days} أيام`}
    </span>
  );
}

const dfmt = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
export const fmtDay = (d: string) => dfmt.format(new Date(`${d}T12:00:00Z`));
