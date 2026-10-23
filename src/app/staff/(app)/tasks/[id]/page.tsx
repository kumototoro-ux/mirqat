import { PendingSwap } from '@/components/shell/pending-search';
import { PanelSkeleton } from '@/components/skeletons';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getAuthorContext, getFormDetail, getTaskDetail } from '@/lib/assess/queries';
import { itemStatus, SUBMISSION_MODES } from '@/lib/assess/shared';
import { DetailHeader } from '@/components/assess/detail-header';
import { TaskGrading } from '@/components/assess/task-grading';
import { TaskEditor } from '@/components/assess/task-editor';
import { FormBuilder } from '@/components/assess/form-builder';
import { FormAnalytics, FormResults } from '@/components/assess/form-results';
import { Attachments } from '@/components/assess/attachments';

export const metadata: Metadata = { title: 'التفاصيل' };

export default async function AssessmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser(['admin', 'teacher']);
  const { id: raw } = await params;
  const { tab } = await searchParams;
  const id = Number(raw);
  if (!Number.isFinite(id)) notFound();

  const supabase = await createClient();
  const { data: k } = await supabase.from('assessments').select('kind').eq('id', id).maybeSingle();
  if (!k || (k.kind !== 'task' && k.kind !== 'form')) notFound();
  const ctx = await getAuthorContext(user);

  if (k.kind === 'task') {
    const task = await getTaskDetail(id, user);
    if (!task) notFound();
    const active = tab === 'edit' && task.canEdit ? 'edit' : 'submissions';
    const toGrade = task.submissions.filter((s) => !s.graded_at).length;
    return (
      <>
        <DetailHeader
          ctx={ctx}
          active={active}
          tabs={[{ key: 'submissions', label: task.submission_mode === 'none' ? 'الرصد' : 'التسليمات والرصد', badge: toGrade }, ...(task.canEdit ? [{ key: 'edit', label: 'تعديل المهمة' }] : [])]}
          info={{
            id: task.id,
            kind: 'task',
            title: task.title,
            description: task.description,
            class_id: task.class_id,
            class_label: task.class_label,
            subject_id: task.subject_id,
            subject: task.subject,
            eval_type: task.eval_type,
            teacher: task.teacher,
            status: itemStatus({ kind: 'task', is_draft: task.is_draft, published_at: task.published_at, due_at: task.due_at }),
            opens: task.published_at && new Date(task.published_at).getTime() > Date.now() ? task.published_at : null,
            closes: task.due_at,
            meta: [
              `من ${task.max_score}`,
              SUBMISSION_MODES.find((m) => m.value === task.submission_mode)?.label ?? '',
              ...(task.allow_late ? ['يقبل المتأخر'] : []),
              ...(task.attachments.length ? [`${task.attachments.length} مرفق`] : []),
            ],
            canEdit: task.canEdit,
            hasAttempts: task.submissions.length > 0,
          }}
        />
        <PendingSwap fallback={<PanelSkeleton stats={false} rows={6} />}>
          {active === 'edit' ? (
            <TaskEditor ctx={ctx} task={task} />
          ) : (
            <>
              {task.attachments.length > 0 && <Attachments items={task.attachments} className="mb-4" />}
              <TaskGrading task={task} />
            </>
          )}
        </PendingSwap>
      </>
    );
  }

  const form = await getFormDetail(id, user);
  if (!form) notFound();
  const hasAttempts = form.attempts.some((a) => !a.is_auto_absent);
  const pending = form.attempts.filter((a) => a.pending_review > 0).length;
  const defaultTab = form.details.status === 'draft' && form.canEdit ? 'questions' : 'results';
  const active = tab === 'questions' && form.canEdit ? 'questions' : tab === 'analysis' ? 'analysis' : tab === 'results' ? 'results' : defaultTab;
  const total = form.questions.reduce((a, q) => a + q.points, 0);
  return (
    <>
      <DetailHeader
        ctx={ctx}
        active={active}
        tabs={[
          { key: 'results', label: 'النتائج', badge: pending },
          { key: 'analysis', label: 'التحليل' },
          ...(form.canEdit ? [{ key: 'questions', label: 'الأسئلة والإعدادات' }] : []),
        ]}
        info={{
          id: form.id,
          kind: 'form',
          title: form.title,
          description: form.description,
          class_id: form.class_id,
          class_label: form.class_label,
          subject_id: form.subject_id,
          subject: form.subject,
          eval_type: form.eval_type,
          teacher: form.teacher,
          status: itemStatus({ kind: 'form', form_status: form.details.status, opens_at: form.details.opens_at, closes_at: form.details.closes_at }),
          formStatus: form.details.status,
          opens: form.details.opens_at,
          closes: form.details.closes_at,
          meta: [
            `${form.questions.length} سؤال · ${total} درجة`,
            form.details.time_limit_minutes ? `${form.details.time_limit_minutes} دقيقة لكل طالب` : 'بلا حد زمني',
            `${form.details.max_attempts} ${form.details.max_attempts === 1 ? 'محاولة' : 'محاولات'}`,
            ...(form.details.shuffle_questions ? ['خلط الأسئلة'] : []),
          ],
          canEdit: form.canEdit,
          hasAttempts,
        }}
      />
      <PendingSwap fallback={<PanelSkeleton stats={false} rows={6} />}>
        {active === 'questions' ? <FormBuilder ctx={ctx} form={form} /> : active === 'analysis' ? <FormAnalytics form={form} /> : <FormResults form={form} />}
      </PendingSwap>
    </>
  );
}
