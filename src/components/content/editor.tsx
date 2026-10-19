'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { ChipSelect, Field, Sheet } from '@/components/sheet';
import { CardChoice, DateTime, Switch, fmtFull } from '@/components/assess/kit';
import { compressImage } from '@/lib/compress';
import { MAX_ATTACHMENT_BYTES, fmtBytes } from '@/lib/assess/shared';
import type { AuthorContext } from '@/lib/assess/queries';
import { linkMeta, saveContent, uploadContentFile, type ContentInput } from '@/lib/content/actions';
import { PROVIDER_LABEL, parseMedia, type ContentAttachment, type StaffContent } from '@/lib/content/shared';
import { Player } from './media';

/* =====================================================================
   إضافة/تعديل فيديو أو إثراء: رابط بمعاينة فورية وعنوان تلقائي، نص ومرفقات،
   نشر لعدة فصول، جدولة وإخفاء تلقائي، تثبيت، مسودة
   ===================================================================== */

export function ContentEditor({ ctx, item, copyFrom, defaultKind, onClose, onSaved }: { ctx: AuthorContext; item?: StaffContent | null; copyFrom?: StaffContent | null; defaultKind: 'video' | 'enrichment'; onClose: () => void; onSaved: () => void }) {
  const { toast, confirm } = useFeedback();
  const src = item ?? copyFrom ?? null;
  const editing = !!item;
  const [open, setOpen] = useState(true);
  const [kind, setKind] = useState<'video' | 'enrichment'>(src?.kind ?? defaultKind);
  const [url, setUrl] = useState(src?.url ?? '');
  const [title, setTitle] = useState(src?.title ?? '');
  const [description, setDescription] = useState(src?.description ?? '');
  const [body, setBody] = useState(src?.body ?? '');
  const [atts, setAtts] = useState<ContentAttachment[]>(src?.attachments ?? []);
  const [classes, setClasses] = useState<number[]>(item ? [item.class_id] : ctx.classes.length === 1 ? [ctx.classes[0].value] : []);
  const [subject, setSubject] = useState<number | null>(src?.subject_id ?? null);
  const [minutes, setMinutes] = useState(src?.minutes ? String(src.minutes) : '');
  const [when, setWhen] = useState<'now' | 'later'>(item?.status === 'scheduled' ? 'later' : 'now');
  const [publishAt, setPublishAt] = useState<string | null>(item?.status === 'scheduled' ? item.published_at : null);
  const [expires, setExpires] = useState<string | null>(item?.expires_at ?? null);
  const [pinned, setPinned] = useState(src?.is_pinned ?? false);
  const [busy, setBusy] = useState<'draft' | 'publish' | null>(null);
  const [uploading, setUploading] = useState(0);
  const [meta, setMeta] = useState<{ title: string | null; author: string | null } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const media = parseMedia(url);
  const close = () => { setOpen(false); setTimeout(onClose, 200); };

  // المواد المشتركة بين الفصول المختارة (من نطاق المعلم وتوزيع المواد)
  const subjectOptions = useMemo(() => {
    if (!classes.length) return ctx.subjects;
    const sets = classes.map((c) => new Set(ctx.subjectsByClass[c] ?? []));
    return ctx.subjects.filter((s) => sets.every((x) => x.has(s.value)));
  }, [classes, ctx]);
  useEffect(() => {
    if (subject && !subjectOptions.some((s) => s.value === subject)) setSubject(null);
    if (!subject && subjectOptions.length === 1) setSubject(subjectOptions[0].value);
  }, [subjectOptions, subject]);

  // عنوان الفيديو تلقائيًا من يوتيوب/فيميو
  useEffect(() => {
    if (!media || (media.provider !== 'youtube' && media.provider !== 'vimeo')) { setMeta(null); return; }
    let live = true;
    const t = setTimeout(async () => {
      const m = await linkMeta(url).catch(() => null);
      if (!live || !m) return;
      setMeta(m);
      if (m.title) setTitle((cur) => (cur.trim() ? cur : m.title!));
    }, 450);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const f of Array.from(files).slice(0, 5 - atts.length)) {
      setUploading((n) => n + 1);
      try {
        let file = f;
        if (f.type.startsWith('image/') && f.size > 400 * 1024) file = await compressImage(f, { target: 500 * 1024, max: MAX_ATTACHMENT_BYTES });
        if (file.size > MAX_ATTACHMENT_BYTES) { toast(`"${f.name}" أكبر من 3 ميقا — ضع رابطه بدلًا من رفعه`, 'error'); continue; }
        const fd = new FormData();
        fd.set('file', file);
        const res = await uploadContentFile(fd);
        if (!res.ok) toast(res.error, 'error');
        else if (res.data) setAtts((a) => [...a, res.data!]);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const missing = [
    !title.trim() && 'العنوان',
    !classes.length && 'الفصل',
    !subject && 'المادة',
    kind === 'video' && !media && 'رابط الفيديو',
    kind === 'enrichment' && !url.trim() && !body.trim() && !atts.length && 'رابط أو نص أو مرفق',
    when === 'later' && !publishAt && 'موعد النشر',
  ].filter(Boolean) as string[];

  const save = async (draft: boolean) => {
    if (missing.length) return toast(`أكمل: ${missing.join('، ')}`, 'error');
    if (url.trim() && !/^https:\/\/\S+$/i.test(url.trim())) return toast('الرابط يجب أن يبدأ بـ https://', 'error');
    const n = classes.length;
    const pub = when === 'later' ? publishAt : null;
    const ok = await confirm({
      title: draft ? 'حفظ كمسودة؟' : editing ? 'حفظ التعديلات؟' : pub ? 'جدولة النشر؟' : `نشر ${kind === 'video' ? 'الفيديو' : 'الإثراء'}؟`,
      body: draft ? (
        'لن يراه الطلاب حتى تنشره.'
      ) : (
        <>
          <b className="text-ink">{title.trim()}</b> — {n > 1 ? `${n} فصول` : ctx.classes.find((c) => c.value === classes[0])?.label}
          {pub ? `، يظهر للطلاب ${fmtFull(pub)}` : '، يظهر للطلاب فورًا'}
          {expires ? ` ويختفي ${fmtFull(expires)}` : ''}.
        </>
      ),
      confirmLabel: draft ? 'حفظ' : editing ? 'حفظ' : pub ? 'جدولة' : 'نشر',
    });
    if (!ok) return;
    setBusy(draft ? 'draft' : 'publish');
    const input: ContentInput = {
      kind,
      title: title.trim(),
      description: description.trim() || null,
      url: url.trim() || null,
      body: kind === 'enrichment' ? body.trim() || null : null,
      subject_id: subject,
      term_id: item?.term_id ?? ctx.currentTerm,
      minutes: kind === 'video' && Number(minutes) > 0 ? Math.min(600, Math.round(Number(minutes))) : null,
      published_at: pub,
      expires_at: expires,
      is_pinned: pinned,
      is_draft: draft,
      attachments: kind === 'enrichment' ? atts : [],
    };
    const res = await saveContent(item?.id ?? null, input, classes);
    setBusy(null);
    if (!res.ok) return toast(res.error, 'error');
    toast(res.message);
    onSaved();
    close();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={editing ? 'تعديل المحتوى' : copyFrom ? 'نسخ لفصول أخرى' : kind === 'video' ? 'فيديو جديد' : 'إثراء جديد'}
      subtitle={editing ? `${ctx.classes.find((c) => c.value === item!.class_id)?.label ?? ''}` : 'ينشر لفصل أو أكثر دفعة واحدة'}
      footer={
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => save(true)} disabled={!!busy || uploading > 0} className="btn-quiet px-4 py-3">
            {busy === 'draft' ? <span className="spinner" /> : null} مسودة
          </button>
          <button type="button" onClick={() => save(false)} disabled={!!busy || uploading > 0} className="btn-primary flex-1 py-3">
            {busy === 'publish' ? <span className="spinner" /> : <Icon name="send" className="size-4" />}
            {editing ? 'حفظ' : when === 'later' ? 'جدولة النشر' : 'نشر الآن'}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {!editing && (
          <CardChoice
            value={kind}
            onChange={setKind}
            options={[
              { value: 'video', label: 'فيديو', hint: 'يوتيوب أو فيميو أو درايف — يُشغَّل داخل المنصة', icon: 'play' },
              { value: 'enrichment', label: 'إثراء', hint: 'نص، رابط، ملفات PDF وصور', icon: 'content' },
            ]}
          />
        )}

        <Field label={kind === 'video' ? 'رابط الفيديو' : 'رابط (اختياري)'} required={kind === 'video'} hint={media ? `${PROVIDER_LABEL[media.provider]}${meta?.author ? ` · ${meta.author}` : ''}` : 'الصق الرابط كما هو من المتصفح أو التطبيق'}>
          <div className="relative">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtu.be/…" dir="ltr" className="field pe-10" inputMode="url" />
            {media && <Icon name="check" className="pointer-events-none absolute inset-y-0 end-3 my-auto size-5 text-ok" />}
          </div>
        </Field>
        {media?.embed && <Player url={url} title={title || 'معاينة'} />}

        <Field label="العنوان" required hint={meta?.title && title === meta.title ? 'من عنوان الفيديو — عدّله إن شئت' : undefined}>
          <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 200))} className="field" placeholder={kind === 'video' ? 'مثال: شرح جمع الكسور' : 'مثال: ملخص الوحدة الثانية'} />
        </Field>
        <Field label="وصف قصير" hint="يظهر تحت العنوان (اختياري)">
          <input value={description} onChange={(e) => setDescription(e.target.value.slice(0, 600))} className="field" />
        </Field>

        {kind === 'enrichment' && (
          <>
            <Field label="نص الإثراء" hint="الروابط داخل النص تصير قابلة للضغط">
              <textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 5000))} rows={6} className="field leading-relaxed" placeholder="اكتب ما تريد أن يقرأه الطالب…" />
            </Field>
            <div>
              <p className="mb-1.5 text-sm font-medium">المرفقات <span className="font-normal text-muted">({atts.length}/5 · حتى 3 ميقا للملف)</span></p>
              <div className="space-y-2">
                {atts.map((a) => (
                  <div key={a.storage_path} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                    <span className="grid size-8 place-items-center rounded-lg bg-brass-soft text-[0.6rem] font-bold uppercase text-brass">{a.storage_path.split('.').pop()}</span>
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <span className="text-xs text-muted">{fmtBytes(a.size_bytes)}</span>
                    <button type="button" onClick={() => setAtts((x) => x.filter((y) => y.storage_path !== a.storage_path))} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger" aria-label="إزالة">
                      <Icon name="trash" className="size-4" />
                    </button>
                  </div>
                ))}
                {atts.length < 5 && (
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading > 0} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line px-3 py-4 text-sm text-muted transition-colors hover:border-board/40 hover:text-board">
                    {uploading ? <><span className="spinner" /> جارٍ الرفع…</> : <><Icon name="upload" className="size-4" /> رفع ملف (PDF، صورة، Word، PowerPoint)</>}
                  </button>
                )}
                <input ref={fileRef} type="file" multiple hidden accept="image/*,.pdf,.docx,.pptx,.xlsx" onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
              </div>
            </div>
          </>
        )}

        {!editing && (
          <Field label="الفصول" required hint={classes.length > 1 ? `تُنشأ نسخة لكل فصل (${classes.length})` : undefined}>
            <ChipSelect options={ctx.classes.map((c) => ({ value: c.value, label: c.label }))} value={classes} onChange={setClasses} />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="المادة" required>
            <select value={subject ?? ''} onChange={(e) => setSubject(Number(e.target.value) || null)} className="field">
              <option value="">اختر المادة</option>
              {subjectOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          {kind === 'video' && (
            <Field label="المدة بالدقائق" hint="اختيارية">
              <input type="number" min={1} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="field tabular-nums" dir="ltr" />
            </Field>
          )}
        </div>

        <div className="space-y-4 rounded-2xl border border-line p-3.5">
          <p className="font-semibold">متى يظهر للطلاب؟</p>
          <div className="flex rounded-xl border border-line p-0.5 text-sm">
            {([['now', 'فور النشر'], ['later', 'في موعد محدد']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setWhen(k)} className={`flex-1 rounded-lg px-3 py-2 transition-colors ${when === k ? 'bg-board text-chalk' : 'text-muted hover:text-ink'}`}>{l}</button>
            ))}
          </div>
          {when === 'later' && <Field label="موعد النشر"><DateTime value={publishAt} onChange={setPublishAt} quick="open" /></Field>}
          <Field label="إخفاء تلقائي" hint="اختياري — يختفي عن الطلاب بعده">
            <DateTime value={expires} onChange={setExpires} quick="none" allowEmpty emptyLabel="بلا إخفاء" />
          </Field>
          <Switch checked={pinned} onChange={setPinned} label="تثبيت في أعلى القائمة" hint="يظهر أولًا للطلاب في هذا الفصل" />
        </div>
      </div>
    </Sheet>
  );
}
