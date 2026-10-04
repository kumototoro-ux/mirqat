import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { PasswordPanel } from '@/components/password-panel';

export const metadata: Metadata = { title: 'تغيير كلمة المرور' };

export default async function StudentPassword() {
  const user = await requireUser(['student']);
  return <PasswordPanel name={user.displayName} />;
}
