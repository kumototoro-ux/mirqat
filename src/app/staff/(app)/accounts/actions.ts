'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireUser } from '@/lib/auth/session';
import { createAccount, provisionLegacy, resetPassword, setStatus } from '@/lib/accounts/core';
import { isRole } from '@/lib/auth/roles';

export type IssuedPassword = { username: string; displayName: string; password: string };
export type AccountActionState = { error: string | null; issued: IssuedPassword | null };

function friendly(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (message.includes('profiles_employee_id_key')) return 'لهذا الموظف حساب من قبل';
  if (message.includes('profiles_student_id_key')) return 'لهذا الطالب حساب من قبل';
  if (message.includes('profiles_owner_chk')) return 'الدور لا يناسب نوع السجل';
  return message;
}

/** إنشاء حساب لسجل موجود (موظف أو طالب) بكلمة مؤقتة تُعرض مرة واحدة */
export async function createAccountAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  await requireUser(['admin']);
  const kind = formData.get('kind') === 'student' ? 'student' : 'employee';
  const code = String(formData.get('code') ?? '').trim();
  const username = String(formData.get('username') ?? '').trim();
  const role = kind === 'student' ? 'student' : String(formData.get('role') ?? '');

  if (!code || !username) return { error: 'أدخل الرمز واسم المستخدم', issued: null };
  if (/\s/.test(username)) return { error: 'اسم المستخدم لا يقبل المسافات', issued: null };
  if (!isRole(role)) return { error: 'اختر الدور', issued: null };

  const admin = createAdminClient();
  const table = kind === 'student' ? 'students' : 'employees';
  const { data: record, error } = await admin.from(table).select('id, name_ar').eq('code', code).maybeSingle();
  if (error) return { error: error.message, issued: null };
  if (!record) return { error: `لا يوجد ${kind === 'student' ? 'طالب' : 'موظف'} بالرمز ${code}`, issued: null };

  try {
    const made = await createAccount(admin, {
      username,
      role,
      employeeId: kind === 'employee' ? record.id : null,
      studentId: kind === 'student' ? record.id : null,
    });
    revalidatePath('/staff/accounts');
    return { error: null, issued: { username: made.username, displayName: record.name_ar, password: made.password } };
  } catch (e) {
    return { error: friendly(e), issued: null };
  }
}

/** كلمة مؤقتة جديدة — تُعرض مرة واحدة، ويُلزم صاحبها بتغييرها عند دخوله التالي */
export async function resetPasswordAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  await requireUser(['admin']);
  const userId = String(formData.get('userId') ?? '');
  const username = String(formData.get('username') ?? '');
  const displayName = String(formData.get('displayName') ?? '');
  try {
    const password = await resetPassword(createAdminClient(), userId);
    revalidatePath('/staff/accounts');
    return { error: null, issued: { username, displayName, password } };
  } catch (e) {
    return { error: friendly(e), issued: null };
  }
}

export type StatusActionState = { error: string | null };

/** الإيقاف يسري فورًا: RLS تتجاهل الحساب الموقوف، وAuth يمنع دخوله وتجديد جلسته */
export async function setStatusAction(_prev: StatusActionState, formData: FormData): Promise<StatusActionState> {
  const me = await requireUser(['admin']);
  const userId = String(formData.get('userId') ?? '');
  const status = formData.get('status') === 'disabled' ? 'disabled' : 'active';
  if (userId === me.id) return { error: 'لا يمكنك إيقاف حسابك بنفسك' };
  try {
    await setStatus(createAdminClient(), userId, status);
    revalidatePath('/staff/accounts');
    return { error: null };
  } catch (e) {
    return { error: friendly(e) };
  }
}

export type LegacyIssued = { code: string; name: string | null; username: string; password: string; role: string; status: string };
export type LegacyActionState = {
  error: string | null;
  created: LegacyIssued[];
  failed: { code: string; username: string; problem: string }[];
};

/**
 * إنشاء كل الحسابات القديمة المتبقية (Users + Students_Users) دفعة واحدة.
 * آمن للتكرار: ما أُنشئ له حساب لا يُنشأ مرة ثانية.
 * كلمات المرور تُعاد هنا لتُعرض للإداري مرة واحدة — لا تُحفظ في أي مكان.
 */
export async function provisionLegacyAction(): Promise<LegacyActionState> {
  await requireUser(['admin']);
  try {
    const results = await provisionLegacy(createAdminClient());
    revalidatePath('/staff/accounts');
    const ROLE = { admin: 'إداري', teacher: 'معلم', student: 'طالب' } as const;
    return {
      error: null,
      created: results.flatMap((r) =>
        r.ok
          ? [{ code: r.code, name: r.name, username: r.username, password: r.password, role: ROLE[r.role], status: r.status === 'active' ? 'نشط' : 'موقوف' }]
          : [],
      ),
      failed: results.flatMap((r) => (r.ok ? [] : [{ code: r.code, username: r.username, problem: friendly(r.problem) }])),
    };
  } catch (e) {
    return { error: friendly(e), created: [], failed: [] };
  }
}
