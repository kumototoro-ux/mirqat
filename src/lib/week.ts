import 'server-only';
import { cookies } from 'next/headers';
import { getCurrentWeek } from '@/lib/data';
import { fmtDate, fmtHijri, fmtShortDate, fmtWeekday } from '@/lib/format';

/** ما يحتاجه الهيكل من الخادم: بطاقة الأسبوع، وتاريخ اليوم، وحالة طي القائمة (من كوكي لا تومض) */
export async function shellContext() {
  const [w, jar] = await Promise.all([getCurrentWeek(), cookies()]);
  const now = new Date();
  return {
    week: w ? { label: w.week_label ?? `الأسبوع ${w.week_no}`, range: `${fmtShortDate(w.starts_on)} ← ${fmtShortDate(w.ends_on)}` } : null,
    today: { day: fmtWeekday(now), date: fmtDate(now), hijri: fmtHijri(now) },
    initialCollapsed: jar.get('mirqat_sidebar')?.value === 'collapsed',
  };
}
