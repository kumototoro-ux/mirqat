'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { ChipSelect, Field, Sheet } from '@/components/sheet';
import { CardChoice, DateTime, fmtFull } from '@/components/assess/kit';
import { Switch } from '@/components/settings/editors';
import { deleteRule, ruleReach, saveRule, setRuleActive, type RuleInput } from '@/lib/results/actions';
import type { ReleaseRule } from '@/lib/results/shared';
import { StudentPicker } from './student-picker';
import type { RefData } from './results-admin';

/* =====================================================================
   إتاحة النتائج: قواعد حجب وإتاحة بأهداف متعددة وفترة عرض
   الأخص يغلب الأعم: طالب ← فصل ← صف ← مرحلة ← فرع ← الكل
   ===================================================================== */

const EMPTY: RuleInput = { kind: 'block', term_ids: [], branch_ids: [], stage_ids: [], grade_ids: [], class_ids: [], student_ids: [], opens_at: null, closes_at: null, note: null };

const LEVELS = [
  { key: 'student_ids', label: 'طالب', n: 5 },
  { key: 'class_ids', label: 'فصل', n: 4 },
  { key: 'grade_ids', label: 'صف', n: 3 },
  { key: 'stage_ids', label: 'مرحلة', n: 2 },
  { key: 'branch_ids', label: 'فرع', n: 1 },
] as const;

function status(r: Pick<ReleaseRule, 'kind' | 'opens_at' | 'closes_at' | 'is_active'>) {
  const now = Date.now();
  if (!r.is_active) return { text: 'معطّلة — لا تُطبَّق', tone: 'bg-paper text-muted' };
  if (r.kind === 'allow') return { text: 'ظاهرة دائمًا (استثناء)', tone: 'bg-ok-soft text-ok' };
  const o = r.opens_at ? Date.parse(r.opens_at) : null;
  const c = r.closes_at ? Date.parse(r.closes_at) : null;
  if (o == null && c == null) return { text: 'محجوبة حتى تُلغى', tone: 'bg-brass-soft text-brass' };
  if (o != null && o > now) return { text: `محجوبة · تُتاح ${fmtFull(r.opens_at!)}`, tone: 'bg-brass-soft text-brass' };
  if (c != null && c <= now) return { text: 'انتهت فترة العرض · محجوبة', tone: 'bg-danger-soft text-danger' };
  return { text: c ? `ظاهرة الآن حتى ${fmtFull(r.closes_at!)}` : 'ظاهرة الآن', tone: 'bg-ok-soft text-ok' };
}

export function ReleaseRules({ ref_, rules }: { ref_: RefData; rules: ReleaseRule[] }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState<{ id: number | null; v: RuleInput } | null>(null);
  const termName = (id: number) => { const t = ref_.terms.find((x) => x.id === id); return t ? `${t.name} ${t.year}` : `#${id}`; };
  const names = (r: ReleaseRule) => [
    ...r.branch_ids.map((id) => ref_.branches.find((x) => x.id === id)?.name ?? '؟'),
    ...r.stage_ids.map((id) => ref_.stages.find((x) => x.id === id)?.name ?? '؟'),
    ...r.grade_ids.map((id) => gradeLabel(ref_, id)),
    ...r.class_ids.map((id) => ref_.classes.find((x) => x.id === id)?.label ?? '؟'),
  ];

  const toggle = async (r: ReleaseRule, v: boolean) => {
    const ok = await confirm({ title: v ? 'تفعيل القاعدة؟' : 'تعطيل القاعدة؟', body: 'يتغير ما يراه الطلاب فورًا.', confirmLabel: v ? 'تفعيل' : 'تعطيل', danger: !v });
    if (!ok) return;
    const res = await setRuleActive(r.id, v);
    if (!res.ok) return toast(res.error, 'error');
    toast(res.message);
    router.refresh();
  };
  const remove = async (r: ReleaseRule) => {
    const ok = await confirm({ title: 'حذف القاعدة؟', body: 'يعود الطلاب المشمولون للقاعدة الأعم التالية (أو الظهور إن لم توجد).', confirmLabel: 'حذف', danger: true });
    if (!ok) return;
    const res = await deleteRule(r.id);
    if (!res.ok) return toast(res.error, 'error');
    toast(res.message);
    router.refresh();
  };
  const preset = (v: Partial<RuleInput>) => setEditing({ id: null, v: { ...EMPTY, ...v } });
  const current = ref_.terms.find((t) => t.is_current);

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-[1.6rem] bg-board p-5 text-chalk">
        <div aria-hidden className="absolute -end-16 -top-20 size-60 rounded-full bg-gold/15 blur-3xl" />
        <div className="relative flex flex-wrap items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-chalk/10 text-gold"><Icon name="eye" className="size-6" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold">من يرى نتائجه، ومتى؟</p>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-chalk/80">
              بلا قواعد تظهر النتائج للجميع. أضف <b className="text-gold">حجبًا</b> لفرع أو مرحلة أو صف أو فصل أو طالب، لفصل دراسي أو أكثر، مع موعد إتاحة وموعد إغلاق اختياريين.
              عند التعارض <b className="text-gold">يغلب الأخص</b>: قاعدة الطالب ← الفصل ← الصف ← المرحلة ← الفرع ← الكل.
            </p>
          </div>
          <button type="button" onClick={() => setEditing({ id: null, v: EMPTY })} className="btn-primary w-full bg-gold text-ink hover:bg-gold/90 sm:w-auto">
            <Icon name="plus" className="size-4" /> قاعدة جديدة
          </button>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2">
          {current && (
            <button type="button" onClick={() => preset({ term_ids: [current.id], note: 'حتى اعتماد النتائج' })} className="rounded-full bg-chalk/10 px-3 py-1.5 text-xs font-semibold hover:bg-chalk/20">
              حجب {current.name} عن الجميع
            </button>
          )}
          {current && (
            <button type="button" onClick={() => preset({ term_ids: [current.id], opens_at: nextMorning(7), note: 'إعلان النتائج' })} className="rounded-full bg-chalk/10 px-3 py-1.5 text-xs font-semibold hover:bg-chalk/20">
              إعلان {current.name} في موعد محدد
            </button>
          )}
          <button type="button" onClick={() => preset({ kind: 'allow' })} className="rounded-full bg-chalk/10 px-3 py-1.5 text-xs font-semibold hover:bg-chalk/20">
            استثناء طالب من الحجب
          </button>
        </div>
      </section>

      {!rules.length ? (
        <div className="grid place-items-center rounded-[1.4rem] border border-dashed border-line bg-surface px-6 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-ok-soft text-ok"><Icon name="eye" className="size-7" /></span>
          <p className="mt-3 font-semibold">النتائج ظاهرة لكل الطلاب</p>
          <p className="mt-1 text-sm text-muted">لا قواعد حجب حاليًا. كل طالب يرى إشعار درجاته فور رصدها.</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          <AnimatePresence initial={false}>
            {rules.map((r) => {
              const st = status(r);
              const lvl = LEVELS.find((l) => r[l.key].length);
              const targets = names(r);
              return (
                <motion.li key={r.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`rounded-[1.4rem] border bg-surface p-4 ${r.is_active ? 'border-line' : 'border-dashed border-line opacity-70'}`}>
                  <div className="flex flex-wrap items-start gap-3">
                    <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${r.kind === 'allow' ? 'bg-ok-soft text-ok' : 'bg-brass-soft text-brass'}`}>
                      <Icon name={r.kind === 'allow' ? 'eye' : 'key'} className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">
                        {r.kind === 'allow' ? 'إتاحة استثنائية' : 'حجب'} · <span className="font-semibold text-muted">{lvl ? `مستوى ${lvl.label}` : 'كل الطلاب'}</span>
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                        {(r.term_ids.length ? r.term_ids.map(termName) : ['كل الفصول الدراسية']).map((t) => <span key={t} className="rounded-full bg-ink px-2.5 py-1 text-chalk">{t}</span>)}
                        {targets.slice(0, 6).map((t, i) => <span key={`${t}-${i}`} className="rounded-full bg-paper px-2.5 py-1">{t}</span>)}
                        {targets.length > 6 && <span className="rounded-full bg-paper px-2.5 py-1">+{targets.length - 6}</span>}
                        {r.student_ids.length > 0 && <span className="rounded-full bg-paper px-2.5 py-1">{r.student_ids.length} طالب</span>}
                      </div>
                      <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${st.tone}`}>{st.text}</p>
                      {r.note && <p className="mt-1.5 text-sm text-muted">{r.note}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Switch checked={r.is_active} onChange={(v) => toggle(r, v)} label="تفعيل القاعدة" />
                      <button type="button" onClick={() => setEditing({ id: r.id, v: { kind: r.kind, term_ids: r.term_ids, branch_ids: r.branch_ids, stage_ids: r.stage_ids, grade_ids: r.grade_ids, class_ids: r.class_ids, student_ids: r.student_ids, opens_at: r.opens_at, closes_at: r.closes_at, note: r.note } })} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-board/10 hover:text-board" aria-label="تعديل">
                        <Icon name="edit" className="size-4" />
                      </button>
                      <button type="button" onClick={() => remove(r)} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger" aria-label="حذف">
                        <Icon name="trash" className="size-4" />
                      </button>
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      {editing && <RuleEditor key={editing.id ?? 'new'} id={editing.id} initial={editing.v} ref_={ref_} onClose={() => setEditing(null)} />}
    </div>
  );
}

function nextMorning(h: number) {
  const now = new Date(Date.now() + 3 * 3600000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, h, 0) - 3 * 3600000).toISOString();
}
const gradeLabel = (ref_: RefData, id: number) => {
  const g = ref_.grades.find((x) => x.id === id);
  return g ? `${g.name} ${ref_.stages.find((s) => s.id === g.stage_id)?.name ?? ''}`.trim() : '؟';
};

function RuleEditor({ id, initial, ref_, onClose }: { id: number | null; initial: RuleInput; ref_: RefData; onClose: () => void }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [v, setV] = useState<RuleInput>(initial);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);
  const set = <K extends keyof RuleInput>(k: K, val: RuleInput[K]) => setV((x) => ({ ...x, [k]: val }));
  const targetsKey = JSON.stringify([v.branch_ids, v.stage_ids, v.grade_ids, v.class_ids, v.student_ids]);
  const [debKey, setDebKey] = useState(targetsKey);
  useEffect(() => {
    const t = setTimeout(() => setDebKey(targetsKey), 300);
    return () => clearTimeout(t);
  }, [targetsKey]);
  const reach = useQuery({ queryKey: ['rule-reach', debKey], queryFn: () => ruleReach({ branch_ids: v.branch_ids, stage_ids: v.stage_ids, grade_ids: v.grade_ids, class_ids: v.class_ids, student_ids: v.student_ids }) });
  const noTargets = !v.branch_ids.length && !v.stage_ids.length && !v.grade_ids.length && !v.class_ids.length && !v.student_ids.length;
  const classLabel = (cid: number | null) => ref_.classes.find((c) => c.id === cid)?.label ?? '';
  const close = () => { setOpen(false); setTimeout(onClose, 200); };

  const explain =
    v.kind === 'allow'
      ? 'تظهر النتائج للمشمولين دائمًا، حتى لو حُجبت عن مستوى أعم منهم.'
      : !v.opens_at && !v.closes_at
        ? 'محجوبة حتى تعطّل القاعدة أو تحذفها.'
        : v.opens_at && v.closes_at
          ? `محجوبة حتى ${fmtFull(v.opens_at)}، ثم تظهر حتى ${fmtFull(v.closes_at)}، ثم تُحجب.`
          : v.opens_at
            ? `محجوبة حتى ${fmtFull(v.opens_at)}، ثم تظهر.`
            : `ظاهرة حتى ${fmtFull(v.closes_at!)}، ثم تُحجب.`;

  const save = async () => {
    if (v.kind === 'allow' && noTargets) return toast('حدّد من تشمله الإتاحة الاستثنائية', 'error');
    if (v.opens_at && v.closes_at && Date.parse(v.closes_at) <= Date.parse(v.opens_at)) return toast('موعد الإغلاق يجب أن يكون بعد موعد الإتاحة', 'error');
    const ok = await confirm({
      title: id ? 'حفظ تعديل القاعدة؟' : v.kind === 'allow' ? 'إضافة إتاحة استثنائية؟' : 'إضافة قاعدة حجب؟',
      body: (
        <>
          تشمل <b className="text-ink">{reach.data ?? '…'} طالب</b> في {v.term_ids.length ? `${v.term_ids.length} فصل دراسي` : 'كل الفصول الدراسية'}. {explain}
        </>
      ),
      confirmLabel: 'حفظ وتطبيق',
    });
    if (!ok) return;
    setBusy(true);
    const res = await saveRule(id, { ...v, note: v.note?.trim() || null });
    setBusy(false);
    if (!res.ok) return toast(res.error, 'error');
    toast(res.message);
    close();
    router.refresh();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={id ? 'تعديل القاعدة' : 'قاعدة إتاحة جديدة'}
      subtitle="تُطبَّق فور الحفظ على بوابة الطلاب"
      footer={
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 text-sm text-muted">
            {reach.isFetching ? <span className="spinner" /> : <>تشمل <b className="text-ink tabular-nums">{reach.data ?? 0}</b> طالبًا</>}
          </span>
          <button type="button" onClick={save} disabled={busy} className="btn-primary px-6 py-3">
            {busy ? <span className="spinner" /> : <Icon name="check" className="size-4" />} حفظ
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <CardChoice
          value={v.kind}
          onChange={(k) => setV((x) => ({ ...x, kind: k, ...(k === 'allow' ? { opens_at: null, closes_at: null } : {}) }))}
          options={[
            { value: 'block', label: 'حجب', hint: 'إخفاء النتائج، مع فترة عرض اختيارية', icon: 'key' },
            { value: 'allow', label: 'إتاحة استثنائية', hint: 'إظهارها لمن تحدده رغم حجب أعم', icon: 'eye' },
          ]}
        />
        <Field label="الفصول الدراسية" hint="بلا اختيار = كل الفصول الدراسية">
          <ChipSelect options={ref_.terms.map((t) => ({ value: t.id, label: `${t.name} ${t.year}` }))} value={v.term_ids} onChange={(x) => set('term_ids', x)} />
        </Field>

        <div className="rounded-2xl border border-line p-3.5">
          <p className="font-semibold">من تشمل؟</p>
          <p className="mb-3 text-xs text-muted">{noTargets ? (v.kind === 'allow' ? 'اختر هدفًا واحدًا على الأقل' : 'بلا اختيار = كل الطلاب') : 'يشمل كل طالب يطابق أيًا مما اخترت'}</p>
          <div className="space-y-3">
            {ref_.branches.length > 1 && (
              <Field label="الفروع"><ChipSelect options={ref_.branches.map((b) => ({ value: b.id, label: b.name }))} value={v.branch_ids} onChange={(x) => set('branch_ids', x)} /></Field>
            )}
            <Field label="المراحل"><ChipSelect options={ref_.stages.map((b) => ({ value: b.id, label: b.name }))} value={v.stage_ids} onChange={(x) => set('stage_ids', x)} /></Field>
            <Field label="الصفوف"><ChipSelect options={ref_.grades.map((g) => ({ value: g.id, label: gradeLabel(ref_, g.id) }))} value={v.grade_ids} onChange={(x) => set('grade_ids', x)} /></Field>
            <Field label="الفصول"><ChipSelect options={ref_.classes.map((c) => ({ value: c.id, label: ref_.branches.length > 1 ? `${c.label} · ${c.branch}` : c.label }))} value={v.class_ids} onChange={(x) => set('class_ids', x)} /></Field>
            <Field label="طلاب بأسمائهم"><StudentPicker value={v.student_ids} onChange={(x) => set('student_ids', x)} classLabel={classLabel} /></Field>
          </div>
        </div>

        {v.kind === 'block' && (
          <div className="space-y-4 rounded-2xl border border-line p-3.5">
            <div>
              <p className="font-semibold">فترة العرض <span className="text-xs font-normal text-muted">(اختيارية)</span></p>
              <p className="text-xs text-muted">حدّد متى تُتاح النتائج ومتى يُغلق عرضها. بلا تواريخ = حجب حتى الإلغاء.</p>
            </div>
            <Field label="تُتاح النتائج من"><DateTime value={v.opens_at} onChange={(x) => set('opens_at', x)} quick="open" allowEmpty emptyLabel="بلا موعد" /></Field>
            <Field label="يُغلق العرض في"><DateTime value={v.closes_at} onChange={(x) => set('closes_at', x)} quick="none" allowEmpty emptyLabel="بلا إغلاق" /></Field>
          </div>
        )}
        <p className="flex items-start gap-2 rounded-xl bg-board/[0.06] px-3.5 py-2.5 text-sm text-board"><Icon name="sparkle" className="mt-0.5 size-4 shrink-0" /> {explain}</p>
        <Field label="ملاحظة داخلية"><input value={v.note ?? ''} onChange={(e) => set('note', e.target.value.slice(0, 200))} placeholder="مثال: حتى سداد الرسوم، أو إعلان نتائج الترم الأول" className="field" /></Field>
      </div>
    </Sheet>
  );
}
