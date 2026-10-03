import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

export type Lookups = {
  branches: { id: number; name: string }[];
  stages: { id: number; name: string }[];
  grades: { id: number; name: string; stage_id: number }[];
  sections: { id: number; name: string }[];
  subjects: { id: number; name: string }[];
  /** توزيع المواد: منه تُشتق المراحل والصفوف المتاحة لكل فرع، ومواد كل فصل */
  matrix: { b: number; g: number; s: number | null; sub: number }[];
};

/** القوائم المرجعية لنماذج التسجيل — تُرسل مرة واحدة مع الصفحة */
export const getLookups = cache(async (): Promise<Lookups> => {
  const supabase = await createClient();
  const [b, st, g, se, su, m] = await Promise.all([
    supabase.from('branches').select('id, name').eq('is_active', true).order('sort_order'),
    supabase.from('stages').select('id, name').order('sort_order'),
    supabase.from('grades').select('id, name, stage_id').order('sort_order'),
    supabase.from('sections').select('id, name').order('sort_order'),
    supabase.from('subjects').select('id, name').eq('is_active', true).order('sort_order'),
    supabase.from('subject_matrix').select('branch_id, grade_id, section_id, subject_id').limit(5000),
  ]);
  return {
    branches: b.data ?? [],
    stages: st.data ?? [],
    grades: g.data ?? [],
    sections: se.data ?? [],
    subjects: su.data ?? [],
    matrix: (m.data ?? []).map((r) => ({ b: r.branch_id, g: r.grade_id, s: r.section_id, sub: r.subject_id })),
  };
});
