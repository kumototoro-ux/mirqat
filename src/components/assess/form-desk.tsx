'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { gradeFormAnswer } from '@/lib/assess/actions';
import type { FormDetail } from '@/lib/assess/queries';
import { QTYPE_LABEL } from '@/lib/assess/shared';
import { RichText } from './math';

/**
 * تصحيح النموذج سؤالًا سؤالًا: كل إجابات الطلاب على نفس السؤال أمامك،
 * فتصحح المقالي بسرعة وبمعيار واحد للجميع.
 */
export function FormDesk({ form }: { form: FormDetail }) {
  const latest = useMemo(() => {
    const m = new Map<number, FormDetail['attempts'][number]>();
    for (const a of form.attempts) if (!a.is_auto_absent && (!m.get(a.student_id) || m.get(a.student_id)!.attempt_no < a.attempt_no)) m.set(a.student_id, a);
    return [...m.values()];
  }, [form.attempts]);
  const nameOf = useMemo(() => new Map(form.roster.map((s) => [s.id, s])), [form.roster]);
  const manualQs = form.questions.filter((q) => q.qtype === 'long' || q.qtype === 'short');
  const pendingOf = (qid: number) => latest.filter((a) => a.answers.find((x) => x.question_id === qid)?.status === 'pending').length;
  const firstPending = manualQs.find((q) => pendingOf(q.id) > 0) ?? manualQs[0];
  const [qid, setQid] = useState<number | null>(firstPending?.id ?? null);
  const [onlyPending, setOnlyPending] = useState(true);
  const q = form.questions.find((x) => x.id === qid);
  const totalPending = latest.reduce((n, a) => n + a.pending_review, 0);

  if (!manualQs.length)
    return (
      <div className="grid place-items-center rounded-[1.4rem] border border-line bg-surface px-6 py-14 text-center">
        <span className="grid size-16 place-items-center rounded-2xl bg-ok-soft text-ok"><Icon name="check" className="size-8" /></span>
        <p className="mt-4 text-lg font-semibold">هذا النموذج يُصحَّح آليًا بالكامل</p>
        <p className="mt-1 text-sm text-muted">الدرجات مرصودة تلقائيًا عند التسليم. يمكنك مراجعة كل طالب وتعديل أي درجة من النتائج.</p>
        <Link href={`/staff/tasks/${form.id}`} className="btn-primary mt-5">النتائج والتحليل</Link>
      </div>
    );

  const list = q ? latest.filter((a) => !onlyPending || a.answers.find((x) => x.question_id === q.id)?.status === 'pending') : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-[1.4rem] border border-line bg-surface p-4">
        <span className={`grid size-10 place-items-center rounded-xl ${totalPending ? 'bg-brass-soft text-brass' : 'bg-ok-soft text-ok'}`}>
          <Icon name={totalPending ? 'edit' : 'check'} className="size-5" />
        </span>
        <p className="min-w-0 flex-1 font-bold">{totalPending ? `${totalPending} إجابة بانتظار تصحيحك` : 'لا إجابات بانتظار التصحيح 🎉'}<span className="block text-xs font-normal text-muted">{latest.length} طالب سلّم · بقية الأسئلة مصحّحة آليًا</span></p>
        <Link href={`/staff/tasks/${form.id}`} className="btn-quiet px-3 py-2 text-xs">النتائج حسب الطالب</Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {manualQs.map((x) => {
          const n = pendingOf(x.id);
          const on = x.id === qid;
          const idx = form.questions.indexOf(x) + 1;
          return (
            <button key={x.id} type="button" onClick={() => setQid(x.id)} className={`flex shrink-0 items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-sm transition-all ${on ? 'border-board bg-board text-chalk' : 'border-line bg-surface hover:border-board/40'}`}>
              <span className="font-bold">س{idx}</span>
              <span className={on ? 'text-chalk/75' : 'text-muted'}>{QTYPE_LABEL[x.qtype]}</span>
              {n > 0 ? <span className={`rounded-full px-1.5 text-xs font-bold tabular-nums ${on ? 'bg-chalk/20' : 'bg-gold/25 text-brass'}`}>{n}</span> : <Icon name="check" className="size-4" />}
            </button>
          );
        })}
      </div>

      {q && (
        <section className="rounded-[1.4rem] border border-line bg-surface">
          <div className="border-b border-line p-4 sm:p-5">
            <p className="text-xs text-muted">{QTYPE_LABEL[q.qtype]} · {q.points} درجة</p>
            <p className="mt-1 font-semibold leading-relaxed"><RichText text={q.body} /></p>
            {q.qtype === 'short' && (q.config.answers?.length ?? 0) > 0 && <p className="mt-1.5 text-xs text-ok">المقبول آليًا: {q.config.answers!.join(' | ')}</p>}
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} className="size-4 accent-[#356854]" />
              غير المصحّح فقط
            </label>
          </div>
          <ul className="divide-y divide-line">
            {list.map((a, i) => (
              <AnswerRow key={`${a.id}-${q.id}`} formId={form.id} attemptId={a.id} q={q} i={i} student={nameOf.get(a.student_id)} answer={a.answers.find((x) => x.question_id === q.id)} />
            ))}
            {!list.length && <li className="px-4 py-12 text-center text-muted">{onlyPending ? 'صُحّحت كل إجابات هذا السؤال ✓' : 'لا إجابات'}</li>}
          </ul>
        </section>
      )}
    </div>
  );
}

function AnswerRow({ formId, attemptId, q, i, student, answer }: { formId: number; attemptId: number; q: FormDetail['questions'][number]; i: number; student?: { name_ar: string; code: string }; answer?: FormDetail['attempts'][number]['answers'][number] }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pts, setPts] = useState(answer && answer.status !== 'pending' ? String(answer.points) : '');
  const [fb, setFb] = useState(answer?.feedback ?? '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(answer?.status === 'manual' || answer?.status === 'auto');
  const save = async () => {
    const v = Number(pts);
    if (pts === '' || !(v >= 0 && v <= q.points)) return toast(`الدرجة بين 0 و ${q.points}`, 'error');
    setBusy(true);
    const res = await gradeFormAnswer(attemptId, q.id, v, fb.trim() || null, formId);
    setBusy(false);
    if (!res.ok) return toast(res.error, 'error');
    setSaved(true);
    toast(`✓ ${student?.name_ar ?? ''}: ${v} من ${q.points}`);
    router.refresh();
  };
  return (
    <motion.li initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 10) * 0.02 }} className={`p-4 sm:p-5 ${saved ? 'bg-ok-soft/20' : ''}`}>
      <div className="mb-2 flex items-center gap-2 text-sm">
        <span className="font-bold">{student?.name_ar ?? 'طالب'}</span>
        <bdi className="text-xs text-muted">{student?.code}</bdi>
        {saved && <span className="ms-auto inline-flex items-center gap-1 text-xs font-semibold text-ok"><Icon name="check" className="size-3.5" /> مصحّح</span>}
      </div>
      <div className="whitespace-pre-wrap rounded-xl bg-paper/70 px-3.5 py-2.5 leading-relaxed">{answer?.response ? String(answer.response) : <span className="text-muted">— لم يُجب —</span>}</div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <input type="number" inputMode="decimal" min={0} max={q.points} step={0.25} value={pts} onChange={(e) => setPts(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} className="field w-20 py-2 text-center font-bold tabular-nums" dir="ltr" aria-label="الدرجة" />
        <span className="text-sm text-muted">/ {q.points}</span>
        {[q.points, Math.round((q.points / 2) * 100) / 100, 0].map((v) => (
          <button key={v} type="button" onClick={() => setPts(String(v))} className={`rounded-full px-2.5 py-1 text-xs tabular-nums ${pts === String(v) ? 'bg-board text-chalk' : 'bg-paper'}`}>{v}</button>
        ))}
        <input value={fb} onChange={(e) => setFb(e.target.value.slice(0, 500))} placeholder="ملاحظة للطالب (اختياري)" className="field min-w-40 flex-1 py-2" />
        <button type="button" onClick={save} disabled={busy} className="btn-primary px-5 py-2">{busy ? <span className="spinner" /> : 'حفظ'}</button>
      </div>
    </motion.li>
  );
}
