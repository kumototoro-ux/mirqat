'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { Field, Sheet } from '@/components/sheet';
import { classYear, saveCertSettings } from '@/lib/results/cert-actions';
import { CertSettingsForm } from './cert-settings';
import { buildClassYear, certRating, fmt, type CertSettings, type YearCert } from '@/lib/results/certificate';
import { CertificateViewer, exportClassPdf, type CertBrand } from './certificate';
import type { RefData } from './results-admin';

/* =====================================================================
   شهادات نهاية العام: اختيار الفصل ← قائمة الطلاب ← معاينة/تنزيل، وإعداد الشهادة
   ===================================================================== */

const PAGE = 15;

export function CertificatesTab({ ref_, settings, brand, schoolName, principal }: { ref_: RefData; settings: CertSettings; brand: CertBrand; schoolName: string; principal: string }) {
  const years = useMemo(() => [...new Set(ref_.terms.map((t) => t.year))], [ref_.terms]);
  const currentYear = ref_.terms.find((t) => t.is_current)?.year ?? years[0] ?? '';
  const [year, setYear] = useState(currentYear);
  const [classId, setClassId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const terms = ref_.terms.filter((t) => t.year === year).map((t) => ({ id: t.id, name: t.name, year: t.year }));

  // ما يُعرض فعليًا: الحقول الفارغة تأخذ اسم المدرسة واسم المدير من الإعدادات العامة
  const eff: CertSettings = { ...settings, school_ar: settings.school_ar || schoolName, principal_name: settings.principal_name || principal };
  const incomplete = [
    !settings.year_hijri && !settings.year_greg && 'العام الدراسي',
    !settings.school_en && 'اسم المدرسة بالإنجليزية',
    !brand.images.signature && 'التوقيع',
    !brand.images.stamp && 'الختم',
  ].filter(Boolean) as string[];

  const groups = useMemo(() => {
    const m = new Map<string, RefData['classes']>();
    for (const c of ref_.classes) m.set(c.branch, [...(m.get(c.branch) ?? []), c]);
    return [...m.entries()];
  }, [ref_.classes]);

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[1.6rem] bg-board p-5 text-chalk sm:p-6">
        <div aria-hidden className="absolute -start-16 -top-20 size-64 rounded-full bg-gold/15 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-chalk/10 text-gold"><Icon name="award" className="size-7" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[1.35rem] font-bold leading-snug">شهادة نهاية العام</h2>
            <p className="text-sm text-chalk/75">تجمع فصول العام في شهادة واحدة ثنائية اللغة على نسق الشهادة المعتمدة، جاهزة للطباعة.</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <StudentToggle settings={settings} />
            <button type="button" onClick={() => setShowSettings(true)} className="btn-quiet flex-1 border-chalk/20 bg-chalk/10 text-chalk hover:bg-chalk/15 sm:flex-none">
              <Icon name="settings" className="size-4" /> إعداد الشهادة
            </button>
          </div>
        </div>
        {incomplete.length > 0 && (
          <button type="button" onClick={() => setShowSettings(true)} className="relative mt-4 flex w-full items-start gap-2 rounded-xl bg-gold/15 px-3 py-2 text-start text-xs text-chalk/90 transition-colors hover:bg-gold/20">
            <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-gold" />
            <span>أكمل إعداد الشهادة قبل الطباعة: <b>{incomplete.join('، ')}</b></span>
          </button>
        )}
      </section>

      <div className="flex flex-wrap items-end gap-3 rounded-[1.4rem] border border-line bg-surface p-4">
        {years.length > 1 && (
          <Field label="العام الدراسي" className="w-full sm:w-44">
            <select value={year} onChange={(e) => { setYear(e.target.value); setClassId(null); }} className="field">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>
        )}
        <Field label="الفصل" className="min-w-0 flex-1">
          <select value={classId ?? ''} onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : null)} className="field">
            <option value="">اختر الفصل…</option>
            {groups.map(([branch, list]) =>
              groups.length > 1 ? (
                <optgroup key={branch} label={branch}>{list.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>
              ) : (
                list.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)
              ),
            )}
          </select>
        </Field>
        <p className="w-full text-xs text-muted sm:w-auto sm:pb-3">
          الفصول الدراسية: {terms.map((t) => t.name).join(' + ') || '—'}
        </p>
      </div>

      <AnimatePresence mode="wait">
        {classId ? (
          <motion.div key={`${year}-${classId}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <ClassCerts classId={classId} label={ref_.classes.find((c) => c.id === classId)?.label ?? ''} terms={terms} settings={eff} brand={brand} />
          </motion.div>
        ) : (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid place-items-center rounded-[1.4rem] border border-dashed border-line bg-surface px-6 py-14 text-center">
            <Icon name="results" className="size-10 text-muted" />
            <p className="mt-3 font-semibold">اختر فصلًا لعرض شهادات طلابه</p>
            <p className="mt-1 text-sm text-muted">تُحسب من درجات كل فصول العام الدراسي {year}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <CertSettingsSheet open={showSettings} onClose={() => setShowSettings(false)} settings={settings} brand={brand} ref_={ref_} schoolName={schoolName} principal={principal} />
    </div>
  );
}

/* ------------------------- إتاحة الشهادة للطلاب ------------------------- */
function StudentToggle({ settings }: { settings: CertSettings }) {
  const router = useRouter();
  const { confirm } = useFeedback();
  const on = settings.student_visible;
  const flip = async () => {
    const { images: _i, ...rest } = settings;
    void _i;
    const ok = await confirm({
      title: on ? 'إخفاء الشهادة عن الطلاب؟' : 'إتاحة الشهادة للطلاب؟',
      body: on
        ? 'تختفي الشهادة من صفحة نتائج الطلاب فورًا.'
        : 'يرى كل طالب شهادته في صفحة نتائجه متى كانت نتائج كل فصول العام ظاهرة له (حسب قواعد إتاحة النتائج).',
      confirmLabel: on ? 'إخفاء' : 'إتاحة',
      danger: on,
      run: () => saveCertSettings({ ...rest, student_visible: !on }),
    });
    if (ok) router.refresh();
  };
  return (
    <button type="button" onClick={flip} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors sm:flex-none ${on ? 'bg-ok text-white hover:bg-ok/90' : 'bg-chalk text-board hover:bg-chalk/90'}`}>
      <Icon name={on ? 'eye' : 'key'} className="size-4" /> {on ? 'ظاهرة للطلاب' : 'غير ظاهرة للطلاب'}
    </button>
  );
}

/* ------------------------- شهادات فصل ------------------------- */
function ClassCerts({ classId, label, terms, settings, brand }: { classId: number; label: string; terms: { id: number; name: string; year: string }[]; settings: CertSettings; brand: CertBrand }) {
  const { toast } = useFeedback();
  const q = useQuery({ queryKey: ['class-year', classId, terms.map((t) => t.id).join(',')], queryFn: () => classYear(classId, terms), enabled: terms.length > 0 });
  const certs = useMemo(() => (q.data ? buildClassYear(q.data, settings.pass_mark) : []), [q.data, settings.pass_mark]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<YearCert | null>(null);
  const [batch, setBatch] = useState<number | null>(null);

  if (q.isLoading)
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-[1.4rem] bg-paper" />
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-paper" style={{ animationDelay: `${i * 80}ms` }} />)}
      </div>
    );
  if (q.isError)
    return (
      <div className="rounded-[1.4rem] border border-line bg-surface px-6 py-12 text-center">
        <p className="font-semibold">تعذّر تحميل الدرجات</p>
        <button type="button" onClick={() => q.refetch()} className="btn-quiet mt-4">إعادة المحاولة</button>
      </div>
    );

  const list = certs.filter((c) => !search.trim() || c.student.name_ar.includes(search.trim()) || c.student.code.includes(search.trim()));
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const view = list.slice(page * PAGE, page * PAGE + PAGE);
  const ready = certs.filter((c) => !c.below.length && !c.missing).length;
  const avgs = certs.filter((c) => c.average != null);
  const avg = avgs.length ? avgs.reduce((a, c) => a + Number(c.average), 0) / avgs.length : null;
  const safe = (s: string) => s.replace(/\s+/g, '-');

  const all = async () => {
    if (!certs.length) return;
    setBatch(0);
    try {
      await exportClassPdf(certs, settings, brand, `شهادات-${safe(label)}`, setBatch);
      toast(`نُزّلت ${certs.length} شهادة في ملف واحد`);
    } catch {
      toast('تعذّر تجهيز الملف. حاول مجددًا', 'error');
    } finally {
      setBatch(null);
    }
  };

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
        {[
          { l: 'الطلاب', v: String(certs.length) },
          { l: 'شهادات مكتملة', v: `${ready} من ${certs.length}`, t: ready === certs.length ? 'text-ok' : 'text-brass' },
          { l: 'معدل الفصل السنوي', v: avg == null ? '—' : `${fmt(avg)}%` },
          { l: 'دون درجة النجاح', v: String(certs.filter((c) => c.below.length).length), t: certs.some((c) => c.below.length) ? 'text-danger' : 'text-muted' },
        ].map((x) => (
          <div key={x.l} className="bg-surface px-4 py-3.5 sm:px-5">
            <dt className="text-sm text-muted">{x.l}</dt>
            <dd className={`mt-1 text-[1.35rem] font-bold tabular-nums ${x.t ?? ''}`}>{x.v}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="ابحث بالاسم أو الرقم" className="field ps-9" />
        </div>
        <button type="button" onClick={all} disabled={batch != null || !certs.length} className="btn-primary w-full sm:w-auto">
          {batch != null ? <><span className="spinner" /> {batch} / {certs.length}</> : <><Icon name="download" className="size-4" /> شهادات الفصل PDF</>}
        </button>
      </div>
      {batch != null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-paper">
          <motion.div className="h-full rounded-full bg-gold" animate={{ width: `${(batch / Math.max(1, certs.length)) * 100}%` }} />
        </div>
      )}

      {!certs.length ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-muted">لا طلاب لهم درجات في هذا الفصل خلال العام.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[1.4rem] border border-line bg-surface">
          {view.map((c, i) => {
            const r = certRating(c.average);
            return (
              <motion.li key={c.student.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.025 }}>
                <button type="button" onClick={() => setOpen(c)} className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-paper/60">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-board/10 text-sm font-bold text-board">{c.student.name_ar.slice(0, 1)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{c.student.name_ar}</span>
                    <span className="block truncate text-xs text-muted">
                      {c.student.code}
                      {c.below.length ? <span className="text-danger"> · دون النجاح: {c.below.join('، ')}</span> : null}
                      {c.missing ? <span className="text-brass"> · {c.missing} درجة لم تُرصد</span> : null}
                    </span>
                  </span>
                  <span className="text-end">
                    <span className="block font-bold tabular-nums" dir="ltr">{c.average == null ? '—' : `${fmt(c.average)}%`}</span>
                    <span className="block text-xs text-muted">{r?.ar ?? '—'}</span>
                  </span>
                  <Icon name="chevron" className="size-4 shrink-0 text-muted" />
                </button>
              </motion.li>
            );
          })}
        </ul>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="btn-quiet px-3 py-1.5">السابق</button>
          <span className="tabular-nums text-muted">{page + 1}/{pages}</span>
          <button type="button" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="btn-quiet px-3 py-1.5">التالي</button>
        </div>
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.student.name_ar ?? ''} subtitle={open ? `${open.student.code} · ${label}` : ''} wide>
        {open && (
          <div className="space-y-3">
            {(open.below.length > 0 || open.missing > 0) && (
              <p className="flex items-start gap-2 rounded-xl bg-brass-soft px-3 py-2 text-xs text-brass">
                <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
                <span>
                  {open.missing ? `${open.missing} درجة لم تُرصد بعد. ` : ''}
                  {open.below.length ? `دون درجة النجاح (${settings.pass_mark}) في: ${open.below.join('، ')}. ` : ''}
                  لذلك لا تظهر عبارة الاجتياز في الشهادة.
                </span>
              </p>
            )}
            <CertificateViewer cert={open} settings={settings} brand={brand} fileName={`شهادة-${safe(open.student.name_ar)}`} />
          </div>
        )}
      </Sheet>
    </div>
  );
}

/* ------------------------- إعداد الشهادة ------------------------- */
function CertSettingsSheet({ open, onClose, settings, brand, ref_, schoolName, principal }: { open: boolean; onClose: () => void; settings: CertSettings; brand: CertBrand; ref_: RefData; schoolName: string; principal: string }) {
  return (
    <Sheet open={open} onClose={onClose} title="إعداد الشهادة" subtitle="النصوص والصور — يُحفظ نفس الإعداد في صفحة الإعدادات" wide>
      <CertSettingsForm settings={settings} grades={ref_.grades} stages={ref_.stages} schoolName={schoolName} principal={principal} schoolLogo={brand.logo} images={brand.images} />
    </Sheet>
  );
}
