// أدوات وقت مشتركة (تعمل في المتصفح والخادم) — كلها بتوقيت الرياض

const TZ = 'Asia/Riyadh';

/** الآن بتوقيت الرياض: يوم الأسبوع (0 = الأحد)، والدقائق منذ منتصف الليل، والتاريخ */
export function riyadhNow(at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day, minutes: Number(get('hour')) * 60 + Number(get('minute')), iso: new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(at) };
}

export const toMin = (t: string | null | undefined) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
export const fromMin = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

/** فترة كل حصة في اليوم: تبدأ بوقتها وتنتهي ببداية الحصة التالية (أو بعد 45 دقيقة للأخيرة) */
export function periodWindows(slots: { period: number; startsAt: string | null }[]) {
  const starts = new Map<number, number>();
  for (const s of slots) {
    const m = toMin(s.startsAt);
    if (m !== null && !starts.has(s.period)) starts.set(s.period, m);
  }
  const sorted = [...starts.entries()].sort((a, b) => a[0] - b[0]);
  return new Map(sorted.map(([p, start], i) => [p, { start, end: sorted[i + 1] ? sorted[i + 1][1] : start + 45 }]));
}

/** عدد الأيام من اليوم حتى تاريخ (0 = اليوم، سالب = مضى) */
export function daysUntil(iso: string, todayIso = riyadhNow().iso) {
  return Math.round((new Date(`${iso}T12:00:00Z`).getTime() - new Date(`${todayIso}T12:00:00Z`).getTime()) / 864e5);
}

export function inDays(n: number) {
  if (n === 0) return 'اليوم';
  if (n === 1) return 'غدًا';
  if (n === 2) return 'بعد يومين';
  if (n > 2 && n <= 10) return `بعد ${n} أيام`;
  if (n > 10) return `بعد ${n} يومًا`;
  if (n === -1) return 'أمس';
  return `قبل ${Math.abs(n)} ${Math.abs(n) <= 10 ? 'أيام' : 'يومًا'}`;
}
