import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Badge, Empty, PageHeader, PreviewNote, Tabs } from '@/components/ui';
import { fmtDate, fmtDateTime, fmtNum } from '@/lib/format';
import { getMe } from '@/lib/student';
import { subjectColor } from '@/components/timetable-grid';

export const metadata: Metadata = { title: 'مهامي ونماذجي' };

type Row = {
  id: number;
  kind: 'task' | 'form' | 'manual';
  title: string;
  description: string | null;
  link_url: string | null;
  max_score: number | null;
  due_at: string | null;
  subject: { name: string } | null;
  form: { status: string; opens_at: string | null; closes_at: string | null } | null;
};

export default async function StudentTasks({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requireUser(['student']);
  const sp = await searchParams;
  const kind = sp.kind === 'form' ? 'form' : 'task';
  const me = await getMe();
  const supabase = await createClient();
  const [{ data }, { data: mine }] = await Promise.all([
    supabase
      .from('assessments')
      .select('id, kind, title, description, link_url, max_score, due_at, subject:subjects(name), form:form_details(status, opens_at, closes_at)')
      .eq('class_id', me?.class_id ?? -1)
      .eq('kind', kind)
      .order('created_at', { ascending: false })
      .limit(100)
      .returns<Row[]>(),
    supabase.from('grade_entries').select('assessment_id, score, max_score, source').eq('student_id', me?.id ?? -1),
  ]);
  const gradeOf = (id: number) => (mine ?? []).find((g) => g.assessment_id === id);
  const now = Date.now();

  return (
    <>
      <PageHeader title="مهامي ونماذجي" lead="المهام والنماذج المنشورة لفصلك، ودرجتك في كل منها." />
      <Tabs
        active={kind}
        items={[
          { key: 'task', label: 'المهام', href: '/student/tasks?kind=task' },
          { key: 'form', label: 'النماذج الإلكترونية', href: '/student/tasks?kind=form' },
        ]}
      />
      {kind === 'form' && <PreviewNote>حل النماذج من المنصة يأتي في المرحلة القادمة.</PreviewNote>}
      {(data ?? []).length === 0 ? (
        <Empty title={kind === 'form' ? 'لا نماذج بعد' : 'لا مهام بعد'} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {(data ?? []).map((a) => {
            const g = gradeOf(a.id);
            const end = a.due_at ?? a.form?.closes_at ?? null;
            const overdue = !g && end && new Date(end).getTime() < now;
            return (
              <li key={a.id} className="flex flex-col rounded-2xl border border-line bg-surface p-4" style={{ boxShadow: `inset -3px 0 0 ${subjectColor(a.subject?.name ?? '')}` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{a.title}</p>
                    <p className="text-sm text-muted">{a.subject?.name}</p>
                  </div>
                  {g ? (
                    <span className="shrink-0 rounded-xl bg-ok-soft px-2.5 py-1 text-sm font-bold tabular-nums text-ok">
                      {fmtNum(Number(g.score), 2)} / {fmtNum(Number(g.max_score), 2)}
                    </span>
                  ) : overdue ? (
                    <Badge tone="danger">انتهى الموعد</Badge>
                  ) : (
                    <Badge tone="gold">لم تُرصد</Badge>
                  )}
                </div>
                {a.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{a.description}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3 text-xs text-muted">
                  {a.kind === 'form' && a.form?.opens_at && <span>يفتح {fmtDateTime(a.form.opens_at)}</span>}
                  {end && <span>{a.kind === 'form' ? '· يغلق' : 'التسليم'} {a.kind === 'form' ? fmtDateTime(end) : fmtDate(end)}</span>}
                  {g?.source === 'auto_absent' && <Badge tone="danger">صفر لعدم الحل</Badge>}
                  {a.link_url && (
                    <a href={a.link_url} target="_blank" rel="noopener noreferrer" className="ms-auto font-medium text-board hover:underline">
                      فتح الرابط
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
