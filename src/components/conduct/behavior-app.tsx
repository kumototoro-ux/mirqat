'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { Field } from '@/components/sheet';
import type { AuthorContext } from '@/lib/assess/queries';
import { searchStudents, type StudentHit } from '@/lib/assess/grading-actions';
import { behaviorBoard, deleteBehavior, recentBehavior, saveBehavior, studentBehavior, type Board, type BehaviorRecord } from '@/lib/conduct/actions';
import { addDays, behKind, fmtDay, riyadhToday, type BehKind, type Status } from '@/lib/conduct/shared';
import { relTime } from '@/lib/assess/shared';

const REASONS: Record<'positive' | 'negative', string[]> = {
  negative: ['تأخر عن الحصة', 'عدم إحضار الكتاب', 'عدم حل الواجب', 'كثرة الكلام', 'استخدام الجوال', 'الإساءة لزميل', 'الخروج دون إذن', 'عدم الالتزام بالزي'],
  positive: ['مشاركة متميزة', 'مساعدة زملائه', 'نظافة وترتيب', 'التزام وانضباط', 'إبداع في العمل', 'قيادة ومبادرة'],
};
const KIND_STYLE: Record<BehKind, { soft: string; on: string; label: string }> = {
  positive: { soft: 'bg-ok-soft text-ok', on: 'bg-ok text-chalk', label: 'إيجابي' },
  negative: { soft: 'bg-danger-soft text-danger', on: 'bg-danger text-chalk', label: 'سلبي' },
  neutral: { soft: 'bg-paper text-muted', on: 'bg-ink text-chalk', label: 'ملاحظة' },
};

export function BehaviorApp({ ctx, statuses, initialBoard, initialRecent, myEmployeeId }: { ctx: AuthorContext; statuses: Status[]; initialBoard: Board; initialRecent: BehaviorRecord[]; myEmployeeId: number | null }) {
  const [student, setStudent] = useState<{ id: number; name_ar: string; code: string; class_label?: string; class_id?: number } | null>(null);
  const [term, setTerm] = useState<number | null>(ctx.currentTerm);
  const board = useQuery({ queryKey: ['beh-board', term], queryFn: () => behaviorBoard(term), initialData: term === ctx.currentTerm ? initialBoard : undefined });
  const recent = useQuery({ queryKey: ['beh-recent'], queryFn: () => recentBehavior(25), initialData: initialRecent });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0 space-y-4">
        <StudentSearch onPick={setStudent} />
        <AnimatePresence mode="wait">
          {student ? (
            <StudentPanel key={student.id} student={student} statuses={statuses} ctx={ctx} term={term} myEmployeeId={myEmployeeId} onClose={() => setStudent(null)} />
          ) : (
            <motion.section key="recent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-[1.4rem] border border-line bg-surface">
              <h2 className="border-b border-line px-4 py-3.5 font-bold">آخر التسجيلات</h2>
              {!recent.data?.length ? (
                <p className="px-4 py-12 text-center text-sm text-muted">لا تسجيلات سلوك بعد. ابحث عن طالب لتسجيل سلوكه.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {recent.data.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => setStudent({ id: r.student_id, name_ar: r.student ?? '', code: r.code ?? '' })} className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-paper/60">
                        <KindDot kind={behKind(r.status)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{r.student}</span>
                          <span className="block truncate text-xs text-muted">{r.status}{r.note ? ` · ${r.note}` : ''}</span>
                        </span>
                        {behKind(r.status) === 'negative' && r.score > 0 && <span className="text-sm font-bold tabular-nums text-danger" dir="ltr">−{r.score}</span>}
                        <span className="shrink-0 text-xs text-muted">{relTime(r.recorded_at)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      <aside className="space-y-4">
        <section className="rounded-[1.4rem] border border-line bg-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-bold">هذا الأسبوع</h3>
            <select value={term ?? ''} onChange={(e) => setTerm(Number(e.target.value) || null)} className="rounded-lg border border-line bg-surface px-2 py-1 text-xs">
              {ctx.terms.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-ok-soft p-3 text-center"><p className="text-2xl font-bold tabular-nums text-ok">{board.data?.week.positive ?? 0}</p><p className="text-xs text-ok">إيجابي</p></div>
            <div className="rounded-2xl bg-danger-soft p-3 text-center"><p className="text-2xl font-bold tabular-nums text-danger">{board.data?.week.negative ?? 0}</p><p className="text-xs text-danger">سلبي</p></div>
          </div>
        </section>
        <BoardList title="يحتاجون متابعة" tone="danger" rows={board.data?.lowest ?? []} onPick={(r) => setStudent({ id: r.student_id, name_ar: r.name_ar, code: r.code })} />
        <BoardList title="المتميزون" tone="ok" rows={board.data?.top ?? []} onPick={(r) => setStudent({ id: r.student_id, name_ar: r.name_ar, code: r.code })} />
      </aside>
    </div>
  );
}

function KindDot({ kind }: { kind: BehKind }) {
  return (
    <span className={`grid size-9 shrink-0 place-items-center rounded-full text-base font-bold ${KIND_STYLE[kind].soft}`}>{kind === 'positive' ? '+' : kind === 'negative' ? '−' : '•'}</span>
  );
}

function BoardList({ title, tone, rows, onPick }: { title: string; tone: 'ok' | 'danger'; rows: Board['lowest']; onPick: (r: Board['lowest'][number]) => void }) {
  return (
    <section className="rounded-[1.4rem] border border-line bg-surface">
      <h3 className={`border-b border-line px-4 py-3 text-sm font-bold ${tone === 'ok' ? 'text-ok' : 'text-danger'}`}>{title}</h3>
      {!rows.length ? (
        <p className="px-4 py-6 text-center text-xs text-muted">لا أحد</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.student_id}>
              <button type="button" onClick={() => onPick(r)} className="flex w-full items-center gap-2 px-4 py-2.5 text-start hover:bg-paper/60">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.name_ar}</span>
                {tone === 'ok' ? <span className="text-xs font-bold text-ok" dir="ltr">+{r.positive}</span> : <span className="text-xs font-bold tabular-nums text-danger">{Number(r.score)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StudentSearch({ onPick }: { onPick: (s: StudentHit) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    setBusy(true);
    const t = setTimeout(async () => {
      setHits(await searchStudents(q));
      setBusy(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="relative">
      <Icon name="search" className="pointer-events-none absolute inset-y-0 start-4 my-auto size-5 text-muted" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن طالب بالاسم أو الرقم لتسجيل سلوكه أو عرض سجله" className="h-14 w-full rounded-2xl border border-line bg-surface pe-10 ps-12 text-[1.02rem] shadow-[0_1px_0_rgb(31_42_36/0.03)] focus:border-board focus:outline-none focus:ring-4 focus:ring-gold/20" autoComplete="off" />
      {busy && <span className="spinner absolute inset-y-0 end-4 my-auto text-board" />}
      <AnimatePresence>
        {hits.length > 0 && (
          <motion.ul initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-2xl border border-line bg-surface p-1 shadow-[0_20px_50px_-20px_rgb(31_42_36/0.45)]">
            {hits.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => { onPick(h); setQ(''); setHits([]); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start hover:bg-board/[0.06]">
                  <span className="grid size-9 place-items-center rounded-full bg-board/10 font-bold text-board">{h.name_ar.trim().charAt(0)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{h.name_ar}</span>
                    <span className="block truncate text-xs text-muted"><bdi>{h.code}</bdi> · {h.class_label}</span>
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const tone = score >= 90 ? '#11734b' : score >= 75 ? '#356854' : score >= 60 ? '#d9a441' : '#b03a2e';
  return (
    <div className="relative size-24 shrink-0">
      <svg viewBox="0 0 80 80" className="size-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#e9eeeb" strokeWidth="7" />
        <motion.circle cx="40" cy="40" r={r} fill="none" stroke={tone} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - score / 100) }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-center">
        <span>
          <span className="block text-2xl font-bold tabular-nums" style={{ color: tone }}>{Math.round(score * 10) / 10}</span>
          <span className="block text-[0.62rem] text-muted">من 100</span>
        </span>
      </span>
    </div>
  );
}

function StudentPanel({ student, statuses, ctx, term, myEmployeeId, onClose }: { student: { id: number; name_ar: string; code: string; class_label?: string; class_id?: number }; statuses: Status[]; ctx: AuthorContext; term: number | null; myEmployeeId: number | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast, confirm } = useFeedback();
  const data = useQuery({ queryKey: ['beh-student', student.id, term], queryFn: () => studentBehavior(student.id, term) });
  const [kind, setKind] = useState<'negative' | 'positive'>('negative');
  const [editing, setEditing] = useState<BehaviorRecord | null>(null);
  const options = statuses.filter((s) => behKind(s.name) === kind || behKind(s.name) === 'neutral');
  const [status, setStatus] = useState<number | null>(null);
  const [score, setScore] = useState('1');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(riyadhToday());
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!options.some((o) => o.id === status)) setStatus(options.find((o) => behKind(o.name) === kind)?.id ?? options[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const edit = (r: BehaviorRecord) => {
    const k = behKind(r.status);
    setKind(k === 'positive' ? 'positive' : 'negative');
    setEditing(r);
    setStatus(r.status_id);
    setScore(String(r.score));
    setNote(r.note ?? '');
    setDate(r.occurred_on ?? riyadhToday());
    form.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const reset = () => {
    setEditing(null);
    setNote('');
    setScore(kind === 'negative' ? '1' : '0');
    setDate(riyadhToday());
  };

  const save = async () => {
    if (!status) return toast('اختر حالة السلوك', 'error');
    const v = Number(score || 0);
    if (!(v >= 0 && v <= 100)) return toast('الدرجة بين 0 و 100', 'error');
    const ok = await confirm({
      title: editing ? 'حفظ التعديل؟' : `تسجيل سلوك ${kind === 'negative' ? 'سلبي' : 'إيجابي'} لـ ${student.name_ar}؟`,
      body: <>{statuses.find((s) => s.id === status)?.name}{kind === 'negative' && v ? ` · خصم ${v} من 100` : ''}{note ? <span className="mt-1 block">✎ {note}</span> : null}<span className="mt-1 block">{fmtDay(date)}</span></>,
      confirmLabel: editing ? 'حفظ' : 'تسجيل',
      danger: kind === 'negative',
    });
    if (!ok) return;
    setBusy(true);
    const res = await saveBehavior(editing?.id ?? null, { student_id: student.id, status_id: status, score: kind === 'negative' ? v : v, note: note.trim() || null, date, subject_id: null });
    setBusy(false);
    if (!res.ok) return toast(res.error, 'error');
    toast(res.message);
    reset();
    qc.invalidateQueries({ queryKey: ['beh-student', student.id] });
    qc.invalidateQueries({ queryKey: ['beh-board'] });
    qc.invalidateQueries({ queryKey: ['beh-recent'] });
  };

  const remove = async (r: BehaviorRecord) => {
    const ok = await confirm({ title: 'حذف هذا السجل؟', body: `${r.status}${r.note ? ` — ${r.note}` : ''}`, confirmLabel: 'حذف', danger: true, run: () => deleteBehavior(r.id) });
    if (!ok) return;
    qc.invalidateQueries({ queryKey: ['beh-student', student.id] });
    qc.invalidateQueries({ queryKey: ['beh-board'] });
    qc.invalidateQueries({ queryKey: ['beh-recent'] });
  };

  const s = data.data?.summary;
  const canTouch = (r: BehaviorRecord, hours: number) => ctx.isAdmin || (r.recorded_by === myEmployeeId && Date.now() - new Date(r.recorded_at).getTime() < hours * 3600000);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
      <section className="flex flex-wrap items-center gap-4 rounded-[1.4rem] border border-line bg-surface p-4 sm:p-5">
        {s ? <ScoreRing score={Number(s.score)} /> : <div className="skeleton size-24 rounded-full" />}
        <div className="min-w-0 flex-1">
          <p className="text-xl font-bold">{student.name_ar}</p>
          <p className="text-sm text-muted"><bdi>{student.code}</bdi>{student.class_label ? ` · ${student.class_label}` : ''}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-bold">
            <span className="rounded-full bg-ok-soft px-2.5 py-1 text-ok"><bdi dir="ltr">+{s?.positive ?? 0}</bdi> إيجابي</span>
            <span className="rounded-full bg-danger-soft px-2.5 py-1 text-danger">{s?.negative ?? 0} سلبي</span>
          </div>
        </div>
        <button type="button" onClick={onClose} className="grid size-9 place-items-center self-start rounded-xl text-muted hover:bg-paper" aria-label="إغلاق"><Icon name="close" className="size-5" /></button>
      </section>

      <section ref={form} className={`rounded-[1.4rem] border bg-surface p-4 sm:p-5 ${editing ? 'border-gold' : 'border-line'}`}>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {(['negative', 'positive'] as const).map((k) => (
            <button key={k} type="button" onClick={() => { setKind(k); setScore(k === 'negative' ? '1' : '0'); }} className={`rounded-2xl border-2 py-3 text-base font-bold transition-all active:scale-[0.98] ${kind === k ? (k === 'negative' ? 'border-danger bg-danger-soft text-danger' : 'border-ok bg-ok-soft text-ok') : 'border-line text-muted'}`}>
              {k === 'negative' ? '− سلوك سلبي' : '+ سلوك إيجابي'}
            </button>
          ))}
        </div>
        <div className="space-y-4">
          <div>
            <p className="label">الحالة</p>
            <div className="flex flex-wrap gap-1.5">
              {options.map((o) => (
                <button key={o.id} type="button" onClick={() => setStatus(o.id)} className={`rounded-full px-3.5 py-2 text-sm transition-all ${status === o.id ? KIND_STYLE[behKind(o.name)].on : 'bg-paper hover:bg-board/10'}`}>{o.name}</button>
              ))}
              {!options.length && <span className="text-sm text-muted">أضف حالات السلوك من الإعدادات العامة</span>}
            </div>
          </div>
          {kind === 'negative' && (
            <div>
              <p className="label">الخصم من 100</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {[1, 2, 3, 5, 10].map((v) => (
                  <button key={v} type="button" onClick={() => setScore(String(v))} className={`grid size-10 place-items-center rounded-xl text-sm font-bold tabular-nums transition-all ${score === String(v) ? 'bg-danger text-chalk' : 'bg-paper hover:bg-danger-soft'}`}>{v}</button>
                ))}
                <input type="number" min={0} max={100} step={0.5} value={score} onChange={(e) => setScore(e.target.value)} className="field w-20 py-2 text-center tabular-nums" dir="ltr" />
              </div>
            </div>
          )}
          <Field label="الملاحظة">
            <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 1000))} className="field" placeholder="ماذا حدث؟" />
            <span className="mt-1.5 flex flex-wrap gap-1">
              {REASONS[kind].map((t) => (
                <button key={t} type="button" onClick={() => setNote(t)} className="rounded-full bg-paper px-2.5 py-1 text-xs hover:bg-board/10">{t}</button>
              ))}
            </span>
          </Field>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="التاريخ">
              <input type="date" value={date} max={riyadhToday()} min={ctx.isAdmin ? undefined : addDays(riyadhToday(), -14)} onChange={(e) => e.target.value && setDate(e.target.value)} className="field w-auto tabular-nums" dir="ltr" />
            </Field>
            <div className="ms-auto flex gap-2">
              {editing && <button type="button" onClick={reset} className="btn-quiet">إلغاء التعديل</button>}
              <button type="button" onClick={save} disabled={busy} className={`btn px-8 py-3 text-chalk ${kind === 'negative' ? 'bg-danger hover:bg-[#93281f]' : 'bg-ok hover:bg-[#0c5a3a]'}`}>
                {busy ? <span className="spinner" /> : <Icon name="check" className="size-4" />} {editing ? 'حفظ التعديل' : 'تسجيل'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[1.4rem] border border-line bg-surface">
        <h3 className="border-b border-line px-4 py-3.5 font-bold">سجل الطالب</h3>
        {data.isPending ? (
          <div className="space-y-2 p-4">{Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton h-14" />)}</div>
        ) : !data.data?.records.length ? (
          <p className="px-4 py-10 text-center text-sm text-muted">لا تسجيلات في هذا الفصل الدراسي — سلوكه 100 ✓</p>
        ) : (
          <ol className="relative space-y-0 px-4 py-2">
            {data.data.records.map((r) => {
              const k = behKind(r.status);
              return (
                <li key={r.id} className="relative flex gap-3 border-s-2 border-line py-3 ps-5">
                  <span className={`absolute -start-[0.45rem] top-4 size-3 rounded-full ring-4 ring-surface ${k === 'positive' ? 'bg-ok' : k === 'negative' ? 'bg-danger' : 'bg-muted'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {r.status}
                      {k === 'negative' && r.score > 0 && <span className="ms-2 inline-block font-bold tabular-nums text-danger" dir="ltr">−{r.score}</span>}
                    </p>
                    {r.note && <p className="mt-0.5 text-sm text-ink/80">{r.note}</p>}
                    <p className="mt-0.5 text-xs text-muted">{r.occurred_on ? fmtDay(r.occurred_on) : ''}{r.recorder ? ` · ${r.recorder}` : ''}</p>
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    {canTouch(r, 72) && <button type="button" onClick={() => edit(r)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-board/10 hover:text-board" aria-label="تعديل"><Icon name="edit" className="size-4" /></button>}
                    {canTouch(r, 6) && <button type="button" onClick={() => remove(r)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger" aria-label="حذف"><Icon name="trash" className="size-4" /></button>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </motion.div>
  );
}
