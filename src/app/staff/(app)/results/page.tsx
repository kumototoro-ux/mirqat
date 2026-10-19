import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';
import { getClasses, getCurrentTermId, getTerms } from '@/lib/data';
import { classResults, listGrants, listRules, resultsOverview } from '@/lib/results/actions';
import { getNoticeSettings, getSchoolBrand } from '@/lib/results/server';
import { ResultsAdmin, type RefData } from '@/components/results/results-admin';
import type { Section } from '@/lib/results/shared';

export const metadata: Metadata = { title: 'النتائج' };

type Tab = 'board' | 'rules' | 'settings';

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ tab?: string; class?: string; term?: string }> }) {
  await requireUser(['admin']);
  const sp = await searchParams;
  const tab: Tab = sp.tab === 'rules' || sp.tab === 'settings' ? sp.tab : 'board';
  const [classes, terms, current] = await Promise.all([getClasses(), getTerms(), getCurrentTermId()]);
  const termId = Number(sp.term) || current || terms[0]?.id || 0;
  const classId = Number(sp.class) || null;

  const supabase = await createClient();
  const [branches, stages, grades, subjects, evalTypes, overview, rules, grants, cls, notice, brand] = await Promise.all([
    supabase.from('branches').select('id, name, is_intisab').order('sort_order').order('id'),
    supabase.from('stages').select('id, name').order('sort_order').order('id'),
    supabase.from('grades').select('id, name, stage_id').order('sort_order').order('id'),
    supabase.from('subjects').select('id, name, name_en').order('sort_order').order('name'),
    supabase.from('eval_types').select('id, name, name_en, report_section, category').order('sort_order').order('id'),
    termId ? resultsOverview(termId) : Promise.resolve([]),
    listRules(),
    listGrants(),
    classId && termId ? classResults(classId, termId).catch(() => null) : Promise.resolve(null),
    getNoticeSettings(),
    getSchoolBrand(),
  ]);

  const ref: RefData = {
    terms: terms.map((t) => ({ id: t.id, name: t.name, year: t.year, is_current: t.is_current })),
    classes: classes.map((c) => ({ id: c.id, label: c.label, branch: c.branch })),
    branches: (branches.data ?? []) as RefData['branches'],
    stages: stages.data ?? [],
    grades: (grades.data ?? []) as RefData['grades'],
    subjects: (subjects.data ?? []) as RefData['subjects'],
    evalTypes: (evalTypes.data ?? []) as { id: number; name: string; name_en: string | null; report_section: Section; category: string }[],
  };

  return (
    <>
      <PageHeader
        title="النتائج"
        lead="كشوف الفصول وإشعارات الطلاب، وتحكم كامل في متى ولمن تظهر النتائج."
      />
      <ResultsAdmin
        key={`${tab}-${termId}-${classId ?? 0}`}
        tab={tab}
        termId={termId}
        classId={classId}
        ref_={ref}
        overview={overview}
        initialClass={cls}
        rules={rules}
        grants={grants}
        notice={notice}
        brand={brand}
      />
    </>
  );
}
