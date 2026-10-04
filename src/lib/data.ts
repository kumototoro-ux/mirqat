import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { CLASS_SELECT, classLabel, type ClassRef } from '@/lib/format';

/** القوائم المرجعية المشتركة بين الصفحات — استعلام واحد لكل طلب */

/*
  القوائم المرجعية (المدرسة، الفصول، الفصول الدراسية، الأسبوع) لا تختلف بين المستخدمين ولا تتغير كل دقيقة،
  فتُخزَّن في ذاكرة الخادم المشتركة دقائق (unstable_cache) بدل استعلامها مع كل صفحة لكل مستخدم.
  تُقرأ بالمفتاح السري لأنها مشتركة (والكل يملك قراءتها أصلًا)، وتُمسح فور تعديلها بوسم (tag).
*/
export const REF_TAG = 'reference';

const cachedSchoolName = unstable_cache(
  async () => {
    const { data } = await createAdminClient().rpc('get_public_settings');
    const v = (data as Record<string, unknown> | null)?.school_name;
    return typeof v === 'string' && v.trim() && v.trim() !== 'مِرقاة' ? v.trim() : 'مدرسة دار الهدى';
  },
  ['school-name'],
  { revalidate: 3600, tags: [REF_TAG] },
);
export const getSchoolName = cache(() => cachedSchoolName());

export type ClassOption = { id: number; label: string; branch: string; ref: ClassRef };

const cachedClasses = unstable_cache(
  async (): Promise<ClassOption[]> => {
  const supabase = createAdminClient();
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
  },
  ['classes'],
  { revalidate: 600, tags: [REF_TAG] },
);
export const getClasses = cache(() => cachedClasses());

/** قائمة الفصول للاختيار مع الفرع إن تعددت الفروع */
export async function classOptions() {
  const classes = await getClasses();
  const multiBranch = new Set(classes.map((c) => c.branch)).size > 1;
  return classes.map((c) => ({ value: c.id, label: multiBranch ? `${c.label} · ${c.branch}` : c.label }));
}

const cachedSubjects = unstable_cache(
  async () => {
    const { data } = await createAdminClient().from('subjects').select('id, name').order('sort_order').order('name');
    return data ?? [];
  },
  ['subjects'],
  { revalidate: 600, tags: [REF_TAG] },
);
export const getSubjects = cache(() => cachedSubjects());

export type TermRow = { id: number; name: string; year: string; is_current: boolean };

const cachedTerms = unstable_cache(
  async (): Promise<TermRow[]> => {
  const supabase = createAdminClient();
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
  },
  ['terms'],
  { revalidate: 600, tags: [REF_TAG] },
);
export const getTerms = cache(() => cachedTerms());

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
const cachedWeek = unstable_cache(
  async (today: string) => {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('school_weeks')
    .select('week_id, term_id, week_label, week_no, starts_on, ends_on')
    .lte('starts_on', today)
    .gte('ends_on', today)
    .limit(1)
    .maybeSingle();
  return data;
  },
  ['current-week'],
  { revalidate: 1800, tags: [REF_TAG] },
);
export const getCurrentWeek = cache(() =>
  cachedWeek(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date())),
);
