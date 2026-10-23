'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '@/components/shell/icons';
import { Badge } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { Sheet } from '@/components/sheet';
import { downloadCsv } from '@/components/registry/csv';
import { gradeTask, returnSubmission } from '@/lib/assess/actions';
import type { TaskDetail, TaskSubmission } from '@/lib/assess/queries';
import { fmtBytes, relTime } from '@/lib/assess/shared';
import { RichText } from './math';
import { fmtFull } from './kit';

type Filter = 'all' | 'missing' | 'to_grade' | 'graded' | 'late';

export function TaskGrading({ task }: { task: TaskDetail }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const max = task.max_score ?? 0;
  const subOf = useMemo(() => new Map(task.submissions.map((s) => [s.student_id, s])), [task.submissions]);
  const gradeOf = useMemo(() => new Map(task.grades.map((g) => [g.student_id, g])), [task.grades]);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState<Filter>(task.submission_mode === 'none' ? 'all' : task.submissions.some((s) => !s.graded_at) ? 'to_grade' : 'all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const noSubmit = task.submission_mode === 'none';

  const rows = task.roster.map((st) => {
    const sub = subOf.get(st.id) ?? null;
    const g = gradeOf.get(st.id) ?? null;
    return { st, sub, g };
  });
  const counts = {
    all: rows.length,
    missing: rows.filter((r) => !r.sub).length,
    to_grade: rows.filter((r) => r.sub && !r.sub.graded_at).length,
    graded: rows.filter((r) => r.g).length,
    late: rows.filter((r) => r.sub?.is_late).length,
  };
  const shown = rows.filter((r) => {
    if (q && !r.st.name_ar.includes(q.trim()) && !r.st.code.includes(q.trim())) return false;
    if (filter === 'missing') return !r.sub;
    if (filter === 'to_grade') return r.sub && !r.sub.graded_at;
    if (filter === 'graded') return !!r.g;
    if (filter === 'late') return r.sub?.is_late;
    return true;
  });
  const changed = Object.entries(draft).filter(([sid, v]) => v !== '' && Number(v) !== gradeOf.get(Number(sid))?.score);
  const invalid = changed.filter(([, v]) => !(Number(v) >= 0 && Number(v) <= max));
  const scores = task.grades.map((g) => g.score);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  const saveAll = async () => {
    if (invalid.length) return toast(`الدرجة بين 0 و ${max}`, 'error');
    if (!changed.length) return;
    const ok = await confirm({ title: `حفظ رصد ${changed.length} طالب؟`, body: 'تظهر الدرجات للطلاب في نتائجهم فورًا (ما لم تُخفِها الإدارة).', confirmLabel: 'حفظ الرصد' });
    if (!ok) return;
    setBusy(true);
    const res = await gradeTask(task.id, changed.map(([sid, v]) => ({ student_id: Number(sid), score: Number(v) })));
    setBusy(false);
    if (!res.ok) return toast(res.error, 'error');
    toast(res.message);
    setDraft({});
    router.refresh();
  };

  const fillAll = async (mode: 'full' | 'zero_missing') => {
    const target = mode === 'full' ? rows.filter((r) => !r.g && (noSubmit || r.sub)) : rows.filter((r) => !r.sub && !r.g);
    if (!target.length) return toast('لا طلاب ينطبق عليهم ذلك', 'info');
    const ok = await confirm({
      title: mode === 'full' ? `الدرجة الكاملة لـ ${target.length} طالب؟` : `صفر لـ ${target.length} طالب لم يسلّم؟`,
      body: mode === 'full' ? `تُوضع ${max} لكل من ${noSubmit ? 'لم يُرصد له' : 'سلّم ولم يُصحَّح'} بعد في الخانات، ثم تراجعها وتحفظ.` : 'تُوضع في الخانات، ثم تراجعها وتحفظ.',
      confirmLabel: 'ضعها في الخانات',
    });
    if (!ok) return;
    setDraft((d) => ({ ...d, ...Object.fromEntries(target.map((r) => [r.st.id, String(mode === 'full' ? max : 0)])) }));
  };

  const exportCsv = () =>
    downloadCsv(
      `رصد-${task.title}`,
      ['رقم الطالب', 'الاسم', 'التسليم', 'وقت التسليم', 'متأخر', 'الدرجة', 'من', 'ملاحظة المعلم'],
      rows.map((r) => [r.st.code, r.st.name_ar, r.sub ? 'سلّم' : 'لم يسلّم', r.sub ? fmtFull(r.sub.submitted_at) : '', r.sub?.is_late ? 'نعم' : '', r.g?.score ?? '', max, r.sub?.feedback ?? '']),
    );

  const open = openId != null ? rows.find((r) => r.st.id === openId) ?? null : null;
  const openIdx = open ? shown.findIndex((r) => r.st.id === open.st.id) : -1;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Mini label={noSubmit ? 'الطلاب' : 'سلّموا'} value={noSubmit ? `${rows.length}` : `${rows.length - counts.missing}/${rows.length}`} icon="students" pct={noSubmit ? undefined : rows.length ? (rows.length - counts.missing) / rows.length : 0} />
        <Mini label="بانتظار التصحيح" value={String(counts.to_grade)} icon="edit" tone={counts.to_grade ? 'gold' : undefined} />
        <Mini label="رُصدت درجاتهم" value={`${counts.graded}/${rows.length}`} icon="check" pct={rows.length ? counts.graded / rows.length : 0} />
        <Mini label="متوسط الدرجة" value={avg != null ? `${round(avg)} / ${max}` : '—'} icon="results" />
      </div>

      <section className="rounded-[1.4rem] border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-2 p-4">
          <div className="flex flex-wrap gap-1">
            {(
              [
                ['all', 'الكل'],
                ...(noSubmit ? [] : ([['to_grade', 'بانتظار التصحيح'], ['missing', 'لم يسلّم'], ['late', 'متأخر']] as const)),
                ['graded', 'مرصود'],
              ] as [Filter, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${filter === k ? 'bg-board text-chalk' : 'bg-paper hover:bg-board/10'}`}
              >
                {label} <span className="tabular-nums opacity-70">{counts[k]}</span>
              </button>
            ))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن طالب" className="field ms-auto w-full py-2 sm:w-52" />
        </div>

        <ul className="divide-y divide-line border-t border-line">
          <AnimatePresence initial={false}>
            {shown.map(({ st, sub, g }, i) => {
              const v = draft[st.id] ?? (g ? String(g.score) : '');
              const bad = v !== '' && !(Number(v) >= 0 && Number(v) <= max);
              return (
                <motion.li
                  key={st.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i, 12) * 0.015 }}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap"
                >
                  <button type="button" onClick={() => setOpenId(st.id)} className="flex min-w-0 flex-1 items-center gap-3 text-start">
                    <span className={`grid size-10 shrink-0 place-items-center rounded-full font-bold ${sub ? (sub.graded_at ? 'bg-ok-soft text-ok' : 'bg-brass-soft text-brass') : 'bg-paper text-muted'}`}>
                      {st.name_ar.trim().charAt(0)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{st.name_ar}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <bdi>{st.code}</bdi>
                        {!noSubmit &&
                          (sub ? (
                            <>
                              · سلّم {relTime(sub.updated_at)}
                              {sub.is_late && <Badge tone="danger">متأخر</Badge>}
                              {sub.files.length > 0 && <span className="inline-flex items-center gap-0.5"><Icon name="clip" className="size-3" />{sub.files.length}</span>}
                              {sub.files_purged_at && <span className="text-[0.7rem]">(حُذفت الملفات)</span>}
                            </>
                          ) : (
                            <span className="text-danger">· لم يسلّم</span>
                          ))}
                        {g?.is_edited && <span className="text-[0.7rem] text-brass">· معدّل</span>}
                      </span>
                    </span>
                  </button>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={max}
                      step={0.25}
                      value={v}
                      onChange={(e) => setDraft((d) => ({ ...d, [st.id]: e.target.value }))}
                      className={`h-10 w-20 rounded-xl border bg-surface text-center text-base font-bold tabular-nums focus:outline-none focus:ring-4 ${bad ? 'border-danger text-danger focus:ring-danger/15' : draft[st.id] != null && draft[st.id] !== (g ? String(g.score) : '') ? 'border-gold bg-brass-soft/40 focus:ring-gold/20' : 'border-line focus:border-board focus:ring-gold/20'}`}
                      dir="ltr"
                      aria-label={`درجة ${st.name_ar}`}
                    />
                    <span className="w-10 text-sm text-muted tabular-nums">/ {max}</span>
                    {!noSubmit && (
                      <button type="button" onClick={() => setOpenId(st.id)} className="grid size-10 place-items-center rounded-xl text-muted hover:bg-board/10 hover:text-board" title="فتح التسليم">
                        <Icon name="eye" className="size-[1.15rem]" />
                      </button>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
          {shown.length === 0 && <li className="px-4 py-12 text-center text-muted">لا طلاب في هذا التصنيف</li>}
        </ul>
      </section>

      <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 lg:bottom-4">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface/95 p-2.5 shadow-[0_20px_50px_-20px_rgb(31_42_36/0.45)] backdrop-blur">
          <button type="button" onClick={() => fillAll('full')} className="btn-quiet px-3 py-2 text-xs">الدرجة الكاملة</button>
          {!noSubmit && <button type="button" onClick={() => fillAll('zero_missing')} className="btn-quiet px-3 py-2 text-xs">صفر لمن لم يسلّم</button>}
          <button type="button" onClick={exportCsv} className="btn-quiet px-3 py-2 text-xs"><Icon name="download" className="size-4" /> تصدير</button>
          <span className="ms-auto text-xs text-muted">{changed.length ? `${changed.length} تعديل غير محفوظ` : 'لا تعديلات'}</span>
          {changed.length > 0 && <button type="button" onClick={() => setDraft({})} className="btn-quiet px-3 py-2 text-xs">تراجع</button>}
          <button type="button" onClick={saveAll} disabled={!changed.length || busy} className="btn-primary px-5">
            {busy ? <span className="spinner" /> : <Icon name="check" className="size-4" />} حفظ الرصد
          </button>
        </div>
      </div>

      <SubmissionSheet
        key={openId ?? 'none'}
        task={task}
        row={open}
        onClose={() => setOpenId(null)}
        onNext={openIdx >= 0 && openIdx < shown.length - 1 ? () => setOpenId(shown[openIdx + 1].st.id) : undefined}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}

function SubmissionSheet({
  task,
  row,
  onClose,
  onNext,
  onSaved,
}: {
  task: TaskDetail;
  row: { st: { id: number; name_ar: string; code: string }; sub: TaskSubmission | null; g: { score: number; recorded_at: string } | null } | null;
  onClose: () => void;
  onNext?: () => void;
  onSaved: () => void;
}) {
  const { toast, confirm } = useFeedback();
  const max = task.max_score ?? 0;
  const [score, setScore] = useState(row?.g ? String(row.g.score) : '');
  const [feedback, setFeedback] = useState(row?.sub?.feedback ?? '');
  const [busy, setBusy] = useState(false);

  const save = async (next: boolean) => {
    if (!row) return;
    const n = score === '' ? null : Number(score);
    if (n != null && !(n >= 0 && n <= max)) return toast(`الدرجة بين 0 و ${max}`, 'error');
    setBusy(true);
    const res = await gradeTask(task.id, [{ student_id: row.st.id, score: n, feedback: feedback.trim() || null }]);
    setBusy(false);
    if (!res.ok) return toast(res.error, 'error');
    toast(`حُفظ: ${row.st.name_ar}`);
    onSaved();
    if (next && onNext) onNext();
    else onClose();
  };

  const giveBack = async () => {
    if (!row?.sub) return;
    const ok = await confirm({ title: 'إعادة التسليم للطالب؟', body: 'يُلغى تصحيح التسليم فيستطيع الطالب تعديله وإعادة إرساله (تبقى الدرجة المرصودة حتى تغيّرها).', confirmLabel: 'إعادة', run: () => returnSubmission(row.sub!.id, task.id) });
    if (!ok) return;
    onSaved();
    onClose();
  };

  const sub = row?.sub;
  return (
    <Sheet
      open={row !== null}
      onClose={onClose}
      title={row?.st.name_ar ?? ''}
      subtitle={sub ? `سلّم ${fmtFull(sub.updated_at)}${sub.is_late ? ' — متأخر' : ''}` : 'لم يسلّم'}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => save(true)} disabled={busy} className="btn-primary flex-1 py-3">
            {busy ? <span className="spinner" /> : <Icon name="check" className="size-4" />} {onNext ? 'حفظ والتالي' : 'حفظ'}
          </button>
          {onNext && <button type="button" onClick={onNext} className="btn-quiet py-3">تخطٍّ</button>}
        </div>
      }
    >
      {sub ? (
        <div className="space-y-4">
          {sub.body && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted">إجابة الطالب</p>
              <div className="rounded-2xl border border-line bg-paper/50 p-4 text-[0.98rem] leading-relaxed">
                <RichText text={sub.body} />
              </div>
            </div>
          )}
          {sub.files.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted">الملفات</p>
              <ul className="grid gap-2">
                {sub.files.map((f) => (
                  <li key={f.id}>
                    {f.url && f.mime.startsWith('image/') ? (
                      <a href={f.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl border border-line">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.url} alt={f.name} className="max-h-[28rem] w-full bg-paper object-contain" />
                        <span className="flex items-center justify-between px-3 py-2 text-xs text-muted">{f.name} <span>{fmtBytes(f.size_bytes)}</span></span>
                      </a>
                    ) : (
                      <a href={f.url ?? undefined} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-3 rounded-2xl border border-line p-3 ${f.url ? 'hover:border-board/40' : 'pointer-events-none opacity-60'}`}>
                        <span className="grid size-10 place-items-center rounded-xl bg-board/10 text-board"><Icon name="clip" className="size-5" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{f.name}</span>
                          <span className="text-xs text-muted">{f.deleted_at ? 'حُذف بعد التصحيح' : fmtBytes(f.size_bytes)}</span>
                        </span>
                        {f.url && <Icon name="download" className="size-4 text-muted" />}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!sub.body && !sub.files.length && <p className="rounded-xl bg-paper px-4 py-3 text-sm text-muted">التسليم بلا محتوى (حُذفت ملفاته بعد التصحيح).</p>}
          {sub.graded_at && (
            <button type="button" onClick={giveBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brass hover:underline">
              <Icon name="undo" className="size-4" /> إعادة التسليم للطالب ليعدّله
            </button>
          )}
        </div>
      ) : (
        <p className="rounded-xl bg-paper px-4 py-3 text-sm text-muted">{task.submission_mode === 'none' ? 'هذه المهمة بلا تسليم — ارصد الدرجة مباشرة.' : 'لم يسلّم الطالب بعد. يمكنك رصد درجته مباشرة.'}</p>
      )}

      <div className="mt-6 space-y-4 border-t border-line pt-5">
        <div>
          <p className="label">الدرجة من {max}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input type="number" inputMode="decimal" min={0} max={max} step={0.25} value={score} onChange={(e) => setScore(e.target.value)} className="field w-28 py-3 text-center text-xl font-bold tabular-nums" dir="ltr" autoFocus />
            {[max, round(max * 0.75), round(max / 2), 0].map((v, i) => (
              <button key={i} type="button" onClick={() => setScore(String(v))} className={`rounded-full px-3 py-1.5 text-sm tabular-nums transition-all ${score === String(v) ? 'bg-board text-chalk' : 'bg-paper hover:bg-board/10'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
        {sub && (
          <div>
            <p className="label">ملاحظة للطالب</p>
            <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} maxLength={4000} className="field" placeholder="أحسنت… / راجع الفقرة الثانية…" />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {['أحسنت، عمل متميز', 'إجابة جيدة', 'راجع الخطوات', 'ناقص — أكمل المطلوب'].map((t) => (
                <button key={t} type="button" onClick={() => setFeedback(t)} className="rounded-full bg-paper px-2.5 py-1 text-xs hover:bg-board/10">{t}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

const round = (n: number) => Math.round(n * 100) / 100;

function Mini({ label, value, icon, tone, pct }: { label: string; value: string; icon: Parameters<typeof Icon>[0]['name']; tone?: 'gold'; pct?: number }) {
  return (
    <div className="rounded-[1.25rem] border border-line bg-surface p-4">
      <p className="flex items-center gap-2 text-xs font-medium text-muted sm:text-sm">
        <span className={`grid size-8 place-items-center rounded-xl ${tone === 'gold' ? 'bg-brass-soft text-brass' : 'bg-board/10 text-board'}`}>
          <Icon name={icon} className="size-[1.05rem]" />
        </span>
        {label}
      </p>
      <p className={`mt-3 text-2xl font-bold tabular-nums ${tone === 'gold' ? 'text-brass' : ''}`} dir="ltr">{value}</p>
      {pct != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper">
          <div className="h-full origin-right animate-grow rounded-full bg-board" style={{ width: `${Math.round(pct * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
export { Mini };
