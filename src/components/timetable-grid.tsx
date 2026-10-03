import { DAYS, fmtTime, todaySchoolDay } from '@/lib/format';

export type Slot = {
  id: number;
  day: number;
  period: number;
  startsAt: string | null;
  subject: string;
  /** سطر ثانٍ: المعلم في جدول الفصل، أو الفصل في جدول المعلم */
  sub?: string | null;
  mode?: string | null;
  color?: string | null;
};

// ألوان المواد: تُشتق من اسم المادة فتبقى ثابتة في كل الصفحات
const PALETTE = ['#356854', '#2a6f8a', '#8a6116', '#7a4b8c', '#a3462f', '#3f7d3a', '#5b5f97', '#9a5b13'];
export function subjectColor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/**
 * جدول أسبوعي: الأيام صفوف والحصص أعمدة على الحاسوب، وبطاقات يومية على الجوال.
 * اليوم الحالي مميّز.
 */
export function TimetableGrid({ slots }: { slots: Slot[] }) {
  const periods = Math.max(0, ...slots.map((s) => s.period));
  const today = todaySchoolDay();
  const at = (d: number, p: number) => slots.filter((s) => s.day === d && s.period === p);
  const startOf = (p: number) => slots.find((s) => s.period === p && s.startsAt)?.startsAt ?? null;

  return (
    <>
      {/* الحاسوب */}
      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface md:block">
        <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth: 120 + periods * 130 }}>
          <thead>
            <tr className="border-b border-line bg-paper/70">
              <th className="w-28 px-3 py-2.5 text-start font-medium text-muted">اليوم</th>
              {Array.from({ length: periods }, (_, i) => (
                <th key={i} className="px-2 py-2.5 text-center font-medium text-muted">
                  الحصة {i + 1}
                  {startOf(i + 1) && <span className="block text-xs font-normal">{fmtTime(startOf(i + 1))}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day, d) => (
              <tr key={day} className={`border-b border-line last:border-0 ${d === today ? 'bg-board/[0.045]' : ''}`}>
                <th scope="row" className="px-3 py-2 text-start font-semibold">
                  <span className="flex items-center gap-2">
                    {day}
                    {d === today && <span className="rounded-full bg-board px-1.5 py-px text-[0.65rem] font-medium text-chalk">اليوم</span>}
                  </span>
                </th>
                {Array.from({ length: periods }, (_, p) => {
                  const cell = at(d, p + 1);
                  return (
                    <td key={p} className="p-1.5 align-top">
                      {cell.length === 0 ? (
                        <div className="h-16 rounded-xl border border-dashed border-line/80" />
                      ) : (
                        <div className="space-y-1">
                          {cell.map((s) => (
                            <SlotChip key={s.id} slot={s} />
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* الجوال */}
      <div className="space-y-3 md:hidden">
        {DAYS.map((day, d) => {
          const list = slots.filter((s) => s.day === d).sort((a, b) => a.period - b.period);
          return (
            <section key={day} className={`rounded-2xl border bg-surface p-4 ${d === today ? 'border-board/40' : 'border-line'}`}>
              <h3 className="mb-2.5 flex items-center gap-2 font-semibold">
                {day}
                {d === today && <span className="rounded-full bg-board px-1.5 py-px text-[0.65rem] font-medium text-chalk">اليوم</span>}
              </h3>
              {list.length === 0 ? (
                <p className="text-sm text-muted">لا حصص</p>
              ) : (
                <ul className="space-y-1.5">
                  {list.map((s) => (
                    <li key={s.id} className="flex items-center gap-3">
                      <span className="w-14 shrink-0 text-xs text-muted">
                        الحصة {s.period}
                        {s.startsAt && <span className="block">{fmtTime(s.startsAt)}</span>}
                      </span>
                      <div className="flex-1"><SlotChip slot={s} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

function SlotChip({ slot }: { slot: Slot }) {
  const c = subjectColor(slot.subject);
  return (
    <div
      className="rounded-xl px-2.5 py-2 leading-tight transition-transform duration-200 hover:-translate-y-0.5"
      style={{ background: `${c}14`, boxShadow: `inset -3px 0 0 ${c}` }}
    >
      <p className="truncate text-[0.82rem] font-semibold" style={{ color: c }}>{slot.subject}</p>
      {slot.sub && <p className="mt-0.5 truncate text-xs text-muted">{slot.sub}</p>}
      {slot.mode && <p className="mt-0.5 truncate text-[0.7rem] text-muted/80">{slot.mode}</p>}
    </div>
  );
}
