'use client';

import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BulkButton, Registry, RowButton, type RegistryHandle } from '@/components/registry/registry';
import { Insights } from '@/components/registry/insights';
import { downloadCsv } from '@/components/registry/csv';
import type { StudentsReport } from '@/lib/reports';
import type { PageParams, PageResult } from '@/components/registry/types';
import { Badge } from '@/components/ui';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import type { Lookups } from '@/lib/lookups';
import { deleteStudent, getStudent, listStudents, setStudentsStatus, type StudentForm, type StudentRow } from './actions';
import { StudentFormSheet } from './student-form';

const STATUS = {
  active: { label: 'منتظم', tone: 'ok' },
  withdrawn: { label: 'منسحب', tone: 'danger' },
  graduated: { label: 'متخرج', tone: 'neutral' },
} as const;
const feeTone = (f: string | null) => (f === 'سدد' || f === 'إعفاء' ? 'ok' : f === 'جزئي' ? 'gold' : f ? 'danger' : 'neutral');

export function StudentsRegistry({
  initial,
  initialParams,
  report,
  classes,
  lookups,
}: {
  initial: PageResult<StudentRow>;
  initialParams: PageParams;
  report: StudentsReport;
  classes: { value: string; label: string }[];
  lookups: Lookups;
}) {
  const registry = useRef<RegistryHandle>(null);
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState<StudentForm | 'new' | null>(null);
  const [opening, setOpening] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const t = report.totals;

  const bulkStatus = async (rows: StudentRow[], status: 'active' | 'withdrawn', clear: () => void) => {
    const ok = await confirm({
      title: status === 'withdrawn' ? `تغيير ${rows.length} طالب إلى "منسحب"؟` : `إعادة ${rows.length} طالب إلى "منتظم"؟`,
      body: 'تبقى سجلاتهم ودرجاتهم كما هي، ويُسجَّل التغيير في سجل النشاط.',
      confirmLabel: 'تأكيد',
      danger: status === 'withdrawn',
    });
    if (!ok) return;
    setBulkBusy(true);
    const res = await setStudentsStatus(rows.map((r) => r.id), status);
    setBulkBusy(false);
    if (!res.ok) return toast(res.error, 'error');
    toast(res.message);
    clear();
    registry.current?.invalidate();
    router.refresh();
  };

  const open = useCallback(
    async (id: number) => {
      setOpening(id);
      const s = await getStudent(id);
      setOpening(null);
      if (!s) return toast('لم يُعثر على الطالب', 'error');
      setEditing(s);
    },
    [toast],
  );

  const remove = async (r: StudentRow) => {
    const ok = await confirm({
      title: 'حذف الطالب نهائيًا؟',
      body: (
        <>
          <b className="text-ink">{r.name_ar}</b> (<bdi>{r.code}</bdi>)
          <br />
          {r.has_account ? 'سيُحذف حساب دخوله أيضًا. ' : ''}لا يمكن التراجع. إن كان للطالب درجات أو تحضير فغيّر حالته إلى "منسحب" بدل الحذف.
        </>
      ),
      confirmLabel: 'حذف نهائيًا',
      danger: true,
    });
    if (!ok) return;
    const res = await deleteStudent(r.id);
    if (!res.ok) return toast(res.error, 'error');
    toast(res.message);
    registry.current?.invalidate();
    router.refresh();
  };

  const saved = (message: string) => {
    toast(message);
    setEditing(null);
    registry.current?.invalidate();
    router.refresh();
  };

  return (
    <>
      <Insights
        stats={[
          { label: 'الطلاب المنتظمون', value: t.active, icon: 'students', hint: `من ${t.all} سجل` },
          { label: 'سُجّلوا هذا الشهر', value: t.new_this_month, icon: 'plus', delta: { now: t.new_this_month, before: t.new_last_month } },
          { label: 'انسحبوا هذا الشهر', value: t.withdrawn_this_month, icon: 'logout', delta: { now: t.withdrawn_this_month, before: t.withdrawn_last_month, upIsGood: false }, tone: t.withdrawn_this_month ? 'danger' : undefined },
          { label: 'منسحبون إجمالًا', value: t.withdrawn, icon: 'user', hint: t.graduated ? `${t.graduated} متخرج` : undefined },
        ]}
        donut={{
          title: 'توزيع الطلاب على الفروع',
          caption: 'الطلاب المنتظمون فقط',
          unit: 'طالب',
          items: report.by_branch.map((b) => ({ name: b.name, value: b.active })).filter((b) => b.value > 0).sort((a, b) => b.value - a.value),
        }}
      />

      <Registry<StudentRow>
        ref={registry}
        key={initialParams.q}
        queryKey="students"
        title="قائمة الطلاب"
        fetchPage={listStudents}
        initial={initial}
        initialParams={initialParams}
        rowKey={(r) => r.id}
        onRowClick={(r) => open(r.id)}
        searchPlaceholder="الاسم أو الرقم أو الهوية"
        emptyTitle="لا طلاب مطابقون"
        icon="students"
        sorts={[
          { value: 'name', label: 'الاسم (أ ← ي)' },
          { value: 'newest', label: 'الأحدث تسجيلًا' },
          { value: 'code', label: 'رقم الطالب' },
        ]}
        filters={[
          { key: 'class', label: 'الفصل', options: classes },
          { key: 'status', label: 'الحالة', options: Object.entries(STATUS).map(([v, s]) => ({ value: v, label: s.label })) },
          { key: 'fee', label: 'الرسوم', options: ['سدد', 'جزئي', 'إعفاء', 'لم يسدد'].map((v) => ({ value: v, label: v })) },
        ]}
        toolbar={
          <>
            <Link href="/staff/reports/students" className="btn h-11 rounded-xl border border-line bg-surface px-3.5 hover:border-board/40 hover:text-board">
              <Icon name="results" className="size-4" />
              التقرير
            </Link>
            <button type="button" onClick={() => setEditing('new')} className="btn-primary h-11 rounded-xl px-4">
              <Icon name="plus" className="size-4" />
              تسجيل طالب
            </button>
          </>
        }
        bulkActions={(rows, clear) => (
          <>
            <BulkButton onClick={() => downloadCsv('طلاب', ['الرقم', 'الاسم', 'الهوية', 'الفصل', 'الجنس', 'الجنسية', 'الرسوم', 'الحالة'], rows.map((r) => [r.code, r.name_ar, r.national_id, r.class_label, r.gender, r.nationality, r.fee_status, STATUS[r.status].label]))}>
              <Icon name="audit" className="size-4" /> تصدير
            </BulkButton>
            {rows.some((r) => r.status === 'active') && (
              <BulkButton tone="danger" busy={bulkBusy} onClick={() => bulkStatus(rows, 'withdrawn', clear)}>منسحب</BulkButton>
            )}
            {rows.some((r) => r.status !== 'active') && (
              <BulkButton busy={bulkBusy} onClick={() => bulkStatus(rows, 'active', clear)}>منتظم</BulkButton>
            )}
          </>
        )}
        columns={[
          {
            key: 'name',
            label: 'الطالب',
            sort: 'name',
            render: (r) => (
              <div className="flex items-center gap-3">
                <Avatar name={r.name_ar} loading={opening === r.id} />
                <div className="min-w-0">
                  <p className="max-w-64 truncate font-semibold">{r.name_ar}</p>
                  <p className="text-xs text-muted">{r.gender ?? '—'}{r.nationality ? ` · ${r.nationality}` : ''}</p>
                </div>
              </div>
            ),
          },
          { key: 'code', label: 'رقم الطالب', sort: 'code', render: (r) => <bdi className="font-medium tabular-nums text-muted">{r.code}</bdi> },
          { key: 'class', label: 'الفصل', render: (r) => <span className="text-sm">{r.class_label}</span> },
          { key: 'fee', label: 'الرسوم', render: (r) => (r.fee_status ? <Badge tone={feeTone(r.fee_status)}>{r.fee_status}</Badge> : <span className="text-muted">—</span>) },
          { key: 'status', label: 'الحالة', render: (r) => <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge> },
        ]}
        rowActions={(r) => (
          <>
            <RowButton icon="edit" label="تعديل" onClick={() => open(r.id)} />
            <RowButton icon="trash" label="حذف" tone="danger" onClick={() => remove(r)} />
          </>
        )}
        mobileCard={(r) => (
          <div className="flex items-center gap-3">
            <Avatar name={r.name_ar} loading={opening === r.id} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{r.name_ar}</p>
              <p className="truncate text-xs text-muted">
                <bdi>{r.code}</bdi> · {r.class_label}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                {r.fee_status && <Badge tone={feeTone(r.fee_status)}>{r.fee_status}</Badge>}
              </div>
            </div>
          </div>
        )}
      />

      <p className="mt-4 text-center text-xs text-muted">
        حسابات دخول الطلاب تُدار من{' '}
        <Link href="/staff/student-accounts" className="text-board hover:underline">حسابات الطلاب</Link>
      </p>

      <StudentFormSheet
        open={editing !== null}
        initial={editing === 'new' ? null : editing}
        lookups={lookups}
        onClose={() => setEditing(null)}
        onSaved={saved}
        onDelete={editing && editing !== 'new' ? () => remove({ id: editing.id!, code: editing.code ?? '', name_ar: editing.name_ar } as StudentRow) : undefined}
      />
    </>
  );
}

function Avatar({ name, loading }: { name: string; loading?: boolean }) {
  return (
    <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-board/10 font-bold text-board">
      {loading ? <span className="spinner" /> : name.trim().charAt(0)}
    </span>
  );
}
