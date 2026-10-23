'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { Field, Sheet } from '@/components/sheet';
import { gradeTask } from '@/lib/assess/actions';
import { deleteManual, saveManual } from '@/lib/assess/grading-actions';
import type { AuthorContext, ManualDetail } from '@/lib/assess/queries';
import { ManualRoster } from './manual-roster';
import { DateTime, fmtFull } from './kit';

export function ManualEdit({ m, ctx }: { m: ManualDetail; ctx: AuthorContext }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(m.title);
  const [description, setDescription] = useState(m.description ?? '');
  const [max, setMax] = useState(String(m.max_score));
  const [evalType, setEvalType] = useState(m.eval_type_id);
  const [date, setDate] = useState<string | null>(m.date);
  const [busy, setBusy] = useState(false);
  const initial = useMemo(() => Object.fromEntries(m.grades.map((g) => [g.student_id, { score: g.score, note: g.note }])), [m.grades]);
  const single = m.target_student_id != null;

  const saveMeta = async () => {
    setBusy(true);
    const res = await saveManual(m.id, { title, description: description || null, subject_id: m.subject_id, term_id: m.term_id, eval_type_id: evalType, max_score: Number(max), date }, null, null, []);
    setBusy(false);
    if (!res.ok) return toast(res.error, 'error');
    toast('حُفظت البيانات');
    setEditing(false);
    router.refresh();
  };

  const remove = async () => {
    const ok = await confirm({ title: 'حذف هذا الرصد كاملًا؟', body: <><b className="text-ink">{m.title}</b> — تُحذف درجات {m.grades.length} طالب. للمعلم خلال 6 ساعات فقط، والإداري دائمًا.</>, confirmLabel: 'حذف', danger: true, run: () => deleteManual(m.id) });
    if (!ok) return;
    router.push('/staff/grading?mode=records');
  };

  return (
    <>
      <Link href="/staff/grading?mode=records" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-board">
        <Icon name="chevron" className="size-4 rotate-180" /> سجلات الرصد
      </Link>
      <section className="mb-4 flex flex-wrap items-start gap-4 rounded-[1.6rem] border border-line bg-surface p-5">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-paper text-ink">
          <Icon name={single ? 'user' : 'edit'} className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">{single ? 'رصد لطالب واحد' : 'رصد يدوي'} · {m.subject}{m.eval_type ? ` · ${m.eval_type}` : ''}</p>
          <h1 className="mt-1 text-[1.45rem] font-bold leading-snug">{m.title}</h1>
          <p className="mt-1 text-sm text-muted">{m.class_label}{m.teacher ? ` · ${m.teacher}` : ''}</p>
          <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
            <span className="rounded-full bg-paper px-3 py-1">من {m.max_score}</span>
            {m.date && <span className="rounded-full bg-paper px-3 py-1">{fmtFull(m.date)}</span>}
            {m.description && <span className="rounded-full bg-paper px-3 py-1">{m.description}</span>}
          </div>
        </div>
        {m.canEdit && (
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(true)} className="btn-quiet"><Icon name="edit" className="size-4" /> البيانات</button>
            <button type="button" onClick={remove} className="btn-quiet px-3 text-danger" aria-label="حذف"><Icon name="trash" className="size-4" /></button>
          </div>
        )}
      </section>

      <ManualRoster
        roster={m.roster}
        max={m.max_score}
        initial={initial}
        onSave={async (rows) => {
          const res = await gradeTask(m.id, rows);
          if (!res.ok) {
            toast(res.error, 'error');
            return false;
          }
          toast(res.message);
          router.refresh();
          return true;
        }}
      />

      <Sheet
        open={editing}
        onClose={() => setEditing(false)}
        title="بيانات الرصد"
        footer={
          <button type="button" onClick={saveMeta} disabled={busy} className="btn-primary w-full py-3">
            {busy ? <span className="spinner" /> : <Icon name="check" className="size-4" />} حفظ
          </button>
        }
      >
        <div className="space-y-4">
          <Field label="الاسم" required><input value={title} onChange={(e) => setTitle(e.target.value)} className="field" /></Field>
          <Field label="تفاصيل"><input value={description} onChange={(e) => setDescription(e.target.value)} className="field" /></Field>
          <Field label="نوع التقييم">
            <select value={evalType ?? ''} onChange={(e) => setEvalType(Number(e.target.value) || null)} className="field">
              {ctx.evalTypes.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </Field>
          <Field label="الدرجة العظمى" hint="لا يمكن تخفيضها تحت درجة مرصودة"><input type="number" min={0.5} step={0.5} value={max} onChange={(e) => setMax(e.target.value)} className="field tabular-nums" dir="ltr" /></Field>
          <Field label="تاريخ الرصد"><DateTime value={date} onChange={setDate} quick="none" /></Field>
        </div>
      </Sheet>
    </>
  );
}
