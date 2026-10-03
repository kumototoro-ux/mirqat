import { AppShell } from '@/components/shell/app-shell';
import { STAFF_NAV, navFor } from '@/components/shell/nav';
import { requireUser } from '@/lib/auth/session';
import { getSchoolName } from '@/lib/data';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(['admin', 'teacher']);
  const schoolName = await getSchoolName();
  return (
    <AppShell
      nav={navFor(STAFF_NAV, user.role)}
      home="/staff"
      user={{ displayName: user.displayName, role: user.role, code: user.code }}
      schoolName={schoolName}
    >
      {children}
    </AppShell>
  );
}
