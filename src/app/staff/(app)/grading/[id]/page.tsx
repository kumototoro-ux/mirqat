import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Icon } from '@/components/shell/icons';
import { getAuthorContext, getFormDetail, getManualDetail, getTaskDetail } from '@/lib/assess/queries';
import { TaskDesk } from '@/components/assess/task-desk';
import { FormDesk } from '@/components/assess/form-desk';
import { ManualEdit } from '@/components/assess/manual-edit';

export const metadata: Metadata = { title: 'التصحيح والرصد' };

export default async function GradingDeskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(['admin', 'teacher']);
  const id = Number((await params).id);
  if (!Number.isFinite(id)) notFound();
  const supabase = await createClient();
  const { data: k } = await supabase.from('assessments').select('kind').eq('id', id).maybeSingle();
  if (!k) notFound();

  if (k.kind === 'manual') {
    const [m, ctx] = await Promise.all([getManualDetail(id, user), getAuthorContext(user)]);
    if (!m) notFound();
    return <ManualEdit m={m} ctx={ctx} />;
  }

  const back = (
    <Link href="/staff/grading" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-board">
      <Icon name="chevron" className="size-4 rotate-180" /> الرصد اليومي
    </Link>
  );
  if (k.kind === 'task') {
    const t = await getTaskDetail(id, user);
    if (!t) notFound();
    return (
      <>
        {back}
        <Header kind="task" title={t.title} meta={`${t.class_label} · ${t.subject} · من ${t.max_score}`} id={id} />
        <TaskDesk task={t} />
      </>
    );
  }
  const f = await getFormDetail(id, user);
  if (!f) notFound();
  return (
    <>
      {back}
      <Header kind="form" title={f.title} meta={`${f.class_label} · ${f.subject} · ${f.questions.length} سؤال`} id={id} />
      <FormDesk form={f} />
    </>
  );
}

function Header({ kind, title, meta, id }: { kind: 'task' | 'form'; title: string; meta: string; id: number }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${kind === 'form' ? 'bg-brass-soft text-brass' : 'bg-board/10 text-board'}`}>
        <Icon name={kind === 'form' ? 'forms' : 'tasks'} className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[1.4rem] font-bold">{title}</h1>
        <p className="truncate text-sm text-muted">{meta}</p>
      </div>
      <Link href={`/staff/tasks/${id}`} className="btn-quiet hidden px-3 sm:inline-flex">التفاصيل</Link>
    </div>
  );
}
