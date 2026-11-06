'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { getMyAccess } from '@/lib/access/server';
import { levelOf } from '@/lib/access/areas';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createAccount, resetPassword, setStatus } from '@/lib/accounts/core';
import { CLASS_SELECT, classLabel, type ClassRef } from '@/lib/format';
import { pageSize, type ActionResult, type PageParams, type PageResult } from '@/components/registry/types';

export type AccountKind = 'student' | 'employee';

export type AccountRow = {
  recordId: number;
  code: string;
  name: string;
  /** للطالب: الفصل، للموظف: النوع */
  meta: string;
  isAdmin: boolean;
  account: { id: string; username: string; status: 'active' | 'disabled'; temp: boolean; lastLogin: string | null } | null;
};

type Profile = { id: string; username: string; status: 'active' | 'disabled'; must_change_password: boolean; last_login_at: string | null };

const DENIED = 'هذه العملية للإدارة فقط أو لصاحب الصلاحية في فرعه';

/** الإداري، أو صاحب منصب بمستوى في مجال الحسابات (1 عرض، 2 إدارة). الفرع يفحصه can_manage_* في القاعدة */
async function needAccounts(kind: AccountKind, min: number) {
  const me = await requireUser(['admin', 'teacher']);
  if (me.role !== 'admin' && levelOf(await getMyAccess(), kind === 'student' ? 'student_accounts' : 'employee_accounts') < min) throw new Error(DENIED);
  return me;
}

/** فحص القاعدة قبل أي عملية بمفتاح الخدمة: هل هذا السجل/الحساب في نطاقي؟ */
async function canManage(target: { kind: AccountKind; recordId: number } | { userId: string }): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = 'userId' in target
    ? await supabase.rpc('can_manage_profile', { p_user: target.userId, p_min: 2 })
    : await supabase.rpc('can_manage_account', { p_kind: target.kind, p_id: target.recordId, p_min: 2 });
  return !error && data === true;
}

const clean = (q: string) => q.replace(/[,()*%\\"]/g, ' ').trim().slice(0, 60);
const PROFILE = 'id, username, status, must_change_password, last_login_at';

/** صفحة من حسابات الطلاب أو الموظفين (السجل + حسابه إن وُجد) — 15 صفًا */
export async function listAccounts(kind: AccountKind, p: PageParams): Promise<PageResult<AccountRow>> {
  await needAccounts(kind, 1);
  const supabase = await createClient();
  const page = Math.max(1, Math.floor(p.page) || 1);
  const f = p.filters ?? {};
  // تصفية على بيانات الحساب تتطلب ربطًا داخليًا (inner) ليُستبعد من لا حساب له
  const inner = f.account === 'has' || f.account === 'temp' || f.account === 'disabled' || p.sort.startsWith('login');
  const embed = `profiles${inner ? '!inner' : ''}(${PROFILE})`;
  const table = kind === 'student' ? 'students' : 'employees';
  const fields = kind === 'student' ? `id, code, name_ar, class:classes(${CLASS_SELECT})` : 'id, code, name_ar, user_type';

  let q = supabase.from(table).select(`${fields}, ${embed}`, { count: 'exact' });
  if (kind === 'student') q = q.eq('status', 'active');
  else q = q.eq('is_active', true);

  const term = clean(p.q ?? '');
  if (term) q = q.or(`name_ar.ilike.%${term}%,code.ilike.%${term}%`);
  if (f.account === 'none') q = q.is('profiles', null);
  if (f.account === 'temp') q = q.eq('profiles.must_change_password', true).eq('profiles.status', 'active');
  if (f.account === 'disabled') q = q.eq('profiles.status', 'disabled');
  if (kind === 'student' && f.class) q = q.eq('class_id', Number(f.class));
  if (kind === 'employee' && f.type) q = q.eq('user_type', f.type);

  const sort = p.sort || 'name';
  if (sort.startsWith('login')) q = q.order('last_login_at', { referencedTable: 'profiles', ascending: sort.endsWith('_desc'), nullsFirst: false });
  else if (sort.startsWith('code')) q = q.order('code', { ascending: !sort.endsWith('_desc') });
  else q = q.order('name_ar', { ascending: !sort.endsWith('_desc') });
  q = q.order('id').range((page - 1) * pageSize(p), page * pageSize(p) - 1);

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as {
    id: number; code: string; name_ar: string; user_type?: string; class?: ClassRef; profiles: Profile[] | Profile | null;
  }[];
  return {
    total: count ?? 0,
    rows: rows.map((r) => {
      const pr = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      return {
        recordId: r.id,
        code: r.code,
        name: r.name_ar,
        meta: kind === 'student' ? classLabel(r.class ?? null, true) : r.user_type === 'admin' ? 'إداري' : 'معلم',
        isAdmin: r.user_type === 'admin',
        account: pr
          ? { id: pr.id, username: pr.username, status: pr.status, temp: pr.must_change_password, lastLogin: pr.last_login_at }
          : null,
      };
    }),
  };
}

export async function listStudentAccounts(p: PageParams) {
  return listAccounts('student', p);
}
export async function listEmployeeAccounts(p: PageParams) {
  return listAccounts('employee', p);
}

function paths(kind: AccountKind) {
  revalidatePath(kind === 'student' ? '/staff/student-accounts' : '/staff/employee-accounts');
}

/** إنشاء حساب لسجل واحد: اسم المستخدم الافتراضي = رقمه (كالنظام القديم) */
export async function createAccountFor(kind: AccountKind, recordId: number, username: string, customPassword?: string): Promise<ActionResult> {
  const me = await needAccounts(kind, 2);
  if (me.role !== 'admin' && !(await canManage({ kind, recordId }))) return { ok: false, error: DENIED };
  const name = username.trim();
  if (!name) return { ok: false, error: 'اسم المستخدم مطلوب' };
  if (/\s/.test(name)) return { ok: false, error: 'اسم المستخدم لا يقبل المسافات' };
  const admin = createAdminClient();
  let role: 'student' | 'teacher' | 'admin' = 'student';
  if (kind === 'employee') {
    const { data } = await admin.from('employees').select('user_type').eq('id', recordId).maybeSingle();
    if (!data) return { ok: false, error: 'الموظف غير موجود' };
    role = data.user_type === 'admin' ? 'admin' : 'teacher';
  }
  try {
    const made = await createAccount(admin, {
      username: name,
      role,
      studentId: kind === 'student' ? recordId : null,
      employeeId: kind === 'employee' ? recordId : null,
    }, customPassword || undefined);
    paths(kind);
    return { ok: true, message: `أُنشئ الحساب ${made.username}`, password: made.password, code: made.username };
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('مستخدم من قبل')) return { ok: false, error: `اسم المستخدم "${name}" مستخدم من قبل، اختر غيره` };
    if (msg.includes('_id_key')) return { ok: false, error: 'لهذا السجل حساب من قبل' };
    if (msg.startsWith('كلمة المرور')) return { ok: false, error: msg };
    return { ok: false, error: msg };
  }
}

export type BulkResult = { ok: true; created: { code: string; name: string; username: string; password: string }[]; failed: { code: string; problem: string }[] } | { ok: false; error: string };

/** إنشاء حسابات لكل من بلا حساب (حتى 150 في المرة) — اسم المستخدم = الرقم */
export async function createMissingAccounts(kind: AccountKind): Promise<BulkResult> {
  await requireUser(['admin']);   // دفعة واحدة على الجميع: للإداري وحده
  const admin = createAdminClient();
  const table = kind === 'student' ? 'students' : 'employees';
  let q = admin.from(table).select(`id, code, name_ar${kind === 'employee' ? ', user_type' : ''}, profiles(id)`).is('profiles', null).limit(150);
  q = kind === 'student' ? q.eq('status', 'active') : q.eq('is_active', true);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  const created: { code: string; name: string; username: string; password: string }[] = [];
  const failed: { code: string; problem: string }[] = [];
  for (const r of (data ?? []) as unknown as { id: number; code: string; name_ar: string; user_type?: string }[]) {
    try {
      const made = await createAccount(admin, {
        username: r.code,
        role: kind === 'student' ? 'student' : r.user_type === 'admin' ? 'admin' : 'teacher',
        studentId: kind === 'student' ? r.id : null,
        employeeId: kind === 'employee' ? r.id : null,
      });
      created.push({ code: r.code, name: r.name_ar, username: made.username, password: made.password });
    } catch (e) {
      failed.push({ code: r.code, problem: (e as Error).message });
    }
  }
  paths(kind);
  return { ok: true, created, failed };
}

export async function resetAccountPassword(kind: AccountKind, userId: string, customPassword?: string): Promise<ActionResult> {
  const me = await needAccounts(kind, 2);
  if (me.role !== 'admin' && !(await canManage({ userId }))) return { ok: false, error: DENIED };
  try {
    const password = await resetPassword(createAdminClient(), userId, customPassword || undefined);
    paths(kind);
    return { ok: true, message: customPassword ? 'عُيّنت كلمة المرور' : 'صدرت كلمة مؤقتة جديدة', password };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function setAccountStatus(kind: AccountKind, userId: string, status: 'active' | 'disabled'): Promise<ActionResult> {
  const me = await needAccounts(kind, 2);
  if (userId === me.id) return { ok: false, error: 'لا يمكنك إيقاف حسابك بنفسك' };
  if (me.role !== 'admin' && !(await canManage({ userId }))) return { ok: false, error: DENIED };
  try {
    await setStatus(createAdminClient(), userId, status);
    paths(kind);
    return { ok: true, message: status === 'active' ? 'تم تفعيل الحساب' : 'تم إيقاف الحساب' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** إيقاف أو تفعيل عدة حسابات دفعة واحدة (حسابك أنت يُستثنى) */
export async function setAccountsStatus(kind: AccountKind, userIds: string[], status: 'active' | 'disabled'): Promise<ActionResult> {
  const me = await needAccounts(kind, 2);
  const ids = userIds.filter((id) => id !== me.id).slice(0, 100);
  if (!ids.length) return { ok: false, error: 'لا حسابات صالحة في التحديد' };
  // غير الإداري: كل حساب في نطاقه ورتبته (can_manage_profile)، وإلا يُرفض التحديد كله
  if (me.role !== 'admin') {
    for (const id of ids) if (!(await canManage({ userId: id }))) return { ok: false, error: DENIED };
  }
  const admin = createAdminClient();
  let done = 0;
  for (const id of ids) {
    try {
      await setStatus(admin, id, status);
      done++;
    } catch (e) {
      console.error('bulk status', id, e);
    }
  }
  paths(kind);
  return { ok: true, message: `${status === 'active' ? 'تم تفعيل' : 'تم إيقاف'} ${done} حساب` };
}
