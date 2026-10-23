'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { Field } from '@/components/sheet';
import { Registry, RowButton, type RegistryHandle } from '@/components/registry/registry';
import { downloadCsv } from '@/components/registry/csv';
import type { AuthorContext } from '@/lib/assess/queries';
import {
  attendanceSummary,
  deleteSession,
  getSessionRoster,
  listSessions,
  myPeriods,
  saveAttendance,
  type Period,
  type SessionKey,
  type SessionRow,
  type SessionSummary,
} from '@/lib/conduct/actions';
import { ATT_STYLE, addDays, attKind, fmtDay, riyadhToday, type Status } from '@/lib/conduct/shared';

type Tab = 'take' | 'records' | 'absence';

export function AttendanceApp({ ctx, statuses, initialPeriods, classNames, subjectNames }: { ctx: AuthorContext; statuses: Status[]; initialPeriods: Period[]; classNames: Record<number, string>; subjectNames: Record<number, string> }) {
  const [tab, setTab] = useState<Tab>('take');
  const [session, setSession] = useState<SessionKey | null>(null);
  const open = (k: SessionKey) => {
    setSession(k);
    setTab('take');
    setTimeout(() => document.getElementById('roster')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  };
  return (
    <>
      <div className="mb-5 flex w-full rounded-2xl border border-line bg-surface p-1 sm:inline-flex sm:w-auto" role="tablist">
        {([['take', 'تحضير حصة', 'attendance'], ['records', 'السجلات', 'audit'], ['absence', 'متابعة الغياب', 'results']] as const).map(([k, l, ic]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`relative flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 py-2 text-[0.82rem] font-semibold transition-colors sm:flex-none sm:px-4 sm:text-sm ${tab === k ? 'text-chalk' : 'text-muted hover:text-ink'}`}>
            {tab === k && <motion.span layoutId="att-tab" className="absolute inset-0 rounded-xl bg-board" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <Icon name={ic} className="relative hidden size-4 sm:block" />
            <span className="relative">{l}</span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          {tab === 'take' && <TakeTab ctx={ctx} statuses={statuses} initialPeriods={initialPeriods} session={session} setSession={setSession} classNames={classNames} />}
          {tab === 'records' && <RecordsTab ctx={ctx} classNames={classNames} subjectNames={subjectNames} onOpen={open} />}
          {tab === 'absence' && <AbsenceTab ctx={ctx} />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

/* =====================================================================
   تحضير حصة: من جدول المعلم بضغطة، أو اختيار يدوي
   ===================================================================== */
function TakeTab({ ctx, statuses, initialPeriods, session, setSession, classNames }: { ctx: AuthorContext; statuses: Status[]; initialPeriods: Period[]; session: SessionKey | null; setSession: (k: SessionKey | null) => void; classNames: Record<number, string> }) {
  const today = riyadhToday();
  const [date, setDate] = useState(today);
  const periods = useQuery({ queryKey: ['periods', date], queryFn: () => myPeriods(date), initialData: date === today ? initialPeriods : undefined });
  const [manual, setManual] = useState({ classId: null as number | null, subject: null as number | null, period: 1 });
  const [showManual, setShowManual] = useState(!initialPeriods.length);
  const minDate = ctx.isAdmin ? '2020-01-01' : addDays(today, -3);
  const subjects = manual.classId ? ctx.subjects.filter((s) => (ctx.subjectsByClass[manual.classId!] ?? []).includes(s.value)) : [];
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();

  return (
    <div className="space-y-4">
      <section className="rounded-[1.4rem] border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-board/10 text-board"><Icon name="calendar" className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold">{date === today ? 'حصصي اليوم' : 'حصصي'} <span className="text-sm font-normal text-muted">· {fmtDay(date)}</span></p>
            <p className="text-xs text-muted">{ctx.isAdmin ? 'تستطيع تحضير أي يوم سابق' : 'تستطيع التحضير لليوم وحتى 3 أيام سابقة'}</p>
          </div>
          <div className="flex w-full items-center gap-1 sm:w-auto">
            <button type="button" onClick={() => setDate(addDays(date, -1))} disabled={date <= minDate} className="grid size-9 place-items-center rounded-xl border border-line hover:border-board/40 disabled:opacity-30" aria-label="اليوم السابق">
              <Icon name="chevron" className="size-4 rotate-180" />
            </button>
            <input type="date" value={date} min={minDate} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="field min-w-0 flex-1 py-1.5 tabular-nums sm:w-auto sm:flex-none" dir="ltr" />
            <button type="button" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} className="grid size-9 place-items-center rounded-xl border border-line hover:border-board/40 disabled:opacity-30" aria-label="اليوم التالي">
              <Icon name="chevron" className="size-4" />
            </button>
          </div>
        </div>

        <div className="mt-4">
          {dow > 4 ? (
            <p className="rounded-xl bg-paper px-4 py-6 text-center text-sm text-muted">عطلة نهاية الأسبوع</p>
          ) : periods.isPending ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}</div>
          ) : !periods.data?.length ? (
            <p className="rounded-xl bg-paper px-4 py-6 text-center text-sm text-muted">لا حصص لك في جدول هذا اليوم. اختر الحصة يدويًا من الأسفل.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {periods.data.map((p, i) => {
                const done = p.recorded > 0;
                const active = session && session.class_id === p.class_id && session.period_no === p.period_no && session.date === date && session.subject_id === p.subject_id;
                return (
                  <motion.li key={p.slot_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                    <button
                      type="button"
                      onClick={() => setSession({ class_id: p.class_id, subject_id: p.subject_id, period_no: p.period_no, date })}
                      className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-start transition-all hover:-translate-y-0.5 ${active ? 'border-board bg-board/[0.06] shadow-[0_0_0_3px_rgb(53_104_84/0.12)]' : 'border-line hover:border-board/40'}`}
                    >
                      <span className={`grid size-12 shrink-0 place-items-center rounded-xl text-lg font-bold ${done ? 'bg-ok-soft text-ok' : 'bg-brass-soft text-brass'}`}>{p.period_no}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{p.subject}</span>
                        <span className="block truncate text-xs text-muted">{classNames[p.class_id]}{p.starts_at ? ` · ${p.starts_at.slice(0, 5)}` : ''}</span>
                        <span className={`mt-1 inline-block text-xs font-semibold ${done ? 'text-ok' : 'text-brass'}`}>
                          {done ? `✓ حُضِّرت${p.absent ? ` · ${p.absent} غائب` : ' · لا غياب'}` : `لم تُحضَّر · ${p.students} طالب`}
                        </span>
                      </span>
                    </button>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </div>

        <button type="button" onClick={() => setShowManual((v) => !v)} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-board hover:underline">
          <Icon name="plus" className="size-4" /> حصة أخرى (اختيار يدوي)
        </button>
        <AnimatePresence>
          {showManual && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-3 grid gap-3 rounded-2xl bg-paper/60 p-3 sm:grid-cols-[1.4fr_1fr_auto_auto]">
                <Field label="الفصل">
                  <select value={manual.classId ?? ''} onChange={(e) => setManual((m) => ({ ...m, classId: Number(e.target.value) || null, subject: null }))} className="field">
                    <option value="">اختر</option>
                    {ctx.classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </Field>
                <Field label="المادة">
                  <select value={manual.subject ?? ''} onChange={(e) => setManual((m) => ({ ...m, subject: Number(e.target.value) || null }))} className="field">
                    <option value="">اختر</option>
                    {subjects.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </Field>
                <Field label="الحصة">
                  <select value={manual.period} onChange={(e) => setManual((m) => ({ ...m, period: Number(e.target.value) }))} className="field">
                    {Array.from({ length: 8 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                  </select>
                </Field>
                <div className="flex items-end">
                  <button type="button" disabled={!manual.classId || !manual.subject} onClick={() => setSession({ class_id: manual.classId!, subject_id: manual.subject, period_no: manual.period, date })} className="btn-primary w-full py-2.5">
                    عرض الكشف
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {session && <Roster key={JSON.stringify(session)} k={session} statuses={statuses} title={`${classNames[session.class_id] ?? ''} · ${ctx.subjects.find((s) => s.value === session.subject_id)?.label ?? ''}`} onClose={() => setSession(null)} onSaved={() => periods.refetch()} />}
    </div>
  );
}

function Roster({ k, statuses, title, onClose, onSaved }: { k: SessionKey; statuses: Status[]; title: string; onClose: () => void; onSaved: () => void }) {
  const { toast, confirm } = useFeedback();
  const qc = useQueryClient();
  const roster = useQuery({ queryKey: ['att-roster', k], queryFn: () => getSessionRoster(k), staleTime: 0 });
  const present = statuses.find((s) => attKind(s.name) === 'present') ?? statuses[0];
  const [state, setState] = useState<Record<number, { status: number; note: string }>>({});
  const [notes, setNotes] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const existing = (roster.data ?? []).some((r) => r.status_id != null);

  useEffect(() => {
    if (!roster.data) return;
    setState(Object.fromEntries(roster.data.map((r) => [r.id, { status: r.status_id ?? present?.id, note: r.note ?? '' }])));
    setNotes(new Set(roster.data.filter((r) => r.note).map((r) => r.id)));
  }, [roster.data, present?.id]);

  const rows = roster.data ?? [];
  const counts = useMemo(() => {
    const c: Record<number, number> = {};
    for (const r of rows) {
      const s = state[r.id]?.status;
      if (s) c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [rows, state]);
  const all = (status: number) => setState((st) => Object.fromEntries(rows.map((r) => [r.id, { ...st[r.id], status }])));

  const save = async () => {
    const summary = statuses.filter((s) => counts[s.id]).map((s) => `${s.name} ${counts[s.id]}`).join(' · ');
    const ok = await confirm({ title: existing ? 'حفظ تعديل التحضير؟' : 'حفظ التحضير؟', body: <>{fmtDay(k.date)} · الحصة {k.period_no}<span className="mt-2 block font-semibold text-ink">{summary}</span></>, confirmLabel: 'حفظ' });
    if (!ok) return;
    setBusy(true);
    const res = await saveAttendance(k, rows.map((r) => ({ student_id: r.id, status_id: state[r.id].status, note: state[r.id].note.trim() || null })));
    setBusy(false);
    if (!res.ok) return toast(res.error, 'error');
    toast(res.message);
    qc.invalidateQueries({ queryKey: ['att-roster', k] });
    qc.invalidateQueries({ queryKey: ['att-sessions'] });
    onSaved();
  };

  const remove = async () => {
    const ok = await confirm({ title: 'حذف تحضير هذه الحصة؟', body: 'تُحذف حالات كل الطلاب في هذه الحصة. للمعلم خلال 6 ساعات من التسجيل.', confirmLabel: 'حذف', danger: true, run: () => deleteSession(k) });
    if (!ok) return;
    qc.invalidateQueries({ queryKey: ['att-sessions'] });
    onSaved();
    onClose();
  };

  return (
    <motion.section id="roster" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="scroll-mt-24 rounded-[1.4rem] border border-board/25 bg-surface shadow-[0_18px_40px_-30px_rgb(53_104_84/0.8)]">
      <header className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <span className="grid size-11 place-items-center rounded-2xl bg-board text-lg font-bold text-chalk">{k.period_no}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{title}</p>
          <p className="text-xs text-muted">{fmtDay(k.date)} · الحصة {k.period_no}{existing ? ' · مُحضَّرة — تعديل' : ''}</p>
        </div>
        {existing && <button type="button" onClick={remove} className="btn-quiet px-3 py-2 text-xs text-danger">حذف التحضير</button>}
        <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-xl text-muted hover:bg-paper" aria-label="إغلاق"><Icon name="close" className="size-5" /></button>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-paper/40 px-4 py-2.5">
        <span className="text-xs font-semibold text-muted">الكل:</span>
        {statuses.map((s) => (
          <button key={s.id} type="button" onClick={() => all(s.id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-line transition-colors hover:ring-board/40 ${ATT_STYLE[attKind(s.name)].soft}`}>
            {s.name}
          </button>
        ))}
        <span className="ms-auto flex flex-wrap gap-1.5">
          {statuses.filter((s) => counts[s.id]).map((s) => (
            <span key={s.id} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${ATT_STYLE[attKind(s.name)].soft}`}>
              <span className={`size-1.5 rounded-full ${ATT_STYLE[attKind(s.name)].dot}`} />{s.name} {counts[s.id]}
            </span>
          ))}
        </span>
      </div>

      {roster.isPending ? (
        <div className="space-y-2 p-4">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-12" />)}</div>
      ) : !rows.length ? (
        <p className="px-4 py-12 text-center text-muted">لا طلاب منتظمون في هذا الفصل</p>
      ) : (
        <ol className="divide-y divide-line">
          {rows.map((r, i) => {
            const cur = state[r.id];
            const kind = cur ? attKind(statuses.find((s) => s.id === cur.status)?.name ?? '') : 'present';
            return (
              <li key={r.id} className={`px-4 py-2.5 transition-colors ${kind === 'absent' ? 'bg-danger-soft/30' : kind === 'late' ? 'bg-brass-soft/30' : ''}`}>
                <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  <span className="hidden w-6 text-center text-xs tabular-nums text-muted sm:block">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.name_ar}</span>
                    <span className="text-xs text-muted"><bdi>{r.code}</bdi>{cur?.note && !notes.has(r.id) ? ` · ✎ ${cur.note}` : ''}</span>
                  </span>
                  <span className="flex w-full gap-1 sm:w-auto" role="radiogroup" aria-label={`حالة ${r.name_ar}`}>
                    {statuses.map((s) => {
                      const on = cur?.status === s.id;
                      const st = ATT_STYLE[attKind(s.name)];
                      return (
                        <button
                          key={s.id}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => setState((x) => ({ ...x, [r.id]: { ...x[r.id], status: s.id } }))}
                          className={`flex-1 rounded-xl border px-2.5 py-2 text-xs font-bold transition-all active:scale-95 sm:flex-none sm:px-3 ${on ? st.on : 'border-line bg-surface text-muted hover:border-muted'}`}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                    <button type="button" onClick={() => setNotes((n) => { const x = new Set(n); if (x.has(r.id)) x.delete(r.id); else x.add(r.id); return x; })} className={`grid size-9 shrink-0 place-items-center rounded-xl ${cur?.note ? 'text-board' : 'text-muted'} hover:bg-board/10`} aria-label="ملاحظة">
                      <Icon name="edit" className="size-4" />
                    </button>
                  </span>
                </div>
                {notes.has(r.id) && (
                  <input value={cur?.note ?? ''} onChange={(e) => setState((x) => ({ ...x, [r.id]: { ...x[r.id], note: e.target.value.slice(0, 300) } }))} placeholder="ملاحظة (عذر، خروج مبكر…)" className="field mt-2 py-2 text-sm" />
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 rounded-b-[1.4rem] border-t border-line bg-surface/95 p-3 backdrop-blur lg:bottom-0">
        <button type="button" onClick={save} disabled={busy || !rows.length} className="btn-primary w-full py-3 text-base">
          {busy ? <span className="spinner" /> : <Icon name="check" className="size-5" />} {existing ? 'حفظ التعديل' : 'حفظ التحضير'}
        </button>
      </div>
    </motion.section>
  );
}

/* =====================================================================
   السجلات
   ===================================================================== */
function RecordsTab({ ctx, classNames, subjectNames, onOpen }: { ctx: AuthorContext; classNames: Record<number, string>; subjectNames: Record<number, string>; onOpen: (k: SessionKey) => void }) {
  const { toast, confirm } = useFeedback();
  const ref = useRef<RegistryHandle>(null);
  const key = (r: SessionSummary): SessionKey => ({ class_id: r.class_id, subject_id: r.subject_id, period_no: r.period_no, date: r.occurred_on });
  const remove = async (r: SessionSummary) => {
    const ok = await confirm({ title: 'حذف تحضير هذه الحصة؟', body: `${classNames[r.class_id]} · ${fmtDay(r.occurred_on)} · الحصة ${r.period_no}`, confirmLabel: 'حذف', danger: true, run: () => deleteSession(key(r)) });
    if (!ok) return;
    ref.current?.invalidate();
  };
  return (
    <Registry<SessionSummary>
      ref={ref}
      queryKey="att-sessions"
      title="سجلات التحضير"
      fetchPage={listSessions}
      rowKey={(r) => `${r.class_id}-${r.occurred_on}-${r.period_no}-${r.subject_id}`}
      onRowClick={(r) => onOpen(key(r))}
      emptyTitle="لا تحضير بعد"
      icon="attendance"
      sorts={[{ value: 'date', label: 'الأحدث' }]}
      filters={[
        { key: 'class', label: 'الفصل', options: ctx.classes.map((c) => ({ value: String(c.value), label: c.label })) },
        { key: 'mine', label: 'المسجّل', options: [{ value: '1', label: 'ما سجّلته أنا' }] },
      ]}
      columns={[
        { key: 'date', label: 'اليوم', render: (r) => <span className="whitespace-nowrap font-semibold">{fmtDay(r.occurred_on)}</span> },
        { key: 'period', label: 'الحصة', render: (r) => <span className="grid size-8 place-items-center rounded-lg bg-board/10 font-bold text-board">{r.period_no}</span> },
        { key: 'class', label: 'الفصل والمادة', render: (r) => <span className="text-sm">{classNames[r.class_id]}<span className="block text-xs text-muted">{r.subject ?? (r.subject_id ? subjectNames[r.subject_id] : '—')}</span></span> },
        {
          key: 'counts',
          label: 'الحالات',
          render: (r) => (
            <span className="flex flex-wrap gap-1 text-xs font-bold tabular-nums">
              <span className="rounded-full bg-ok-soft px-2 py-0.5 text-ok">{r.present} حاضر</span>
              {r.absent > 0 && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-danger">{r.absent} غائب</span>}
              {r.late > 0 && <span className="rounded-full bg-brass-soft px-2 py-0.5 text-brass">{r.late} متأخر</span>}
              {r.excused > 0 && <span className="rounded-full bg-[#e1eef3] px-2 py-0.5 text-[#2a6f8a]">{r.excused} مستأذن</span>}
            </span>
          ),
        },
        { key: 'by', label: 'المسجّل', render: (r) => <span className="text-xs text-muted">{r.recorder ?? '—'}{r.edited ? ' · معدّل' : ''}</span> },
      ]}
      rowActions={(r) => <RowButton icon="trash" label="حذف" tone="danger" onClick={() => remove(r)} />}
      mobileCard={(r) => (
        <div>
          <p className="font-semibold">{fmtDay(r.occurred_on)} · الحصة {r.period_no}</p>
          <p className="text-xs text-muted">{classNames[r.class_id]} · {r.subject ?? ''}</p>
          <p className="mt-1 text-xs font-semibold"><span className="text-ok">{r.present} حاضر</span>{r.absent ? <span className="text-danger"> · {r.absent} غائب</span> : null}{r.late ? <span className="text-brass"> · {r.late} متأخر</span> : null}</p>
        </div>
      )}
    />
  );
}

/* =====================================================================
   متابعة الغياب
   ===================================================================== */
function AbsenceTab({ ctx }: { ctx: AuthorContext }) {
  const [classId, setClassId] = useState<number | null>(ctx.classes[0]?.value ?? null);
  const [term, setTerm] = useState<number | null>(ctx.currentTerm);
  const q = useQuery({ queryKey: ['absence', classId, term], queryFn: () => attendanceSummary(classId!, term!), enabled: !!classId && !!term });
  const rows = q.data ?? [];
  const risky = rows.filter((r) => r.pct != null && r.pct < 85).length;
  return (
    <section className="rounded-[1.4rem] border border-line bg-surface">
      <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
        <Field label="الفصل" className="min-w-52 flex-1">
          <select value={classId ?? ''} onChange={(e) => setClassId(Number(e.target.value) || null)} className="field">
            {ctx.classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="الفصل الدراسي" className="min-w-40">
          <select value={term ?? ''} onChange={(e) => setTerm(Number(e.target.value) || null)} className="field">
            {ctx.terms.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <button
          type="button"
          disabled={!rows.length}
          onClick={() => downloadCsv('متابعة-الغياب', ['رقم الطالب', 'الاسم', 'الحصص', 'غياب', 'تأخر', 'استئذان', 'نسبة الحضور', 'آخر غياب'], rows.map((r) => [r.code, r.name_ar, r.total, r.absent, r.late, r.excused, r.pct != null ? `${r.pct}%` : '', r.last_absent ?? '']))}
          className="btn-quiet"
        >
          <Icon name="download" className="size-4" /> تصدير
        </button>
      </div>
      <p className="px-4 pt-3 text-xs text-muted">النسبة = (الحصص − الغياب − ربع التأخر) ÷ الحصص. الحاضر والمستأذن لا يُخصم منهما.{risky ? <span className="font-semibold text-danger"> · {risky} طالب تحت 85%</span> : ''}</p>
      {q.isPending && classId ? (
        <div className="space-y-2 p-4">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-12" />)}</div>
      ) : (
        <ol className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.student_id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{r.name_ar}</span>
                <span className="text-xs text-muted"><bdi>{r.code}</bdi> · {r.total} حصة{r.last_absent ? ` · آخر غياب ${fmtDay(r.last_absent)}` : ''}</span>
              </span>
              <span className="flex gap-1 text-xs font-bold tabular-nums">
                {r.absent > 0 && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-danger">{r.absent} غياب</span>}
                {r.late > 0 && <span className="rounded-full bg-brass-soft px-2 py-0.5 text-brass">{r.late} تأخر</span>}
                {r.excused > 0 && <span className="rounded-full bg-[#e1eef3] px-2 py-0.5 text-[#2a6f8a]">{r.excused} استئذان</span>}
              </span>
              <span className="w-full sm:w-44">
                {r.pct == null ? (
                  <span className="text-xs text-muted">لا تحضير بعد</span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-paper">
                      <span className={`block h-full origin-right animate-grow rounded-full ${r.pct >= 95 ? 'bg-ok' : r.pct >= 85 ? 'bg-board' : r.pct >= 75 ? 'bg-gold' : 'bg-danger'}`} style={{ width: `${r.pct}%` }} />
                    </span>
                    <span className={`w-11 text-end text-sm font-bold tabular-nums ${r.pct < 85 ? 'text-danger' : ''}`}>{r.pct}%</span>
                  </span>
                )}
              </span>
            </li>
          ))}
          {!rows.length && !q.isPending && <li className="px-4 py-12 text-center text-muted">لا طلاب</li>}
        </ol>
      )}
    </section>
  );
}
