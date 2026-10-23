'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Icon } from '@/components/shell/icons';
import { Badge } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { Sheet } from '@/components/sheet';
import { downloadCsv } from '@/components/registry/csv';
import { gradeFormAnswer, resetAttempt } from '@/lib/assess/actions';
import type { AttemptRow, FormDetail } from '@/lib/assess/queries';
import type { ServerQuestion } from '@/lib/assess/draft';
import { QTYPE_LABEL, relTime } from '@/lib/assess/shared';
import { RichText } from './math';
import { fmtFull } from './kit';
import { Mini } from './task-grading';

type StudentState =
  | { kind: 'done'; attempt: AttemptRow; count: number }
  | { kind: 'absent'; attempt: AttemptRow }
  | { kind: 'live'; session: FormDetail['sessions'][number] }
  | { kind: 'none' };

/** مدة الحل بصيغة دقائق:ثوانٍ (مثل 14:25) */
const fmtDur = (s: number | null) => (s == null ? '—' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

function useStates(form: FormDetail) {
  return useMemo(() => {
    const m = new Map<number, StudentState>();
    for (const st of form.roster) {
      const real = form.attempts.filter((a) => a.student_id === st.id && !a.is_auto_absent);
      const absent = form.attempts.find((a) => a.student_id === st.id && a.is_auto_absent);
      const live = form.sessions.find((s) => s.student_id === st.id && !s.submitted_at);
      if (live) m.set(st.id, { kind: 'live', session: live });
      else if (real.length) m.set(st.id, { kind: 'done', attempt: real[real.length - 1], count: real.length });
      else if (absent) m.set(st.id, { kind: 'absent', attempt: absent });
      else m.set(st.id, { kind: 'none' });
    }
    return m;
  }, [form]);
}

export function FormResults({ form }: { form: FormDetail }) {
  const states = useStates(form);
  const [openId, setOpenId] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'done' | 'live' | 'none' | 'review' | 'focus'>('all');
  const max = form.questions.reduce((a, q) => a + q.points, 0);
  const latest = [...states.values()].filter((s): s is Extract<StudentState, { kind: 'done' }> => s.kind === 'done').map((s) => s.attempt);
  const scores = latest.map((a) => a.score);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const pending = latest.filter((a) => a.pending_review > 0).length;
  const live = [...states.values()].filter((s) => s.kind === 'live').length;
  const flagged = latest.filter((a) => a.focus_events >= 3).length;

  const rows = form.roster.filter((st) => {
    const s = states.get(st.id)!;
    if (filter === 'done') return s.kind === 'done';
    if (filter === 'live') return s.kind === 'live';
    if (filter === 'none') return s.kind === 'none' || s.kind === 'absent';
    if (filter === 'review') return s.kind === 'done' && s.attempt.pending_review > 0;
    if (filter === 'focus') return s.kind === 'done' && s.attempt.focus_events >= 3;
    return true;
  });

  const exportCsv = () =>
    downloadCsv(
      `نتائج-${form.title}`,
      ['رقم الطالب', 'الاسم', 'الحالة', 'الدرجة', 'من', 'النسبة', 'المدة', 'مرات الخروج', 'المحاولات', 'وقت التسليم'],
      form.roster.map((st) => {
        const s = states.get(st.id)!;
        const a = s.kind === 'done' || s.kind === 'absent' ? s.attempt : null;
        return [
          st.code,
          st.name_ar,
          s.kind === 'done' ? 'سلّم' : s.kind === 'absent' ? 'لم يحل (صفر)' : s.kind === 'live' ? 'يحل الآن' : 'لم يبدأ',
          a?.score ?? '',
          a?.max_score ?? max,
          a ? `${pctOf(a.score, a.max_score)}%` : '',
          a ? fmtDur(a.duration_seconds) : '',
          a?.focus_events ?? '',
          s.kind === 'done' ? s.count : '',
          a ? fmtFull(a.submitted_at) : '',
        ];
      }),
    );

  const open = openId != null ? form.roster.find((r) => r.id === openId) : null;
  const openState = openId != null ? states.get(openId) : undefined;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Mini label="سلّموا" value={`${latest.length}/${form.roster.length}`} icon="students" pct={form.roster.length ? latest.length / form.roster.length : 0} />
        <Mini label="متوسط الدرجة" value={avg != null ? `${Math.round(avg * 10) / 10} / ${max}` : '—'} icon="results" />
        <Mini label="بانتظار تصحيحك" value={String(pending)} icon="edit" tone={pending ? 'gold' : undefined} />
        <Mini label="يحلّون الآن" value={String(live)} icon="play" />
      </div>

      <section className="rounded-[1.4rem] border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-1.5 p-4">
          {(
            [
              ['all', 'الكل', form.roster.length],
              ['done', 'سلّم', latest.length],
              ['live', 'يحل الآن', live],
              ['none', 'لم يحل', form.roster.length - latest.length - live],
              ['review', 'بانتظار التصحيح', pending],
              ['focus', 'خروج متكرر', flagged],
            ] as const
          ).map(([k, label, n]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${filter === k ? 'bg-board text-chalk' : 'bg-paper hover:bg-board/10'}`}>
              {label} <span className="tabular-nums opacity-70">{n}</span>
            </button>
          ))}
          <button type="button" onClick={exportCsv} className="btn-quiet ms-auto px-3 py-2 text-xs">
            <Icon name="download" className="size-4" /> تصدير
          </button>
        </div>
        <ul className="divide-y divide-line border-t border-line">
          {rows.map((st) => {
            const s = states.get(st.id)!;
            return (
              <li key={st.id}>
                <button type="button" onClick={() => s.kind === 'done' && setOpenId(st.id)} className={`flex w-full flex-wrap items-center gap-3 px-4 py-3 text-start transition-colors sm:flex-nowrap ${s.kind === 'done' ? 'hover:bg-board/[0.03]' : 'cursor-default'}`}>
                  <span className={`grid size-10 shrink-0 place-items-center rounded-full font-bold ${s.kind === 'done' ? 'bg-ok-soft text-ok' : s.kind === 'live' ? 'bg-board/10 text-board' : s.kind === 'absent' ? 'bg-danger-soft text-danger' : 'bg-paper text-muted'}`}>
                    {s.kind === 'live' ? <span className="size-2.5 animate-pulse rounded-full bg-board" /> : st.name_ar.trim().charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{st.name_ar}</span>
                    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <bdi>{st.code}</bdi>
                      {s.kind === 'done' && (
                        <>
                          · سلّم {relTime(s.attempt.submitted_at)} · {fmtDur(s.attempt.duration_seconds)}
                          {s.count > 1 && ` · ${s.count} محاولات`}
                        </>
                      )}
                      {s.kind === 'live' && <>· يحل الآن — أجاب {s.session.answered}/{form.questions.length}{s.session.saved_at ? ` · آخر حفظ ${relTime(s.session.saved_at)}` : ''}</>}
                      {s.kind === 'absent' && <span className="text-danger">· لم يحل — صفر تلقائي</span>}
                      {s.kind === 'none' && <>· لم يبدأ</>}
                    </span>
                  </span>
                  {s.kind === 'done' && (
                    <span className="flex items-center gap-2">
                      {s.attempt.focus_events > 0 && (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${s.attempt.focus_events >= 3 ? 'bg-danger-soft text-danger' : 'bg-paper text-muted'}`} title="مرات الخروج من الصفحة">
                          <Icon name="alert" className="size-3.5" /> {s.attempt.focus_events}
                        </span>
                      )}
                      {s.attempt.pending_review > 0 && <Badge tone="gold">{s.attempt.pending_review} للتصحيح</Badge>}
                      <ScorePill score={s.attempt.score} max={s.attempt.max_score} />
                    </span>
                  )}
                  {s.kind === 'absent' && <ScorePill score={0} max={s.attempt.max_score} />}
                </button>
              </li>
            );
          })}
          {rows.length === 0 && <li className="px-4 py-12 text-center text-muted">لا طلاب في هذا التصنيف</li>}
        </ul>
      </section>

      {open && openState?.kind === 'done' && (
        <AttemptSheet key={openState.attempt.id} form={form} student={open} attempt={openState.attempt} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

function ScorePill({ score, max }: { score: number; max: number }) {
  const p = pctOf(score, max);
  return (
    <span className={`min-w-20 rounded-xl px-2.5 py-1.5 text-center text-sm font-bold tabular-nums ${p >= 85 ? 'bg-ok-soft text-ok' : p >= 65 ? 'bg-board/10 text-board' : p >= 50 ? 'bg-brass-soft text-brass' : 'bg-danger-soft text-danger'}`} dir="ltr">
      {Math.round(score * 100) / 100} / {max}
    </span>
  );
}

function AttemptSheet({ form, student, attempt, onClose }: { form: FormDetail; student: { id: number; name_ar: string; code: string }; attempt: AttemptRow; onClose: () => void }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [score, setScore] = useState({ score: attempt.score, max: attempt.max_score, pending: attempt.pending_review });
  const ans = new Map(attempt.answers.map((a) => [a.question_id, a]));
  const session = form.sessions.find((s) => s.student_id === student.id && s.submitted_at);
  const events = session ? form.events.filter((e) => e.session_id === session.id) : [];

  const reset = async () => {
    const ok = await confirm({ title: `تصفير محاولة ${student.name_ar}؟`, body: 'تُحذف إجاباته ودرجته في هذا النموذج، ويستطيع الحل من جديد ما دام النموذج مفتوحًا.', confirmLabel: 'تصفير', danger: true, run: () => resetAttempt(attempt.id, form.id) });
    if (!ok) return;
    onClose();
    router.refresh();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={student.name_ar}
      subtitle={`المحاولة ${attempt.attempt_no} · ${fmtFull(attempt.submitted_at)} · ${fmtDur(attempt.duration_seconds)}`}
      footer={
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm">
            المجموع <b className="text-lg tabular-nums" dir="ltr">{Math.round(score.score * 100) / 100} / {score.max}</b>
            {score.pending > 0 && <span className="ms-2 text-xs text-brass">{score.pending} بانتظار التصحيح</span>}
          </span>
          <button type="button" onClick={reset} className="btn-danger px-3 py-2 text-xs">
            <Icon name="undo" className="size-4" /> تصفير
          </button>
        </div>
      }
    >
      {events.length > 0 && (
        <div className="mb-4 rounded-2xl border border-danger/20 bg-danger-soft/50 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-danger"><Icon name="alert" className="size-4" /> سجل الخروج أثناء الحل ({events.length})</p>
          <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {events.slice(0, 30).map((e, i) => (
              <li key={i} className="rounded-full bg-surface px-2 py-0.5 text-muted">
                {e.kind === 'hidden' ? 'غادر الصفحة' : e.kind === 'blur' ? 'خرج من النافذة' : e.kind === 'paste' ? 'لصق نص' : e.kind} · {new Intl.DateTimeFormat('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(e.at))}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ol className="space-y-3">
        {form.questions.map((q, i) => (
          <AnswerReview
            key={q.id}
            q={q}
            n={i + 1}
            a={ans.get(q.id)}
            onGrade={async (pts, fb) => {
              const res = await gradeFormAnswer(attempt.id, q.id, pts, fb, form.id);
              if (!res.ok) {
                toast(res.error, 'error');
                return false;
              }
              setScore({ score: Number(res.data!.score), max: Number(res.data!.max_score), pending: res.data!.pending_review });
              toast('حُفظت الدرجة');
              router.refresh();
              return true;
            }}
          />
        ))}
      </ol>
    </Sheet>
  );
}

function AnswerReview({ q, n, a, onGrade }: { q: ServerQuestion; n: number; a: AttemptRow['answers'][number] | undefined; onGrade: (pts: number, fb: string | null) => Promise<boolean> }) {
  const [edit, setEdit] = useState(a?.status === 'pending');
  const [pts, setPts] = useState(a ? String(a.points) : '0');
  const [fb, setFb] = useState(a?.feedback ?? '');
  const [busy, setBusy] = useState(false);
  const earned = a?.points ?? 0;
  const full = earned >= q.points && q.points > 0;
  const tone = a?.status === 'pending' ? 'border-gold/50 bg-brass-soft/30' : full ? 'border-ok/30' : earned > 0 ? 'border-board/20' : 'border-danger/25';
  const resp = a?.response;

  return (
    <li className={`rounded-2xl border p-3.5 ${tone}`}>
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="rounded-full bg-ink px-2 py-0.5 font-bold text-chalk tabular-nums">{n}</span>
        <span className="text-muted">{QTYPE_LABEL[q.qtype]}</span>
        <span className={`ms-auto rounded-full px-2 py-0.5 font-bold tabular-nums ${a?.status === 'pending' ? 'bg-gold/25 text-brass' : full ? 'bg-ok-soft text-ok' : earned > 0 ? 'bg-board/10 text-board' : 'bg-danger-soft text-danger'}`} dir="ltr">
          {a?.status === 'pending' ? '?' : Math.round(earned * 100) / 100} / {q.points}
        </span>
      </div>
      <p className="text-sm font-semibold leading-relaxed"><RichText text={q.qtype === 'fill' ? q.body.replace(/\[\[(\d+)\]\]/g, '(…$1)') : q.body} /></p>

      <div className="mt-2.5 text-sm">
        {!a && <p className="text-muted">— لم يُجب —</p>}
        {a && (q.qtype === 'mcq' || q.qtype === 'tf') && (
          <ul className="space-y-1">
            {q.options.map((o) => (
              <li key={o.id} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${o.is_correct ? 'bg-ok-soft text-ok' : o.id === a.option_id ? 'bg-danger-soft text-danger' : 'text-muted'}`}>
                <span className="w-4">{o.is_correct ? '✓' : o.id === a.option_id ? '✗' : ''}</span>
                <RichText text={o.body} />
                {o.id === a.option_id && <span className="ms-auto text-[0.7rem] font-semibold">اختياره</span>}
              </li>
            ))}
          </ul>
        )}
        {a && (q.qtype === 'short' || q.qtype === 'long') && (
          <>
            <div className="whitespace-pre-wrap rounded-xl bg-paper px-3 py-2 leading-relaxed">{String(resp ?? '')}</div>
            {q.qtype === 'short' && (q.config.answers?.length ?? 0) > 0 && <p className="mt-1 text-xs text-ok">المقبول: {q.config.answers!.join(' | ')}</p>}
          </>
        )}
        {a && q.qtype === 'match' && (
          <ul className="space-y-1">
            {(q.config.pairs ?? []).map((p, i) => {
              const chosen = (resp as Record<string, number> | null)?.[String(i)];
              const ok = chosen === i;
              return (
                <li key={i} className={`flex flex-wrap items-center gap-2 rounded-lg px-2.5 py-1.5 ${ok ? 'bg-ok-soft text-ok' : 'bg-danger-soft/60 text-danger'}`}>
                  <RichText text={p.l} /> ⇄ <RichText text={chosen != null ? q.config.pairs![chosen]?.r ?? '—' : '—'} />
                  {!ok && <span className="ms-auto text-xs text-ok">الصحيح: <RichText text={p.r} /></span>}
                </li>
              );
            })}
          </ul>
        )}
        {a && q.qtype === 'fill' && (
          <ul className="space-y-1">
            {(q.config.blanks ?? []).map((b, i) => {
              const v = (resp as string[] | null)?.[i] ?? '';
              return (
                <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-paper px-2.5 py-1.5">
                  <span className="text-xs text-muted">({i + 1})</span>
                  <b>{v || '—'}</b>
                  <span className="ms-auto text-xs text-ok">المقبول: {b.join(' | ')}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {a?.feedback && !edit && <p className="mt-2 rounded-lg bg-board/[0.06] px-2.5 py-1.5 text-xs text-board">ملاحظتك: {a.feedback}</p>}
      {edit ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2.5">
          <input type="number" inputMode="decimal" min={0} max={q.points} step={0.25} value={pts} onChange={(e) => setPts(e.target.value)} className="field w-20 py-2 text-center font-bold tabular-nums" dir="ltr" aria-label="الدرجة" />
          <span className="text-sm text-muted">/ {q.points}</span>
          <button type="button" onClick={() => setPts(String(q.points))} className="rounded-full bg-paper px-2.5 py-1 text-xs">كاملة</button>
          <button type="button" onClick={() => setPts(String(Math.round((q.points / 2) * 100) / 100))} className="rounded-full bg-paper px-2.5 py-1 text-xs">نصف</button>
          <button type="button" onClick={() => setPts('0')} className="rounded-full bg-paper px-2.5 py-1 text-xs">صفر</button>
          <input value={fb} onChange={(e) => setFb(e.target.value)} placeholder="ملاحظة (اختياري)" className="field min-w-40 flex-1 py-2" />
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              const v = Number(pts);
              if (!(v >= 0 && v <= q.points)) return;
              setBusy(true);
              const ok = await onGrade(v, fb.trim() || null);
              setBusy(false);
              if (ok) setEdit(false);
            }}
            className="btn-primary px-4 py-2"
          >
            {busy ? <span className="spinner" /> : 'حفظ'}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setEdit(true)} className="mt-2 text-xs font-semibold text-board hover:underline">
          {a?.status === 'manual' ? 'تعديل درجتك' : 'تعديل الدرجة يدويًا'}
        </button>
      )}
    </li>
  );
}

/* =====================================================================
   تحليل النتائج
   ===================================================================== */
export function FormAnalytics({ form }: { form: FormDetail }) {
  const states = useStates(form);
  const latest = [...states.values()].filter((s): s is Extract<StudentState, { kind: 'done' }> => s.kind === 'done').map((s) => s.attempt);
  const max = form.questions.reduce((a, q) => a + q.points, 0);

  if (!latest.length)
    return (
      <div className="grid place-items-center rounded-[1.4rem] border border-line bg-surface px-6 py-16 text-center">
        <span className="grid size-16 place-items-center rounded-2xl bg-board/10 text-board"><Icon name="results" className="size-8" /></span>
        <p className="mt-4 text-lg font-semibold">لا تسليمات بعد</p>
        <p className="mt-1 text-sm text-muted">يظهر التحليل بعد أول تسليم.</p>
      </div>
    );

  const pcts = latest.map((a) => pctOf(a.score, a.max_score || max));
  const sorted = [...pcts].sort((a, b) => a - b);
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);
  const passed = pcts.filter((p) => p >= 50).length;
  const durations = latest.map((a) => a.duration_seconds).filter((d): d is number => d != null);
  const avgDur = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
  const buckets = Array.from({ length: 10 }, (_, i) => ({ name: `${i * 10}–${i * 10 + 10}`, n: pcts.filter((p) => (i === 9 ? p >= 90 : p >= i * 10 && p < i * 10 + 10)).length }));

  const perQ = form.questions.map((q, i) => {
    const got = latest.map((a) => a.answers.find((x) => x.question_id === q.id));
    const answered = got.filter(Boolean).length;
    const avg = latest.length ? got.reduce((s, x) => s + (x?.points ?? 0), 0) / latest.length : 0;
    const rate = q.points ? Math.round((avg / q.points) * 100) : 0;
    const dist = q.qtype === 'mcq' || q.qtype === 'tf' ? q.options.map((o) => ({ ...o, n: got.filter((x) => x?.option_id === o.id).length })) : null;
    return { q, n: i + 1, answered, rate, dist, pending: got.filter((x) => x?.status === 'pending').length };
  });
  const hardest = [...perQ].filter((x) => x.q.points > 0 && x.pending === 0).sort((a, b) => a.rate - b.rate).slice(0, 3);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Mini label="متوسط النسبة" value={`${Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)}%`} icon="results" />
        <Mini label="الوسيط" value={`${median}%`} icon="sort" />
        <Mini label="نجح (≥ 50%)" value={`${passed}/${latest.length}`} icon="check" pct={passed / latest.length} />
        <Mini label="متوسط مدة الحل" value={fmtDur(avgDur)} icon="clock" />
      </div>

      <section className="rounded-[1.4rem] border border-line bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold">توزيع الدرجات</h3>
          <span className="text-xs text-muted">أعلى {sorted.at(-1)}% · أدنى {sorted[0]}%</span>
        </div>
        <div className="h-52" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#5f6e66' }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#5f6e66' }} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: 'rgb(53 104 84 / 0.06)' }} formatter={(v) => [`${v} طالب`, 'العدد']} labelFormatter={(l) => `${l}%`} contentStyle={{ borderRadius: 12, border: '1px solid #dfe5e2', fontFamily: 'inherit', direction: 'rtl', fontSize: 13 }} />
              <Bar dataKey="n" radius={[6, 6, 0, 0]} animationDuration={800}>
                {buckets.map((_, i) => <Cell key={i} fill={i < 5 ? '#d9a441' : i < 7 ? '#5d9478' : '#356854'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {hardest.length > 0 && (
        <section className="rounded-[1.4rem] border border-gold/40 bg-brass-soft/50 p-5">
          <h3 className="flex items-center gap-2 font-bold text-brass"><Icon name="sparkle" className="size-5" /> الأسئلة الأصعب — تستحق مراجعة مع الطلاب</h3>
          <ul className="mt-3 space-y-2">
            {hardest.map((x) => (
              <li key={x.q.id} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2 text-sm">
                <span className="font-bold tabular-nums text-muted">س{x.n}</span>
                <span className="min-w-0 flex-1 truncate"><RichText text={x.q.body.replace(/\[\[\d+\]\]/g, '…')} /></span>
                <span className="font-bold tabular-nums text-danger">{x.rate}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-[1.4rem] border border-line bg-surface">
        <h3 className="border-b border-line px-5 py-3.5 font-bold">أداء كل سؤال</h3>
        <ol className="divide-y divide-line">
          {perQ.map((x) => (
            <li key={x.q.id} className="px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded-full bg-ink px-2 py-0.5 text-xs font-bold tabular-nums text-chalk">{x.n}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-relaxed"><RichText text={x.q.body.replace(/\[\[\d+\]\]/g, '…')} /></p>
                  <p className="mt-0.5 text-xs text-muted">{QTYPE_LABEL[x.q.qtype]} · {x.q.points} درجة · أجاب {x.answered}/{latest.length}{x.pending ? ` · ${x.pending} بانتظار التصحيح` : ''}</p>
                </div>
                <span className={`shrink-0 text-lg font-bold tabular-nums ${x.rate >= 75 ? 'text-ok' : x.rate >= 50 ? 'text-board' : x.rate >= 30 ? 'text-brass' : 'text-danger'}`}>{x.rate}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper">
                <div className={`h-full origin-right animate-grow rounded-full ${x.rate >= 75 ? 'bg-ok' : x.rate >= 50 ? 'bg-board' : x.rate >= 30 ? 'bg-gold' : 'bg-danger'}`} style={{ width: `${x.rate}%` }} />
              </div>
              {x.dist && (
                <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                  {x.dist.map((o) => (
                    <li key={o.id} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${o.is_correct ? 'bg-ok-soft text-ok' : 'bg-paper'}`}>
                      <span className="min-w-0 flex-1 truncate">{o.is_correct ? '✓ ' : ''}<RichText text={o.body} /></span>
                      <span className="font-bold tabular-nums">{o.n}</span>
                      <span className="w-9 text-end tabular-nums text-muted">{pctOf(o.n, latest.length)}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
