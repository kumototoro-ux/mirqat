'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { homeFor, readSessionMeta } from '@/lib/auth/roles';
import { cleanLoginInput, type Portal } from '@/lib/auth/portal';

export type LoginState = { error: string | null; username: string };

const WRONG = 'اسم المستخدم أو كلمة المرور غير صحيحة';
const DISABLED: Record<Portal, string> = {
  staff: 'الحساب غير مُفعّل، راجع الإدارة',
  student: 'الحساب غير مُفعّل، راجع إدارة المدرسة',
};

type GateRow = { locked: boolean; user_id: string | null; email: string | null; status: 'active' | 'disabled' | null };

/**
 * الدخول باسم المستخدم — نفس سلوك النظام القديم:
 *  - مساران: بوابة الموظفين لا تقبل حساب طالب، والعكس (البوابة تُفرض في القاعدة)
 *  - 5 محاولات خاطئة = قفل 15 دقيقة، ورسالة موحّدة لا تكشف وجود الاسم
 *  - رموز اللصق الخفية (واتساب) تُنظَّف من الاسم، ومن كلمة مرور الطالب إن فشلت كما كُتبت
 * التحقق من كلمة المرور عبر Supabase Auth (bcrypt)، ويكتب كوكيز الجلسة.
 */
async function login(portal: Portal, formData: FormData): Promise<LoginState> {
  const username = cleanLoginInput(formData.get('username'));
  const rawPassword = String(formData.get('password') ?? '');
  if (!username || !rawPassword) return { error: 'أدخل اسم المستخدم وكلمة المرور', username };

  const admin = createAdminClient();
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const record = (succeeded: boolean) =>
    admin.rpc('auth_record_login', { p_username: username, p_succeeded: succeeded, p_ip: ip });

  const { data: gateRows, error: gateError } = await admin.rpc('auth_login_gate', {
    p_username: username,
    p_portal: portal,
  });
  if (gateError) {
    console.error('auth_login_gate', gateError);
    return { error: 'تعذّر الاتصال بالخادم. حاول بعد قليل', username };
  }
  const gate = (gateRows as GateRow[] | null)?.[0];

  if (gate?.locked) {
    return { error: 'تم إيقاف محاولات الدخول مؤقتًا لهذا الحساب بسبب محاولات فاشلة متكررة، حاول بعد 15 دقيقة', username };
  }
  if (!gate?.user_id || !gate.email) {
    await record(false);
    return { error: WRONG, username };
  }

  const supabase = await createClient();
  const candidates = [rawPassword];
  const cleaned = cleanLoginInput(rawPassword);
  if (portal === 'student' && cleaned && cleaned !== rawPassword) candidates.push(cleaned);

  let result = await supabase.auth.signInWithPassword({ email: gate.email, password: candidates[0] });
  if (result.error && result.error.code === 'invalid_credentials' && candidates[1]) {
    result = await supabase.auth.signInWithPassword({ email: gate.email, password: candidates[1] });
  }
  const { data, error } = result;

  if (error || !data.user) {
    await record(false);
    if (error?.code === 'user_banned') return { error: DISABLED[portal], username };
    if (error && error.code !== 'invalid_credentials') console.error('signIn', error.code, error.message);
    return { error: WRONG, username };
  }

  if (gate.status !== 'active') {
    await supabase.auth.signOut();
    return { error: DISABLED[portal], username };
  }

  const meta = readSessionMeta(data.user.app_metadata);
  if (!meta.role) {
    await supabase.auth.signOut();
    return { error: 'الحساب غير مكتمل الإعداد. راجع إدارة المدرسة', username };
  }

  await record(true);
  // التغيير الإلزامي لكلمة المرور تفرضه الصفحة الرئيسية (requireUser)
  redirect(homeFor(meta.role));
}

export async function loginStaff(_prev: LoginState, formData: FormData) {
  return login('staff', formData);
}

export async function loginStudent(_prev: LoginState, formData: FormData) {
  return login('student', formData);
}
