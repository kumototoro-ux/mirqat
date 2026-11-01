'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { searchStudents, type StudentHit } from '@/lib/assess/grading-actions';
import { deleteImprovement, improvementPreview, improvementState, listImprovements, saveImprovement, type ImpRow, type ImpType } from '@/lib/assess/improvement-actions';
import type { AuthorContext } from '@/lib/assess/queries';

/* =====================================================================
   تحسين درجة الطالب: الطالب ← المادة والفصل الدراسي ← نوع التقييم ← درجة التحسين وسببه
   الرصد الأصلي لا يتغير؛ يُطبّق التحسين على درجة النوع بقواعد ثابتة، وبحد تحسينين لكل مادة
   ===================================================================== */

const fmt = (n: number | null | undefined) => (n == null ? '—' : String(Math.round(Number(n) * 100) / 100));
const when = (iso: string) => new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Riyadh' }).format(new Date(iso));

function band(cur: number, w: number) {
  const p = w > 0 ? cur / w : 1;
  if (p < 0.5) return { tone: 'text-danger bg-danger/10', text: 'دون نصف الوزن: يُرفع بنسبة التحسين × الوزن، حتى نصف الوزن كحد أعلى' };
  if (p < 0.99) return { tone: 'text-board bg-board/10', text: 'بين النصف و99%: يُضاف 20% من الوزن × نسبة التحسين' };
  return { tone: 'text-ok bg-ok-soft', text: 'مرتفعة (99% فأكثر): لا تحتاج تحسينًا' };
}

export function ImproveMode({ ctx }: { ctx: AuthorContext }) {
  const { toast, confirm } = useFeedback();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [student, setStudent] = useState<StudentHit | null>(null);
  const [subject, setSubject] = useState<number | null>(null);
  const [term, setTerm] = useState<number | null>(ctx.currentTerm ?? (ctx.terms[0]?.value as number | undefined) ?? null);
  const [type, setType] = useState<ImpType | null>(null);
  const [max, setMax] = useState('10');
  const [earned, setEarned] = useState('');
  const [reason, setReason] = useState('');
  const [after, setAfter] = useState<number | null>(null);
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

  const subs = student ? ctx.subjectsByClass[student.class_id] ?? [] : [];
  const state = useQuery({
    queryKey: ['imp-state', student?.id, subject, term],
    queryFn: () => improvementState(student!.id, subject!, term!),
    enabled: !!student && !!subject && !!term,
  });
  const st = state.data?.ok ? state.data.data : null;
  const remaining = st ? Math.max(0, st.max - st.used) : 0;

  // المعاينة الحية: الدرجة قبل وبعد
  const e = Number(earned);
  const m = Number(max);
  const valid = !!type && m > 0 && earned !== '' && e >= 0 && e <= m;
  useEffect(() => {
    setAfter(null);
    if (!valid || !student || !subject || !term || !type) return;
    const t = setTimeout(async () => {
      const r = await improvementPreview(student.id, subject, term, type.eval_type_id, e, m);
      if (r.ok) setAfter(Number(r.data.after));
    }, 250);
    return () => clearTimeout(t);
  }, [valid, e, m, student, subject, term, type]);

  const pick = (s: StudentHit) => {
    setStudent(s);
    setQ(s.name_ar);
    setHits([]);
    const list = ctx.subjectsByClass[s.class_id] ?? [];
    setSubject(list.length === 1 ? list[0] : null);
    setType(null);
  };
  const resetForm = () => {
    setType(null);
    setEarned('');
    setReason('');
    setAfter(null);
  };

  const list = useQuery({ queryKey: ['imp-list'], queryFn: () => listImprovements('') });

  const save = async () => {
    if (!student || !subject || !term || !type) return;
    if (!valid) return toast(`الدرجة المستحقة بين 0 و ${m}`, 'error');
    if (!reason.trim()) return toast('اكتب سبب التحسين', 'error');
    const subjName = ctx.subjects.find((x) => x.value === subject)?.label ?? '';
    await confirm({
      title: `تحسين «${type.name}» لـ ${student.name_ar}؟`,
      body: (
        <>
          {subjName} · من <b className="tabular-nums">{fmt(type.current)}</b> إلى <b className="tabular-nums text-ok">{fmt(after)}</b> من {fmt(type.weight)}.
          <span className="mt-1 block text-xs">يُستخدم {st ? st.used + 1 : 1} من تحسينين لهذه المادة في هذا الفصل الدراسي. الرصد الأصلي لا يتغير.</span>
        </>
      ),
      confirmLabel: 'حفظ التحسين',
      run: async () => {
        const r = await saveImprovement({ student_id: student.id, subject_id: subject, term_id: term, eval_type_id: type.eval_type_id, earned: e, max: m, reason: reason.trim() });
        if (!r.ok) return r;
        resetForm();
        void state.refetch();
        void list.refetch();
        return { ok: true, message: r.message };
      },
    });
  };

  const remove = async (r: ImpRow) => {
    const ok = await confirm({
      title: 'حذف هذا التحسين؟',
      body: `${r.student} · ${r.subject} · ${r.type} (${fmt(r.before)} ← ${fmt(r.after)})`,
      confirmLabel: 'حذف',
      danger: true,
      run: () => deleteImprovement(r.id),
    });
    if (ok) {
      void list.refetch();
      void state.refetch();
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="space-y-5 rounded-[1.4rem] border border-line bg-surface p-4 sm:p-5">
        <header className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brass-soft text-brass"><Icon name="sparkle" className="size-6" /></span>
          <div>
            <h2 className="text-lg font-bold">تحسين درجة الطالب</h2>
            <p className="text-sm text-muted">يُضاف على درجة نوع التقييم دون المساس بالرصد الأصلي — تحسينان فقط لكل مادة في الفصل الدراسي، ولا تحسين للاختبار النهائي.</p>
          </div>
        </header>

        {/* 1) الطالب */}
        <div className="relative">
          <p className="label">الطالب <span className="text-danger">*</span></p>
          <div className="relative">
            <Icon name="search" className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-4 text-muted" />
            <input ref={box} value={q} onChange={(ev) => { setQ(ev.target.value); setStudent(null); setType(null); }} placeholder="اكتب اسم الطالب أو رقمه" className="field ps-10 text-[1.05rem]" autoComplete="off" />
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
                        <span className="block text-xs text-muted">{h.code} · {h.class_label}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>

        {/* 2) المادة والفصل الدراسي */}
        {student && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div>
              <p className="label">المادة <span className="text-danger">*</span></p>
              {subs.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {subs.map((id) => (
                    <button key={id} type="button" onClick={() => { setSubject(id); setType(null); }} className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${subject === id ? 'bg-board font-semibold text-chalk' : 'bg-paper hover:bg-board/10'}`}>
                      {ctx.subjects.find((x) => x.value === id)?.label ?? id}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">لا مواد ضمن صلاحيتك لفصل هذا الطالب.</p>
              )}
            </div>
            {ctx.terms.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {ctx.terms.map((t) => (
                  <button key={t.value} type="button" onClick={() => { setTerm(Number(t.value)); setType(null); }} className={`rounded-full px-3 py-1 text-xs transition-colors ${term === t.value ? 'bg-ink font-semibold text-chalk' : 'bg-paper hover:bg-board/10'}`}>{t.label}</button>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* 3) الأنواع ودرجاتها الحالية */}
        {student && subject && term && (
          state.isLoading ? (
            <div className="grid gap-2 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-paper" />)}</div>
          ) : !st ? (
            <p className="rounded-2xl bg-danger/10 px-3 py-2 text-sm text-danger">{state.data && !state.data.ok ? state.data.error : 'تعذّر التحميل'}</p>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <div className={`flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm ${remaining ? 'bg-paper' : 'bg-danger/10 text-danger'}`}>
                <div className="flex gap-1">{Array.from({ length: st.max }, (_, i) => <span key={i} className={`h-2 w-8 rounded-full ${i < st.used ? 'bg-gold' : 'bg-line'}`} />)}</div>
                <span>{remaining ? <>استُخدم <b>{st.used}</b> من {st.max} — متبقٍ <b>{remaining}</b></> : 'استُنفد الحد: تحسينان لهذه المادة في هذا الفصل الدراسي'}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {st.types.map((t) => {
                  const pct = t.weight > 0 ? Math.min(100, (Number(t.current) / Number(t.weight)) * 100) : 0;
                  const done = pct >= 99;
                  const on = type?.eval_type_id === t.eval_type_id;
                  return (
                    <button key={t.eval_type_id} type="button" disabled={done || !remaining} onClick={() => { setType(t); setAfter(null); }}
                      className={`rounded-2xl border p-3 text-start transition-all disabled:opacity-55 ${on ? 'border-board bg-board/5 ring-2 ring-board/20' : 'border-line hover:border-board/40'}`}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{t.name}</span>
                        <span className="text-xs tabular-nums text-muted" dir="ltr"><b className="text-ink">{fmt(t.current)}</b> / {fmt(t.weight)}</span>
                      </span>
                      <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-paper">
                        <motion.span className={`block h-full rounded-full ${pct < 50 ? 'bg-danger' : pct < 99 ? 'bg-board' : 'bg-ok'}`} initial={{ width: 0 }} animate={{ width: `${pct}%` }} />
                      </span>
                      <span className="mt-1 block text-[0.7rem] text-muted">{done ? 'مكتمل — لا يحتاج تحسينًا' : t.base == null ? 'لم يُرصد بعد' : `${Math.round(pct)}% من الوزن`}</span>
                    </button>
                  );
                })}
                {!st.types.length && <p className="text-sm text-muted">لا أنواع تقييم قابلة للتحسين في توزيع درجات هذه المادة.</p>}
              </div>
            </motion.div>
          )
        )}

        {/* 4) التحسين */}
        <AnimatePresence>
          {type && st && remaining > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="space-y-3 rounded-2xl border border-gold/40 bg-brass-soft/30 p-4">
                <p className={`rounded-xl px-3 py-2 text-xs font-semibold ${band(Number(type.current), Number(type.weight)).tone}`}>{band(Number(type.current), Number(type.weight)).text}</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="label">الدرجة المستحقة <span className="text-danger">*</span></span>
                    <input value={earned} onChange={(ev) => setEarned(ev.target.value)} inputMode="decimal" className="field text-center text-lg tabular-nums" dir="ltr" placeholder="0" />
                  </label>
                  <label className="block">
                    <span className="label">من (الدرجة العظمى)</span>
                    <input value={max} onChange={(ev) => setMax(ev.target.value)} inputMode="decimal" className="field text-center text-lg tabular-nums" dir="ltr" />
                  </label>
                </div>
                <label className="block">
                  <span className="label">سبب التحسين <span className="text-danger">*</span></span>
                  <textarea value={reason} onChange={(ev) => setReason(ev.target.value.slice(0, 300))} rows={2} className="field" placeholder="مثال: أعاد الاختبار القصير بعد مراجعة الدرس" />
                </label>
                <div className="flex items-center justify-center gap-4 rounded-2xl bg-surface px-4 py-3">
                  <span className="text-center"><span className="block text-xs text-muted">الآن</span><b className="text-xl tabular-nums" dir="ltr">{fmt(type.current)}</b></span>
                  <Icon name="chevron" className="size-5 rotate-180 text-muted" />
                  <span className="text-center">
                    <span className="block text-xs text-muted">بعد التحسين</span>
                    <motion.b key={after ?? 'x'} initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`text-xl tabular-nums ${after != null && after > Number(type.current) ? 'text-ok' : 'text-muted'}`} dir="ltr">{after == null ? '—' : fmt(after)}</motion.b>
                  </span>
                  <span className="text-xs text-muted">من {fmt(type.weight)}</span>
                  {after != null && after > Number(type.current) && <span className="rounded-full bg-ok-soft px-2 py-0.5 text-xs font-bold text-ok tabular-nums" dir="ltr">+{fmt(after - Number(type.current))}</span>}
                </div>
                {after != null && !(after > Number(type.current)) && valid && <p className="text-xs text-brass">هذا التحسين لن يضيف شيئًا، فلن يُحفظ (حتى لا يستهلك أحد التحسينين).</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={save} disabled={!valid || !reason.trim() || after == null || !(after > Number(type.current))} className="btn-primary flex-1"><Icon name="check" className="size-4" /> حفظ التحسين</button>
                  <button type="button" onClick={resetForm} className="btn-quiet">إلغاء</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {st && st.history.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted">تحسينات هذه المادة في الفصل الدراسي</p>
            <ul className="space-y-1.5">
              {st.history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-paper px-3 py-2 text-xs">
                  <b>{h.type}</b>
                  <span className="tabular-nums" dir="ltr">{fmt(h.before)} → {fmt(h.after)}</span>
                  <span className="text-muted">({fmt(h.earned)} من {fmt(h.max)})</span>
                  <span className="min-w-0 flex-1 truncate text-muted">{h.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* السجل */}
      <aside className="rounded-[1.4rem] border border-line bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 font-bold"><Icon name="audit" className="size-4 text-muted" /> {ctx.isAdmin ? 'كل التحسينات' : 'تحسيناتي'}</h3>
        {list.isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-paper" />)}</div>
        ) : !list.data?.rows.length ? (
          <p className="py-8 text-center text-sm text-muted">لا تحسينات بعد</p>
        ) : (
          <ul className="space-y-2">
            {list.data.rows.map((r, i) => (
              <motion.li key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }} className="rounded-xl border border-line p-2.5 text-xs">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{r.student}</p>
                    <p className="text-muted">{r.subject} · {r.type} · {r.term}</p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-ok-soft px-1.5 py-0.5 font-bold tabular-nums text-ok" dir="ltr">{fmt(r.before)}→{fmt(r.after)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-muted">{r.reason}</p>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-muted">
                  <span>{when(r.at)}{r.teacher ? ` · ${r.teacher}` : ''}</span>
                  {r.can_delete && (
                    <button type="button" onClick={() => remove(r)} className="rounded-md px-1.5 py-0.5 text-danger hover:bg-danger/10" aria-label="حذف"><Icon name="trash" className="size-3.5" /></button>
                  )}
                </div>
              </motion.li>
            ))}
          </ul>
        )}
        {list.data && list.data.total > list.data.rows.length && <p className="mt-2 text-center text-xs text-muted">آخر {list.data.rows.length} من {list.data.total}</p>}
      </aside>
    </div>
  );
}
