'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '@/components/shell/icons';
import { MAX_AUDIO_SECONDS } from '@/lib/assess/shared';

/* =====================================================================
   مسجّل صوتي للتسميع والإلقاء: تسجيل ← استماع ← إعادة أو اعتماد
   يعمل في متصفح الجوال والحاسوب (WebM/Opus، أو MP4/AAC في سفاري)، بحد 5 دقائق.
   وبديل: رفع ملف صوتي سجّله الطالب بمسجّل جواله.
   ===================================================================== */

const pickType = () => {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) if (MediaRecorder.isTypeSupported(t)) return t;
  return '';
};
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function AudioRecorder({ onReady, disabled }: { onReady: (file: File) => void; disabled?: boolean }) {
  const [state, setState] = useState<'idle' | 'recording' | 'review'>('idle');
  const [secs, setSecs] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const raf = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const cleanup = () => {
    if (timer.current) clearInterval(timer.current);
    if (raf.current) cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => () => { cleanup(); if (url) URL.revokeObjectURL(url); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setError(null);
    const type = pickType();
    if (!navigator.mediaDevices?.getUserMedia || !type) return setError('المتصفح لا يدعم التسجيل — ارفع ملفًا صوتيًا من مسجّل جوالك بدلًا من ذلك');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return setError('لم يُسمح باستخدام الميكروفون. اسمح به من إعدادات المتصفح ثم أعد المحاولة');
    }
    chunks.current = [];
    const r = new MediaRecorder(stream.current, { mimeType: type, audioBitsPerSecond: 64000 });
    r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    r.onstop = () => {
      const b = new Blob(chunks.current, { type: type.split(';')[0] });
      setBlob(b);
      setUrl(URL.createObjectURL(b));
      setState('review');
      cleanup();
    };
    rec.current = r;
    r.start(1000);
    setSecs(0);
    setState('recording');
    const t0 = Date.now();
    timer.current = setInterval(() => {
      const s = (Date.now() - t0) / 1000;
      setSecs(s);
      if (s >= MAX_AUDIO_SECONDS) stop();
    }, 250);
    // مؤشر مستوى الصوت (يطمئن الطالب أن الميكروفون يسمعه)
    try {
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      ctx.createMediaStreamSource(stream.current).connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      const tick = () => {
        an.getByteFrequencyData(data);
        setLevel(Math.min(1, data.reduce((a, v) => a + v, 0) / data.length / 90));
        raf.current = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* المؤشر اختياري */ }
  };
  const stop = () => {
    if (rec.current && rec.current.state !== 'inactive') rec.current.stop();
  };
  const redo = () => {
    if (url) URL.revokeObjectURL(url);
    setUrl(null);
    setBlob(null);
    setState('idle');
  };
  const accept = () => {
    if (!blob) return;
    const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
    onReady(new File([blob], `تسجيل.${ext}`, { type: blob.type }));
    redo();
  };

  return (
    <div className="space-y-3">
      <AnimatePresence mode="wait" initial={false}>
        {state === 'recording' ? (
          <motion.div key="rec" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3 rounded-2xl bg-danger/5 px-4 py-6">
            <div className="relative grid size-20 place-items-center">
              <motion.span className="absolute inset-0 rounded-full bg-danger/20" animate={{ scale: 1 + level * 0.6 }} transition={{ duration: 0.12 }} />
              <span className="relative grid size-14 place-items-center rounded-full bg-danger text-white"><span className="size-4 animate-pulse rounded-full bg-white" /></span>
            </div>
            <p className="text-2xl font-bold tabular-nums" dir="ltr">{mmss(secs)} <span className="text-sm font-normal text-muted">/ {mmss(MAX_AUDIO_SECONDS)}</span></p>
            <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-danger transition-all" style={{ width: `${(secs / MAX_AUDIO_SECONDS) * 100}%` }} /></div>
            <button type="button" onClick={stop} className="btn-primary bg-danger px-6 hover:bg-danger/90"><span className="size-3 rounded-sm bg-white" /> إيقاف</button>
          </motion.div>
        ) : state === 'review' && url ? (
          <motion.div key="review" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3 rounded-2xl border border-board/25 bg-board/5 p-4">
            <p className="text-sm font-semibold">استمع لتسجيلك ({mmss(secs)}) قبل إرساله</p>
            <AudioPlayer src={url} />
            <div className="flex gap-2">
              <button type="button" onClick={accept} disabled={disabled} className="btn-primary flex-1"><Icon name="check" className="size-4" /> اعتماد التسجيل</button>
              <button type="button" onClick={redo} className="btn-quiet"><Icon name="undo" className="size-4" /> إعادة</button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={start} disabled={disabled} className="flex flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-board/40 bg-board/[0.03] px-3 py-6 text-sm font-semibold transition-colors hover:border-board hover:bg-board/[0.06]">
              <span className="grid size-12 place-items-center rounded-full bg-board text-chalk"><svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg></span>
              ابدأ التسجيل
              <span className="text-[0.7rem] font-normal text-muted">حتى 5 دقائق</span>
            </button>
            <button type="button" onClick={() => fileInput.current?.click()} disabled={disabled} className="flex flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-line px-3 py-6 text-sm font-semibold transition-colors hover:border-board/50">
              <Icon name="upload" className="size-7 text-board" /> رفع ملف صوتي
              <span className="text-[0.7rem] font-normal text-muted">من مسجّل الجوال · حتى 6 ميقا</span>
            </button>
            <input ref={fileInput} type="file" accept="audio/*,.m4a,.mp3,.amr,.ogg,.wav,.webm" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onReady(f); }} />
          </motion.div>
        )}
      </AnimatePresence>
      {error && <p className="flex items-start gap-2 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger"><Icon name="alert" className="mt-0.5 size-4 shrink-0" /> {error}</p>}
    </div>
  );
}

/** مشغّل صوت يصلح مدة تسجيلات المتصفح (WebM بلا مدة مسجّلة) ليعمل التقديم والتأخير */
export function AudioPlayer({ src, className = 'w-full' }: { src: string; className?: string }) {
  const fix = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const a = e.currentTarget;
    if (a.duration !== Infinity || a.dataset.fixed) return;
    a.dataset.fixed = '1';
    a.ontimeupdate = () => {
      a.ontimeupdate = null;
      a.currentTime = 0;
    };
    a.currentTime = 1e101;
  };
  return <audio src={src} controls preload="metadata" onLoadedMetadata={fix} className={className} />;
}
