import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Badge, Card, Empty, PageHeader, StatGrid } from '@/components/ui';
import { CLASS_SELECT, DAYS, classLabel, fmtDate, fmtDateTime, fmtNum, fmtTime, todaySchoolDay, type ClassRef } from '@/lib/format';
import { getCurrentWeek } from '@/lib/data';
import { subjectColor } from '@/components/timetable-grid';

export const metadata: Metadata = { title: 'الرئيسية' };

type Supa = Awaited<ReturnType<typeof createClient>>;

type AssessmentRow = {
  id: number;
  kind: 'task' | 'form' | 'manual';
  title: string;
  due_at: string | null;
  created_at: string;
  class: ClassRef;
  subject: { name: string } | null;
};

export default async function StaffHome() {
  const user = await requireUser(['admin', 'teacher']);
  const supabase = await createClient();
  const week = await getCurrentWeek();
  const day = todaySchoolDay();

  return (
    <>
      <PageHeader
        eyebrow={greeting()}
        title={user.displayName}
        lead={
          <>
            {day !== null ? `اليوم ${DAYS[day]}` : 'عطلة نهاية الأسبوع'}
            {week ? ` · ${week.week_label ?? `الأسبوع ${week.week_no}`}` : ''}
          </>
        }
      />
      {user.role === 'admin' ? <AdminHome supabase={supabase} /> : <TeacherHome supabase={supabase} employeeId={user.employeeId} day={day} />}
    </>
  );
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Riyadh' }).format(new Date()));
  return h < 12 ? 'صباح الخير' : 'مساء الخير';
}

async function count(supabase: Supa, table: string, f?: (q: any) => any) {
  let q = supabase.from(table).select('*', { count: 'exact', head: true });
  if (f) q = f(q);
  const { count } = await q;
  return count ?? 0;
}

async function AdminHome({ supabase }: { supabase: Supa }) {
  const [students, employees, accounts, pending, tasks, forms, recent, audit] = await Promise.all([
    count(supabase, 'students', (q) => q.eq('status', 'active')),
    count(supabase, 'employees', (q) => q.eq('is_active', true)),
    count(supabase, 'profiles'),
    count(supabase, 'profiles', (q) => q.eq('must_change_password', true)),
    count(supabase, 'assessments', (q) => q.eq('kind', 'task')),
    count(supabase, 'assessments', (q) => q.eq('kind', 'form')),
    supabase
      .from('assessments')
      .select(`id, kind, title, due_at, created_at, class:classes(${CLASS_SELECT}), subject:subjects(name)`)
      .order('created_at', { ascending: false })
      .limit(6)
      .returns<AssessmentRow[]>(),
    supabase.from('audit_log').select('id, occurred_at, actor_name, action, details').order('occurred_at', { ascending: false }).limit(7),
  ]);

  return (
    <div className="space-y-6">
      <StatGrid
        items={[
          { label: 'طالب منتظم', value: fmtNum(students) },
          { label: 'موظف نشط', value: fmtNum(employees) },
          { label: 'حساب دخول', value: fmtNum(accounts), hint: `${fmtNum(pending)} لم يغيّر كلمته المؤقتة`, tone: pending ? 'gold' : 'board' },
          { label: 'مهمة ونموذج', value: fmtNum(tasks + forms), hint: `${fmtNum(tasks)} مهمة · ${fmtNum(forms)} نموذج` },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card title="آخر المهام والنماذج" action={<Link href="/staff/tasks" className="text-sm text-board hover:underline">الكل</Link>} pad={false}>
          <AssessmentList rows={recent.data ?? []} />
        </Card>
        <Card title="آخر النشاطات" action={<Link href="/staff/audit" className="text-sm text-board hover:underline">السجل</Link>} pad={false}>
          {(audit.data ?? []).length === 0 ? (
            <p className="p-5 text-sm text-muted">لا نشاطات بعد.</p>
          ) : (
            <ul className="divide-y divide-line">
              {(audit.data ?? []).map((a) => (
                <li key={a.id} className="px-5 py-3 text-sm">
                  <p className="flex items-center justify-between gap-3">
                    <span className="font-medium">{a.action}</span>
                    <span className="shrink-0 text-xs text-muted">{fmtDateTime(a.occurred_at)}</span>
                  </p>
                  <p className="mt-0.5 truncate text-muted">
                    {a.actor_name ?? 'النظام'}
                    {a.details ? ` · ${a.details}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function AssessmentList({ rows }: { rows: AssessmentRow[] }) {
  if (!rows.length) return <p className="p-5 text-sm text-muted">لا مهام بعد.</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center gap-3 px-5 py-3">
          <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: subjectColor(r.subject?.name ?? '') }} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{r.title}</p>
            <p className="truncate text-sm text-muted">
              {r.subject?.name} · {classLabel(r.class, true)}
            </p>
          </div>
          <div className="shrink-0 text-end">
            <Badge tone={r.kind === 'form' ? 'board' : 'neutral'}>{r.kind === 'form' ? 'نموذج' : r.kind === 'task' ? 'مهمة' : 'رصد'}</Badge>
            {r.due_at && <p className="mt-1 text-xs text-muted">حتى {fmtDate(r.due_at)}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

type SlotRow = {
  id: number;
  period_no: number;
  starts_at: string | null;
  delivery_mode: string | null;
  subject: { name: string } | null;
  class: ClassRef;
};

async function TeacherHome({ supabase, employeeId, day }: { supabase: Supa; employeeId: number | null; day: number | null }) {
  const me = employeeId ?? -1;
  const [today, mine, scope] = await Promise.all([
    day === null
      ? Promise.resolve({ data: [] as SlotRow[] })
      : supabase
          .from('timetable_slots')
          .select(`id, period_no, starts_at, delivery_mode, subject:subjects(name), class:classes(${CLASS_SELECT})`)
          .eq('teacher_id', me)
          .eq('day_of_week', day)
          .order('period_no')
          .returns<SlotRow[]>(),
    supabase
      .from('assessments')
      .select(`id, kind, title, due_at, created_at, class:classes(${CLASS_SELECT}), subject:subjects(name)`)
      .eq('teacher_id', me)
      .order('created_at', { ascending: false })
      .limit(6)
      .returns<AssessmentRow[]>(),
    supabase
      .from('staff_scope')
      .select('branch:branches(name), grade:grades(name, stage:stages(name)), section:sections(name), subject:subjects(name)')
      .eq('employee_id', me)
      .returns<{ branch: { name: string } | null; grade: { name: string; stage: { name: string } | null } | null; section: { name: string } | null; subject: { name: string } | null }[]>(),
  ]);

  const rows = scope.data ?? [];
  const groups = [
    { label: 'الفروع', items: rows.flatMap((r) => (r.branch ? [r.branch.name] : [])) },
    { label: 'الصفوف', items: rows.flatMap((r) => (r.grade ? [`${r.grade.name}${r.grade.stage ? ' ' + r.grade.stage.name : ''}`] : [])) },
    { label: 'الشعب', items: rows.flatMap((r) => (r.section ? [r.section.name] : [])) },
    { label: 'المواد', items: rows.flatMap((r) => (r.subject ? [r.subject.name] : [])) },
  ];
  const incomplete = groups.some((g) => g.items.length === 0);

  return (
    <div className="space-y-6">
      {incomplete && (
        <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          نطاق عملك ناقص، فلن تظهر لك بيانات طلاب. اطلب من الإدارة إكمال صلاحياتك.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card title="حصص اليوم" action={<Link href="/staff/timetable?mine=1" className="text-sm text-board hover:underline">جدولي</Link>} pad={false}>
          {(today.data ?? []).length === 0 ? (
            <p className="p-5 text-sm text-muted">{day === null ? 'لا دراسة اليوم.' : 'لا حصص لك اليوم.'}</p>
          ) : (
            <ol className="divide-y divide-line">
              {(today.data ?? []).map((s) => (
                <li key={s.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-board/10 text-center leading-tight text-board">
                    <span className="text-base font-bold">{s.period_no}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{s.subject?.name}</p>
                    <p className="text-sm text-muted">{classLabel(s.class, true)}</p>
                  </div>
                  <span className="text-sm text-muted">{fmtTime(s.starts_at)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card title="نطاق عملك">
          <dl className="space-y-3">
            {groups.map((g) => (
              <div key={g.label} className="flex gap-4">
                <dt className="w-14 shrink-0 text-sm text-muted">{g.label}</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {g.items.length ? [...new Set(g.items)].map((n) => <Badge key={n}>{n}</Badge>) : <span className="text-sm text-danger">لا شيء</span>}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
      <Card title="آخر مهامي ونماذجي" action={<Link href="/staff/tasks" className="text-sm text-board hover:underline">الكل</Link>} pad={false}>
        <AssessmentList rows={mine.data ?? []} />
      </Card>
    </div>
  );
}
