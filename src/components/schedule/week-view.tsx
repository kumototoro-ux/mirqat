'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { DAYS, fmtTime } from '@/lib/format';
import { subjectColor } from '@/components/timetable-grid';
import { fromMin, periodWindows, riyadhNow } from '@/lib/schedule/time';
import type { ViewSlot } from '@/lib/schedule/view';
import { Icon } from '@/components/shell/icons';

/** الآن، تتجدد كل 30 ثانية (لمؤشر الحصة الحالية والعدّ التنازلي) */
export function useNow() {
  const [now, setNow] = useState(() => riyadhNow());
  useEffect(() => {
    const t = setInterval(() => setNow(riyadhNow()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/**
 * جدول أسبوعي:
 * - الحاسوب: شبكة أيام × حصص، اليوم مميّز، والحصة الجارية تنبض
 * - الجوال: أزرار الأيام (اليوم مختار تلقائيًا) وتحتها بطاقات حصص اليوم بأوقاتها
 * secondary: ما يظهر تحت اسم المادة (المعلم في جدول الفصل، أو الفصل في جدول المعلم)
 */
export function WeekTimetable({ slots, secondary }: { slots: ViewSlot[]; secondary: 'teacher' | 'class' }) {
  const now = useNow();
  const today = now.day <= 4 ? now.day : null;
  const [day, setDay] = useState(today ?? 0);
  const periods = Math.max(1, ...slots.map((s) => s.period));
  const win = useMemo(() => periodWindows(slots), [slots]);
  const currentPeriod = today === null ? null : [...win.entries()].find(([, w]) => now.minutes >= w.start && now.minutes < w.end)?.[0] ?? null;
  const sub = (s: ViewSlot) => (secondary === 'teacher' ? s.teacher ?? 'بلا معلم' : s.classLabel);

  const Cell = ({ s, live }: { s: ViewSlot; live: boolean }) => {
    const c = subjectColor(s.subject);
    return (
      <div
        className={`relative rounded-xl px-2.5 py-2 leading-tight transition-transform duration-200 hover:-translate-y-0.5 ${live ? 'ring-2 ring-gold ring-offset-1' : ''}`}
        style={{ background: `${c}17`, boxShadow: `inset -3px 0 0 ${c}` }}
      >
        {live && <span className="absolute -top-1.5 end-1.5 flex size-3"><span className="absolute inline-flex size-full animate-ping rounded-full bg-gold opacity-70" /><span className="relative inline-flex size-3 rounded-full bg-gold" /></span>}
        <p className="truncate text-[0.82rem] font-semibold" style={{ color: c }}>{s.subject}</p>
        <p className="mt-0.5 truncate text-xs text-muted">{sub(s)}</p>
      </div>
    );
  };

  const daySlots = slots.filter((s) => s.day === day).sort((a, b) => a.period - b.period);

  return (
    <>
      {/* الحاسوب */}
      <div className="hidden overflow-x-auto rounded-[1.4rem] border border-line bg-surface md:block">
        <table className="w-full table-fixed border-separate border-spacing-1.5 p-1.5 text-sm" style={{ minWidth: 110 + periods * 128 }}>
          <thead>
            <tr>
              <th className="w-24" />
              {Array.from({ length: periods }, (_, i) => {
                const w = win.get(i + 1);
                const live = currentPeriod === i + 1;
                return (
                  <th key={i} className={`rounded-xl px-2 py-2 text-center text-xs font-semibold transition-colors ${live ? 'bg-gold/20 text-brass' : 'text-muted'}`}>
                    الحصة {i + 1}
                    {w && <span className="block font-normal" dir="ltr">{fromMin(w.start)} – {fromMin(w.end)}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((name, d) => (
              <tr key={name}>
                <th scope="row" className={`rounded-xl px-3 text-start font-semibold ${d === today ? 'bg-board text-chalk' : 'bg-paper/70'}`}>
                  {name}
                  {d === today && <span className="block text-[0.65rem] font-normal text-chalk/70">اليوم</span>}
                </th>
                {Array.from({ length: periods }, (_, p) => {
                  const cell = slots.filter((s) => s.day === d && s.period === p + 1);
                  const live = d === today && currentPeriod === p + 1;
                  return (
                    <td key={p} className={`align-top ${d === today ? 'bg-board/[0.035]' : ''} rounded-xl`}>
                      {cell.length ? <div className="space-y-1">{cell.map((s) => <Cell key={s.id} s={s} live={live} />)}</div> : <div className="h-[3.3rem] rounded-xl border border-dashed border-line/70" />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* الجوال */}
      <div className="md:hidden">
        <LayoutGroup id="days">
          <div className="mb-4 grid grid-cols-5 gap-1 rounded-2xl bg-surface p-1 ring-1 ring-line">
            {DAYS.map((name, d) => (
              <button key={name} type="button" onClick={() => setDay(d)} className="relative rounded-xl py-2.5 text-center text-sm">
                {day === d && <motion.span layoutId="day-pill" className="absolute inset-0 rounded-xl bg-board" transition={{ type: 'spring', stiffness: 480, damping: 36 }} />}
                <span className={`relative font-semibold ${day === d ? 'text-chalk' : 'text-ink/70'}`}>{name.replace('ال', '')}</span>
                {d === today && <span className={`relative mx-auto mt-0.5 block size-1.5 rounded-full ${day === d ? 'bg-gold' : 'bg-board'}`} />}
              </button>
            ))}
          </div>
        </LayoutGroup>
        <AnimatePresence mode="wait" initial={false}>
          <motion.ol key={day} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.2 }} className="space-y-2">
            {daySlots.length === 0 ? (
              <li className="rounded-2xl border border-dashed border-line bg-surface py-12 text-center text-muted">لا حصص في هذا اليوم</li>
            ) : (
              daySlots.map((s) => {
                const w = win.get(s.period);
                const live = day === today && currentPeriod === s.period;
                const c = subjectColor(s.subject);
                return (
                  <li key={s.id} className={`flex items-center gap-3 rounded-2xl border bg-surface p-3 ${live ? 'border-gold shadow-[0_10px_24px_-14px_rgb(217_164_65/0.9)]' : 'border-line'}`}>
                    <span className="grid w-14 shrink-0 place-items-center rounded-xl py-2 text-center leading-tight" style={{ background: `${c}17`, color: c }}>
                      <span className="text-lg font-bold">{s.period}</span>
                      <span className="text-[0.65rem]">{w ? fromMin(w.start) : fmtTime(s.startsAt)}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{s.subject}</p>
                      <p className="truncate text-sm text-muted">{sub(s)}</p>
                      {s.mode && <p className="truncate text-xs text-muted/80">{s.mode}</p>}
                    </div>
                    {live && <span className="rounded-full bg-gold px-2 py-0.5 text-xs font-bold text-ink">الآن</span>}
                  </li>
                );
              })
            )}
          </motion.ol>
        </AnimatePresence>
      </div>
    </>
  );
}

/** بطاقة "الآن والتالي": الحصة الجارية بنسبة ما مضى منها، والحصة التالية بعدّ تنازلي */
export function NowNext({ slots, secondary }: { slots: ViewSlot[]; secondary: 'teacher' | 'class' }) {
  const now = useNow();
  const win = useMemo(() => periodWindows(slots), [slots]);
  if (now.day > 4) {
    return (
      <div className="relative overflow-hidden rounded-[1.4rem] bg-board p-5 text-chalk">
        <p className="text-sm text-chalk/70">عطلة نهاية الأسبوع</p>
        <p className="mt-1 text-xl font-bold">لا حصص اليوم</p>
        <p className="mt-1 text-sm text-chalk/70">أول حصة الأحد: {slots.filter((s) => s.day === 0).sort((a, b) => a.period - b.period)[0]?.subject ?? '—'}</p>
      </div>
    );
  }
  const today = slots.filter((s) => s.day === now.day).sort((a, b) => a.period - b.period);
  const withTime = today.map((s) => ({ s, w: win.get(s.period) }));
  const current = withTime.find((x) => x.w && now.minutes >= x.w.start && now.minutes < x.w.end);
  const next = withTime.find((x) => x.w && x.w.start > now.minutes);
  const sub = (s: ViewSlot) => (secondary === 'teacher' ? s.teacher ?? '' : s.classLabel);
  const done = today.length > 0 && !current && !next;

  return (
    <div className="relative overflow-hidden rounded-[1.4rem] bg-board p-5 text-chalk">
      <div aria-hidden className="absolute -end-12 -top-12 size-44 rounded-full bg-gold/20 blur-2xl" />
      <div className="relative grid gap-4 sm:grid-cols-2">
        <div>
          <p className="flex items-center gap-2 text-sm text-chalk/70">
            {current && <span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-gold opacity-75" /><span className="relative inline-flex size-2.5 rounded-full bg-gold" /></span>}
            {current ? `الآن · الحصة ${current.s.period}` : done ? 'انتهى اليوم الدراسي' : today.length ? 'لم تبدأ الحصص بعد' : 'لا حصص اليوم'}
          </p>
          <p className="mt-1 truncate text-2xl font-bold">{current ? current.s.subject : done ? 'أحسنت، يومك اكتمل' : '—'}</p>
          {current && (
            <>
              <p className="truncate text-sm text-chalk/75">{sub(current.s)}</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-chalk/15">
                <motion.div className="h-full rounded-full bg-gold" initial={{ width: 0 }} animate={{ width: `${Math.round(((now.minutes - current.w!.start) / (current.w!.end - current.w!.start)) * 100)}%` }} transition={{ duration: 0.8 }} />
              </div>
              <p className="mt-1 text-xs text-chalk/65">تنتهي {fromMin(current.w!.end)} · باقي {current.w!.end - now.minutes} دقيقة</p>
            </>
          )}
        </div>
        <div className="rounded-2xl bg-chalk/10 p-4 ring-1 ring-chalk/10">
          <p className="flex items-center gap-1.5 text-sm text-chalk/70"><Icon name="chevron" className="size-4" /> التالية</p>
          {next ? (
            <>
              <p className="mt-1 truncate text-lg font-bold">{next.s.subject}</p>
              <p className="truncate text-sm text-chalk/75">{sub(next.s)}</p>
              <p className="mt-1 text-sm"><span className="font-bold text-gold">{next.w!.start - now.minutes} دقيقة</span> <span className="text-chalk/65">· تبدأ {fromMin(next.w!.start)}</span></p>
            </>
          ) : (
            <p className="mt-1 text-sm text-chalk/75">لا حصص أخرى اليوم</p>
          )}
        </div>
      </div>
    </div>
  );
}
