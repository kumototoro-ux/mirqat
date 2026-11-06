'use client';

import { useState } from 'react';
import { perfFileUrl } from '@/lib/perf/actions';
import type { PerfAttachment } from '@/lib/perf/shared';

const kb = (n: number | null) => (n ? (n >= 1048576 ? `${(n / 1048576).toFixed(1)} م.ب` : `${Math.max(1, Math.round(n / 1024))} ك.ب`) : '');

/** مرفق: رابط مؤقت يُصدره الخادم لمن يحق له قراءة التقرير */
export function PerfFileLink({ a, onRemove }: { a: PerfAttachment; onRemove?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const open = async () => {
    setBusy(true);
    const r = await perfFileUrl(a.id);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setErr(null);
    window.open(r.data!.url, '_blank', 'noopener,noreferrer');
  };
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface px-3 py-1 text-xs ring-1 ring-line">
      <button type="button" onClick={open} disabled={busy} className="max-w-48 truncate font-medium text-board hover:underline" title={a.name}>
        {busy ? '…' : a.name}
      </button>
      <span className="text-muted">{kb(a.size)}</span>
      {err && <span role="alert" className="text-danger">{err}</span>}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`حذف ${a.name}`} className="grid size-5 place-items-center rounded-full text-danger hover:bg-danger/10">×</button>
      )}
    </span>
  );
}
