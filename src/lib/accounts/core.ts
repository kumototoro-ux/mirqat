/**
 * إنشاء الحسابات — المنطق المشترك بين الموقع (Server Actions) وأداة سطر الأوامر
 * (scripts/provision-legacy.ts عبر tsx). لذلك:
 *  - لا يستورد أي ملف بمسار '@/...' ولا 'server-only' (تشغّله Node مباشرةً)
 *  - صياغة TypeScript قابلة للحذف فقط (لا enum ولا namespace)
 * يأخذ عميلًا بالمفتاح السري جاهزًا، ولا يقرأ المفاتيح بنفسه.
 */
import { randomInt, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export type Role = 'admin' | 'teacher' | 'student';
export type Status = 'active' | 'disabled';

export const MIN_PASSWORD_LENGTH = 8;

/** مدة الإيقاف في Supabase Auth (ما يقارب مئة عام) — "none" ترفعه */
const BAN_FOREVER = '876000h';

// بلا الأحرف المتشابهة (0/O، 1/l/I) لأن كلمة المرور تُملى أو تُطبع للطالب
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** كلمة مرور مؤقتة: 8 خانات فيها رقم واحد على الأقل، تُعرض للإداري مرة واحدة */
export function generatePassword(length = MIN_PASSWORD_LENGTH): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  if (!/[0-9]/.test(out)) out = out.slice(0, -1) + String(randomInt(2, 10));
  return out;
}

/**
 * بريد داخلي لحساب Supabase Auth — الدخول باسم المستخدم، والبريد لا يراه أحد.
 * عشوائي فلا يتغير بتغيير الاسم ولا يُخمَّن. النطاق .invalid محجوز فلا تصله رسالة أبدًا.
 */
export function internalEmail(domain = 'accounts.mirqat.invalid'): string {
  return `u-${randomUUID().replace(/-/g, '').slice(0, 20)}@${domain}`;
}

export type NewAccount = {
  username: string;
  role: Role;
  employeeId?: number | null;
  studentId?: number | null;
  status?: Status;
  legacyId?: number | null;
};

export type CreatedAccount = { userId: string; username: string; password: string };

/**
 * ينشئ حسابًا كاملًا أو لا شيء:
 *  1) مستخدم Supabase Auth (bcrypt) بدوره في app_metadata
 *  2) ربطه بسجله في profiles عبر admin_attach_profile (ذرية في القاعدة)
 *  إن فشلت (2) يُحذف مستخدم (1)، فلا يبقى حساب دخول بلا سجل.
 */
export async function createAccount(admin: SupabaseClient, input: NewAccount): Promise<CreatedAccount> {
  const username = input.username.trim();
  const status: Status = input.status ?? 'active';
  const password = generatePassword();

  const { data, error } = await admin.auth.admin.createUser({
    email: internalEmail(),
    password,
    email_confirm: true,
    app_metadata: { role: input.role }, // الدور للتوجيه السريع فقط؛ التغيير الإلزامي في profiles
    ...(status === 'disabled' ? { ban_duration: BAN_FOREVER } : {}),
  });
  if (error || !data.user) {
    throw new Error(`تعذّر إنشاء حساب ${username}: ${error?.message ?? 'بلا تفاصيل'}`);
  }

  const { error: attachError } = await admin.rpc('admin_attach_profile', {
    p_user_id: data.user.id,
    p_username: username,
    p_role: input.role,
    p_employee_id: input.employeeId ?? null,
    p_student_id: input.studentId ?? null,
    p_status: status,
    p_legacy_id: input.legacyId ?? null,
  });
  if (attachError) {
    const { error: undoError } = await admin.auth.admin.deleteUser(data.user.id);
    const undo = undoError ? ` — وتعذّر حذف حساب الدخول ${data.user.id}، احذفه يدويًا` : '';
    throw new Error(`تعذّر ربط حساب ${username}: ${attachError.message}${undo}`);
  }
  return { userId: data.user.id, username, password };
}

/** كلمة مرور جديدة يصدرها الإداري — تعود معها إلزامية التغيير عند الدخول التالي */
export async function resetPassword(admin: SupabaseClient, userId: string): Promise<string> {
  const password = generatePassword();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) throw new Error(`تعذّر تعيين كلمة المرور: ${error.message}`);
  const { error: dbError } = await admin.from('profiles').update({ must_change_password: true }).eq('id', userId);
  if (dbError) throw new Error(`تعيّنت كلمة المرور، لكن تعذّر تسجيل التغيير الإلزامي: ${dbError.message}`);
  return password;
}

/** الإيقاف والتفعيل: في القاعدة (يُقرأ مع كل صفحة) وفي Auth (يمنع الدخول وتجديد الجلسة) */
export async function setStatus(admin: SupabaseClient, userId: string, status: Status): Promise<void> {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: status === 'disabled' ? BAN_FOREVER : 'none',
  });
  if (error) throw new Error(`تعذّر تحديث حساب الدخول: ${error.message}`);
  const { error: dbError } = await admin.from('profiles').update({ status }).eq('id', userId);
  if (dbError) throw new Error(`تحدّث حساب الدخول، لكن تعذّر تحديث الحالة: ${dbError.message}`);
}

// ---------------------------------------------------------------------
// الحسابات القديمة (Users + Students_Users)
// ---------------------------------------------------------------------

export type LegacyRow = {
  id: number;
  kind: 'staff' | 'student';
  code: string;
  username: string;
  status_raw: string | null;
  user_type: string | null;
  role_raw: string | null;
  full_name: string | null;
  employee_id: number | null;
  student_id: number | null;
  auth_user_id: string | null;
};

export type LegacyPlan =
  | { ok: true; row: LegacyRow; account: NewAccount }
  | { ok: false; row: LegacyRow; problem: string };

// الحالات التي تعني "نشط" في الشيت القديم (الفارغ كان يُعامل نشطًا)
const ACTIVE_VALUES = new Set(['', 'active', 'نشط', 'فعال', 'فعّال', 'مفعل', 'مفعّل']);

/** يترجم صف الحساب القديم إلى حساب جديد، أو يذكر سبب عدم إمكان ذلك */
export function planLegacy(row: LegacyRow): LegacyPlan {
  if (row.auth_user_id) return { ok: false, row, problem: 'أُنشئ له حساب من قبل' };
  if (!row.username?.trim()) return { ok: false, row, problem: 'بلا اسم مستخدم' };
  const status: Status = ACTIVE_VALUES.has((row.status_raw ?? '').trim().toLowerCase()) ? 'active' : 'disabled';

  if (row.kind === 'student') {
    if (!row.student_id) return { ok: false, row, problem: `لا طالب بالرمز ${row.code}` };
    return { ok: true, row, account: { username: row.username, role: 'student', studentId: row.student_id, status, legacyId: row.id } };
  }
  if (!row.employee_id) return { ok: false, row, problem: `لا موظف بالرمز ${row.code}` };
  const role: Role = (row.user_type ?? '').trim().toLowerCase() === 'admin' ? 'admin' : 'teacher';
  return { ok: true, row, account: { username: row.username, role, employeeId: row.employee_id, status, legacyId: row.id } };
}

export async function loadLegacy(admin: SupabaseClient): Promise<LegacyRow[]> {
  const { data, error } = await admin.rpc('admin_legacy_accounts');
  if (error) throw new Error(`تعذّر قراءة الحسابات القديمة: ${error.message}`);
  return (data ?? []) as LegacyRow[];
}

export type ProvisionResult =
  | { ok: true; username: string; role: Role; status: Status; name: string | null; code: string; password: string }
  | { ok: false; username: string; code: string; name: string | null; problem: string };

/** ينشئ كل حساب قديم لم يُنشأ بعد. حساب يفشل لا يوقف البقية ويُذكر سببه */
export async function provisionLegacy(admin: SupabaseClient): Promise<ProvisionResult[]> {
  const out: ProvisionResult[] = [];
  for (const plan of (await loadLegacy(admin)).map(planLegacy)) {
    const { row } = plan;
    if (!plan.ok) {
      if (plan.problem !== 'أُنشئ له حساب من قبل') {
        out.push({ ok: false, username: row.username, code: row.code, name: row.full_name, problem: plan.problem });
      }
      continue;
    }
    try {
      const made = await createAccount(admin, plan.account);
      out.push({ ok: true, username: made.username, role: plan.account.role, status: plan.account.status ?? 'active',
                 name: row.full_name, code: row.code, password: made.password });
    } catch (e) {
      out.push({ ok: false, username: row.username, code: row.code, name: row.full_name, problem: (e as Error).message });
    }
  }
  return out;
}
