import type { Metadata } from 'next';
import { LoginScreen } from '@/components/login-screen';

export const metadata: Metadata = { title: 'بوابة الطالب' };

export default async function StudentLoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return <LoginScreen portal="student" reason={reason} />;
}
