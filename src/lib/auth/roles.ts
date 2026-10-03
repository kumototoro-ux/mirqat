// ثوابت الأدوار والتوجيه — تُستورد من proxy.ts والصفحات (بلا اعتماد على الخادم)

export type AppRole = 'admin' | 'teacher' | 'student';
export type AccountStatus = 'active' | 'disabled';

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: 'إداري',
  teacher: 'معلم',
  student: 'طالب',
};

export const STATUS_LABEL: Record<AccountStatus, string> = {
  active: 'نشط',
  disabled: 'موقوف',
};

export function isRole(value: unknown): value is AppRole {
  return value === 'admin' || value === 'teacher' || value === 'student';
}

/** الصفحة الرئيسية لكل دور */
export function homeFor(role: AppRole): string {
  return role === 'student' ? '/student' : '/staff';
}

/**
 * ما يُقرأ من app_metadata في الجلسة: الدور فقط (يكتبه الخادم وحده عند إنشاء الحساب).
 * للتوجيه السريع فقط — الصلاحية الحقيقية من profiles وRLS.
 */
export function readSessionMeta(appMetadata: unknown): { role: AppRole | null } {
  const meta = (appMetadata ?? {}) as Record<string, unknown>;
  return { role: isRole(meta.role) ? meta.role : null };
}
