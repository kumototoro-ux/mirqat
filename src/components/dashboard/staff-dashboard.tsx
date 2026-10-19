'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { Icon, type IconName } from '@/components/shell/icons';
import { subjectColor } from '@/components/timetable-grid';
import { TimeAgo } from '@/components/content/media';
import { ActivityChart, DaysLeft, Hero, MoreLink, Panel, QuickActions, Tiles, fmtClock, fmtDay, inMinutes, nowNext, useNow, type Tile } from './kit';

/* =====================================================================
   رئيسية الموظف — الإداري: نبض المدرسة اليوم، المعلم: يومه وما ينتظره
   ===================================================================== */

export type StaffHomeData = {
  today: string;
  dow: number;
  week: { label: string | null; no: number; starts_on: string; ends_on: string } | null;
  holiday: string | null;
  students: number;
  periods_today: number;
  periods_recorded: number;
  absent_today: number;
  to_grade: number;
  open_now: number;
  closing: { id: number; kind: 'task' | 'form'; title: string; ends_at: string; subject: string; class_id: number; class_size: number; submitted: number }[];
  recent_submissions: { id: number; kind: 'task' | 'form'; assessment_id: number; title: string; student: string; at: string; is_late: boolean; graded: boolean }[];
  activity: { day: string; grades: number; attendance: number; views: number }[];
  content: { items: number; week_views: number; top: { id: number; kind: 'video' | 'enrichment'; title: string; subject: string; viewers: number; class_size: number }[] };
  behavior_week: { positive: number; negative: number };
  events: { event: string; starts_on: string; ends_on: string }[];
  admin: { employees: number; accounts: number; must_change: number; release_rules: number; audit: { id: number; occurred_at: string; actor_name: string | null; action: string; table_name: string | null; details: string | null }[] } | null;
};
export type MyPeriod = { slot_id: number; class_id: number; subject_id: number; period_no: number; starts_at: string | null; subject: string; recorded: number; absent: number; students: number };

const ACTION_AR: Record<string, string> = { INSERT: 'إضافة', UPDATE: 'تعديل', DELETE: 'حذف' };
const TABLE_AR: Record<string, string> = {
  students: 'طالب', employees: 'موظف', grade_entries: 'درجة', assessments: 'تقييم', attendance_records: 'تحضير', behavior_records: 'سلوك',
  content_items: 'محتوى', profiles: 'حساب', app_settings: 'إعداد', task_submissions: 'تسليم', staff_scope: 'صلاحية', result_release_rules: 'إتاحة نتائج',
  calendar_entries: 'تقويم', timetable_slots: 'جدول', form_details: 'نموذج', form_questions: 'سؤال',
};

export function StaffDashboard({ role, name, greet, date, data, periods, classNames, scopeWarning }: { role: 'admin' | 'teacher'; name: string; greet: string; date: { g: string; h: string }; data: StaffHomeData; periods: MyPeriod[]; classNames: Record<number, string>; scopeWarning: boolean }) {
  const now = useNow();
  const admin = role === 'admin';
  const { current, next, minsToNext } = nowNext(periods, now);
  const pendingPeriods = periods.filter((p) => !p.recorded);
  const weekLabel = data.week ? data.week.label ?? `الأسبوع ${data.week.no}` : null;

  const tiles: Tile[] = admin
    ? [
        { label: 'طلاب منتظمون', value: data.students, icon: 'students', href: '/staff/students', hint: `${data.admin?.employees ?? 0} موظف نشط` },
        { label: 'التحضير اليوم', value: data.periods_recorded, of: data.periods_today, icon: 'attendance', tone: 'ok', href: '/staff/attendance', hint: data.dow > 4 ? 'لا دراسة اليوم' : `${Math.max(0, data.periods_today - data.periods_recorded)} حصة لم تُحضَّر` },
        { label: 'غياب اليوم', value: data.absent_today, icon: 'alert', tone: data.absent_today ? 'danger' : 'ok', href: '/staff/attendance', hint: 'سجل غياب في الحصص' },
        { label: 'بانتظار التصحيح', value: data.to_grade, icon: 'edit', tone: data.to_grade ? 'gold' : 'ok', href: '/staff/grading', hint: `${data.open_now} مهمة ونموذج مفتوح الآن` },
      ]
    : [
        { label: 'حصصي اليوم', value: periods.length - pendingPeriods.length, of: periods.length, icon: 'attendance', tone: 'ok', href: '/staff/attendance', hint: periods.length ? (pendingPeriods.length ? `${pendingPeriods.length} لم تُحضَّر` : 'حضّرت كل حصصك ✓') : 'لا حصص اليوم' },
        { label: 'بانتظار التصحيح', value: data.to_grade, icon: 'edit', tone: data.to_grade ? 'gold' : 'ok', href: '/staff/grading', hint: data.to_grade ? 'تسليمات وإجابات تنتظرك' : 'لا شيء ينتظرك 🎉' },
        { label: 'مفتوح الآن', value: data.open_now, icon: 'tasks', tone: 'sky', href: '/staff/tasks', hint: `${data.closing.length} يُغلق خلال 3 أيام` },
        { label: 'مشاهدات الأسبوع', value: data.content.week_views, icon: 'play', href: '/staff/content', hint: `${data.content.items} فيديو وإثراء` },
      ];

  const actions: { href: string; label: string; icon: IconName }[] = [
    { href: '/staff/attendance', label: 'تحضير حصة', icon: 'attendance' },
    { href: '/staff/grading', label: 'رصد درجات', icon: 'edit' },
    { href: '/staff/tasks/new', label: 'مهمة جديدة', icon: 'tasks' },
    { href: '/staff/tasks/new?kind=form', label: 'نموذج جديد', icon: 'forms' },
    { href: '/staff/content', label: 'فيديو وإثراء', icon: 'play' },
    { href: '/staff/behavior', label: 'تسجيل سلوك', icon: 'behavior' },
    ...(admin
      ? ([
          { href: '/staff/students', label: 'الطلاب', icon: 'students' },
          { href: '/staff/results', label: 'النتائج', icon: 'results' },
          { href: '/staff/timetable', label: 'الجداول', icon: 'timetable' },
          { href: '/staff/reports', label: 'التقارير', icon: 'audit' },
          { href: '/staff/accounts', label: 'الحسابات', icon: 'key' },
          { href: '/staff/settings', label: 'الإعدادات', icon: 'settings' },
        ] as const)
      : []),
  ];

  return (
    <div className="space-y-5">
      <Hero
        eyebrow={greet}
        title={name}
        lead={
          <>
            {date.g} · {date.h}
            {weekLabel ? ` · ${weekLabel}` : ''}
          </>
        }
        aside={
          !admin && periods.length > 0 && data.dow <= 4 ? (
            <div className="rounded-2xl bg-chalk/10 p-3.5 ring-1 ring-chalk/15 sm:min-w-64">
              {current ? (
                <>
                  <p className="flex items-center gap-1.5 text-xs text-gold"><span className="size-2 animate-pulse rounded-full bg-gold" /> الحصة الآن</p>
                  <p className="mt-0.5 font-bold">{current.subject} · {classNames[current.class_id] ?? ''}</p>
                  <Link href="/staff/attendance" className="mt-2 inline-flex items-center gap-1 rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-ink">{current.recorded ? 'تعديل التحضير' : 'حضّرها الآن'}</Link>
                </>
              ) : next ? (
                <>
                  <p className="text-xs text-chalk/70">الحصة التالية {minsToNext != null ? `· ${inMinutes(minsToNext)}` : ''}</p>
                  <p className="mt-0.5 font-bold">{next.subject} · {classNames[next.class_id] ?? ''}</p>
                  <p className="text-xs text-chalk/70">الحصة {next.period_no} · {fmtClock(next.starts_at)}</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-chalk/70">انتهت حصص اليوم</p>
                  <p className="mt-0.5 font-bold">{pendingPeriods.length ? `${pendingPeriods.length} حصة لم تُحضَّر` : 'يوم مكتمل ✓'}</p>
                </>
              )}
            </div>
          ) : admin && data.admin ? (
            <div className="grid grid-cols-2 gap-2 sm:min-w-64">
              <div className="rounded-2xl bg-chalk/10 px-3.5 py-3 ring-1 ring-chalk/15">
                <p className="text-xs text-chalk/70">حسابات الدخول</p>
                <p className="text-xl font-bold tabular-nums">{data.admin.accounts}</p>
                {data.admin.must_change > 0 && <p className="text-[0.7rem] text-gold">{data.admin.must_change} لم يغيّر كلمته</p>}
              </div>
              <Link href="/staff/results?tab=rules" className="rounded-2xl bg-chalk/10 px-3.5 py-3 ring-1 ring-chalk/15 transition-colors hover:bg-chalk/15">
                <p className="text-xs text-chalk/70">النتائج</p>
                <p className="text-sm font-bold">{data.admin.release_rules ? `${data.admin.release_rules} قاعدة حجب` : 'ظاهرة للطلاب'}</p>
              </Link>
            </div>
          ) : null
        }
      >
        {data.holiday && <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gold/20 px-3 py-1 text-xs font-semibold text-gold"><Icon name="calendar" className="size-3.5" /> {data.holiday}</p>}
      </Hero>

      {scopeWarning && (
        <p className="flex items-center gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger"><Icon name="alert" className="size-5 shrink-0" /> نطاق عملك ناقص، فلن تظهر لك بيانات طلاب. اطلب من الإدارة إكمال صلاحياتك.</p>
      )}

      <Tiles items={tiles} />
      <QuickActions items={actions} />

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        {admin ? (
          <Panel title="نبض المدرسة — آخر 14 يومًا" action={<MoreLink href="/staff/reports">التقارير</MoreLink>}>
            <ActivityChart days={data.activity} series={[{ key: 'grades', label: 'درجات', color: '#356854' }, { key: 'attendance', label: 'تحضير', color: '#d9a441' }, { key: 'views', label: 'مشاهدات', color: '#2a6f8a' }]} />
          </Panel>
        ) : (
          <Panel title="حصصي اليوم" action={<MoreLink href="/staff/timetable?mine=1">جدولي</MoreLink>} pad={false}>
            {!periods.length ? (
              <p className="px-5 pb-6 pt-2 text-sm text-muted">{data.dow > 4 ? 'لا دراسة اليوم — استمتع بإجازتك.' : 'لا حصص لك اليوم.'}</p>
            ) : (
              <ol className="relative px-5 pb-4">
                {periods.map((p, i) => {
                  const live = current?.slot_id === p.slot_id;
                  return (
                    <motion.li key={p.slot_id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="relative flex gap-3 pb-3 last:pb-0">
                      <span className="relative flex flex-col items-center">
                        <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold ${live ? 'bg-gold text-ink ring-4 ring-gold/25' : p.recorded ? 'bg-ok-soft text-ok' : 'bg-paper text-ink'}`}>{p.period_no}</span>
                        {i < periods.length - 1 && <span className="w-px flex-1 bg-line" />}
                      </span>
                      <Link href="/staff/attendance" className={`mb-1 flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 transition-colors ${live ? 'bg-gold/10' : 'hover:bg-paper'}`}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{p.subject}</span>
                          <span className="text-xs text-muted">{classNames[p.class_id] ?? ''}{p.starts_at ? ` · ${fmtClock(p.starts_at)}` : ''}</span>
                        </span>
                        {p.recorded ? (
                          <span className="shrink-0 rounded-full bg-ok-soft px-2.5 py-1 text-xs font-semibold text-ok">✓ {p.absent ? `${p.absent} غياب` : 'حضور كامل'}</span>
                        ) : (
                          <span className="shrink-0 rounded-full bg-brass-soft px-2.5 py-1 text-xs font-semibold text-brass">لم تُحضَّر</span>
                        )}
                      </Link>
                    </motion.li>
                  );
                })}
              </ol>
            )}
          </Panel>
        )}

        <Panel title="يُغلق قريبًا" action={<MoreLink href="/staff/tasks" />} pad={false}>
          {!data.closing.length ? (
            <p className="px-5 pb-6 pt-2 text-sm text-muted">لا مهام أو نماذج تُغلق خلال 3 أيام.</p>
          ) : (
            <ul className="space-y-1 px-3 pb-3">
              {data.closing.map((c) => {
                const pct = c.class_size ? Math.round((c.submitted / c.class_size) * 100) : 0;
                return (
                  <li key={c.id}>
                    <Link href={`/staff/tasks/${c.id}`} className="block rounded-xl px-2.5 py-2.5 transition-colors hover:bg-paper">
                      <span className="flex items-center gap-2">
                        <Icon name={c.kind === 'form' ? 'forms' : 'tasks'} className="size-4 shrink-0 text-muted" />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.title}</span>
                        <span className="shrink-0 text-xs text-brass"><TimeAgo iso={c.ends_at} /></span>
                      </span>
                      <span className="mt-1.5 flex items-center gap-2 text-xs text-muted">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: subjectColor(c.subject) }} /></span>
                        <span className="tabular-nums">{c.submitted}/{c.class_size} سلّموا</span>
                      </span>
                      <span className="text-[0.7rem] text-muted">{c.subject} · {classNames[c.class_id] ?? ''}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="آخر التسليمات" action={<MoreLink href="/staff/grading">التصحيح</MoreLink>} pad={false} className="lg:col-span-1">
          {!data.recent_submissions.length ? (
            <p className="px-5 pb-6 pt-2 text-sm text-muted">لا تسليمات بعد.</p>
          ) : (
            <ul className="px-3 pb-3">
              {data.recent_submissions.map((s) => (
                <li key={`${s.kind}-${s.id}`}>
                  <Link href={`/staff/grading/${s.assessment_id}`} className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-paper">
                    <span className={`size-2 shrink-0 rounded-full ${s.graded ? 'bg-ok' : 'bg-gold'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{s.student}</span>
                      <span className="block truncate text-xs text-muted">{s.title}</span>
                    </span>
                    <span className="shrink-0 text-end text-[0.7rem] text-muted">
                      <TimeAgo iso={s.at} />
                      {s.is_late && <span className="block text-danger">متأخر</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="المحتوى" action={<MoreLink href="/staff/content" />} pad={false}>
          {!data.content.top.length ? (
            <div className="px-5 pb-5 pt-2 text-sm text-muted">
              لم يُنشر محتوى بعد.
              <Link href="/staff/content" className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line py-3 font-semibold text-board hover:border-board/40"><Icon name="plus" className="size-4" /> انشر أول فيديو</Link>
            </div>
          ) : (
            <ul className="space-y-1 px-3 pb-3">
              {data.content.top.map((c) => {
                const pct = c.class_size ? Math.round((c.viewers / c.class_size) * 100) : 0;
                return (
                  <li key={c.id} className="flex items-center gap-3 rounded-xl px-2.5 py-2">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl text-chalk" style={{ background: subjectColor(c.subject) }}><Icon name={c.kind === 'video' ? 'play' : 'content'} className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{c.title}</span>
                      <span className="mt-1 block h-1 overflow-hidden rounded-full bg-paper"><span className="block h-full rounded-full bg-board" style={{ width: `${pct}%` }} /></span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">{c.viewers}/{c.class_size}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="هذا الأسبوع">
          <div className="grid grid-cols-2 gap-2">
            <Link href="/staff/behavior" className="rounded-xl bg-ok-soft/60 px-3 py-2.5 transition-colors hover:bg-ok-soft">
              <p className="text-xs text-ok">سلوك إيجابي</p>
              <p className="text-xl font-bold tabular-nums text-ok">{data.behavior_week.positive}</p>
            </Link>
            <Link href="/staff/behavior" className="rounded-xl bg-danger-soft/60 px-3 py-2.5 transition-colors hover:bg-danger-soft">
              <p className="text-xs text-danger">ملاحظات</p>
              <p className="text-xl font-bold tabular-nums text-danger">{data.behavior_week.negative}</p>
            </Link>
          </div>
          <p className="mb-2 mt-4 text-sm font-semibold">القادم في التقويم</p>
          {!data.events.length ? (
            <p className="text-sm text-muted">لا مناسبات قادمة.</p>
          ) : (
            <ul className="space-y-2">
              {data.events.map((e) => (
                <li key={e.starts_on + e.event} className="flex items-center gap-2.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper text-center leading-none">
                    <span className="text-sm font-bold">{Number(e.starts_on.slice(8, 10))}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{e.event}</span>
                    <span className="text-xs text-muted">{fmtDay(e.starts_on)}</span>
                  </span>
                  <DaysLeft date={e.starts_on} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {admin && data.admin && (
        <Panel title="آخر النشاطات" action={<MoreLink href="/staff/audit">السجل</MoreLink>} pad={false}>
          {!data.admin.audit.length ? (
            <p className="px-5 pb-6 pt-2 text-sm text-muted">لا نشاطات بعد.</p>
          ) : (
            <ul className="grid gap-x-4 px-3 pb-3 sm:grid-cols-2">
              {data.admin.audit.map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded-xl px-2.5 py-2">
                  <span className={`grid size-8 shrink-0 place-items-center rounded-lg text-xs font-bold ${a.action === 'DELETE' ? 'bg-danger-soft text-danger' : a.action === 'INSERT' ? 'bg-ok-soft text-ok' : 'bg-paper text-muted'}`}>
                    <Icon name={a.action === 'DELETE' ? 'trash' : a.action === 'INSERT' ? 'plus' : 'edit'} className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      <b>{a.actor_name ?? 'النظام'}</b> · {ACTION_AR[a.action] ?? a.action} {a.table_name ? TABLE_AR[a.table_name] ?? '' : ''}
                    </span>
                    {a.details && <span className="block truncate text-xs text-muted">{a.details}</span>}
                  </span>
                  <span className="shrink-0 text-[0.7rem] text-muted"><TimeAgo iso={a.occurred_at} /></span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}
