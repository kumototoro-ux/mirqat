import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { REF_TAG } from '@/lib/data';
import { selectAll } from '@/lib/supabase/all';

export type Lookups = {
  branches: { id: number; name: string }[];
  stages: { id: number; name: string }[];
  grades: { id: number; name: string; stage_id: number }[];
  sections: { id: number; name: string }[];
  subjects: { id: number; name: string }[];
  /** المسميات الوظيفية (تُدار من الإعدادات) */
  jobTitles: string[];
  /** توزيع المواد: منه تُشتق المراحل والصفوف المتاحة لكل فرع، ومواد كل فصل */
  matrix: { b: number; g: number; s: number | null; sub: number }[];
};

/** القوائم المرجعية لنماذج التسجيل — تُرسل مرة واحدة مع الصفحة */
const cachedLookups = unstable_cache(
  async (): Promise<Lookups> => {
  const supabase = createAdminClient();
  const [b, st, g, se, su, jt, m] = await Promise.all([
    supabase.from('branches').select('id, name').eq('is_active', true).order('sort_order'),
    supabase.from('stages').select('id, name').order('sort_order'),
    supabase.from('grades').select('id, name, stage_id').order('sort_order'),
    supabase.from('sections').select('id, name').order('sort_order'),
    supabase.from('subjects').select('id, name').eq('is_active', true).order('sort_order'),
    supabase.from('job_titles').select('name').order('sort_order').order('id'),
    selectAll<{ branch_id: number; grade_id: number; section_id: number | null; subject_id: number }>((a, z) => supabase.from('subject_matrix').select('branch_id, grade_id, section_id, subject_id').order('id').range(a, z)),
  ]);
  return {
    branches: b.data ?? [],
    stages: st.data ?? [],
    grades: g.data ?? [],
    sections: se.data ?? [],
    subjects: su.data ?? [],
    jobTitles: (jt.data ?? []).map((r) => r.name as string),
    matrix: (m.data ?? []).map((r) => ({ b: r.branch_id, g: r.grade_id, s: r.section_id, sub: r.subject_id })),
  };
  },
  ['lookups'],
  { revalidate: 600, tags: [REF_TAG] },
);
export const getLookups = cache(() => cachedLookups());
