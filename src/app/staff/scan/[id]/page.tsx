import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePerm } from '@/lib/perms/server';
import { requireUser } from '@/lib/auth/session';
import { getPrintData } from '@/lib/assess/queries';
import { paperStatus } from '@/lib/assess/actions';
import { ScanStudio } from '@/components/assess/scan-studio';

export const metadata: Metadata = { title: 'تصحيح الأوراق بالكاميرا' };

/** شاشة كاملة بلا إطار الموقع — للجوال غالبًا: تصوير ورقة الإجابة ← مراجعة ← حفظ الدرجة */
export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(['admin', 'teacher']);
  await requirePerm('camera_grading', '/staff/tasks');
  const id = Number((await params).id);
  if (!Number.isFinite(id)) notFound();
  const data = await getPrintData(id, user);
  if (!data || !data.form.canEdit) notFound();
  const status = await paperStatus(id);
  return <ScanStudio data={data} initialStatus={status} />;
}
