import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getTerms } from '@/lib/data';
import { SettingsNav } from '@/components/settings/settings-nav';
import { SECTIONS } from '@/components/settings/sections';
import { AnnouncementsEditor, BrandingEditor, RefListEditor, VisibilityEditor, WeightsEditor } from '@/components/settings/editors';
import type { RefTable } from '@/lib/settings/actions';

export const metadata: Metadata = { title: 'الإعدادات العامة' };

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

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  await requireUser(['admin']);
  const { s = 'general' } = await searchParams;
  const section = SECTIONS.flatMap((g) => g.items).find((i) => i.key === s) ?? SECTIONS[0].items[0];
  const group = SECTIONS.find((g) => g.items.some((i) => i.key === section.key))?.group;

  return (
    <div className="grid gap-6 lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:gap-10">
      <aside>
        <Suspense>
          <SettingsNav />
        </Suspense>
      </aside>
      <div className="min-w-0 max-w-3xl">
        <p className="text-sm text-muted">{group}</p>
        <h2 className="mb-5 text-2xl font-bold">{section.label}</h2>
        <div className="space-y-5">
          {/* كل قسم يستعلم عما يحتاجه فقط */}
          <Section k={section.key} />
        </div>
      </div>
    </div>
  );
}

async function Section({ k }: { k: string }) {
  const supabase = await createClient();

  if (k === 'general' || k === 'announcements' || k === 'visibility') {
    const { data } = await supabase.from('app_settings').select('key, value');
    const v = Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) as Record<string, unknown>;
    if (k === 'general') return <BrandingEditor name={String(v.school_name ?? '')} logo={String(v.school_logo_url ?? '')} />;
    if (k === 'announcements') return <AnnouncementsEditor items={Array.isArray(v.announcements) ? (v.announcements as { title: string }[]) : []} />;
    const [branches, grades, terms] = await Promise.all([
      supabase.from('branches').select('name').eq('is_active', true).order('sort_order'),
      supabase.from('grades').select('name').order('sort_order'),
      getTerms(),
    ]);
    return (
      <VisibilityEditor
        results={asArray(v.results_visible_grades)}
        weekly={asArray(v.weekly_grades_visibility)}
        calendar={typeof v.calendar_visibility === 'string' ? v.calendar_visibility : 'all'}
        exam={v.exam_visibility === 'hidden' ? 'hidden' : 'all'}
        branches={(branches.data ?? []).map((b) => b.name)}
        grades={(grades.data ?? []).map((g) => g.name)}
        terms={[...new Set(terms.map((t) => t.name))]}
      />
    );
  }

  if (k === 'eval' || k === 'weights') {
    const [ev, su, w] = await Promise.all([
      supabase.from('eval_types').select('id, name, category').order('sort_order'),
      supabase.from('subjects').select('id, name').eq('is_active', true).order('sort_order'),
      k === 'weights' ? supabase.from('grade_weights').select('subject_id, eval_type_id, weight') : Promise.resolve({ data: [] }),
    ]);
    if (k === 'eval')
      return <RefListEditor table="eval_types" title="أنواع التقييم" description="مثل: واجبات، مشاركة، اختبار قصير. النوع (اختبار) يُعامل كاختبار في التقارير." items={ev.data ?? []} categories />;
    return <WeightsEditor subjects={su.data ?? []} evalTypes={ev.data ?? []} weights={(w.data ?? []) as { subject_id: number; eval_type_id: number; weight: number }[]} />;
  }

  const ref = REF[k];
  if (!ref) return null;
  const cols = ref.table === 'grades' ? 'id, name, stage_id' : ref.hasActive ? 'id, name, is_active' : 'id, name';
  const [{ data }, stages] = await Promise.all([
    supabase.from(ref.table).select(cols).order('sort_order').order('id'),
    ref.table === 'grades' ? supabase.from('stages').select('id, name').order('sort_order') : Promise.resolve({ data: undefined }),
  ]);
  return (
    <RefListEditor
      table={ref.table}
      title={ref.title}
      description={ref.description}
      items={(data ?? []) as unknown as { id: number; name: string }[]}
      hasActive={ref.hasActive}
      stages={stages.data ?? undefined}
    />
  );
}
