import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { SolveClient } from '@/components/assess/solve-client';

export const metadata: Metadata = { title: 'حل النموذج' };

/** صفحة الحل بملء الشاشة (بلا القائمة الجانبية) لتركيز الطالب */
export default async function SolvePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(['student']);
  const id = Number((await params).id);
  if (!Number.isFinite(id)) notFound();
  return <SolveClient id={id} />;
}
