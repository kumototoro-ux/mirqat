'use server';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { homeFor, readSessionMeta } from '@/lib/auth/roles';
import { cleanLoginInput, type Portal } from '@/lib/auth/portal';

export type LoginState = {
  error: string | null;
  username: string;
  /** عند النجاح: الصفحة التي ينتقل إليها بعد حركة النجاح (الجلسة كُتبت في الكوكيز) */
  redirectTo?: string;
  /** يتغير مع كل رد، ليعيد الواجهة حركة الخطأ حتى لو تكررت نفس الرسالة */
  nonce: number;
};

const WRONG = 'اسم المستخدم أو كلمة المرور غير صحيحة';
const DISABLED: Record<Portal, string> = {
  staff: 'الحساب غير مُفعّل، راجع الإدارة',
  student: 'الحساب غير مُفعّل، راجع إدارة المدرسة',
};

type GateRow = {
  locked: boolean;
  ip_locked: boolean;
  user_id: string | null;
  email: string | null;
  status: 'active' | 'disabled' | null;
};

const MAX_USERNAME = 64;
const MAX_PASSWORD = 128;

/** عنوان الجهاز الحقيقي: Vercel يضعه في x-vercel-forwarded-for ولا يقبله من المتصفح */
function clientIp(h: Headers): string | null {
  const raw = h.get('x-vercel-forwarded-for') ?? h.get('x-real-ip') ?? h.get('x-forwarded-for');
  return raw?.split(',')[0]?.trim() || null;
}

/**
 * الدخول باسم المستخدم — نفس سلوك النظام القديم:
 *  - مساران: بوابة الموظفين لا تقبل حساب طالب، والعكس (البوابة تُفرض في القاعدة)
 *  - 5 محاولات خاطئة = قفل 15 دقيقة، ورسالة موحّدة لا تكشف وجود الاسم
 *  - رموز اللصق الخفية (واتساب) تُنظَّف من الاسم، ومن كلمة مرور الطالب إن فشلت كما كُتبت
 * التحقق من كلمة المرور عبر Supabase Auth (bcrypt)، ويكتب كوكيز الجلسة.
 */
async function login(portal: Portal, formData: FormData): Promise<LoginState> {
  const nonce = Date.now();
  const username = cleanLoginInput(formData.get('username')).slice(0, MAX_USERNAME);
  const rawPassword = String(formData.get('password') ?? '');
  const fail = (error: string): LoginState => ({ error, username, nonce });
  if (!username || !rawPassword) return fail('أدخل اسم المستخدم وكلمة المرور');
  if (rawPassword.length > MAX_PASSWORD) return fail(WRONG);

  const admin = createAdminClient();
  const ip = clientIp(await headers());
  const record = (succeeded: boolean) =>
    admin.rpc('auth_record_login', { p_username: username, p_succeeded: succeeded, p_ip: ip });

  const { data: gateRows, error: gateError } = await admin.rpc('auth_login_gate', {
    p_username: username,
    p_portal: portal,
    p_ip: ip,
  });
  if (gateError) {
    console.error('auth_login_gate', gateError);
    return fail('تعذّر الاتصال بالخادم. حاول بعد قليل');
  }
  const gate = (gateRows as GateRow[] | null)?.[0];

  if (gate?.ip_locked) {
    return fail('محاولات خاطئة كثيرة من هذا الجهاز. تم إيقاف الدخول منه مؤقتًا، حاول بعد 15 دقيقة');
  }
  if (gate?.locked) {
    return fail('تم إيقاف محاولات الدخول مؤقتًا لهذا الحساب بسبب محاولات فاشلة متكررة، حاول بعد 15 دقيقة');
  }
  if (!gate?.user_id || !gate.email) {
    await record(false);
    return fail(WRONG);
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
    if (error?.code === 'user_banned') return fail(DISABLED[portal]);
    if (error && error.code !== 'invalid_credentials') console.error('signIn', error.code, error.message);
    return fail(WRONG);
  }

  if (gate.status !== 'active') {
    await supabase.auth.signOut();
    return fail(DISABLED[portal]);
  }

  // دفاع إضافي: دور الجلسة يجب أن يطابق البوابة (القاعدة تفرض ذلك قبلها في البوابة)
  const meta = readSessionMeta(data.user.app_metadata);
  if (!meta.role || (meta.role === 'student') !== (portal === 'student')) {
    await supabase.auth.signOut();
    await record(false);
    return fail(meta.role ? WRONG : 'الحساب غير مكتمل الإعداد. راجع إدارة المدرسة');
  }

  await record(true);
  // الواجهة تعرض حركة النجاح ثم تنتقل. التغيير الإلزامي لكلمة المرور تفرضه الصفحة الرئيسية (requireUser)
  return { error: null, username, nonce, redirectTo: homeFor(meta.role) };
}

export async function loginStaff(_prev: LoginState, formData: FormData) {
  return login('staff', formData);
}

export async function loginStudent(_prev: LoginState, formData: FormData) {
  return login('student', formData);
}
