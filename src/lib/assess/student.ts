// حالة كل مهمة/نموذج من وجهة الطالب (مشترك بين الخادم والمتصفح)

export type StudentItem = {
  id: number;
  kind: 'task' | 'form';
  title: string;
  description: string | null;
  max_score: number | null;
  published_at: string | null;
  due_at: string | null;
  submission_mode: 'none' | 'text' | 'file' | 'any';
  allow_late: boolean;
  created_at: string;
  subject: string | null;
  eval_type: string | null;
  opens_at: string | null;
  closes_at: string | null;
  time_limit_minutes: number | null;
  max_attempts: number | null;
  form_status: 'draft' | 'published' | 'closed' | null;
  show_results: string | null;
  questions: number;
  attempts: number;
  in_progress: boolean;
  submission: { submitted_at: string; graded_at: string | null; is_late: boolean; feedback: string | null } | null;
  grade: { score: number; max_score: number; source: string } | null;
};

export type StudentState = 'upcoming' | 'todo' | 'in_progress' | 'late_open' | 'submitted' | 'graded' | 'missed' | 'classwork';

export const STATE_META: Record<StudentState, { label: string; tone: 'neutral' | 'gold' | 'ok' | 'danger' | 'board' }> = {
  upcoming: { label: 'قريبًا', tone: 'neutral' },
  todo: { label: 'مطلوب', tone: 'gold' },
  in_progress: { label: 'بدأت الحل', tone: 'board' },
  late_open: { label: 'متأخر — ما زال مفتوحًا', tone: 'danger' },
  submitted: { label: 'سُلّمت', tone: 'board' },
  graded: { label: 'مصحّحة', tone: 'ok' },
  missed: { label: 'فاتت', tone: 'danger' },
  classwork: { label: 'عمل صفّي', tone: 'neutral' },
};

export const deadlineOf = (i: StudentItem) => (i.kind === 'form' ? i.closes_at : i.due_at);

export function studentState(i: StudentItem, now = Date.now()): StudentState {
  const t = (v: string | null) => (v ? new Date(v).getTime() : null);
  if (i.kind === 'form') {
    const closed = i.form_status === 'closed' || (t(i.closes_at) ?? Infinity) <= now;
    if (i.in_progress && !closed) return 'in_progress';
    if (i.attempts > 0) return i.grade ? 'graded' : 'submitted';
    if (i.grade && i.grade.source !== 'auto_absent') return 'graded';
    if (closed) return 'missed';
    if ((t(i.opens_at) ?? 0) > now) return 'upcoming';
    return 'todo';
  }
  if (i.submission_mode === 'none') return i.grade ? 'graded' : 'classwork';
  if (i.submission) return i.submission.graded_at || i.grade ? 'graded' : 'submitted';
  if (i.grade) return 'graded';
  const due = t(i.due_at);
  if (due != null && due <= now) return i.allow_late ? 'late_open' : 'missed';
  return 'todo';
}

/** هل يستطيع الطالب نموذج محاولة أخرى؟ */
export const canRetry = (i: StudentItem, now = Date.now()) =>
  i.kind === 'form' &&
  i.attempts > 0 &&
  i.attempts < (i.max_attempts ?? 1) &&
  i.form_status === 'published' &&
  (!i.closes_at || new Date(i.closes_at).getTime() > now);
