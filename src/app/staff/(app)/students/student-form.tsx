'use client';

import { useEffect, useMemo, useState } from 'react';
import { Field, Sheet } from '@/components/sheet';
import { useFeedback } from '@/components/feedback';
import { Icon } from '@/components/shell/icons';
import type { Lookups } from '@/lib/lookups';
import { saveStudent, type StudentForm } from './actions';

const EMPTY: StudentForm = {
  id: null,
  national_id: '',
  name_ar: '',
  name_en: '',
  nationality: '',
  birth_date: '',
  gender: '',
  branch_id: null,
  stage_id: null,
  grade_id: null,
  section_id: null,
  fee_status: '',
  status: 'active',
};

const FEES = ['سدد', 'جزئي', 'إعفاء', 'لم يسدد'];

/**
 * نموذج الطالب — نفس حقول النظام القديم وترتيبها:
 * الفرع ← المرحلة ← الصف تُشتق من "توزيع المواد" (لا تظهر مرحلة أو صف بلا مواد في الفرع)،
 * والمواد تظهر حية تحت الاختيار للتأكد قبل الحفظ.
 */
export function StudentFormSheet({
  open,
  initial,
  lookups,
  onClose,
  onSaved,
  onDelete,
}: {
  open: boolean;
  initial: StudentForm | null;
  lookups: Lookups;
  onClose: () => void;
  onSaved: (message: string) => void;
  onDelete?: () => void;
}) {
  const { confirm, toast } = useFeedback();
  const [f, setF] = useState<StudentForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const editing = Boolean(initial?.id);

  useEffect(() => {
    if (!open) return;
    const base = initial ?? { ...EMPTY, branch_id: lookups.branches[0]?.id ?? null };
    setF(base);
    setErrors({});
  }, [open, initial, lookups.branches]);

  const set = <K extends keyof StudentForm>(k: K, v: StudentForm[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  // المراحل والصفوف المتاحة من توزيع المواد
  const gradeStage = useMemo(() => new Map(lookups.grades.map((g) => [g.id, g.stage_id])), [lookups.grades]);
  const stagesForBranch = useMemo(() => {
    const ids = new Set(lookups.matrix.filter((m) => m.b === f.branch_id).map((m) => gradeStage.get(m.g)));
    return lookups.stages.filter((s) => ids.has(s.id));
  }, [lookups, f.branch_id, gradeStage]);
  const gradesForStage = useMemo(() => {
    const ids = new Set(lookups.matrix.filter((m) => m.b === f.branch_id).map((m) => m.g));
    return lookups.grades.filter((g) => ids.has(g.id) && g.stage_id === f.stage_id);
  }, [lookups, f.branch_id, f.stage_id]);
  const subjects = useMemo(() => {
    const ids = new Set(
      lookups.matrix.filter((m) => m.b === f.branch_id && m.g === f.grade_id && (m.s === null || m.s === f.section_id)).map((m) => m.sub),
    );
    return lookups.subjects.filter((s) => ids.has(s.id));
  }, [lookups, f.branch_id, f.grade_id, f.section_id]);

  // عند تغيير الفرع أو المرحلة: اختيار أول خيار صالح تلقائيًا (كالقديم)
  useEffect(() => {
    if (!open) return;
    if (!stagesForBranch.some((s) => s.id === f.stage_id)) setF((x) => ({ ...x, stage_id: stagesForBranch[0]?.id ?? null }));
  }, [open, stagesForBranch, f.stage_id]);
  useEffect(() => {
    if (!open) return;
    if (!gradesForStage.some((g) => g.id === f.grade_id)) setF((x) => ({ ...x, grade_id: gradesForStage[0]?.id ?? null }));
  }, [open, gradesForStage, f.grade_id]);

  const name = (list: { id: number; name: string }[], id: number | null) => list.find((x) => x.id === id)?.name ?? '—';

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!f.name_ar.trim()) e.name_ar = 'الاسم بالعربي مطلوب';
    if (!f.branch_id) e.branch_id = 'اختر الفرع';
    if (!f.grade_id) e.grade_id = 'اختر الصف';
    if (!f.section_id) e.section_id = 'اختر الشعبة';
    if (f.national_id && !/^\d{6,15}$/.test(f.national_id.trim())) e.national_id = 'رقم الهوية أرقام فقط';
    setErrors(e);
    if (Object.keys(e).length) {
      toast('أكمل الحقول المطلوبة', 'error');
      return;
    }

    const ok = await confirm({
      title: editing ? 'حفظ التعديلات؟' : 'تسجيل هذا الطالب؟',
      confirmLabel: editing ? 'حفظ' : 'تسجيل',
      body: (
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-paper p-3 text-sm">
          <dt>الاسم</dt>
          <dd className="font-semibold text-ink">{f.name_ar}</dd>
          <dt>الفرع</dt>
          <dd className="text-ink">{name(lookups.branches, f.branch_id)}</dd>
          <dt>الصف والشعبة</dt>
          <dd className="text-ink">
            {name(lookups.grades, f.grade_id)} {name(lookups.stages, f.stage_id)} / {name(lookups.sections, f.section_id)}
          </dd>
          <dt>الرسوم</dt>
          <dd className="text-ink">{f.fee_status || '—'}</dd>
          <dt>المواد</dt>
          <dd className={subjects.length ? 'text-ink' : 'text-danger'}>{subjects.length ? subjects.map((s) => s.name).join('، ') : 'لا مواد موزّعة!'}</dd>
        </dl>
      ),
    });
    if (!ok) return;

    setSaving(true);
    const res = await saveStudent({ ...f, name_ar: f.name_ar.trim(), national_id: f.national_id.trim() });
    setSaving(false);
    if (!res.ok) return toast(res.error, 'error');
    onSaved(res.message);
  };

  const err = (k: string) => (errors[k] ? 'border-danger/60 focus:border-danger' : '');

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'تعديل بيانات طالب' : 'تسجيل طالب جديد'}
      subtitle={editing ? `رقم الطالب ${initial?.code}` : 'يُعطى رقم الطالب تلقائيًا عند الحفظ'}
      footer={
        <div className="flex items-center gap-2">
          {editing && onDelete && (
            <button type="button" onClick={onDelete} className="btn-danger me-auto">
              <Icon name="trash" className="size-4" />
              حذف
            </button>
          )}
          <button type="button" onClick={onClose} className={`btn-quiet ${editing ? '' : 'ms-auto'}`}>إلغاء</button>
          <button type="button" onClick={submit} disabled={saving} className="btn-primary min-w-32">
            {saving ? (
              <>
                <span className="spinner" />
                جارٍ الحفظ…
              </>
            ) : editing ? (
              'حفظ التعديل'
            ) : (
              'تسجيل الطالب'
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <fieldset className="space-y-4">
          <legend className="mb-3 text-xs font-bold text-board">البيانات الشخصية</legend>
          <Field label="الاسم بالعربي" required hint={errors.name_ar && <span className="text-danger">{errors.name_ar}</span>}>
            <input value={f.name_ar} onChange={(e) => set('name_ar', e.target.value)} className={`field ${err('name_ar')}`} />
          </Field>
          <Field label="الاسم بالإنجليزي">
            <input value={f.name_en} onChange={(e) => set('name_en', e.target.value)} dir="ltr" className="field text-start" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="رقم الهوية" hint={errors.national_id && <span className="text-danger">{errors.national_id}</span>}>
              <input value={f.national_id} onChange={(e) => set('national_id', e.target.value)} inputMode="numeric" dir="ltr" className={`field ${err('national_id')}`} />
            </Field>
            <Field label="الجنسية">
              <input value={f.nationality} onChange={(e) => set('nationality', e.target.value)} className="field" />
            </Field>
            <Field label="تاريخ الميلاد">
              <input type="date" value={f.birth_date} onChange={(e) => set('birth_date', e.target.value)} className="field" />
            </Field>
            <Field label="الجنس">
              <div className="grid grid-cols-2 gap-2">
                {['ذكر', 'أنثى'].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => set('gender', g)}
                    aria-pressed={f.gender === g}
                    className={`h-[2.85rem] rounded-md border text-sm transition-all ${f.gender === g ? 'border-board bg-board text-chalk' : 'border-line bg-surface hover:border-muted'}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-3 text-xs font-bold text-board">الفصل الدراسي</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الفرع" required>
              <select value={f.branch_id ?? ''} onChange={(e) => set('branch_id', Number(e.target.value) || null)} className={`field ${err('branch_id')}`}>
                {lookups.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="المرحلة" required>
              <select value={f.stage_id ?? ''} onChange={(e) => set('stage_id', Number(e.target.value) || null)} className="field" disabled={!stagesForBranch.length}>
                {stagesForBranch.length ? stagesForBranch.map((s) => <option key={s.id} value={s.id}>{s.name}</option>) : <option>لا مراحل في هذا الفرع</option>}
              </select>
            </Field>
            <Field label="الصف" required hint={errors.grade_id && <span className="text-danger">{errors.grade_id}</span>}>
              <select value={f.grade_id ?? ''} onChange={(e) => set('grade_id', Number(e.target.value) || null)} className={`field ${err('grade_id')}`} disabled={!gradesForStage.length}>
                {gradesForStage.length ? gradesForStage.map((g) => <option key={g.id} value={g.id}>{g.name}</option>) : <option>—</option>}
              </select>
            </Field>
            <Field label="الشعبة" required hint={errors.section_id && <span className="text-danger">{errors.section_id}</span>}>
              <select value={f.section_id ?? ''} onChange={(e) => set('section_id', Number(e.target.value) || null)} className={`field ${err('section_id')}`}>
                <option value="">اختر…</option>
                {lookups.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          </div>
          <div
            className={`rounded-xl px-3.5 py-3 text-sm transition-colors ${
              f.grade_id && f.section_id ? (subjects.length ? 'bg-board/[0.07] text-board' : 'bg-danger-soft text-danger') : 'bg-paper text-muted'
            }`}
          >
            <p className="mb-1 text-xs font-semibold opacity-80">المواد (تُشتق تلقائيًا من توزيع المواد)</p>
            {!f.grade_id || !f.section_id
              ? 'اختر الصف والشعبة لتظهر المواد.'
              : subjects.length
                ? subjects.map((s) => s.name).join('، ')
                : 'لا توجد مواد موزّعة لهذا الفرع والصف والشعبة. أضفها من توزيع المواد قبل تسجيل الطالب.'}
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-3 text-xs font-bold text-board">الرسوم والحالة</legend>
          <Field label="حالة الرسوم">
            <div className="grid grid-cols-4 gap-2">
              {FEES.map((x) => (
                <button
                  key={x}
                  type="button"
                  onClick={() => set('fee_status', f.fee_status === x ? '' : x)}
                  aria-pressed={f.fee_status === x}
                  className={`h-10 rounded-md border text-sm transition-all ${f.fee_status === x ? 'border-board bg-board text-chalk' : 'border-line bg-surface hover:border-muted'}`}
                >
                  {x}
                </button>
              ))}
            </div>
          </Field>
          {editing && (
            <Field label="حالة الطالب" hint="الطالب المنسحب يبقى بسجلاته ودرجاته، ولا يظهر في القوائم اليومية.">
              <select value={f.status} onChange={(e) => set('status', e.target.value)} className="field">
                <option value="active">منتظم</option>
                <option value="withdrawn">منسحب</option>
                <option value="graduated">متخرج</option>
              </select>
            </Field>
          )}
          {!editing && (
            <p className="flex items-start gap-2 rounded-xl bg-paper px-3.5 py-3 text-xs text-muted">
              <Icon name="key" className="mt-0.5 size-4 shrink-0" />
              حساب الدخول يُنشأ بعد التسجيل من صفحة "حسابات الطلاب".
            </p>
          )}
        </fieldset>
      </div>
    </Sheet>
  );
}
