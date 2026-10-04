'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Insights } from '@/components/registry/insights';
import { downloadCsv } from '@/components/registry/csv';
import { Icon } from '@/components/shell/icons';
import { subjectColor } from '@/components/timetable-grid';
import { fmtDate, fmtHijri, fmtShortDate, fmtTime, fmtWeekday } from '@/lib/format';
import { daysUntil, inDays, riyadhNow } from '@/lib/schedule/time';
import type { ViewExam } from '@/lib/schedule/view';

function ExamCard({ e, showClass, i }: { e: ViewExam; showClass: boolean; i: number }) {
  const c = subjectColor(e.subject);
  const d = daysUntil(e.date);
  return (
    <motion.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}
      className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 transition-transform hover:-translate-y-0.5" style={{ boxShadow: `inset -3px 0 0 ${c}` }}>
      <span className="grid size-12 shrink-0 place-items-center rounded-xl text-center leading-none" style={{ background: `${c}17`, color: c }}>
        <span className="text-lg font-bold">{new Date(`${e.date}T12:00:00+03:00`).getDate()}</span>
        <span className="text-[0.6rem]">{fmtShortDate(e.date).replace(/^\d+\s*/, '')}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{e.subject}</p>
        <p className="truncate text-sm text-muted">{showClass ? `${e.classLabel}${e.branch ? ` · ${e.branch}` : ''}` : e.teacher ?? ''}</p>
        <p className="text-xs text-muted">{fmtWeekday(e.date)}{e.startsAt ? ` · ${fmtTime(e.startsAt)}` : ''}{e.period ? ` · ${e.period}` : ''}</p>
      </div>
      {d >= 0 && <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${d <= 2 ? 'bg-danger-soft text-danger' : d <= 7 ? 'bg-brass-soft text-brass' : 'bg-paper text-muted'}`}>{inDays(d)}</span>}
    </motion.li>
  );
}

function Grouped({ exams, showClass }: { exams: ViewExam[]; showClass: boolean }) {
  const days = [...new Set(exams.map((e) => e.date))];
  return (
    <div className="space-y-6">
      {days.map((d) => (
        <section key={d}>
          <p className="mb-2 flex items-baseline gap-2"><span className="font-bold">{fmtWeekday(d)}</span><span className="text-sm text-muted">{fmtDate(d)} · {fmtHijri(d)}</span></p>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {exams.filter((e) => e.date === d).map((e, i) => <ExamCard key={e.id} e={e} showClass={showClass} i={i} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** المعلم والطالب: الاختبار القادم بعدّ تنازلي كبير، ثم القادمة مرتبة باليوم، والسابقة مطوية */
export function ExamsAgenda({ exams, showClass, hidden }: { exams: ViewExam[]; showClass: boolean; hidden?: boolean }) {
  const [showPast, setShowPast] = useState(false);
  if (hidden)
    return (
      <div className="grid place-items-center rounded-[1.4rem] border border-dashed border-line bg-surface px-6 py-16 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-brass-soft text-brass"><Icon name="exams" className="size-7" /></span>
        <p className="mt-4 text-lg font-semibold">جدول الاختبارات لم يُعتمد بعد</p>
        <p className="mt-1 text-muted">يظهر هنا فور اعتماده من الإدارة.</p>
      </div>
    );
  const today = riyadhNow().iso;
  const upcoming = exams.filter((e) => e.date >= today);
  const past = exams.filter((e) => e.date < today).reverse();
  const next = upcoming[0];
  const week = upcoming.filter((e) => daysUntil(e.date) <= 7);

  return (
    <>
      {next ? (
        <div className="mb-6 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-[1.4rem] bg-board p-5 text-chalk sm:p-6">
            <div aria-hidden className="absolute -end-12 -top-12 size-48 rounded-full bg-gold/20 blur-2xl" />
            <p className="relative text-sm text-chalk/70">الاختبار القادم</p>
            <div className="relative mt-2 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-2xl font-bold sm:text-3xl">{next.subject}</p>
                <p className="mt-1 text-chalk/80">{fmtWeekday(next.date)} {fmtDate(next.date)}{next.startsAt ? ` · ${fmtTime(next.startsAt)}` : ''}</p>
                <p className="text-sm text-chalk/65">{showClass ? next.classLabel : next.period ?? fmtHijri(next.date)}</p>
              </div>
              <div className="shrink-0 rounded-2xl bg-chalk/10 px-4 py-3 text-center ring-1 ring-chalk/15">
                <motion.p key={next.id} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }} className="text-4xl font-bold tabular-nums text-gold">
                  {Math.max(0, daysUntil(next.date))}
                </motion.p>
                <p className="text-xs text-chalk/70">{daysUntil(next.date) === 0 ? 'اليوم!' : 'يوم متبقٍ'}</p>
              </div>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="rounded-[1.4rem] border border-line bg-surface p-5">
            <p className="text-sm text-muted">خلال 7 أيام</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{week.length}</p>
            <p className="text-sm text-muted">اختبار · وإجمالي القادمة {upcoming.length}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {week.slice(0, 6).map((e) => <span key={e.id} className="rounded-full bg-paper px-2.5 py-1 text-xs">{e.subject} · {inDays(daysUntil(e.date))}</span>)}
            </div>
          </motion.div>
        </div>
      ) : (
        <div className="mb-6 rounded-[1.4rem] border border-dashed border-line bg-surface py-12 text-center">
          <p className="text-lg font-semibold">لا اختبارات قادمة</p>
          <p className="mt-1 text-muted">ستظهر هنا مواعيد اختباراتك فور إضافتها.</p>
        </div>
      )}

      {upcoming.length > 0 && <Grouped exams={upcoming} showClass={showClass} />}

      {past.length > 0 && (
        <div className="mt-8">
          <button type="button" onClick={() => setShowPast((v) => !v)} className="flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink">
            <Icon name="chevron" className={`size-4 transition-transform ${showPast ? 'rotate-90' : '-rotate-90'}`} />
            الاختبارات السابقة ({past.length})
          </button>
          <AnimatePresence>
            {showPast && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="mt-4 opacity-75"><Grouped exams={past} showClass={showClass} /></div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}

/** الإدارة: كل الاختبارات بتصفية فورية، ومؤشرات، وكشف التعارضات، وتصدير */
export function AdminExams({ exams, hidden }: { exams: ViewExam[]; hidden: boolean }) {
  const today = riyadhNow().iso;
  const [branch, setBranch] = useState('');
  const [classId, setClassId] = useState(0);
  const [range, setRange] = useState<'upcoming' | 'week' | 'all'>('upcoming');
  const branches = [...new Set(exams.map((e) => e.branch).filter(Boolean))];
  const classes = [...new Map(exams.filter((e) => !branch || e.branch === branch).map((e) => [e.classId, e.classLabel])).entries()];

  const filtered = exams.filter(
    (e) =>
      (!branch || e.branch === branch) &&
      (!classId || e.classId === classId) &&
      (range === 'all' || (range === 'upcoming' ? e.date >= today : e.date >= today && daysUntil(e.date) <= 7)),
  );
  const upcoming = exams.filter((e) => e.date >= today);
  const conflicts = useMemo(() => {
    const byClass = new Map<string, ViewExam[]>();
    const byTeacher = new Map<string, ViewExam[]>();
    for (const e of upcoming) {
      const k = `${e.classId}-${e.date}`;
      byClass.set(k, [...(byClass.get(k) ?? []), e]);
      if (e.teacherId && e.startsAt) {
        const t = `${e.teacherId}-${e.date}-${e.startsAt}`;
        byTeacher.set(t, [...(byTeacher.get(t) ?? []), e]);
      }
    }
    return [
      ...[...byClass.values()].filter((g) => g.length > 1).map((g) => ({ kind: 'class' as const, g })),
      ...[...byTeacher.values()].filter((g) => new Set(g.map((x) => x.classId)).size > 1).map((g) => ({ kind: 'teacher' as const, g })),
    ];
  }, [upcoming]);
  const bySubject = new Map<string, number>();
  upcoming.forEach((e) => bySubject.set(e.subject, (bySubject.get(e.subject) ?? 0) + 1));

  return (
    <>
      {hidden && (
        <p className="mb-5 flex items-center gap-2 rounded-2xl border border-brass/30 bg-brass-soft/60 px-4 py-3 text-sm text-brass">
          <Icon name="eye" className="size-4" /> الجدول مخفي حاليًا عن المعلمين والطلاب.
          <Link href="/staff/settings?s=visibility" className="font-semibold underline">تغيير الإعداد</Link>
        </p>
      )}
      <Insights
        stats={[
          { label: 'اختبارات قادمة', value: upcoming.length, icon: 'exams', hint: `من ${exams.length} إجمالًا` },
          { label: 'خلال 7 أيام', value: upcoming.filter((e) => daysUntil(e.date) <= 7).length, icon: 'calendar' },
          { label: 'اليوم', value: upcoming.filter((e) => e.date === today).length, icon: 'timetable', tone: 'gold' },
          { label: 'تعارضات', value: conflicts.length, icon: 'close', tone: conflicts.length ? 'danger' : undefined, hint: conflicts.length ? 'فصل باختبارين أو معلم بفصلين' : 'لا تعارض' },
        ]}
        donut={{ title: 'القادمة حسب المادة', caption: 'كل الفصول', unit: 'اختبار', items: [...bySubject.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value) }}
      />

      {conflicts.length > 0 && (
        <div className="mb-5 rounded-2xl border border-danger/30 bg-danger-soft/60 p-4">
          <p className="font-semibold text-danger">تعارضات في الجدول</p>
          <ul className="mt-2 space-y-1 text-sm">
            {conflicts.slice(0, 8).map(({ kind, g }) => (
              <li key={kind + g.map((x) => x.id).join()}>
                {kind === 'class'
                  ? <>فصل <b>{g[0].classLabel}</b> عليه {g.length} اختبارات يوم {fmtShortDate(g[0].date)}: {g.map((x) => x.subject).join('، ')}</>
                  : <>المعلم <b>{g[0].teacher}</b> في فصلين بنفس الوقت {fmtShortDate(g[0].date)} {fmtTime(g[0].startsAt)}</>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="rounded-[1.4rem] border border-line bg-surface p-4 sm:p-5">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-paper p-1">
            {([['upcoming', 'القادمة'], ['week', 'هذا الأسبوع'], ['all', 'الكل']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setRange(k)} className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${range === k ? 'bg-surface text-board shadow-sm' : 'text-muted'}`}>{l}</button>
            ))}
          </div>
          {branches.length > 1 && (
            <select value={branch} onChange={(e) => { setBranch(e.target.value); setClassId(0); }} className="field h-11 w-auto py-2" aria-label="الفرع">
              <option value="">كل الفروع</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          <select value={classId} onChange={(e) => setClassId(Number(e.target.value))} className="field h-11 min-w-0 flex-1 py-2 sm:max-w-xs" aria-label="الفصل">
            <option value={0}>كل الفصول</option>
            {classes.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <div className="flex gap-2 sm:ms-auto">
            <button type="button" onClick={() => downloadCsv('جدول-الاختبارات', ['التاريخ', 'اليوم', 'الوقت', 'المادة', 'الفصل', 'الفرع', 'المعلم', 'الفترة'], filtered.map((e) => [e.date, fmtWeekday(e.date), fmtTime(e.startsAt), e.subject, e.classLabel, e.branch, e.teacher, e.period]))}
              className="btn h-11 rounded-xl border border-line bg-surface px-3.5 hover:border-board/40 hover:text-board">
              <Icon name="audit" className="size-4" /> تصدير
            </button>
            <Link href="/staff/settings?s=exams" className="btn h-11 rounded-xl border border-line bg-surface px-3.5 hover:border-board/40 hover:text-board">
              <Icon name="edit" className="size-4" /> تعديل
            </Link>
          </div>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${branch}-${classId}-${range}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {filtered.length ? <Grouped exams={filtered} showClass /> : <p className="py-14 text-center text-muted">لا اختبارات مطابقة</p>}
          </motion.div>
        </AnimatePresence>
      </section>
    </>
  );
}
