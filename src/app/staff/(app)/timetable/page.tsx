import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { getClasses } from '@/lib/data';
import { getAllSlots, getSlotsFor } from '@/lib/schedule/view';
import { AdminTimetable } from '@/components/schedule/admin-timetable';
import { NowNext, WeekTimetable } from '@/components/schedule/week-view';
import { Insights } from '@/components/registry/insights';
import { DAYS } from '@/lib/format';

export const metadata: Metadata = { title: 'جدول الحصص' };

export default async function TimetablePage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const user = await requireUser(['admin', 'teacher']);

  // الإدارة: كل الحصص مرة واحدة، والتبديل بين الفصول والمعلمين في المتصفح
  if (user.role === 'admin') {
    const [slots, classes] = await Promise.all([getAllSlots(), getClasses()]);
    return <AdminTimetable slots={slots} classes={classes.map((c) => ({ id: c.id, label: `${c.label}${c.branch ? ` · ${c.branch}` : ''}` }))} />;
  }

  // المعلم: جدوله، ويمكنه فتح الجدول الكامل لأي فصل يدرّسه
  const { class: cls } = await searchParams;
  const mine = await getSlotsFor({ teacherId: user.employeeId ?? -1 });
  const myClasses = [...new Map(mine.map((s) => [s.classId, s.classLabel])).entries()];
  const classId = Number(cls) || null;
  const classSlots = classId && myClasses.some(([id]) => id === classId) ? await getSlotsFor({ classId }) : null;

  const perDay = DAYS.map((d, i) => ({ d, n: mine.filter((s) => s.day === i).length }));
  const busiest = [...perDay].sort((a, b) => b.n - a.n)[0];
  const bySubject = new Map<string, number>();
  mine.forEach((s) => bySubject.set(s.subject, (bySubject.get(s.subject) ?? 0) + 1));

  return (
    <div className="space-y-6">
      <NowNext slots={mine} secondary="class" />
      <Insights
        stats={[
          { label: 'حصصي أسبوعيًا', value: mine.length, icon: 'timetable' },
          { label: 'فصولي', value: myClasses.length, icon: 'students' },
          { label: 'موادي', value: bySubject.size, icon: 'tasks' },
          { label: 'أكثر أيامي', value: busiest?.n ? busiest.d : '—', icon: 'calendar', hint: busiest?.n ? `${busiest.n} حصص` : undefined, tone: 'gold' },
        ]}
        donut={{ title: 'حصصي حسب المادة', caption: 'في الأسبوع', unit: 'حصة', items: [...bySubject.entries()].map(([name, value]) => ({ name, value })) }}
      />
      <section className="rounded-[1.4rem] border border-line bg-surface p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Link href="/staff/timetable" className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${!classSlots ? 'bg-board text-chalk' : 'bg-paper hover:bg-board/10'}`}>جدولي</Link>
          {myClasses.map(([id, label]) => (
            <Link key={id} href={`/staff/timetable?class=${id}`} className={`rounded-full px-4 py-2 text-sm transition-colors ${classId === id && classSlots ? 'bg-board font-semibold text-chalk' : 'bg-paper hover:bg-board/10'}`}>
              {label}
            </Link>
          ))}
        </div>
        {classSlots ? (
          <WeekTimetable slots={classSlots} secondary="teacher" />
        ) : mine.length ? (
          <WeekTimetable slots={mine} secondary="class" />
        ) : (
          <p className="rounded-2xl border border-dashed border-line py-14 text-center text-muted">لا حصص مسندة إليك بعد</p>
        )}
      </section>
    </div>
  );
}
