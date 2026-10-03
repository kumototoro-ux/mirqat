import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Card, Empty, PageHeader, StatGrid } from '@/components/ui';
import { fmtNum, scoreTone } from '@/lib/format';
import { getCurrentTermId, getTerms } from '@/lib/data';
import { getMe } from '@/lib/student';
import { subjectColor } from '@/components/timetable-grid';

export const metadata: Metadata = { title: 'نتائجي' };

export default async function StudentResults({ searchParams }: { searchParams: Promise<{ term?: string }> }) {
  await requireUser(['student']);
  const sp = await searchParams;
  const me = await getMe();
  const [terms, current] = await Promise.all([getTerms(), getCurrentTermId()]);
  const termId = Number(sp.term) || current;
  const supabase = await createClient();
  const [{ data: totals }, { data: subjects }] = await Promise.all([
    supabase.from('grade_totals').select('subject_id, total, is_visible').eq('student_id', me?.id ?? -1).eq('term_id', termId ?? -1),
    supabase.from('subjects').select('id, name'),
  ]);
  // يرى الطالب ما أذنت الإدارة بإظهاره فقط
  const visible = (totals ?? []).filter((t) => t.is_visible).sort((a, b) => Number(b.total) - Number(a.total));
  const name = (id: number) => subjects?.find((s) => s.id === id)?.name ?? '—';
  const avg = visible.length ? visible.reduce((a, t) => a + Number(t.total), 0) / visible.length : null;
  const best = visible[0];

  return (
    <>
      <PageHeader
        title="نتائجي"
        lead="مجموعك في كل مادة، محسوب من كل التقييمات المرصودة."
        actions={
          <form className="flex items-center gap-2">
            <select name="term" defaultValue={termId ?? ''} className="field w-auto py-2">
              {terms.map((t) => <option key={t.id} value={t.id}>{t.name} {t.year}</option>)}
            </select>
            <button className="btn-quiet py-2">عرض</button>
          </form>
        }
      />
      {visible.length === 0 ? (
        <Empty title="لا نتائج معروضة بعد">تظهر نتائجك هنا عندما ترصدها مدرستك وتسمح بعرضها.</Empty>
      ) : (
        <div className="space-y-6">
          <StatGrid
            items={[
              { label: 'المتوسط', value: avg != null ? fmtNum(avg, 1) : '—' },
              { label: 'عدد المواد', value: fmtNum(visible.length) },
              { label: 'أعلى مادة', value: best ? fmtNum(Number(best.total), 1) : '—', hint: best ? name(best.subject_id) : undefined, tone: 'gold' },
              { label: 'مواد تحت 50', value: fmtNum(visible.filter((t) => Number(t.total) < 50).length), tone: 'danger' },
            ]}
          />
          <Card>
            <ul className="space-y-4">
              {visible.map((t) => {
                const v = Number(t.total);
                const n = name(t.subject_id);
                return (
                  <li key={t.subject_id}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="font-medium">{n}</span>
                      <span className={`rounded-lg px-2 py-0.5 font-bold tabular-nums ${scoreTone(v)}`}>{fmtNum(v, 2)}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-paper">
                      <div className="h-full origin-right animate-grow rounded-full" style={{ width: `${Math.min(100, v)}%`, background: subjectColor(n) }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
