'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { Icon, type IconName } from '@/components/shell/icons';
import { Badge } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { Field } from '@/components/sheet';
import { Registry } from '@/components/registry/registry';
import { subjectColor } from '@/components/timetable-grid';
import type { PageResult } from '@/components/registry/types';
import type { AuthorContext } from '@/lib/assess/queries';
import { STATUS_META, relTime } from '@/lib/assess/shared';
import {
  deleteManual,
  getRoster,
  listRecords,
  listToRecord,
  recentSingle,
  saveManual,
  searchStudents,
  type RecordRow,
  type RosterRow,
  type SingleRecent,
  type StudentHit,
} from '@/lib/assess/grading-actions';
import { ManualRoster } from './manual-roster';
import { DateTime, Section, fmtFull } from './kit';

type Mode = 'tasks' | 'manual' | 'single' | 'records';

export function GradingHub({
  initialMode,
  ctx,
  pending,
  classNames,
  subjectNames,
}: {
  initialMode: Mode;
  ctx: AuthorContext;
  pending: PageResult<RecordRow>;
  classNames: Record<number, string>;
  subjectNames: Record<number, string>;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const go = (m: Mode) => {
    setMode(m);
    history.replaceState(null, '', `?mode=${m}`);
  };

  const cards: { key: Mode; title: string; lead: string; icon: IconName; tone: 'board' | 'gold' }[] = [
    { key: 'tasks', title: 'الرصد من المهام', lead: 'اختر مهمة أو نموذجًا، صحّح وعلّق ثم اعتمد', icon: 'tasks', tone: 'board' },
    { key: 'manual', title: 'رصد يدوي', lead: 'اختر الفصل والمادة ونوع التقييم ثم ارصد الكشف', icon: 'edit', tone: 'gold' },
  ];

  return (
    <>
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        {cards.map((c, i) => {
          const on = mode === c.key;
          return (
            <motion.button
              key={c.key}
              type="button"
              onClick={() => go(c.key)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              aria-pressed={on}
              className={`group relative flex items-center gap-4 overflow-hidden rounded-[1.4rem] border p-4 text-start transition-all duration-300 sm:p-5 ${
                on
                  ? c.tone === 'board'
                    ? 'border-board bg-gradient-to-br from-board to-board-deep text-chalk shadow-[0_18px_40px_-24px_rgb(53_104_84/0.9)]'
                    : 'border-gold bg-gradient-to-br from-[#f7e6bd] to-[#efd59a] text-ink shadow-[0_18px_40px_-26px_rgb(138_97_22/0.8)]'
                  : 'border-line bg-surface hover:-translate-y-0.5 hover:border-board/30'
              }`}
            >
              <span className={`grid size-14 shrink-0 place-items-center rounded-2xl transition-transform group-hover:scale-105 ${on ? (c.tone === 'board' ? 'bg-chalk/15' : 'bg-white/60 text-brass') : c.tone === 'board' ? 'bg-board/10 text-board' : 'bg-brass-soft text-brass'}`}>
                <Icon name={c.icon} className="size-7" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold">{c.title}</span>
                <span className={`mt-0.5 block text-sm leading-snug ${on ? (c.tone === 'board' ? 'text-chalk/75' : 'text-ink/65') : 'text-muted'}`}>{c.lead}</span>
              </span>
              {c.key === 'tasks' && pending.total > 0 && (
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums ${on ? 'bg-chalk/20' : 'bg-gold/25 text-brass'}`}>{pending.total}</span>
              )}
            </motion.button>
          );
        })}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {(
          [
            ['single', 'رصد لطالب واحد', 'user'],
            ['records', 'سجلات الرصد', 'audit'],
          ] as const
        ).map(([k, label, icon]) => (
          <button
            key={k}
            type="button"
            onClick={() => go(k)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all ${mode === k ? 'bg-ink text-chalk' : 'bg-surface text-ink ring-1 ring-line hover:ring-board/40'}`}
          >
            <Icon name={icon} className="size-4" /> {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={mode} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
          {mode === 'tasks' && <TasksMode ctx={ctx} pending={pending} classNames={classNames} subjectNames={subjectNames} />}
          {mode === 'manual' && <ManualMode ctx={ctx} />}
          {mode === 'single' && <SingleMode ctx={ctx} />}
          {mode === 'records' && <RecordsMode ctx={ctx} classNames={classNames} subjectNames={subjectNames} />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

/* =====================================================================
   1) من المهام
   ===================================================================== */
function TasksMode({ ctx, pending, classNames, subjectNames }: { ctx: AuthorContext; pending: PageResult<RecordRow>; classNames: Record<number, string>; subjectNames: Record<number, string> }) {
  const [klass, setKlass] = useState('');
  const [subject, setSubject] = useState('');
  const filtered = !klass && !subject;
  const q = useQuery({
    queryKey: ['to-record', klass, subject],
    queryFn: () => listToRecord({ page: 1, size: 50, q: '', sort: 'due', filters: { class: klass, subject } }),
    initialData: filtered ? pending : undefined,
  });
  const rows = q.data?.rows ?? [];
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="me-auto text-lg font-bold">بانتظار الرصد <span className="text-sm font-normal text-muted">— الأقرب موعدًا أولًا</span></h2>
        <select value={klass} onChange={(e) => setKlass(e.target.value)} className="field w-auto py-2 text-sm">
          <option value="">كل الفصول</option>
          {ctx.classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select value={subject} onChange={(e) => setSubject(e.target.value)} className="field w-auto py-2 text-sm">
          <option value="">كل المواد</option>
          {ctx.subjects.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      {q.isPending ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-40 rounded-[1.4rem]" />)}</div>
      ) : rows.length === 0 ? (
        <div className="grid place-items-center rounded-[1.4rem] border border-line bg-surface px-6 py-16 text-center">
          <span className="grid size-16 place-items-center rounded-2xl bg-ok-soft text-ok"><Icon name="check" className="size-8" /></span>
          <p className="mt-4 text-lg font-semibold">كل شيء مرصود</p>
          <p className="mt-1 text-sm text-muted">لا مهام ولا نماذج تنتظر الرصد. أنشئ مهمة أو استخدم الرصد اليدوي.</p>
          <Link href="/staff/tasks" className="btn-quiet mt-4">المهام والنماذج</Link>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r, i) => {
            const pct = r.class_size ? Math.round((r.graded / r.class_size) * 100) : 0;
            const due = r.kind === 'form' ? r.closes_at : r.due_at;
            const m = STATUS_META[r.status];
            return (
              <motion.li key={r.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 9) * 0.035 }}>
                <Link href={`/staff/grading/${r.id}`} className="group relative flex h-full flex-col overflow-hidden rounded-[1.4rem] border border-line bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-board/30 hover:shadow-[0_18px_40px_-28px_rgb(31_42_36/0.6)]">
                  <span className="absolute inset-y-0 start-0 w-1.5" style={{ background: subjectColor(subjectNames[r.subject_id] ?? '') }} />
                  <div className="flex items-start gap-3 ps-1">
                    <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${r.kind === 'form' ? 'bg-brass-soft text-brass' : 'bg-board/10 text-board'}`}>
                      <Icon name={r.kind === 'form' ? 'forms' : 'tasks'} className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 font-bold leading-snug">{r.title}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">{classNames[r.class_id]} · {subjectNames[r.subject_id]}</p>
                    </div>
                    <Badge tone={m.tone}>{m.label}</Badge>
                  </div>
                  <div className="mt-auto space-y-2 pt-4 ps-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {r.to_grade > 0 && <span className="rounded-full bg-gold/25 px-2.5 py-1 font-bold text-brass">{r.to_grade} {r.kind === 'form' ? 'إجابة للتصحيح' : 'تسليم للتصحيح'}</span>}
                      {r.kind === 'task' && r.class_size - r.graded > 0 && <span className="rounded-full bg-paper px-2.5 py-1 text-muted">{r.class_size - r.graded} بلا درجة</span>}
                      {due && <span className="ms-auto text-muted">{relTime(due)}</span>}
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-paper">
                      <div className="h-full origin-right animate-grow rounded-full bg-board" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="flex items-center justify-between text-xs text-muted">
                      <span>رُصد {r.graded} من {r.class_size}</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-board opacity-0 transition-opacity group-hover:opacity-100">ابدأ التصحيح <Icon name="chevron" className="size-3.5" /></span>
                    </p>
                  </div>
                </Link>
              </motion.li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* =====================================================================
   2) الرصد اليدوي: البيانات ← الكشف ← حفظ
   ===================================================================== */
type Meta = { title: string; description: string; classId: number | null; subject: number | null; term: number | null; evalType: number | null; max: string; date: string | null; teacher: number | null };

function MetaFields({ ctx, meta, set, lockClass }: { ctx: AuthorContext; meta: Meta; set: (p: Partial<Meta>) => void; lockClass?: boolean }) {
  const subjects = meta.classId ? ctx.subjects.filter((s) => (ctx.subjectsByClass[meta.classId!] ?? []).includes(s.value)) : ctx.subjects;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="الفصل" required>
        <select value={meta.classId ?? ''} disabled={lockClass} onChange={(e) => set({ classId: Number(e.target.value) || null, subject: null })} className="field">
          <option value="">اختر الفصل</option>
          {ctx.classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </Field>
      <Field label="المادة" required>
        <select value={meta.subject ?? ''} onChange={(e) => set({ subject: Number(e.target.value) || null })} className="field">
          <option value="">اختر المادة</option>
          {subjects.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </Field>
      <Field label="الفصل الدراسي" required>
        <select value={meta.term ?? ''} onChange={(e) => set({ term: Number(e.target.value) || null })} className="field">
          {ctx.terms.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </Field>
      <div className="sm:col-span-2 lg:col-span-3">
        <p className="label">نوع التقييم <span className="text-danger">*</span></p>
        <div className="flex flex-wrap gap-1.5">
          {ctx.evalTypes.map((e) => (
            <button key={e.value} type="button" aria-pressed={meta.evalType === e.value} onClick={() => set({ evalType: e.value, title: meta.title || e.label })} className={`rounded-full px-3.5 py-2 text-sm transition-all active:scale-95 ${meta.evalType === e.value ? 'bg-board text-chalk' : 'bg-paper hover:bg-board/10'}`}>
              {e.label}
            </button>
          ))}
        </div>
      </div>
      <Field label="اسم التقييم" required className="sm:col-span-2">
        <input value={meta.title} onChange={(e) => set({ title: e.target.value })} maxLength={200} className="field" placeholder="مثال: اختبار شفهي — سورة الملك" />
      </Field>
      <Field label="الدرجة العظمى" required>
        <input type="number" inputMode="decimal" min={0.5} step={0.5} value={meta.max} onChange={(e) => set({ max: e.target.value })} className="field tabular-nums" dir="ltr" />
      </Field>
      <Field label="تفاصيل (اختياري)" className="sm:col-span-2">
        <input value={meta.description} onChange={(e) => set({ description: e.target.value })} maxLength={2000} className="field" placeholder="الدرس، الصفحات، المعيار…" />
      </Field>
      <Field label="تاريخ الرصد">
        <DateTime value={meta.date} onChange={(v) => set({ date: v })} quick="none" allowEmpty emptyLabel="الآن" />
      </Field>
      {ctx.isAdmin && (
        <Field label="المعلم" hint="فارغ = باسمك">
          <select value={meta.teacher ?? ''} onChange={(e) => set({ teacher: Number(e.target.value) || null })} className="field">
            <option value="">باسمي</option>
            {ctx.teachers.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
      )}
    </div>
  );
}

const metaMissing = (m: Meta) =>
  [!m.classId && 'الفصل', !m.subject && 'المادة', !m.term && 'الفصل الدراسي', !m.evalType && 'نوع التقييم', !m.title.trim() && 'الاسم', !(Number(m.max) > 0) && 'الدرجة العظمى'].filter(Boolean) as string[];

const toMeta = (m: Meta) => ({
  title: m.title.trim(),
  description: m.description.trim() || null,
  subject_id: m.subject,
  term_id: m.term,
  eval_type_id: m.evalType,
  max_score: Number(m.max),
  date: m.date,
  teacher_id: m.teacher,
});

function ManualMode({ ctx }: { ctx: AuthorContext }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [meta, setMeta] = useState<Meta>({ title: '', description: '', classId: ctx.classes.length === 1 ? ctx.classes[0].value : null, subject: null, term: ctx.currentTerm, evalType: null, max: '10', date: null, teacher: null });
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (p: Partial<Meta>) => {
    setMeta((m) => ({ ...m, ...p }));
    if (p.classId !== undefined) setRoster(null);
  };
  const missing = metaMissing(meta);
  const max = Number(meta.max);
  const empty = useMemo(() => ({}), []);

  const load = async () => {
    if (missing.length) return toast(`أكمل: ${missing.join('، ')}`, 'error');
    setLoading(true);
    const r = await getRoster(meta.classId!);
    setLoading(false);
    setRoster(r);
    setTimeout(() => document.getElementById('roster')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  };

  return (
    <div className="space-y-4">
      <Section n={1} title="بيانات الرصد" lead="الأساسيات ثم اعرض كشف الطلاب">
        <MetaFields ctx={ctx} meta={meta} set={set} />
        <button type="button" onClick={load} disabled={loading} className="btn-primary w-full py-3 sm:w-auto sm:px-8">
          {loading ? <span className="spinner" /> : <Icon name="students" className="size-4" />} عرض كشف الطلاب
        </button>
      </Section>
      {roster && (
        <div id="roster" className="scroll-mt-24">
          <ManualRoster
            roster={roster}
            max={max}
            initial={empty}
            saveLabel="حفظ الكشف"
            canClear={false}
            header={
              <div className="min-w-0">
                <h3 className="truncate font-bold">{meta.title}</h3>
                <p className="text-xs text-muted">{ctx.classes.find((c) => c.value === meta.classId)?.label} · من {max}</p>
              </div>
            }
            onSave={async (rows) => {
              if (metaMissing(meta).length) {
                toast(`أكمل: ${metaMissing(meta).join('، ')}`, 'error');
                return false;
              }
              const res = await saveManual(null, toMeta(meta), meta.classId, null, rows.filter((r) => !r.clear));
              if (!res.ok) {
                toast(res.error, 'error');
                return false;
              }
              toast(res.message);
              router.push(`/staff/grading/${res.data!.id}`);
              return true;
            }}
          />
        </div>
      )}
    </div>
  );
}

/* =====================================================================
   3) رصد لطالب واحد (مشاركة، تميز، تكليف خاص…)
   ===================================================================== */
function SingleMode({ ctx }: { ctx: AuthorContext }) {
  const { toast, confirm } = useFeedback();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [student, setStudent] = useState<StudentHit | null>(null);
  const participation = ctx.evalTypes.find((e) => /مشارك/.test(e.label));
  const [meta, setMeta] = useState<Meta>({ title: participation ? 'مشاركة صفية' : '', description: '', classId: null, subject: null, term: ctx.currentTerm, evalType: participation?.value ?? null, max: '1', date: null, teacher: null });
  const [score, setScore] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const recent = useQuery({ queryKey: ['recent-single'], queryFn: recentSingle });
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (q.trim().length < 2 || student) return setHits([]);
    setSearching(true);
    const t = setTimeout(async () => {
      setHits(await searchStudents(q));
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q, student]);

  const pick = (s: StudentHit) => {
    setStudent(s);
    setQ(s.name_ar);
    setHits([]);
    const subs = ctx.subjectsByClass[s.class_id] ?? [];
    setMeta((m) => ({ ...m, classId: s.class_id, subject: m.subject && subs.includes(m.subject) ? m.subject : subs.length === 1 ? subs[0] : null }));
  };
  const max = Number(meta.max);
  const missing = [!student && 'الطالب', ...metaMissing(meta).filter((x) => x !== 'الفصل')];

  const save = async () => {
    if (missing.length) return toast(`أكمل: ${missing.join('، ')}`, 'error');
    const v = Number(score);
    if (!(v >= 0 && v <= max)) return toast(`الدرجة بين 0 و ${max}`, 'error');
    const ok = await confirm({
      title: `رصد ${v} من ${max} لـ ${student!.name_ar}؟`,
      body: <>{meta.title} · {ctx.subjects.find((s) => s.value === meta.subject)?.label}{note.trim() ? <span className="mt-1 block">✎ {note}</span> : null}<span className="mt-2 block">يظهر للطالب وحده، ولا يُضاف لبقية الفصل.</span></>,
      confirmLabel: 'رصد',
    });
    if (!ok) return;
    setBusy(true);
    const res = await saveManual(null, toMeta(meta), student!.class_id, student!.id, [{ student_id: student!.id, score: v, note: note.trim() || null }]);
    setBusy(false);
    if (!res.ok) return toast(res.error, 'error');
    toast(`${res.message}: ${student!.name_ar}`);
    setStudent(null);
    setQ('');
    setNote('');
    recent.refetch();
    setTimeout(() => box.current?.focus(), 50);
  };

  const undo = async (r: SingleRecent) => {
    const ok = await confirm({ title: 'حذف هذا الرصد؟', body: `${r.title} — ${r.student} (${Number(r.score)} من ${Number(r.max_score)})`, confirmLabel: 'حذف', danger: true, run: () => deleteManual(r.id) });
    if (!ok) return;
    recent.refetch();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Section n={1} icon="user" title="رصد لطالب واحد" lead="مشاركة، تميز، تكليف خاص… يُرصد للطالب وحده">
        <div className="relative">
          <p className="label">الطالب <span className="text-danger">*</span></p>
          <div className="relative">
            <Icon name="search" className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-4 text-muted" />
            <input ref={box} value={q} onChange={(e) => { setQ(e.target.value); setStudent(null); }} placeholder="اكتب اسم الطالب أو رقمه" className="field ps-10 text-[1.05rem]" autoComplete="off" />
            {searching && <span className="spinner absolute inset-y-0 end-3 my-auto text-board" />}
          </div>
          <AnimatePresence>
            {hits.length > 0 && (
              <motion.ul initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-2xl border border-line bg-surface p-1 shadow-[0_20px_50px_-20px_rgb(31_42_36/0.45)]">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button type="button" onClick={() => pick(h)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start hover:bg-board/[0.06]">
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
          {student && <p className="mt-1.5 text-xs text-board">✓ {student.class_label}</p>}
        </div>
        <MetaFields ctx={ctx} meta={meta} set={(p) => setMeta((m) => ({ ...m, ...p }))} lockClass />
        <div>
          <p className="label">الدرجة من {max || '—'}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input type="number" inputMode="decimal" min={0} max={max} step={0.25} value={score} onChange={(e) => setScore(e.target.value)} className="field w-28 py-3 text-center text-xl font-bold tabular-nums" dir="ltr" />
            {[max, max / 2, 0].filter((v, i, a) => a.indexOf(v) === i && v >= 0).map((v) => (
              <button key={v} type="button" onClick={() => setScore(String(Math.round(v * 100) / 100))} className={`rounded-full px-3.5 py-2 text-sm tabular-nums ${score === String(Math.round(v * 100) / 100) ? 'bg-board text-chalk' : 'bg-paper hover:bg-board/10'}`}>
                {Math.round(v * 100) / 100}
              </button>
            ))}
          </div>
        </div>
        <Field label="ملاحظة للطالب (اختياري)">
          <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} className="field" placeholder="مثال: أجاب عن سؤال التحدي" />
        </Field>
        <button type="button" onClick={save} disabled={busy} className="btn-primary w-full py-3.5 text-base">
          {busy ? <span className="spinner" /> : <Icon name="check" className="size-5" />} رصد
        </button>
      </Section>

      <aside className="rounded-[1.4rem] border border-line bg-surface">
        <h3 className="border-b border-line px-4 py-3.5 font-bold">آخر رصدك الفردي</h3>
        {recent.isPending ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-12" />)}</div>
        ) : !recent.data?.length ? (
          <p className="px-4 py-10 text-center text-sm text-muted">لا رصد فردي بعد</p>
        ) : (
          <ul className="divide-y divide-line">
            {recent.data.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.student}</span>
                  <span className="block truncate text-xs text-muted">{r.title} · {r.subject} · {relTime(r.recorded_at)}</span>
                </span>
                <span className="rounded-lg bg-ok-soft px-2 py-1 text-xs font-bold tabular-nums text-ok" dir="ltr">{Number(r.score)}/{Number(r.max_score)}</span>
                {r.can_undo && (
                  <button type="button" onClick={() => undo(r)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger" title="حذف" aria-label="حذف">
                    <Icon name="undo" className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

/* =====================================================================
   4) سجلات الرصد
   ===================================================================== */
function RecordsMode({ ctx, classNames, subjectNames }: { ctx: AuthorContext; classNames: Record<number, string>; subjectNames: Record<number, string> }) {
  const router = useRouter();
  return (
    <Registry<RecordRow>
      queryKey="grading-records"
      title="سجلات الرصد"
      fetchPage={listRecords}
      initialParams={{ sort: 'recorded' }}
      rowKey={(r) => r.id}
      onRowClick={(r) => router.push(`/staff/grading/${r.id}`)}
      searchPlaceholder="ابحث بالاسم"
      emptyTitle="لا رصد بعد"
      icon="audit"
      sorts={[
        { value: 'recorded', label: 'الأحدث رصدًا' },
        { value: 'newest', label: 'الأحدث إنشاءً' },
        { value: 'title', label: 'الاسم' },
      ]}
      filters={[
        { key: 'kind', label: 'المصدر', options: [{ value: 'manual', label: 'رصد يدوي' }, { value: 'task', label: 'مهام' }, { value: 'form', label: 'نماذج' }] },
        { key: 'class', label: 'الفصل', options: ctx.classes.map((c) => ({ value: String(c.value), label: c.label })) },
        { key: 'subject', label: 'المادة', options: ctx.subjects.map((s) => ({ value: String(s.value), label: s.label })) },
      ]}
      columns={[
        {
          key: 'title',
          label: 'التقييم',
          sort: 'title',
          render: (r) => (
            <div className="flex items-center gap-3">
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${r.kind === 'manual' ? 'bg-paper text-ink' : r.kind === 'form' ? 'bg-brass-soft text-brass' : 'bg-board/10 text-board'}`}>
                <Icon name={r.kind === 'manual' ? (r.target_student_id ? 'user' : 'edit') : r.kind === 'form' ? 'forms' : 'tasks'} className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="max-w-72 truncate font-semibold">{r.title}</p>
                <p className="truncate text-xs text-muted">
                  {r.kind === 'manual' ? (r.target_student ? `فردي · ${r.target_student}` : 'رصد يدوي') : r.kind === 'form' ? 'نموذج' : 'مهمة'} · {subjectNames[r.subject_id]}
                </p>
              </div>
            </div>
          ),
        },
        { key: 'class', label: 'الفصل', render: (r) => <span className="text-sm">{classNames[r.class_id]}</span> },
        { key: 'graded', label: 'المرصودون', render: (r) => <span className="tabular-nums">{r.graded}/{r.class_size}</span> },
        { key: 'avg', label: 'المتوسط', render: (r) => (r.avg_pct != null ? <span className={`rounded-lg px-2 py-1 text-xs font-bold tabular-nums ${r.avg_pct >= 75 ? 'bg-ok-soft text-ok' : r.avg_pct >= 50 ? 'bg-board/10 text-board' : 'bg-danger-soft text-danger'}`}>{r.avg_pct}%</span> : '—') },
        { key: 'when', label: 'آخر رصد', sort: 'recorded', render: (r) => <span className="whitespace-nowrap text-xs text-muted">{r.grades_recorded_at ? fmtFull(r.grades_recorded_at) : '—'}</span> },
      ]}
      mobileCard={(r) => (
        <div>
          <p className="truncate font-semibold">{r.title}</p>
          <p className="truncate text-xs text-muted">{classNames[r.class_id]} · {subjectNames[r.subject_id]}{r.target_student ? ` · ${r.target_student}` : ''}</p>
          <p className="mt-1 text-xs text-muted">رُصد {r.graded}/{r.class_size}{r.avg_pct != null ? ` · متوسط ${r.avg_pct}%` : ''}</p>
        </div>
      )}
    />
  );
}
