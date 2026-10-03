'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChipSelect, Field, Sheet } from '@/components/sheet';
import { useFeedback } from '@/components/feedback';
import { Icon } from '@/components/shell/icons';
import type { Lookups } from '@/lib/lookups';
import { saveEmployee, type EmployeeForm } from './actions';

const EMPTY: EmployeeForm = {
  id: null,
  national_id: '',
  name_ar: '',
  name_en: '',
  user_type: 'teacher',
  job_role: '',
  gender: '',
  is_active: true,
  branch_id: null,
  stage_id: null,
  grade_ids: [],
  section_ids: [],
  subject_ids: [],
};

/**
 * نموذج الموظف — نفس حقول النظام القديم: البيانات، النوع، ثم النطاق
 * (فرع ومرحلة، وصفوف وشعب ومواد متعددة). الإداري يرى كل شيء فلا يحتاج نطاقًا.
 */
export function EmployeeFormSheet({
  open,
  initial,
  lookups,
  onClose,
  onSaved,
  onDelete,
}: {
  open: boolean;
  initial: EmployeeForm | null;
  lookups: Lookups;
  onClose: () => void;
  onSaved: (message: string) => void;
  onDelete?: () => void;
}) {
  const { confirm, toast } = useFeedback();
  const [f, setF] = useState<EmployeeForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const editing = Boolean(initial?.id);
  const teacher = f.user_type === 'teacher';

  useEffect(() => {
    if (!open) return;
    setF(initial ?? { ...EMPTY, branch_id: lookups.branches[0]?.id ?? null });
    setErrors({});
  }, [open, initial, lookups.branches]);

  const set = <K extends keyof EmployeeForm>(k: K, v: EmployeeForm[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const gradeStage = useMemo(() => new Map(lookups.grades.map((g) => [g.id, g.stage_id])), [lookups.grades]);
  const stagesForBranch = useMemo(() => {
    const ids = new Set(lookups.matrix.filter((m) => m.b === f.branch_id).map((m) => gradeStage.get(m.g)));
    return lookups.stages.filter((s) => ids.has(s.id));
  }, [lookups, f.branch_id, gradeStage]);
  // الصفوف: صفوف المرحلة المختارة (أو كل صفوف الفرع إن لم تُختر مرحلة)
  const grades = useMemo(() => {
    const inBranch = new Set(lookups.matrix.filter((m) => m.b === f.branch_id).map((m) => m.g));
    return lookups.grades
      .filter((g) => inBranch.has(g.id) && (!f.stage_id || g.stage_id === f.stage_id))
      .map((g) => ({ value: g.id, label: `${g.name} ${lookups.stages.find((s) => s.id === g.stage_id)?.name ?? ''}`.trim() }));
  }, [lookups, f.branch_id, f.stage_id]);
  // المواد: الموزّعة على الفرع والصفوف المختارة، وإلا كل المواد
  const subjects = useMemo(() => {
    const ids = new Set(lookups.matrix.filter((m) => m.b === f.branch_id && (!f.grade_ids.length || f.grade_ids.includes(m.g))).map((m) => m.sub));
    const list = lookups.subjects.filter((s) => ids.has(s.id));
    return (list.length ? list : lookups.subjects).map((s) => ({ value: s.id, label: s.name }));
  }, [lookups, f.branch_id, f.grade_ids]);

  // تنظيف الاختيارات التي خرجت من النطاق بعد تغيير الفرع/المرحلة
  useEffect(() => {
    if (!open) return;
    setF((x) => ({ ...x, grade_ids: x.grade_ids.filter((id) => grades.some((g) => g.value === id)) }));
  }, [open, grades]);

  const label = (list: { value: number; label: string }[], ids: number[]) => ids.map((id) => list.find((x) => x.value === id)?.label).filter(Boolean).join('، ');

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!f.name_ar.trim()) e.name_ar = 'الاسم بالعربي مطلوب';
    if (teacher) {
      if (!f.branch_id) e.branch_id = 'اختر الفرع';
      if (!f.grade_ids.length) e.grade_ids = 'اختر صفًا واحدًا على الأقل';
      if (!f.section_ids.length) e.section_ids = 'اختر شعبة واحدة على الأقل';
      if (!f.subject_ids.length) e.subject_ids = 'اختر مادة واحدة على الأقل';
    }
    setErrors(e);
    if (Object.keys(e).length) return toast('أكمل الحقول المطلوبة', 'error');

    const ok = await confirm({
      title: editing ? 'حفظ التعديلات؟' : 'تسجيل هذا الموظف؟',
      confirmLabel: editing ? 'حفظ' : 'تسجيل',
      body: (
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-paper p-3 text-sm">
          <dt>الاسم</dt>
          <dd className="font-semibold text-ink">{f.name_ar}</dd>
          <dt>النوع</dt>
          <dd className="text-ink">{teacher ? 'معلم' : 'إداري (يرى كل الفروع والمواد)'}</dd>
          {teacher && (
            <>
              <dt>الفرع</dt>
              <dd className="text-ink">{lookups.branches.find((b) => b.id === f.branch_id)?.name}</dd>
              <dt>الصفوف</dt>
              <dd className="text-ink">{label(grades, f.grade_ids)}</dd>
              <dt>الشعب</dt>
              <dd className="text-ink">{label(lookups.sections.map((s) => ({ value: s.id, label: s.name })), f.section_ids)}</dd>
              <dt>المواد</dt>
              <dd className="text-ink">{label(subjects, f.subject_ids)}</dd>
            </>
          )}
        </dl>
      ),
    });
    if (!ok) return;
    setSaving(true);
    const res = await saveEmployee({ ...f, name_ar: f.name_ar.trim() });
    setSaving(false);
    if (!res.ok) return toast(res.error, 'error');
    onSaved(res.message);
  };

  const errHint = (k: string) => errors[k] && <span className="text-danger">{errors[k]}</span>;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'تعديل بيانات موظف' : 'تسجيل موظف جديد'}
      subtitle={editing ? `رمز الموظف ${initial?.code}` : 'يُعطى رمز الموظف تلقائيًا عند الحفظ'}
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
            {saving ? (<><span className="spinner" />جارٍ الحفظ…</>) : editing ? 'حفظ التعديل' : 'تسجيل الموظف'}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <fieldset className="space-y-4">
          <legend className="mb-3 text-xs font-bold text-board">البيانات الشخصية</legend>
          <Field label="الاسم بالعربي" required hint={errHint('name_ar')}>
            <input value={f.name_ar} onChange={(e) => set('name_ar', e.target.value)} className={`field ${errors.name_ar ? 'border-danger/60' : ''}`} />
          </Field>
          <Field label="الاسم بالإنجليزي">
            <input value={f.name_en} onChange={(e) => set('name_en', e.target.value)} dir="ltr" className="field text-start" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="رقم الهوية">
              <input value={f.national_id} onChange={(e) => set('national_id', e.target.value)} inputMode="numeric" dir="ltr" className="field" />
            </Field>
            <Field label="الجنس">
              <div className="grid grid-cols-2 gap-2">
                {['ذكر', 'أنثى'].map((g) => (
                  <button key={g} type="button" onClick={() => set('gender', g)} aria-pressed={f.gender === g}
                    className={`h-[2.85rem] rounded-md border text-sm transition-all ${f.gender === g ? 'border-board bg-board text-chalk' : 'border-line bg-surface hover:border-muted'}`}>
                    {g}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-3 text-xs font-bold text-board">النوع والصلاحية</legend>
          <div className="grid grid-cols-2 gap-2">
            {([
              ['teacher', 'معلم', 'يرى فصوله ومواده فقط'],
              ['admin', 'إداري', 'يرى كل شيء ويدير النظام'],
            ] as const).map(([v, l, h]) => (
              <button key={v} type="button" onClick={() => set('user_type', v)} aria-pressed={f.user_type === v}
                className={`rounded-xl border p-3 text-start transition-all ${f.user_type === v ? 'border-board bg-board/[0.07] ring-2 ring-board/20' : 'border-line hover:border-muted'}`}>
                <span className="block font-semibold">{l}</span>
                <span className="block text-xs text-muted">{h}</span>
              </button>
            ))}
          </div>
          <Field label="المسمى الوظيفي">
            <input value={f.job_role} onChange={(e) => set('job_role', e.target.value)} placeholder="مثل: معلم رياضيات، وكيل" className="field" />
          </Field>
          {editing && (
            <label className="flex items-center justify-between rounded-xl border border-line px-3.5 py-3">
              <span>
                <span className="block text-sm font-medium">نشط</span>
                <span className="block text-xs text-muted">الموظف غير النشط يبقى بسجلاته ولا يظهر في القوائم اليومية</span>
              </span>
              <input type="checkbox" checked={f.is_active} onChange={(e) => set('is_active', e.target.checked)} className="size-5 accent-[var(--color-board)]" />
            </label>
          )}
        </fieldset>

        {teacher && (
          <fieldset className="animate-fade-up space-y-4">
            <legend className="mb-3 text-xs font-bold text-board">نطاق العمل</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="الفرع" required hint={errHint('branch_id')}>
                <select value={f.branch_id ?? ''} onChange={(e) => set('branch_id', Number(e.target.value) || null)} className="field">
                  {lookups.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
              <Field label="المرحلة" hint="اختيارية: تحصر الصفوف المعروضة">
                <select value={f.stage_id ?? ''} onChange={(e) => set('stage_id', Number(e.target.value) || null)} className="field">
                  <option value="">كل المراحل</option>
                  {stagesForBranch.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="الصفوف" required hint={errHint('grade_ids')}>
              <ChipSelect options={grades} value={f.grade_ids} onChange={(v) => set('grade_ids', v)} />
            </Field>
            <Field label="الشعب" required hint={errHint('section_ids')}>
              <ChipSelect options={lookups.sections.map((s) => ({ value: s.id, label: s.name }))} value={f.section_ids} onChange={(v) => set('section_ids', v)} />
            </Field>
            <Field label="المواد" required hint={errHint('subject_ids')}>
              <ChipSelect options={subjects} value={f.subject_ids} onChange={(v) => set('subject_ids', v)} />
            </Field>
          </fieldset>
        )}
        {!editing && (
          <p className="flex items-start gap-2 rounded-xl bg-paper px-3.5 py-3 text-xs text-muted">
            <Icon name="key" className="mt-0.5 size-4 shrink-0" />
            حساب الدخول يُنشأ بعد التسجيل من صفحة "حسابات الموظفين".
          </p>
        )}
      </div>
    </Sheet>
  );
}
