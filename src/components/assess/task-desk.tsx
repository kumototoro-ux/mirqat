'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '@/components/shell/icons';
import { Badge } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { gradeTask, returnSubmission } from '@/lib/assess/actions';
import type { TaskDetail } from '@/lib/assess/queries';
import { fmtBytes, relTime } from '@/lib/assess/shared';
import { RichText } from './math';
import { fmtFull } from './kit';

type Filter = 'todo' | 'all' | 'missing';
const round = (n: number) => Math.round(n * 100) / 100;
const PHRASES = ['أحسنت، عمل متميز', 'إجابة جيدة', 'راجع الخطوات', 'ناقص — أكمل المطلوب', 'خط واضح ومرتب', 'انتبه للأخطاء الإملائية'];

/**
 * مكتب التصحيح: قائمة الطلاب بجانب تسليم الطالب الحالي.
 * درجة + ملاحظة ← "حفظ والتالي" ينقلك تلقائيًا لأول تسليم لم يُصحَّح.
 */
export function TaskDesk({ task }: { task: TaskDetail }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const max = task.max_score ?? 0;
  const noSubmit = task.submission_mode === 'none';
  const subOf = useMemo(() => new Map(task.submissions.map((s) => [s.student_id, s])), [task.submissions]);
  const gradeOf = useMemo(() => new Map(task.grades.map((g) => [g.student_id, g])), [task.grades]);
  const rows = task.roster.map((st) => ({ st, sub: subOf.get(st.id) ?? null, g: gradeOf.get(st.id) ?? null }));
  const needs = (r: (typeof rows)[number]) => (noSubmit ? !r.g : !!r.sub && !r.sub.graded_at);
  const [filter, setFilter] = useState<Filter>(rows.some(needs) ? 'todo' : 'all');
  const shown = rows.filter((r) => (filter === 'todo' ? needs(r) : filter === 'missing' ? !r.sub && !r.g : true));
  const [cur, setCur] = useState<number | null>(() => (rows.find(needs) ?? rows[0])?.st.id ?? null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const row = rows.find((r) => r.st.id === cur) ?? null;
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const done = rows.filter((r) => (noSubmit ? r.g : r.sub ? r.sub.graded_at : r.g)).length;
  const remaining = rows.filter(needs).length;

  useEffect(() => {
    setScore(row?.g ? String(row.g.score) : '');
    setFeedback(row?.sub?.feedback ?? '');
  }, [row?.st.id, row?.g, row?.sub]);

  const nextOf = (id: number) => {
    const i = rows.findIndex((r) => r.st.id === id);
    return [...rows.slice(i + 1), ...rows.slice(0, i)].find(needs)?.st.id ?? null;
  };

  const save = async (advance: boolean) => {
    if (!row) return;
    const n = score === '' ? null : Number(score);
    if (n == null && !feedback.trim()) return toast('اكتب الدرجة', 'error');
    if (n != null && !(n >= 0 && n <= max)) return toast(`الدرجة بين 0 و ${max}`, 'error');
    setBusy(true);
    const res = await gradeTask(task.id, [{ student_id: row.st.id, score: n, feedback: feedback.trim() || null }]);
    setBusy(false);
    if (!res.ok) return toast(res.error, 'error');
    toast(`✓ ${row.st.name_ar}: ${n ?? '—'} من ${max}`);
    router.refresh();
    if (advance) {
      const nx = nextOf(row.st.id);
      if (nx) setCur(nx);
      else setMobileOpen(false);
    }
  };

  // اختصارات لوحة المفاتيح: Ctrl+Enter حفظ والتالي، Alt+← / Alt+→ تنقل
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        save(true);
      }
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const i = shown.findIndex((r) => r.st.id === cur);
        const n = shown[i + (e.key === 'ArrowLeft' ? 1 : -1)];
        if (n) setCur(n.st.id);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const giveBack = async () => {
    if (!row?.sub) return;
    const ok = await confirm({ title: 'إعادة التسليم للطالب؟', body: 'يستطيع الطالب تعديل تسليمه وإعادة إرساله. تبقى درجته حتى تغيّرها.', confirmLabel: 'إعادة' });
    if (!ok) return;
    const res = await returnSubmission(row.sub.id, task.id);
    if (!res.ok) return toast(res.error, 'error');
    toast(res.message);
    router.refresh();
  };

  const pct = rows.length ? Math.round((done / rows.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* التقدّم */}
      <div className="flex flex-wrap items-center gap-4 rounded-[1.4rem] border border-line bg-surface p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold">{remaining ? `بقي ${remaining} ${noSubmit ? 'بلا درجة' : 'تسليم للتصحيح'}` : 'اكتمل التصحيح 🎉'}</span>
            <span className="tabular-nums text-muted">{done}/{rows.length}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper">
            <motion.div className="h-full rounded-full bg-board" initial={false} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
          </div>
        </div>
        <Link href={`/staff/tasks/${task.id}`} className="btn-quiet px-3 py-2 text-xs">عرض الكشف كاملًا</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
        {/* قائمة الطلاب */}
        <aside className={`${mobileOpen ? 'hidden' : ''} lg:block`}>
          <div className="rounded-[1.4rem] border border-line bg-surface lg:sticky lg:top-24">
            <div className="flex gap-1 border-b border-line p-2">
              {(
                [
                  ['todo', noSubmit ? 'بلا درجة' : 'للتصحيح', rows.filter(needs).length],
                  ['all', 'الكل', rows.length],
                  ...(noSubmit ? [] : ([['missing', 'لم يسلّم', rows.filter((r) => !r.sub && !r.g).length]] as const)),
                ] as [Filter, string, number][]
              ).map(([k, l, n]) => (
                <button key={k} type="button" onClick={() => setFilter(k)} className={`flex-1 rounded-xl px-2 py-1.5 text-xs font-semibold transition-colors ${filter === k ? 'bg-board text-chalk' : 'text-muted hover:bg-paper'}`}>
                  {l} <span className="tabular-nums opacity-70">{n}</span>
                </button>
              ))}
            </div>
            <ul className="max-h-[calc(100dvh-14rem)] divide-y divide-line overflow-y-auto">
              {shown.map(({ st, sub, g }) => {
                const on = st.id === cur;
                return (
                  <li key={st.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setCur(st.id);
                        setMobileOpen(true);
                      }}
                      className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-start transition-colors ${on ? 'bg-board/[0.08]' : 'hover:bg-paper/70'}`}
                    >
                      <span className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ${g ? 'bg-ok-soft text-ok' : sub ? 'bg-brass-soft text-brass' : 'bg-paper text-muted'}`}>
                        {g ? <Icon name="check" className="size-4" /> : st.name_ar.trim().charAt(0)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm ${on ? 'font-bold' : 'font-medium'}`}>{st.name_ar}</span>
                        <span className="block truncate text-[0.7rem] text-muted">
                          {noSubmit ? (g ? 'مرصود' : 'بلا درجة') : sub ? `${sub.graded_at ? 'صُحّح' : 'سلّم'} ${relTime(sub.updated_at)}${sub.is_late ? ' · متأخر' : ''}` : 'لم يسلّم'}
                        </span>
                      </span>
                      {g && <span className="text-xs font-bold tabular-nums text-ok" dir="ltr">{g.score}</span>}
                    </button>
                  </li>
                );
              })}
              {!shown.length && <li className="px-3 py-10 text-center text-sm text-muted">لا أحد هنا</li>}
            </ul>
          </div>
        </aside>

        {/* التسليم الحالي */}
        <section className={`${mobileOpen ? '' : 'hidden'} min-w-0 lg:block`}>
          {row ? (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={row.st.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.2 }} className="rounded-[1.4rem] border border-line bg-surface">
                <header className="flex items-center gap-3 border-b border-line p-4">
                  <button type="button" onClick={() => setMobileOpen(false)} className="grid size-9 place-items-center rounded-xl text-muted hover:bg-paper lg:hidden" aria-label="رجوع للقائمة">
                    <Icon name="chevron" className="size-5 rotate-180" />
                  </button>
                  <span className="grid size-11 place-items-center rounded-full bg-board/10 text-lg font-bold text-board">{row.st.name_ar.trim().charAt(0)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-bold">{row.st.name_ar}</p>
                    <p className="text-xs text-muted">
                      <bdi>{row.st.code}</bdi>
                      {row.sub ? ` · سلّم ${fmtFull(row.sub.updated_at)}` : noSubmit ? '' : ' · لم يسلّم'}
                    </p>
                  </div>
                  {row.sub?.is_late && <Badge tone="danger">متأخر</Badge>}
                  {row.g?.is_edited && <Badge tone="gold">معدّل</Badge>}
                </header>

                <div className="space-y-4 p-4 sm:p-5">
                  {row.sub?.body && (
                    <div className="rounded-2xl border border-line bg-paper/50 p-4 text-[1rem] leading-[1.9]">
                      <RichText text={row.sub.body} />
                    </div>
                  )}
                  {row.sub && row.sub.files.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {row.sub.files.map((f) =>
                        f.url && f.mime.startsWith('image/') ? (
                          <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" className="group block overflow-hidden rounded-2xl border border-line bg-paper sm:col-span-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={f.url} alt={f.name} className="max-h-[32rem] w-full object-contain" />
                            <span className="flex items-center justify-between px-3 py-2 text-xs text-muted">{f.name} <span>{fmtBytes(f.size_bytes)} · فتح بالحجم الكامل</span></span>
                          </a>
                        ) : (
                          <a key={f.id} href={f.url ?? undefined} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-3 rounded-2xl border border-line p-3 ${f.url ? 'hover:border-board/40' : 'pointer-events-none opacity-60'}`}>
                            <span className="grid size-10 place-items-center rounded-xl bg-board/10 text-board"><Icon name="clip" className="size-5" /></span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">{f.name}</span>
                              <span className="text-xs text-muted">{f.deleted_at ? 'حُذف بعد التصحيح' : fmtBytes(f.size_bytes)}</span>
                            </span>
                            {f.url && <Icon name="download" className="size-4 text-muted" />}
                          </a>
                        ),
                      )}
                    </div>
                  )}
                  {!row.sub && !noSubmit && <p className="rounded-xl bg-paper px-4 py-3 text-sm text-muted">لم يسلّم الطالب. يمكنك رصد درجته مباشرة (مثلًا صفر أو درجة عمل ورقي).</p>}
                  {row.sub?.graded_at && (
                    <button type="button" onClick={giveBack} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brass hover:underline">
                      <Icon name="undo" className="size-4" /> إعادة التسليم للطالب ليعدّله
                    </button>
                  )}
                </div>

                <div className="space-y-4 border-t border-line bg-paper/30 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">الدرجة</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={max}
                      step={0.25}
                      value={score}
                      onChange={(e) => setScore(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && save(true)}
                      autoFocus
                      className="field w-24 py-2.5 text-center text-xl font-bold tabular-nums"
                      dir="ltr"
                    />
                    <span className="text-sm text-muted">/ {max}</span>
                    {[max, round(max * 0.75), round(max / 2), 0].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
                      <button key={v} type="button" onClick={() => setScore(String(v))} className={`rounded-full px-3 py-1.5 text-sm tabular-nums transition-all ${score === String(v) ? 'bg-board text-chalk' : 'bg-surface ring-1 ring-line hover:ring-board/40'}`}>
                        {v}
                      </button>
                    ))}
                  </div>
                  {(row.sub || noSubmit) && (
                    <div>
                      <textarea value={feedback} onChange={(e) => setFeedback(e.target.value.slice(0, 4000))} rows={2} className="field" placeholder={row.sub ? 'ملاحظة للطالب (اختياري)' : 'الملاحظات تُحفظ مع التسليم فقط'} disabled={!row.sub} />
                      {row.sub && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {PHRASES.map((t) => (
                            <button key={t} type="button" onClick={() => setFeedback((f) => (f ? `${f} ${t}` : t))} className="rounded-full bg-surface px-2.5 py-1 text-xs ring-1 ring-line hover:ring-board/40">{t}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => save(true)} disabled={busy} className="btn-primary flex-1 py-3 sm:flex-none sm:px-8">
                      {busy ? <span className="spinner" /> : <Icon name="check" className="size-4" />} حفظ والتالي
                    </button>
                    <button type="button" onClick={() => save(false)} disabled={busy} className="btn-quiet py-3">حفظ</button>
                    <span className="ms-auto hidden text-xs text-muted lg:inline">Ctrl+Enter حفظ والتالي · Alt+←/→ تنقل</span>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          ) : (
            <p className="rounded-[1.4rem] border border-line bg-surface p-10 text-center text-muted">لا طلاب</p>
          )}
        </section>
      </div>
    </div>
  );
}
