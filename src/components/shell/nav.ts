import type { AppRole } from '@/lib/auth/roles';
import type { IconName } from './icons';

export type NavLink = { href: string; label: string; icon: IconName; roles?: AppRole[]; soon?: boolean };
export type NavGroup = { title?: string; items: NavLink[] };

/**
 * قائمة موقع الموظفين — نفس أقسام النظام القديم وترتيبها (Sidebar.html)،
 * مع دمج "حساب الطالب/الموظف" في صفحتي الطلاب والموظفين، و"إنشاء الحسابات" في الحسابات.
 * soon = الصفحة موجودة للعرض، وأدوات العمل فيها قادمة.
 */
export const STAFF_NAV: NavGroup[] = [
  { items: [{ href: '/staff', label: 'الرئيسية', icon: 'home' }] },
  {
    title: 'الجداول',
    items: [
      { href: '/staff/calendar', label: 'التقويم الدراسي', icon: 'calendar' },
      { href: '/staff/timetable', label: 'جدول الحصص', icon: 'timetable' },
      { href: '/staff/exams', label: 'جدول الاختبارات', icon: 'exams' },
    ],
  },
  {
    title: 'الطلاب',
    items: [
      { href: '/staff/attendance', label: 'التحضير', icon: 'attendance' },
      { href: '/staff/tasks', label: 'المهام والتكاليف', icon: 'tasks' },
      { href: '/staff/forms', label: 'النماذج الإلكترونية', icon: 'forms' },
      { href: '/staff/content', label: 'الإثراءات والفيديوهات', icon: 'content' },
      { href: '/staff/behavior', label: 'السلوك', icon: 'behavior', roles: ['admin'] },
      { href: '/staff/results', label: 'النتائج', icon: 'results', roles: ['admin'] },
    ],
  },
  {
    title: 'المستخدمون',
    items: [
      { href: '/staff/students', label: 'تسجيل الطلاب', icon: 'students', roles: ['admin'] },
      { href: '/staff/employees', label: 'تسجيل الموظفين', icon: 'employees', roles: ['admin'] },
      { href: '/staff/student-accounts', label: 'حسابات الطلاب', icon: 'accounts', roles: ['admin'] },
      { href: '/staff/employee-accounts', label: 'حسابات الموظفين', icon: 'key', roles: ['admin'] },
    ],
  },
  {
    title: 'الإعدادات',
    items: [
      { href: '/staff/settings', label: 'الإعدادات العامة', icon: 'settings', roles: ['admin'] },
      { href: '/staff/audit', label: 'سجل النشاط', icon: 'audit', roles: ['admin'] },
    ],
  },
];

export const STUDENT_NAV: NavGroup[] = [
  {
    items: [
      { href: '/student', label: 'الرئيسية', icon: 'home' },
      { href: '/student/timetable', label: 'جدولي', icon: 'timetable' },
      { href: '/student/calendar', label: 'التقويم الدراسي', icon: 'calendar' },
      { href: '/student/exams', label: 'جدول الاختبارات', icon: 'exams' },
      { href: '/student/tasks', label: 'مهامي ونماذجي', icon: 'tasks' },
      { href: '/student/results', label: 'نتائجي', icon: 'results' },
      { href: '/student/content', label: 'الإثراءات', icon: 'content' },
    ],
  },
];

export function navFor(groups: NavGroup[], role: AppRole): NavGroup[] {
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || i.roles.includes(role)) }))
    .filter((g) => g.items.length > 0);
}

/** شريط الجوال السفلي: أهم أربعة أقسام لكل دور، والباقي في "المزيد" */
export function tabsFor(role: AppRole): NavLink[] {
  if (role === 'student')
    return [
      { href: '/student', label: 'الرئيسية', icon: 'home' },
      { href: '/student/timetable', label: 'جدولي', icon: 'timetable' },
      { href: '/student/tasks', label: 'مهامي', icon: 'tasks' },
      { href: '/student/results', label: 'نتائجي', icon: 'results' },
    ];
  if (role === 'admin')
    return [
      { href: '/staff', label: 'الرئيسية', icon: 'home' },
      { href: '/staff/students', label: 'الطلاب', icon: 'students' },
      { href: '/staff/tasks', label: 'المهام', icon: 'tasks' },
      { href: '/staff/timetable', label: 'الجدول', icon: 'timetable' },
    ];
  return [
    { href: '/staff', label: 'الرئيسية', icon: 'home' },
    { href: '/staff/timetable', label: 'جدولي', icon: 'timetable' },
    { href: '/staff/tasks', label: 'المهام', icon: 'tasks' },
    { href: '/staff/forms', label: 'النماذج', icon: 'forms' },
  ];
}
