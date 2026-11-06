/** مفاتيح الصلاحيات الفردية للمعلم — تطابق جدول permission_keys (هجرة 35). المنع الحقيقي في القاعدة؛ هذا للعرض. */
export const PERM_KEYS = [
  'create_exams',
  'print_exams',
  'camera_grading',
  'essay_grading',
  'daily_grading',
  'publish_content',
  'reopen',
  'copy_assessment',
] as const;

export const PERM_LABEL: Record<string, string> = {
  create_exams: 'إنشاء الاختبارات والنماذج', print_exams: 'طباعة الاختبارات وأوراق الإجابة', camera_grading: 'التصحيح بالكاميرا',
  essay_grading: 'تصحيح الأسئلة المقالية', daily_grading: 'الرصد اليومي وتحسين الدرجات', publish_content: 'نشر الفيديوهات والإثراءات',
  reopen: 'إعادة فتح مهمة أو نموذج منتهٍ', copy_assessment: 'نسخ مهمة أو نموذج لفصل آخر',
};

export type PermKey = (typeof PERM_KEYS)[number];
export type PermMap = Record<PermKey, boolean>;

export const NO_PERMS: PermMap = {
  create_exams: false, print_exams: false, camera_grading: false, essay_grading: false,
  daily_grading: false, publish_content: false, reopen: false, copy_assessment: false,
};
