'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '@/components/shell/icons';
import { subjectColor } from '@/components/timetable-grid';
import { fmtBytes } from '@/lib/assess/shared';
import { PROVIDER_LABEL, fileHref, fmtMinutes, parseMedia, relTime, type ContentAttachment, type ContentKind } from '@/lib/content/shared';

/* =====================================================================
   عناصر عرض المحتوى المشتركة: الصورة المصغّرة، المشغّل، نص الإثراء، النافذة
   ===================================================================== */

/** صورة الفيديو من يوتيوب، وإلا لوح بلون المادة ونقشة */
export function MediaThumb({ kind, url, subject, minutes, className = '', children }: { kind: ContentKind; url: string | null; subject: string; minutes?: number | null; className?: string; children?: React.ReactNode }) {
  const m = parseMedia(url);
  const [ok, setOk] = useState(true);
  const color = subjectColor(subject);
  return (
    <div className={`relative isolate overflow-hidden ${className}`} style={{ background: `linear-gradient(135deg, ${color}, ${color}cc 55%, #1f2a24)` }}>
      {m?.thumb && ok ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.thumb} alt="" loading="lazy" onError={() => setOk(false)} className="absolute inset-0 -z-10 size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
      ) : (
        <svg aria-hidden className="absolute inset-0 -z-10 size-full opacity-[0.13]">
          <defs>
            <pattern id={`t-${color.slice(1)}`} width="34" height="34" patternUnits="userSpaceOnUse">
              <path d="M17 2 L32 17 L17 32 L2 17 Z" fill="none" stroke="#fff" strokeWidth="1.4" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#t-${color.slice(1)})`} />
        </svg>
      )}
      {m?.thumb && ok && <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/45 via-transparent to-transparent" />}
      <div className="absolute inset-0 grid place-items-center">
        <span className={`grid size-12 place-items-center rounded-full ${kind === 'video' ? 'bg-white/90 text-ink shadow-[0_8px_24px_-8px_rgb(0_0_0/0.6)]' : 'bg-white/15 text-white ring-1 ring-white/30'} transition-transform duration-300 group-hover:scale-110`}>
          {kind === 'video' ? (
            <svg viewBox="0 0 20 20" className="size-5 translate-x-[-1px]" fill="currentColor"><path d="m7 5 8 5-8 5z" /></svg>
          ) : (
            <Icon name="content" className="size-5" />
          )}
        </span>
      </div>
      {minutes ? <span className="absolute bottom-2 end-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[0.7rem] font-semibold text-white">{fmtMinutes(minutes)}</span> : null}
      {m && m.provider !== 'youtube' && kind === 'video' && <span className="absolute bottom-2 start-2 rounded-md bg-black/40 px-1.5 py-0.5 text-[0.65rem] text-white/90">{PROVIDER_LABEL[m.provider]}</span>}
      {children}
    </div>
  );
}

/** مشغّل مضمّن (يوتيوب بلا تتبع/فيميو/درايف) مع هيكل تحميل، وإلا زر فتح الرابط */
export function Player({ url, title }: { url: string | null; title: string }) {
  const m = parseMedia(url);
  const [loaded, setLoaded] = useState(false);
  if (!m) return null;
  if (m.provider === 'link')
    return (
      <a href={m.watch} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 rounded-2xl border border-line bg-paper/60 p-4 transition-colors hover:border-board/40">
        <span className="grid size-11 place-items-center rounded-xl bg-board text-chalk"><Icon name="link" className="size-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold group-hover:text-board">فتح الرابط</span>
          <span className="block truncate text-xs text-muted" dir="ltr" style={{ textAlign: 'right' }}>{m.host}</span>
        </span>
        <Icon name="chevron" className="size-4 text-muted" />
      </a>
    );
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-ink">
      {!loaded && (
        <div className="absolute inset-0 grid place-items-center">
          <span className="spinner border-chalk/30 border-t-chalk" />
        </div>
      )}
      <iframe
        src={m.embed}
        title={title}
        onLoad={() => setLoaded(true)}
        className={`absolute inset-0 size-full transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

/** نص الإثراء: فقرات وروابط قابلة للضغط */
export function RichBody({ text }: { text: string }) {
  const parts = text.split(/(https:\/\/[^\s]+)/g);
  return (
    <div className="whitespace-pre-wrap text-[0.98rem] leading-[1.95]">
      {parts.map((p, i) =>
        /^https:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="break-all text-board underline decoration-board/30 underline-offset-4 hover:decoration-board" dir="ltr">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </div>
  );
}

export function AttachmentList({ items }: { items: ContentAttachment[] }) {
  if (!items.length) return null;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {items.map((a) => (
        <li key={a.storage_path}>
          <a href={fileHref(a.storage_path)} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5 transition-colors hover:border-board/40">
            {a.kind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileHref(a.storage_path)} alt="" className="size-11 shrink-0 rounded-lg object-cover" loading="lazy" />
            ) : (
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-brass-soft text-[0.65rem] font-bold uppercase text-brass">{a.storage_path.split('.').pop()}</span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium group-hover:text-board">{a.name}</span>
              <span className="text-xs text-muted">{fmtBytes(a.size_bytes)}</span>
            </span>
            <Icon name="download" className="size-4 text-muted group-hover:text-board" />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** نافذة وسطية على الحاسوب، وملء الشاشة على الجوال */
export function Modal({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: React.ReactNode; label: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', k);
    };
  }, [open, onClose]);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid sm:place-items-center sm:p-6" role="dialog" aria-modal="true" aria-label={label} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-ink/55 backdrop-blur-[3px]" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="relative flex max-h-dvh w-full flex-col overflow-hidden bg-surface shadow-[0_30px_80px_-20px_rgb(0_0_0/0.5)] sm:max-h-[92dvh] sm:max-w-4xl sm:rounded-[1.75rem]"
          >
            <button type="button" onClick={onClose} aria-label="إغلاق" className="absolute end-3 top-3 z-10 grid size-10 place-items-center rounded-full bg-surface/90 text-ink shadow ring-1 ring-line backdrop-blur hover:bg-paper">
              <Icon name="close" className="size-5" />
            </button>
            <div className="overflow-y-auto overscroll-contain">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** "قبل ساعتين" — يُحسب بالوقت الحالي، فلا يُعدّ اختلافه بين الخادم والمتصفح خطأ */
export function TimeAgo({ iso }: { iso: string | null | undefined }) {
  return <span suppressHydrationWarning>{relTime(iso)}</span>;
}
