import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { homeFor, type AccountStatus, type AppRole } from '@/lib/auth/roles';

export type CurrentUser = {
  id: string;
  username: string;
  role: AppRole;
  status: AccountStatus;
  mustChangePassword: boolean;
  displayName: string;
  code: string | null;
  employeeId: number | null;
  studentId: number | null;
};

type ProfileRow = {
  id: string;
  username: string;
  role: AppRole;
  status: AccountStatus;
  must_change_password: boolean;
  employee_id: number | null;
  student_id: number | null;
  employee: { code: string; name_ar: string } | null;
  student: { code: string; name_ar: string } | null;
};

/**
 * الحساب الحالي من القاعدة (لا من الجلسة وحدها): الدور والحالة والتغيير الإلزامي
 * تُقرأ من profiles تحت RLS، فإيقاف الحساب أو تغيير دوره يسري فورًا.
 * cache: استعلام واحد لكل طلب مهما استُدعيت.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const uid = auth?.claims?.sub;
  if (!uid) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, username, role, status, must_change_password, employee_id, student_id,' +
        ' employee:employees(code, name_ar), student:students(code, name_ar)',
    )
    .eq('id', uid)
    .maybeSingle<ProfileRow>();
  if (error || !data) return null;

  const owner = data.employee ?? data.student;
  return {
    id: data.id,
    username: data.username,
    role: data.role,
    status: data.status,
    mustChangePassword: data.must_change_password,
    displayName: owner?.name_ar ?? data.username,
    code: owner?.code ?? null,
    employeeId: data.employee_id,
    studentId: data.student_id,
  };
});

/** حارس الصفحات: يعيد الحساب أو يوجّه لمكانه الصحيح */
export async function requireUser(roles: readonly AppRole[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  const portal = roles.includes('student') ? 'student' : 'staff';
  if (!user) redirect(`/auth/signout?reason=session&portal=${portal}`);
  if (user.status !== 'active') redirect('/auth/signout?reason=disabled');
  if (user.mustChangePassword) redirect('/change-password');
  if (!roles.includes(user.role)) redirect(homeFor(user.role));
  return user;
}
