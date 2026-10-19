'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { Sheet } from '@/components/sheet';
import type { GradeRowInput } from '@/lib/assess/actions';

export type RosterEntry = { id: number; code: string; name_ar: string };
type Cell = { score: string; note: string };

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * كشف الرصد: درجة وملاحظة لكل طالب.
 * Enter ينقل للطالب التالي، ولصق عمود من Excel يملأ الكشف بالترتيب أو برقم الطالب.
 */
export function ManualRoster({
  roster,
  max,
  initial,
  saveLabel = 'حفظ الرصد',
  onSave,
  canClear = true,
  header,
}: {
  roster: RosterEntry[];
  max: number;
  initial: Record<number, { score: number | null; note: string | null }>;
  saveLabel?: string;
  onSave: (rows: GradeRowInput[]) => Promise<boolean>;
  canClear?: boolean;
  header?: React.ReactNode;
}) {
  const { toast, confirm } = useFeedback();
  const base = useMemo(
    () => Object.fromEntries(roster.map((s) => [s.id, { score: initial[s.id]?.score != null ? String(initial[s.id].score) : '', note: initial[s.id]?.note ?? '' }])) as Record<number, Cell>,
    [roster, initial],
  );
  const [cells, setCells] = useState<Record<number, Cell>>(base);
  const [notes, setNotes] = useState<Set<number>>(() => new Set(roster.filter((s) => initial[s.id]?.note).map((s) => s.id)));
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState(false);
  const [q, setQ] = useState('');
  const refs = useRef<Record<number, HTMLInputElement | null>>({});

  useEffect(() => setCells(base), [base]);

  const changed = roster.filter((s) => cells[s.id] && (cells[s.id].score !== base[s.id].score || cells[s.id].note.trim() !== base[s.id].note.trim()));
  const invalid = changed.filter((s) => cells[s.id].score !== '' && !(Number(cells[s.id].score) >= 0 && Number(cells[s.id].score) <= max));
  const filled = roster.filter((s) => cells[s.id]?.score !== '' && cells[s.id]?.score != null);
  const avg = filled.length ? filled.reduce((a, s) => a + Number(cells[s.id].score || 0), 0) / filled.length : null;

  useEffect(() => {
    if (!changed.length) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [changed.length]);

  const set = (id: number, patch: Partial<Cell>) => setCells((c) => ({ ...c, [id]: { ...c[id], ...patch } }));
  const shown = roster.filter((s) => !q.trim() || s.name_ar.includes(q.trim()) || s.code.includes(q.trim()));

  const save = async () => {
    if (invalid.length) return toast(`الدرجة بين 0 و ${max}`, 'error');
    if (!changed.length) return toast('لا تعديلات', 'info');
    const cleared = changed.filter((s) => cells[s.id].score === '' && base[s.id].score !== '');
    const ok = await confirm({
      title: `${saveLabel} — ${changed.length} طالب؟`,
      body: (
        <>
          {filled.length} من {roster.length} مرصودون{avg != null ? ` · المتوسط ${round(avg)} من ${max}` : ''}.
          {cleared.length > 0 && <span className="mt-2 block text-danger">ستُمسح درجة {cleared.length} طالب (الخانة فارغة).</span>}
          <span className="mt-2 block">تظهر الدرجات والملاحظات للطلاب فورًا.</span>
        </>
      ),
      confirmLabel: saveLabel,
    });
    if (!ok) return;
    setBusy(true);
    const rows: GradeRowInput[] = changed.map((s) => {
      const c = cells[s.id];
      if (c.score === '' && base[s.id].score !== '') return { student_id: s.id, clear: true };
      return { student_id: s.id, score: c.score === '' ? null : Number(c.score), note: c.note.trim() || null };
    });
    const res = await onSave(rows);
    setBusy(false);
    if (res) setNotes((n) => new Set(n));
  };

  const fill = (v: string, onlyEmpty: boolean) => {
    setCells((c) => {
      const n = { ...c };
      for (const s of roster) if (!onlyEmpty || n[s.id].score === '') n[s.id] = { ...n[s.id], score: v };
      return n;
    });
  };

  const applyPaste = (text: string) => {
    const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
    const byCode = lines.every((l) => /[\t,;]/.test(l));
    let n = 0;
    setCells((c) => {
      const next = { ...c };
      if (byCode) {
        for (const l of lines) {
          const [code, score] = l.split(/[\t,;]/).map((x) => x.trim());
          const st = roster.find((s) => s.code === code || s.name_ar === code);
          if (st && score !== undefined && !Number.isNaN(Number(score.replace('٫', '.')))) {
            next[st.id] = { ...next[st.id], score: String(Number(score.replace('٫', '.'))) };
            n++;
          }
        }
      } else {
        lines.forEach((l, i) => {
          const st = roster[i];
          const v = Number(l.replace('٫', '.').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))));
          if (st && !Number.isNaN(v)) {
            next[st.id] = { ...next[st.id], score: String(v) };
            n++;
          }
        });
      }
      return next;
    });
    toast(n ? `لُصقت ${n} درجة — راجعها ثم احفظ` : 'لم أتعرف على درجات في النص', n ? 'ok' : 'error');
    setPaste(false);
  };

  return (
    <section className="rounded-[1.4rem] border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
        {header ?? <h3 className="font-bold">كشف الرصد</h3>}
        <span className="rounded-full bg-board/10 px-2.5 py-1 text-xs font-semibold tabular-nums text-board">
          {filled.length}/{roster.length} مرصود{avg != null ? ` · متوسط ${round(avg)}` : ''}
        </span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن طالب" className="field ms-auto w-full py-2 sm:w-48" />
      </div>
      <div className="flex flex-wrap gap-1.5 border-b border-line bg-paper/40 px-4 py-2.5">
        <button type="button" onClick={() => fill(String(max), true)} className="rounded-full bg-surface px-3 py-1.5 text-xs font-semibold ring-1 ring-line hover:ring-board/40">الدرجة الكاملة للفارغين</button>
        <button type="button" onClick={() => fill('0', true)} className="rounded-full bg-surface px-3 py-1.5 text-xs font-semibold ring-1 ring-line hover:ring-board/40">صفر للفارغين</button>
        <button type="button" onClick={() => setPaste(true)} className="rounded-full bg-surface px-3 py-1.5 text-xs font-semibold ring-1 ring-line hover:ring-board/40">
          لصق من Excel
        </button>
        {canClear && (
          <button type="button" onClick={() => setCells(base)} disabled={!changed.length} className="ms-auto rounded-full px-3 py-1.5 text-xs font-semibold text-muted hover:text-danger disabled:opacity-40">
            تراجع عن التعديلات
          </button>
        )}
      </div>

      <ol className="divide-y divide-line">
        {shown.map((s, i) => {
          const c = cells[s.id] ?? { score: '', note: '' };
          const bad = c.score !== '' && !(Number(c.score) >= 0 && Number(c.score) <= max);
          const dirty = c.score !== base[s.id]?.score || c.note.trim() !== (base[s.id]?.note ?? '').trim();
          const pct = c.score !== '' && !bad ? Number(c.score) / max : null;
          const noteOpen = notes.has(s.id);
          return (
            <li key={s.id} className={`px-4 py-2.5 transition-colors ${dirty ? 'bg-brass-soft/25' : ''}`}>
              <div className="flex items-center gap-3">
                <span className="hidden w-6 shrink-0 text-center text-xs tabular-nums text-muted sm:block">{roster.indexOf(s) + 1}</span>
                <span className={`hidden size-9 shrink-0 place-items-center rounded-full text-sm font-bold sm:grid ${pct == null ? 'bg-paper text-muted' : pct >= 0.85 ? 'bg-ok-soft text-ok' : pct >= 0.5 ? 'bg-board/10 text-board' : 'bg-danger-soft text-danger'}`}>
                  {s.name_ar.trim().charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 font-semibold leading-snug sm:line-clamp-1">{s.name_ar}</span>
                  <span className="text-xs text-muted"><bdi>{s.code}</bdi>{c.note && !noteOpen ? ` · ✎ ${c.note}` : ''}</span>
                </span>
                <span className="hidden gap-1 sm:flex">
                  <button type="button" tabIndex={-1} onClick={() => set(s.id, { score: String(max) })} className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-ok-soft hover:text-ok">كاملة</button>
                  <button type="button" tabIndex={-1} onClick={() => set(s.id, { score: '0' })} className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-danger-soft hover:text-danger">صفر</button>
                </span>
                <input
                  ref={(el) => {
                    refs.current[s.id] = el;
                  }}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={max}
                  step={0.25}
                  value={c.score}
                  onChange={(e) => set(s.id, { score: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      const nx = shown[i + 1];
                      if (nx) refs.current[nx.id]?.focus();
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      const pv = shown[i - 1];
                      if (pv) refs.current[pv.id]?.focus();
                    }
                  }}
                  onFocus={(e) => e.target.select()}
                  className={`h-10 w-[4.5rem] shrink-0 rounded-xl border bg-surface text-center text-base font-bold tabular-nums focus:outline-none focus:ring-4 ${bad ? 'border-danger text-danger focus:ring-danger/15' : dirty ? 'border-gold focus:ring-gold/20' : 'border-line focus:border-board focus:ring-gold/20'}`}
                  dir="ltr"
                  aria-label={`درجة ${s.name_ar}`}
                />
                <span className="hidden w-9 text-xs tabular-nums text-muted sm:block">/ {max}</span>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setNotes((n) => { const x = new Set(n); if (x.has(s.id)) x.delete(s.id); else x.add(s.id); return x; })}
                  className={`grid size-9 shrink-0 place-items-center rounded-lg transition-colors ${c.note ? 'text-board' : 'text-muted'} hover:bg-board/10`}
                  title="ملاحظة"
                  aria-label="ملاحظة"
                >
                  <Icon name="edit" className="size-4" />
                </button>
              </div>
              <AnimatePresence initial={false}>
                {noteOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="flex gap-2 pb-1 pe-1 pt-2 sm:ps-[4.25rem]">
                      <input value={c.note} onChange={(e) => set(s.id, { note: e.target.value.slice(0, 500) })} placeholder="ملاحظة تظهر للطالب مع درجته" className="field py-2 text-sm" />
                    </div>
                    <div className="flex flex-wrap gap-1 pb-1 sm:ps-[4.25rem]">
                      {['أحسنت', 'متميز', 'يحتاج متابعة', 'لم يحضر', 'أعاد المحاولة'].map((t) => (
                        <button key={t} type="button" onClick={() => set(s.id, { note: t })} className="rounded-full bg-paper px-2.5 py-0.5 text-[0.7rem] hover:bg-board/10">{t}</button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
        {roster.length === 0 && <li className="px-4 py-12 text-center text-muted">لا طلاب منتظمون في هذا الفصل</li>}
      </ol>

      <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-surface/95 p-3 backdrop-blur lg:bottom-0 rounded-b-[1.4rem]">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-xs text-muted">
            {invalid.length ? <span className="text-danger">{invalid.length} درجة خارج المدى (0–{max})</span> : changed.length ? `${changed.length} تعديل غير محفوظ` : 'Enter للانتقال للطالب التالي'}
          </span>
          <button type="button" onClick={save} disabled={busy || !changed.length} className="btn-primary px-6">
            {busy ? <span className="spinner" /> : <Icon name="check" className="size-4" />} {saveLabel}
          </button>
        </div>
      </div>

      <PasteSheet open={paste} onClose={() => setPaste(false)} onApply={applyPaste} />
    </section>
  );
}

function PasteSheet({ open, onClose, onApply }: { open: boolean; onClose: () => void; onApply: (t: string) => void }) {
  const [text, setText] = useState('');
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="لصق الدرجات من Excel"
      footer={
        <button type="button" onClick={() => { onApply(text); setText(''); }} disabled={!text.trim()} className="btn-primary w-full py-3">
          تطبيق على الكشف
        </button>
      }
    >
      <p className="mb-3 text-sm leading-relaxed text-muted">
        انسخ <b className="text-ink">عمود الدرجات</b> من Excel بنفس ترتيب الكشف والصقه هنا، أو انسخ عمودين: <b className="text-ink">رقم الطالب ثم الدرجة</b>.
      </p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} className="field font-mono" dir="ltr" placeholder={'9\n7.5\n10\n…'} />
    </Sheet>
  );
}
