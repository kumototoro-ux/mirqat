import { redirect } from 'next/navigation';

/** دُمجت المناصب في صفحة الأدوار والصلاحيات */
export default function PositionsRedirect() {
  redirect('/staff/roles?tab=holders');
}
