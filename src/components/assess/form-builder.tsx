'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { ChipSelect, Field } from '@/components/sheet';
import { saveForm } from '@/lib/assess/actions';
import type { AuthorContext, FormDetail } from '@/lib/assess/queries';
import { blankQuestion, fromServer, newKey, questionIssues, toPayload, type DraftQuestion } from '@/lib/assess/draft';
import { QTYPES, SHOW_RESULTS, type QType, type ShowResults } from '@/lib/assess/shared';
import { MathField } from './math';
import { QuestionCard } from './question-editor';
import { ImportSheet } from './import-sheet';
import { ActionBar, CardChoice, DateTime, Section, Switch, TimesSummary } from './kit';
import { PreviewSheet } from './form-player';

export function FormBuilder({ ctx, form }: { ctx: AuthorContext; form?: FormDetail }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const editing = !!form;
  const locked = (form?.attempts.some((a) => !a.is_auto_absent) ?? false);
  const d = form?.details;

  const [title, setTitle] = useState(form?.title ?? '');
  const [description, setDescription] = useState(form?.description ?? '');
  const [classes, setClasses] = useState<number[]>(form ? [form.class_id] : ctx.classes.length === 1 ? [ctx.classes[0].value] : []);
  const [subject, setSubject] = useState<number | null>(form?.subject_id ?? null);
  const [term, setTerm] = useState<number | null>(form?.term_id ?? ctx.currentTerm);
  const [evalType, setEvalType] = useState<number | null>(form?.eval_type_id ?? null);
  const [teacher, setTeacher] = useState<number | null>(form?.teacher_id ?? null);
  const [questions, setQuestions] = useState<DraftQuestion[]>(() => (form?.questions ?? []).map(fromServer));
  const [opensAt, setOpensAt] = useState<string | null>(d?.opens_at ?? null);
  const [closesAt, setClosesAt] = useState<string | null>(d?.closes_at ?? null);
  const [timed, setTimed] = useState(Boolean(d?.time_limit_minutes));
  const [minutes, setMinutes] = useState(d?.time_limit_minutes ?? 30);
  const [attempts, setAttempts] = useState(d?.max_attempts ?? 1);
  const [shuffleQ, setShuffleQ] = useState(d?.shuffle_questions ?? false);
  const [shuffleO, setShuffleO] = useState(d?.shuffle_options ?? false);
  const [show, setShow] = useState<ShowResults>(d?.show_results ?? 'after_submit');
  const [track, setTrack] = useState(d?.track_focus ?? true);
  const [review, setReview] = useState(d?.allow_review ?? true);
  const [showIssues, setShowIssues] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // تنبيه قبل مغادرة صفحة فيها تعديلات غير محفوظة
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  const touch = <T,>(fn: (v: T) => void) => (v: T) => {
    setDirty(true);
    fn(v);
  };

  const subjectOptions = useMemo(() => {
    if (!classes.length) return ctx.subjects;
    const sets = classes.map((c) => new Set(ctx.subjectsByClass[c] ?? []));
    return ctx.subjects.filter((s) => sets.every((x) => x.has(s.value)));
  }, [classes, ctx]);

  const total = questions.reduce((a, q) => a + (Number.isFinite(q.points) ? q.points : 0), 0);
  const byType = QTYPES.map((t) => ({ ...t, n: questions.filter((q) => q.qtype === t.value).length })).filter((t) => t.n);
  const bad = questions.filter((q) => questionIssues(q).length);

  const add = (qtype: QType) => {
    setDirty(true);
    setQuestions((qs) => [...qs, blankQuestion(qtype, qs.at(-1)?.points ?? 1)]);
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight - window.innerHeight * 1.2, behavior: 'smooth' }), 80);
  };
  const updateQ = (key: string, q: DraftQuestion) => {
    setDirty(true);
    setQuestions((qs) => qs.map((x) => (x.key === key ? q : x)));
  };
  const move = (i: number, dir: -1 | 1) => {
    setDirty(true);
    setQuestions((qs) => {
      const n = [...qs];
      const [it] = n.splice(i, 1);
      n.splice(i + dir, 0, it);
      return n;
    });
  };
  const removeQ = async (q: DraftQuestion) => {
    if (q.body.trim() || q.id) {
      const ok = await confirm({ title: 'حذف السؤال؟', body: q.body.slice(0, 120) || 'سؤال فارغ', confirmLabel: 'حذف', danger: true });
      if (!ok) return;
    }
    setDirty(true);
    setQuestions((qs) => qs.filter((x) => x.key !== q.key));
  };

  const missing = [
    !title.trim() && 'العنوان',
    !classes.length && 'الفصل',
    !subject && 'المادة',
    !term && 'الفصل الدراسي',
    !evalType && 'نوع التقييم',
  ].filter(Boolean) as string[];

  const save = async (status: 'draft' | 'published' | 'keep') => {
    if (missing.length) return toast(`أكمل: ${missing.join('، ')}`, 'error');
    const finalStatus = status === 'keep' ? (d?.status ?? 'draft') : status;
    if (finalStatus === 'published') {
      setShowIssues(true);
      if (!questions.length) return toast('أضف سؤالًا واحدًا على الأقل قبل النشر', 'error');
      if (bad.length) return toast(`أكمل ${bad.length} سؤال فيه نقص (مُعلَّم بالأحمر)`, 'error');
      if (!closesAt) return toast('حدّد وقت إغلاق النموذج', 'error');
    } else if (bad.length) {
      setShowIssues(true);
      return toast(`أكمل ${bad.length} سؤال فيه نقص (مُعلَّم بالأحمر)`, 'error');
    }
    const closesPast = closesAt && new Date(closesAt).getTime() < Date.now();
    const shortWindow = timed && opensAt && closesAt && (new Date(closesAt).getTime() - new Date(opensAt).getTime()) / 60000 < minutes;
    const ok = await confirm({
      title: finalStatus === 'published' ? (classes.length > 1 ? `نشر النموذج في ${classes.length} فصول؟` : editing && d?.status === 'published' ? 'حفظ التعديلات؟' : 'نشر النموذج للطلاب؟') : 'حفظ النموذج مسودة؟',
      body: (
        <>
          <span className="block">
            {questions.length} سؤال · المجموع <b className="text-ink">{total}</b> درجة
            {locked ? ' · تعديل الإجابات الصحيحة أو الدرجات يعيد تصحيح كل المحاولات تلقائيًا' : ''}
          </span>
          <TimesSummary
            rows={[
              { label: 'يُفتح', value: opensAt, empty: finalStatus === 'published' ? 'فور النشر' : 'عند النشر' },
              { label: 'يُغلق', value: closesAt, empty: 'لم يُحدَّد', warn: !!closesPast },
              { label: 'مدة الحل', value: null, empty: timed ? `${minutes} دقيقة لكل طالب من لحظة بدئه` : 'بلا حد — حتى الإغلاق' },
              { label: 'المحاولات', value: null, empty: `${attempts} · ${SHOW_RESULTS.find((s) => s.value === show)?.label} تظهر النتيجة` },
              { label: 'بعد الحل', value: null, empty: show === 'never' ? 'لا يرى الطالب شيئًا' : review ? 'يستعرض الأسئلة وإجاباته' : 'الدرجة فقط — بلا استعراض الأسئلة' },
            ]}
          />
          {closesPast && <span className="mt-2 block font-semibold text-danger">تنبيه: وقت الإغلاق في الماضي — لن يستطيع أحد الحل!</span>}
          {shortWindow && <span className="mt-2 block font-semibold text-brass">تنبيه: الفترة بين الفتح والإغلاق أقصر من مدة الحل.</span>}
        </>
      ),
      confirmLabel: finalStatus === 'published' ? 'نشر' : 'حفظ',
    });
    if (!ok) return;
    setBusy(status);
    const res = await saveForm(
      form?.id ?? null,
      {
        title: title.trim(),
        description: description.trim() || null,
        subject_id: subject,
        term_id: term,
        eval_type_id: evalType,
        teacher_id: ctx.isAdmin ? teacher : null,
        questions: questions.map(toPayload),
        details: {
          status: finalStatus,
          opens_at: opensAt,
          closes_at: closesAt,
          max_attempts: attempts,
          time_limit_minutes: timed ? minutes : null,
          shuffle_questions: shuffleQ,
          shuffle_options: shuffleO,
          show_results: show,
          track_focus: track,
          allow_review: review,
          intro_video_url: d?.intro_video_url ?? null,
        },
      },
      classes,
    );
    setBusy(null);
    if (!res.ok) return toast(res.error, 'error');
    setDirty(false);
    toast(res.message);
    const ids = res.data?.ids ?? [];
    router.push(ids.length === 1 ? `/staff/tasks/${ids[0]}${editing ? '?tab=questions' : ''}` : '/staff/tasks?kind=form');
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {locked && (
        <div className="flex items-start gap-3 rounded-2xl border border-gold/40 bg-brass-soft px-4 py-3 text-sm text-brass">
          <Icon name="alert" className="mt-0.5 size-5 shrink-0" />
          <p className="leading-relaxed">
            <b>وصلت إجابات من الطلاب.</b> يمكنك تصحيح نص الأسئلة والدرجات والإجابة الصحيحة والإجابات المقبولة — وسيُعاد تصحيح كل المحاولات تلقائيًا فورًا. إضافة أسئلة أو حذفها أو تغيير نوعها غير متاح حفاظًا على عدالة التصحيح.
          </p>
        </div>
      )}

      <Section n={1} title="بيانات النموذج" lead="العنوان والفصول والمادة">
        <Field label="عنوان النموذج" required>
          <input value={title} onChange={(e) => touch(setTitle)(e.target.value)} maxLength={200} placeholder="مثال: اختبار قصير — الكسور العشرية" className="field text-[1.05rem]" />
        </Field>
        <Field label="تعليمات للطالب" hint="تظهر قبل بدء الحل">
          <MathField value={description} onChange={touch(setDescription)} rows={2} placeholder="مثال: اقرأ كل سؤال جيدًا، ولا تغادر الصفحة أثناء الحل." />
        </Field>
        <div>
          <p className="label">
            {editing ? 'الفصل' : 'الفصول'} <span className="text-danger">*</span>
            {!editing && <span className="ms-2 text-xs font-normal text-muted">اختر أكثر من فصل لإنشاء نسخة لكل فصل</span>}
          </p>
          {editing ? (
            <p className="rounded-xl border border-line bg-paper/60 px-3 py-2.5 text-sm">{form?.class_label}</p>
          ) : ctx.classes.length ? (
            <ChipSelect options={ctx.classes} value={classes} onChange={(v) => { touch(setClasses)(v); if (subject && !v.every((c) => (ctx.subjectsByClass[c] ?? []).includes(subject))) setSubject(null); }} />
          ) : (
            <p className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger">لا فصول ضمن نطاقك. اطلب من الإدارة تحديد فصولك وموادك.</p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="المادة" required>
            <select value={subject ?? ''} onChange={(e) => touch(setSubject)(Number(e.target.value) || null)} className="field">
              <option value="">اختر</option>
              {subjectOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="الفصل الدراسي" required>
            <select value={term ?? ''} onChange={(e) => touch(setTerm)(Number(e.target.value) || null)} className="field">
              <option value="">اختر</option>
              {ctx.terms.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="نوع التقييم" required>
            <select value={evalType ?? ''} onChange={(e) => touch(setEvalType)(Number(e.target.value) || null)} className="field">
              <option value="">اختر</option>
              {ctx.evalTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
        </div>
        {ctx.isAdmin && (
          <Field label="المعلم" hint="فارغ = باسمك">
            <select value={teacher ?? ''} onChange={(e) => touch(setTeacher)(Number(e.target.value) || null)} className="field sm:max-w-xs">
              <option value="">باسمي</option>
              {ctx.teachers.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
        )}
      </Section>

      <Section
        n={2}
        title="الأسئلة"
        lead={questions.length ? `${questions.length} سؤال · المجموع ${total} درجة` : 'أضف أسئلتك أو استوردها دفعة واحدة'}
        aside={
          <button type="button" onClick={() => setImporting(true)} disabled={locked} className="btn-quiet shrink-0 px-3 py-2 text-xs sm:text-sm">
            <Icon name="download" className="size-4" /> استيراد
          </button>
        }
      >
        {byType.length > 0 && (
          <div className="-mt-1 flex flex-wrap gap-1.5">
            {byType.map((t) => (
              <span key={t.value} className="rounded-full bg-paper px-2.5 py-1 text-xs font-medium">
                {t.label} <b className="tabular-nums">{t.n}</b>
              </span>
            ))}
          </div>
        )}

        {questions.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border-2 border-dashed border-line px-6 py-12 text-center">
            <span className="grid size-16 animate-float place-items-center rounded-2xl bg-brass-soft text-brass">
              <Icon name="forms" className="size-8" />
            </span>
            <p className="mt-4 text-lg font-semibold">لا أسئلة بعد</p>
            <p className="mt-1 max-w-sm text-sm text-muted">اختر نوع السؤال من الأسفل، أو الصق أسئلتك من Word أو Excel دفعة واحدة.</p>
            <button type="button" onClick={() => setImporting(true)} className="btn-quiet mt-4">
              <Icon name="download" className="size-4" /> استيراد من نص أو Excel
            </button>
          </div>
        ) : (
          <ol className="space-y-3">
            <AnimatePresence initial={false}>
              {questions.map((q, i) => (
                <QuestionCard
                  key={q.key}
                  q={q}
                  index={i}
                  total={questions.length}
                  locked={locked}
                  showIssues={showIssues}
                  onChange={(x) => updateQ(q.key, x)}
                  onMove={(dir) => move(i, dir)}
                  onDuplicate={() => {
                    setDirty(true);
                    setQuestions((qs) => {
                      const n = [...qs];
                      n.splice(i + 1, 0, { ...structuredClone(q), key: newKey(), id: undefined, options: q.options.map((o) => ({ ...o, id: undefined })) });
                      return n;
                    });
                  }}
                  onRemove={() => removeQ(q)}
                />
              ))}
            </AnimatePresence>
          </ol>
        )}

        {!locked && (
          <div className="rounded-2xl bg-paper/70 p-3">
            <p className="mb-2 text-xs font-semibold text-muted">إضافة سؤال</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {QTYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => add(t.value)}
                  className="group flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 text-start transition-all hover:-translate-y-0.5 hover:border-board/40 hover:shadow-[0_10px_24px_-18px_rgb(53_104_84/0.8)] active:scale-[0.98]"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-board/10 text-xs font-bold text-board transition-colors group-hover:bg-board group-hover:text-chalk" dir="ltr">{t.icon}</span>
                  <span className="min-w-0 text-sm font-semibold leading-tight">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section n={3} title="المواعيد والإعدادات" lead="متى يُفتح، وكم من الوقت، وماذا يرى الطالب">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="يُفتح للطلاب">
            <DateTime value={opensAt} onChange={touch(setOpensAt)} quick="open" allowEmpty emptyLabel="فور النشر" />
          </Field>
          <Field label="يُغلق" required>
            <DateTime value={closesAt} onChange={touch(setClosesAt)} quick="due" />
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Switch checked={timed} onChange={touch(setTimed)} label="مدة حل محددة لكل طالب" hint="يبدأ عدّاد كل طالب لحظة فتحه للنموذج، ويُسلَّم تلقائيًا عند انتهاء وقته." />
            <AnimatePresence>
              {timed && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="flex flex-wrap items-center gap-1.5 px-1 pt-1">
                    {[10, 15, 20, 30, 45, 60, 90].map((m) => (
                      <button key={m} type="button" onClick={() => touch(setMinutes)(m)} className={`rounded-full px-3 py-1.5 text-sm tabular-nums transition-all ${minutes === m ? 'bg-board text-chalk' : 'bg-paper hover:bg-board/10'}`}>
                        {m}
                      </button>
                    ))}
                    <input type="number" min={1} max={600} value={minutes} onChange={(e) => touch(setMinutes)(Math.max(1, Math.min(600, Number(e.target.value) || 1)))} className="field w-20 py-1.5 text-center tabular-nums" dir="ltr" />
                    <span className="text-sm text-muted">دقيقة</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line p-3.5">
            <span>
              <span className="block text-sm font-semibold">عدد المحاولات</span>
              <span className="block text-xs text-muted">آخر محاولة هي المعتمدة في الرصد</span>
            </span>
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => touch(setAttempts)(Math.max(1, attempts - 1))} className="grid size-9 place-items-center rounded-lg border border-line text-lg hover:border-board/40">−</button>
              <span className="w-8 text-center text-lg font-bold tabular-nums">{attempts}</span>
              <button type="button" onClick={() => touch(setAttempts)(Math.min(20, attempts + 1))} className="grid size-9 place-items-center rounded-lg border border-line text-lg hover:border-board/40">+</button>
            </span>
          </div>
          <Switch checked={shuffleQ} onChange={touch(setShuffleQ)} label="خلط ترتيب الأسئلة لكل طالب" hint="كل طالب يرى ترتيبًا مختلفًا ثابتًا طوال محاولته." />
          <Switch checked={shuffleO} onChange={touch(setShuffleO)} label="خلط ترتيب الخيارات" hint="لأسئلة الاختيار من متعدد. التوصيل يُخلط دائمًا." />
          <Switch checked={track} onChange={touch(setTrack)} label="رصد الخروج من الصفحة" hint="يُسجَّل كل خروج من الصفحة أو تبديل تبويب أثناء الحل، ويظهر لك في النتائج." />
          <Switch checked={review} onChange={touch(setReview)} label="السماح باستعراض الأسئلة بعد الحل" hint="أوقفه للاختبارات الشهرية والنهائية: يرى الطالب درجته فقط، دون الأسئلة وإجاباته والإجابات الصحيحة." />
        </div>
        <div>
          <p className="label">متى يرى الطالب نتيجته وإجاباته الصحيحة؟</p>
          <CardChoice value={show} onChange={touch(setShow)} cols={3} options={SHOW_RESULTS.map((s) => ({ ...s, hint: s.value === 'after_submit' ? 'الدرجة والمراجعة فورًا' : s.value === 'after_close' ? 'يمنع تسريب الإجابات أثناء الاختبار' : 'تبقى عندك فقط' }))} />
        </div>
      </Section>

      <ActionBar note={missing.length ? <>ينقص: {missing.join('، ')}</> : bad.length && showIssues ? <span className="text-danger">{bad.length} سؤال يحتاج إكمالًا</span> : `${questions.length} سؤال · ${total} درجة`}>
        <Link href={editing ? `/staff/tasks/${form.id}` : '/staff/tasks'} className="btn-quiet">إلغاء</Link>
        <button type="button" onClick={() => setPreview(true)} disabled={!questions.length} className="btn-quiet">
          <Icon name="eye" className="size-4" /> معاينة
        </button>
        {(!editing || d?.status === 'draft') && (
          <button type="button" onClick={() => save('draft')} disabled={!!busy} className="btn-quiet">
            {busy === 'draft' && <span className="spinner" />} مسودة
          </button>
        )}
        {editing && d?.status !== 'draft' ? (
          <button type="button" onClick={() => save('keep')} disabled={!!busy} className="btn-primary px-6">
            {busy === 'keep' ? <span className="spinner" /> : <Icon name="check" className="size-4" />} حفظ
          </button>
        ) : (
          <button type="button" onClick={() => save('published')} disabled={!!busy} className="btn-primary px-6">
            {busy === 'published' ? <span className="spinner" /> : <Icon name="send" className="size-4" />} نشر
          </button>
        )}
      </ActionBar>

      <ImportSheet open={importing} onClose={() => setImporting(false)} onImport={(qs) => { setDirty(true); setQuestions((cur) => [...cur, ...qs]); }} />
      <PreviewSheet open={preview} onClose={() => setPreview(false)} title={title || 'معاينة النموذج'} description={description} questions={questions} minutes={timed ? minutes : null} />
    </div>
  );
}
