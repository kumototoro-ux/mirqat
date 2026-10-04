'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGroup, motion } from 'motion/react';
import { Insights } from '@/components/registry/insights';
import { Icon } from '@/components/shell/icons';
import { fmtHijri, fmtShortDate, fmtWeekday } from '@/lib/format';
import { daysUntil, inDays, riyadhNow } from '@/lib/schedule/time';
import type { ViewWeek } from '@/lib/schedule/view';

type Term = { id: number; name: string; year: string };

const monthOf = (iso: string) => new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh' }).format(new Date(`${iso}T12:00:00+03:00`));
const dur = (w: ViewWeek) => daysUntil(w.to, w.from);

/** الأسابيع = المدخلات التي لا تحتويها مدخلة أطول؛ والمناسبات بداخلها */
function split(weeks: ViewWeek[]) {
  const isWeek = (e: ViewWeek) => !weeks.some((o) => o.id !== e.id && o.from <= e.from && o.to >= e.to && dur(o) > dur(e));
  const main = weeks.filter(isWeek);
  return main.map((w) => ({ w, inner: weeks.filter((e) => e.id !== w.id && !isWeek(e) && e.from >= w.from && e.to <= w.to) }));
}

/**
 * التقويم كرحلة: الأسبوع الحالي في الواجهة مع تقدّم الفصل الدراسي، وأقرب مناسبة بعدّ تنازلي،
 * ثم كل الأسابيع على خط زمني مقسّم بالأشهر، تمرّر الصفحة تلقائيًا إلى الأسبوع الحالي.
 * admin: بطاقات أرقام ورابط التعديل.
 */
export function CalendarJourney({ terms, weeks, admin }: { terms: Term[]; weeks: ViewWeek[]; admin?: boolean }) {
  const today = riyadhNow().iso;
  const currentTerm = terms.find((t) => weeks.some((w) => w.termId === t.id && w.from <= today && w.to >= today)) ?? terms[terms.length - 1];
  const [termId, setTermId] = useState(currentTerm?.id);
  const list = useMemo(() => split(weeks.filter((w) => w.termId === termId)), [weeks, termId]);
  const currentRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const t = setTimeout(() => currentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 500);
    return () => clearTimeout(t);
  }, [termId]);

  if (!terms.length) return <p className="rounded-2xl border border-dashed border-line bg-surface py-16 text-center text-muted">لا تقويم منشور بعد.</p>;

  const studyWeeks = list.filter((x) => x.w.week && !x.w.event);
  const idx = list.findIndex((x) => x.w.from <= today && x.w.to >= today);
  const current = idx >= 0 ? list[idx] : null;
  const passed = studyWeeks.filter((x) => x.w.to < today).length + (current?.w.week ? 1 : 0);
  const pct = studyWeeks.length ? Math.min(100, Math.round((passed / studyWeeks.length) * 100)) : 0;
  const events = list.flatMap((x) => [x.w, ...x.inner]).filter((e) => e.event && e.to >= today).sort((a, b) => a.from.localeCompare(b.from));
  const nextEvent = events[0];
  const termEnd = list.length ? list[list.length - 1].w.to : null;
  const holidays = list.flatMap((x) => [x.w, ...x.inner]).filter((e) => e.event).length;

  // تجميع بالأشهر
  const months: { month: string; items: typeof list }[] = [];
  for (const x of list) {
    const m = monthOf(x.w.from);
    if (months[months.length - 1]?.month !== m) months.push({ month: m, items: [] });
    months[months.length - 1].items.push(x);
  }

  return (
    <>
      {admin && (
        <Insights
          stats={[
            { label: 'أسابيع الدراسة', value: studyWeeks.length, icon: 'calendar', hint: terms.find((t) => t.id === termId)?.name },
            { label: 'الأسبوع الحالي', value: current?.w.week ? `${passed}/${studyWeeks.length}` : '—', icon: 'timetable', hint: current?.w.week ?? 'خارج أسابيع الدراسة' },
            { label: 'الإجازات والمناسبات', value: holidays, icon: 'behavior', tone: 'gold' },
            { label: 'متبقٍ على نهاية الفصل', value: termEnd && daysUntil(termEnd) >= 0 ? `${daysUntil(termEnd)} يوم` : '—', icon: 'exams' },
          ]}
          donut={{
            title: 'تقدّم الفصل الدراسي',
            caption: 'أسابيع الدراسة',
            unit: 'أسبوع',
            items: [
              { name: 'انقضت', value: passed },
              { name: 'متبقية', value: Math.max(0, studyWeeks.length - passed) },
            ].filter((x) => x.value > 0),
          }}
        />
      )}

      {/* البطل: الأسبوع الحالي */}
      {!admin && (
        <div className="mb-6 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-[1.4rem] bg-board p-5 text-chalk sm:p-6">
            <div aria-hidden className="absolute -end-12 -top-12 size-48 rounded-full bg-gold/20 blur-2xl" />
            <p className="relative text-sm text-chalk/70">{fmtWeekday(today)} · {fmtShortDate(today)} · {fmtHijri(today)}</p>
            <p className="relative mt-1 text-2xl font-bold sm:text-3xl">{current ? (current.w.week ?? current.w.event) : 'خارج أسابيع الدراسة'}</p>
            {current && <p className="relative text-sm text-chalk/75">{fmtShortDate(current.w.from)} ← {fmtShortDate(current.w.to)}</p>}
            <div className="relative mt-5">
              <div className="mb-1.5 flex justify-between text-xs text-chalk/70"><span>تقدّم الفصل الدراسي</span><span className="tabular-nums">{passed} من {studyWeeks.length} أسبوع</span></div>
              <div className="h-2.5 overflow-hidden rounded-full bg-chalk/15">
                <motion.div className="h-full rounded-full bg-gradient-to-l from-gold to-[#f0c674]" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
              </div>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="rounded-[1.4rem] border border-line bg-surface p-5">
            <p className="text-sm text-muted">أقرب مناسبة</p>
            {nextEvent ? (
              <>
                <p className="mt-1 text-xl font-bold">{nextEvent.event}</p>
                <p className="text-sm text-muted">{fmtShortDate(nextEvent.from)}{nextEvent.to !== nextEvent.from ? ` ← ${fmtShortDate(nextEvent.to)}` : ''}</p>
                <p className="mt-3 inline-flex rounded-full bg-brass-soft px-3 py-1 text-sm font-bold text-brass">{inDays(daysUntil(nextEvent.from))}</p>
              </>
            ) : (
              <p className="mt-1 text-muted">لا مناسبات قادمة في هذا الفصل.</p>
            )}
          </motion.div>
        </div>
      )}

      <section className="rounded-[1.4rem] border border-line bg-surface p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <LayoutGroup id="terms">
            <div className="flex flex-wrap gap-1 rounded-xl bg-paper p-1">
              {terms.map((t) => (
                <button key={t.id} type="button" onClick={() => setTermId(t.id)} className="relative rounded-lg px-3.5 py-2 text-sm font-semibold">
                  {termId === t.id && <motion.span layoutId="term-pill" className="absolute inset-0 rounded-lg bg-surface shadow-sm" transition={{ type: 'spring', stiffness: 480, damping: 36 }} />}
                  <span className={`relative ${termId === t.id ? 'text-board' : 'text-muted'}`}>{t.name} <span className="font-normal">{t.year}</span></span>
                </button>
              ))}
            </div>
          </LayoutGroup>
          {admin && (
            <Link href="/staff/settings?s=calendar" className="btn h-10 rounded-xl border border-line bg-surface px-3.5 hover:border-board/40 hover:text-board sm:ms-auto">
              <Icon name="edit" className="size-4" /> تعديل التقويم
            </Link>
          )}
        </div>

        {months.map((m, mi) => (
          <div key={m.month} className={mi ? 'mt-6' : ''}>
            <p className="mb-3 inline-flex rounded-full bg-paper px-3 py-1 text-xs font-bold text-muted">{m.month}</p>
            <ol className="relative space-y-2 border-s-2 border-line ps-5">
              {m.items.map(({ w, inner }, i) => {
                const isCurrent = w.from <= today && w.to >= today;
                const past = w.to < today;
                const holiday = !!w.event && !w.week;
                return (
                  <motion.li
                    key={w.id}
                    ref={isCurrent ? currentRef : undefined}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.3, delay: Math.min(i, 6) * 0.03 }}
                    className="relative"
                  >
                    <span aria-hidden className={`absolute -start-[1.72rem] top-4 size-3 rounded-full ring-4 ring-surface ${isCurrent ? 'bg-gold' : holiday ? 'bg-danger' : past ? 'bg-board/40' : 'bg-line'}`} />
                    {isCurrent && <span aria-hidden className="absolute -start-[1.72rem] top-4 size-3 animate-ping rounded-full bg-gold/60" />}
                    <div className={`rounded-2xl border px-4 py-3 transition-colors ${isCurrent ? 'border-gold/60 bg-gold/[0.07] shadow-[0_14px_30px_-22px_rgb(217_164_65/0.9)]' : holiday ? 'border-danger/20 bg-danger-soft/40' : 'border-line'} ${past && !isCurrent ? 'opacity-60' : ''}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">
                          {w.week ?? w.event}
                          {w.period && <span className="ms-2 text-sm font-normal text-muted">{w.period}</span>}
                        </p>
                        <div className="flex items-center gap-1.5">
                          {isCurrent && <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold text-ink">الأسبوع الحالي</span>}
                          {w.week && w.event && <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-xs text-danger">{w.event}</span>}
                          {!past && !isCurrent && <span className="text-xs text-muted">{inDays(daysUntil(w.from))}</span>}
                        </div>
                      </div>
                      <p className="mt-0.5 text-sm text-muted">
                        {fmtShortDate(w.from)} ← {fmtShortDate(w.to)} <span className="text-xs">({fmtHijri(w.from)})</span>
                      </p>
                      {inner.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {inner.map((e) => (
                            <span key={e.id} className="rounded-full bg-danger-soft px-2.5 py-0.5 text-xs text-danger">
                              {e.event ?? e.week} · {fmtShortDate(e.from)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </ol>
          </div>
        ))}
      </section>
    </>
  );
}
