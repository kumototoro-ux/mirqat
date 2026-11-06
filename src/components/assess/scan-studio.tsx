'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/shell/icons';
import { FeedbackProvider, useFeedback } from '@/components/feedback';
import { paperStatus, savePaperAttempt, type PaperStatusRow } from '@/lib/assess/actions';
import type { PrintData, PrintQuestion } from '@/lib/assess/queries';
import { LETTERS, type OmrItem } from '@/lib/assess/omr';
import { scanSheet, type ScanAnswer } from '@/lib/assess/omr-reader';
import { RichText } from './math';

/* =====================================================================
   تصحيح أوراق الإجابة بالكاميرا
   1) تصوير الورقة (أو رفع صور) ← 2) القراءة في المتصفح (QR + الفقاعات) ← 3) مراجعة المعلم ← 4) الحفظ والرصد
   الصورة لا تُرفع لأي مكان: تُقرأ في الجهاز ويُحفظ فقط ما اعتمده المعلم.
   ===================================================================== */

const isChoice = (q: PrintQuestion) => q.qtype === 'mcq' || q.qtype === 'tf';
const r2 = (n: number) => Math.round(n * 100) / 100;
const optLabel = (q: PrintQuestion, i: number, rtl: boolean) => {
  if (q.qtype === 'tf') {
    const t = (q.options[i]?.body ?? '').trim();
    if (/^ص/.test(t)) return rtl ? 'ص' : 'T';
    if (/^خ/.test(t)) return rtl ? 'خ' : 'F';
  }
  return (rtl ? LETTERS.ar : LETTERS.en)[i];
};

type Review = {
  canvas: HTMLCanvasElement;
  answers: ScanAnswer[];
  rtl: boolean;
  /** الخيار المعتمد لكل سؤال اختيار (فهرس أو null) */
  picks: (number | null)[];
  studentId: number | null;
  qrStudent: number | null;
  /** خطأ يمنع الحفظ (ورقة نموذج آخر / الأسئلة تغيّرت) */
  block: string | null;
  qrRead: boolean;
  points: Record<number, string>;
  fileName: string;
};

export function ScanStudio(props: { data: PrintData; initialStatus: PaperStatusRow[] }) {
  return (
    <FeedbackProvider>
      <Studio {...props} />
    </FeedbackProvider>
  );
}

function Studio({ data, initialStatus }: { data: PrintData; initialStatus: PaperStatusRow[] }) {
  const { form, questions, roster } = data;
  const { toast, confirm } = useFeedback();
  const choice = useMemo(() => questions.map((q, i) => ({ q, n: i + 1 })).filter((x) => isChoice(x.q)), [questions]);
  const written = useMemo(() => questions.map((q, i) => ({ q, n: i + 1 })).filter((x) => !isChoice(x.q)), [questions]);
  const items: OmrItem[] = useMemo(() => choice.map((x) => ({ n: x.n, opts: Math.min(6, Math.max(2, x.q.options.length)) })), [choice]);
  const total = r2(questions.reduce((a, q) => a + q.points, 0));

  const [status, setStatus] = useState(initialStatus);
  const [queue, setQueue] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rev, setRev] = useState<Review | null>(null);
  const [saving, setSaving] = useState(false);
  const [onlyFlag, setOnlyFlag] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const upRef = useRef<HTMLInputElement>(null);

  const byStudent = useMemo(() => new Map(status.map((s) => [s.student_id, s])), [status]);
  const doneCount = status.filter((s) => s.source === 'paper').length;
  const name = (id: number | null) => (id == null ? '' : roster.find((s) => s.id === id)?.name_ar ?? '');

  // القراءة: الملف الأول في الطابور (مرة واحدة لكل ملف)
  const reading = useRef<File | null>(null);
  useEffect(() => {
    const file = queue[0];
    if (rev || !file || reading.current === file) return;
    reading.current = file;
    setBusy('جارٍ قراءة الورقة…');
    setError(null);
    const fail = (msg: string) => { setError(msg); setBusy(null); setQueue((q) => q.slice(1)); };
    loadCanvas(file)
      .then((canvas) => setTimeout(() => { // يترك للمتصفح فرصة رسم «جارٍ القراءة» قبل الحساب
        try {
          const img = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height);
          const res = scanSheet({ data: img.data, width: img.width, height: img.height }, items);
          if (!res.ok) return fail(`${file.name ? `«${file.name}»: ` : ''}${res.error}`);
          let block: string | null = null;
          let sid: number | null = null;
          if (res.qr) {
            if (res.qr.assessmentId !== form.id) block = 'هذه الورقة تخص اختبارًا آخر — صوّر ورقة هذا الاختبار.';
            else if (res.qr.count != null && res.qr.count !== items.length) block = 'تغيّرت أسئلة الاختيار بعد طباعة هذه الورقة، فمواضع الفقاعات لا تطابق — أعد طباعة أوراق الإجابة.';
            sid = res.qr.studentId && roster.some((s) => s.id === res.qr!.studentId) ? res.qr.studentId : null;
          }
          setRev({
            canvas, answers: res.answers, rtl: res.rtl, block, qrRead: !!res.qrText,
            picks: res.answers.map((x) => (x.picks.length === 1 ? x.picks[0] : null)),
            studentId: sid, qrStudent: res.qr?.studentId ?? null, points: {}, fileName: file.name,
          });
          setOnlyFlag(false);
          setBusy(null);
          window.scrollTo({ top: 0 });
        } catch (e) {
          fail(`تعذّرت قراءة الصورة: ${e instanceof Error ? e.message : String(e)}`);
        }
      }, 40))
      .catch(() => fail('تعذّر فتح الصورة'));
  }, [queue, rev, items, form.id, roster]);

  const next = () => { setRev(null); setQueue((q) => q.slice(1)); };
  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    setQueue((q) => [...q, ...Array.from(list).filter((f) => f.type.startsWith('image/'))]);
  };

  const score = useMemo(() => {
    if (!rev) return null;
    let got = 0, right = 0, wrong = 0, blank = 0;
    rev.picks.forEach((p, i) => {
      if (p == null) { blank++; return; }
      if (choice[i].q.options[p]?.is_correct) { right++; got += choice[i].q.points; } else wrong++;
    });
    let pending = 0;
    written.forEach(({ q }) => {
      const v = rev.points[q.id];
      if (v == null || v === '') pending++; else got += Number(v) || 0;
    });
    const flagged = rev.answers.filter((a) => a.status === 'weak' || a.status === 'multi').length;
    return { got: r2(got), right, wrong, blank, pending, flagged };
  }, [rev, choice, written]);

  async function save() {
    if (!rev || rev.block || rev.studentId == null) return;
    const bad = written.find(({ q }) => {
      const v = rev.points[q.id];
      return v != null && v !== '' && (!/^\d+(\.\d{1,2})?$/.test(v) || Number(v) > q.points);
    });
    if (bad) return toast(`درجة السؤال ${bad.n} بين 0 و ${bad.q.points}`, 'error');
    const prev = byStudent.get(rev.studentId);
    if (prev?.source === 'online') return toast('للطالب محاولة إلكترونية — صفّرها من النتائج أولًا إن أردت اعتماد الورقة', 'error');
    if (prev?.source === 'paper') {
      const ok = await confirm({ title: `استبدال ورقة ${name(rev.studentId)}؟`, body: `صُحّحت له ورقة من قبل (${prev.score} من ${prev.max_score}). تُستبدل بهذه الورقة.`, confirmLabel: 'استبدال' });
      if (!ok) return;
    }
    const choices: Record<string, number | null> = {};
    rev.picks.forEach((p, i) => { choices[String(choice[i].q.id)] = p == null ? null : choice[i].q.options[p]?.id ?? null; });
    const points: Record<string, number> = {};
    written.forEach(({ q }) => { const v = rev.points[q.id]; if (v != null && v !== '') points[String(q.id)] = Number(v); });
    const meta = {
      read: rev.answers.map((a) => ({ p: a.picks, s: a.status })),
      qr: rev.qrRead, qr_student: rev.qrStudent, edited: rev.answers.map((a, i) => (a.picks.length === 1 ? a.picks[0] : null) !== rev.picks[i]).filter(Boolean).length,
    };
    setSaving(true);
    const res = await savePaperAttempt(form.id, rev.studentId, choices, points, meta);
    setSaving(false);
    if (!res.ok) return toast(res.error, 'error');
    toast(`${name(rev.studentId)}: ${res.data!.score} من ${res.data!.max_score}${res.data!.pending_review ? ` — بقي ${res.data!.pending_review} للتصحيح` : ''}`);
    setStatus(await paperStatus(form.id));
    next();
  }

  return (
    <div className="min-h-dvh bg-paper pb-28" dir="rtl">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2.5">
          <Link href={`/staff/tasks/${form.id}`} className="inline-flex items-center gap-1 rounded-xl px-2 py-2 text-sm text-muted hover:bg-paper hover:text-ink">
            <Icon name="chevron" className="size-4 rotate-180" /> رجوع
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">تصحيح بالكاميرا — {form.title}</p>
            <p className="truncate text-xs text-muted">{form.class_label} · {choice.length} سؤال اختيار{written.length ? ` · ${written.length} مكتوب` : ''} · {total} درجة</p>
          </div>
          <span className="shrink-0 rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent">{doneCount} / {roster.length}</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-3 pt-4">
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <input ref={upRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />

        {!choice.length && (
          <div className="rounded-2xl border border-danger/25 bg-danger-soft p-4 text-sm text-danger">لا أسئلة اختيار أو صح وخطأ في هذا النموذج — ورقة الفقاعات تحتاجها.</div>
        )}

        {busy && (
          <div className="grid place-items-center gap-3 rounded-2xl border border-line bg-surface p-10 text-center">
            <span className="size-8 animate-spin rounded-full border-4 border-accent/20 border-t-board" />
            <p className="font-semibold">{busy}</p>
            {queue.length > 1 && <p className="text-xs text-muted">بقي {queue.length - 1} صورة في الطابور</p>}
          </div>
        )}

        {!rev && !busy && choice.length > 0 && (
          <section className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="mb-1 text-lg font-bold">ورقة جديدة</h2>
            {error && <p className="mb-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => camRef.current?.click()} className="flex min-h-20 items-center justify-center gap-2 rounded-2xl bg-board text-base font-bold text-chalk active:scale-[.99]">
                <Icon name="camera" className="size-6" /> تصوير الورقة
              </button>
              <button type="button" onClick={() => upRef.current?.click()} className="flex min-h-20 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line text-base font-bold hover:border-accent/40">
                <Icon name="upload" className="size-6" /> رفع صور (عدة أوراق)
              </button>
            </div>
            <ul className="mt-4 list-disc space-y-1 pe-1 ps-5 text-[13px] leading-7 text-muted">
              <li>صوّر الورقة كاملة بحيث تظهر المربعات السوداء الأربعة في الزوايا ورمز الـQR.</li>
              <li>إضاءة جيدة بلا ظل، والورقة مسطّحة، ولا تكبّر الصورة.</li>
              <li>تُقرأ الصورة في جهازك ولا تُرفع لأي مكان، ولا يُحفظ شيء قبل مراجعتك.</li>
              <li>الأسئلة المكتوبة تُدخل درجتها الآن، أو تتركها وتصحّحها لاحقًا من «النتائج».</li>
            </ul>
          </section>
        )}

        {rev && score && (
          <ReviewPanel
            rev={rev} setRev={setRev} choice={choice} written={written} roster={roster} byStudent={byStudent}
            score={score} total={total} onlyFlag={onlyFlag} setOnlyFlag={setOnlyFlag}
          />
        )}

        {!rev && !busy && <RosterStatus roster={roster} byStudent={byStudent} />}
      </main>

      {rev && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{rev.studentId != null ? name(rev.studentId) : 'اختر الطالب'}</p>
              <p className="text-xs text-muted">{score?.got} من {total}{score?.pending ? ` · ${score.pending} للتصحيح لاحقًا` : ''}{queue.length > 1 ? ` · بقي ${queue.length - 1} في الطابور` : ''}</p>
            </div>
            <button type="button" onClick={next} className="btn-quiet">تخطّي</button>
            <button type="button" onClick={save} disabled={saving || !!rev.block || rev.studentId == null} className="btn-primary">
              {saving ? 'جارٍ الحفظ…' : queue.length > 1 ? 'حفظ والتالية' : 'حفظ الدرجة'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewPanel({ rev, setRev, choice, written, roster, byStudent, score, total, onlyFlag, setOnlyFlag }: {
  rev: Review;
  setRev: React.Dispatch<React.SetStateAction<Review | null>>;
  choice: { q: PrintQuestion; n: number }[];
  written: { q: PrintQuestion; n: number }[];
  roster: PrintData['roster'];
  byStudent: Map<number, PaperStatusRow>;
  score: { got: number; right: number; wrong: number; blank: number; pending: number; flagged: number };
  total: number;
  onlyFlag: boolean;
  setOnlyFlag: (v: boolean) => void;
}) {
  const prev = rev.studentId != null ? byStudent.get(rev.studentId) : undefined;
  const set = (patch: Partial<Review>) => setRev((r) => (r ? { ...r, ...patch } : r));
  const qrName = rev.studentId != null && rev.studentId === rev.qrStudent;

  return (
    <>
      <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        {rev.block ? (
          <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">{rev.block}</p>
        ) : qrName ? (
          <p className="rounded-xl bg-ok-soft px-3 py-2 text-sm text-ok">قرأتُ رمز الطالب: <b>{roster.find((s) => s.id === rev.studentId)?.name_ar}</b></p>
        ) : (
          <p className="rounded-xl bg-brass-soft px-3 py-2 text-sm text-brass">
            {!rev.qrRead ? 'لم أقرأ رمز الـQR — اختر الطالب يدويًا.' : rev.qrStudent ? 'رمز الطالب ليس في هذا الصف — اختره يدويًا.' : 'ورقة بلا اسم — اختر الطالب.'}
          </p>
        )}
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">الطالب</span>
          <select
            value={rev.studentId ?? ''}
            onChange={(e) => set({ studentId: e.target.value ? Number(e.target.value) : null })}
            className="min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm"
          >
            <option value="">اختر الطالب…</option>
            {roster.map((s) => {
              const st = byStudent.get(s.id);
              return <option key={s.id} value={s.id}>{s.name_ar}{st ? (st.source === 'paper' ? ' ✓ (صُحّحت)' : ' (إلكتروني)') : ''}</option>;
            })}
          </select>
        </label>
        {prev?.source === 'paper' && <p className="text-xs text-brass">صُحّحت ورقته من قبل ({prev.score} من {prev.max_score}) — الحفظ يستبدلها.</p>}
        {prev?.source === 'online' && <p className="text-xs text-danger">حلّ هذا الطالب إلكترونيًا — لا تُستبدل محاولته بورقة.</p>}

        <div className="flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full bg-board px-3 py-1.5 text-chalk">{score.got} من {total}</span>
          <span className="rounded-full bg-ok-soft px-3 py-1.5 text-ok">صحيح {score.right}</span>
          <span className="rounded-full bg-danger-soft px-3 py-1.5 text-danger">خطأ {score.wrong}</span>
          <span className="rounded-full bg-paper px-3 py-1.5 text-muted">فارغ {score.blank}</span>
          {score.flagged > 0
            ? <button type="button" onClick={() => setOnlyFlag(!onlyFlag)} className="rounded-full bg-brass-soft px-3 py-1.5 text-brass ring-1 ring-brass/30">{onlyFlag ? 'عرض الكل' : `تحتاج مراجعة ${score.flagged}`}</button>
            : <span className="rounded-full bg-ok-soft px-3 py-1.5 text-ok">القراءة واضحة</span>}
        </div>
      </section>

      <SheetImage rev={rev} choice={choice} />

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h3 className="font-bold">أسئلة الاختيار</h3>
        <p className="mb-2 text-xs text-muted">اضغط حرفًا لتغيير الإجابة، ومرة أخرى لتركها فارغة. الإطار الأخضر هو الإجابة الصحيحة.</p>
        <div className="divide-y divide-line">
          {choice.map(({ q, n }, i) => {
            const a = rev.answers[i];
            const flag = a.status === 'weak' || a.status === 'multi';
            if (onlyFlag && !flag) return null;
            const p = rev.picks[i];
            const ok = p != null && q.options[p]?.is_correct;
            return (
              <div key={q.id} className={`flex items-center gap-2 py-2 ${a.status === 'multi' ? 'bg-danger-soft/50' : flag ? 'bg-brass-soft/50' : ''} -mx-2 rounded-lg px-2`}>
                <span className="w-7 shrink-0 text-center text-sm font-bold">{n}</span>
                <div className="flex flex-1 flex-wrap gap-1.5">
                  {q.options.slice(0, 6).map((o, k) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setRev((r) => (r ? { ...r, picks: r.picks.map((x, j) => (j === i ? (x === k ? null : k) : x)) } : r))}
                      className={`min-h-10 min-w-10 rounded-xl border-[1.5px] px-2 text-[15px] font-bold transition ${p === k ? 'border-inverse bg-inverse text-chalk' : 'border-line bg-surface'} ${o.is_correct ? 'ring-2 ring-inset ring-ok' : ''}`}
                      dir={rev.rtl ? undefined : 'ltr'}
                      title={o.body}
                    >
                      {optLabel(q, k, rev.rtl)}
                    </button>
                  ))}
                </div>
                <span className={`w-6 text-center text-lg font-bold ${p == null ? 'text-muted' : ok ? 'text-ok' : 'text-danger'}`}>{p == null ? '–' : ok ? '✓' : '✗'}</span>
                <span className="w-16 shrink-0 text-[11px] text-brass">{a.status === 'multi' ? 'أكثر من دائرة' : a.status === 'weak' ? 'تظليل خفيف' : ''}</span>
              </div>
            );
          })}
        </div>
      </section>

      {written.length > 0 && !onlyFlag && (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h3 className="font-bold">الأسئلة المكتوبة</h3>
          <p className="mb-3 text-xs text-muted">أدخل الدرجة من ورقة الأسئلة، أو اتركها فارغة لتصحيحها لاحقًا من «النتائج».</p>
          <div className="space-y-2">
            {written.map(({ q, n }) => (
              <div key={q.id} className="flex items-center gap-3 rounded-xl bg-paper px-3 py-2">
                <span className="w-7 shrink-0 text-center text-sm font-bold">{n}</span>
                <div className="min-w-0 flex-1 truncate text-sm"><RichText text={q.qtype === 'fill' ? q.body.replace(/\[\[(\d+)\]\]/g, '(…$1)') : q.body} /></div>
                <input
                  inputMode="decimal"
                  value={rev.points[q.id] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[^\d.]/g, '');
                    setRev((r) => (r ? { ...r, points: { ...r.points, [q.id]: v } } : r));
                  }}
                  placeholder="—"
                  className="h-10 w-16 rounded-lg border border-line bg-surface text-center font-bold"
                  aria-label={`درجة السؤال ${n}`}
                />
                <span className="w-10 shrink-0 text-xs text-muted">/ {q.points}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** الصورة مع إطار حول ما قُرئ: أخضر = صحيح، أحمر = خطأ، أصفر = مقروء لكن لم يُعتمد */
function SheetImage({ rev, choice }: { rev: Review; choice: { q: PrintQuestion }[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(rev.answers.some((a) => a.status !== 'ok' && a.status !== 'blank'));
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !open) return;
    const src = rev.canvas, k = Math.min(1, 1000 / src.width);
    cv.width = Math.round(src.width * k); cv.height = Math.round(src.height * k);
    const g = cv.getContext('2d')!;
    g.drawImage(src, 0, 0, cv.width, cv.height);
    rev.answers.forEach((a, i) => {
      a.px.forEach(([x, y], j) => {
        const chosen = rev.picks[i] === j, read = a.picks.includes(j);
        if (!chosen && !read) return;
        const dx = a.px[1] ? Math.hypot(a.px[1][0] - a.px[0][0], a.px[1][1] - a.px[0][1]) : 30;
        g.beginPath();
        g.arc(x * k, y * k, Math.max(5, dx * k * 0.42), 0, Math.PI * 2);
        g.lineWidth = 3;
        g.strokeStyle = chosen ? (choice[i].q.options[j]?.is_correct ? '#1d9a52' : '#d63a2a') : '#e0a000';
        g.stroke();
      });
    });
  }, [rev, choice, open]);
  return (
    <section className="rounded-2xl border border-line bg-surface">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-bold">
        الصورة وما قرأتُه منها
        <Icon name="chevron" className={`size-4 transition ${open ? 'rotate-90' : '-rotate-90'}`} />
      </button>
      {open && <div className="px-3 pb-3"><canvas ref={ref} className="w-full rounded-xl" /></div>}
    </section>
  );
}

function RosterStatus({ roster, byStudent }: { roster: PrintData['roster']; byStudent: Map<number, PaperStatusRow> }) {
  const [show, setShow] = useState(false);
  const left = roster.filter((s) => !byStudent.has(s.id));
  return (
    <section className="rounded-2xl border border-line bg-surface">
      <button type="button" onClick={() => setShow(!show)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-bold">
        <span>الطلاب — بقي {left.length} من {roster.length}</span>
        <Icon name="chevron" className={`size-4 transition ${show ? 'rotate-90' : '-rotate-90'}`} />
      </button>
      {show && (
        <ul className="divide-y divide-line border-t border-line">
          {roster.map((s) => {
            const st = byStudent.get(s.id);
            return (
              <li key={s.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{s.name_ar}</span>
                {st ? (
                  <>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.source === 'paper' ? 'bg-accent/10 text-accent' : 'bg-paper text-muted'}`}>{st.source === 'paper' ? 'ورقية' : 'إلكترونية'}</span>
                    {st.pending_review > 0 && <span className="rounded-full bg-brass-soft px-2 py-0.5 text-[11px] font-semibold text-brass">{st.pending_review} للتصحيح</span>}
                    <span className="w-16 text-left font-bold tabular-nums">{st.score} / {st.max_score}</span>
                  </>
                ) : <span className="text-xs text-muted">لم تُصحَّح</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** الصورة إلى لوحة رسم (حتى 2400 بكسل) — المتصفح يطبّق اتجاه الصورة (EXIF) تلقائيًا */
function loadCanvas(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const sc = Math.min(1, 2400 / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(im.naturalWidth * sc));
      c.height = Math.max(1, Math.round(im.naturalHeight * sc));
      c.getContext('2d', { willReadFrequently: true })!.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c);
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    im.src = url;
  });
}
