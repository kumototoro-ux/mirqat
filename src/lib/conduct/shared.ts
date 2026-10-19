// التحضير والسلوك — مشترك بين الخادم والمتصفح (نفس تصنيف القاعدة app.att_kind / app.beh_kind)

export type AttKind = 'present' | 'absent' | 'late' | 'excused';
export type BehKind = 'positive' | 'negative' | 'neutral';

export const attKind = (name: string): AttKind =>
  /غائب|غياب/.test(name) ? 'absent' : /متأخر|تأخر|تاخر/.test(name) ? 'late' : /مستأذن|استئذان|عذر|معذور/.test(name) ? 'excused' : 'present';
export const behKind = (name: string): BehKind => (/سلب/.test(name) ? 'negative' : /إيجاب|ايجاب|تميز|متميز/.test(name) ? 'positive' : 'neutral');

export const ATT_STYLE: Record<AttKind, { on: string; soft: string; dot: string; label: string }> = {
  present: { on: 'bg-ok text-chalk border-ok', soft: 'bg-ok-soft text-ok', dot: 'bg-ok', label: 'حاضر' },
  absent: { on: 'bg-danger text-chalk border-danger', soft: 'bg-danger-soft text-danger', dot: 'bg-danger', label: 'غائب' },
  late: { on: 'bg-gold text-ink border-gold', soft: 'bg-brass-soft text-brass', dot: 'bg-gold', label: 'متأخر' },
  excused: { on: 'bg-[#2a6f8a] text-chalk border-[#2a6f8a]', soft: 'bg-[#e1eef3] text-[#2a6f8a]', dot: 'bg-[#2a6f8a]', label: 'مستأذن' },
};

export type Status = { id: number; name: string };

/** نسبة الحضور بمعادلة النظام القديم: الغائب 1، المتأخر ربع */
export const attendancePct = (total: number, absent: number, late: number) => (total ? Math.max(0, Math.round((100 * (total - absent - 0.25 * late)) / total)) : null);

export const riyadhToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayFmt = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
export const fmtDay = (iso: string) => dayFmt.format(new Date(`${iso}T12:00:00Z`));
