import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Badge, Card, PageHeader } from '@/components/ui';
import { DAYS, classLabel, fmtDate, fmtNum, fmtTime, todaySchoolDay } from '@/lib/format';
import { getCurrentWeek } from '@/lib/data';
import { getMe } from '@/lib/student';
import { subjectColor } from '@/components/timetable-grid';

export const metadata: Metadata = { title: 'الرئيسية' };

export default async function StudentHome() {
  const user = await requireUser(['student']);
  const me = await getMe();
  const day = todaySchoolDay();
  const week = await getCurrentWeek();
  const supabase = await createClient();
  const classId = me?.class_id ?? -1;
  const nowIso = new Date().toISOString();

  const [lessons, upcoming, grades] = await Promise.all([
    day === null
      ? Promise.resolve({ data: [] as { id: number; period_no: number; starts_at: string | null; subject: { name: string } | null; teacher: { name_ar: string } | null }[] })
      : supabase
          .from('timetable_slots')
          .select('id, period_no, starts_at, subject:subjects(name), teacher:employees(name_ar)')
          .eq('class_id', classId)
          .eq('day_of_week', day)
          .order('period_no')
          .returns<{ id: number; period_no: number; starts_at: string | null; subject: { name: string } | null; teacher: { name_ar: string } | null }[]>(),
    supabase
      .from('assessments')
      .select('id, kind, title, due_at, subject:subjects(name), form:form_details(closes_at, status)')
      .eq('class_id', classId)
      .or(`due_at.gte.${nowIso},due_at.is.null`)
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(6)
      .returns<{ id: number; kind: string; title: string; due_at: string | null; subject: { name: string } | null; form: { closes_at: string | null; status: string } | null }[]>(),
    supabase
      .from('grade_entries')
      .select('id, score, max_score, recorded_at, assessment:assessments(title, subject:subjects(name))')
      .eq('student_id', me?.id ?? -1)
      .order('recorded_at', { ascending: false })
      .limit(5)
      .returns<{ id: number; score: number; max_score: number; recorded_at: string; assessment: { title: string; subject: { name: string } | null } | null }[]>(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={day !== null ? `اليوم ${DAYS[day]}${week ? ` · ${week.week_label ?? `الأسبوع ${week.week_no}`}` : ''}` : 'عطلة نهاية الأسبوع'}
        title={`أهلًا ${(me?.name_ar ?? user.displayName).split(' ')[0]}`}
        lead={me ? `${classLabel(me.class, true)} · رقم الطالب ${me.code}` : undefined}
      />
      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <Card title="حصص اليوم" action={<Link href="/student/timetable" className="text-sm text-board hover:underline">جدولي</Link>} pad={false}>
          {(lessons.data ?? []).length === 0 ? (
            <p className="p-5 text-sm text-muted">{day === null ? 'لا دراسة اليوم، استمتع بإجازتك.' : 'لا حصص اليوم.'}</p>
          ) : (
            <ol className="divide-y divide-line">
              {(lessons.data ?? []).map((s) => (
                <li key={s.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl font-bold text-chalk" style={{ background: subjectColor(s.subject?.name ?? '') }}>
                    {s.period_no}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{s.subject?.name}</p>
                    <p className="text-sm text-muted">{s.teacher?.name_ar ?? ''}</p>
                  </div>
                  <span className="text-sm text-muted">{fmtTime(s.starts_at)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="مهام قادمة" action={<Link href="/student/tasks" className="text-sm text-board hover:underline">الكل</Link>} pad={false}>
            {(upcoming.data ?? []).length === 0 ? (
              <p className="p-5 text-sm text-muted">لا مهام قادمة.</p>
            ) : (
              <ul className="divide-y divide-line">
                {(upcoming.data ?? []).map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: subjectColor(a.subject?.name ?? '') }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.title}</p>
                      <p className="text-sm text-muted">{a.subject?.name}</p>
                    </div>
                    <div className="text-end">
                      <Badge tone={a.kind === 'form' ? 'board' : 'neutral'}>{a.kind === 'form' ? 'نموذج' : 'مهمة'}</Badge>
                      {(a.due_at || a.form?.closes_at) && <p className="mt-1 text-xs text-muted">حتى {fmtDate(a.due_at ?? a.form?.closes_at)}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="آخر درجاتي" action={<Link href="/student/results" className="text-sm text-board hover:underline">نتائجي</Link>} pad={false}>
            {(grades.data ?? []).length === 0 ? (
              <p className="p-5 text-sm text-muted">لا درجات بعد.</p>
            ) : (
              <ul className="divide-y divide-line">
                {(grades.data ?? []).map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{g.assessment?.title}</span>
                      <span className="text-xs text-muted">{g.assessment?.subject?.name}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {fmtNum(Number(g.score), 2)} <span className="text-xs font-normal text-muted">/ {fmtNum(Number(g.max_score), 2)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
