// أسماء عربية للجداول والعمليات والصفحات — مشتركة بين سجل التغييرات ومركز التتبع (خادم ومتصفح)

export const TABLES: Record<string, string> = {
  students: 'الطلاب', employees: 'الموظفون', profiles: 'الحسابات', assessments: 'المهام والنماذج',
  grade_entries: 'الرصد', appreciation_certs: 'شهادات الشكر', attendance_records: 'التحضير', behavior_records: 'السلوك', staff_scope: 'نطاقات المعلمين', user_permissions: 'مفاتيح المعلمين', employee_positions: 'مناصب الفروع',
  timetable_slots: 'جدول الحصص', exam_schedule: 'الاختبارات', calendar_entries: 'التقويم', app_settings: 'الإعدادات',
  form_details: 'النماذج', form_questions: 'أسئلة النماذج', content_items: 'المحتوى', period_links: 'ربط الحصص',
  question_options: 'خيارات الأسئلة', form_attempts: 'محاولات النماذج', grade_visibility: 'ظهور الدرجات',
  grade_improvements: 'تحسين الدرجات', grade_weights: 'أوزان الدرجات', task_submissions: 'تسليمات المهام', assessment_attachments: 'مرفقات المهام',
  attendance_grants: 'صلاحيات التحضير', result_release_rules: 'قواعد إعلان النتائج', subject_matrix: 'خطة المواد',
  academic_years: 'الأعوام الدراسية', terms: 'الفصول الدراسية', branches: 'الفروع', stages: 'المراحل', grades: 'الصفوف', sections: 'الشعب',
  classes: 'الفصول', subjects: 'المواد', eval_types: 'أنواع التقييم', attendance_statuses: 'حالات التحضير', behavior_statuses: 'حالات السلوك',
  form_sessions: 'جلسات حل النماذج', form_events: 'أحداث حل النماذج', submission_files: 'ملفات التسليم', pending_uploads: 'الرفعات المؤقتة',
  school_weeks: 'الأسابيع الدراسية', staff_directory: 'دليل الموظفين', grade_totals: 'مجاميع الدرجات', audit_log: 'سجل التغييرات',
  app_events: 'مركز التتبع', content_progress: 'مشاهدات المحتوى', login_attempts: 'محاولات الدخول',
};

/** دوال القاعدة كما يفهمها الإداري */
export const OPS: Record<string, string> = {
  // المهام والنماذج
  save_task: 'حفظ مهمة', save_form: 'حفظ نموذج', set_form_status: 'نشر/إغلاق نموذج', delete_assessment: 'حذف مهمة أو نموذج',
  duplicate_assessment: 'نسخ مهمة أو نموذج', reopen_task: 'إعادة فتح مهمة', reopen_form: 'إعادة فتح نموذج', refresh_form: 'تحديث نتائج نموذج',
  staff_assessments: 'قائمة المهام والنماذج', staff_assessment_stats: 'إحصاءات المهام', grade_task: 'رصد درجات مهمة', return_submission: 'إرجاع تسليم',
  grade_form_answer: 'تصحيح إجابة', reset_form_attempt: 'تصفير محاولة طالب', register_upload: 'رفع ملف تسليم', submit_task: 'تسليم مهمة',
  can_submit_task: 'التحقق من إمكانية التسليم', start_form_session: 'بدء حل نموذج', save_form_answers: 'حفظ إجابات النموذج',
  submit_form_session: 'تسليم النموذج', log_form_event: 'تسجيل مغادرة الصفحة أثناء الحل', get_form_review: 'مراجعة إجابات النموذج',
  my_assessments: 'مهام الطالب', save_paper_attempt: 'حفظ ورقة مصحّحة بالكاميرا', paper_status: 'حالة الأوراق المصحّحة',
  save_manual: 'رصد يدوي', delete_manual: 'حذف رصد يدوي', my_recent_single: 'آخر رصد لطالب واحد',
  forget_uploads: 'تنظيف الرفعات', mark_files_purged: 'حذف ملفات التسليم', purge_candidates: 'ملفات للحذف', purge_stats: 'إحصاءات الملفات', stale_uploads: 'رفعات قديمة',
  // التحسين والنتائج
  save_improvement: 'حفظ تحسين درجة', delete_improvement: 'حذف تحسين درجة', improvement_preview: 'معاينة تحسين درجة', improvement_state: 'حالة تحسين الدرجات', list_improvements: 'قائمة التحسينات',
  class_results: 'كشف نتائج فصل', results_overview: 'ملخص النتائج', student_report_card: 'إشعار درجات طالب', my_report_card: 'إشعار درجاتي', my_result_terms: 'فصول نتائجي',
  save_release_rule: 'حفظ قاعدة إعلان النتائج', delete_release_rule: 'حذف قاعدة إعلان', set_release_rule_active: 'تفعيل قاعدة إعلان', release_rule_reach: 'من تشمله قاعدة الإعلان',
  save_report_labels: 'حفظ عناوين الإشعار',
  // التحضير والسلوك
  save_attendance: 'حفظ التحضير', delete_attendance_session: 'حذف تحضير حصة', attendance_sessions: 'سجلات التحضير', attendance_summary: 'متابعة الغياب',
  save_attendance_grant: 'منح صلاحية تحضير', delete_attendance_grant: 'سحب صلاحية تحضير', my_periods: 'حصصي اليوم',
  save_behavior: 'تسجيل سلوك', delete_behavior: 'حذف سلوك', behavior_board: 'لوحة السلوك', behavior_summary: 'سلوك طالب',
  // المحتوى والرئيسية
  save_content: 'حفظ فيديو/إثراء', delete_content: 'حذف فيديو/إثراء', set_content_flags: 'تثبيت/إخفاء محتوى', staff_content: 'قائمة المحتوى',
  content_stats: 'إحصاءات المحتوى', content_viewers: 'مشاهدو المحتوى', my_content: 'محتوى الطالب', open_content: 'فتح فيديو/إثراء', set_content_progress: 'تقدّم المشاهدة',
  staff_home: 'رئيسية الموظفين', student_home: 'رئيسية الطالب',
  // الشهادات
  cert_issue: 'إصدار شهادة شكر', cert_preview: 'معاينة شهادة شكر', cert_revoke: 'إلغاء شهادة شكر', cert_list: 'قائمة شهادات الشكر',
  cert_top: 'أوائل الفرع', cert_subject_top: 'أوائل المادة', my_appreciation_certs: 'شهادات الطالب',
  // الأشخاص والحسابات والإعدادات
  save_student: 'حفظ طالب', delete_student: 'حذف طالب', save_employee: 'حفظ موظف', delete_employee: 'حذف موظف',
  admin_attach_profile: 'إنشاء/ربط حساب', admin_legacy_accounts: 'الحسابات المنقولة', auth_login_gate: 'بوابة الدخول', auth_record_login: 'تسجيل الدخول',
  import_students: 'استيراد الطلاب', import_term_grades: 'استيراد درجات الترم', backup_rows: 'النسخة الاحتياطية', backup_improvements: 'نسخ التحسينات',
  admin_reset_data: 'تصفير البيانات', admin_reset_preview: 'معاينة التصفير', branch_usage: 'استخدام الفروع', report_activity: 'تقرير النشاط',
  get_public_settings: 'الإعدادات العامة', settle_due_forms: 'تسوية النماذج المنتهية',
  track_summary: 'ملخص التتبع', track_events: 'أحداث التتبع', track_timeline: 'الخط الزمني لمستخدم', track_resolve: 'تعليم مشكلة كمحلولة',
};

const METHOD: Record<string, string> = { GET: 'قراءة', HEAD: 'قراءة', POST: 'إضافة', PATCH: 'تعديل', PUT: 'حفظ', DELETE: 'حذف' };

/** «rpc:save_form» → «حفظ نموذج» ، «table:students:PATCH» → «تعديل الطلاب» */
export function opLabel(op: string | undefined | null): string {
  if (!op) return 'عملية';
  const [type, name, method] = op.split(':');
  if (type === 'rpc') return OPS[name] ?? `عملية «${name}»`;
  if (type === 'table') return `${METHOD[method] ?? 'عملية على'} ${TABLES[name] ?? name}`;
  if (type === 'storage') return name === 'upload' ? 'رفع ملف' : name === 'sign' ? 'فتح ملف' : 'عملية على الملفات';
  return op;
}

/** أسماء الصفحات من المسار (الأرقام تُستبدل) */
const PAGES: [RegExp, string][] = [
  [/^\/staff\/?$/, 'رئيسية الموظفين'], [/^\/student\/?$/, 'رئيسية الطالب'],
  [/^\/staff\/tasks\/new/, 'إنشاء مهمة/نموذج'], [/^\/staff\/tasks\/\d+/, 'صفحة مهمة/نموذج'], [/^\/staff\/tasks/, 'المهام والنماذج'],
  [/^\/staff\/print\//, 'طباعة الاختبار'], [/^\/staff\/scan\//, 'التصحيح بالكاميرا'],
  [/^\/staff\/grading\/\d+/, 'كشف رصد'], [/^\/staff\/grading/, 'الرصد اليومي'], [/^\/staff\/attendance/, 'التحضير'], [/^\/staff\/behavior/, 'السلوك'],
  [/^\/staff\/results/, 'النتائج'], [/^\/staff\/certificates/, 'شهادات الشكر'], [/^\/staff\/content/, 'الفيديوهات والإثراءات'],
  [/^\/staff\/timetable/, 'جدول الحصص'], [/^\/staff\/calendar/, 'التقويم الدراسي'], [/^\/staff\/exams/, 'جدول الاختبارات'],
  [/^\/staff\/students\/\d+/, 'ملف طالب'], [/^\/staff\/students/, 'تسجيل الطلاب'], [/^\/staff\/employees/, 'تسجيل الموظفين'],
  [/^\/staff\/(student|employee)-accounts|^\/staff\/accounts/, 'الحسابات'], [/^\/staff\/reports/, 'التقارير'], [/^\/staff\/settings/, 'الإعدادات'],
  [/^\/staff\/audit/, 'سجل النشاط'], [/^\/staff\/password|^\/student\/password|^\/change-password/, 'تغيير كلمة المرور'],
  [/^\/student\/tasks\/\d+/, 'مهمة الطالب'], [/^\/student\/tasks/, 'مهام الطالب'], [/^\/student\/solve\//, 'حل نموذج'],
  [/^\/student\/results/, 'نتائج الطالب'], [/^\/student\/content/, 'فيديوهات الطالب'], [/^\/student\/timetable/, 'جدول الطالب'],
  [/^\/student\/calendar/, 'تقويم الطالب'], [/^\/student\/exams/, 'اختبارات الطالب'], [/^\/(student\/)?login/, 'صفحة الدخول'],
];
export function pageLabel(path: string | null | undefined): string {
  if (!path) return '';
  const p = path.split('?')[0];
  return PAGES.find(([re]) => re.test(p))?.[1] ?? p;
}

export const ROLES: Record<string, string> = { admin: 'إداري', teacher: 'معلم', student: 'طالب' };
