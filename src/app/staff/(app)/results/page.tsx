import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Empty, ErrorNote, FilterBar, PageHeader, PreviewNote, Select } from '@/components/ui';
import { fmtNum, scoreTone } from '@/lib/format';
import { classOptions, getCurrentTermId, getTerms } from '@/lib/data';

export const metadata: Metadata = { title: 'النتائج' };

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ class?: string; term?: string }> }) {
  await requireUser(['admin']);
  const sp = await searchParams;
  const [classes, terms, currentTerm] = await Promise.all([classOptions(), getTerms(), getCurrentTermId()]);
  const classId = Number(sp.class) || (classes[0]?.value as number | undefined) || null;
  const termId = Number(sp.term) || currentTerm;

  const supabase = await createClient();
  const { data: students, error: sErr } = await supabase
    .from('students')
    .select('id, code, name_ar')
    .eq('class_id', classId ?? -1)
    .eq('status', 'active')
    .order('name_ar');
  const ids = (students ?? []).map((s) => s.id);
  const [{ data: totals, error: tErr }, { data: subjects }] = await Promise.all([
    ids.length
      ? supabase.from('grade_totals').select('student_id, subject_id, total, is_visible').eq('term_id', termId ?? -1).in('student_id', ids)
      : Promise.resolve({ data: [] as { student_id: number; subject_id: number; total: number; is_visible: boolean }[], error: null }),
    supabase.from('subjects').select('id, name').order('sort_order'),
  ]);

  const subjectIds = [...new Set((totals ?? []).map((t) => t.subject_id))];
  const cols = (subjects ?? []).filter((s) => subjectIds.includes(s.id));
  const cell = (sid: number, sub: number) => (totals ?? []).find((t) => t.student_id === sid && t.subject_id === sub);

  return (
    <>
      <PageHeader title="النتائج" lead="مجموع كل طالب في كل مادة، محسوب لحظيًا من الرصد بأوزان التقييم." />
      <PreviewNote>للعرض الآن. التحكم بإظهار النتائج للطلاب يأتي بعد الإطلاق.</PreviewNote>
      <FilterBar>
        <Select name="class" label="الفصل" value={classId} options={classes} className="w-64" />
        <Select name="term" label="الفصل الدراسي" value={termId} options={terms.map((t) => ({ value: t.id, label: `${t.name} ${t.year}` }))} className="w-48" />
      </FilterBar>
      <ErrorNote error={sErr ?? tErr} />
      {!ids.length ? (
        <Empty title="لا طلاب في هذا الفصل" />
      ) : !cols.length ? (
        <Empty title="لا درجات مرصودة لهذا الفصل في هذا الفصل الدراسي" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full text-sm" style={{ minWidth: 240 + cols.length * 110 }}>
            <thead className="border-b border-line bg-paper/70 text-muted">
              <tr>
                <th className="sticky start-0 z-10 bg-paper px-4 py-2.5 text-start font-medium">الطالب</th>
                {cols.map((c) => (
                  <th key={c.id} className="px-2 py-2.5 text-center font-medium">{c.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(students ?? []).map((s) => (
                <tr key={s.id} className="transition-colors hover:bg-paper/50">
                  <th scope="row" className="sticky start-0 bg-surface px-4 py-2.5 text-start font-medium">
                    <Link href={`/staff/students/${s.id}`} className="hover:text-board hover:underline">{s.name_ar}</Link>
                    <span className="block text-xs font-normal text-muted"><bdi>{s.code}</bdi></span>
                  </th>
                  {cols.map((c) => {
                    const t = cell(s.id, c.id);
                    return (
                      <td key={c.id} className="px-2 py-2 text-center">
                        {t ? (
                          <span className={`inline-block min-w-14 rounded-lg px-2 py-1 font-semibold tabular-nums ${scoreTone(Number(t.total))} ${t.is_visible ? '' : 'opacity-60'}`} title={t.is_visible ? '' : 'مخفية عن الطالب'}>
                            {fmtNum(Number(t.total), 2)}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
