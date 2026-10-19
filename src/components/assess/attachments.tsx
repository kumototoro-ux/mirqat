'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/shell/icons';
import type { Attachment } from '@/lib/assess/queries';
import { fmtBytes } from '@/lib/assess/shared';

/** مرفقات المعلم: الصور تُعرض وتُكبَّر داخل الصفحة، والملفات والروابط تُفتح في تبويب جديد */
export function Attachments({ items, className = '' }: { items: Attachment[]; className?: string }) {
  const [zoom, setZoom] = useState<string | null>(null);
  const images = items.filter((a) => a.kind === 'image');
  const others = items.filter((a) => a.kind !== 'image');
  useEffect(() => {
    if (!zoom) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setZoom(null);
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [zoom]);
  if (!items.length) return null;
  return (
    <section className={`rounded-[1.4rem] border border-line bg-surface p-4 ${className}`}>
      <p className="mb-3 flex items-center gap-2 text-sm font-bold"><Icon name="clip" className="size-4 text-board" /> المرفقات</p>
      {images.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((a) => (
            <button key={a.href} type="button" onClick={() => setZoom(a.href)} className="group overflow-hidden rounded-xl border border-line bg-paper">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.href} alt={a.name} className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {others.map((a) => (
            <li key={a.href}>
              <a href={a.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-line p-2.5 transition-colors hover:border-board/40">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-board/10 text-board">
                  <Icon name={a.kind === 'link' ? 'link' : 'clip'} className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{a.name}</span>
                  <span className="block truncate text-xs text-muted" dir={a.kind === 'link' ? 'ltr' : undefined}>
                    {a.kind === 'link' ? a.url?.replace(/^https?:\/\//, '') : fmtBytes(a.size_bytes ?? 0)}
                  </span>
                </span>
                <Icon name={a.kind === 'link' ? 'chevron' : 'download'} className="size-4 shrink-0 text-muted" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {zoom &&
        createPortal(
          <div className="fixed inset-0 z-[60] grid animate-fade-in place-items-center bg-ink/85 p-4" onClick={() => setZoom(null)} role="dialog" aria-modal="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zoom} alt="" className="max-h-full max-w-full rounded-xl object-contain shadow-2xl" />
            <button type="button" className="absolute end-4 top-4 grid size-11 place-items-center rounded-full bg-chalk/15 text-chalk" aria-label="إغلاق">
              <Icon name="close" className="size-6" />
            </button>
          </div>,
          document.body,
        )}
    </section>
  );
}
