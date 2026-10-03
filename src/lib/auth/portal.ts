// البوابتان: الموظفون (/login) والطلاب (/student/login) — كالموقعين القديمين

export type Portal = 'staff' | 'student';

export const LOGIN_PATH: Record<Portal, string> = {
  staff: '/login',
  student: '/student/login',
};

/**
 * تنظيف مدخلات الدخول من المسافات والرموز الخفية التي تُضاف عند النسخ واللصق (خاصةً من واتساب):
 * علامات الاتجاه وعرض الصفر، والمسافة غير القابلة للكسر. منقولة حرفيًا من cleanLoginInput_
 * في بوابة الطالب القديمة.
 */
export function cleanLoginInput(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00AD]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
}
