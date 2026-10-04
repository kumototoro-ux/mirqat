import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getMe } from '@/lib/student';
import { getExamsFor, getVisibility } from '@/lib/schedule/view';
import { ExamsAgenda } from '@/components/schedule/exams-agenda';

export const metadata: Metadata = { title: 'جدول الاختبارات' };

export default async function StudentExams() {
  await requireUser(['student']);
  const [me, vis] = await Promise.all([getMe(), getVisibility()]);
  if (vis.examsHidden) return <ExamsAgenda exams={[]} showClass={false} hidden />;
  const exams = me?.class_id ? await getExamsFor({ classIds: [me.class_id] }) : [];
  return <ExamsAgenda exams={exams} showClass={false} />;
}
