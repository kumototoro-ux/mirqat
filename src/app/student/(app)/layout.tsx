import { AppHeader } from '@/components/app-header';
import { requireUser } from '@/lib/auth/session';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(['student']);
  return (
    <>
      <AppHeader home="/student" nav={[]} displayName={user.displayName} role={user.role} />
      <main className="mx-auto max-w-3xl px-5 py-8">{children}</main>
    </>
  );
}
