'use client';

import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Icon } from '@/components/shell/icons';

/** منطقة اختيار/سحب ملف Excel */
export function Dropzone({ busy, label, onFile, accept = '.xlsx', hint = 'xlsx · حتى 3 ميجابايت' }: { busy: boolean; label: string; onFile: (f: File) => void; accept?: string; hint?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
        className={`flex w-full flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed px-4 py-9 text-center transition-colors ${over ? 'border-accent bg-accent/5' : 'border-line bg-paper/50 hover:border-accent/50'}`}
      >
        <span className="grid size-12 place-items-center rounded-2xl bg-surface text-accent shadow-sm">
          {busy ? <span className="spinner" /> : <Icon name="upload" className="size-6" />}
        </span>
        <span className="text-sm font-semibold">{busy ? 'جارٍ قراءة الملف وتدقيقه…' : label}</span>
        <span className="text-xs text-muted">{hint}</span>
      </button>
      <input ref={input} type="file" accept={accept} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
    </>
  );
}

export function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'danger' | 'gold' | 'board' }) {
  const c = tone === 'ok' ? 'bg-ok-soft text-ok' : tone === 'danger' ? 'bg-danger/10 text-danger' : tone === 'gold' ? 'bg-brass-soft text-brass' : tone === 'board' ? 'bg-accent/10 text-accent' : 'bg-paper text-ink';
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`rounded-2xl px-3.5 py-3 ${c}`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{typeof value === 'number' ? value.toLocaleString('en') : value}</p>
    </motion.div>
  );
}

/** تنزيل ملف من base64 يعيده الخادم */
export function downloadB64(b64: string, name: string, type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  downloadBlob(new Blob([bytes], { type }), name);
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function Steps({ items, current }: { items: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-xs">
      {items.map((t, i) => (
        <li key={t} className="flex items-center gap-1.5">
          <span className={`grid size-6 place-items-center rounded-full font-bold transition-colors ${i < current ? 'bg-ok text-on-ok' : i === current ? 'bg-board text-on-ok' : 'bg-paper text-muted'}`}>
            {i < current ? <Icon name="check" className="size-3.5" /> : i + 1}
          </span>
          <span className={i === current ? 'font-semibold text-ink' : 'text-muted'}>{t}</span>
          {i < items.length - 1 && <span className="mx-1 h-px w-4 bg-line" />}
        </li>
      ))}
    </ol>
  );
}
