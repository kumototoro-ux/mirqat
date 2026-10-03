import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { ROLE_LABEL, STATUS_LABEL, isRole, type AccountStatus, type AppRole } from '@/lib/auth/roles';
import { CreateAccountForm } from './create-account-form';
import { RowActions } from './row-actions';
import { LegacyAccounts, type LegacyPreview } from './legacy-accounts';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadLegacy, planLegacy } from '@/lib/accounts/core';

export const metadata: Metadata = { title: 'الحسابات' };
// إنشاء الحسابات القديمة دفعة واحدة قد يأخذ عشرات الثواني
export const maxDuration = 120;

async function legacyPreview(): Promise<LegacyPreview> {
  try {
    const plans = (await loadLegacy(createAdminClient())).map(planLegacy);
    return {
      pending: plans.filter((p) => p.ok).length,
      problems: plans.flatMap((p) =>
        !p.ok && p.problem !== 'أُنشئ له حساب من قبل' ? [{ code: p.row.code, username: p.row.username, problem: p.problem }] : [],
      ),
    };
  } catch {
    return { pending: 0, problems: [] };
  }
}

const PAGE_SIZE = 100;

type AccountRow = {
  id: string;
  username: string;
  role: AppRole;
  status: AccountStatus;
  must_change_password: boolean;
  last_login_at: string | null;
  employee: { code: string; name_ar: string } | null;
  student: { code: string; name_ar: string } | null;
};

const dateFmt = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Riyadh',
});

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string }>;
}) {
  const me = await requireUser(['admin']);
  const params = await searchParams;
  // يُحذف ما يكسر صيغة فلاتر PostgREST
  const q = (params.q ?? '').replace(/[,()*%\\"]/g, ' ').trim().slice(0, 60);
  const role = isRole(params.role) ? params.role : null;

  const supabase = await createClient();
  let query = supabase
    .from('profiles')
    .select(
      'id, username, role, status, must_change_password, last_login_at,' +
        ' employee:employees(code, name_ar), student:students(code, name_ar)',
      { count: 'exact' },
    )
    .order('role')
    .order('username')
    .limit(PAGE_SIZE);
  if (role) query = query.eq('role', role);

  if (q) {
    // البحث بالاسم أو الرمز يمر بجدولي الموظفين والطلاب أولًا
    const pattern = `%${q}%`;
    const [emp, stu] = await Promise.all([
      supabase.from('employees').select('id').or(`name_ar.ilike.${pattern},code.ilike.${pattern}`).limit(200),
      supabase.from('students').select('id').or(`name_ar.ilike.${pattern},code.ilike.${pattern}`).limit(200),
    ]);
    const filters = [`username.ilike.${pattern}`];
    const empIds = (emp.data ?? []).map((r) => r.id);
    const stuIds = (stu.data ?? []).map((r) => r.id);
    if (empIds.length) filters.push(`employee_id.in.(${empIds.join(',')})`);
    if (stuIds.length) filters.push(`student_id.in.(${stuIds.join(',')})`);
    query = query.or(filters.join(','));
  }

  const [{ data, count, error }, legacy] = await Promise.all([query.returns<AccountRow[]>(), legacyPreview()]);
  const rows = data ?? [];

  return (
    <>
      <h1 className="text-[1.75rem] font-bold leading-tight">الحسابات</h1>
      <p className="mt-1 text-muted">
        حسابات الدخول للموظفين والطلاب. كلمة المرور المؤقتة تظهر مرة واحدة عند الإنشاء أو الإصدار الجديد.
      </p>

      <LegacyAccounts preview={legacy} />

      <section aria-labelledby="new-account" className="mt-8 rounded-lg border border-line bg-surface p-5">
        <h2 id="new-account" className="mb-4 text-lg font-semibold">حساب جديد لسجل موجود</h2>
        <CreateAccountForm />
      </section>

      <section aria-labelledby="list" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="list" className="text-lg font-semibold">
            كل الحسابات <span className="text-sm font-normal text-muted">({(count ?? 0).toLocaleString('ar-SA')})</span>
          </h2>
          <form className="flex flex-wrap gap-2" role="search">
            <label htmlFor="q" className="sr-only">بحث</label>
            <input id="q" name="q" defaultValue={q} placeholder="اسم، رمز، أو اسم مستخدم" className="field w-64 py-2" />
            <label htmlFor="role-filter" className="sr-only">الدور</label>
            <select id="role-filter" name="role" defaultValue={role ?? ''} className="field w-32 py-2">
              <option value="">كل الأدوار</option>
              <option value="admin">إداري</option>
              <option value="teacher">معلم</option>
              <option value="student">طالب</option>
            </select>
            <button type="submit" className="btn-quiet py-2">عرض</button>
          </form>
        </div>

        {error && <p role="alert" className="mt-4 text-danger">تعذّر تحميل الحسابات: {error.message}</p>}

        <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-line bg-paper text-start text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-start font-medium">الاسم</th>
                <th scope="col" className="px-4 py-2.5 text-start font-medium">اسم المستخدم</th>
                <th scope="col" className="px-4 py-2.5 text-start font-medium">الدور</th>
                <th scope="col" className="px-4 py-2.5 text-start font-medium">الحالة</th>
                <th scope="col" className="px-4 py-2.5 text-start font-medium">آخر دخول</th>
                <th scope="col" className="px-4 py-2.5"><span className="sr-only">إجراءات</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const owner = r.employee ?? r.student;
                return (
                  <tr key={r.id} className="align-top transition-colors duration-200 hover:bg-paper/60">
                    <td className="px-4 py-3">
                      <div className="font-medium">{owner?.name_ar ?? '—'}</div>
                      <div className="text-xs text-muted"><bdi>{owner?.code}</bdi></div>
                    </td>
                    <td className="px-4 py-3"><bdi>{r.username}</bdi></td>
                    <td className="px-4 py-3">{ROLE_LABEL[r.role]}</td>
                    <td className="px-4 py-3">
                      <span className={r.status === 'active' ? 'text-ok' : 'text-danger'}>{STATUS_LABEL[r.status]}</span>
                      {r.must_change_password && r.status === 'active' && (
                        <div className="text-xs text-brass">بكلمة مؤقتة</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {r.last_login_at ? dateFmt.format(new Date(r.last_login_at)) : 'لم يدخل بعد'}
                    </td>
                    <td className="px-4 py-3">
                      <RowActions
                        userId={r.id}
                        username={r.username}
                        displayName={owner?.name_ar ?? r.username}
                        status={r.status}
                        isSelf={r.id === me.id}
                      />
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">
                    {q || role ? 'لا حسابات تطابق البحث.' : 'لا حسابات بعد. أنشئ أول حساب من النموذج أعلاه.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {(count ?? 0) > rows.length && (
          <p className="mt-3 text-sm text-muted">
            يظهر أول {PAGE_SIZE.toLocaleString('ar-SA')} حساب. ضيّق البحث للوصول إلى غيرها.
          </p>
        )}
      </section>
    </>
  );
}
