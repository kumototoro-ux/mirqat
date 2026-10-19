import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui';
import { Icon } from '@/components/shell/icons';
import { getAuthorContext } from '@/lib/assess/queries';
import { TaskEditor } from '@/components/assess/task-editor';
import { FormBuilder } from '@/components/assess/form-builder';

export const metadata: Metadata = { title: 'إنشاء' };

export default async function NewAssessment({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const user = await requireUser(['admin', 'teacher']);
  const { kind } = await searchParams;
  const isForm = kind === 'form';
  const ctx = await getAuthorContext(user);
  return (
    <>
      <Link href="/staff/tasks" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-board">
        <Icon name="chevron" className="size-4 rotate-180" /> المهام والنماذج
      </Link>
      <PageHeader
        title={isForm ? 'نموذج جديد' : 'مهمة جديدة'}
        lead={isForm ? 'ستة أنواع أسئلة، رياضيات، تصحيح آلي، ومدة لكل طالب.' : 'البيانات، ثم المطلوب والمرفقات، ثم طريقة التسليم والموعد.'}
        actions={
          <Link href={`/staff/tasks/new?kind=${isForm ? 'task' : 'form'}`} replace className="btn-quiet">
            <Icon name={isForm ? 'tasks' : 'forms'} className="size-4" /> {isForm ? 'مهمة بدلًا من ذلك' : 'نموذج بدلًا من ذلك'}
          </Link>
        }
      />
      {isForm ? <FormBuilder key="form" ctx={ctx} /> : <TaskEditor key="task" ctx={ctx} />}
    </>
  );
}
