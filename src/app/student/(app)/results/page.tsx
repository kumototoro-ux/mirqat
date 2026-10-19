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

  return (
    <>
      <PageHeader title="نتائجي" lead="درجاتك في كل مادة مقسّمة على أعمال الترم والاختبارات، مع إشعار الدرجات للتنزيل." />
      {terms.length > 1 && (
        <nav className="mb-5 flex gap-2 overflow-x-auto pb-1" aria-label="الفصول الدراسية">
          {terms.map((t) => {
            const on = t.id === termId;
            return (
              <Link
                key={t.id}
                href={`/student/results?term=${t.id}`}
                aria-current={on ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-colors ${on ? 'border-board bg-board text-chalk' : 'border-line bg-surface hover:border-board/40'}`}
              >
                {!t.access.visible && <Icon name="key" className={`size-4 ${on ? 'text-gold' : 'text-muted'}`} />}
                {t.name}
                <span className={`text-xs font-normal ${on ? 'text-chalk/70' : 'text-muted'}`}>{t.year}</span>
              </Link>
            );
          })}
        </nav>
      )}
      <StudentResults card={card} brand={brand} settings={settings} />
    </>
  );
}
