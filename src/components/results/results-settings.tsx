'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { Field, Sheet } from '@/components/sheet';
import { SettingsCard, Switch } from '@/components/settings/editors';
import { deleteGrant, saveGrant, saveLabels, saveNotice, type Grant } from '@/lib/results/actions';
import { SECTIONS, type NoticeSettings, type Section } from '@/lib/results/shared';
import { StudentPicker } from './student-picker';
import type { RefData } from './results-admin';

/* =====================================================================
   إعدادات النتائج: أقسام الإشعار والأسماء الإنجليزية، الانتساب ومنح المواظبة، نص الإشعار
   ===================================================================== */

export function ResultsSettings({ ref_, grants, notice }: { ref_: RefData; grants: Grant[]; notice: NoticeSettings }) {
  return (
    <div className="space-y-5">
      <EvalSections ref_={ref_} />
      <SubjectNames ref_={ref_} />
      <Intisab ref_={ref_} grants={grants} />
      <NoticeText notice={notice} />
    </div>
  );
}

function useRun() {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [pending, setPending] = useState(false);
  const run = async (fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>, c: { title: string; body: React.ReactNode; confirmLabel?: string; danger?: boolean }) => {
    const ok = await confirm({
      confirmLabel: 'حفظ',
      ...c,
      run: async () => {
        setPending(true);
        try {
          return await fn();
        } finally {
          setPending(false);
        }
      },
    });
    if (!ok) return false;
    router.refresh();
    return true;
  };
  return { pending, run };
}

function SaveBtn({ pending, dirty, onClick }: { pending: boolean; dirty: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={pending || !dirty} className="btn-primary ms-auto rounded-xl">
      {pending ? <span className="spinner" /> : <Icon name="check" className="size-4" />} حفظ
    </button>
  );
}

/* ------------------------- أنواع التقييم وأقسامها ------------------------- */
function EvalSections({ ref_ }: { ref_: RefData }) {
  const init = () => Object.fromEntries(ref_.evalTypes.map((e) => [e.id, { name_en: e.name_en ?? '', report_section: e.report_section }]));
  const [v, setV] = useState<Record<number, { name_en: string; report_section: Section }>>(init);
  const { pending, run } = useRun();
  const dirty = JSON.stringify(v) !== JSON.stringify(init());
  return (
    <SettingsCard
      title="أقسام إشعار الدرجات"
      description="كل نوع تقييم يُجمع في قسم من أقسام الإشعار الثلاثة، باسمه العربي والإنجليزي."
      footer={<SaveBtn pending={pending} dirty={dirty} onClick={() => run(() => saveLabels({ subjects: [], branches: [], eval_types: Object.entries(v).map(([id, x]) => ({ id: Number(id), ...x })) }), { title: 'حفظ أقسام الإشعار؟', body: 'تُعاد حسبة أقسام كل الإشعارات والكشوف فورًا.' })} />}
    >
      <div className="grid gap-2 sm:grid-cols-3">
        {SECTIONS.map((s) => (
          <div key={s.key} className="rounded-xl bg-paper px-3 py-2.5">
            <p className="text-sm font-bold">{s.ar}</p>
            <p className="text-xs text-muted" dir="ltr" style={{ textAlign: 'right' }}>{s.en}</p>
            <p className="mt-1 text-[0.72rem] leading-relaxed text-muted">{s.hint}</p>
          </div>
        ))}
      </div>
      <ul className="divide-y divide-line">
        {ref_.evalTypes.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-2 py-2.5">
            <span className="min-w-28 flex-1 font-medium">{e.name}</span>
            <input value={v[e.id]?.name_en ?? ''} onChange={(ev) => setV((x) => ({ ...x, [e.id]: { ...x[e.id], name_en: ev.target.value.slice(0, 60) } }))} placeholder="English name" dir="ltr" className="field w-full py-2 sm:w-48" />
            <div className="flex w-full rounded-xl border border-line p-0.5 text-xs sm:w-auto">
              {SECTIONS.map((s) => (
                <button key={s.key} type="button" onClick={() => setV((x) => ({ ...x, [e.id]: { ...x[e.id], report_section: s.key } }))} className={`flex-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 transition-colors ${v[e.id]?.report_section === s.key ? 'bg-board text-chalk' : 'text-muted hover:text-ink'}`}>
                  {s.key === 'term_work' ? 'أعمال الترم' : s.key === 'quizzes' ? 'القصيرة' : 'النهائي'}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}

/* ------------------------- أسماء المواد بالإنجليزية ------------------------- */
function SubjectNames({ ref_ }: { ref_: RefData }) {
  const init = () => Object.fromEntries(ref_.subjects.map((s) => [s.id, s.name_en ?? '']));
  const [v, setV] = useState<Record<number, string>>(init);
  const { pending, run } = useRun();
  const dirty = JSON.stringify(v) !== JSON.stringify(init());
  const missing = ref_.subjects.filter((s) => !v[s.id]?.trim()).length;
  return (
    <SettingsCard
      title="أسماء المواد بالإنجليزية"
      description="تظهر تحت اسم المادة في الإشعار وملف Excel."
      footer={
        <>
          {missing > 0 && <span className="rounded-full bg-brass-soft px-3 py-1 text-xs font-semibold text-brass">{missing} بلا اسم إنجليزي</span>}
          <SaveBtn pending={pending} dirty={dirty} onClick={() => run(() => saveLabels({ eval_types: [], branches: [], subjects: Object.entries(v).map(([id, name_en]) => ({ id: Number(id), name_en })) }), { title: 'حفظ أسماء المواد؟', body: 'تظهر في كل الإشعارات فورًا.' })} />
        </>
      }
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {ref_.subjects.map((s) => (
          <label key={s.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
            <input value={v[s.id] ?? ''} onChange={(e) => setV((x) => ({ ...x, [s.id]: e.target.value.slice(0, 60) }))} placeholder="English" dir="ltr" className={`field w-40 py-1.5 text-sm ${v[s.id]?.trim() ? '' : 'border-gold/60'}`} />
          </label>
        ))}
      </div>
    </SettingsCard>
  );
}

/* ------------------------- الانتساب ومنح المواظبة ------------------------- */
function Intisab({ ref_, grants }: { ref_: RefData; grants: Grant[] }) {
  const { pending, run } = useRun();
  const [adding, setAdding] = useState(false);
  const termName = (id: number | null) => (id == null ? 'كل الفصول الدراسية' : ref_.terms.find((t) => t.id === id)?.name ?? '');
  const toggle = (b: RefData['branches'][number], on: boolean) =>
    run(() => saveLabels({ subjects: [], eval_types: [], branches: [{ id: b.id, is_intisab: on }] }), {
      title: on ? `جعل "${b.name}" فرع انتساب؟` : `إلغاء الانتساب عن "${b.name}"؟`,
      body: on ? 'طلابه لا تُحسب لهم مواظبة، ويظهر في إشعارهم "طالب منتسب" إلا من مُنح المواظبة.' : 'تُحسب مواظبة طلابه من التحضير كبقية الفروع.',
    });
  const remove = (g: Grant) => run(() => deleteGrant(g.id), { title: `إلغاء منح المواظبة لـ ${g.student?.name_ar ?? 'الطالب'}؟`, body: 'يعود إشعاره لعرض "طالب منتسب".', confirmLabel: 'إلغاء المنح', danger: true });

  return (
    <SettingsCard title="طلاب الانتساب والمواظبة" description="فروع الانتساب لا تُحسب لطلابها مواظبة. إن طلب الطالب احتسابها تمنحه الإدارة درجتها من هنا.">
      <ul className="space-y-1.5">
        {ref_.branches.map((b) => (
          <li key={b.id} className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5">
            <span className="min-w-0 flex-1 font-medium">{b.name}</span>
            {b.is_intisab && <span className="rounded-full bg-brass-soft px-2.5 py-0.5 text-xs font-semibold text-brass">انتساب</span>}
            <Switch checked={b.is_intisab} onChange={(on) => toggle(b, on)} label={`فرع انتساب: ${b.name}`} disabled={pending} />
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="font-semibold">منح المواظبة <span className="text-sm font-normal text-muted">({grants.length})</span></p>
        <button type="button" onClick={() => setAdding(true)} className="btn-quiet px-3 py-2 text-sm"><Icon name="plus" className="size-4" /> منح لطالب</button>
      </div>
      {grants.length ? (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {grants.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-2 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{g.student?.name_ar ?? '—'} <bdi className="text-xs text-muted">{g.student?.code}</bdi></p>
                <p className="text-xs text-muted">{termName(g.term_id)}{g.note ? ` · ${g.note}` : ''}</p>
              </div>
              <span className="rounded-full bg-ok-soft px-2.5 py-1 text-sm font-bold tabular-nums text-ok" dir="ltr">{Number(g.score)}%</span>
              <button type="button" onClick={() => remove(g)} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger" aria-label="إلغاء المنح"><Icon name="trash" className="size-4" /></button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-line px-3 py-5 text-center text-sm text-muted">لا منح حتى الآن.</p>
      )}
      {adding && <GrantSheet ref_={ref_} onClose={() => setAdding(false)} />}
    </SettingsCard>
  );
}

function GrantSheet({ ref_, onClose }: { ref_: RefData; onClose: () => void }) {
  const [open, setOpen] = useState(true);
  const [student, setStudent] = useState<number[]>([]);
  const [term, setTerm] = useState<number | null>(ref_.terms.find((t) => t.is_current)?.id ?? null);
  const [score, setScore] = useState('100');
  const [note, setNote] = useState('بطلب الطالب');
  const { pending, run } = useRun();
  const close = () => { setOpen(false); setTimeout(onClose, 200); };
  const save = async () => {
    const s = Number(score);
    if (!student.length) return;
    const ok = await run(() => saveGrant(student[0], term, s, note.trim() || null), {
      title: 'منح درجة المواظبة؟',
      body: `تُحتسب مواظبة ${s}% في ${term == null ? 'كل الفصول الدراسية' : ref_.terms.find((t) => t.id === term)?.name}، بدل "طالب منتسب".`,
      confirmLabel: 'منح',
    });
    if (ok) close();
  };
  return (
    <Sheet open={open} onClose={close} title="منح درجة المواظبة" subtitle="لطالب منتسب طلب احتساب مواظبته" footer={
      <button type="button" onClick={save} disabled={pending || !student.length || !(Number(score) >= 0 && Number(score) <= 100)} className="btn-primary w-full py-3">
        {pending ? <span className="spinner" /> : <Icon name="check" className="size-4" />} منح
      </button>
    }>
      <div className="space-y-4">
        <Field label="الطالب" required><StudentPicker single value={student} onChange={setStudent} classLabel={(id) => ref_.classes.find((c) => c.id === id)?.label ?? ''} /></Field>
        <Field label="الفصل الدراسي">
          <select value={term ?? ''} onChange={(e) => setTerm(e.target.value ? Number(e.target.value) : null)} className="field">
            {ref_.terms.map((t) => <option key={t.id} value={t.id}>{t.name} {t.year}</option>)}
            <option value="">كل الفصول الدراسية</option>
          </select>
        </Field>
        <Field label="درجة المواظبة" hint="من 100 — الافتراضي مواظبة كاملة">
          <input type="number" min={0} max={100} step={1} value={score} onChange={(e) => setScore(e.target.value)} className="field tabular-nums" dir="ltr" />
        </Field>
        <Field label="ملاحظة"><input value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} className="field" /></Field>
      </div>
    </Sheet>
  );
}

/* ------------------------- نص الإشعار ------------------------- */
function NoticeText({ notice }: { notice: NoticeSettings }) {
  const [v, setV] = useState(notice);
  const { pending, run } = useRun();
  const dirty = JSON.stringify(v) !== JSON.stringify(notice);
  return (
    <SettingsCard
      title="نص إشعار الدرجات"
      description="يظهر في أسفل كل إشعار. عبارة (ليس شهادة نهائية) ثابتة في كل الإشعارات."
      footer={<SaveBtn pending={pending} dirty={dirty} onClick={() => run(() => saveNotice(v), { title: 'حفظ نص الإشعار؟', body: 'يظهر في الإشعارات التي ينزّلها الطلاب من الآن.' })} />}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="اسم مدير المدرسة" hint="يظهر مع خانة التوقيع — اتركه فارغًا لإخفائها">
          <input value={v.principal} onChange={(e) => setV((x) => ({ ...x, principal: e.target.value.slice(0, 80) }))} className="field" />
        </Field>
        <Field label="ملاحظة إضافية" hint="حتى 300 حرف">
          <textarea value={v.note} onChange={(e) => setV((x) => ({ ...x, note: e.target.value.slice(0, 300) }))} rows={3} className="field" />
        </Field>
      </div>
    </SettingsCard>
  );
}
