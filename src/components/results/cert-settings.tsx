'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { Field } from '@/components/sheet';
import { SettingsCard, Switch } from '@/components/settings/editors';
import { certImagesPreview, saveCertSettings } from '@/lib/results/cert-actions';
import { gradeKey, gradeLabel, principalTitle, type CertImageKind, type CertSettings, type YearCert } from '@/lib/results/certificate';
import { CERT_W, CertificateSheet } from './certificate';
import { CertImagesEditor } from './cert-images';

/* =====================================================================
   إعداد الشهادة كاملًا (النصوص والصور) مع معاينة حية —
   يُستخدم في الإعدادات العامة وفي تبويب الشهادات
   ===================================================================== */

type Base = Omit<CertSettings, 'images'>;

export function CertSettingsForm({
  settings,
  grades,
  stages,
  schoolName,
  principal,
  schoolLogo,
  images,
  onSaved,
}: {
  settings: CertSettings;
  grades: { id: number; name: string; stage_id: number }[];
  stages: { id: number; name: string }[];
  schoolName: string;
  principal: string;
  schoolLogo: string | null;
  images?: Partial<Record<CertImageKind, string>>;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const { confirm } = useFeedback();
  const base = useMemo(() => {
    const { images: _i, ...rest } = settings;
    void _i;
    return rest as Base;
  }, [settings]);
  const [v, setV] = useState<Base>(base);
  const [pending, setPending] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(base);
  const set = <K extends keyof Base>(k: K, val: Base[K]) => setV((x) => ({ ...x, [k]: val }));
  const stageName = (id: number) => stages.find((s) => s.id === id)?.name ?? '';
  const pt = principalTitle({ ...v, images: {} });

  const save = async () => {
    const ok = await confirm({
      title: 'حفظ إعداد الشهادة؟',
      body: 'يظهر في كل الشهادات التي تُعرض أو تُنزَّل من الآن.',
      confirmLabel: 'حفظ',
      run: async () => {
        setPending(true);
        try {
          return await saveCertSettings(v);
        } finally {
          setPending(false);
        }
      },
    });
    if (ok) {
      router.refresh();
      onSaved?.();
    }
  };

  const firstGrade = grades[0];
  return (
    <div className="space-y-5 pb-20">
      <CertPreview settings={{ ...v, images: {}, school_ar: v.school_ar || schoolName, principal_name: v.principal_name || principal }} images={images} schoolLogo={schoolLogo} stage={firstGrade ? stageName(firstGrade.stage_id) : null} grade={firstGrade?.name ?? null} />

      <CertImagesEditor images={images} schoolLogo={schoolLogo} />

      <SettingsCard title="نوع المدرسة والترويسة" description="المدارس الحكومية: اسم الدولة فقط. الخاصة والخيرية: يُكتب تحته الداعم أو الجهة المشرفة.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex rounded-2xl border border-line bg-paper p-1 sm:col-span-2" role="radiogroup" aria-label="نوع المدرسة">
            {([['public', 'حكومية', 'الترويسة: المملكة العربية السعودية'], ['private', 'خاصة / خيرية', 'تُضاف الجهة الداعمة تحت اسم الدولة']] as const).map(([k, l, h]) => (
              <button key={k} type="button" role="radio" aria-checked={v.school_type === k} onClick={() => set('school_type', k)} className={`relative flex-1 rounded-xl px-3 py-2.5 text-start transition-colors ${v.school_type === k ? 'text-chalk' : 'text-ink hover:bg-surface'}`}>
                {v.school_type === k && <motion.span layoutId="cert-school-type" className="absolute inset-0 rounded-xl bg-board" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                <span className="relative block text-sm font-semibold">{l}</span>
                <span className={`relative block text-[0.7rem] ${v.school_type === k ? 'text-chalk/75' : 'text-muted'}`}>{h}</span>
              </button>
            ))}
          </div>
          <Field label="السطر الأول (عربي)">
            <input value={v.header_ar} onChange={(e) => set('header_ar', e.target.value.slice(0, 120))} className="field" />
          </Field>
          <Field label="First line (English)">
            <input value={v.header_en} onChange={(e) => set('header_en', e.target.value.slice(0, 120))} className="field" dir="ltr" />
          </Field>
          {v.school_type === 'private' && (
            <>
              <Field label="الجهة الداعمة (عربي)" hint="كل سطر في سطر — مثال: المبرة الخيرية لصاحب السمو الأمير …">
                <textarea value={v.sponsor_ar} onChange={(e) => set('sponsor_ar', e.target.value.slice(0, 300))} rows={3} className="field" />
              </Field>
              <Field label="Sponsor (English)" hint="اختياري — يظهر تحت السطر الإنجليزي">
                <textarea value={v.sponsor_en} onChange={(e) => set('sponsor_en', e.target.value.slice(0, 300))} rows={3} className="field" dir="ltr" />
              </Field>
            </>
          )}
          <div className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3.5 py-3 sm:col-span-2">
            <span className="text-sm font-semibold">إظهار البسملة أعلى الشهادة</span>
            <Switch checked={v.show_basmala} onChange={(b) => set('show_basmala', b)} label="البسملة" />
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="العنوان والعام الدراسي" description="يُركَّب العنوان تلقائيًا من اسم الصف والعام. {الصف} و{العام} في العربي، {grade} و{year} في الإنجليزي.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="العام الدراسي الهجري" hint="مثال: 1447 – 1448">
            <input value={v.year_hijri} onChange={(e) => set('year_hijri', e.target.value.slice(0, 40))} className="field" dir="ltr" placeholder="1447 – 1448" />
          </Field>
          <Field label="العام الدراسي الميلادي" hint="مثال: 2025 - 2026">
            <input value={v.year_greg} onChange={(e) => set('year_greg', e.target.value.slice(0, 40))} className="field" dir="ltr" placeholder="2025 - 2026" />
          </Field>
          <Field label="قالب العنوان العربي">
            <input value={v.title_ar} onChange={(e) => set('title_ar', e.target.value.slice(0, 200))} className="field" />
          </Field>
          <Field label="English title template">
            <input value={v.title_en} onChange={(e) => set('title_en', e.target.value.slice(0, 200))} className="field" dir="ltr" />
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard title="اسم المدرسة">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="بالعربي" hint={schoolName ? `فارغ = ${schoolName}` : undefined}>
            <input value={v.school_ar} onChange={(e) => set('school_ar', e.target.value.slice(0, 120))} className="field" placeholder={schoolName} />
          </Field>
          <Field label="In English">
            <input value={v.school_en} onChange={(e) => set('school_en', e.target.value.slice(0, 120))} className="field" dir="ltr" placeholder="Dar Al-Huda School" />
          </Field>
          <Field label="رمز المدرسة" hint="اختياري — يظهر بجانب الاسم">
            <input value={v.school_code} onChange={(e) => set('school_code', e.target.value.slice(0, 30))} className="field" dir="ltr" />
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard title="مدير المدرسة" description="يظهر في أسفل الشهادة، والتوقيع تحت الاسم مباشرة.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex rounded-2xl border border-line bg-paper p-1 sm:col-span-2" role="radiogroup" aria-label="الجنس">
            {([['m', 'مدير'], ['f', 'مديرة']] as const).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={v.principal_gender === k} onClick={() => setV((x) => ({ ...x, principal_gender: k, principal_title: /^مدير(ة)? المدرسة$/.test(x.principal_title.trim()) ? '' : x.principal_title }))} className={`relative flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${v.principal_gender === k ? 'text-chalk' : 'text-ink hover:bg-surface'}`}>
                {v.principal_gender === k && <motion.span layoutId="cert-gender" className="absolute inset-0 rounded-xl bg-board" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                <span className="relative">{l}</span>
              </button>
            ))}
          </div>
          <Field label="الاسم" hint={principal ? `فارغ = ${principal}` : undefined}>
            <input value={v.principal_name} onChange={(e) => set('principal_name', e.target.value.slice(0, 80))} className="field" placeholder={principal} />
          </Field>
          <Field label="Name in English" hint="اختياري">
            <input value={v.principal_name_en} onChange={(e) => set('principal_name_en', e.target.value.slice(0, 80))} className="field" dir="ltr" />
          </Field>
          <Field label="المسمى الوظيفي" hint={`فارغ = ${v.principal_gender === 'f' ? 'مديرة المدرسة' : 'مدير المدرسة'}`}>
            <input value={v.principal_title} onChange={(e) => set('principal_title', e.target.value.slice(0, 60))} className="field" placeholder={pt.ar} />
          </Field>
          <Field label="Job title (English)" hint="فارغ = School Principal">
            <input value={v.principal_title_en} onChange={(e) => set('principal_title_en', e.target.value.slice(0, 60))} className="field" dir="ltr" placeholder="School Principal" />
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard title="أسماء الصفوف" description="تُركَّب تلقائيًا بلا تكرار (الأول + المتوسطة ← الصف الأول المتوسط · First Intermediate Grade). اكتب هنا فقط لتغييرها.">
        <div className="space-y-2">
          {grades.map((g) => {
            const st = stageName(g.stage_id);
            const key = gradeKey(st, g.name);
            const cur = v.grades[key] ?? { ar: '', en: '' };
            const auto = gradeLabel({ ...v, images: {}, grades: {} }, st, g.name);
            const put = (p: Partial<{ ar: string; en: string }>) => set('grades', { ...v.grades, [key]: { ...cur, ...p } });
            return (
              <div key={g.id} className="grid gap-2 rounded-xl bg-paper p-2.5 sm:grid-cols-[8rem_1fr_1fr] sm:items-center">
                <span className="text-sm font-semibold">{g.name} <span className="text-xs font-normal text-muted">{st}</span></span>
                <input value={cur.ar} onChange={(e) => put({ ar: e.target.value.slice(0, 80) })} placeholder={auto.ar} className="field py-2 text-sm" />
                <input value={cur.en} onChange={(e) => put({ en: e.target.value.slice(0, 80) })} placeholder={auto.en || 'Grade name in English'} className="field py-2 text-sm" dir="ltr" />
              </div>
            );
          })}
          {!grades.length && <p className="text-sm text-muted">لا صفوف بعد.</p>}
        </div>
      </SettingsCard>

      <SettingsCard title="عبارة الاجتياز والتذييل" description="{الصف} و{grade} تُستبدلان باسم الصف. لا تظهر العبارة لمن لم يجتز مادة أو لم تكتمل درجاته.">
        <div className="grid gap-4">
          <Field label="العبارة العربية">
            <textarea value={v.closing_ar} onChange={(e) => set('closing_ar', e.target.value.slice(0, 400))} rows={2} className="field" />
          </Field>
          <Field label="English sentence">
            <textarea value={v.closing_en} onChange={(e) => set('closing_en', e.target.value.slice(0, 400))} rows={2} className="field" dir="ltr" />
          </Field>
          <Field label="درجة النجاح في المادة" hint="المعدل السنوي للمادة من 100" className="sm:w-48">
            <input type="number" min={0} max={100} value={v.pass_mark} onChange={(e) => set('pass_mark', Math.max(0, Math.min(100, Number(e.target.value) || 0)))} className="field tabular-nums" dir="ltr" />
          </Field>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3.5 py-3">
            <span>
              <span className="block text-sm font-semibold">عبارة «صادرة إلكترونيًا من منصة مِرقاة»</span>
              <span className="block text-xs text-muted">سطر صغير أسفل الشهادة</span>
            </span>
            <Switch checked={v.show_footer} onChange={(b) => set('show_footer', b)} label="عبارة المنصة" />
          </div>
        </div>
      </SettingsCard>

      {/* شريط الحفظ يظهر عند وجود تعديل */}
      <motion.div
        initial={false}
        animate={{ y: dirty ? 0 : 90, opacity: dirty ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        className="sticky bottom-24 z-20 flex items-center gap-3 rounded-2xl border border-board/20 bg-surface/95 p-3 shadow-[0_18px_40px_-20px_rgb(31_42_36/0.5)] backdrop-blur lg:bottom-4"
        aria-hidden={!dirty}
      >
        <span className="flex-1 text-sm font-semibold">لديك تعديلات غير محفوظة</span>
        <button type="button" onClick={() => setV(base)} disabled={pending || !dirty} className="btn-quiet px-3 py-2 text-sm">تراجع</button>
        <button type="button" onClick={save} disabled={pending || !dirty} className="btn-primary px-4 py-2 text-sm">
          {pending ? <span className="spinner" /> : <Icon name="check" className="size-4" />} حفظ
        </button>
      </motion.div>
    </div>
  );
}

/* ---------------- معاينة حية ببيانات نموذجية ---------------- */
const SAMPLE: [string, string, boolean][] = [
  ['القرآن الكريم', 'The Holy Quran', false],
  ['الدراسات الإسلامية', 'Islamic Studies', false],
  ['اللغة العربية', 'Arabic Language', true],
  ['الرياضيات', 'Mathematics', true],
  ['العلوم', 'Science', true],
  ['اللغة الإنجليزية', 'English Language', true],
];

function sample(stage: string | null, grade: string | null): YearCert {
  const rows = (k: number) =>
    SAMPLE.map(([name, name_en, fin], i) => {
      const t = 100 - ((i + k) % 3);
      return { subject_id: i, name, name_en, term_work: 40, quizzes: fin ? 20 : 60 - ((i + k) % 3), final: fin ? 40 - ((i + k) % 3) : null, has: { term_work: true, quizzes: true, final: fin }, total: t, max: 100, pct: t };
    });
  return {
    student: { id: 0, code: 'S0000', name_ar: 'اسم الطالب للمعاينة', name_en: 'Sample Student Name', national_id: '1000000000', nationality: 'سعودي', birth_date: '2012-01-15', grade, stage } as YearCert['student'],
    terms: [
      { term: { id: 1, name: 'الفصل الدراسي الأول', year: '' }, rows: rows(0) },
      { term: { id: 2, name: 'الفصل الدراسي الثاني', year: '' }, rows: rows(1) },
    ],
    attendance: 100,
    intisab: false,
    behavior: 100,
    total: 1188,
    max: 1200,
    average: 99,
    below: [],
    missing: 0,
  };
}

function CertPreview({ settings, images, schoolLogo, stage, grade }: { settings: CertSettings; images?: Partial<Record<CertImageKind, string>>; schoolLogo: string | null; stage: string | null; grade: string | null }) {
  const q = useQuery({ queryKey: ['cert-images'], queryFn: () => certImagesPreview(), enabled: !images });
  const imgs = images ?? q.data ?? {};
  const [open, setOpen] = useState(true);
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / CERT_W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);
  const cert = useMemo(() => sample(stage, grade), [stage, grade]);

  return (
    <section className="overflow-hidden rounded-[1.4rem] border border-line bg-surface">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-4 text-start">
        <span className="grid size-10 place-items-center rounded-xl bg-board/10 text-board"><Icon name="eye" className="size-5" /></span>
        <span className="flex-1">
          <span className="block font-bold">معاينة حية</span>
          <span className="block text-xs text-muted">تتغير مع كل تعديل قبل الحفظ — ببيانات نموذجية</span>
        </span>
        <Icon name="chevron" className={`size-4 text-muted transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>
      {open && (
        <div className="border-t border-line bg-paper/60 p-3 sm:p-4">
          <div ref={wrap} className="w-full">
          <div className="mx-auto overflow-hidden rounded-xl shadow-[0_14px_34px_-22px_rgb(31_42_36/0.6)]" style={{ width: CERT_W * scale, height: 1123 * scale }}>
            <div style={{ width: CERT_W, transform: `scale(${scale})`, transformOrigin: 'top right' }}>
              <CertificateSheet key={JSON.stringify(settings) + Object.keys(imgs).join()} cert={cert} settings={settings} brand={{ logo: schoolLogo, images: imgs }} />
            </div>
          </div>
          </div>
        </div>
      )}
    </section>
  );
}
