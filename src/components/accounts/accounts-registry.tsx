'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BulkButton, Registry, RowButton, type FilterDef, type RegistryHandle } from '@/components/registry/registry';
import { Insights } from '@/components/registry/insights';
import { downloadCsv } from '@/components/registry/csv';
import Link from 'next/link';
import type { PageParams, PageResult } from '@/components/registry/types';
import { Badge } from '@/components/ui';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { Sheet, Field } from '@/components/sheet';
import { fmtDateTime } from '@/lib/format';
import {
  createAccountFor,
  createMissingAccounts,
  listEmployeeAccounts,
  listStudentAccounts,
  resetAccountPassword,
  setAccountStatus,
  setAccountsStatus,
  type AccountKind,
  type AccountRow,
} from '@/lib/accounts/actions';

/** بطاقة كلمة المرور: تُعرض مرة واحدة مع زر نسخ */
function PasswordCard({ name, username, password }: { name: string; username: string; password: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 rounded-2xl border border-gold/50 bg-brass-soft/60 p-4 text-ink">
      <p className="font-semibold">{name}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted">اسم المستخدم</dt>
        <dd><bdi className="font-semibold">{username}</bdi></dd>
        <dt className="text-muted">كلمة المرور</dt>
        <dd>
          <bdi dir="ltr" className="select-all rounded-lg bg-surface px-2.5 py-1 text-lg font-bold tracking-[0.15em]">{password}</bdi>
        </dd>
      </dl>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(`اسم المستخدم: ${username}\nكلمة المرور: ${password}`);
          setCopied(true);
        }}
        className="btn-quiet mt-3 w-full py-2"
      >
        <Icon name={copied ? 'tasks' : 'key'} className="size-4" />
        {copied ? 'نُسخت البيانات' : 'نسخ البيانات'}
      </button>
      <p className="mt-2 text-xs text-muted">لن تظهر مرة أخرى. صاحب الحساب يغيّرها عند أول دخول.</p>
    </div>
  );
}


export function AccountsRegistry({
  kind,
  initial,
  initialParams,
  stats,
  classes,
}: {
  kind: AccountKind;
  initial: PageResult<AccountRow>;
  initialParams: PageParams;
  stats: { total: number; withAccount: number; temp: number; disabled: number; activated: number; login7: number };
  classes?: { value: string; label: string }[];
}) {
  const registry = useRef<RegistryHandle>(null);
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [creating, setCreating] = useState<AccountRow | null>(null);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const student = kind === 'student';
  const who = student ? 'طالب' : 'موظف';

  const refresh = () => {
    registry.current?.invalidate();
    router.refresh();
  };

  const showPassword = (name: string, user: string, password: string, title: string) =>
    confirm({ title, body: <PasswordCard name={name} username={user} password={password} />, confirmLabel: 'تم', cancelLabel: 'إغلاق' });

  const create = async () => {
    if (!creating) return;
    setBusy('create');
    const res = await createAccountFor(kind, creating.recordId, username);
    setBusy(null);
    if (!res.ok) return toast(res.error, 'error');
    setCreating(null);
    refresh();
    toast(res.message);
    await showPassword(creating.name, res.code!, res.password!, 'أُنشئ الحساب');
  };

  const reset = async (r: AccountRow) => {
    if (!r.account) return;
    const ok = await confirm({
      title: 'إصدار كلمة مؤقتة جديدة؟',
      body: <>تتوقف كلمة <b className="text-ink">{r.name}</b> الحالية فورًا، ويُطلب منه تغيير الجديدة عند دخوله.</>,
      confirmLabel: 'إصدار',
    });
    if (!ok) return;
    setBusy(r.account.id);
    const res = await resetAccountPassword(kind, r.account.id);
    setBusy(null);
    if (!res.ok) return toast(res.error, 'error');
    refresh();
    await showPassword(r.name, r.account.username, res.password!, 'كلمة مؤقتة جديدة');
  };

  const toggle = async (r: AccountRow) => {
    if (!r.account) return;
    const disabling = r.account.status === 'active';
    const ok = await confirm({
      title: disabling ? 'إيقاف الحساب؟' : 'تفعيل الحساب؟',
      body: disabling ? <>يُمنع <b className="text-ink">{r.name}</b> من الدخول فورًا، وتنتهي جلسته المفتوحة.</> : <>يعود <b className="text-ink">{r.name}</b> قادرًا على الدخول.</>,
      confirmLabel: disabling ? 'إيقاف' : 'تفعيل',
      danger: disabling,
    });
    if (!ok) return;
    setBusy(r.account.id);
    const res = await setAccountStatus(kind, r.account.id, disabling ? 'disabled' : 'active');
    setBusy(null);
    if (!res.ok) return toast(res.error, 'error');
    toast(res.message);
    refresh();
  };

  const bulk = async () => {
    const missing = stats.total - stats.withAccount;
    const ok = await confirm({
      title: `إنشاء حسابات لـ ${missing} ${who} بلا حساب؟`,
      body: 'اسم المستخدم لكل واحد هو رقمه، وكلمات المرور مؤقتة تظهر مرة واحدة في ملف Excel تنزّله بعد الإنشاء.',
      confirmLabel: 'إنشاء الحسابات',
    });
    if (!ok) return;
    setBusy('bulk');
    const res = await createMissingAccounts(kind);
    setBusy(null);
    if (!res.ok) return toast(res.error, 'error');
    refresh();
    if (res.created.length) {
      downloadCsv(student ? 'حسابات-الطلاب' : 'حسابات-الموظفين', ['الرقم', 'الاسم', 'اسم المستخدم', 'كلمة المرور المؤقتة'], res.created.map((r) => [r.code, r.name, r.username, r.password]));
      toast(`أُنشئ ${res.created.length} حسابًا ونُزّل ملف كلمات المرور`);
    }
    if (res.failed.length) toast(`تعذّر ${res.failed.length}: ${res.failed[0].code} — ${res.failed[0].problem}`, 'error');
  };

  const filters: FilterDef[] = [
    {
      key: 'account',
      label: 'الحساب',
      options: [
        { value: 'has', label: 'له حساب' },
        { value: 'none', label: 'بلا حساب' },
        { value: 'temp', label: 'بكلمة مؤقتة (لم يدخل)' },
        { value: 'disabled', label: 'موقوف' },
      ],
    },
    student
      ? { key: 'class', label: 'الفصل', options: classes ?? [] }
      : { key: 'type', label: 'النوع', options: [{ value: 'teacher', label: 'معلم' }, { value: 'admin', label: 'إداري' }] },
  ];

  const bulkStatus = async (rows: AccountRow[], status: 'active' | 'disabled', clear: () => void) => {
    const ids = rows.flatMap((r) => (r.account && r.account.status !== status ? [r.account.id] : []));
    if (!ids.length) return toast('لا حسابات تحتاج هذا التغيير في التحديد', 'info');
    const ok = await confirm({
      title: status === 'disabled' ? `إيقاف ${ids.length} حساب؟` : `تفعيل ${ids.length} حساب؟`,
      body: status === 'disabled' ? 'يُمنعون من الدخول فورًا وتنتهي جلساتهم المفتوحة.' : 'يعودون قادرين على الدخول.',
      confirmLabel: status === 'disabled' ? 'إيقاف' : 'تفعيل',
      danger: status === 'disabled',
    });
    if (!ok) return;
    setBusy('bulk-status');
    const res = await setAccountsStatus(kind, ids, status);
    setBusy(null);
    if (!res.ok) return toast(res.error, 'error');
    toast(res.message);
    clear();
    refresh();
  };

  const statusBadge = (r: AccountRow) =>
    !r.account ? <Badge>بلا حساب</Badge> : r.account.status !== 'active' ? <Badge tone="danger">موقوف</Badge> : r.account.temp ? <Badge tone="gold">لم يدخل بعد</Badge> : <Badge tone="ok">مفعّل</Badge>;

  const actions = (r: AccountRow) =>
    !r.account ? (
      <button
        type="button"
        onClick={() => {
          setCreating(r);
          setUsername(r.code);
        }}
        className="btn h-9 bg-board/10 px-3 text-board hover:bg-board hover:text-chalk"
      >
        <Icon name="plus" className="size-4" />
        إنشاء حساب
      </button>
    ) : busy === r.account.id ? (
      <span className="grid size-9 place-items-center"><span className="spinner text-board" /></span>
    ) : (
      <>
        <RowButton icon="key" label="كلمة مؤقتة جديدة" onClick={() => reset(r)} />
        <RowButton icon={r.account.status === 'active' ? 'close' : 'tasks'} label={r.account.status === 'active' ? 'إيقاف' : 'تفعيل'} tone={r.account.status === 'active' ? 'danger' : 'plain'} onClick={() => toggle(r)} />
      </>
    );

  return (
    <>
      <Insights
        stats={[
          { label: student ? 'حسابات الطلاب' : 'حسابات الموظفين', value: stats.withAccount, icon: 'accounts', hint: `من ${stats.total} ${who} نشط` },
          { label: 'دخلوا آخر 7 أيام', value: stats.login7, icon: 'logout', hint: stats.withAccount ? `${Math.round((stats.login7 / stats.withAccount) * 100)}% من الحسابات` : undefined },
          { label: 'لم يغيّروا الكلمة المؤقتة', value: stats.temp, icon: 'key', tone: stats.temp ? 'gold' : undefined },
          { label: 'بلا حساب', value: stats.total - stats.withAccount, icon: 'user', tone: stats.total - stats.withAccount ? 'danger' : undefined },
        ]}
        donut={{
          title: 'حالة الحسابات',
          caption: `كل ${student ? 'الطلاب' : 'الموظفين'} النشطين`,
          unit: who,
          items: [
            { name: 'مفعّل (غيّر كلمته)', value: stats.activated },
            { name: 'لم يدخل بعد', value: stats.temp },
            { name: 'بلا حساب', value: Math.max(0, stats.total - stats.withAccount) },
            { name: 'موقوف', value: stats.disabled },
          ].filter((x) => x.value > 0),
        }}
      />
      <Registry<AccountRow>
        ref={registry}
        queryKey={student ? 'student-accounts' : 'employee-accounts'}
        title={student ? 'حسابات الطلاب' : 'حسابات الموظفين'}
        fetchPage={student ? listStudentAccounts : listEmployeeAccounts}
        initial={initial}
        initialParams={initialParams}
        rowKey={(r) => r.recordId}
        searchPlaceholder="الاسم أو الرقم"
        emptyTitle="لا نتائج مطابقة"
        icon="accounts"
        sorts={[
          { value: 'name', label: 'الاسم (أ ← ي)' },
          { value: 'code', label: student ? 'رقم الطالب' : 'رمز الموظف' },
          { value: 'login_desc', label: 'آخر دخول' },
        ]}
        filters={filters}
        toolbar={
          <>
            <Link href="/staff/reports/accounts" className="btn h-11 rounded-xl border border-line bg-surface px-3.5 hover:border-board/40 hover:text-board">
              <Icon name="results" className="size-4" />
              التقرير
            </Link>
            {stats.total - stats.withAccount > 0 && (
              <button type="button" onClick={bulk} disabled={busy === 'bulk'} className="btn-primary h-11 rounded-xl px-4">
                {busy === 'bulk' ? <span className="spinner" /> : <Icon name="plus" className="size-4" />}
                إنشاء الناقصة ({stats.total - stats.withAccount})
              </button>
            )}
          </>
        }
        bulkActions={(rows, clear) => (
          <>
            <BulkButton onClick={() => downloadCsv(student ? 'حسابات-طلاب' : 'حسابات-موظفين', ['الرقم', 'الاسم', 'اسم المستخدم', 'الحالة', 'آخر دخول'], rows.map((r) => [r.code, r.name, r.account?.username ?? '', !r.account ? 'بلا حساب' : r.account.status === 'disabled' ? 'موقوف' : r.account.temp ? 'لم يدخل' : 'مفعّل', r.account?.lastLogin ? fmtDateTime(r.account.lastLogin) : '']))}>
              <Icon name="audit" className="size-4" /> تصدير
            </BulkButton>
            <BulkButton tone="danger" busy={busy === 'bulk-status'} onClick={() => bulkStatus(rows, 'disabled', clear)}>إيقاف</BulkButton>
            <BulkButton busy={busy === 'bulk-status'} onClick={() => bulkStatus(rows, 'active', clear)}>تفعيل</BulkButton>
          </>
        )}
        columns={[
          {
            key: 'name',
            label: student ? 'الطالب' : 'الموظف',
            sort: 'name',
            render: (r) => (
              <div className="flex items-center gap-3">
                <span className={`grid size-10 shrink-0 place-items-center rounded-full font-bold ${r.isAdmin ? 'bg-gold/25 text-brass' : 'bg-board/10 text-board'}`}>
                  {r.name.trim().charAt(0)}
                </span>
                <div className="min-w-0">
                  <p className="max-w-60 truncate font-semibold">{r.name}</p>
                  <p className="text-xs text-muted"><bdi>{r.code}</bdi> · {r.meta}</p>
                </div>
              </div>
            ),
          },
          { key: 'username', label: 'اسم المستخدم', render: (r) => (r.account ? <bdi className="font-medium">{r.account.username}</bdi> : <span className="text-muted">—</span>) },
          { key: 'status', label: 'حالة الحساب', render: statusBadge },
          { key: 'login', label: 'آخر دخول', sort: 'login', render: (r) => <span className="text-xs text-muted">{r.account?.lastLogin ? fmtDateTime(r.account.lastLogin) : '—'}</span> },
        ]}
        rowActions={actions}
        mobileCard={(r) => (
          <div className="min-w-0">
            <p className="truncate font-semibold">{r.name}</p>
            <p className="truncate text-xs text-muted"><bdi>{r.code}</bdi> · {r.meta}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {statusBadge(r)}
              {r.account && <bdi className="text-xs text-muted">{r.account.username}</bdi>}
            </div>
          </div>
        )}
      />

      <Sheet
        open={creating !== null}
        onClose={() => setCreating(null)}
        title="إنشاء حساب دخول"
        subtitle={creating ? `${creating.name} · ${creating.code}` : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreating(null)} className="btn-quiet">إلغاء</button>
            <button type="button" onClick={create} disabled={busy === 'create'} className="btn-primary min-w-32">
              {busy === 'create' ? (<><span className="spinner" />جارٍ الإنشاء…</>) : 'إنشاء الحساب'}
            </button>
          </div>
        }
      >
        <Field label="اسم المستخدم" required hint="الافتراضي هو الرقم، ويمكن تغييره. بلا مسافات.">
          <input value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" className="field text-start" autoComplete="off" spellCheck={false} />
        </Field>
        <p className="mt-4 rounded-xl bg-paper px-3.5 py-3 text-sm text-muted">
          تُولَّد كلمة مرور مؤقتة وتظهر لك مرة واحدة بعد الإنشاء، ويُلزم صاحب الحساب بتغييرها عند أول دخول.
        </p>
      </Sheet>
    </>
  );
}
