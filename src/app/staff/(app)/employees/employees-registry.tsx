'use client';

import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Registry, RowButton, StatCards, type RegistryHandle } from '@/components/registry/registry';
import type { PageParams, PageResult } from '@/components/registry/types';
import { Badge } from '@/components/ui';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import type { Lookups } from '@/lib/lookups';
import { deleteEmployee, getEmployee, listEmployees, type EmployeeForm, type EmployeeRow } from './actions';
import { EmployeeFormSheet } from './employee-form';

export function EmployeesRegistry({
  initial,
  initialParams,
  stats,
  lookups,
}: {
  initial: PageResult<EmployeeRow>;
  initialParams: PageParams;
  stats: { active: number; teachers: number; admins: number };
  lookups: Lookups;
}) {
  const registry = useRef<RegistryHandle>(null);
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState<EmployeeForm | 'new' | null>(null);
  const [opening, setOpening] = useState<number | null>(null);

  const open = useCallback(
    async (id: number) => {
      setOpening(id);
      const e = await getEmployee(id);
      setOpening(null);
      if (!e) return toast('لم يُعثر على الموظف', 'error');
      setEditing(e);
    },
    [toast],
  );

  const remove = async (r: { id: number; name_ar: string; code: string; has_account?: boolean }) => {
    const ok = await confirm({
      title: 'حذف الموظف نهائيًا؟',
      body: (
        <>
          <b className="text-ink">{r.name_ar}</b> (<bdi>{r.code}</bdi>)
          <br />
          يُحذف سجله ونطاقه{r.has_account ? ' وحساب دخوله' : ''}. إن كانت له حصص أو مهام أو رصد فأوقفه بدل الحذف.
        </>
      ),
      confirmLabel: 'حذف نهائيًا',
      danger: true,
    });
    if (!ok) return;
    const res = await deleteEmployee(r.id);
    if (!res.ok) return toast(res.error, 'error');
    toast(res.message);
    setEditing(null);
    registry.current?.invalidate();
    router.refresh();
  };

  return (
    <>
      <StatCards
        items={[
          { label: 'الموظفون النشطون', value: stats.active, icon: 'employees' },
          { label: 'معلمون', value: stats.teachers, icon: 'tasks' },
          { label: 'إداريون', value: stats.admins, icon: 'settings', tone: 'gold' },
          { label: 'إجمالي السجلات', value: initial.total, icon: 'audit' },
        ]}
      />
      <Registry<EmployeeRow>
        ref={registry}
        title="قائمة الموظفين"
        fetchPage={listEmployees}
        initial={initial}
        initialParams={initialParams}
        rowKey={(r) => r.id}
        onRowClick={(r) => open(r.id)}
        searchPlaceholder="الاسم أو الرمز أو الهوية"
        emptyTitle="لا موظفون مطابقون"
        icon="employees"
        sorts={[
          { value: 'name', label: 'الاسم (أ ← ي)' },
          { value: 'newest', label: 'الأحدث تسجيلًا' },
          { value: 'code', label: 'رمز الموظف' },
        ]}
        filters={[
          { key: 'type', label: 'النوع', options: [{ value: 'teacher', label: 'معلم' }, { value: 'admin', label: 'إداري' }] },
          { key: 'active', label: 'الحالة', options: [{ value: '1', label: 'نشط' }, { value: '0', label: 'غير نشط' }] },
        ]}
        toolbar={
          <button type="button" onClick={() => setEditing('new')} className="btn-primary h-10">
            <Icon name="plus" className="size-4" />
            تسجيل موظف
          </button>
        }
        columns={[
          {
            key: 'name',
            label: 'الموظف',
            sort: 'name',
            render: (r) => (
              <div className="flex items-center gap-3">
                <Avatar r={r} loading={opening === r.id} />
                <div className="min-w-0">
                  <p className="max-w-56 truncate font-semibold">{r.name_ar}</p>
                  <p className="text-xs text-muted">{r.job_role ?? (r.user_type === 'admin' ? 'إداري' : 'معلم')}</p>
                </div>
              </div>
            ),
          },
          { key: 'code', label: 'الرمز', sort: 'code', render: (r) => <bdi className="font-medium tabular-nums text-muted">{r.code}</bdi> },
          { key: 'type', label: 'النوع', render: (r) => (r.user_type === 'admin' ? <Badge tone="gold">إداري</Badge> : <Badge tone="board">معلم</Badge>) },
          {
            key: 'branch',
            label: 'الفرع',
            render: (r) => <span className="text-sm">{r.user_type === 'admin' ? 'كل الفروع' : r.branches.join('، ') || <span className="text-danger">بلا نطاق</span>}</span>,
          },
          { key: 'subjects', label: 'المواد', render: (r) => <SubjectChips r={r} /> },
          { key: 'status', label: 'الحالة', render: (r) => (r.is_active ? <Badge tone="ok">نشط</Badge> : <Badge>غير نشط</Badge>) },
        ]}
        rowActions={(r) => (
          <>
            <RowButton icon="edit" label="تعديل" onClick={() => open(r.id)} />
            <RowButton icon="trash" label="حذف" tone="danger" onClick={() => remove(r)} />
          </>
        )}
        mobileCard={(r) => (
          <div className="flex items-center gap-3">
            <Avatar r={r} loading={opening === r.id} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{r.name_ar}</p>
              <p className="truncate text-xs text-muted"><bdi>{r.code}</bdi> · {r.user_type === 'admin' ? 'إداري' : r.branches.join('، ')}</p>
              <div className="mt-1.5"><SubjectChips r={r} /></div>
            </div>
          </div>
        )}
      />
      <p className="mt-4 text-center text-xs text-muted">
        حسابات دخول الموظفين تُدار من <Link href="/staff/employee-accounts" className="text-board hover:underline">حسابات الموظفين</Link>
      </p>
      <EmployeeFormSheet
        open={editing !== null}
        initial={editing === 'new' ? null : editing}
        lookups={lookups}
        onClose={() => setEditing(null)}
        onSaved={(m) => {
          toast(m);
          setEditing(null);
          registry.current?.invalidate();
          router.refresh();
        }}
        onDelete={editing && editing !== 'new' ? () => remove({ id: editing.id!, name_ar: editing.name_ar, code: editing.code ?? '' }) : undefined}
      />
    </>
  );
}

function SubjectChips({ r }: { r: EmployeeRow }) {
  if (r.user_type === 'admin') return <span className="text-xs text-muted">كل المواد</span>;
  if (!r.subjects.length) return <span className="text-xs text-danger">بلا مواد</span>;
  return (
    <div className="flex max-w-64 flex-wrap gap-1">
      {r.subjects.slice(0, 2).map((s) => <Badge key={s}>{s}</Badge>)}
      {r.subjects.length > 2 && <Badge tone="board">+{r.subjects.length - 2}</Badge>}
    </div>
  );
}

function Avatar({ r, loading }: { r: EmployeeRow; loading?: boolean }) {
  return (
    <span className={`grid size-10 shrink-0 place-items-center rounded-full font-bold ${r.user_type === 'admin' ? 'bg-gold/25 text-brass' : 'bg-board/10 text-board'}`}>
      {loading ? <span className="spinner" /> : r.name_ar.trim().charAt(0)}
    </span>
  );
}
