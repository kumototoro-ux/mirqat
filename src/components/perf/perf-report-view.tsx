import { Badge, Card } from '@/components/ui';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { RATINGS, STATUS_LABEL, VISIT_LABEL, ratingLabel, type PerfReport } from '@/lib/perf/shared';
import { PerfFileLink } from './perf-file-link';

const tone = (p: number | null) => (p == null ? 'neutral' : p >= 85 ? 'ok' : p >= 65 ? 'board' : p >= 50 ? 'gold' : 'danger') as 'neutral' | 'ok' | 'board' | 'gold' | 'danger';
const Text = ({ title, v }: { title: string; v: string | null }) =>
  v ? (
    <div>
      <h3 className="mb-1 text-sm font-semibold text-muted">{title}</h3>
      <p className="whitespace-pre-wrap leading-7">{v}</p>
    </div>
  ) : null;

/** عرض التقرير للقراءة والطباعة (بلا حالة) */
export function PerfReportView({ r }: { r: PerfReport }) {
  const gen = r.attachments.filter((a) => !a.section);
  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{r.branch}</h2>
            <p className="mt-1 text-sm text-muted">
              {VISIT_LABEL[r.visit_type]} · {fmtDate(r.visit_date)} · أعدّه {r.author}
              {r.sent_at ? ` · أُرسل ${fmtDateTime(r.sent_at)}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={r.status === 'acknowledged' ? 'ok' : r.status === 'sent' ? 'board' : 'neutral'}>{STATUS_LABEL[r.status]}</Badge>
            <Badge tone={tone(r.overall_pct)}>{r.overall_pct == null ? 'بلا نسبة' : `${r.overall_pct}%`}</Badge>
          </div>
        </div>
      </Card>

      {r.sections.map((s) => (
        <Card key={s.code} title={s.name} action={<Badge tone={tone(s.pct)}>{s.pct == null ? '—' : `${s.pct}%`}</Badge>}>
          <ul className="divide-y divide-line">
            {s.items.map((i) => {
              const rt = RATINGS.find((x) => x.v === i.rating);
              return (
                <li key={i.code} className="py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{i.title}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${rt?.cls ?? 'bg-line/40 text-muted ring-line'}`}>{ratingLabel(i.rating)}</span>
                  </div>
                  {i.note && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{i.note}</p>}
                </li>
              );
            })}
          </ul>
          {r.attachments.filter((a) => a.section === s.code).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">{r.attachments.filter((a) => a.section === s.code).map((a) => <PerfFileLink key={a.id} a={a} />)}</div>
          )}
        </Card>
      ))}

      <Card title="الخلاصة والتوصيات">
        <div className="space-y-4">
          <Text title="نقاط القوة" v={r.strengths} />
          <Text title="نقاط التحسين" v={r.improvements} />
          <Text title="التوصيات" v={r.recommendations} />
          <Text title="الإجراءات المطلوبة من مدير الفرع" v={r.actions} />
          {gen.length > 0 && <div className="flex flex-wrap gap-2">{gen.map((a) => <PerfFileLink key={a.id} a={a} />)}</div>}
        </div>
      </Card>

      {r.director_reply && (
        <Card title={`ردّ مدير الفروع${r.ack_by ? ` · ${r.ack_by}` : ''}`}>
          <p className="whitespace-pre-wrap leading-7">{r.director_reply}</p>
          {r.ack_at && <p className="mt-2 text-xs text-muted">اعتُمد {fmtDateTime(r.ack_at)}</p>}
        </Card>
      )}
    </div>
  );
}
