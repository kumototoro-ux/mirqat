import 'server-only';
import { getCurrentWeek } from '@/lib/data';
import { fmtShortDate } from '@/lib/format';

/** بطاقة "الأسبوع الحالي" في القائمة الجانبية */
export async function weekCard() {
  const w = await getCurrentWeek();
  if (!w) return null;
  return { label: w.week_label ?? `الأسبوع ${w.week_no}`, range: `${fmtShortDate(w.starts_on)} ← ${fmtShortDate(w.ends_on)}` };
}
