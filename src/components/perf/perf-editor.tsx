'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { perfDelete, perfSave, perfSend, removePerfFile, uploadPerfFile } from '@/lib/perf/actions';
import { RATINGS, VISIT_LABEL, type PerfAttachment, type PerfBranch, type PerfForm, type PerfReport, type VisitType } from '@/lib/perf/shared';
import { PerfFileLink } from './perf-file-link';

const today = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);

export function PerfEditor({
  branches,
  branchId,
  form,
  report,
  terms,
}: {
  branches: PerfBranch[];
  branchId: number;
  form: PerfForm;
  report: PerfReport | null;
  terms: { id: number; name: string }[];
}) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [id, setId] = useState<number | null>(report?.id ?? null);
  const [visitType, setVisitType] = useState<VisitType>(report?.visit_type ?? 'field');
  const [visitDate, setVisitDate] = useState(report?.visit_date ?? today());
  const [termId, setTermId] = useState<number | null>(report?.term_id ?? null);
  const [text, setText] = useState({ strengths: report?.strengths ?? '', improvements: report?.improvements ?? '', recommendations: report?.recommendations ?? '', actions: report?.actions ?? '' });
  const initial: Record<string, { rating: number | null; note: string }> = {};
  for (const s of report?.sections ?? []) for (const i of s.items) initial[i.code] = { rating: i.rating, note: i.note ?? '' };
  const [scores, setScores] = useState(initial);
  const [files, setFiles] = useState<PerfAttachment[]>(report?.attachments ?? []);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<string | null>(null);

  const total = form.sections.reduce((a, s) => a + s.items.length, 0);
  const answered = useMemo(() => form.sections.reduce((a, s) => a + s.items.filter((i) => scores[i.code]?.rating != null).length, 0), [form, scores]);
  const branch = branches.find((b) => b.id === branchId);

  const draft = () => ({
    branch_id: branchId, term_id: termId, visit_type: visitType, visit_date: visitDate, ...text,
    scores: Object.entries(scores).filter(([, v]) => v.rating != null).map(([item, v]) => ({ item, rating: v.rating as number, note: v.note })),
  });

  const save = async (quiet = false): Promise<number | null> => {
    setBusy('save');
    const r = await perfSave(id, draft());
    setBusy(null);
    if (!r.ok) { toast(r.error, 'error'); return null; }
    if (!quiet) toast(r.message);
    if (!id) { setId(r.data!.id); router.replace(`/staff/performance/${r.data!.id}`); }
    return r.data!.id;
  };

  const send = async () => {
    if (answered < total) return toast(`أكمل تقييم كل البنود (ناقص ${total - answered})`, 'error');
    const ok = await confirm({
      title: 'إرسال التقرير لمدير الفروع؟',
      body: branch?.directors.length ? `يصل إلى: ${branch.directors.join('، ')}. لا يُعدَّل بعد الإرسال.` : 'لا مدير فروع مسند لهذا الفرع بعد، فيراه الإداري فقط. لا يُعدَّل بعد الإرسال.',
      confirmLabel: 'إرسال',
    });
    if (!ok) return;
    const rid = await save(true);
    if (!rid) return;
    setBusy('send');
    const r = await perfSend(rid);
    setBusy(null);
    if (!r.ok) return toast(r.error, 'error');
    toast(r.message);
    router.replace(`/staff/performance/${rid}`);
    router.refresh();
  };

  const remove = async () => {
    if (!id || !(await confirm({ title: 'حذف المسودة؟', body: 'تُحذف المسودة ومرفقاتها نهائيًا.', confirmLabel: 'حذف', danger: true }))) return;
    const r = await perfDelete(id);
    if (!r.ok) return toast(r.error, 'error');
    toast(r.message);
    router.replace('/staff/performance');
  };

  const pick = (section: string | null) => {
    if (!id) return toast('احفظ المسودة أولًا ثم أضف المرفقات', 'error');
    uploadFor.current = section;
    fileRef.current?.click();
  };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !id) return;
    const fd = new FormData();
    fd.set('file', f);
    setBusy('file');
    const r = await uploadPerfFile(id, uploadFor.current, fd);
    setBusy(null);
    if (!r.ok) return toast(r.error, 'error');
    setFiles((l) => [...l, r.data!]);
    toast(r.message);
  };
  const dropFile = async (a: PerfAttachment) => {
    const r = await removePerfFile(a.id);
    if (!r.ok) return toast(r.error, 'error');
    setFiles((l) => l.filter((x) => x.id !== a.id));
  };

  const Files = ({ section }: { section: string | null }) => (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {files.filter((a) => (a.section ?? null) === section).map((a) => <PerfFileLink key={a.id} a={a} onRemove={() => dropFile(a)} />)}
      <button type="button" onClick={() => pick(section)} disabled={busy === 'file'} className="btn-quiet px-3 py-1 text-xs">+ مرفق</button>
    </div>
  );

  return (
    <div className="space-y-5">
      <input ref={fileRef} type="file" className="hidden" accept="image/png,image/jpeg,image/webp,application/pdf,.docx,.pptx,.xlsx" onChange={onFile} />
      <Card title="بيانات المتابعة">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">الفرع
            <select className="field mt-1 w-full" value={branchId} disabled={!!id} onChange={(e) => router.push(`/staff/performance/new?branch=${e.target.value}`)}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.has_building ? ' · له مبنى' : ''}</option>)}
            </select>
          </label>
          <label className="block text-sm">نوع المتابعة
            <select className="field mt-1 w-full" value={visitType} onChange={(e) => setVisitType(e.target.value as VisitType)}>
              {Object.entries(VISIT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="block text-sm">تاريخ المتابعة
            <input type="date" className="field mt-1 w-full tabular-nums" value={visitDate} max={today()} onChange={(e) => e.target.value && setVisitDate(e.target.value)} />
          </label>
          <label className="block text-sm">الفصل الدراسي
            <select className="field mt-1 w-full" value={termId ?? ''} onChange={(e) => setTermId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs text-muted">
          {branch?.directors.length ? `يُرسل إلى مدير الفروع: ${branch.directors.join('، ')}` : 'لا مدير فروع مسند لهذا الفرع حتى الآن'}
          {form.has_building ? ' · يتضمن النموذج بنود المبنى والبيئة المدرسية' : ''}
        </p>
      </Card>

      {form.sections.map((s) => (
        <Card key={s.code} title={s.name}>
          <ul className="divide-y divide-line">
            {s.items.map((i) => {
              const v = scores[i.code];
              return (
                <li key={i.code} className="space-y-2 py-3">
                  <p className="font-medium">{i.title}</p>
                  <div role="radiogroup" aria-label={i.title} className="flex flex-wrap gap-1.5">
                    {RATINGS.map((r) => (
                      <button
                        key={r.v}
                        type="button"
                        role="radio"
                        aria-checked={v?.rating === r.v}
                        onClick={() => setScores((m) => ({ ...m, [i.code]: { rating: r.v, note: m[i.code]?.note ?? '' } }))}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition ${v?.rating === r.v ? r.cls + ' ring-2' : 'bg-surface text-muted ring-line hover:ring-board/40'}`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <input
                    value={v?.note ?? ''}
                    maxLength={1000}
                    onChange={(e) => setScores((m) => ({ ...m, [i.code]: { rating: m[i.code]?.rating ?? null, note: e.target.value } }))}
                    placeholder="ملاحظة (اختياري)"
                    className="field w-full text-sm"
                    aria-label={`ملاحظة: ${i.title}`}
                  />
                </li>
              );
            })}
          </ul>
          <Files section={s.code} />
        </Card>
      ))}

      <Card title="الخلاصة والتوصيات">
        <div className="grid gap-4 md:grid-cols-2">
          {([['strengths', 'نقاط القوة'], ['improvements', 'نقاط التحسين'], ['recommendations', 'التوصيات'], ['actions', 'الإجراءات المطلوبة من مدير الفرع']] as const).map(([k, l]) => (
            <label key={k} className="block text-sm">{l}
              <textarea className="field mt-1 w-full" rows={4} maxLength={4000} value={text[k]} onChange={(e) => setText((t) => ({ ...t, [k]: e.target.value }))} />
            </label>
          ))}
        </div>
        <p className="mt-3 text-sm font-medium">مرفقات عامة</p>
        <Files section={null} />
      </Card>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-lg backdrop-blur">
        <p className="text-sm text-muted">قُيّم {answered} من {total} بندًا</p>
        <div className="flex flex-wrap gap-2">
          {id && <button type="button" onClick={remove} className="btn-danger px-4">حذف المسودة</button>}
          <button type="button" onClick={() => save()} disabled={busy !== null} className="btn-quiet px-4">{busy === 'save' ? 'جارٍ الحفظ…' : 'حفظ المسودة'}</button>
          <button type="button" onClick={send} disabled={busy !== null || answered < total} className="btn-primary px-4">{busy === 'send' ? 'جارٍ الإرسال…' : 'إرسال لمدير الفروع'}</button>
        </div>
      </div>
    </div>
  );
}
