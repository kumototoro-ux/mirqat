'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LayoutGroup, motion } from 'motion/react';
import { Icon, type IconName } from '@/components/shell/icons';

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

/** قائمة أقسام الإعدادات: عمود ثابت على الحاسوب، وشريط أفقي قابل للتمرير على الجوال */
export function SettingsNav() {
  const active = useSearchParams().get('s') ?? 'general';
  return (
    <LayoutGroup id="settings-nav">
      {/* الحاسوب */}
      <nav aria-label="أقسام الإعدادات" className="sticky top-24 hidden space-y-5 lg:block">
        {SECTIONS.map((g) => (
          <div key={g.group}>
            <p className="mb-1.5 flex items-center gap-2 px-3 text-xs font-semibold text-muted">
              <Icon name={g.icon} className="size-4" />
              {g.group}
            </p>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const on = it.key === active;
                return (
                  <li key={it.key}>
                    <Link href={`/staff/settings?s=${it.key}`} scroll={false} aria-current={on ? 'page' : undefined}
                      className={`relative block rounded-xl px-3.5 py-2.5 text-[0.95rem] transition-colors ${on ? 'font-semibold text-ink' : 'text-ink/70 hover:bg-surface hover:text-ink'}`}>
                      {on && <motion.span layoutId="settings-active" transition={{ type: 'spring', stiffness: 480, damping: 38 }} className="absolute inset-0 rounded-xl border border-line bg-surface shadow-sm" />}
                      <span className="relative">{it.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* الجوال */}
      <nav aria-label="أقسام الإعدادات" className="-mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden">
        {SECTIONS.flatMap((g) => g.items).map((it) => {
          const on = it.key === active;
          return (
            <Link key={it.key} href={`/staff/settings?s=${it.key}`} scroll={false}
              className={`relative shrink-0 rounded-full px-4 py-2 text-sm transition-colors ${on ? 'font-semibold text-chalk' : 'bg-surface text-ink/75 ring-1 ring-line'}`}>
              {on && <motion.span layoutId="settings-chip" className="absolute inset-0 rounded-full bg-board" transition={{ type: 'spring', stiffness: 480, damping: 38 }} />}
              <span className="relative">{it.label}</span>
            </Link>
          );
        })}
      </nav>
    </LayoutGroup>
  );
}
