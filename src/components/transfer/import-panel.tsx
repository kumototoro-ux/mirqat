'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { Field } from '@/components/sheet';
import { SettingsCard, Switch } from '@/components/settings/editors';
import { backupContext } from '@/lib/transfer/maintenance';
import { commitStudents, previewStudents, studentTemplate, type StudentPreview } from '@/lib/transfer/students';
import { commitGrades, gradesTemplate, previewGrades, type GradesPreview } from '@/lib/transfer/grades';
import { Dropzone, Stat, Steps, downloadB64 } from './kit';

/* =====================================================================
   الاستيراد من Excel: الطلاب، ثم مجاميع فصل دراسي سابق
   ===================================================================== */

export function ImportPanel() {
  const ctx = useQuery({ queryKey: ['transfer-ctx'], queryFn: () => backupContext() });
  const c = ctx.data?.ok ? ctx.data.data : null;
  if (ctx.isLoading)
    return (
      <div className="space-y-4">
        {[0, 1].map((i) => <div key={i} className="h-64 animate-pulse rounded-[1.4rem] bg-paper" />)}
      </div>
    );
  if (!c) return <p className="rounded-2xl border border-line bg-surface p-6 text-center text-muted">تعذّر التحميل</p>;
  return (
    <div className="space-y-5">
      <StudentsImport branches={c.branches} />
      <GradesImport branches={c.branches} terms={c.terms} />
    </div>
  );
}

/* ------------------------------ الطلاب ------------------------------ */
function StudentsImport({ branches }: { branches: { id: number; name: string }[] }) {
  const { toast, confirm } = useFeedback();
  const [branch, setBranch] = useState(branches.length === 1 ? String(branches[0].id) : '');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<StudentPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [tpl, setTpl] = useState(false);
  const [createSections, setCreateSections] = useState(true);
  const [done, setDone] = useState<{ created: number; updated: number; failed: { row: number; error: string }[]; sections: number } | null>(null);
  const [filter, setFilter] = useState<'all' | 'error' | 'warn'>('all');

  const fd = (f: File) => {
    const d = new FormData();
    d.append('file', f);
    d.append('branch', branch);
    d.append('createSections', createSections ? '1' : '0');
    return d;
  };
  const template = async () => {
    setTpl(true);
    const r = await studentTemplate();
    setTpl(false);
    if (!r.ok) return toast(r.error, 'error');
    downloadB64(r.data.b64, r.data.name);
    toast('نُزّل النموذج');
  };
  const pick = async (f: File) => {
    setBusy(true);
    setDone(null);
    const r = await previewStudents(fd(f));
    setBusy(false);
    if (!r.ok) return toast(r.error, 'error');
    setFile(f);
    setPreview(r.data);
    setFilter(r.data.errors ? 'error' : 'all');
  };
  const reset = () => { setFile(null); setPreview(null); };
  const commit = async () => {
    if (!file || !preview) return;
    const ok = await confirm({
      title: `استيراد ${preview.valid} طالب؟`,
      body: (
        <>
          {preview.valid - preview.updates} جديد{preview.updates ? `، و${preview.updates} موجودون بنفس الرقم تُحدَّث بياناتهم` : ''}.
          {preview.errors ? ` يُتجاهل ${preview.errors} صف به أخطاء.` : ''}
          {preview.newSections.length && createSections ? ` وتُنشأ ${preview.newSections.length} شعبة جديدة.` : ''}
        </>
      ),
      confirmLabel: 'استيراد',
      run: async () => {
        const r = await commitStudents(fd(file));
        if (!r.ok) return r;
        setDone(r.data);
        reset();
        return { ok: true, message: `حُفظ ${r.data.created + r.data.updated} طالب` };
      },
    });
    void ok;
  };

  const rows = preview ? preview.rows.filter((r) => filter === 'all' || (filter === 'error' ? r.error : r.warn && !r.error)) : [];
  return (
    <SettingsCard title="استيراد الطلاب" description="نموذج جاهز بقوائم منسدلة، ثم رفع ومعاينة تدقق كل صف قبل الحفظ. الرقم الأكاديمي يمنع التكرار عند إعادة الرفع.">
      <div className="space-y-4">
        <Steps items={['تنزيل النموذج وتعبئته', 'رفع ومعاينة', 'حفظ', 'إنشاء الحسابات']} current={done ? 3 : preview ? 2 : 1} />
        <div className="flex flex-col gap-3 rounded-2xl bg-board/5 p-4 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm leading-relaxed">
            النموذج فيه قوائم منسدلة بالصفوف والشعب والفروع الموجودة. ويمكن رفع ورقة الطلاب من النظام القديم مباشرة — العناوين تُعرف بأسمائها.
          </p>
          <button type="button" onClick={template} disabled={tpl} className="btn-quiet shrink-0">
            {tpl ? <span className="spinner" /> : <Icon name="download" className="size-4" />} تنزيل النموذج
          </button>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {done ? (
            <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3 rounded-2xl border border-ok/30 bg-ok-soft/60 p-4">
              <p className="flex items-center gap-2 font-bold text-ok"><Icon name="check" className="size-5" /> اكتمل الاستيراد</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="جديد" value={done.created} tone="ok" />
                <Stat label="تحديث" value={done.updated} tone="board" />
                <Stat label="شعب أُنشئت" value={done.sections} />
                <Stat label="تعذّر" value={done.failed.length} tone={done.failed.length ? 'danger' : undefined} />
              </div>
              {done.failed.length > 0 && (
                <ul className="max-h-40 space-y-1 overflow-auto text-xs text-danger">
                  {done.failed.map((f, i) => <li key={i}>السطر {f.row}: {f.error}</li>)}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                <Link href="/staff/student-accounts" className="btn-primary"><Icon name="key" className="size-4" /> إنشاء حسابات الدخول</Link>
                <button type="button" onClick={() => setDone(null)} className="btn-quiet">ملف آخر</button>
              </div>
            </motion.div>
          ) : !preview ? (
            <motion.div key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              {branches.length > 1 && (
                <Field label="الفرع الافتراضي" hint="يُستخدم للصفوف التي عمود الفرع فيها فارغ أو غير موجود. الأسهل: ملف لكل فرع.">
                  <select value={branch} onChange={(e) => setBranch(e.target.value)} className="field">
                    <option value="">من عمود الفرع في الملف</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </Field>
              )}
              <Dropzone busy={busy} label="اختر ملف الطلاب أو اسحبه هنا" onFile={pick} />
            </motion.div>
          ) : (
            <motion.div key="preview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Stat label="صفوف الملف" value={preview.total} />
                <Stat label="صالحة" value={preview.valid} tone="ok" />
                <Stat label="تحديث موجود" value={preview.updates} tone="board" />
                <Stat label="بلا شعبة" value={preview.noSection} tone={preview.noSection ? 'gold' : undefined} />
                <Stat label="أخطاء" value={preview.errors} tone={preview.errors ? 'danger' : undefined} />
              </div>
              <div className="flex flex-wrap gap-1.5 text-[0.72rem]">
                {preview.headers.map((h) => (
                  <span key={h.key} className={`rounded-full px-2.5 py-1 ${h.found ? 'bg-ok-soft text-ok' : 'bg-paper text-muted'}`}>
                    {h.label}{h.found ? ` ← ${h.found}` : ' (غير موجود)'}
                  </span>
                ))}
              </div>
              {preview.noCode > 0 && (
                <p className="flex items-start gap-2 rounded-xl bg-brass-soft px-3 py-2 text-xs text-brass">
                  <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
                  {preview.noCode} طالب بلا رقم أكاديمي: يُولَّد لهم رقم تلقائي، وإعادة رفع الملف ستكررهم.
                </p>
              )}
              {preview.newSections.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl bg-brass-soft px-3 py-2.5 text-xs text-brass">
                  <span className="flex-1">شعب غير موجودة: <b>{preview.newSections.join('، ')}</b></span>
                  <span className="flex items-center gap-2 font-semibold">إنشاؤها تلقائيًا <Switch checked={createSections} onChange={setCreateSections} label="إنشاء الشعب" /></span>
                </div>
              )}
              <div className="flex gap-1.5">
                {([['all', 'الكل'], ['error', `الأخطاء (${preview.errors})`], ['warn', `التنبيهات (${preview.noSection})`]] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${filter === k ? 'bg-ink text-chalk' : 'bg-paper hover:bg-board/10'}`}>{l}</button>
                ))}
              </div>
              <div className="max-h-[22rem] overflow-auto rounded-2xl border border-line">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-paper text-muted">
                    <tr>{['السطر', 'الرقم', 'الاسم', 'الحالة', 'الصف', 'الشعبة', 'الفرع'].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 text-start font-semibold">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((r) => (
                      <tr key={r.row} className={r.error ? 'bg-danger/5' : r.warn ? 'bg-brass-soft/40' : ''}>
                        <td className="px-3 py-2 tabular-nums text-muted">{r.row}</td>
                        <td className="px-3 py-2 tabular-nums" dir="ltr">{r.code ?? <span className="text-brass">تلقائي</span>}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-semibold">{r.name_ar}</td>
                        <td className="min-w-40 px-3 py-2">
                          {r.error ? <span className="text-danger">{r.error}</span> : r.warn ? <span className="text-brass">{r.warn}</span> : r.existing ? <span className="text-board">تحديث</span> : <span className="text-ok">جديد</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">{r.grade || '—'}</td>
                        <td className="px-3 py-2">{r.section || '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2">{r.branch || '—'}</td>
                      </tr>
                    ))}
                    {!rows.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted">لا شيء هنا</td></tr>}
                  </tbody>
                </table>
              </div>
              {preview.total > preview.rows.length && <p className="text-xs text-muted">يُعرض أول {preview.rows.length} صف (الأخطاء أولًا) — الحفظ يشمل كل الصفوف الصالحة.</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={commit} disabled={!preview.valid} className="btn-primary"><Icon name="check" className="size-4" /> استيراد {preview.valid} طالب</button>
                <button type="button" onClick={reset} className="btn-quiet"><Icon name="undo" className="size-4" /> ملف آخر</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SettingsCard>
  );
}

/* ------------------------------ المجاميع ------------------------------ */
function GradesImport({ branches, terms }: { branches: { id: number; name: string }[]; terms: { id: number; name: string; year: string; is_current: boolean }[] }) {
  const { toast, confirm } = useFeedback();
  const [term, setTerm] = useState(String(terms[0]?.id ?? ''));
  const [branch, setBranch] = useState(branches.length === 1 ? String(branches[0].id) : '');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<GradesPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [tpl, setTpl] = useState(false);
  const [done, setDone] = useState<{ saved: number; failed: number } | null>(null);
  const termName = terms.find((t) => String(t.id) === term);

  const fd = (f: File) => {
    const d = new FormData();
    d.append('file', f);
    d.append('term', term);
    return d;
  };
  const template = async () => {
    setTpl(true);
    const r = await gradesTemplate(Number(term), branch ? Number(branch) : null);
    setTpl(false);
    if (!r.ok) return toast(r.error, 'error');
    downloadB64(r.data.b64, r.data.name);
    toast('نُزّل النموذج');
  };
  const pick = async (f: File) => {
    setBusy(true);
    setDone(null);
    const r = await previewGrades(fd(f));
    setBusy(false);
    if (!r.ok) return toast(r.error, 'error');
    setFile(f);
    setPreview(r.data);
  };
  const commit = async () => {
    if (!file || !preview) return;
    await confirm({
      title: `حفظ ${preview.values.toLocaleString('en')} درجة؟`,
      body: `لـ ${preview.students} طالب في ${preview.subjects} مادة — ${termName?.name} ${termName?.year}. تظهر في النتائج كرصد منقول، وإعادة الرفع تحدّثها.${preview.issueCount ? ` يُتجاهل ${preview.issueCount} موضع به مشكلة.` : ''}`,
      confirmLabel: 'حفظ الدرجات',
      run: async () => {
        const r = await commitGrades(fd(file));
        if (!r.ok) return r;
        setDone(r.data);
        setPreview(null);
        setFile(null);
        return { ok: true, message: `حُفظت ${r.data.saved} درجة` };
      },
    });
  };

  return (
    <SettingsCard title="استيراد مجاميع فصل دراسي" description="لنقل درجات الترم الأول من النظام القديم: ارفع ورقة «Grade Aggregation» كما هي، أو عبّئ النموذج. تظهر في النتائج وشهادة نهاية العام كرصد منقول.">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الفصل الدراسي">
            <select value={term} onChange={(e) => { setTerm(e.target.value); setPreview(null); }} className="field">
              {terms.map((t) => <option key={t.id} value={t.id}>{t.name} {t.year}</option>)}
            </select>
          </Field>
          {branches.length > 1 && (
            <Field label="فرع النموذج" hint="للنموذج فقط: يُعبّأ بطلاب الفرع ومواد فصولهم">
              <select value={branch} onChange={(e) => setBranch(e.target.value)} className="field">
                <option value="">كل الفروع</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
          )}
        </div>
        <div className="flex flex-col gap-3 rounded-2xl bg-board/5 p-4 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm leading-relaxed">النموذج بنفس أعمدة «Grade Aggregation»، فيه صف لكل طالب ومادة من مواد فصله، وورقة بأوزان كل نوع.</p>
          <button type="button" onClick={template} disabled={tpl || !term} className="btn-quiet shrink-0">
            {tpl ? <span className="spinner" /> : <Icon name="download" className="size-4" />} تنزيل النموذج
          </button>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {done ? (
            <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3 rounded-2xl border border-ok/30 bg-ok-soft/60 p-4">
              <p className="flex items-center gap-2 font-bold text-ok"><Icon name="check" className="size-5" /> حُفظت {done.saved.toLocaleString('en')} درجة{done.failed ? ` · تعذّر ${done.failed}` : ''}</p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/staff/results?term=${term}`} className="btn-primary"><Icon name="results" className="size-4" /> عرض النتائج</Link>
                <button type="button" onClick={() => setDone(null)} className="btn-quiet">ملف آخر</button>
              </div>
            </motion.div>
          ) : !preview ? (
            <motion.div key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Dropzone busy={busy} label="اختر ملف المجاميع أو اسحبه هنا" hint="xlsx · حتى 6 ميجابايت" onFile={pick} />
            </motion.div>
          ) : (
            <motion.div key="preview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Stat label="صفوف" value={preview.rows} />
                <Stat label="درجات صالحة" value={preview.values} tone="ok" />
                <Stat label="طلاب" value={preview.students} tone="board" />
                <Stat label="فصل دراسي آخر (تُتجاهل)" value={preview.skippedTerm} />
                <Stat label="مشكلات" value={preview.issueCount} tone={preview.issueCount ? 'danger' : undefined} />
              </div>
              <div className="flex flex-wrap gap-1.5 text-[0.72rem]">
                {preview.types.map((t) => (
                  <span key={t.title} className={`rounded-full px-2.5 py-1 ${t.matched ? 'bg-ok-soft text-ok' : 'bg-danger/10 text-danger'}`}>
                    {t.title}{t.matched ? (t.matched !== t.title ? ` ← ${t.matched}` : ' ✓') : ' (نوع غير موجود — يُتجاهل)'}
                  </span>
                ))}
              </div>
              {preview.issues.length > 0 && (
                <div className="max-h-56 overflow-auto rounded-2xl border border-danger/20">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-danger/10 text-danger"><tr>{['السطر', 'الطالب', 'المادة', 'المشكلة'].map((h) => <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-line">
                      {preview.issues.map((x, i) => (
                        <tr key={i}><td className="px-3 py-1.5 tabular-nums text-muted">{x.row || '—'}</td><td className="px-3 py-1.5 tabular-nums" dir="ltr">{x.code}</td><td className="px-3 py-1.5">{x.subject}</td><td className="px-3 py-1.5 text-danger">{x.error}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {preview.sample.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-muted">عينة: مجموع كل مادة كما سيظهر في النتائج</p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {preview.sample.map((x, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2 text-xs">
                        <span className="truncate"><b>{x.name || x.code}</b> · {x.subject}</span>
                        <b className="tabular-nums text-board" dir="ltr">{x.total}</b>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={commit} disabled={!preview.values} className="btn-primary"><Icon name="check" className="size-4" /> حفظ {preview.values.toLocaleString('en')} درجة</button>
                <button type="button" onClick={() => { setPreview(null); setFile(null); }} className="btn-quiet"><Icon name="undo" className="size-4" /> ملف آخر</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SettingsCard>
  );
}
