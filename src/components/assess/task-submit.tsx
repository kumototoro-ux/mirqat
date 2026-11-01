'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { submitTask, uploadSubmissionFile } from '@/lib/assess/student-actions';
import { ACCEPT_FILES, MAX_AUDIO_BYTES, MAX_SUBMISSION_FILES, MAX_SUBMISSION_LINKS, fmtBytes, isAudio, type SubmissionMode } from '@/lib/assess/shared';
import { prepareUpload } from '@/lib/compress';
import { SymbolBar } from './math';
import { AudioPlayer, AudioRecorder } from './audio-recorder';

type F = { key: string; path?: string; name: string; size: number; mime: string; url?: string | null; state: 'ready' | 'compressing' | 'uploading' | 'error'; original?: number; error?: string };

export function TaskSubmit({
  assessmentId,
  mode,
  initialBody,
  initialFiles,
  initialLinks = [],
  late,
  resubmit,
}: {
  assessmentId: number;
  mode: SubmissionMode;
  initialBody: string;
  initialFiles: { path: string; name: string; size: number; mime: string; url: string | null }[];
  initialLinks?: string[];
  late: boolean;
  resubmit: boolean;
}) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [body, setBody] = useState(initialBody);
  const [files, setFiles] = useState<F[]>(initialFiles.map((f) => ({ ...f, key: f.path, state: 'ready' as const })));
  const [links, setLinks] = useState<string[]>(initialLinks.length ? initialLinks : mode === 'link' ? [''] : []);
  const [busy, setBusy] = useState(false);
  const [symbols, setSymbols] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const allowText = mode === 'text' || mode === 'any';
  const allowFiles = mode === 'file' || mode === 'any';
  const allowLinks = mode === 'link' || mode === 'any';
  const audioMode = mode === 'audio';
  // من يكتب الرابط بلا https:// تُضاف له تلقائيًا
  const cleanLinks = [...new Set(links.map((l) => l.trim()).filter(Boolean).map((l) => (/^[a-z][a-z0-9+.-]*:/i.test(l) ? l : `https://${l.replace(/^\/+/, '')}`)))];
  const badLink = cleanLinks.find((l) => !/^https:\/\/\S{3,}$/i.test(l));
  const working = files.some((f) => f.state === 'compressing' || f.state === 'uploading');

  const add = async (list: FileList | File[] | null) => {
    if (!list?.length) return;
    const limit = audioMode ? 1 : MAX_SUBMISSION_FILES;
    // التسجيل الصوتي: الجديد يحل محل السابق
    if (audioMode) setFiles([]);
    const room = audioMode ? 1 : limit - files.filter((f) => f.state !== 'error').length;
    if (room <= 0) return toast(`${MAX_SUBMISSION_FILES} ملفات كحد أقصى`, 'error');
    const chosen = Array.from(list).slice(0, room);
    for (const raw of chosen) {
      const key = `${raw.name}-${raw.size}-${Math.random().toString(36).slice(2)}`;
      setFiles((fs) => [...fs, { key, name: raw.name, size: raw.size, mime: raw.type, state: 'compressing', original: raw.size }]);
      try {
        if (audioMode && raw.size > MAX_AUDIO_BYTES) throw new Error('التسجيل أطول من المسموح (6 ميقا ≈ 5 دقائق)');
        const prepared = audioMode ? { file: raw } : await prepareUpload(raw);
        setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, state: 'uploading', size: prepared.file.size, name: prepared.file.name } : f)));
        const fd = new FormData();
        fd.set('assessment_id', String(assessmentId));
        fd.set('file', prepared.file);
        const res = await uploadSubmissionFile(fd);
        if (!res.ok) throw new Error(res.error);
        setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, state: 'ready', path: res.data!.path, name: res.data!.name, size: res.data!.size, mime: res.data!.mime, url: prepared.file.type.startsWith('image/') || isAudio(res.data!.mime) ? URL.createObjectURL(prepared.file) : null } : f)));
      } catch (e) {
        setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, state: 'error', error: (e as Error).message } : f)));
      }
    }
  };

  const submit = async () => {
    const ready = files.filter((f) => f.state === 'ready' && f.path);
    if (working) return toast('انتظر اكتمال رفع الملفات', 'info');
    if (mode === 'text' && !body.trim()) return toast('اكتب إجابتك', 'error');
    if (mode === 'file' && !ready.length) return toast('أرفق ملفًا أو صورة', 'error');
    if (mode === 'audio' && !ready.length) return toast('سجّل مقطعك الصوتي أولًا', 'error');
    if (badLink) return toast(`رابط غير صحيح: ${badLink} — يبدأ بـ https://`, 'error');
    if (mode === 'link' && !cleanLinks.length) return toast('أضف رابط عملك', 'error');
    if (mode === 'any' && !body.trim() && !ready.length && !cleanLinks.length) return toast('اكتب إجابتك أو أرفق ملفًا أو رابطًا', 'error');
    const ok = await confirm({
      title: resubmit ? 'تحديث التسليم؟' : 'تسليم المهمة؟',
      body: (
        <>
          {body.trim() && <span className="block">جواب نصي ({body.trim().length} حرف)</span>}
          {ready.length > 0 && <span className="block">{audioMode ? 'تسجيل صوتي' : `${ready.length} ملف`} · {fmtBytes(ready.reduce((a, f) => a + f.size, 0))}</span>}
          {cleanLinks.length > 0 && <span className="block">{cleanLinks.length === 1 ? 'رابط واحد' : cleanLinks.length === 2 ? 'رابطان' : `${cleanLinks.length} روابط`}</span>}
          {late && <span className="mt-2 block font-semibold text-danger">انتهى الموعد — سيُعلَّم التسليم متأخرًا.</span>}
          <span className="mt-2 block">يمكنك تعديل التسليم حتى يصححه المعلم{late ? '' : ' أو ينتهي الموعد'}.</span>
        </>
      ),
      confirmLabel: resubmit ? 'تحديث' : 'تسليم',
    });
    if (!ok) return;
    setBusy(true);
    const res = await submitTask(assessmentId, body, ready.map((f) => f.path!), cleanLinks);
    setBusy(false);
    if (!res.ok) return toast(res.error, 'error');
    toast(res.message);
    router.refresh();
  };

  return (
    <section className="rounded-[1.4rem] border border-board/25 bg-surface shadow-[0_18px_40px_-30px_rgb(53_104_84/0.8)]">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <span className="grid size-9 place-items-center rounded-xl bg-board text-chalk"><Icon name="send" className="size-[1.1rem]" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">{resubmit ? 'تعديل تسليمك' : 'تسليمك'}</h2>
          <p className="text-xs text-muted">{mode === 'text' ? 'جواب نصي' : mode === 'file' ? 'صورة أو ملف' : mode === 'link' ? 'رابط عملك' : mode === 'audio' ? 'تسجيل صوتي' : 'اكتب إجابتك أو أرفق ملفًا أو رابطًا'}</p>
        </div>
      </header>
      <div className="space-y-4 p-4 sm:p-5">
        {allowText && (
          <div>
            <textarea ref={area} value={body} onChange={(e) => setBody(e.target.value.slice(0, 20000))} rows={7} placeholder="اكتب إجابتك هنا…" className="field leading-relaxed" />
            <div className="mt-1.5 flex items-center gap-2">
              <button type="button" onClick={() => setSymbols((s) => !s)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${symbols ? 'bg-board text-chalk' : 'bg-paper text-muted'}`}>√ رموز</button>
              <span className="ms-auto text-xs tabular-nums text-muted">{body.length.toLocaleString('en')} / 20,000</span>
            </div>
            {symbols && (
              <div className="mt-2 rounded-xl bg-paper p-2">
                <SymbolBar
                  onInsert={(s) => {
                    const el = area.current;
                    const a = el?.selectionStart ?? body.length;
                    const b = el?.selectionEnd ?? body.length;
                    setBody(body.slice(0, a) + s + body.slice(b));
                    requestAnimationFrame(() => {
                      el?.focus();
                      el?.setSelectionRange(a + s.length, a + s.length);
                    });
                  }}
                />
              </div>
            )}
          </div>
        )}

        {allowFiles && (
          <div>
            <input ref={pick} type="file" accept={ACCEPT_FILES} multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
            <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => camera.current?.click()} className="flex flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-line px-3 py-5 text-sm font-semibold transition-colors hover:border-board/50 hover:bg-board/[0.03] sm:hidden">
                <Icon name="image" className="size-7 text-board" /> تصوير
              </button>
              <button type="button" onClick={() => pick.current?.click()} className="col-span-1 flex flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-line px-3 py-5 text-sm font-semibold transition-colors hover:border-board/50 hover:bg-board/[0.03] sm:col-span-2">
                <Icon name="upload" className="size-7 text-board" /> اختر صورًا أو ملفات
                <span className="text-[0.7rem] font-normal text-muted">حتى {MAX_SUBMISSION_FILES} · 1 ميقا لكل ملف · الصور تُضغط تلقائيًا</span>
              </button>
            </div>
            <AnimatePresence initial={false}>
              {files.length > 0 && (
                <motion.ul layout className="mt-3 space-y-2">
                  {files.map((f) => (
                    <motion.li layout key={f.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }} className={`flex items-center gap-3 rounded-xl border p-2.5 ${f.state === 'error' ? 'border-danger/30 bg-danger-soft/40' : 'border-line'}`}>
                      {f.url && f.mime.startsWith('image/') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.url} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-board/10 text-board">
                          {f.state === 'compressing' || f.state === 'uploading' ? <span className="spinner" /> : <Icon name={f.mime.startsWith('image/') ? 'image' : 'clip'} className="size-5" />}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{f.name}</p>
                        <p className={`text-xs ${f.state === 'error' ? 'text-danger' : 'text-muted'}`}>
                          {f.state === 'compressing'
                            ? 'جارٍ الضغط…'
                            : f.state === 'uploading'
                              ? `جارٍ الرفع… ${fmtBytes(f.size)}`
                              : f.state === 'error'
                                ? f.error
                                : f.original && f.original > f.size
                                  ? `${fmtBytes(f.original)} ← ${fmtBytes(f.size)} ✓`
                                  : `${fmtBytes(f.size)} ✓`}
                        </p>
                        {(f.state === 'compressing' || f.state === 'uploading') && (
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-paper"><div className="h-full w-1/2 animate-progress rounded-full bg-board" /></div>
                        )}
                      </div>
                      <button type="button" onClick={() => setFiles((fs) => fs.filter((x) => x.key !== f.key))} disabled={f.state === 'uploading'} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-30" aria-label="إزالة">
                        <Icon name="close" className="size-4" />
                      </button>
                    </motion.li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        )}

        {audioMode && (
          <div className="space-y-3">
            {!files.some((f) => f.state !== 'error') && <AudioRecorder onReady={(f) => add([f])} disabled={working} />}
            {files.map((f) => (
              <div key={f.key} className={`space-y-2 rounded-2xl border p-3 ${f.state === 'error' ? 'border-danger/30 bg-danger-soft/40' : 'border-ok/30 bg-ok-soft/40'}`}>
                <div className="flex items-center gap-2 text-sm">
                  {f.state === 'ready' ? <Icon name="check" className="size-4 text-ok" /> : f.state === 'error' ? <Icon name="alert" className="size-4 text-danger" /> : <span className="spinner" />}
                  <span className="flex-1 font-semibold">{f.state === 'ready' ? 'التسجيل جاهز للتسليم' : f.state === 'error' ? f.error : 'جارٍ رفع التسجيل…'}</span>
                  <span className="text-xs text-muted">{fmtBytes(f.size)}</span>
                  {f.state !== 'uploading' && f.state !== 'compressing' && (
                    <button type="button" onClick={() => setFiles([])} className="rounded-lg px-2 py-1 text-xs text-danger hover:bg-danger/10">{f.state === 'error' ? 'إعادة' : 'تسجيل جديد'}</button>
                  )}
                </div>
                {f.url && f.state === 'ready' && <AudioPlayer src={f.url} />}
              </div>
            ))}
          </div>
        )}

        {allowLinks && (
          <div className="space-y-2">
            <p className="label">{mode === 'link' ? 'رابط عملك' : 'روابط (اختياري)'}</p>
            {links.map((l, i) => (
              <div key={i} className="flex gap-2">
                <div className="relative flex-1" dir="ltr">
                  <Icon name="link" className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted" />
                  <input value={l} onChange={(e) => setLinks((ls) => ls.map((x, j) => (j === i ? e.target.value.slice(0, 500) : x)))} placeholder="https://…" dir="ltr" inputMode="url"
                    className={`field ps-9 ${l.trim() && /^[a-z][a-z0-9+.-]*:/i.test(l.trim()) && !/^https:\/\/\S{3,}$/i.test(l.trim()) ? 'border-danger' : ''}`} />
                </div>
                <button type="button" onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))} className="grid size-11 place-items-center rounded-xl text-muted hover:bg-danger-soft hover:text-danger" aria-label="حذف الرابط"><Icon name="close" className="size-4" /></button>
              </div>
            ))}
            {links.length < MAX_SUBMISSION_LINKS && (
              <button type="button" onClick={() => setLinks((ls) => [...ls, ''])} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-board hover:bg-board/10"><Icon name="plus" className="size-4" /> إضافة رابط</button>
            )}
          </div>
        )}

        <button type="button" onClick={submit} disabled={busy || working} className="btn-primary w-full py-3.5 text-base">
          {busy ? <span className="spinner" /> : <Icon name="send" className="size-5" />}
          {resubmit ? 'تحديث التسليم' : late ? 'تسليم متأخر' : 'تسليم'}
        </button>
      </div>
    </section>
  );
}
