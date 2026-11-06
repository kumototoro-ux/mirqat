'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFeedback } from '@/components/feedback';
import { perfAcknowledge } from '@/lib/perf/actions';

/** اعتماد مدير الفروع للتقرير مع ردّ اختياري للمراقب */
export function PerfAck({ id }: { id: number }) {
  const { toast, confirm } = useFeedback();
  const router = useRouter();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!(await confirm({ title: 'اعتماد التقرير؟', body: 'يصل ردّك للمراقب، ويُقفل التقرير كمعتمد.', confirmLabel: 'اعتماد' }))) return;
    setBusy(true);
    const r = await perfAcknowledge(id, reply);
    setBusy(false);
    if (!r.ok) return toast(r.error, 'error');
    toast(r.message);
    router.refresh();
  };
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium" htmlFor="reply">ردّك على التقرير (اختياري)</label>
      <textarea id="reply" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={2000} rows={4} className="field w-full" placeholder="التوجيهات أو الإجراءات التي ستتخذها…" />
      <button type="button" onClick={go} disabled={busy} className="btn-primary">{busy ? 'جارٍ…' : 'اعتماد التقرير'}</button>
    </div>
  );
}
