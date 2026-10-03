'use server';

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { homeFor } from '@/lib/auth/roles';
import { MIN_PASSWORD_LENGTH } from '@/lib/accounts/core';
import { getCurrentUser } from '@/lib/auth/session';

export type ChangePasswordState = { error: string | null };

/**
 * تغيير كلمة المرور (إلزامي عند أول دخول، ومتاح بعده):
 *  1) Supabase Auth يحفظ الكلمة الجديدة مشفّرة (bcrypt)
 *  2) الخادم يرفع علامة التغيير الإلزامي من القاعدة (العميل لا يملك تعديل profiles)
 */
export async function changePassword(_prev: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `كلمة المرور ${MIN_PASSWORD_LENGTH} خانات على الأقل` };
  }
  if (password !== confirm) return { error: 'التأكيد لا يطابق كلمة المرور الجديدة' };
  if (/\s/.test(password)) return { error: 'كلمة المرور لا تقبل المسافات' };

  const user = await getCurrentUser();
  if (!user || user.status !== 'active') redirect('/auth/signout?reason=session');

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === 'same_password') return { error: 'اختر كلمة مختلفة عن الحالية' };
    if (error.code === 'weak_password') return { error: 'كلمة المرور ضعيفة. استخدم حروفًا وأرقامًا معًا' };
    console.error('updateUser', error);
    return { error: 'تعذّر حفظ كلمة المرور. حاول مجددًا' };
  }

  const { error: profileError } = await createAdminClient()
    .from('profiles')
    .update({ must_change_password: false, password_migrated_at: new Date().toISOString() })
    .eq('id', user.id);
  if (profileError) {
    console.error('change-password flag', profileError);
    return { error: 'حُفظت كلمة المرور، لكن تعذّر إكمال الإعداد. أعد المحاولة بنفس الكلمة' };
  }

  redirect(homeFor(user.role));
}
