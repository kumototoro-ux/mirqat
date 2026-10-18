import { Icon } from '@/components/shell/icons';
import { assetUrl, QTYPE_LABEL, type QType } from '@/lib/assess/shared';
import { RichText } from './math';

export type ReviewQuestion = {
  id: number;
  qtype: QType;
  body: string;
  image_url: string | null;
  points: number;
  explanation: string | null;
  earned: number;
  status: 'auto' | 'pending' | 'manual';
  feedback: string | null;
  chosen_option_id: number | null;
  response: unknown;
  accepted: string[] | string[][] | null;
  pairs: { l: string; r: string }[] | null;
  options: { id: number; body: string; is_correct: boolean }[] | null;
};

/** مراجعة الطالب لإجاباته: اختياره، والصحيح، والدرجة، وشرح المعلم */
export function FormReview({ questions }: { questions: ReviewQuestion[] }) {
  return (
    <ol className="space-y-3">
      {questions.map((q, i) => {
        const full = q.status !== 'pending' && Number(q.earned) >= Number(q.points) && Number(q.points) > 0;
        const some = Number(q.earned) > 0;
        return (
          <li key={q.id} className={`rounded-[1.25rem] border bg-surface p-4 ${q.status === 'pending' ? 'border-gold/50' : full ? 'border-ok/30' : some ? 'border-board/25' : 'border-danger/25'}`}>
            <div className="mb-2 flex items-center gap-2 text-xs">
              <span className="rounded-full bg-ink px-2 py-0.5 font-bold tabular-nums text-chalk">{i + 1}</span>
              <span className="text-muted">{QTYPE_LABEL[q.qtype]}</span>
              <span className={`ms-auto inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold tabular-nums ${q.status === 'pending' ? 'bg-gold/25 text-brass' : full ? 'bg-ok-soft text-ok' : some ? 'bg-board/10 text-board' : 'bg-danger-soft text-danger'}`} dir="ltr">
                {q.status === 'pending' ? 'بانتظار التصحيح' : `${Number(q.earned)} / ${Number(q.points)}`}
              </span>
            </div>
            <p className="font-semibold leading-relaxed"><RichText text={q.qtype === 'fill' ? q.body.replace(/\[\[(\d+)\]\]/g, '(…$1)') : q.body} /></p>
            {q.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={assetUrl(q.image_url) ?? ''} alt="" className="mt-2 max-h-60 rounded-xl border border-line object-contain" loading="lazy" />
            )}
            <div className="mt-3 text-sm">
              {(q.qtype === 'mcq' || q.qtype === 'tf') && (
                <ul className="space-y-1.5">
                  {(q.options ?? []).map((o) => {
                    const mine = o.id === q.chosen_option_id;
                    return (
                      <li key={o.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${o.is_correct ? 'bg-ok-soft text-ok' : mine ? 'bg-danger-soft text-danger' : 'bg-paper/60 text-muted'}`}>
                        <span className="w-4 font-bold">{o.is_correct ? '✓' : mine ? '✗' : ''}</span>
                        <span className="min-w-0 flex-1"><RichText text={o.body} /></span>
                        {mine && <span className="text-[0.7rem] font-semibold">إجابتك</span>}
                      </li>
                    );
                  })}
                  {q.chosen_option_id == null && <li className="text-xs text-danger">لم تُجب</li>}
                </ul>
              )}
              {(q.qtype === 'short' || q.qtype === 'long') && (
                <>
                  <p className="mb-1 text-xs font-semibold text-muted">إجابتك</p>
                  <div className="whitespace-pre-wrap rounded-xl bg-paper/70 px-3 py-2 leading-relaxed">{q.response ? String(q.response) : <span className="text-danger">لم تُجب</span>}</div>
                  {q.qtype === 'short' && Array.isArray(q.accepted) && q.accepted.length > 0 && (
                    <p className="mt-1.5 text-xs text-ok">الإجابة الصحيحة: {(q.accepted as string[]).join(' أو ')}</p>
                  )}
                </>
              )}
              {q.qtype === 'match' && (
                <ul className="space-y-1.5">
                  {(q.pairs ?? []).map((p, k) => {
                    const chosen = (q.response as Record<string, number> | null)?.[String(k)];
                    const ok = chosen === k;
                    return (
                      <li key={k} className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 ${ok ? 'bg-ok-soft text-ok' : 'bg-danger-soft/70 text-danger'}`}>
                        <RichText text={p.l} /> ⇄ <RichText text={chosen != null ? q.pairs![chosen]?.r ?? '—' : '—'} />
                        {!ok && <span className="ms-auto text-xs text-ok">الصحيح: <RichText text={p.r} /></span>}
                      </li>
                    );
                  })}
                </ul>
              )}
              {q.qtype === 'fill' && (
                <ul className="space-y-1.5">
                  {((q.accepted as string[][]) ?? []).map((acc, k) => {
                    const v = (q.response as string[] | null)?.[k] ?? '';
                    return (
                      <li key={k} className="flex flex-wrap items-center gap-2 rounded-xl bg-paper/70 px-3 py-2">
                        <span className="text-xs text-muted">({k + 1})</span>
                        <b>{v || '—'}</b>
                        <span className="ms-auto text-xs text-ok">الصحيح: {acc.join(' أو ')}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {q.feedback && <p className="mt-3 flex items-start gap-2 rounded-xl bg-board/[0.06] px-3 py-2 text-sm text-board"><Icon name="edit" className="mt-0.5 size-4 shrink-0" /> {q.feedback}</p>}
            {q.explanation && <p className="mt-2 flex items-start gap-2 rounded-xl bg-brass-soft/60 px-3 py-2 text-sm text-brass"><Icon name="sparkle" className="mt-0.5 size-4 shrink-0" /> {q.explanation}</p>}
          </li>
        );
      })}
    </ol>
  );
}
