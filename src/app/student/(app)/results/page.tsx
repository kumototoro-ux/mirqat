import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';
import { Icon } from '@/components/shell/icons';
import { getCurrentTermId } from '@/lib/data';
import { getNoticeSettings, getSchoolBrand } from '@/lib/results/server';
import type { Access, StudentCard } from '@/lib/results/shared';
import { StudentResults } from '@/components/results/student-results';
import { PendingLink, PendingSwap } from '@/components/shell/pending-search';
import { CardGridSkeleton } from '@/components/skeletons';
import { StudentCertificate } from '@/components/results/student-certificate';
import { getCertImages, getCertSettings } from '@/lib/results/cert-server';
import { buildYear, type YearInput } from '@/lib/results/certificate';

export const metadata: Metadata = { title: 'نتائجي' };

type TermRow = { id: number; name: string; year: string; access: Access };

export default async function StudentResultsPage({ searchParams }: { searchParams: Promise<{ term?: string }> }) {
  await requireUser(['student']);
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: termsData }, current] = await Promise.all([supabase.rpc('my_result_terms'), getCurrentTermId()]);
  const terms = (termsData as TermRow[] | null) ?? [];
  const termId = Number(sp.term) || (terms.some((t) => t.id === current) ? current : terms[0]?.id) || null;
  const [{ data: cardData }, brand, settings] = await Promise.all([
    termId ? supabase.rpc('my_report_card', { p_term_id: termId }) : Promise.resolve({ data: null }),
    getSchoolBrand(),
    getNoticeSettings(),
  ]);
  const card = cardData as StudentCard | null;

  // شهادة نهاية العام: حين تتيحها الإدارة وتكون نتائج كل فصول العام الحالي ظاهرة للطالب
  const cert = await (async () => {
    const yearTerms = terms.filter((t) => t.year === terms[0]?.year);
    if (!yearTerms.length || !yearTerms.every((t) => t.access.visible)) return null;
    const cs = await getCertSettings();
    if (!cs.student_visible) return null;
    const cards = await Promise.all(yearTerms.map((t) => supabase.rpc('my_report_card', { p_term_id: t.id }).then((r) => r.data as StudentCard | null)));
    const input: YearInput = [];
    for (let i = 0; i < yearTerms.length; i++) {
      const c = cards[i];
      if (c?.status !== 'ok') return null;
      input.push({ term: c.term ?? { id: yearTerms[i].id, name: yearTerms[i].name, year: yearTerms[i].year }, subjects: c.subjects, student: c.student });
    }
    const built = buildYear(input, cs.pass_mark);
    if (!built) return null;
    return {
      cert: built,
      settings: { ...cs, school_ar: cs.school_ar || brand.name, principal_name: cs.principal_name || settings.principal },
      brand: { logo: brand.logo, images: await getCertImages(cs) },
    };
  })();

  return (
    <>
      <PageHeader title="نتائجي" lead="درجاتك في كل مادة مقسّمة على أعمال الترم والاختبارات، مع إشعار الدرجات للتنزيل." />
      {cert && <StudentCertificate {...cert} />}
      {terms.length > 1 && (
        <nav className="mb-5 flex gap-2 overflow-x-auto pb-1" aria-label="الفصول الدراسية">
          {terms.map((t) => {
            const on = t.id === termId;
            return (
              <PendingLink
                key={t.id}
                href={`/student/results?term=${t.id}`}
                active={on}
                base="group flex shrink-0 items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-colors"
                on="is-on border-board bg-board text-chalk"
                off="border-line bg-surface hover:border-board/40"
              >
                {!t.access.visible && <Icon name="key" className="size-4 text-muted group-[.is-on]:text-gold" />}
                {t.name}
                <span className="text-xs font-normal text-muted group-[.is-on]:text-chalk/70">{t.year}</span>
              </PendingLink>
            );
          })}
        </nav>
      )}
      <PendingSwap fallback={<CardGridSkeleton header={false} hero cols={2} />}>
        <StudentResults card={card} brand={brand} settings={settings} />
      </PendingSwap>
    </>
  );
}
