'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '@/components/shell/icons';
import { Field, Sheet } from '@/components/sheet';
import { useFeedback } from '@/components/feedback';
import { subjectColor } from '@/components/timetable-grid';
import { DAYS, fmtDate, fmtHijri, fmtShortDate, fmtTime, fmtWeekday } from '@/lib/format';
import {
  deleteCalendarEntry,
  deleteExam,
  deleteSlot,
  getCalendar,
  getExams,
  getScheduleLookups,
  getTimetable,
  saveCalendarEntry,
  saveExam,
  saveSlot,
  type CalendarEntry,
  type Exam,
  type ScheduleLookups,
  type Slot,
} from '@/lib/schedule/actions';
import type { ActionResult } from '@/components/registry/types';
import { SettingsCard } from './editors';

/* ---------------------------------------------------------------------
   مشترك
--------------------------------------------------------------------- */
function useLookups() {
  return useQuery({ queryKey: ['schedule-lookups'], queryFn: () => getScheduleLookups(), staleTime: 5 * 60_000 });
}

/** حفظ أو حذف بتأكيد، ثم تنبيه، ثم تحديث القائمة المعنية فقط */
function useMutate(key: unknown[]) {
  const { toast, confirm } = useFeedback();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<ActionResult>, ask: { title: string; body?: React.ReactNode; confirmLabel?: string; danger?: boolean }, after?: () => void) => {
    if (!(await confirm({ confirmLabel: 'حفظ', ...ask }))) return;
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return toast(r.error, 'error');
    toast(r.message);
    after?.();
    qc.invalidateQueries({ queryKey: key });
  };
  return { busy, run };
}

function LoadingRows({ n = 5 }: { n?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: n }, (_, i) => <div key={i} className="skeleton h-14 w-full rounded-xl" style={{ opacity: 1 - i * 0.13 }} />)}
    </div>
  );
}

function SheetFooter({ busy, onCancel, onSave, onDelete, isNew }: { busy: boolean; onCancel: () => void; onSave: () => void; onDelete?: () => void; isNew: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {!isNew && onDelete && (
        <button type="button" onClick={onDelete} className="btn-danger me-auto rounded-xl">
          <Icon name="trash" className="size-4" /> حذف
        </button>
      )}
      <button type="button" onClick={onCancel} className={`btn-quiet rounded-xl ${isNew ? 'ms-auto' : ''}`}>إلغاء</button>
      <button type="button" onClick={onSave} disabled={busy} className="btn-primary min-w-28 rounded-xl">
        {busy ? <span className="spinner" /> : isNew ? 'إضافة' : 'حفظ'}
      </button>
    </div>
  );
}

const COLORS = ['', '#356854', '#d9a441', '#a3462f', '#2a6f8a', '#7a4b8c'];

/* =====================================================================
   التقويم الدراسي
   ===================================================================== */
export function CalendarEditor() {
  const lookups = useLookups();
  const [termId, setTermId] = useState<number | null>(null);
  useEffect(() => {
    if (!termId && lookups.data?.terms.length) setTermId(lookups.data.terms[lookups.data.terms.length - 1].id);
  }, [lookups.data, termId]);
  const key = ['calendar', termId];
  const entries = useQuery({ queryKey: key, queryFn: () => getCalendar(termId!), enabled: !!termId });
  const [form, setForm] = useState<(Omit<CalendarEntry, 'id'> & { id: number | null }) | null>(null);
  const { busy, run } = useMutate(['calendar']);

  const blank = (): Omit<CalendarEntry, 'id'> & { id: null } => {
    const last = entries.data?.[entries.data.length - 1];
    const start = last ? new Date(new Date(last.ends_on).getTime() + 3 * 864e5) : new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return { id: null, term_id: termId!, week_label: `الأسبوع ${(entries.data?.filter((e) => !e.event).length ?? 0) + 1}`, period_label: null, starts_on: iso(start), ends_on: iso(new Date(start.getTime() + 4 * 864e5)), event: null, color: null };
  };

  const save = () =>
    form &&
    run(
      () => saveCalendarEntry(form.id, form),
      { title: form.id ? 'حفظ تعديل التقويم؟' : 'إضافة إلى التقويم؟', body: `${form.week_label ?? form.event} · ${fmtShortDate(form.starts_on)} ← ${fmtShortDate(form.ends_on)}` },
      () => setForm(null),
    );
  const remove = () =>
    form?.id &&
    run(() => deleteCalendarEntry(form.id!), { title: 'حذف من التقويم؟', body: form.week_label ?? form.event, confirmLabel: 'حذف', danger: true }, () => setForm(null));

  return (
    <SettingsCard
      title="التقويم الدراسي"
      description="أسابيع كل فصل دراسي ومناسباته. الأسبوع الحالي في الموقع كله يُحسب من هنا."
      footer={
        <button type="button" disabled={!termId} onClick={() => setForm(blank())} className="btn-primary rounded-xl">
          <Icon name="plus" className="size-4" /> إضافة أسبوع أو مناسبة
        </button>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {lookups.isPending ? <div className="skeleton h-9 w-60 rounded-full" /> : lookups.data?.terms.map((t) => (
          <button key={t.id} type="button" onClick={() => setTermId(t.id)} aria-pressed={t.id === termId}
            className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${t.id === termId ? 'bg-board text-chalk' : 'bg-paper hover:bg-board/10'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {entries.isPending ? (
        <LoadingRows />
      ) : !entries.data?.length ? (
        <p className="rounded-2xl border border-dashed border-line py-10 text-center text-sm text-muted">لا أسابيع في هذا الفصل الدراسي بعد.</p>
      ) : (
        <ol className="space-y-2">
          {entries.data.map((e, i) => (
            <motion.li key={e.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.02 }}>
              <button type="button" onClick={() => setForm({ ...e })} className="flex w-full items-center gap-3 rounded-2xl border border-line px-4 py-3 text-start transition-colors hover:border-board/30 hover:bg-board/[0.03]">
                <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: e.color || (e.event ? '#a3462f' : '#356854') }} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    {e.week_label ?? e.event}
                    {e.period_label && <span className="ms-2 text-sm font-normal text-muted">{e.period_label}</span>}
                  </span>
                  <span className="block text-sm text-muted">
                    {fmtShortDate(e.starts_on)} ← {fmtShortDate(e.ends_on)} <span className="text-xs">({fmtHijri(e.starts_on)})</span>
                  </span>
                </span>
                {e.event && e.week_label && <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-xs text-danger">{e.event}</span>}
                <Icon name="edit" className="size-4 text-muted" />
              </button>
            </motion.li>
          ))}
        </ol>
      )}

      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.id ? 'تعديل في التقويم' : 'إضافة إلى التقويم'} subtitle={lookups.data?.terms.find((t) => t.id === form?.term_id)?.label}
        footer={form && <SheetFooter busy={busy} isNew={!form.id} onCancel={() => setForm(null)} onSave={save} onDelete={remove} />}>
        {form && (
          <div className="space-y-4">
            <Field label="اسم الأسبوع" hint="مثل: الأسبوع الأول. اتركه فارغًا إن كانت مناسبة فقط.">
              <input value={form.week_label ?? ''} onChange={(e) => setForm({ ...form, week_label: e.target.value })} className="field" />
            </Field>
            <Field label="الفترة (اختياري)" hint="مثل: الفترة الأولى">
              <input value={form.period_label ?? ''} onChange={(e) => setForm({ ...form, period_label: e.target.value })} className="field" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="من" required><input type="date" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} className="field" /></Field>
              <Field label="إلى" required><input type="date" value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} className="field" /></Field>
            </div>
            <p className="text-xs text-muted">{form.starts_on && `${fmtWeekday(form.starts_on)} ${fmtHijri(form.starts_on)}`} {form.ends_on && `← ${fmtWeekday(form.ends_on)} ${fmtHijri(form.ends_on)}`}</p>
            <Field label="مناسبة أو إجازة (اختياري)" hint="مثل: إجازة اليوم الوطني">
              <input value={form.event ?? ''} onChange={(e) => setForm({ ...form, event: e.target.value })} className="field" />
            </Field>
            <Field label="اللون">
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button key={c || 'none'} type="button" onClick={() => setForm({ ...form, color: c || null })} aria-label={c || 'بلا لون'}
                    className={`size-9 rounded-full ring-2 ring-offset-2 transition-transform active:scale-90 ${(form.color ?? '') === c ? 'ring-board' : 'ring-transparent'}`}
                    style={{ background: c || 'repeating-linear-gradient(45deg,#eee 0 4px,#fff 4px 8px)' }} />
                ))}
              </div>
            </Field>
          </div>
        )}
      </Sheet>
    </SettingsCard>
  );
}

/* =====================================================================
   جدول الحصص: شبكة أيام × حصص قابلة للتعديل بالضغط
   ===================================================================== */
export function TimetableEditor() {
  const lookups = useLookups();
  const [classId, setClassId] = useState<number | null>(null);
  useEffect(() => {
    if (!classId && lookups.data?.classes.length) setClassId(lookups.data.classes[0].id);
  }, [lookups.data, classId]);
  const key = ['timetable', classId];
  const slots = useQuery({ queryKey: key, queryFn: () => getTimetable(classId!), enabled: !!classId });
  const [form, setForm] = useState<(Omit<Slot, 'id'> & { id: number | null }) | null>(null);
  const { busy, run } = useMutate(['timetable']);
  const L = lookups.data;
  const periods = Math.max(7, ...(slots.data ?? []).map((s) => s.period_no));
  const subjectName = (id: number) => L?.subjects.find((s) => s.id === id)?.name ?? '—';
  const teacherName = (id: number | null) => (id ? L?.teachers.find((t) => t.id === id)?.name ?? '' : '');
  const classSubjects = useMemo(() => {
    const ids = new Set((L?.matrix ?? []).filter((m) => m.class_id === classId).map((m) => m.subject_id));
    return (L?.subjects ?? []).filter((s) => ids.size === 0 || ids.has(s.id));
  }, [L, classId]);
  const teachersFor = (subjectId: number) => {
    const t = L?.teachers ?? [];
    const match = t.filter((x) => x.subjects.includes(subjectId));
    return match.length ? [...match, ...t.filter((x) => !x.subjects.includes(subjectId))] : t;
  };
  const startOf = (p: number) => slots.data?.find((s) => s.period_no === p && s.starts_at)?.starts_at ?? null;

  const open = (day: number, period: number, slot?: Slot) =>
    setForm(slot ? { ...slot } : { id: null, class_id: classId!, subject_id: classSubjects[0]?.id ?? 0, teacher_id: null, day_of_week: day, period_no: period, starts_at: startOf(period), delivery_mode: L?.modes[0] ?? null });

  const save = () =>
    form &&
    run(() => saveSlot(form.id, form), { title: form.id ? 'حفظ تعديل الحصة؟' : 'إضافة الحصة؟', body: `${DAYS[form.day_of_week]} · الحصة ${form.period_no} · ${subjectName(form.subject_id)}` }, () => setForm(null));
  const remove = () =>
    form?.id && run(() => deleteSlot(form.id!), { title: 'حذف الحصة؟', body: `${DAYS[form.day_of_week]} · الحصة ${form.period_no} · ${subjectName(form.subject_id)}`, confirmLabel: 'حذف', danger: true }, () => setForm(null));

  return (
    <SettingsCard title="جدول الحصص" description="اضغط على أي خانة لإضافة حصة أو تعديلها. المعلمون المسندة إليهم المادة يظهرون أولًا.">
      {lookups.isPending ? <div className="skeleton h-12 w-full rounded-xl" /> : (
        <select value={classId ?? ''} onChange={(e) => setClassId(Number(e.target.value))} className="field" aria-label="الفصل">
          {L?.classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      )}
      {slots.isPending ? <LoadingRows n={5} /> : (
        <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
          <table className="w-full border-separate border-spacing-1.5 text-sm" style={{ minWidth: 90 + periods * 110 }}>
            <thead>
              <tr>
                <th className="w-20" />
                {Array.from({ length: periods }, (_, p) => (
                  <th key={p} className="px-1 pb-1 text-center text-xs font-semibold text-muted">
                    الحصة {p + 1}
                    {startOf(p + 1) && <span className="block font-normal">{fmtTime(startOf(p + 1))}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day, d) => (
                <tr key={day}>
                  <th className="text-start font-semibold">{day}</th>
                  {Array.from({ length: periods }, (_, p) => {
                    const cell = (slots.data ?? []).filter((s) => s.day_of_week === d && s.period_no === p + 1);
                    return (
                      <td key={p} className="align-top">
                        <div className="space-y-1">
                          {cell.map((s) => {
                            const c = subjectColor(subjectName(s.subject_id));
                            return (
                              <button key={s.id} type="button" onClick={() => open(d, p + 1, s)} className="block w-full rounded-xl px-2 py-1.5 text-start leading-tight transition-transform hover:-translate-y-0.5" style={{ background: `${c}16`, boxShadow: `inset -3px 0 0 ${c}` }}>
                                <span className="block truncate text-[0.8rem] font-semibold" style={{ color: c }}>{subjectName(s.subject_id)}</span>
                                <span className="block truncate text-[0.7rem] text-muted">{teacherName(s.teacher_id) || 'بلا معلم'}</span>
                              </button>
                            );
                          })}
                          <button type="button" onClick={() => open(d, p + 1)} aria-label={`إضافة حصة ${day} ${p + 1}`}
                            className={`grid w-full place-items-center rounded-xl border border-dashed border-line text-muted transition-colors hover:border-board/50 hover:bg-board/5 hover:text-board ${cell.length ? 'h-6' : 'h-14'}`}>
                            <Icon name="plus" className="size-4" />
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.id ? 'تعديل حصة' : 'إضافة حصة'} subtitle={form ? `${DAYS[form.day_of_week]} · الحصة ${form.period_no} · ${L?.classes.find((c) => c.id === form.class_id)?.label ?? ''}` : undefined}
        footer={form && <SheetFooter busy={busy} isNew={!form.id} onCancel={() => setForm(null)} onSave={save} onDelete={remove} />}>
        {form && L && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="اليوم">
                <select value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: Number(e.target.value) })} className="field">
                  {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </Field>
              <Field label="رقم الحصة">
                <select value={form.period_no} onChange={(e) => setForm({ ...form, period_no: Number(e.target.value) })} className="field">
                  {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                </select>
              </Field>
            </div>
            <Field label="المادة" required hint={classSubjects.length !== L.subjects.length ? 'المواد الموزّعة على هذا الفصل.' : undefined}>
              <select value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: Number(e.target.value) })} className="field">
                {classSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="المعلم">
              <select value={form.teacher_id ?? ''} onChange={(e) => setForm({ ...form, teacher_id: Number(e.target.value) || null })} className="field">
                <option value="">بلا معلم</option>
                {teachersFor(form.subject_id).map((t) => <option key={t.id} value={t.id}>{t.name}{t.subjects.includes(form.subject_id) ? ' ✓' : ''}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="وقت البداية">
                <input type="time" value={form.starts_at?.slice(0, 5) ?? ''} onChange={(e) => setForm({ ...form, starts_at: e.target.value || null })} className="field" />
              </Field>
              <Field label="نوع الحضور">
                <input list="modes" value={form.delivery_mode ?? ''} onChange={(e) => setForm({ ...form, delivery_mode: e.target.value })} className="field" placeholder="مثل: حضوري" />
                <datalist id="modes">{L.modes.map((m) => <option key={m} value={m} />)}</datalist>
              </Field>
            </div>
          </div>
        )}
      </Sheet>
    </SettingsCard>
  );
}

/* =====================================================================
   جدول الاختبارات
   ===================================================================== */
export function ExamsEditor() {
  const lookups = useLookups();
  const [classId, setClassId] = useState<number | null>(null);
  const key = ['exams', classId];
  const exams = useQuery({ queryKey: key, queryFn: () => getExams(classId) });
  const [form, setForm] = useState<(Omit<Exam, 'id'> & { id: number | null }) | null>(null);
  const { busy, run } = useMutate(['exams']);
  const L = lookups.data;
  const subjectName = (id: number) => L?.subjects.find((s) => s.id === id)?.name ?? '—';
  const className = (id: number) => L?.classes.find((c) => c.id === id)?.label ?? '—';
  const days = [...new Set((exams.data ?? []).map((e) => e.exam_date))];

  const blank = () =>
    setForm({ id: null, class_id: classId ?? L?.classes[0]?.id ?? 0, subject_id: L?.subjects[0]?.id ?? 0, teacher_id: null, term_id: L?.terms[L.terms.length - 1]?.id ?? null, exam_date: new Date().toISOString().slice(0, 10), starts_at: '08:00', exam_period: null });
  const save = () =>
    form && run(() => saveExam(form.id, form), { title: form.id ? 'حفظ تعديل الاختبار؟' : 'إضافة الاختبار؟', body: `${subjectName(form.subject_id)} · ${className(form.class_id)} · ${fmtDate(form.exam_date)}` }, () => setForm(null));
  const remove = () =>
    form?.id && run(() => deleteExam(form.id!), { title: 'حذف الاختبار؟', body: `${subjectName(form.subject_id)} · ${fmtDate(form.exam_date)}`, confirmLabel: 'حذف', danger: true }, () => setForm(null));

  return (
    <SettingsCard
      title="جدول الاختبارات"
      description="مواعيد الاختبارات لكل فصل. إظهاره للطلاب والمعلمين من قسم (ما يراه الطلاب)."
      footer={<button type="button" disabled={!L} onClick={blank} className="btn-primary rounded-xl"><Icon name="plus" className="size-4" /> إضافة اختبار</button>}
    >
      <select value={classId ?? ''} onChange={(e) => setClassId(Number(e.target.value) || null)} className="field" aria-label="الفصل">
        <option value="">كل الفصول</option>
        {L?.classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      {exams.isPending || lookups.isPending ? <LoadingRows /> : !days.length ? (
        <p className="rounded-2xl border border-dashed border-line py-10 text-center text-sm text-muted">لا اختبارات مسجّلة.</p>
      ) : (
        <div className="space-y-5">
          <AnimatePresence initial={false}>
            {days.map((d) => (
              <motion.section key={d} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <p className="mb-2 text-sm font-semibold">{fmtWeekday(d)} <span className="font-normal text-muted">{fmtDate(d)} · {fmtHijri(d)}</span></p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {(exams.data ?? []).filter((e) => e.exam_date === d).map((e) => {
                    const c = subjectColor(subjectName(e.subject_id));
                    return (
                      <li key={e.id}>
                        <button type="button" onClick={() => setForm({ ...e })} className="w-full rounded-2xl border border-line p-3.5 text-start transition-colors hover:border-board/30" style={{ boxShadow: `inset -3px 0 0 ${c}` }}>
                          <span className="block font-semibold">{subjectName(e.subject_id)}</span>
                          <span className="block text-sm text-muted">{className(e.class_id)}</span>
                          <span className="mt-1 block text-xs text-muted">{fmtTime(e.starts_at)}{e.exam_period ? ` · ${e.exam_period}` : ''}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </motion.section>
            ))}
          </AnimatePresence>
        </div>
      )}

      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.id ? 'تعديل اختبار' : 'إضافة اختبار'}
        footer={form && <SheetFooter busy={busy} isNew={!form.id} onCancel={() => setForm(null)} onSave={save} onDelete={remove} />}>
        {form && L && (
          <div className="space-y-4">
            <Field label="الفصل" required>
              <select value={form.class_id} onChange={(e) => setForm({ ...form, class_id: Number(e.target.value) })} className="field">
                {L.classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="المادة" required>
              <select value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: Number(e.target.value) })} className="field">
                {L.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="التاريخ" required><input type="date" value={form.exam_date} onChange={(e) => setForm({ ...form, exam_date: e.target.value })} className="field" /></Field>
              <Field label="الوقت"><input type="time" value={form.starts_at?.slice(0, 5) ?? ''} onChange={(e) => setForm({ ...form, starts_at: e.target.value || null })} className="field" /></Field>
            </div>
            <Field label="الفترة (اختياري)" hint="مثل: الفترة الأولى، اختبار نهائي">
              <input value={form.exam_period ?? ''} onChange={(e) => setForm({ ...form, exam_period: e.target.value })} className="field" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="المعلم">
                <select value={form.teacher_id ?? ''} onChange={(e) => setForm({ ...form, teacher_id: Number(e.target.value) || null })} className="field">
                  <option value="">—</option>
                  {L.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="الفصل الدراسي">
                <select value={form.term_id ?? ''} onChange={(e) => setForm({ ...form, term_id: Number(e.target.value) || null })} className="field">
                  <option value="">—</option>
                  {L.terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </Field>
            </div>
          </div>
        )}
      </Sheet>
    </SettingsCard>
  );
}

export type { ScheduleLookups };
