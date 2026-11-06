import { AppShell } from '@/components/shell/app-shell';
import { STAFF_NAV, navFor } from '@/components/shell/nav';
import { requireUser } from '@/lib/auth/session';
import { getSchoolName } from '@/lib/data';
import { shellContext } from '@/lib/week';
import { getMyPerms } from '@/lib/perms/server';
import { PermsProvider } from '@/components/perms/perms-context';
import { getMyAccess } from '@/lib/access/server';
import { AccessProvider } from '@/components/access/access-context';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(['admin', 'teacher']);
  const [schoolName, ctx, perms, access] = await Promise.all([getSchoolName(), shellContext(), getMyPerms(), getMyAccess()]);
  return (
    <AppShell
      nav={navFor(STAFF_NAV, user.role, access)}
      home="/staff"
      user={{ displayName: user.displayName, role: user.role, code: user.code }}
      schoolName={schoolName}
      {...ctx}
    >
      <PermsProvider perms={perms}><AccessProvider access={access}>{children}</AccessProvider></PermsProvider>
    </AppShell>
  );
}
