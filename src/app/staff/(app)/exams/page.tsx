import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getExamsFor, getSlotsFor, getVisibility } from '@/lib/schedule/view';
import { AdminExams, ExamsAgenda } from '@/components/schedule/exams-agenda';

export const metadata: Metadata = { title: 'جدول الاختبارات' };

export default async function ExamsPage() {
  const user = await requireUser(['admin', 'teacher']);
  const vis = await getVisibility();
  if (user.role === 'admin') return <AdminExams exams={await getExamsFor()} hidden={vis.examsHidden} />;
  if (vis.examsHidden) return <ExamsAgenda exams={[]} showClass hidden />;
  // المعلم: اختبارات الفصول التي يدرّسها، والاختبارات المسندة إليه
  const mine = await getSlotsFor({ teacherId: user.employeeId ?? -1 });
  const exams = await getExamsFor({ classIds: [...new Set(mine.map((s) => s.classId))], teacherId: user.employeeId ?? -1 });
  return <ExamsAgenda exams={exams} showClass />;
}
