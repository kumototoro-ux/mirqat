import { redirect } from 'next/navigation';

/** دُمجت مفاتيح المعلمين في صفحة الأدوار والصلاحيات */
export default function PermissionsRedirect() {
  redirect('/staff/roles?tab=teachers');
}
