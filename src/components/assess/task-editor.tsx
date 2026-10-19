'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { ChipSelect, Field } from '@/components/sheet';
import { saveTask, uploadAttachment } from '@/lib/assess/actions';
import type { AuthorContext, Attachment, TaskDetail } from '@/lib/assess/queries';
import { MAX_ATTACHMENT_BYTES, SUBMISSION_MODES, fmtBytes, type SubmissionMode } from '@/lib/assess/shared';
import { compressImage } from '@/lib/compress';
import { MathField, RichText } from './math';
import { ActionBar, CardChoice, DateTime, Section, Switch, TimesSummary } from './kit';

type Att = Omit<Attachment, 'id'> & { key: string };

export function TaskEditor({ ctx, task }: { ctx: AuthorContext; task?: TaskDetail }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const editing = !!task;
  const [title, setTitle] = useState(task?.title ?? '');
  const [classes, setClasses] = useState<number[]>(task ? [task.class_id] : ctx.classes.length === 1 ? [ctx.classes[0].value] : []);
  const [subject, setSubject] = useState<number | null>(task?.subject_id ?? null);
  const [term, setTerm] = useState<number | null>(task?.term_id ?? ctx.currentTerm);
  const [evalType, setEvalType] = useState<number | null>(task?.eval_type_id ?? null);
  const [teacher, setTeacher] = useState<number | null>(task?.teacher_id ?? null);
  const [maxScore, setMaxScore] = useState<string>(task?.max_score != null ? String(task.max_score) : '10');
  const [description, setDescription] = useState(task?.description ?? '');
  const [atts, setAtts] = useState<Att[]>(() => (task?.attachments ?? []).map((a, i) => ({ ...a, key: `a${i}` })));
  const [mode, setMode] = useState<SubmissionMode>(task?.submission_mode ?? 'any');
  const [publishAt, setPublishAt] = useState<string | null>(task?.published_at ?? null);
  const [dueAt, setDueAt] = useState<string | null>(task?.due_at ?? null);
  const [allowLate, setAllowLate] = useState(task?.allow_late ?? false);
  const [busy, setBusy] = useState<'draft' | 'publish' | null>(null);
  const [uploading, setUploading] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState({ name: '', url: '' });
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const hasSubmissions = (task?.submissions.length ?? 0) > 0;

  // المواد المشتركة بين الفصول المختارة
  const subjectOptions = useMemo(() => {
    if (!classes.length) return ctx.subjects;
    const sets = classes.map((c) => new Set(ctx.subjectsByClass[c] ?? []));
    return ctx.subjects.filter((s) => sets.every((x) => x.has(s.value)));
  }, [classes, ctx]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const f of Array.from(files).slice(0, 10 - atts.length)) {
      setUploading((n) => n + 1);
      try {
        let file = f;
        if (f.type.startsWith('image/') && f.size > 400 * 1024) file = await compressImage(f, { target: 500 * 1024, max: MAX_ATTACHMENT_BYTES });
        if (file.size > MAX_ATTACHMENT_BYTES) {
          toast(`"${f.name}" أكبر من 3 ميقا`, 'error');
          continue;
        }
        const fd = new FormData();
        fd.set('file', file);
        fd.set('purpose', 'task');
        const res = await uploadAttachment(fd);
        if (!res.ok) toast(res.error, 'error');
        else if (res.data) setAtts((a) => [...a, { ...res.data!, url: null, key: res.data!.storage_path }]);
      } catch (e) {
        toast((e as Error).message, 'error');
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const addLink = () => {
    const url = link.url.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) return toast('اكتب رابطًا صحيحًا يبدأ بـ https://', 'error');
    setAtts((a) => [...a, { key: url + a.length, kind: 'link', name: link.name.trim() || new URL(url).hostname, url, storage_path: null, mime: null, size_bytes: null, href: url }]);
    setLink({ name: '', url: '' });
    setLinkOpen(false);
  };

  const missing = [
    !title.trim() && 'العنوان',
    !classes.length && 'الفصل',
    !subject && 'المادة',
    !term && 'الفصل الدراسي',
    !evalType && 'نوع التقييم',
    !(Number(maxScore) > 0) && 'الدرجة العظمى',
    mode !== 'none' && !dueAt && 'موعد التسليم',
  ].filter(Boolean) as string[];

  const save = async (draft: boolean) => {
    if (missing.length) return toast(`أكمل: ${missing.join('، ')}`, 'error');
    if (uploading) return toast('انتظر اكتمال رفع المرفقات', 'info');
    const late = dueAt && new Date(dueAt).getTime() < Date.now();
    const ok = await confirm({
      title: draft ? 'حفظ المهمة مسودة؟' : editing ? 'حفظ التعديلات؟' : classes.length > 1 ? `نشر المهمة في ${classes.length} فصول؟` : 'نشر المهمة للطلاب؟',
      body: (
        <>
          {draft ? 'لن يراها الطلاب حتى تنشرها.' : 'راجع المواعيد قبل الحفظ:'}
          <TimesSummary
            rows={[
              { label: 'تظهر للطلاب', value: draft ? null : publishAt, empty: draft ? 'لا تظهر (مسودة)' : 'فور الحفظ' },
              { label: 'آخر موعد للتسليم', value: dueAt, empty: 'بلا موعد', warn: !!late },
              { label: 'بعد الموعد', value: null, empty: mode === 'none' ? 'بلا تسليم — رصد فقط' : allowLate ? 'يُقبل التسليم ويُعلَّم متأخرًا' : 'يُغلق التسليم' },
            ]}
          />
          {late && <p className="mt-2 font-semibold text-danger">تنبيه: موعد التسليم في الماضي!</p>}
        </>
      ),
      confirmLabel: draft ? 'حفظ مسودة' : editing ? 'حفظ' : 'نشر',
    });
    if (!ok) return;
    setBusy(draft ? 'draft' : 'publish');
    const res = await saveTask(
      task?.id ?? null,
      {
        title: title.trim(),
        description: description.trim() || null,
        subject_id: subject,
        term_id: term,
        eval_type_id: evalType,
        teacher_id: ctx.isAdmin ? teacher : null,
        max_score: Number(maxScore),
        published_at: publishAt,
        due_at: dueAt,
        submission_mode: mode,
        allow_late: allowLate,
        is_draft: draft,
        attachments: atts.map(({ kind, name, url, storage_path, mime, size_bytes }) => ({ kind, name, url, storage_path, mime, size_bytes })),
      },
      classes,
    );
    setBusy(null);
    if (!res.ok) return toast(res.error, 'error');
    toast(res.message);
    const ids = res.data?.ids ?? [];
    router.push(ids.length === 1 ? `/staff/tasks/${ids[0]}` : '/staff/tasks?kind=task');
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Section n={1} title="البيانات الأساسية" lead="لمن هذه المهمة، ومن أي مادة، وكم درجتها">
        <Field label="عنوان المهمة" required>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="مثال: بحث عن دورة الماء في الطبيعة" className="field text-[1.05rem]" />
        </Field>
        <div>
          <p className="label">
            {editing ? 'الفصل' : 'الفصول'} <span className="text-danger">*</span>
            {!editing && <span className="ms-2 text-xs font-normal text-muted">اختر أكثر من فصل لإنشاء نفس المهمة لكل منها</span>}
          </p>
          {editing ? (
            <p className="rounded-xl border border-line bg-paper/60 px-3 py-2.5 text-sm">{task.class_label}</p>
          ) : ctx.classes.length ? (
            <ChipSelect options={ctx.classes} value={classes} onChange={(v) => { setClasses(v); if (subject && !v.every((c) => (ctx.subjectsByClass[c] ?? []).includes(subject))) setSubject(null); }} />
          ) : (
            <p className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger">لا فصول ضمن نطاقك. اطلب من الإدارة تحديد فصولك وموادك.</p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="المادة" required>
            <select value={subject ?? ''} onChange={(e) => setSubject(Number(e.target.value) || null)} className="field">
              <option value="">اختر المادة</option>
              {subjectOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="الفصل الدراسي" required>
            <select value={term ?? ''} onChange={(e) => setTerm(Number(e.target.value) || null)} className="field">
              <option value="">اختر</option>
              {ctx.terms.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
        </div>
        <div>
          <p className="label">نوع المهمة (التقييم) <span className="text-danger">*</span></p>
          <div className="flex flex-wrap gap-1.5">
            {ctx.evalTypes.map((e) => (
              <button
                key={e.value}
                type="button"
                onClick={() => setEvalType(e.value)}
                aria-pressed={evalType === e.value}
                className={`rounded-full px-3.5 py-2 text-sm transition-all duration-200 active:scale-95 ${evalType === e.value ? 'bg-board text-chalk shadow-[0_6px_14px_-8px_rgb(53_104_84/0.9)]' : 'bg-paper hover:bg-board/10'}`}
              >
                {e.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">تُحسب الدرجة ضمن هذا النوع في نتيجة المادة حسب توزيع الدرجات.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="الدرجة العظمى" required hint={hasSubmissions ? 'تغييرها يحدّث كل الرصد بنفس الدرجات' : undefined}>
            <input type="number" inputMode="decimal" min={0.5} max={1000} step={0.5} value={maxScore} onChange={(e) => setMaxScore(e.target.value)} className="field tabular-nums" dir="ltr" />
          </Field>
          {ctx.isAdmin && (
            <Field label="المعلم" hint="فارغ = باسمك">
              <select value={teacher ?? ''} onChange={(e) => setTeacher(Number(e.target.value) || null)} className="field">
                <option value="">باسمي</option>
                {ctx.teachers.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
          )}
        </div>
      </Section>

      <Section n={2} title="المطلوب" lead="اكتب التعليمات وأرفق ما يحتاجه الطالب">
        <Field label="وصف المهمة والتعليمات">
          <MathField value={description} onChange={setDescription} rows={6} placeholder={'اكتب المطلوب بوضوح…\nيمكنك كتابة معادلات بين $ $ مثل $\\frac{a}{b}$'} />
        </Field>
        <div>
          <p className="label">المرفقات <span className="text-xs font-normal text-muted">صورة أو ملف (حتى 3 ميقا) أو رابط خارجي — حتى 10</span></p>
          <AnimatePresence initial={false}>
            {atts.length > 0 && (
              <motion.ul layout className="mb-3 grid gap-2 sm:grid-cols-2">
                {atts.map((a) => (
                  <motion.li
                    layout
                    key={a.key}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    className="flex items-center gap-3 rounded-xl border border-line p-2.5"
                  >
                    {a.kind === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.href} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-board/10 text-board">
                        <Icon name={a.kind === 'link' ? 'link' : 'clip'} className="size-5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <input
                        value={a.name}
                        onChange={(e) => setAtts((list) => list.map((x) => (x.key === a.key ? { ...x, name: e.target.value } : x)))}
                        className="w-full truncate rounded-md bg-transparent px-1 text-sm font-semibold focus:bg-paper focus:outline-none"
                        aria-label="اسم المرفق"
                      />
                      <p className="truncate px-1 text-xs text-muted" dir={a.kind === 'link' ? 'ltr' : undefined}>
                        {a.kind === 'link' ? a.url : `${a.kind === 'image' ? 'صورة' : 'ملف'} · ${fmtBytes(a.size_bytes ?? 0)}`}
                      </p>
                    </div>
                    <a href={a.href} target="_blank" rel="noopener noreferrer" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-board/10 hover:text-board" title="فتح">
                      <Icon name="eye" className="size-4" />
                    </a>
                    <button type="button" onClick={() => setAtts((list) => list.filter((x) => x.key !== a.key))} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger" title="إزالة">
                      <Icon name="close" className="size-4" />
                    </button>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
          <div className="flex flex-wrap gap-2">
            <input ref={imageRef} type="file" accept="image/*" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
            <input ref={fileRef} type="file" accept=".pdf,.docx,.pptx,.xlsx,image/*" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
            <button type="button" onClick={() => imageRef.current?.click()} disabled={atts.length >= 10} className="btn-quiet">
              <Icon name="image" className="size-4" /> صورة
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={atts.length >= 10} className="btn-quiet">
              <Icon name="clip" className="size-4" /> ملف
            </button>
            <button type="button" onClick={() => setLinkOpen((v) => !v)} disabled={atts.length >= 10} className="btn-quiet">
              <Icon name="link" className="size-4" /> رابط
            </button>
            {uploading > 0 && (
              <span className="inline-flex items-center gap-2 text-sm text-board">
                <span className="spinner" /> جارٍ الرفع ({uploading})…
              </span>
            )}
          </div>
          <AnimatePresence>
            {linkOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="mt-3 grid gap-2 rounded-xl border border-line bg-paper/50 p-3 sm:grid-cols-[1fr_1.5fr_auto]">
                  <input value={link.name} onChange={(e) => setLink((l) => ({ ...l, name: e.target.value }))} placeholder="الاسم (اختياري)" className="field" />
                  <input value={link.url} onChange={(e) => setLink((l) => ({ ...l, url: e.target.value }))} placeholder="https://" className="field" dir="ltr" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLink())} />
                  <button type="button" onClick={addLink} className="btn-primary">إضافة</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Section>

      <Section n={3} title="التسليم والمواعيد" lead="كيف يسلّم الطالب، ومتى">
        <div>
          <p className="label">طريقة التسليم</p>
          <CardChoice value={mode} onChange={setMode} cols={4} options={SUBMISSION_MODES.map((m) => ({ ...m, icon: m.value === 'text' ? 'text' : m.value === 'file' ? 'upload' : m.value === 'any' ? 'clip' : 'edit' }))} />
          {hasSubmissions && <p className="mt-2 text-xs text-brass">وصلت تسليمات، فلا يمكن تغيير طريقة التسليم.</p>}
          {(mode === 'file' || mode === 'any') && (
            <p className="mt-2 rounded-xl bg-board/[0.06] px-3 py-2 text-xs leading-relaxed text-board">
              حتى 5 ملفات، كل ملف 1 ميقا كحد أقصى. الصور تُضغط تلقائيًا في جهاز الطالب قبل الرفع. تُحذف ملفات التسليم بعد التصحيح حسب إعداد الإدارة، ويبقى النص والدرجة.
            </p>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="تظهر للطلاب">
            <DateTime value={publishAt} onChange={setPublishAt} quick="open" allowEmpty emptyLabel="فور النشر" />
          </Field>
          <Field label={mode === 'none' ? 'تاريخ المهمة' : 'آخر موعد للتسليم'} required={mode !== 'none'}>
            <DateTime value={dueAt} onChange={setDueAt} quick="due" />
          </Field>
        </div>
        {mode !== 'none' && <Switch checked={allowLate} onChange={setAllowLate} label="قبول التسليم المتأخر" hint="يبقى التسليم مفتوحًا بعد الموعد، ويظهر لك كل تسليم متأخر بعلامة." />}
      </Section>

      <Section n={4} title="كما يراها الطالب" icon="eye">
        <div className="rounded-2xl border border-line bg-paper/40 p-4">
          <p className="text-lg font-bold">{title || 'عنوان المهمة'}</p>
          <p className="text-sm text-muted">
            {ctx.subjects.find((s) => s.value === subject)?.label ?? 'المادة'} · {ctx.evalTypes.find((e) => e.value === evalType)?.label ?? 'نوع التقييم'} · من {Number(maxScore) || '—'}
          </p>
          {description && <RichText text={description} className="mt-3 block leading-relaxed" />}
          {atts.length > 0 && <p className="mt-3 text-sm text-board">{atts.length} مرفق</p>}
        </div>
      </Section>

      <ActionBar note={missing.length ? <>ينقص: {missing.join('، ')}</> : editing ? 'التعديل يظهر للطلاب فورًا' : 'كل شيء جاهز'}>
        <Link href={editing ? `/staff/tasks/${task.id}` : '/staff/tasks'} className="btn-quiet">إلغاء</Link>
        <button type="button" onClick={() => save(true)} disabled={!!busy} className="btn-quiet">
          {busy === 'draft' && <span className="spinner" />} مسودة
        </button>
        <button type="button" onClick={() => save(false)} disabled={!!busy} className="btn-primary px-6">
          {busy === 'publish' ? <span className="spinner" /> : <Icon name="send" className="size-4" />}
          {editing && !task.is_draft ? 'حفظ' : 'نشر'}
        </button>
      </ActionBar>
    </div>
  );
}
