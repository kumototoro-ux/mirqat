import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Badge, Empty, ErrorNote, FilterBar, PageHeader, SearchInput, Table, Td } from '@/components/ui';
import { fmtDateTime, fmtNum } from '@/lib/format';

export const metadata: Metadata = { title: 'الموظفون' };

type Row = {
  id: number;
  code: string;
  name_ar: string;
  user_type: string | null;
  job_role: string | null;
  is_active: boolean;
  scope: {
    branch: { name: string } | null;
    grade: { name: string; stage: { name: string } | null } | null;
    section: { name: string } | null;
    subject: { name: string } | null;
  }[];
  profile: { username: string; role: string; status: string; last_login_at: string | null }[];
};

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser(['admin']);
  const sp = await searchParams;
  const q = (sp.q ?? '').replace(/[,()*%\\"]/g, ' ').trim().slice(0, 60);
  const supabase = await createClient();
  let query = supabase
    .from('employees')
    .select(
      `id, code, name_ar, user_type, job_role, is_active,
       scope:staff_scope(branch:branches(name), grade:grades(name, stage:stages(name)), section:sections(name), subject:subjects(name)),
       profile:profiles(username, role, status, last_login_at)`,
      { count: 'exact' },
    )
    .order('name_ar');
  if (q) query = query.or(`name_ar.ilike.%${q}%,code.ilike.%${q}%`);
  const { data, error, count } = await query.returns<Row[]>();
  const rows = data ?? [];
  const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter(Boolean) as string[])];

  return (
    <>
      <PageHeader
        title="الموظفون"
        lead={`${fmtNum(count ?? 0)} موظف`}
        actions={<span className="btn-quiet cursor-not-allowed opacity-60" title="قريبًا">+ تسجيل موظف</span>}
      />
      <FilterBar>
        <SearchInput value={q} placeholder="الاسم أو الرمز" />
      </FilterBar>
      <ErrorNote error={error} />
      {rows.length === 0 ? (
        <Empty title="لا موظفون مطابقون" />
      ) : (
        <Table head={['الموظف', 'النوع', 'الفروع والصفوف', 'المواد', 'الحساب', 'آخر دخول']} minWidth={960}>
          {rows.map((r) => {
            const acc = r.profile?.[0];
            const admin = acc?.role === 'admin' || r.user_type === 'admin';
            const places = uniq([
              ...r.scope.map((s) => s.branch?.name),
              ...r.scope.map((s) => (s.grade ? `${s.grade.name}${s.grade.stage ? ' ' + s.grade.stage.name : ''}` : undefined)),
              ...r.scope.map((s) => (s.section ? `شعبة ${s.section.name}` : undefined)),
            ]);
            const subjects = uniq(r.scope.map((s) => s.subject?.name));
            return (
              <tr key={r.id} className={r.is_active ? '' : 'opacity-60'}>
                <Td>
                  <div className="flex items-center gap-3">
                    <span className={`grid size-9 shrink-0 place-items-center rounded-full font-semibold ${admin ? 'bg-gold/25 text-brass' : 'bg-board/10 text-board'}`}>
                      {r.name_ar.trim().charAt(0)}
                    </span>
                    <span>
                      <span className="block font-medium">{r.name_ar}</span>
                      <span className="block text-xs text-muted"><bdi>{r.code}</bdi>{r.job_role ? ` · ${r.job_role}` : ''}</span>
                    </span>
                  </div>
                </Td>
                <Td>{admin ? <Badge tone="gold">إداري</Badge> : <Badge tone="board">معلم</Badge>}</Td>
                <Td>
                  <div className="flex max-w-72 flex-wrap gap-1">
                    {admin ? <span className="text-xs text-muted">كل الفروع</span> : places.length ? places.map((p) => <Badge key={p}>{p}</Badge>) : <span className="text-xs text-danger">بلا نطاق</span>}
                  </div>
                </Td>
                <Td>
                  <div className="flex max-w-56 flex-wrap gap-1">
                    {admin ? <span className="text-xs text-muted">كل المواد</span> : subjects.length ? subjects.map((p) => <Badge key={p} tone="board">{p}</Badge>) : <span className="text-xs text-danger">بلا مواد</span>}
                  </div>
                </Td>
                <Td>{acc ? <bdi className="text-sm">{acc.username}</bdi> : <span className="text-xs text-muted">بلا حساب</span>}</Td>
                <Td className="whitespace-nowrap text-xs text-muted">{acc?.last_login_at ? fmtDateTime(acc.last_login_at) : '—'}</Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
