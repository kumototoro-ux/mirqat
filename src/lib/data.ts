import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { CLASS_SELECT, classLabel, type ClassRef } from '@/lib/format';

/** القوائم المرجعية المشتركة بين الصفحات — استعلام واحد لكل طلب */

export const getSchoolName = cache(async (): Promise<string> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc('get_public_settings');
  const v = (data as Record<string, unknown> | null)?.school_name;
  return typeof v === 'string' && v.trim() && v.trim() !== 'مِرقاة' ? v.trim() : 'مدرسة دار الهدى';
});

export type ClassOption = { id: number; label: string; branch: string; ref: ClassRef };

export const getClasses = cache(async (): Promise<ClassOption[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('classes')
    .select(`${CLASS_SELECT}, grade_sort:grades(sort_order, stage:stages(sort_order)), section_sort:sections(sort_order)`)
    .eq('is_active', true)
    .returns<(NonNullable<ClassRef> & {
      grade_sort: { sort_order: number; stage: { sort_order: number } | null } | null;
      section_sort: { sort_order: number } | null;
    })[]>();
  return (data ?? [])
    .sort(
      (a, b) =>
        (a.branch?.name ?? '').localeCompare(b.branch?.name ?? '', 'ar') ||
        (a.grade_sort?.stage?.sort_order ?? 0) - (b.grade_sort?.stage?.sort_order ?? 0) ||
        (a.grade_sort?.sort_order ?? 0) - (b.grade_sort?.sort_order ?? 0) ||
        (a.section_sort?.sort_order ?? 0) - (b.section_sort?.sort_order ?? 0),
    )
    .map((c) => ({ id: c.id, label: classLabel(c), branch: c.branch?.name ?? '', ref: c }));
});

/** قائمة الفصول للاختيار مع الفرع إن تعددت الفروع */
export async function classOptions() {
  const classes = await getClasses();
  const multiBranch = new Set(classes.map((c) => c.branch)).size > 1;
  return classes.map((c) => ({ value: c.id, label: multiBranch ? `${c.label} · ${c.branch}` : c.label }));
}

export const getSubjects = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from('subjects').select('id, name').order('sort_order').order('name');
  return data ?? [];
});

export type TermRow = { id: number; name: string; year: string; is_current: boolean };

export const getTerms = cache(async (): Promise<TermRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('terms')
    .select('id, name, sort_order, year:academic_years(name, is_current, starts_on)')
    .returns<{ id: number; name: string; sort_order: number; year: { name: string; is_current: boolean; starts_on: string | null } | null }[]>();
  return (data ?? [])
    .sort(
      (a, b) =>
        Number(b.year?.is_current ?? false) - Number(a.year?.is_current ?? false) ||
        (b.year?.starts_on ?? '').localeCompare(a.year?.starts_on ?? '') ||
        a.sort_order - b.sort_order,
    )
    .map((t) => ({ id: t.id, name: t.name, year: t.year?.name ?? '', is_current: t.year?.is_current ?? false }));
});

/** الفصل الدراسي الحالي: الذي يقع فيه اليوم من التقويم، وإلا أول فصل في السنة الحالية */
export const getCurrentTermId = cache(async (): Promise<number | null> => {
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
  const { data } = await supabase
    .from('calendar_entries')
    .select('term_id')
    .lte('starts_on', today)
    .gte('ends_on', today)
    .limit(1)
    .maybeSingle();
  if (data?.term_id) return data.term_id;
  const terms = await getTerms();
  return terms[0]?.id ?? null;
});

/** الأسبوع الدراسي الحالي من التقويم (للتحضير والرصد) */
export const getCurrentWeek = cache(async () => {
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
  const { data } = await supabase
    .from('school_weeks')
    .select('week_id, term_id, week_label, week_no, starts_on, ends_on')
    .lte('starts_on', today)
    .gte('ends_on', today)
    .limit(1)
    .maybeSingle();
  return data;
});
