'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { Icon } from '@/components/shell/icons';
import { SECTIONS } from './sections';
import { AnnouncementsEditor, BrandingEditor, RefListEditor, VisibilityEditor, WeightsEditor, type RefItem } from './editors';
import type { RefTable } from '@/lib/settings/actions';

export type SettingsData = {
  settings: Record<string, unknown>;
  lists: Record<'branches' | 'stages' | 'grades' | 'sections' | 'subjects' | 'eval_types' | 'attendance_statuses' | 'behavior_statuses', RefItem[]>;
  weights: { subject_id: number; eval_type_id: number; weight: number }[];
  terms: string[];
};

const REF: Record<string, { table: RefTable; title: string; description: string; hasActive?: boolean }> = {
  branches: { table: 'branches', title: 'الفروع', description: 'الفرع المعطّل يختفي من نماذج التسجيل الجديدة، ويبقى طلابه ومعلموه كما هم.', hasActive: true },
  stages: { table: 'stages', title: 'المراحل الدراسية', description: 'مثل: المتوسطة، الثانوية. ترتيبها هنا هو ترتيبها في كل القوائم.' },
  grades: { table: 'grades', title: 'الصفوف', description: 'كل صف ينتمي إلى مرحلة. لا يتكرر اسم الصف داخل المرحلة الواحدة.' },
  sections: { table: 'sections', title: 'الشعب', description: 'أسماء الشعب المستخدمة في كل الفروع.' },
  subjects: { table: 'subjects', title: 'المواد', description: 'المادة المعطّلة تختفي من نماذج التسجيل والتوزيع الجديدة، وتبقى درجاتها السابقة.', hasActive: true },
  attendance: { table: 'attendance_statuses', title: 'حالات الحضور', description: 'تظهر للمعلم عند تحضير كل حصة.' },
  behavior: { table: 'behavior_statuses', title: 'حالات السلوك', description: 'تظهر عند تسجيل ملاحظة سلوكية.' },
};

const asArray = (v: unknown) => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);
const ALL = SECTIONS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.group })));

/**
 * الإعدادات كاملة تُحمَّل مع الصفحة مرة واحدة (قوائم صغيرة)، والتنقل بين الأقسام فوري
 * بلا أي طلب للخادم: يتغير القسم في المتصفح ويُحدَّث الرابط فقط.
 */
export function SettingsApp({ data, initial }: { data: SettingsData; initial: string }) {
  const [active, setActive] = useState(ALL.some((s) => s.key === initial) ? initial : 'general');
  const current = ALL.find((s) => s.key === active)!;

  const go = (key: string) => {
    setActive(key);
    window.history.replaceState(null, '', `?s=${key}`);
  };
  useEffect(() => {
    const onPop = () => setActive(new URLSearchParams(location.search).get('s') ?? 'general');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const v = data.settings;
  const L = data.lists;
  let content: React.ReactNode = null;
  if (active === 'general') content = <BrandingEditor name={String(v.school_name ?? '')} logo={String(v.school_logo_url ?? '')} />;
  else if (active === 'announcements') content = <AnnouncementsEditor items={Array.isArray(v.announcements) ? (v.announcements as { title: string }[]) : []} />;
  else if (active === 'visibility')
    content = (
      <VisibilityEditor
        results={asArray(v.results_visible_grades)}
        weekly={asArray(v.weekly_grades_visibility)}
        calendar={typeof v.calendar_visibility === 'string' ? v.calendar_visibility : 'all'}
        exam={v.exam_visibility === 'hidden' ? 'hidden' : 'all'}
        branches={L.branches.filter((b) => b.is_active !== false).map((b) => b.name)}
        grades={L.grades.map((g) => g.name)}
        terms={data.terms}
      />
    );
  else if (active === 'eval')
    content = <RefListEditor table="eval_types" title="أنواع التقييم" description="مثل: واجبات، مشاركة، اختبار قصير. النوع (اختبار) يُعامل كاختبار في التقارير." items={L.eval_types} categories />;
  else if (active === 'weights')
    content = (
      <WeightsEditor
        subjects={L.subjects.filter((s) => s.is_active !== false)}
        evalTypes={L.eval_types.map((e) => ({ id: e.id, name: e.name, category: e.category ?? 'continuous' }))}
        weights={data.weights}
      />
    );
  else {
    const ref = REF[active];
    const key = ref.table as keyof SettingsData['lists'];
    content = (
      <RefListEditor
        table={ref.table}
        title={ref.title}
        description={ref.description}
        items={L[key]}
        hasActive={ref.hasActive}
        stages={ref.table === 'grades' ? L.stages : undefined}
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:gap-10">
      <LayoutGroup id="settings-nav">
        <aside>
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
                        <button type="button" onClick={() => go(it.key)} aria-current={on ? 'page' : undefined}
                          className={`relative block w-full rounded-xl px-3.5 py-2.5 text-start text-[0.95rem] transition-colors ${on ? 'font-semibold text-ink' : 'text-ink/70 hover:bg-surface hover:text-ink'}`}>
                          {on && <motion.span layoutId="settings-active" transition={{ type: 'spring', stiffness: 480, damping: 38 }} className="absolute inset-0 rounded-xl border border-line bg-surface shadow-sm" />}
                          <span className="relative">{it.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
          {/* الجوال */}
          <nav aria-label="أقسام الإعدادات" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden">
            {ALL.map((it) => {
              const on = it.key === active;
              return (
                <button key={it.key} type="button" onClick={() => go(it.key)}
                  className={`relative shrink-0 rounded-full px-4 py-2 text-sm transition-colors ${on ? 'font-semibold text-chalk' : 'bg-surface text-ink/75 ring-1 ring-line'}`}>
                  {on && <motion.span layoutId="settings-chip" className="absolute inset-0 rounded-full bg-board" transition={{ type: 'spring', stiffness: 480, damping: 38 }} />}
                  <span className="relative">{it.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>
      </LayoutGroup>

      <div className="min-w-0 max-w-3xl">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="text-sm text-muted">{current.group}</p>
            <h2 className="mb-5 text-2xl font-bold">{current.label}</h2>
            {/* key = القسم: كل قسم يبدأ بحالته الخاصة، فلا تنتقل قائمة قسم إلى آخر */}
            <div key={active} className="space-y-5">{content}</div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
