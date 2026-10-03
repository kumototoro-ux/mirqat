import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Badge, Empty, ErrorNote, FilterBar, PageHeader, SearchInput, Select, Table, Td } from '@/components/ui';
import { CLASS_SELECT, classLabel, fmtNum, type ClassRef } from '@/lib/format';
import { classOptions } from '@/lib/data';

export const metadata: Metadata = { title: 'الطلاب' };

type Row = {
  id: number;
  code: string;
  name_ar: string;
  name_en: string | null;
  nationality: string | null;
  gender: string | null;
  fee_status: string | null;
  status: string;
  class: ClassRef;
  profile: { username: string; status: string; must_change_password: boolean; last_login_at: string | null }[];
};

const STATUS: Record<string, { label: string; tone: 'ok' | 'danger' | 'neutral' | 'gold' }> = {
  active: { label: 'منتظم', tone: 'ok' },
  withdrawn: { label: 'منسحب', tone: 'danger' },
  graduated: { label: 'متخرج', tone: 'neutral' },
};

const feeTone = (f: string | null) => (f === 'سدد' || f === 'إعفاء' ? 'ok' : f === 'جزئي' ? 'gold' : f ? 'danger' : 'neutral');

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ class?: string; q?: string; status?: string }> }) {
  await requireUser(['admin']);
  const sp = await searchParams;
  const classId = Number(sp.class) || null;
  const status = sp.status ?? 'active';
  const q = (sp.q ?? '').replace(/[,()*%\\"]/g, ' ').trim().slice(0, 60);

  const supabase = await createClient();
  let query = supabase
    .from('students')
    .select(
      `id, code, name_ar, name_en, nationality, gender, fee_status, status, class:classes(${CLASS_SELECT}),
       profile:profiles(username, status, must_change_password, last_login_at)`,
      { count: 'exact' },
    )
    .order('name_ar')
    .limit(300);
  if (classId) query = query.eq('class_id', classId);
  if (status !== 'all') query = query.eq('status', status);
  if (q) query = query.or(`name_ar.ilike.%${q}%,code.ilike.%${q}%,national_id.ilike.%${q}%`);
  const [{ data, error, count }, classes] = await Promise.all([query.returns<Row[]>(), classOptions()]);
  const rows = data ?? [];

  return (
    <>
      <PageHeader
        title="الطلاب"
        lead={`${fmtNum(count ?? 0)} طالب`}
        actions={<span className="btn-quiet cursor-not-allowed opacity-60" title="قريبًا">+ تسجيل طالب</span>}
      />
      <FilterBar>
        <SearchInput value={q} placeholder="الاسم أو الرقم أو الهوية" />
        <Select name="class" label="الفصل" value={classId} options={classes} placeholder="كل الفصول" className="w-60" />
        <Select
          name="status"
          label="الحالة"
          value={status}
          options={[{ value: 'all', label: 'الكل' }, ...Object.entries(STATUS).map(([v, s]) => ({ value: v, label: s.label }))]}
          className="w-36"
        />
      </FilterBar>
      <ErrorNote error={error} />
      {rows.length === 0 ? (
        <Empty title="لا طلاب مطابقون" />
      ) : (
        <Table head={['الطالب', 'الفصل', 'الجنسية', 'الرسوم', 'الحالة', 'حساب الدخول']} minWidth={860}>
          {rows.map((r) => {
            const acc = r.profile?.[0];
            return (
              <tr key={r.id}>
                <Td>
                  <Link href={`/staff/students/${r.id}`} className="group flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-board/10 font-semibold text-board transition-colors group-hover:bg-board group-hover:text-chalk">
                      {r.name_ar.trim().charAt(0)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium group-hover:text-board">{r.name_ar}</span>
                      <span className="block text-xs text-muted"><bdi>{r.code}</bdi>{r.gender ? ` · ${r.gender}` : ''}</span>
                    </span>
                  </Link>
                </Td>
                <Td className="whitespace-nowrap">{classLabel(r.class, true)}</Td>
                <Td className="text-muted">{r.nationality ?? '—'}</Td>
                <Td>{r.fee_status ? <Badge tone={feeTone(r.fee_status)}>{r.fee_status}</Badge> : '—'}</Td>
                <Td><Badge tone={STATUS[r.status]?.tone ?? 'neutral'}>{STATUS[r.status]?.label ?? r.status}</Badge></Td>
                <Td>
                  {acc ? (
                    <span className="text-sm">
                      <bdi className="font-medium">{acc.username}</bdi>
                      <span className="block text-xs text-muted">
                        {acc.status !== 'active' ? 'موقوف' : acc.must_change_password ? 'لم يدخل بعد' : 'مفعّل'}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted">بلا حساب</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
