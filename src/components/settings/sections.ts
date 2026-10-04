import type { IconName } from '@/components/shell/icons';

// أقسام الإعدادات — ملف عادي (لا 'use client') لأن الصفحة تقرؤه في الخادم والقائمة في المتصفح.
// الثوابت المصدَّرة من ملف 'use client' تصل للخادم كمرجع لا كقيمة، فلا تُستخدم هناك.
export const SECTIONS: { group: string; icon: IconName; items: { key: string; label: string }[] }[] = [
  { group: 'المدرسة', icon: 'home', items: [{ key: 'general', label: 'الهوية' }, { key: 'announcements', label: 'الإعلانات' }, { key: 'visibility', label: 'ما يراه الطلاب' }] },
  {
    group: 'البنية الدراسية',
    icon: 'students',
    items: [
      { key: 'branches', label: 'الفروع' },
      { key: 'stages', label: 'المراحل' },
      { key: 'grades', label: 'الصفوف' },
      { key: 'sections', label: 'الشعب' },
      { key: 'subjects', label: 'المواد' },
    ],
  },
  { group: 'التقييم', icon: 'results', items: [{ key: 'eval', label: 'أنواع التقييم' }, { key: 'weights', label: 'توزيع الدرجات' }] },
  { group: 'الحضور والسلوك', icon: 'attendance', items: [{ key: 'attendance', label: 'حالات الحضور' }, { key: 'behavior', label: 'حالات السلوك' }] },
];
