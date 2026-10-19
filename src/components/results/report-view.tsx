'use client';

import { motion } from 'motion/react';
import { Icon } from '@/components/shell/icons';
import { SECTIONS, n2, rating, type ReportStudent, type ReportSubject } from '@/lib/results/shared';

/* =====================================================================
   عرض الكشف على الشاشة (للطالب ولمعاينة الإدارة): ملخص + بطاقة لكل مادة
   ===================================================================== */

function Ring({ pct, size = 132 }: { pct: number | null; size?: number }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, pct ?? 0));
  // على الخلفية الخضراء: ذهبي للناجح، وأحمر فاتح لما دون 60
  const tone = pct == null ? 'rgb(255 255 255 / 0.3)' : pct >= 60 ? '#e2b357' : '#f19a8f';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.14)" strokeWidth="10" />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={tone}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c - (c * v) / 100 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}

export function ReportSummary({ s }: { s: ReportStudent }) {
  const overall = rating(s.average);
  const att = s.attendance;
  const attR = rating(att.pct);
  const behR = rating(s.behavior.score);
  return (
    <section className="relative overflow-hidden rounded-[1.75rem] bg-board p-5 text-chalk sm:p-6">
      <div aria-hidden className="absolute -start-20 -top-24 size-72 rounded-full bg-gold/15 blur-3xl" />
      <div className="relative flex flex-wrap items-center gap-5 sm:gap-7">
        <div className="relative grid shrink-0 place-items-center">
          <Ring pct={s.average} />
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-[1.9rem] font-bold leading-none tabular-nums" dir="ltr">{s.average == null ? '—' : n2(s.average)}<span className="text-base text-chalk/60">%</span></p>
              <p className="mt-1 text-xs text-chalk/70">المعدل · Average</p>
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-chalk/70">التقدير العام · Overall Grade</p>
          <p className="mt-0.5 text-[1.75rem] font-bold leading-tight">{overall?.ar ?? 'لم تُرصد درجات بعد'} {overall && <span className="text-base font-medium text-gold" dir="ltr">{overall.en}</span>}</p>
          <p className="mt-1 text-sm text-chalk/75">
            المجموع <b className="tabular-nums text-chalk" dir="ltr">{n2(s.total)} / {n2(s.max_total)}</b> · {s.graded} مادة مرصودة
            {s.rank ? <> · الترتيب <b className="text-gold">{s.rank}</b></> : null}
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:min-w-64">
          <div className="rounded-2xl bg-chalk/10 px-3.5 py-3">
            <p className="text-xs text-chalk/70">المواظبة · Attendance</p>
            {att.pct == null ? (
              <p className="mt-1 font-bold text-gold">{att.intisab ? 'طالب منتسب' : '—'}</p>
            ) : (
              <p className="mt-1 text-lg font-bold tabular-nums" dir="ltr">{n2(att.pct)}% <span className="text-xs font-medium text-chalk/70">{attR?.en}</span></p>
            )}
            {att.granted && <p className="text-[0.7rem] text-chalk/60">ممنوحة من الإدارة</p>}
            {!att.granted && att.pct != null && att.total > 0 && <p className="text-[0.7rem] text-chalk/60">{att.absent} غياب · {att.late} تأخر</p>}
          </div>
          <div className="rounded-2xl bg-chalk/10 px-3.5 py-3">
            <p className="text-xs text-chalk/70">السلوك · Behavior</p>
            <p className="mt-1 text-lg font-bold tabular-nums" dir="ltr">{n2(s.behavior.score)} <span className="text-xs font-medium text-chalk/70">{behR?.en}</span></p>
            <p className="text-[0.7rem] text-chalk/60">{s.behavior.positive} إيجابي · {s.behavior.negative} ملاحظة</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SubjectBreakdown({ s, subjects, showEvals = false }: { s: ReportStudent; subjects: ReportSubject[]; showEvals?: boolean }) {
  const by = new Map(subjects.map((x) => [x.id, x]));
  if (!s.subjects.length)
    return (
      <div className="grid place-items-center rounded-[1.4rem] border border-dashed border-line bg-surface px-6 py-12 text-center">
        <Icon name="results" className="size-9 text-muted" />
        <p className="mt-3 font-semibold">لا مواد في هذا الفصل الدراسي بعد</p>
      </div>
    );
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {s.subjects.map((r, i) => {
        const sub = by.get(r.subject_id);
        if (!sub) return null;
        const rt = rating(r.pct);
        return (
          <motion.li
            key={r.subject_id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 12) * 0.04 }}
            className={`rounded-[1.4rem] border bg-surface p-4 ${r.visible ? 'border-line' : 'border-dashed border-gold/60'}`}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold leading-snug">{sub.name}</p>
                <p className="text-xs text-muted" dir="ltr" style={{ textAlign: 'right' }}>{sub.name_en ?? ''}</p>
                {!r.visible && <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-brass-soft px-2 py-0.5 text-[0.7rem] font-semibold text-brass"><Icon name="eye" className="size-3" /> مخفية عن الطالب</p>}
              </div>
              <div className="text-end">
                <p className="text-xl font-bold tabular-nums" dir="ltr">{r.total == null ? '—' : n2(r.total)}<span className="text-xs font-medium text-muted"> / {n2(r.max ?? sub.max)}</span></p>
                {rt ? <p className={`text-xs font-bold ${rt.tone}`}>{rt.ar} · <span dir="ltr">{rt.en}</span></p> : <p className="text-xs text-muted">لم تُرصد</p>}
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {SECTIONS.filter((sec) => Number(sub[sec.key]) > 0).map((sec) => {
                const v = r[sec.key];
                const mx = Number(sub[sec.key]);
                const p = v == null ? 0 : Math.min(100, (Number(v) / mx) * 100);
                return (
                  <div key={sec.key}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted">{sec.ar} <span className="hidden sm:inline" dir="ltr">· {sec.en}</span></span>
                      <span className="font-semibold tabular-nums" dir="ltr">{v == null ? '—' : n2(v)} / {n2(mx)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-paper">
                      <motion.div className="h-full rounded-full" style={{ background: rating(v == null ? null : p)?.bar ?? '#c8d2cd' }} initial={{ width: 0 }} animate={{ width: `${p}%` }} transition={{ duration: 0.8, delay: 0.1 + Math.min(i, 12) * 0.04 }} />
                    </div>
                  </div>
                );
              })}
            </div>
            {showEvals && sub.evals.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                {sub.evals.map((e) => (
                  <span key={e.id} className="rounded-full bg-paper px-2.5 py-1 text-[0.72rem]">
                    {e.name} <b className="tabular-nums" dir="ltr">{r.evals[String(e.id)] == null ? '—' : n2(r.evals[String(e.id)])}/{n2(e.weight)}</b>
                  </span>
                ))}
              </div>
            )}
          </motion.li>
        );
      })}
    </ul>
  );
}
