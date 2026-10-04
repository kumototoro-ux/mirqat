import { AppShell } from '@/components/shell/app-shell';
import { STUDENT_NAV, navFor } from '@/components/shell/nav';
import { requireUser } from '@/lib/auth/session';
import { getSchoolName } from '@/lib/data';
import { shellContext } from '@/lib/week';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(['student']);
  const [schoolName, ctx] = await Promise.all([getSchoolName(), shellContext()]);
  return (
    <AppShell
      nav={navFor(STUDENT_NAV, user.role)}
      home="/student"
      user={{ displayName: user.displayName, role: user.role, code: user.code }}
      schoolName={schoolName}
      {...ctx}
    >
      {children}
    </AppShell>
  );
}
