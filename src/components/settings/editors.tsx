'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, Reorder, motion } from 'motion/react';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { deleteRefItem, reorderRef, saveRefItem, saveSetting, saveWeights, uploadLogo, type RefTable } from '@/lib/settings/actions';
import { getBranchUsage } from '@/lib/schedule/actions';
import { useQuery } from '@tanstack/react-query';
import type { ActionResult } from '@/components/registry/types';

/* =====================================================================
   عناصر مشتركة
   ===================================================================== */

export function SettingsCard({ title, description, children, footer }: { title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-[1.4rem] border border-line bg-surface"
    >
      <header className="px-5 pt-5 sm:px-6">
        <h3 className="text-lg font-bold">{title}</h3>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </header>
      <div className="space-y-6 px-5 py-5 sm:px-6">{children}</div>
      {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-paper/40 px-5 py-3.5 sm:px-6 rounded-b-[1.4rem]">{footer}</footer>}
    </motion.section>
  );
}

/** عنوان إعداد ووصفه، وأداته بجانبه أو تحته */
export function SettingRow({ title, description, children, inline }: { title: string; description?: React.ReactNode; children: React.ReactNode; inline?: boolean }) {
  return (
    <div className={inline ? 'flex items-start justify-between gap-4' : ''}>
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        {description && <p className="mt-0.5 text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      <div className={inline ? 'shrink-0' : 'mt-3'}>{children}</div>
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 disabled:opacity-50 ${checked ? 'bg-board' : 'bg-line'}`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 600, damping: 34 }}
        className={`absolute top-1 size-5 rounded-full bg-white shadow ${checked ? 'start-6' : 'start-1'}`}
      />
    </button>
  );
}

/** أيقونة قفل بتلميح: الإعداد ظاهر للزوار قبل الدخول أو داخلي */
export function VisibilityLock({ isPublic }: { isPublic: boolean }) {
  return (
    <span className="group relative">
      <span className={`grid size-11 place-items-center rounded-xl border transition-colors ${isPublic ? 'border-board bg-board text-chalk' : 'border-line bg-surface text-muted'}`}>
        <svg viewBox="0 0 24 24" className="size-[1.1rem]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
          <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
          <path d={isPublic ? 'M8.5 10.5V7.5a3.5 3.5 0 0 1 6.8-1.2' : 'M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3'} />
        </svg>
      </span>
      <span className="pointer-events-none absolute end-full top-1/2 z-20 me-2 w-52 -translate-y-1/2 rounded-xl bg-ink px-3 py-2 text-xs leading-relaxed text-chalk opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {isPublic ? 'ظاهر للجميع في الصفحة الرئيسية قبل تسجيل الدخول' : 'داخلي: لا يراه إلا المسجلون'}
      </span>
    </span>
  );
}

type Ask = { title: string; body?: React.ReactNode; confirmLabel?: string; danger?: boolean };

/** كل حفظ: بطاقة تأكيد ← تنفيذ ← تنبيه نجاح أو خطأ ← تحديث البيانات */
function useSave() {
  const { toast, confirm } = useFeedback();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = async (fn: () => Promise<ActionResult>, after?: () => void, ask?: Ask) => {
    if (ask && !(await confirm({ confirmLabel: 'حفظ', ...ask }))) return;
    start(async () => {
      const r = await fn();
      if (!r.ok) return toast(r.error, 'error');
      toast(r.message);
      after?.();
      router.refresh();
    });
  };
  return { pending, run };
}

/** يعيد الحالة المحلية لقيم الخادم كلما وصلت قيم جديدة (بعد الحفظ أو التنقل) */
function useSynced<T>(value: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [v, setV] = useState(value);
  const sig = JSON.stringify(value);
  const last = useRef(sig);
  useEffect(() => {
    if (last.current !== sig) {
      last.current = sig;
      setV(value);
    }
  }, [sig, value]);
  return [v, setV];
}

function SaveButton({ pending, dirty, onClick, label = 'حفظ التغييرات' }: { pending: boolean; dirty: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={pending || !dirty} className="btn-primary min-w-32 rounded-xl">
      {pending ? (<><span className="spinner" />جارٍ الحفظ…</>) : label}
    </button>
  );
}

/* =====================================================================
   هوية المدرسة
   ===================================================================== */
export function BrandingEditor({ name, logo }: { name: string; logo: string }) {
  const [n, setN] = useSynced(name);
  const [l, setL] = useSynced(logo);
  const [logoOk, setLogoOk] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast, confirm } = useFeedback();
  const router = useRouter();
  const { pending, run } = useSave();
  const dirty = n !== name || l !== logo;
  const save = () =>
    run(
      async () => {
        if (n !== name) {
          const r = await saveSetting('school_name', n.trim());
          if (!r.ok) return r;
        }
        if (l !== logo) return saveSetting('school_logo_url', l.trim());
        return { ok: true, message: 'حُفظت هوية المدرسة' };
      },
      undefined,
      { title: 'حفظ هوية المدرسة؟', body: 'يظهر التغيير فورًا في الصفحة الرئيسية وصفحات الدخول والتقارير.' },
    );
  const upload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) return toast('حجم الصورة أكبر من 2 ميجابايت', 'error');
    const preview = URL.createObjectURL(file);
    const ok = await confirm({
      title: 'رفع هذا الشعار؟',
      body: (
        <span className="mt-2 flex items-center gap-3 rounded-xl bg-paper p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="h-14 w-auto max-w-32 rounded-lg bg-surface object-contain p-1" />
          <span className="text-xs">{file.name}</span>
        </span>
      ),
      confirmLabel: 'رفع وحفظ',
    });
    URL.revokeObjectURL(preview);
    if (!ok) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const r = await uploadLogo(fd);
    setUploading(false);
    if (!r.ok) return toast(r.error, 'error');
    toast(r.message);
    setLogoOk(true);
    router.refresh();
  };
  return (
    <SettingsCard
      title="هوية المدرسة"
      description="تظهر في الصفحة الرئيسية وصفحات الدخول والتقارير وأعلى القائمة."
      footer={<SaveButton pending={pending} dirty={dirty} onClick={save} />}
    >
      <SettingRow title="اسم المدرسة" description="الاسم الكامل كما يظهر للطلاب وأولياء الأمور.">
        <div className="flex gap-2">
          <input value={n} onChange={(e) => setN(e.target.value)} className="field flex-1" maxLength={120} />
          <VisibilityLock isPublic />
        </div>
      </SettingRow>
      <SettingRow title="شعار المدرسة" description="ارفع صورة (PNG أو JPG أو WEBP حتى 2 ميجابايت)، أو الصق رابط صورة يبدأ بـ https.">
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="mb-3 flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-4 py-6 text-sm transition-colors hover:border-board/50 hover:bg-board/[0.03] disabled:opacity-60"
        >
          {uploading ? <span className="spinner size-6 text-board" /> : (
            <span className="grid size-11 place-items-center rounded-xl bg-board/10 text-board">
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 16v3.5h16V16" /></svg>
            </span>
          )}
          <span className="font-semibold">{uploading ? 'جارٍ الرفع…' : 'رفع صورة الشعار'}</span>
          <span className="text-xs text-muted">تُحفظ في تخزين المنصة الآمن</span>
        </button>
        <div className="flex gap-2">
          <input value={l} onChange={(e) => { setL(e.target.value); setLogoOk(true); }} dir="ltr" placeholder="https://…" className="field flex-1 text-start" />
          <VisibilityLock isPublic />
        </div>
        {l && (
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-paper p-3">
            {logoOk ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={l} alt="معاينة الشعار" referrerPolicy="no-referrer" onError={() => setLogoOk(false)} className="h-12 w-auto max-w-32 rounded-lg bg-surface object-contain p-1" />
            ) : (
              <span className="text-sm text-danger">تعذّر عرض الصورة من هذا الرابط</span>
            )}
            <span className="text-xs text-muted">معاينة</span>
          </div>
        )}
      </SettingRow>
    </SettingsCard>
  );
}

/* =====================================================================
   الإعلانات
   ===================================================================== */
type Ann = { title: string; body?: string; date?: string };
export function AnnouncementsEditor({ items }: { items: Ann[] }) {
  const [list, setList] = useSynced<Ann[]>(items);
  const { pending, run } = useSave();
  const dirty = JSON.stringify(list) !== JSON.stringify(items);
  const set = (i: number, patch: Partial<Ann>) => setList((l) => l.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  return (
    <SettingsCard
      title="إعلانات الصفحة الرئيسية"
      description="تظهر للزوار في قسم الإعلانات، ويختفي القسم إن لم يوجد إعلان. حتى 12 إعلانًا."
      footer={<SaveButton pending={pending} dirty={dirty} onClick={() => run(() => saveSetting('announcements', list.filter((a) => a.title.trim())), undefined, { title: 'حفظ الإعلانات؟', body: `ستظهر ${list.filter((a) => a.title.trim()).length} إعلانات للزوار في الصفحة الرئيسية.` })} />}
    >
      <AnimatePresence initial={false}>
        {list.map((a, i) => (
          <motion.div key={i} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="space-y-2 rounded-2xl border border-line p-4">
              <div className="flex gap-2">
                <input value={a.title} onChange={(e) => set(i, { title: e.target.value })} placeholder="عنوان الإعلان" className="field flex-1 font-semibold" />
                <input value={a.date ?? ''} onChange={(e) => set(i, { date: e.target.value })} placeholder="التاريخ (اختياري)" className="field w-40" />
                <button type="button" onClick={() => setList((l) => l.filter((_, j) => j !== i))} aria-label="حذف الإعلان" className="grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-danger-soft hover:text-danger">
                  <Icon name="trash" className="size-5" />
                </button>
              </div>
              <textarea value={a.body ?? ''} onChange={(e) => set(i, { body: e.target.value })} placeholder="نص الإعلان" rows={2} className="field resize-y" />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      {list.length < 12 && (
        <button type="button" onClick={() => setList((l) => [...l, { title: '', body: '' }])} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line py-4 text-sm font-semibold text-muted transition-colors hover:border-board/40 hover:text-board">
          <Icon name="plus" className="size-4" /> إضافة إعلان
        </button>
      )}
    </SettingsCard>
  );
}

/* =====================================================================
   الظهور للطلاب
   ===================================================================== */
function ScopeChips({ value, options, onChange }: { value: string[]; options: { group: string; items: string[] }[]; onChange: (v: string[]) => void }) {
  const all = value.includes('الكل');
  const toggle = (x: string) => onChange(value.includes(x) ? value.filter((v) => v !== x) : [...value.filter((v) => v !== 'الكل'), x]);
  return (
    <div className="space-y-3 rounded-2xl border border-line p-3.5">
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">كل الطلاب</span>
        <Switch checked={all} onChange={(v) => onChange(v ? ['الكل'] : [])} label="كل الطلاب" />
      </label>
      {!all &&
        options.map((g) => (
          <div key={g.group}>
            <p className="mb-1.5 text-xs font-semibold text-muted">{g.group}</p>
            <div className="flex flex-wrap gap-1.5">
              {g.items.map((x) => {
                const on = value.includes(x);
                return (
                  <button key={x} type="button" aria-pressed={on} onClick={() => toggle(x)}
                    className={`rounded-full px-3 py-1.5 text-sm transition-all active:scale-95 ${on ? 'bg-board text-chalk' : 'bg-paper hover:bg-board/10'}`}>
                    {x}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      {!all && value.length === 0 && <p className="text-xs text-danger">لم يُختر أحد: لن يظهر لأي طالب.</p>}
    </div>
  );
}

export function VisibilityEditor({
  results,
  weekly,
  calendar,
  exam,
  branches,
  grades,
  terms,
}: {
  results: string[];
  weekly: string[];
  calendar: string;
  exam: string;
  branches: string[];
  grades: string[];
  terms: string[];
}) {
  const [r, setR] = useSynced(results);
  const [w, setW] = useSynced(weekly);
  const [c, setC] = useSynced(calendar);
  const [e, setE] = useSynced(exam);
  const { pending, run } = useSave();
  const dirty = JSON.stringify([r, w, c, e]) !== JSON.stringify([results, weekly, calendar, exam]);
  const opts = [
    { group: 'الفروع', items: branches },
    { group: 'الصفوف', items: [...new Set(grades)] },
  ];
  const save = () =>
    run(async () => {
      const steps: [string, unknown, unknown][] = [
        ['results_visible_grades', r, results],
        ['weekly_grades_visibility', w, weekly],
        ['calendar_visibility', c, calendar],
        ['exam_visibility', e, exam],
      ];
      for (const [k, v, old] of steps) {
        if (JSON.stringify(v) === JSON.stringify(old)) continue;
        const res = await saveSetting(k, v);
        if (!res.ok) return res;
      }
      return { ok: true, message: 'حُفظت إعدادات الظهور' };
    }, undefined, { title: 'حفظ إعدادات الظهور؟', body: 'يتغير ما يراه الطلاب في بوابتهم فورًا.' });
  return (
    <SettingsCard
      title="ما يراه الطلاب"
      description="تتحكم في ظهور النتائج والدرجات والتقويم والاختبارات في بوابة الطالب. الإدارة ترى كل شيء دائمًا."
      footer={<SaveButton pending={pending} dirty={dirty} onClick={save} />}
    >
      <SettingRow title="عرض النتائج" description="من يرى مجموع درجاته في كل مادة (صفحة نتائجي).">
        <ScopeChips value={r} options={opts} onChange={setR} />
      </SettingRow>
      <SettingRow title="عرض الدرجات الأسبوعية" description="من يرى درجة كل مهمة ونموذج فور رصدها.">
        <ScopeChips value={w} options={opts} onChange={setW} />
      </SettingRow>
      <div className="grid gap-6 sm:grid-cols-2">
        <SettingRow title="التقويم الدراسي" description="كل الفصول، أو فصل دراسي واحد فقط.">
          <select value={c} onChange={(ev) => setC(ev.target.value)} className="field">
            <option value="all">كل الفصول الدراسية</option>
            {terms.map((t) => <option key={t} value={t}>{t} فقط</option>)}
          </select>
        </SettingRow>
        <SettingRow title="جدول الاختبارات" description="إخفاؤه عن الطلاب والمعلمين حتى يُعتمد.">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5">
            <span className="text-sm">{e === 'all' ? 'ظاهر' : 'مخفي'}</span>
            <Switch checked={e === 'all'} onChange={(v) => setE(v ? 'all' : 'hidden')} label="إظهار جدول الاختبارات" />
          </div>
        </SettingRow>
      </div>
    </SettingsCard>
  );
}

/* =====================================================================
   قائمة مرجعية: إضافة، إعادة تسمية، تفعيل، ترتيب بالسحب، حذف
   ===================================================================== */
export type RefItem = { id: number; name: string; is_active?: boolean; stage_id?: number; category?: string; usage?: number };

export function RefListEditor({
  table,
  title,
  description,
  items,
  hasActive,
  stages,
  categories,
}: {
  table: RefTable;
  title: string;
  description: string;
  items: RefItem[];
  hasActive?: boolean;
  stages?: { id: number; name: string }[];
  categories?: boolean;
}) {
  const [order, setOrder] = useSynced(items);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<{ name: string; stage_id?: number; category?: 'continuous' | 'exam' }>({ name: '' });
  const { confirm } = useFeedback();
  const { pending, run } = useSave();
  const orderDirty = order.map((x) => x.id).join() !== items.map((x) => x.id).join();
  // للفروع: كم فصلًا وطالبًا ومعلمًا مرتبطًا بكل فرع (يُشرح به سبب رفض الحذف)
  const usage = useQuery({ queryKey: ['branch-usage'], queryFn: () => getBranchUsage(), enabled: table === 'branches' });
  const usageText = (id: number) => {
    const u = usage.data?.[id];
    if (!u) return null;
    return `${u.students} طالب · ${u.classes} فصل · ${u.staff} معلم`;
  };

  const startEdit = (it: RefItem | null) => {
    setEditing(it ? it.id : 'new');
    setDraft(it ? { name: it.name, stage_id: it.stage_id, category: (it.category as 'continuous' | 'exam') ?? 'continuous' } : { name: '', stage_id: stages?.[0]?.id, category: 'continuous' });
  };
  const commit = () => {
    const isNew = editing === 'new';
    const old = order.find((x) => x.id === editing)?.name;
    run(() => saveRefItem(table, isNew ? null : (editing as number), draft), () => setEditing(null), {
      title: isNew ? `إضافة "${draft.name.trim()}"؟` : `تعديل "${old}"؟`,
      body: isNew ? `يُضاف في آخر قائمة ${title}.` : `يصبح الاسم "${draft.name.trim()}" في كل الصفحات والسجلات المرتبطة.`,
      confirmLabel: isNew ? 'إضافة' : 'حفظ',
    });
  };
  const remove = async (it: RefItem) => {
    const u = table === 'branches' ? usage.data?.[it.id] : undefined;
    const used = u && (u.classes || u.students || u.staff);
    const ok = await confirm({
      title: `حذف "${it.name}"؟`,
      body: used
        ? `هذا الفرع مرتبط بـ ${usageText(it.id)}، فالحذف سيُرفض لحماية بياناتهم. إن كان الاسم خطأ فأعد تسميته بزر القلم، وإن لم يعد مستخدمًا فعطّله.`
        : 'لا يمكن التراجع.',
      confirmLabel: 'حذف',
      danger: true,
    });
    if (ok) run(() => deleteRefItem(table, it.id));
  };
  const stageName = (id?: number) => stages?.find((s) => s.id === id)?.name ?? '';

  const editor = (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-paper p-2">
      <input
        autoFocus
        value={draft.name}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(null); }}
        placeholder="الاسم"
        className="field min-w-40 flex-1 py-2"
      />
      {stages && (
        <select value={draft.stage_id ?? ''} onChange={(e) => setDraft((d) => ({ ...d, stage_id: Number(e.target.value) }))} className="field w-36 py-2">
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      {categories && (
        <select value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as 'continuous' | 'exam' }))} className="field w-36 py-2">
          <option value="continuous">تقييم مستمر</option>
          <option value="exam">اختبار</option>
        </select>
      )}
      <button type="button" onClick={commit} disabled={pending || !draft.name.trim()} className="btn-primary h-10 rounded-lg px-4">
        {pending ? <span className="spinner" /> : 'حفظ'}
      </button>
      <button type="button" onClick={() => setEditing(null)} className="btn-quiet h-10 rounded-lg px-3">إلغاء</button>
    </div>
  );

  return (
    <SettingsCard
      title={title}
      description={description}
      footer={
        <>
          {orderDirty && (
            <button type="button" onClick={() => run(() => reorderRef(table, order.map((x) => x.id)), undefined, { title: 'حفظ الترتيب الجديد؟', body: `يظهر ${title} بهذا الترتيب في كل القوائم.` })} disabled={pending} className="btn-primary me-auto rounded-xl">
              {pending ? <span className="spinner" /> : null} حفظ الترتيب
            </button>
          )}
          <button type="button" onClick={() => startEdit(null)} className="btn-quiet rounded-xl">
            <Icon name="plus" className="size-4" /> إضافة
          </button>
        </>
      }
    >
      {editing === 'new' && editor}
      {order.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">القائمة فارغة.</p>
      ) : (
        <Reorder.Group axis="y" values={order} onReorder={setOrder} className="-my-1 divide-y divide-line">
          {order.map((it) => (
            <Reorder.Item key={it.id} value={it} className="relative bg-surface py-1" whileDrag={{ scale: 1.02, boxShadow: '0 12px 30px -12px rgb(0 0 0 / 0.3)', borderRadius: 14, zIndex: 5 }}>
              {editing === it.id ? (
                <div className="py-1">{editor}</div>
              ) : (
                <div className="flex items-center gap-2 py-1.5">
                  <span className="grid size-8 cursor-grab touch-none place-items-center rounded-lg text-muted/60 active:cursor-grabbing" aria-label="اسحب لإعادة الترتيب">
                    <svg viewBox="0 0 20 20" className="size-4" fill="currentColor"><circle cx="7" cy="5" r="1.4" /><circle cx="13" cy="5" r="1.4" /><circle cx="7" cy="10" r="1.4" /><circle cx="13" cy="10" r="1.4" /><circle cx="7" cy="15" r="1.4" /><circle cx="13" cy="15" r="1.4" /></svg>
                  </span>
                  <span className={`min-w-0 flex-1 truncate font-medium ${hasActive && it.is_active === false ? 'text-muted line-through' : ''}`}>
                    {it.name}
                    {stages && <span className="ms-2 text-sm font-normal text-muted">{stageName(it.stage_id)}</span>}
                    {categories && it.category === 'exam' && <span className="ms-2 rounded-full bg-brass-soft px-2 py-0.5 text-xs text-brass">اختبار</span>}
                  </span>
                  {typeof it.usage === 'number' && <span className="hidden text-xs tabular-nums text-muted sm:inline">{it.usage} استخدام</span>}
                  {table === 'branches' && usageText(it.id) && <span className="hidden text-xs tabular-nums text-muted sm:inline">{usageText(it.id)}</span>}
                  {hasActive && (
                    <Switch
                      checked={it.is_active !== false}
                      onChange={(v) =>
                        run(() => saveRefItem(table, it.id, { name: it.name, is_active: v }), undefined, {
                          title: v ? `تفعيل "${it.name}"؟` : `تعطيل "${it.name}"؟`,
                          body: v ? 'يعود للظهور في نماذج التسجيل.' : 'يختفي من نماذج التسجيل الجديدة، وتبقى سجلاته كما هي.',
                          confirmLabel: v ? 'تفعيل' : 'تعطيل',
                          danger: !v,
                        })
                      }
                      label={`تفعيل ${it.name}`}
                      disabled={pending}
                    />
                  )}
                  <button type="button" onClick={() => startEdit(it)} aria-label="إعادة تسمية" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-board/10 hover:text-board">
                    <Icon name="edit" className="size-4" />
                  </button>
                  <button type="button" onClick={() => remove(it)} aria-label="حذف" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger">
                    <Icon name="trash" className="size-4" />
                  </button>
                </div>
              )}
            </Reorder.Item>
          ))}
        </Reorder.Group>
      )}
    </SettingsCard>
  );
}

/* =====================================================================
   توزيع الدرجات: لكل مادة نسب أنواع التقييم، مجموعها 100
   ===================================================================== */
export function WeightsEditor({
  subjects,
  evalTypes,
  weights,
}: {
  subjects: { id: number; name: string }[];
  evalTypes: { id: number; name: string; category: string }[];
  weights: { subject_id: number; eval_type_id: number; weight: number }[];
}) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? 0);
  const initial = (sid: number) => Object.fromEntries(weights.filter((w) => w.subject_id === sid).map((w) => [w.eval_type_id, Number(w.weight)]));
  const [vals, setVals] = useState<Record<number, number>>(initial(subjects[0]?.id ?? 0));
  const { pending, run } = useSave();
  const total = Object.values(vals).reduce((a, b) => a + (b || 0), 0);
  const dirty = JSON.stringify(vals) !== JSON.stringify(initial(subjectId));
  const configured = new Set(weights.map((w) => w.subject_id));

  return (
    <SettingsCard
      title="توزيع الدرجات"
      description="نسبة كل نوع تقييم من مجموع المادة. المجموع يجب أن يكون 100% بالضبط، والنتائج تُحسب منه لحظيًا."
      footer={
        <>
          <span className={`me-auto rounded-full px-3 py-1 text-sm font-bold tabular-nums ${Math.abs(total - 100) < 0.001 ? 'bg-ok-soft text-ok' : total === 0 ? 'bg-paper text-muted' : 'bg-danger-soft text-danger'}`}>
            المجموع {total}%
          </span>
          <SaveButton
            pending={pending}
            dirty={dirty}
            onClick={() =>
              run(() => saveWeights(subjectId, Object.entries(vals).map(([k, v]) => ({ eval_type_id: Number(k), weight: v || 0 }))), undefined, {
                title: `حفظ توزيع درجات ${subjects.find((x) => x.id === subjectId)?.name}؟`,
                body: 'تُعاد حسبة نتائج هذه المادة لكل الطلاب فورًا بالنسب الجديدة.',
              })
            }
          />
        </>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {subjects.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => { setSubjectId(s.id); setVals(initial(s.id)); }}
            aria-pressed={s.id === subjectId}
            className={`relative rounded-full px-3 py-1.5 text-sm transition-colors ${s.id === subjectId ? 'bg-board text-chalk' : 'bg-paper hover:bg-board/10'}`}
          >
            {s.name}
            {!configured.has(s.id) && <span className="absolute -top-0.5 end-0 size-2 rounded-full bg-danger" title="بلا توزيع" />}
          </button>
        ))}
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-paper">
        <div className="flex h-full">
          {evalTypes.map((e, i) =>
            vals[e.id] ? (
              <motion.span key={e.id} layout className="h-full" style={{ width: `${Math.min(100, vals[e.id])}%`, background: `hsl(${150 + i * 32} 34% ${36 + (i % 3) * 9}%)` }} title={`${e.name}: ${vals[e.id]}%`} />
            ) : null,
          )}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {evalTypes.map((e) => (
          <label key={e.id} className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5">
            <span className="min-w-0 flex-1 text-sm">
              {e.name}
              {e.category === 'exam' && <span className="ms-1.5 text-xs text-brass">(اختبار)</span>}
            </span>
            <span className="relative w-24">
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={vals[e.id] ?? ''}
                onChange={(ev) => setVals((v) => ({ ...v, [e.id]: ev.target.value === '' ? 0 : Number(ev.target.value) }))}
                className="field py-2 pe-7 text-center tabular-nums"
                dir="ltr"
              />
              <span className="pointer-events-none absolute inset-y-0 end-2.5 grid place-items-center text-sm text-muted">%</span>
            </span>
          </label>
        ))}
      </div>
    </SettingsCard>
  );
}
