import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'الرئيسية' };

type ScopeRow = {
  branch: { name: string } | null;
  grade: { name: string; stage: { name: string } | null } | null;
  section: { name: string } | null;
  subject: { name: string } | null;
};

export default async function StaffHome() {
  const user = await requireUser(['admin', 'teacher']);
  const supabase = await createClient();

  return (
    <>
      <h1 className="text-[1.75rem] font-bold leading-tight">أهلًا {user.displayName}</h1>
      {user.role === 'admin' ? <AdminSummary supabase={supabase} /> : <TeacherScope supabase={supabase} employeeId={user.employeeId} />}
    </>
  );
}

type Client = Awaited<ReturnType<typeof createClient>>;

async function AdminSummary({ supabase }: { supabase: Client }) {
  const count = async (table: string, filter?: (q: any) => any) => {
    let q = supabase.from(table).select('*', { count: 'exact', head: true });
    if (filter) q = filter(q);
    const { count } = await q;
    return count ?? 0;
  };
  const [students, employees, accounts, pending] = await Promise.all([
    count('students', (q) => q.eq('status', 'active')),
    count('employees', (q) => q.eq('is_active', true)),
    count('profiles'),
    count('profiles', (q) => q.eq('must_change_password', true)),
  ]);

  const stats = [
    { value: students, label: 'طالب منتظم' },
    { value: employees, label: 'موظف نشط' },
    { value: accounts, label: 'حساب دخول' },
    { value: pending, label: 'حساب لم يغيّر كلمته المؤقتة' },
  ];

  return (
    <section className="mt-8">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-surface px-5 py-4">
            <dt className="text-sm text-muted">{s.label}</dt>
            <dd className="mt-1 text-[1.75rem] font-bold leading-tight tabular-nums text-board">{s.value.toLocaleString('ar-SA')}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6">
        <Link href="/staff/accounts" className="btn-quiet">إدارة الحسابات</Link>
      </p>
    </section>
  );
}

async function TeacherScope({ supabase, employeeId }: { supabase: Client; employeeId: number | null }) {
  const { data } = await supabase
    .from('staff_scope')
    .select('branch:branches(name), grade:grades(name, stage:stages(name)), section:sections(name), subject:subjects(name)')
    .eq('employee_id', employeeId ?? -1)
    .returns<ScopeRow[]>();
  const rows = data ?? [];

  const groups = [
    { label: 'الفروع', items: rows.flatMap((r) => (r.branch ? [r.branch.name] : [])) },
    {
      label: 'الصفوف',
      items: rows.flatMap((r) => (r.grade ? [`${r.grade.name}${r.grade.stage ? ' ' + r.grade.stage.name : ''}`] : [])),
    },
    { label: 'الشعب', items: rows.flatMap((r) => (r.section ? [r.section.name] : [])) },
    { label: 'المواد', items: rows.flatMap((r) => (r.subject ? [r.subject.name] : [])) },
  ];
  const empty = groups.some((g) => g.items.length === 0);

  return (
    <section className="mt-8 max-w-3xl">
      <h2 className="text-lg font-semibold">نطاق عملك</h2>
      <p className="mt-1 text-muted">ترى بيانات الطلاب والتقييمات داخل هذا النطاق فقط.</p>
      <dl className="mt-5 divide-y divide-line rounded-lg border border-line bg-surface">
        {groups.map((g) => (
          <div key={g.label} className="flex flex-wrap gap-x-6 gap-y-2 px-5 py-3.5">
            <dt className="w-16 shrink-0 text-sm text-muted">{g.label}</dt>
            <dd className="flex flex-wrap gap-1.5">
              {g.items.length ? (
                g.items.map((name) => (
                  <span key={name} className="rounded border border-line px-2 py-0.5 text-sm">{name}</span>
                ))
              ) : (
                <span className="text-sm text-danger">لا شيء</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {empty && (
        <p className="mt-4 rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          نطاقك ناقص، فلن تظهر لك بيانات طلاب. اطلب من الإدارة إكمال صلاحياتك.
        </p>
      )}
    </section>
  );
}
