'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { browserClient } from '@/lib/supabase/browser';
import { parseBlanks, assetUrl, type QType } from '@/lib/assess/shared';
import type { DraftQuestion } from '@/lib/assess/draft';
import { RichText, SymbolBar } from './math';

/* =====================================================================
   حل النموذج — للطالب
   - الإجابات تُحفظ على الخادم تلقائيًا أثناء الحل (ونسخة احتياطية في الجهاز)
   - فتح النموذج من أي جهاز يكمل نفس المحاولة بنفس الإجابات والوقت المتبقي
   - العدّاد من ساعة الخادم، والتسليم تلقائي عند انتهاء الوقت
   - التسليم يعيد المحاولة تلقائيًا إن انقطع الاتصال (آمن من التكرار)
   ===================================================================== */

export type PlayerQuestion = {
  id: number | string;
  qtype: QType;
  body: string;
  image_url: string | null;
  points: number;
  section_title: string | null;
  section_instructions?: string | null;
  max_chars?: number | null;
  blanks?: number | null;
  lefts?: string[] | null;
  rights?: string[] | null;
  options?: { id: number | string; body: string }[] | null;
};
export type SessionPayload = {
  status: 'open';
  session_id: number;
  assessment_id: number;
  title: string;
  description: string | null;
  started_at: string;
  deadline_at: string | null;
  closes_at: string | null;
  time_limit_minutes: number | null;
  track_focus: boolean;
  server_now: string;
  answers: Record<string, unknown>;
  saved_at: string | null;
  questions: PlayerQuestion[];
};
type Answer = number | string | string[] | Record<string, number> | undefined;
type Answers = Record<string, Answer>;
type SaveState = 'saved' | 'saving' | 'pending' | 'offline' | 'error';
type SubmitResult = { attempt_no: number; show_score: boolean; score: number | null; max_score: number | null; pending_review: number };

const isAnswered = (q: PlayerQuestion, a: Answer) => {
  if (a == null) return false;
  if (q.qtype === 'match') return typeof a === 'object' && Object.keys(a as object).length === (q.lefts?.length ?? 0);
  if (q.qtype === 'fill') return Array.isArray(a) && a.filter((x) => String(x ?? '').trim()).length === (q.blanks ?? 0);
  if (typeof a === 'string') return a.trim().length > 0;
  return true;
};
const partly = (q: PlayerQuestion, a: Answer) =>
  !isAnswered(q, a) && a != null && ((q.qtype === 'match' && Object.keys(a as object).length > 0) || (q.qtype === 'fill' && Array.isArray(a) && a.some((x) => String(x ?? '').trim())));

const LETTERS = 'أبجدهوزحطي';
const BACKUP = (s: number) => `mirqat:form:${s}`;

export function FormPlayer({ payload, backHref }: { payload: SessionPayload; backHref: string }) {
  const { toast, confirm } = useFeedback();
  const sb = browserClient();
  const skew = useMemo(() => new Date(payload.server_now).getTime() - Date.now(), [payload.server_now]);
  const [answers, setAnswers] = useState<Answers>(() => {
    const base = { ...(payload.answers as Answers) };
    try {
      const raw = localStorage.getItem(BACKUP(payload.session_id));
      if (raw) {
        const local = JSON.parse(raw) as { at: number; pending: Answers };
        // نسخة الجهاز أحدث من آخر حفظ على الخادم: نستعيد ما لم يُحفظ
        if (!payload.saved_at || local.at > new Date(payload.saved_at).getTime() - skew) Object.assign(base, local.pending);
      }
    } catch {}
    return base;
  });
  const pending = useRef<Answers>({});
  const [save, setSave] = useState<SaveState>('saved');
  const [savedAt, setSavedAt] = useState<number | null>(payload.saved_at ? new Date(payload.saved_at).getTime() - skew : null);
  const [idx, setIdx] = useState(0);
  const [view, setView] = useState<'single' | 'all'>('single');
  const [flags, setFlags] = useState<Set<string>>(new Set());
  const [navOpen, setNavOpen] = useState(false);
  const [focusLost, setFocusLost] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const deadline = payload.deadline_at ? new Date(payload.deadline_at).getTime() - skew : null;
  const [now, setNow] = useState(() => Date.now());
  const qs = payload.questions;
  const done = result !== null;

  // ساعة العدّاد
  useEffect(() => {
    if (!deadline || done) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [deadline, done]);
  const left = deadline ? Math.max(0, deadline - now) : null;

  /* ---------------- الحفظ التلقائي ---------------- */
  const flushing = useRef(false);
  const flush = useCallback(async (): Promise<boolean> => {
    if (flushing.current || done) return false;
    const patch = pending.current;
    if (!Object.keys(patch).length) return true;
    flushing.current = true;
    pending.current = {};
    setSave('saving');
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) body[k] = v === undefined ? null : v;
    const { error } = await sb.rpc('save_form_answers', { p_session_id: payload.session_id, p_patch: body });
    flushing.current = false;
    if (error) {
      pending.current = { ...patch, ...pending.current };
      setSave(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error');
      if (/انتهى الوقت|سُلّمت/.test(error.message)) return false;
      return false;
    }
    setSavedAt(Date.now());
    setSave(Object.keys(pending.current).length ? 'pending' : 'saved');
    try {
      if (!Object.keys(pending.current).length) localStorage.removeItem(BACKUP(payload.session_id));
    } catch {}
    return true;
  }, [sb, payload.session_id, done]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setAnswer = (qid: string, v: Answer) => {
    if (done) return;
    setAnswers((a) => ({ ...a, [qid]: v }));
    pending.current = { ...pending.current, [qid]: v };
    setSave('pending');
    try {
      localStorage.setItem(BACKUP(payload.session_id), JSON.stringify({ at: Date.now(), pending: pending.current }));
    } catch {}
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 1200);
  };

  // إعادة المحاولة كل 5 ثوانٍ عند الفشل، والحفظ الفوري عند مغادرة الصفحة
  useEffect(() => {
    const t = setInterval(() => {
      if (Object.keys(pending.current).length && !flushing.current) flush();
    }, 5000);
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const onOnline = () => flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('online', onOnline);
    window.addEventListener('pagehide', flush);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pagehide', flush);
    };
  }, [flush]);

  /* ---------------- رصد الخروج من الصفحة ---------------- */
  useEffect(() => {
    if (!payload.track_focus || done) return;
    let lastBlur = 0;
    const log = (kind: string) => sb.rpc('log_form_event', { p_session_id: payload.session_id, p_kind: kind }).then(() => null);
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        setFocusLost((n) => n + 1);
        log('hidden');
      }
    };
    const onBlur = () => {
      if (document.visibilityState === 'hidden' || Date.now() - lastBlur < 3000) return;
      lastBlur = Date.now();
      setFocusLost((n) => n + 1);
      log('blur');
    };
    const onPaste = () => log('paste');
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('paste', onPaste);
    };
  }, [payload.track_focus, payload.session_id, sb, done]);

  /* ---------------- التسليم ---------------- */
  const doSubmit = useCallback(
    async (auto = false) => {
      if (submitting || done) return;
      setSubmitting(true);
      if (timer.current) clearTimeout(timer.current);
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(pending.current)) patch[k] = v === undefined ? null : v;
      let last: string | null = null;
      // تحت الضغط: إعادة المحاولة بتباعد متزايد — الدالة آمنة من التكرار
      for (let i = 0; i < 6; i++) {
        const { data, error } = await sb.rpc('submit_form_session', { p_session_id: payload.session_id, p_patch: Object.keys(patch).length ? patch : null });
        if (!error) {
          pending.current = {};
          try {
            localStorage.removeItem(BACKUP(payload.session_id));
          } catch {}
          setResult(data as SubmitResult);
          setSubmitting(false);
          if (auto) toast('انتهى الوقت — سُلّمت إجاباتك تلقائيًا', 'info');
          return;
        }
        last = error.message;
        if (/FORBIDDEN|غير موجودة/.test(error.message)) break;
        await new Promise((r) => setTimeout(r, Math.min(8000, 600 * 2 ** i) + Math.random() * 400));
      }
      setSubmitting(false);
      toast(`تعذّر التسليم: ${last ?? 'تحقق من الاتصال'} — إجاباتك محفوظة، أعد المحاولة`, 'error');
    },
    [sb, payload.session_id, submitting, done, toast],
  );

  // تنبيهات الوقت والتسليم التلقائي
  const warned = useRef<Set<number>>(new Set());
  const autoTried = useRef(false);
  useEffect(() => {
    if (left == null || done) return;
    for (const m of [5, 1]) {
      if (left <= m * 60000 && left > (m * 60000 - 2000) && !warned.current.has(m)) {
        warned.current.add(m);
        toast(m === 5 ? 'بقيت 5 دقائق' : 'بقيت دقيقة واحدة! راجع إجاباتك', 'info');
      }
    }
    if (left === 0 && !autoTried.current) {
      autoTried.current = true;
      doSubmit(true);
    }
  }, [left, done, doSubmit, toast]);

  const answeredCount = qs.filter((q) => isAnswered(q, answers[String(q.id)])).length;
  const unanswered = qs.map((q, i) => (!isAnswered(q, answers[String(q.id)]) ? i + 1 : 0)).filter(Boolean);

  const submit = async () => {
    const ok = await confirm({
      title: 'تسليم الإجابات؟',
      body: (
        <>
          أجبت عن <b className="text-ink">{answeredCount}</b> من {qs.length} سؤال.
          {unanswered.length > 0 && (
            <span className="mt-2 block rounded-xl bg-danger-soft px-3 py-2 text-danger">
              بلا إجابة: {unanswered.slice(0, 15).join('، ')}
              {unanswered.length > 15 ? '…' : ''}
            </span>
          )}
          <span className="mt-2 block">بعد التسليم لا يمكن تعديل الإجابات.</span>
        </>
      ),
      confirmLabel: 'تسليم',
      danger: unanswered.length > 0,
    });
    if (ok) doSubmit(false);
  };

  if (result) return <SubmittedScreen result={result} backHref={backHref} reviewHref={`/student/tasks/${payload.assessment_id}`} title={payload.title} />;

  const q = qs[idx];
  const lowTime = left != null && left <= 60000 * 5;

  return (
    <div className="min-h-dvh bg-paper pb-28">
      {/* الشريط العلوي: العنوان والعدّاد والحفظ */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          <Link href={backHref} className="grid size-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-paper" aria-label="رجوع" onClick={() => flush()}>
            <Icon name="chevron" className="size-5 rotate-180" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold sm:text-base">{payload.title}</p>
            <SaveBadge state={save} savedAt={savedAt} />
          </div>
          {left != null && (
            <div className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-bold tabular-nums transition-colors ${left <= 60000 ? 'animate-pulse bg-danger text-chalk' : lowTime ? 'bg-danger-soft text-danger' : 'bg-board/10 text-board'}`} dir="ltr" aria-live="polite">
              <Icon name="clock" className="size-4" />
              {fmtLeft(left)}
            </div>
          )}
        </div>
        <div className="h-1 bg-paper">
          <motion.div className="h-full bg-board" animate={{ width: `${(answeredCount / Math.max(1, qs.length)) * 100}%` }} transition={{ type: 'spring', stiffness: 200, damping: 30 }} />
        </div>
      </header>

      {focusLost > 0 && payload.track_focus && (
        <div className="mx-auto mt-3 max-w-5xl px-4">
          <p className="flex items-center gap-2 rounded-xl bg-brass-soft px-3 py-2 text-xs text-brass sm:text-sm">
            <Icon name="alert" className="size-4 shrink-0" /> رُصد خروجك من صفحة النموذج {focusLost} {focusLost === 1 ? 'مرة' : 'مرات'}، ويظهر ذلك لمعلمك.
          </p>
        </div>
      )}

      <div className="mx-auto grid max-w-5xl gap-5 px-4 pt-4 lg:grid-cols-[1fr_15rem]">
        <main className="min-w-0">
          {idx === 0 && view === 'single' && payload.description && (
            <div className="mb-4 rounded-2xl border border-board/15 bg-board/[0.05] px-4 py-3 text-sm leading-relaxed">
              <RichText text={payload.description} />
            </div>
          )}
          {view === 'single' ? (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={idx} initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
                <QuestionView q={q} n={idx + 1} total={qs.length} value={answers[String(q.id)]} onChange={(v) => setAnswer(String(q.id), v)} flagged={flags.has(String(q.id))} onFlag={() => setFlags((f) => toggle(f, String(q.id)))} />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="space-y-4">
              {payload.description && (
                <div className="rounded-2xl border border-board/15 bg-board/[0.05] px-4 py-3 text-sm leading-relaxed">
                  <RichText text={payload.description} />
                </div>
              )}
              {qs.map((x, i) => (
                <div key={x.id} id={`q-${i}`}>
                  <QuestionView q={x} n={i + 1} total={qs.length} value={answers[String(x.id)]} onChange={(v) => setAnswer(String(x.id), v)} flagged={flags.has(String(x.id))} onFlag={() => setFlags((f) => toggle(f, String(x.id)))} />
                </div>
              ))}
            </div>
          )}
        </main>

        {/* لوحة الأسئلة (الحاسوب) */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-2xl border border-line bg-surface p-4">
            <Navigator qs={qs} answers={answers} flags={flags} current={view === 'single' ? idx : -1} onGo={(i) => go(i)} />
            <button type="button" onClick={() => setView((v) => (v === 'single' ? 'all' : 'single'))} className="mt-4 w-full rounded-xl border border-line py-2 text-xs font-semibold text-muted hover:border-board/40 hover:text-board">
              {view === 'single' ? 'عرض كل الأسئلة' : 'سؤال واحد في كل صفحة'}
            </button>
          </div>
        </aside>
      </div>

      {/* الشريط السفلي */}
      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2.5">
          {view === 'single' && (
            <button type="button" onClick={() => go(idx - 1)} disabled={idx === 0} className="btn-quiet px-3 disabled:opacity-40" aria-label="السابق">
              <Icon name="chevron" className="size-5 rotate-180" />
              <span className="hidden sm:inline">السابق</span>
            </button>
          )}
          <button type="button" onClick={() => setNavOpen(true)} className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-paper lg:pointer-events-none">
            <span className="tabular-nums">{view === 'single' ? `${idx + 1} / ${qs.length}` : `${answeredCount} / ${qs.length}`}</span>
            <span className="text-xs font-normal text-muted">أُجيب {answeredCount}</span>
            <Icon name="timetable" className="size-4 text-muted lg:hidden" />
          </button>
          {view === 'single' && idx < qs.length - 1 ? (
            <button type="button" onClick={() => go(idx + 1)} className="btn-primary px-4">
              <span className="hidden sm:inline">التالي</span>
              <Icon name="chevron" className="size-5" />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={submitting} className="btn-primary px-5">
              {submitting ? <span className="spinner" /> : <Icon name="send" className="size-4" />} تسليم
            </button>
          )}
        </div>
      </footer>

      {/* لوحة الأسئلة (الجوال) */}
      <AnimatePresence>
        {navOpen && (
          <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setNavOpen(false)} />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
            >
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-line" />
              <Navigator qs={qs} answers={answers} flags={flags} current={view === 'single' ? idx : -1} onGo={(i) => { go(i); setNavOpen(false); }} />
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { setView((v) => (v === 'single' ? 'all' : 'single')); setNavOpen(false); }} className="btn-quiet py-3 text-xs">
                  {view === 'single' ? 'عرض كل الأسئلة' : 'سؤال في كل صفحة'}
                </button>
                <button type="button" onClick={() => { setNavOpen(false); submit(); }} className="btn-primary py-3">تسليم</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  function go(i: number) {
    const n = Math.max(0, Math.min(qs.length - 1, i));
    if (view === 'all') document.getElementById(`q-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else {
      setIdx(n);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
}

function toggle(s: Set<string>, k: string) {
  const n = new Set(s);
  if (n.has(k)) n.delete(k);
  else n.add(k);
  return n;
}

function fmtLeft(ms: number) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function SaveBadge({ state, savedAt }: { state: SaveState; savedAt: number | null }) {
  const map: Record<SaveState, { t: string; c: string }> = {
    saved: { t: savedAt ? 'محفوظ على الخادم ✓' : 'تُحفظ إجاباتك تلقائيًا', c: 'text-ok' },
    saving: { t: 'جارٍ الحفظ…', c: 'text-muted' },
    pending: { t: 'سيُحفظ خلال لحظات', c: 'text-muted' },
    offline: { t: 'لا اتصال — إجاباتك محفوظة في جهازك وستُرسل عند عودة الاتصال', c: 'text-brass' },
    error: { t: 'تعذّر الحفظ — نعيد المحاولة تلقائيًا', c: 'text-danger' },
  };
  return <p className={`truncate text-[0.72rem] ${map[state].c}`}>{map[state].t}</p>;
}

function Navigator({ qs, answers, flags, current, onGo }: { qs: PlayerQuestion[]; answers: Answers; flags: Set<string>; current: number; onGo: (i: number) => void }) {
  return (
    <div>
      <p className="mb-3 text-sm font-bold">الأسئلة</p>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-5">
        {qs.map((q, i) => {
          const a = answers[String(q.id)];
          const ok = isAnswered(q, a);
          const half = partly(q, a);
          const f = flags.has(String(q.id));
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => onGo(i)}
              className={`relative grid aspect-square place-items-center rounded-lg text-sm font-semibold tabular-nums transition-all ${
                i === current ? 'ring-2 ring-gold ring-offset-1' : ''
              } ${ok ? 'bg-board text-chalk' : half ? 'bg-board/25 text-board' : 'bg-paper text-muted hover:bg-board/10'}`}
            >
              {i + 1}
              {f && <span className="absolute -top-1 -end-1 size-2.5 rounded-full bg-gold ring-2 ring-surface" />}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem] text-muted">
        <span className="flex items-center gap-1"><span className="size-2.5 rounded bg-board" /> مُجاب</span>
        <span className="flex items-center gap-1"><span className="size-2.5 rounded bg-paper ring-1 ring-line" /> بلا إجابة</span>
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-gold" /> للمراجعة</span>
      </div>
    </div>
  );
}

export function QuestionView({ q, n, total, value, onChange, flagged, onFlag, readOnly }: { q: PlayerQuestion; n: number; total: number; value: Answer; onChange: (v: Answer) => void; flagged?: boolean; onFlag?: () => void; readOnly?: boolean }) {
  return (
    <article className="rounded-[1.4rem] border border-line bg-surface">
      {q.section_title && <div className="rounded-t-[1.4rem] border-b border-line bg-board/[0.05] px-5 py-2.5 text-sm font-bold text-board">{q.section_title}</div>}
      <div className="p-4 sm:p-6">
        <div className="mb-3 flex items-center gap-2 text-xs text-muted">
          <span className="rounded-full bg-ink px-2.5 py-1 font-bold tabular-nums text-chalk">
            {n} <span className="font-normal opacity-60">/ {total}</span>
          </span>
          <span className="rounded-full bg-paper px-2.5 py-1 font-semibold tabular-nums">{q.points} {q.points === 1 ? 'درجة' : 'درجات'}</span>
          {onFlag && (
            <button type="button" onClick={onFlag} className={`ms-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold transition-colors ${flagged ? 'bg-gold/25 text-brass' : 'hover:bg-paper'}`}>
              <Icon name="flag" className="size-3.5" /> {flagged ? 'للمراجعة' : 'علّم للمراجعة'}
            </button>
          )}
        </div>
        {q.qtype !== 'fill' && <h3 className="text-[1.08rem] font-semibold leading-relaxed sm:text-lg"><RichText text={q.body} /></h3>}
        {q.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetUrl(q.image_url) ?? ''} alt="" className="mt-3 max-h-80 w-auto max-w-full rounded-xl border border-line object-contain" loading="lazy" />
        )}
        <div className="mt-4">
          <Answerer q={q} value={value} onChange={onChange} readOnly={readOnly} />
        </div>
      </div>
    </article>
  );
}

function Answerer({ q, value, onChange, readOnly }: { q: PlayerQuestion; value: Answer; onChange: (v: Answer) => void; readOnly?: boolean }) {
  const [symbols, setSymbols] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (q.qtype === 'mcq' || q.qtype === 'tf') {
    const opts = q.options ?? [];
    return (
      <div className={q.qtype === 'tf' ? 'grid grid-cols-2 gap-2.5' : 'grid gap-2.5'} role="radiogroup">
        {opts.map((o, i) => {
          const on = value != null && String(value) === String(o.id);
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={readOnly}
              onClick={() => onChange(typeof o.id === 'number' ? o.id : String(o.id))}
              className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-start transition-all duration-150 active:scale-[0.99] ${
                on ? 'border-board bg-board/[0.07] shadow-[0_8px_20px_-14px_rgb(53_104_84/0.9)]' : 'border-line hover:border-board/40'
              } ${q.qtype === 'tf' ? 'justify-center text-lg font-bold' : ''}`}
            >
              {q.qtype === 'mcq' && (
                <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold transition-colors ${on ? 'bg-board text-chalk' : 'bg-paper text-muted'}`}>{LETTERS[i]}</span>
              )}
              {q.qtype === 'tf' ? (
                <span className={on ? (o.body === 'صح' ? 'text-ok' : 'text-danger') : ''}>{o.body === 'صح' ? '✓ صح' : '✗ خطأ'}</span>
              ) : (
                <span className="min-w-0 flex-1 text-[1.02rem]"><RichText text={o.body} /></span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  if (q.qtype === 'short') {
    const v = typeof value === 'string' ? value : '';
    return (
      <div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={v}
            readOnly={readOnly}
            onChange={(e) => onChange(e.target.value.slice(0, 500))}
            placeholder="اكتب إجابتك"
            className="field py-3 text-lg"
            autoComplete="off"
          />
          <button type="button" onClick={() => setSymbols((s) => !s)} className={`grid size-12 shrink-0 place-items-center rounded-xl border text-lg transition-colors ${symbols ? 'border-board bg-board text-chalk' : 'border-line text-muted'}`} title="رموز رياضية">
            √
          </button>
        </div>
        {symbols && !readOnly && (
          <div className="mt-2 animate-menu rounded-xl bg-paper p-2">
            <SymbolBar
              onInsert={(s) => {
                const el = inputRef.current;
                const a = el?.selectionStart ?? v.length;
                const b = el?.selectionEnd ?? v.length;
                onChange(v.slice(0, a) + s + v.slice(b));
                requestAnimationFrame(() => {
                  el?.focus();
                  el?.setSelectionRange(a + s.length, a + s.length);
                });
              }}
            />
          </div>
        )}
      </div>
    );
  }

  if (q.qtype === 'long') {
    const v = typeof value === 'string' ? value : '';
    const max = q.max_chars ?? 10000;
    return (
      <div>
        <textarea value={v} readOnly={readOnly} onChange={(e) => onChange(e.target.value.slice(0, max))} rows={7} placeholder="اكتب إجابتك هنا…" className="field leading-relaxed" />
        <p className="mt-1 text-end text-xs tabular-nums text-muted">{v.length} / {max}</p>
      </div>
    );
  }

  if (q.qtype === 'match') {
    const map = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, number>;
    const used = new Set(Object.values(map));
    return (
      <ul className="space-y-2.5">
        {(q.lefts ?? []).map((l, i) => {
          const sel = map[String(i)];
          return (
            <li key={i} className="grid gap-2 rounded-2xl border border-line p-3 sm:grid-cols-[1fr_auto_1.2fr] sm:items-center">
              <span className="font-semibold"><RichText text={l} /></span>
              <span className="hidden text-board sm:block">⇄</span>
              <select
                value={sel ?? ''}
                disabled={readOnly}
                onChange={(e) => {
                  const n = { ...map };
                  if (e.target.value === '') delete n[String(i)];
                  else n[String(i)] = Number(e.target.value);
                  onChange(n);
                }}
                className={`field py-2.5 ${sel != null ? 'border-board bg-board/[0.05] font-semibold' : ''}`}
              >
                <option value="">اختر ما يناسبه…</option>
                {(q.rights ?? []).map((r, j) => (
                  <option key={j} value={j}>
                    {used.has(j) && sel !== j ? '• ' : ''}
                    {r.replace(/\$/g, '')}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
    );
  }

  // fill
  const arr = Array.isArray(value) ? (value as string[]) : [];
  return (
    <p className="text-[1.08rem] leading-[2.6] sm:text-lg">
      <RichText
        text={q.body}
        blank={(n) => (
          <input
            value={arr[n - 1] ?? ''}
            readOnly={readOnly}
            onChange={(e) => {
              const next = Array.from({ length: q.blanks ?? 0 }, (_, i) => arr[i] ?? '');
              next[n - 1] = e.target.value.slice(0, 200);
              onChange(next);
            }}
            aria-label={`الفراغ ${n}`}
            placeholder={`(${n})`}
            className="mx-1 inline-block w-32 rounded-lg border-0 border-b-2 border-board bg-board/[0.05] px-2 py-0.5 text-center align-baseline text-base font-semibold focus:bg-board/10 focus:outline-none sm:w-40"
          />
        )}
      />
    </p>
  );
}

function SubmittedScreen({ result, backHref, reviewHref, title }: { result: SubmitResult; backHref: string; reviewHref: string; title: string }) {
  const pct = result.show_score && result.max_score ? Math.round(((result.score ?? 0) / result.max_score) * 100) : null;
  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-4">
      <motion.div initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="w-full max-w-md rounded-[2rem] border border-line bg-surface p-7 text-center shadow-[0_30px_80px_-40px_rgb(31_42_36/0.5)]">
        <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 15 }} className="mx-auto grid size-20 place-items-center rounded-full bg-ok text-chalk">
          <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12.5 4.5 4.5L19 7.5" className="[stroke-dasharray:24] [stroke-dashoffset:24] animate-draw" />
          </svg>
        </motion.span>
        <h1 className="mt-5 text-2xl font-bold">سُلّمت إجاباتك</h1>
        <p className="mt-1 text-muted">{title}</p>
        {pct != null ? (
          <div className="mt-6 rounded-2xl bg-paper p-5">
            <p className="text-sm text-muted">درجتك</p>
            <p className="mt-1 text-4xl font-bold tabular-nums" dir="ltr">
              {Number(result.score)} <span className="text-xl text-muted">/ {Number(result.max_score)}</span>
            </p>
            <div className="mx-auto mt-3 h-2 max-w-60 overflow-hidden rounded-full bg-line">
              <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.4, duration: 0.9, ease: [0.22, 1, 0.36, 1] }} className={`h-full rounded-full ${pct >= 85 ? 'bg-ok' : pct >= 60 ? 'bg-board' : pct >= 50 ? 'bg-gold' : 'bg-danger'}`} />
            </div>
            {result.pending_review > 0 && <p className="mt-3 text-xs text-brass">{result.pending_review} سؤال مقالي بانتظار تصحيح المعلم — قد ترتفع درجتك.</p>}
          </div>
        ) : (
          <p className="mt-6 rounded-2xl bg-paper p-4 text-sm text-muted">تظهر نتيجتك بعد أن يسمح بها المعلم.</p>
        )}
        <div className="mt-6 grid gap-2">
          {pct != null && <Link href={reviewHref} className="btn-primary py-3">مراجعة إجاباتي</Link>}
          <Link href={backHref} className="btn-quiet py-3">العودة لمهامي</Link>
        </div>
      </motion.div>
    </div>
  );
}

/* =====================================================================
   معاينة المعلم: نفس شاشة الطالب بلا حفظ ولا تسليم
   ===================================================================== */
export function PreviewSheet({ open, onClose, title, description, questions, minutes }: { open: boolean; onClose: () => void; title: string; description: string; questions: DraftQuestion[]; minutes: number | null }) {
  const [answers, setAnswers] = useState<Answers>({});
  const pq = useMemo<PlayerQuestion[]>(
    () =>
      questions.map((q) => ({
        id: q.key,
        qtype: q.qtype,
        body: q.qtype === 'fill' ? parseBlanks(q.body).body : q.body,
        image_url: q.image_url,
        points: q.points,
        section_title: q.section_title || null,
        max_chars: q.max_chars,
        blanks: q.qtype === 'fill' ? parseBlanks(q.body).blanks.length : null,
        lefts: q.qtype === 'match' ? q.pairs.map((p) => p.l) : null,
        rights: q.qtype === 'match' ? [...q.pairs.map((p) => p.r)].reverse() : null,
        options: q.options.map((o, i) => ({ id: `${q.key}-${i}`, body: o.body })),
      })),
    [questions],
  );
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', k);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-paper animate-fade-in" role="dialog" aria-modal="true">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur">
        <span className="rounded-full bg-gold/25 px-2.5 py-1 text-xs font-bold text-brass">معاينة</span>
        <p className="min-w-0 flex-1 truncate font-bold">{title}</p>
        {minutes && <span className="rounded-xl bg-board/10 px-3 py-1.5 text-sm font-bold tabular-nums text-board" dir="ltr">{minutes}:00</span>}
        <button type="button" onClick={onClose} className="btn-quiet px-3 py-2">
          <Icon name="close" className="size-4" /> إغلاق
        </button>
      </header>
      <div className="mx-auto max-w-3xl space-y-4 p-4 pb-16">
        <p className="rounded-xl bg-brass-soft px-4 py-2.5 text-sm text-brass">هكذا يرى الطالب النموذج. الإجابات هنا للتجربة ولا تُحفظ. ترتيب التوصيل يُخلط فعليًا لكل طالب.</p>
        {description && <div className="rounded-2xl border border-board/15 bg-board/[0.05] px-4 py-3 text-sm leading-relaxed"><RichText text={description} /></div>}
        {pq.map((q, i) => (
          <QuestionView key={q.id} q={q} n={i + 1} total={pq.length} value={answers[String(q.id)]} onChange={(v) => setAnswers((a) => ({ ...a, [String(q.id)]: v }))} />
        ))}
      </div>
    </div>
  );
}
