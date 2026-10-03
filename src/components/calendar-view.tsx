import { createClient } from '@/lib/supabase/server';
import { Badge, Empty } from '@/components/ui';
import { fmtHijri, fmtShortDate, todayISO } from '@/lib/format';
import { getTerms } from '@/lib/data';

type Entry = {
  id: number;
  term_id: number;
  period_label: string | null;
  week_label: string | null;
  starts_on: string;
  ends_on: string;
  event: string | null;
  color: string | null;
};

/**
 * التقويم الدراسي: الأسابيع بالترتيب لكل فصل دراسي، وداخل كل أسبوع مناسباته (الإجازات والفعاليات).
 * الأسبوع الحالي مميّز، والتاريخ الهجري تحت الميلادي.
 */
export async function CalendarView() {
  const supabase = await createClient();
  const [{ data, error }, terms] = await Promise.all([
    supabase
      .from('calendar_entries')
      .select('id, term_id, period_label, week_label, starts_on, ends_on, event, color')
      .order('starts_on')
      .returns<Entry[]>(),
    getTerms(),
  ]);
  if (error) return <p className="text-danger">تعذّر تحميل التقويم: {error.message}</p>;
  const entries = data ?? [];
  if (!entries.length) return <Empty title="لا يوجد تقويم بعد">يُضاف من إعدادات التقويم الدراسي.</Empty>;

  const today = todayISO();
  // الأسبوع = المدخلة غير المحتواة داخل مدخلة أطول (نفس منطق school_weeks)
  const isWeek = (e: Entry) =>
    !entries.some((o) => o.id !== e.id && o.starts_on <= e.starts_on && o.ends_on >= e.ends_on && dur(o) > dur(e));

  return (
    <div className="space-y-8">
      {terms
        .filter((t) => entries.some((e) => e.term_id === t.id))
        .map((t) => {
          const mine = entries.filter((e) => e.term_id === t.id);
          const weeks = mine.filter(isWeek);
          return (
            <section key={t.id}>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                {t.name}
                <span className="text-sm font-normal text-muted">{t.year}</span>
              </h2>
              <ol className="relative space-y-2 border-s-2 border-line ps-5">
                {weeks.map((w, i) => {
                  const inner = mine.filter((e) => e.id !== w.id && !isWeek(e) && e.starts_on >= w.starts_on && e.ends_on <= w.ends_on);
                  const current = w.starts_on <= today && today <= w.ends_on;
                  const past = w.ends_on < today;
                  const holiday = !!w.event;
                  return (
                    <li key={w.id} className="relative">
                      <span
                        aria-hidden
                        className={`absolute -start-[1.72rem] top-4 size-3 rounded-full ring-4 ring-paper ${
                          current ? 'bg-gold' : past ? 'bg-board/40' : 'bg-line'
                        }`}
                      />
                      <div
                        className={`rounded-2xl border px-4 py-3 transition-colors ${
                          current ? 'border-board/40 bg-surface shadow-[0_14px_30px_-22px_rgb(53_104_84/0.7)]' : 'border-line bg-surface/70'
                        } ${past ? 'opacity-70' : ''}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold">
                            {w.week_label ?? w.event ?? `الأسبوع ${i + 1}`}
                            {w.period_label && <span className="ms-2 text-sm font-normal text-muted">{w.period_label}</span>}
                          </p>
                          <div className="flex items-center gap-2">
                            {current && <Badge tone="gold">الأسبوع الحالي</Badge>}
                            {holiday && <Badge tone="danger">{w.event}</Badge>}
                          </div>
                        </div>
                        <p className="mt-1 text-sm text-muted">
                          {fmtShortDate(w.starts_on)} ← {fmtShortDate(w.ends_on)}
                          <span className="ms-2 text-xs">({fmtHijri(w.starts_on)} ← {fmtHijri(w.ends_on)})</span>
                        </p>
                        {inner.length > 0 && (
                          <ul className="mt-2 flex flex-wrap gap-1.5">
                            {inner.map((e) => (
                              <li key={e.id}>
                                <Badge tone={e.event ? 'danger' : 'neutral'}>
                                  {e.event ?? e.week_label} · {fmtShortDate(e.starts_on)}
                                  {e.ends_on !== e.starts_on ? ` ← ${fmtShortDate(e.ends_on)}` : ''}
                                </Badge>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
    </div>
  );
}

function dur(e: Entry) {
  return (new Date(e.ends_on).getTime() - new Date(e.starts_on).getTime()) / 864e5;
}
