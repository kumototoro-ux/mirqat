import { AppHeader, type NavItem } from '@/components/app-header';
import { requireUser } from '@/lib/auth/session';
import { PageTransition } from '@/components/motion';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(['admin', 'teacher']);
  const nav: NavItem[] = [{ href: '/staff', label: 'الرئيسية' }];
  if (user.role === 'admin') nav.push({ href: '/staff/accounts', label: 'الحسابات' });

  return (
    <>
      <AppHeader home="/staff" nav={nav} displayName={user.displayName} role={user.role} />
      <main className="mx-auto max-w-6xl px-5 py-8">
        <PageTransition>
          <div className="animate-fade-up">{children}</div>
        </PageTransition>
      </main>
    </>
  );
}
