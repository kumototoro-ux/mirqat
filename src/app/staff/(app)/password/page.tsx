import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { PasswordPanel } from '@/components/password-panel';

export const metadata: Metadata = { title: 'تغيير كلمة المرور' };

export default async function StaffPassword() {
  const user = await requireUser(['admin', 'teacher']);
  return <PasswordPanel name={user.displayName} />;
}
