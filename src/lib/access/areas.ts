/** مجالات صلاحيات المناصب — تطابق جدول cap_areas (هجرة 36). المنع الحقيقي في القاعدة؛ هذا للعرض. */
export const AREAS = [
  'students', 'student_accounts', 'employees', 'employee_accounts', 'schedule', 'attendance',
  'behavior', 'tasks', 'grading', 'results', 'certificates', 'reports', 'performance', 'audit',
] as const;
export type Area = (typeof AREAS)[number];

/** 1 عرض، 2 تعديل، 3 كامل */
export type Level = 0 | 1 | 2 | 3;

export type MyAccess = {
  admin: boolean;
  positions: { position: string; name: string; branch_id: number }[];
  areas: Partial<Record<Area, { level: number; branches: number[] }>>;
};

export const NO_ACCESS: MyAccess = { admin: false, positions: [], areas: {} };

export const POSITION_NAME: Record<string, string> = {
  branch_manager: 'مدير/ة فرع', deputy: 'وكيل/ة', teachers_supervisor: 'مشرف/ة معلمات',
  students_supervisor: 'مشرف/ة طلاب', admissions: 'مسؤول/ة القبول والتسجيل',
  branches_director: 'مدير/ة الفروع', performance_monitor: 'مراقب/ة أداء الفروع',
};

/** أعلى مستوى للمجال (الإداري 3) — للعرض فقط */
export function levelOf(a: MyAccess, area: Area): number {
  return a.admin ? 3 : (a.areas[area]?.level ?? 0);
}
