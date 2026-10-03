// تنسيق التواريخ والأرقام والتسميات الموحّد لكل الموقع (توقيت الرياض، أرقام لاتينية كالنظام القديم)

const TZ = 'Asia/Riyadh';

export const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'] as const;

const dateFmt = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeZone: TZ });
const shortDateFmt = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short', timeZone: TZ });
const dateTimeFmt = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: TZ,
});
const hijriFmt = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', timeZone: TZ });
const weekdayFmt = new Intl.DateTimeFormat('ar-SA', { weekday: 'long', timeZone: TZ });

/** تاريخ بصيغة YYYY-MM-DD يُقرأ كيوم محلي (لا يزحف يومًا بسبب المنطقة الزمنية) */
function asDate(v: string | Date): Date {
  if (v instanceof Date) return v;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T12:00:00+03:00') : new Date(v);
}

export const fmtDate = (v: string | Date | null | undefined) => (v ? dateFmt.format(asDate(v)) : '—');
export const fmtShortDate = (v: string | Date | null | undefined) => (v ? shortDateFmt.format(asDate(v)) : '—');
export const fmtDateTime = (v: string | Date | null | undefined) => (v ? dateTimeFmt.format(asDate(v)) : '—');
export const fmtHijri = (v: string | Date | null | undefined) => (v ? hijriFmt.format(asDate(v)) : '');
export const fmtWeekday = (v: string | Date) => weekdayFmt.format(asDate(v));
export const fmtNum = (n: number | null | undefined, digits = 0) =>
  n == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(n);

/** الوقت "08:30:00" ← "8:30" */
export const fmtTime = (t: string | null | undefined) => (t ? t.slice(0, 5).replace(/^0/, '') : '');

/** يوم الأسبوع الدراسي اليوم (0 = الأحد … 4 = الخميس)، أو null في الجمعة والسبت */
export function todaySchoolDay(): number | null {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: TZ })).getDay();
  return d <= 4 ? d : null;
}

/** اليوم بصيغة YYYY-MM-DD بتوقيت الرياض */
export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

export type ClassRef = {
  id: number;
  branch: { name: string } | null;
  grade: { name: string; stage: { name: string } | null } | null;
  section: { name: string } | null;
} | null;

/** اسم الفصل: "الأول متوسط / أ" مع الفرع اختياريًا */
export function classLabel(c: ClassRef, withBranch = false): string {
  if (!c) return '—';
  const g = c.grade ? `${c.grade.name}${c.grade.stage ? ' ' + c.grade.stage.name : ''}` : '';
  const s = c.section?.name ? ` / ${c.section.name}` : '';
  const b = withBranch && c.branch?.name ? ` · ${c.branch.name}` : '';
  return (g + s + b).trim() || '—';
}

/** حقول الفصل المضمّنة في استعلامات PostgREST */
export const CLASS_SELECT =
  'id, branch:branches(name), grade:grades(name, stage:stages(name)), section:sections(name)';

/** لون الدرجة من 100: أخضر للعالي، ثم أخضر هادئ، ذهبي للمتوسط، أحمر للمنخفض */
export function scoreTone(v: number) {
  if (v >= 85) return 'bg-ok-soft text-ok';
  if (v >= 65) return 'bg-board/10 text-board';
  if (v >= 50) return 'bg-brass-soft text-brass';
  return 'bg-danger-soft text-danger';
}
