// النتائج — أنواع وأدوات مشتركة بين الخادم والمتصفح (نفس منطق القاعدة app.build_report)

export type Section = 'term_work' | 'quizzes' | 'final';

export const SECTIONS: { key: Section; ar: string; en: string; hint: string }[] = [
  { key: 'term_work', ar: 'أعمال الترم', en: 'Term Work', hint: 'الواجبات والبحوث وأوراق العمل والمشاركة والشفهي — كل ما ليس اختبارًا تحريريًا' },
  { key: 'quizzes', ar: 'الاختبارات القصيرة (تحريري)', en: 'Quizzes & Written Tests', hint: 'الاختبارات القصيرة والشهرية والتحريرية' },
  { key: 'final', ar: 'الاختبار النهائي', en: 'Final Exam', hint: 'اختبار نهاية الفصل الدراسي' },
];

export type ReportEval = { id: number; name: string; name_en: string | null; section: Section; weight: number };
export type ReportSubject = { id: number; name: string; name_en: string | null; term_work: number; quizzes: number; final: number; max: number; evals: ReportEval[] };
export type StudentSubject = {
  subject_id: number;
  visible: boolean;
  term_work: number | null;
  quizzes: number | null;
  final: number | null;
  total: number | null;
  max: number | null;
  pct: number | null;
  /** المجموع ÷ نسب الأنواع المرصودة فعلًا × 100 (الأداء حتى الآن) */
  progress: number | null;
  recorded_max: number | null;
  rating_ar: string | null;
  rating_en: string | null;
  entries: number;
  evals: Record<string, number>;
};
export type ReportStudent = {
  id: number;
  code: string;
  name_ar: string;
  name_en: string | null;
  national_id: string | null;
  nationality: string | null;
  birth_date: string | null;
  gender: string | null;
  fee_status: string | null;
  status: string;
  enrolled_at: string | null;
  class_id: number | null;
  branch: string | null;
  stage: string | null;
  grade: string | null;
  section: string | null;
  is_intisab: boolean;
  subjects: StudentSubject[];
  total: number | null;
  max_total: number | null;
  average: number | null;
  progress: number | null;
  recorded_max: number | null;
  graded: number;
  rating_ar: string | null;
  rating_en: string | null;
  rank: number | null;
  attendance: { pct: number | null; intisab: boolean; granted: boolean; total: number; absent: number; late: number; excused: number; rating_ar: string | null; rating_en: string | null };
  behavior: { score: number; negative: number; positive: number; rating_ar: string | null; rating_en: string | null };
};
export type Access = { visible: boolean; rule_id?: number; opens_at?: string | null; closes_at?: string | null; reason?: 'not_yet' | 'ended' | 'blocked' };
export type TermInfo = { id: number; name: string; year: string };

export type ClassReport = { term: TermInfo | null; subjects: ReportSubject[]; students: ReportStudent[]; access: Record<string, Access> };
export type StudentCard =
  | { status: 'hidden'; access: Access }
  | { status: 'ok'; access: Access; term: TermInfo | null; subjects: ReportSubject[]; student: ReportStudent | null };

export type ReleaseRule = {
  id: number;
  kind: 'block' | 'allow';
  term_ids: number[];
  branch_ids: number[];
  stage_ids: number[];
  grade_ids: number[];
  class_ids: number[];
  student_ids: number[];
  opens_at: string | null;
  closes_at: string | null;
  note: string | null;
  is_active: boolean;
  updated_at: string;
};

export type NoticeSettings = { principal: string; note: string };

/** التقدير بنفس حدود النظام القديم */
export function rating(p: number | null | undefined): { ar: string; en: string; tone: string; bar: string; text: string } | null {
  if (p == null || Number.isNaN(p)) return null;
  if (p >= 90) return { ar: 'ممتاز', en: 'Excellent', tone: 'text-ok', bar: '#11734b', text: '#11734b' };
  if (p >= 80) return { ar: 'جيد جدًا', en: 'Very Good', tone: 'text-board', bar: '#356854', text: '#356854' };
  if (p >= 70) return { ar: 'جيد', en: 'Good', tone: 'text-[#2a6f8a]', bar: '#2a6f8a', text: '#2a6f8a' };
  if (p >= 60) return { ar: 'مقبول', en: 'Pass', tone: 'text-brass', bar: '#d9a441', text: '#8a6116' };
  return { ar: 'ضعيف', en: 'Weak', tone: 'text-danger', bar: '#b03a2e', text: '#b03a2e' };
}

export const n2 = (v: number | null | undefined) => (v == null ? '—' : String(Math.round(Number(v) * 100) / 100));
