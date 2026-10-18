// مشترك بين الخادم والمتصفح (بلا 'use client': الثوابت تُقرأ كقيم في الخادم أيضًا)

export type Kind = 'task' | 'form';
export type QType = 'mcq' | 'tf' | 'short' | 'long' | 'match' | 'fill';
export type SubmissionMode = 'none' | 'text' | 'file' | 'any';
export type ItemStatus = 'draft' | 'scheduled' | 'open' | 'closed';
export type ShowResults = 'after_submit' | 'after_close' | 'never';

export const STATUS_META: Record<ItemStatus, { label: string; tone: 'neutral' | 'gold' | 'ok' | 'danger' }> = {
  draft: { label: 'مسودة', tone: 'neutral' },
  scheduled: { label: 'مجدول', tone: 'gold' },
  open: { label: 'مفتوح', tone: 'ok' },
  closed: { label: 'منتهٍ', tone: 'danger' },
};

export const QTYPES: { value: QType; label: string; hint: string; icon: string }[] = [
  { value: 'mcq', label: 'اختيار من متعدد', hint: 'إجابة صحيحة واحدة من عدة خيارات', icon: '◉' },
  { value: 'tf', label: 'صح أو خطأ', hint: 'خياران فقط', icon: '✓✗' },
  { value: 'short', label: 'إجابة قصيرة', hint: 'كلمة أو رقم — تُصحَّح آليًا بالإجابات المقبولة', icon: 'Aa' },
  { value: 'long', label: 'إجابة مقالية', hint: 'نص طويل — يصححه المعلم', icon: '¶' },
  { value: 'match', label: 'صِل', hint: 'أزواج يربطها الطالب', icon: '⇄' },
  { value: 'fill', label: 'املأ الفراغ', hint: 'نص فيه فراغات تُصحَّح آليًا', icon: '__' },
];
export const QTYPE_LABEL = Object.fromEntries(QTYPES.map((q) => [q.value, q.label])) as Record<QType, string>;

export const SUBMISSION_MODES: { value: SubmissionMode; label: string; hint: string }[] = [
  { value: 'text', label: 'جواب نصي', hint: 'يكتب الطالب إجابته' },
  { value: 'file', label: 'ملف أو صورة', hint: 'صورة أو PDF أو Word' },
  { value: 'any', label: 'نص أو ملف', hint: 'أيهما أو كلاهما' },
  { value: 'none', label: 'بلا تسليم', hint: 'رصد درجة فقط (عمل صفّي)' },
];

export const SHOW_RESULTS: { value: ShowResults; label: string }[] = [
  { value: 'after_submit', label: 'فور التسليم' },
  { value: 'after_close', label: 'بعد إغلاق النموذج' },
  { value: 'never', label: 'لا تظهر للطالب' },
];

/** حدود الملفات */
export const MAX_SUBMISSION_BYTES = 1024 * 1024; // ملف الطالب: 1 ميقا بعد الضغط
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024; // مرفق المعلم
export const MAX_SUBMISSION_FILES = 5;
export const SUBMISSION_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};
export const ACCEPT_FILES = '.jpg,.jpeg,.png,.webp,.heic,.pdf,.docx,.pptx,.xlsx,image/*';

export const fmtBytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} م.ب` : n >= 1024 ? `${Math.round(n / 1024)} ك.ب` : `${n} بايت`;

/** تحويل "عاصمة السعودية {{الرياض|رياض}}" إلى نص بفراغات [[1]] وقائمة الإجابات */
export function parseBlanks(src: string): { body: string; blanks: string[][] } {
  const blanks: string[][] = [];
  const body = src.replace(/\{\{([^{}]*)\}\}/g, (_, inner: string) => {
    blanks.push(inner.split('|').map((s) => s.trim()).filter(Boolean));
    return `[[${blanks.length}]]`;
  });
  return { body, blanks };
}

/** العكس: لعرض نص الفراغات للمعلم عند التعديل */
export function joinBlanks(body: string, blanks: string[][]): string {
  return body.replace(/\[\[(\d+)\]\]/g, (_, n: string) => `{{${(blanks[Number(n) - 1] ?? []).join('|')}}}`);
}

/** حالة عنصر من بياناته (نفس منطق الخادم) */
export function itemStatus(r: {
  kind: Kind;
  is_draft?: boolean;
  published_at?: string | null;
  due_at?: string | null;
  form_status?: string | null;
  opens_at?: string | null;
  closes_at?: string | null;
}, now = Date.now()): ItemStatus {
  const t = (v?: string | null) => (v ? new Date(v).getTime() : null);
  if (r.kind === 'form') {
    if (r.form_status === 'draft') return 'draft';
    if (r.form_status === 'closed' || ((t(r.closes_at) ?? Infinity) <= now)) return 'closed';
    if ((t(r.opens_at) ?? 0) > now) return 'scheduled';
    return 'open';
  }
  if (r.is_draft) return 'draft';
  if ((t(r.published_at) ?? 0) > now) return 'scheduled';
  if ((t(r.due_at) ?? Infinity) <= now) return 'closed';
  return 'open';
}

/** "بعد 3 ساعات" / "منذ يومين" */
export function relTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60000);
  const h = Math.round(abs / 3600000);
  const d = Math.round(abs / 86400000);
  const span =
    m < 1 ? 'لحظات' : m < 60 ? (m === 1 ? 'دقيقة' : m === 2 ? 'دقيقتين' : m <= 10 ? `${m} دقائق` : `${m} دقيقة`)
    : h < 24 ? (h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : h <= 10 ? `${h} ساعات` : `${h} ساعة`)
    : d === 1 ? 'يوم' : d === 2 ? 'يومين' : d <= 10 ? `${d} أيام` : `${d} يومًا`;
  return diff >= 0 ? `بعد ${span}` : `منذ ${span}`;
}

/** قيمة input[type=datetime-local] بتوقيت الرياض ↔ ISO */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 3 * 3600000);
  return d.toISOString().slice(0, 16);
}
export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  return new Date(`${v}:00+03:00`).toISOString();
}

/** صورة سؤال مخزّنة "storage:forms/…" ← رابطها العام في مخزن المهام */
export function assetUrl(v: string | null | undefined): string | null {
  if (!v) return null;
  if (!v.startsWith('storage:')) return v;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/task-files/${v.slice(8)}`;
}
