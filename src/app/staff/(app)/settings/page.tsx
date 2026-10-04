import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getTerms } from '@/lib/data';
import { SettingsApp, type SettingsData } from '@/components/settings/settings-app';
import type { RefItem } from '@/components/settings/editors';

export const metadata: Metadata = { title: 'الإعدادات العامة' };

/**
 * كل الإعدادات والقوائم المرجعية في تحميل واحد متوازٍ (قوائم صغيرة: عشرات الصفوف)،
 * فالتنقل بين أقسام الإعدادات بعدها فوري بلا طلبات.
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  await requireUser(['admin']);
  const { s = 'general' } = await searchParams;
  const supabase = await createClient();
  const list = (table: string, cols = 'id, name') => supabase.from(table).select(cols).order('sort_order').order('id');
  const [settings, branches, stages, grades, sections, subjects, evalTypes, att, beh, weights, terms] = await Promise.all([
    supabase.from('app_settings').select('key, value'),
    list('branches', 'id, name, is_active'),
    list('stages'),
    list('grades', 'id, name, stage_id'),
    list('sections'),
    list('subjects', 'id, name, is_active'),
    list('eval_types', 'id, name, category'),
    list('attendance_statuses'),
    list('behavior_statuses'),
    supabase.from('grade_weights').select('subject_id, eval_type_id, weight'),
    getTerms(),
  ]);
  const rows = (r: { data: unknown }) => (r.data ?? []) as RefItem[];
  const data: SettingsData = {
    settings: Object.fromEntries((settings.data ?? []).map((r) => [r.key, r.value])),
    lists: {
      branches: rows(branches),
      stages: rows(stages),
      grades: rows(grades),
      sections: rows(sections),
      subjects: rows(subjects),
      eval_types: rows(evalTypes),
      attendance_statuses: rows(att),
      behavior_statuses: rows(beh),
    },
    weights: ((weights.data ?? []) as { subject_id: number; eval_type_id: number; weight: number }[]).map((w) => ({ ...w, weight: Number(w.weight) })),
    terms: [...new Set(terms.map((t) => t.name))],
  };
  return <SettingsApp data={data} initial={s} />;
}
