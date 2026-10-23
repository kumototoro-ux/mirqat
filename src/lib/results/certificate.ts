// شهادة نهاية العام (أعمال السنة) — أنواع وحسابات مشتركة بين الخادم والمتصفح
import { rating, type ClassReport, type ReportStudent, type ReportSubject, type TermInfo } from './shared';

export type CertImageKind = 'basmala' | 'logo' | 'vision' | 'signature' | 'stamp';
export const CERT_IMAGES: { kind: CertImageKind; ar: string; hint: string }[] = [
  { kind: 'basmala', ar: 'صورة البسملة', hint: 'تحل محل البسملة المكتوبة أعلى الشهادة' },
  { kind: 'logo', ar: 'شعار المدرسة', hint: 'للشهادة فقط — إن لم يُرفع يُستخدم الشعار العام' },
  { kind: 'vision', ar: 'شعار الرؤية', hint: 'يظهر أعلى يسار الشهادة' },
  { kind: 'signature', ar: 'صورة التوقيع', hint: 'توقيع المدير — يُفضّل PNG بخلفية شفافة' },
  { kind: 'stamp', ar: 'صورة الختم', hint: 'ختم المدرسة — يُفضّل PNG بخلفية شفافة' },
];

export type CertSettings = {
  /** أسطر الترويسة العربية (يمين) */
  header_ar: string;
  /** أسطر الترويسة الإنجليزية (يسار) */
  header_en: string;
  show_basmala: boolean;
  school_ar: string;
  school_en: string;
  school_code: string;
  year_hijri: string;
  year_greg: string;
  principal_title: string;
  principal_name: string;
  /** {الصف} يُستبدل باسم الصف */
  closing_ar: string;
  /** {grade} is replaced with the grade name */
  closing_en: string;
  /** درجة النجاح في المادة (المعدل السنوي للمادة) — دونها لا تظهر عبارة الاجتياز */
  pass_mark: number;
  student_visible: boolean;
  /** أسماء الصفوف في الشهادة: المفتاح "المرحلة|الصف" */
  grades: Record<string, { ar: string; en: string }>;
  /** مسارات الصور في التخزين الخاص */
  images: Partial<Record<CertImageKind, string>>;
};

export const CERT_DEFAULTS: CertSettings = {
  header_ar: 'المملكة العربية السعودية',
  header_en: 'Kingdom of Saudi Arabia',
  show_basmala: true,
  school_ar: '',
  school_en: '',
  school_code: '',
  year_hijri: '',
  year_greg: '',
  principal_title: 'مدير المدرسة',
  principal_name: '',
  closing_ar: 'تمنح هذه الشهادة تقديرًا لاجتياز {الصف} بنجاح، مع أطيب التمنيات بمزيد من التفوق.',
  closing_en: 'This certificate is awarded in recognition of successfully completing the {grade}, with best wishes for further achievements.',
  pass_mark: 50,
  student_visible: false,
  grades: {},
  images: {},
};

const str = (v: unknown, max: number, d = '') => (typeof v === 'string' ? v.slice(0, max) : d);

/** يقرأ الإعداد المخزّن بأمان مع القيم الافتراضية */
export function normalizeCert(raw: unknown): CertSettings {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const grades: CertSettings['grades'] = {};
  if (v.grades && typeof v.grades === 'object')
    for (const [k, g] of Object.entries(v.grades as Record<string, unknown>).slice(0, 80)) {
      const o = (g ?? {}) as Record<string, unknown>;
      const ar = str(o.ar, 80).trim();
      const en = str(o.en, 80).trim();
      if (ar || en) grades[k.slice(0, 120)] = { ar, en };
    }
  const images: CertSettings['images'] = {};
  if (v.images && typeof v.images === 'object')
    for (const { kind } of CERT_IMAGES) {
      const p = (v.images as Record<string, unknown>)[kind];
      if (typeof p === 'string' && /^certificate\/[\w.-]+$/.test(p)) images[kind] = p;
    }
  const pm = Number(v.pass_mark);
  return {
    header_ar: str(v.header_ar, 400, CERT_DEFAULTS.header_ar),
    header_en: str(v.header_en, 400, CERT_DEFAULTS.header_en),
    show_basmala: typeof v.show_basmala === 'boolean' ? v.show_basmala : true,
    school_ar: str(v.school_ar, 120),
    school_en: str(v.school_en, 120),
    school_code: str(v.school_code, 30),
    year_hijri: str(v.year_hijri, 40),
    year_greg: str(v.year_greg, 40),
    principal_title: str(v.principal_title, 60, CERT_DEFAULTS.principal_title),
    principal_name: str(v.principal_name, 80),
    closing_ar: str(v.closing_ar, 400, CERT_DEFAULTS.closing_ar),
    closing_en: str(v.closing_en, 400, CERT_DEFAULTS.closing_en),
    pass_mark: Number.isFinite(pm) && pm >= 0 && pm <= 100 ? pm : 50,
    student_visible: v.student_visible === true,
    grades,
    images,
  };
}

export const gradeKey = (stage: string | null, grade: string | null) => `${stage ?? ''}|${grade ?? ''}`;

/** اسم الصف في الشهادة (عربي/إنجليزي) — من الإعداد، وإلا من اسم الصف والمرحلة */
export function gradeLabel(s: CertSettings, stage: string | null, grade: string | null) {
  const g = s.grades[gradeKey(stage, grade)];
  const raw = [grade, stage].filter(Boolean).join(' ');
  const ar = g?.ar || (raw ? (/^الصف/.test(raw) ? raw : `الصف ${raw}`) : '');
  return { ar, en: g?.en || '' };
}

/** التقدير مع "ممتاز+" للدرجة الكاملة كما في الشهادة المعتمدة */
export function certRating(p: number | null | undefined) {
  if (p == null || Number.isNaN(p)) return null;
  if (p >= 99.995) return { ar: 'ممتاز+', en: 'Excellent+' };
  const r = rating(p);
  return r ? { ar: r.ar, en: r.en } : null;
}

export type CertRow = {
  subject_id: number;
  name: string;
  name_en: string | null;
  term_work: number | null;
  quizzes: number | null;
  final: number | null;
  has: { term_work: boolean; quizzes: boolean; final: boolean };
  total: number | null;
  max: number;
  pct: number | null;
};

export type CertTerm = { term: TermInfo; rows: CertRow[] };

export type YearCert = {
  student: ReportStudent;
  terms: CertTerm[];
  attendance: number | null;
  intisab: boolean;
  behavior: number | null;
  total: number;
  max: number;
  average: number | null;
  /** مواد معدلها السنوي دون درجة النجاح */
  below: string[];
  /** فصول/مواد لم تكتمل درجاتها */
  missing: number;
};

export type YearInput = { term: TermInfo; subjects: ReportSubject[]; student: ReportStudent | null }[];

/** يجمع كشوف فصول العام لطالب واحد في شهادة سنوية */
export function buildYear(input: YearInput, passMark: number): YearCert | null {
  const present = input.filter((x) => x.student);
  if (!present.length) return null;
  const student = present[present.length - 1].student!;
  const terms: CertTerm[] = [];
  const perSubject = new Map<number, { name: string; t: number; m: number }>();
  let total = 0;
  let max = 0;
  let missing = 0;
  const att: number[] = [];
  const beh: number[] = [];
  let intisab = false;

  for (const { term, subjects, student: s } of input) {
    if (!s) {
      missing++;
      continue;
    }
    const by = new Map(subjects.map((x) => [x.id, x]));
    const rows: CertRow[] = [];
    for (const r of s.subjects) {
      const sub = by.get(r.subject_id);
      if (!sub) continue;
      const m = Number(r.max ?? sub.max ?? 0);
      const t = r.total == null ? null : Number(r.total);
      rows.push({
        subject_id: r.subject_id,
        name: sub.name,
        name_en: sub.name_en,
        term_work: r.term_work == null ? null : Number(r.term_work),
        quizzes: r.quizzes == null ? null : Number(r.quizzes),
        final: r.final == null ? null : Number(r.final),
        has: { term_work: Number(sub.term_work) > 0, quizzes: Number(sub.quizzes) > 0, final: Number(sub.final) > 0 },
        total: t,
        max: m,
        pct: t == null || !m ? null : (t / m) * 100,
      });
      if (t == null) missing++;
      else {
        total += t;
        max += m;
        const ps = perSubject.get(r.subject_id) ?? { name: sub.name, t: 0, m: 0 };
        ps.t += t;
        ps.m += m;
        perSubject.set(r.subject_id, ps);
      }
    }
    terms.push({ term, rows });
    if (s.attendance.pct != null) att.push(Number(s.attendance.pct));
    else if (s.attendance.intisab) intisab = true;
    if (s.behavior?.score != null) beh.push(Number(s.behavior.score));
  }
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const below = [...perSubject.values()].filter((p) => p.m > 0 && (p.t / p.m) * 100 < passMark).map((p) => p.name);
  return {
    student,
    terms,
    attendance: avg(att),
    intisab: intisab && !att.length,
    behavior: avg(beh),
    total,
    max,
    average: max ? (total / max) * 100 : null,
    below,
    missing,
  };
}

/** يحوّل كشوف الفصل لكل فصل دراسي إلى شهادات الطلاب */
export function buildClassYear(reports: { term: TermInfo; report: ClassReport | null }[], passMark: number): YearCert[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const { report } of reports)
    for (const s of report?.students ?? [])
      if (!seen.has(s.id)) {
        seen.add(s.id);
        ids.push(s.id);
      }
  const out: YearCert[] = [];
  for (const id of ids) {
    const c = buildYear(
      reports.map(({ term, report }) => ({ term, subjects: report?.subjects ?? [], student: report?.students.find((s) => s.id === id) ?? null })),
      passMark,
    );
    if (c) out.push(c);
  }
  return out.sort((a, b) => a.student.name_ar.localeCompare(b.student.name_ar, 'ar'));
}

export const fmt = (v: number | null | undefined) => (v == null ? '—' : String(Math.round(Number(v) * 100) / 100));
