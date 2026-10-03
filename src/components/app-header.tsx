import Link from 'next/link';
import { ROLE_LABEL, type AppRole } from '@/lib/auth/roles';
import { Brand } from '@/components/motion';

export type NavItem = { href: string; label: string };

/** رأس الصفحات بعد الدخول: الهوية، التنقل، والحساب */
export function AppHeader({
  home,
  nav,
  displayName,
  role,
}: {
  home: string;
  nav: NavItem[];
  displayName: string;
  role: AppRole;
}) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3">
        <Brand>
          <Link href={home} className="font-display text-2xl font-bold text-board">
            مِرقاة
          </Link>
        </Brand>

        {nav.length > 0 && (
          <nav aria-label="التنقل الرئيسي" className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted transition-colors duration-200 hover:bg-paper hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}

        <details className="relative ms-auto">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-200 hover:bg-paper [&::-webkit-details-marker]:hidden">
            <span className="text-sm font-medium">{displayName}</span>
            <span className="rounded bg-brass-soft px-1.5 py-0.5 text-xs text-brass">{ROLE_LABEL[role]}</span>
          </summary>
          <div className="absolute end-0 z-10 mt-1 w-48 origin-top animate-menu rounded-md border border-line bg-surface p-1 shadow-lg">
            <Link href="/change-password" className="block rounded px-3 py-2 text-sm transition-colors hover:bg-paper">
              تغيير كلمة المرور
            </Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="block w-full rounded px-3 py-2 text-start text-sm text-danger transition-colors hover:bg-danger-soft">
                خروج
              </button>
            </form>
          </div>
        </details>
      </div>
    </header>
  );
}
