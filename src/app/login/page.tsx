import type { Metadata } from 'next';
import { LoginScreen } from '@/components/login-screen';

export const metadata: Metadata = { title: 'دخول الموظفين' };

export default async function StaffLoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return <LoginScreen portal="staff" reason={reason} />;
}
