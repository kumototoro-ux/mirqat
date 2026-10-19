'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { Icon } from '@/components/shell/icons';
import { subjectColor } from '@/components/timetable-grid';
import { DueReminders } from '@/components/assess/student-list';
import { deadlineOf, studentState, type StudentItem } from '@/lib/assess/student';
import { TimeAgo } from '@/components/content/media';
import { MediaThumb } from '@/components/content/media';
import { DaysLeft, Hero, MoreLink, Panel, QuickActions, Tiles, fmtClock, fmtDay, inMinutes, nowNext, useNow } from './kit';

/* =====================================================================
   رئيسية الطالب: يومه الآن، ما عليه، جديده، ودرجاته
   ===================================================================== */

export type StudentHomeData = {
  today: string;
  dow: number;
  week: { label: string | null; no: number } | null;
  holiday: string | null;
  lessons: { id: number; period_no: number; starts_at: string | null; delivery_mode: string | null; subject: string; teacher: string | null }[];
  attendance: { total: number; absent: number; late: number; pct: number | null; intisab: boolean };
  behavior: { score: number; positive: number; negative: number };
  grades: { id: number; score: number; max_score: number; recorded_at: string; note: string | null; title: string; subject: string; assessment_id: number }[];
  content: { new: { id: number; kind: 'video' | 'enrichment'; title: string; url: string | null; minutes: number | null; subject: string; published_at: string }[]; unseen: number; total: number; completed: number };
  exams: { id: number; date: string; starts_at: string | null; period: string | null; subject: string }[];
  events: { event: string; starts_on: string; ends_on: string }[];
};

export function StudentDashboard({ first, classLabel, code, greet, date, data, items }: { first: string; classLabel: string; code: string; greet: string; date: { g: string; h: string }; data: StudentHomeData; items: StudentItem[] }) {
  const now = useNow();
  const { current, next, minsToNext } = nowNext(data.lessons, now);
  const t = now ?? Date.parse(`${data.today}T09:00:00+03:00`);
  const todo = items.filter((i) => ['todo', 'in_progress', 'late_open'].includes(studentState(i, t)));
  const dueSoon = todo.filter((i) => { const d = deadlineOf(i); return d && Date.parse(d) - t < 72 * 3600000; }).length;
  const done = items.filter((i) => ['submitted', 'graded'].includes(studentState(i, t))).length;
  const att = data.attendance;
  const weekLabel = data.week ? data.week.label ?? `الأسبوع ${data.week.no}` : null;

  return (
    <div className="space-y-5">
      <Hero
        eyebrow={greet}
        title={`أهلًا ${first} 👋`}
        lead={<>{classLabel} · {date.g} · {date.h}{weekLabel ? ` · ${weekLabel}` : ''}</>}
        aside={
          data.dow <= 4 && data.lessons.length > 0 ? (
            <div className="rounded-2xl bg-chalk/10 p-3.5 ring-1 ring-chalk/15 sm:min-w-64">
              {current ? (
                <>
                  <p className="flex items-center gap-1.5 text-xs text-gold"><span className="size-2 animate-pulse rounded-full bg-gold" /> الحصة الآن</p>
                  <p className="mt-0.5 text-lg font-bold">{current.subject}</p>
                  <p className="text-xs text-chalk/70">{current.teacher ?? ''}{current.delivery_mode ? ` · ${current.delivery_mode}` : ''}</p>
                </>
              ) : next ? (
                <>
                  <p className="text-xs text-chalk/70">الحصة التالية {minsToNext != null ? `· ${inMinutes(minsToNext)}` : ''}</p>
                  <p className="mt-0.5 text-lg font-bold">{next.subject}</p>
                  <p className="text-xs text-chalk/70">الحصة {next.period_no} · {fmtClock(next.starts_at)}</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-chalk/70">انتهت حصص اليوم</p>
                  <p className="mt-0.5 font-bold">{todo.length ? `عليك ${todo.length} مهمة` : 'أحسنت، لا شيء عليك ✓'}</p>
                </>
              )}
            </div>
          ) : null
        }
      >
        {data.holiday && <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gold/20 px-3 py-1 text-xs font-semibold text-gold"><Icon name="calendar" className="size-3.5" /> {data.holiday}</p>}
      </Hero>

      <DueReminders items={items} compact />

      <Tiles
        items={[
          { label: 'مهام عليّ', value: todo.length, icon: 'tasks', tone: todo.length ? 'gold' : 'ok', href: '/student/tasks', hint: todo.length ? (dueSoon ? `${dueSoon} تُغلق خلال 3 أيام` : 'لا شيء عاجل') : `أنجزت ${done} ✓` },
          att.intisab && att.pct == null
            ? { label: 'المواظبة', value: 0, icon: 'attendance', tone: 'sky', hint: 'طالب منتسب' }
            : { label: 'المواظبة', value: att.pct ?? 100, suffix: '%', icon: 'attendance', tone: (att.pct ?? 100) >= 90 ? 'ok' : (att.pct ?? 100) >= 75 ? 'gold' : 'danger', hint: att.total ? `${att.absent} غياب · ${att.late} تأخر` : 'لم يُسجَّل تحضير بعد' },
          { label: 'السلوك', value: Number(data.behavior.score), icon: 'behavior', tone: data.behavior.score >= 90 ? 'ok' : 'gold', hint: `${data.behavior.positive} إيجابي${data.behavior.negative ? ` · ${data.behavior.negative} ملاحظة` : ''}` },
          { label: 'جديد في المكتبة', value: data.content.unseen, icon: 'play', tone: data.content.unseen ? 'board' : 'ok', href: '/student/content', hint: `أكملت ${data.content.completed} من ${data.content.total}` },
        ]}
      />

      <QuickActions
        items={[
          { href: '/student/tasks', label: 'مهامي', icon: 'tasks' },
          { href: '/student/content', label: 'الفيديوهات', icon: 'play' },
          { href: '/student/timetable', label: 'جدولي', icon: 'timetable' },
          { href: '/student/exams', label: 'الاختبارات', icon: 'exams' },
          { href: '/student/results', label: 'نتائجي', icon: 'results' },
          { href: '/student/calendar', label: 'التقويم', icon: 'calendar' },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <Panel title="حصص اليوم" action={<MoreLink href="/student/timetable">جدولي</MoreLink>} pad={false}>
          {!data.lessons.length ? (
            <p className="px-5 pb-6 pt-2 text-sm text-muted">{data.dow > 4 ? 'لا دراسة اليوم، استمتع بإجازتك 🌿' : 'لا حصص اليوم.'}</p>
          ) : (
            <ol className="px-5 pb-4">
              {data.lessons.map((s, i) => {
                const live = current?.id === s.id;
                const past = !live && now != null && s.starts_at != null && next != null ? s.period_no < next.period_no : !live && !next && current == null && now != null;
                return (
                  <motion.li key={s.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex gap-3 pb-2 last:pb-0">
                    <span className="flex flex-col items-center">
                      <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold text-chalk ${live ? 'ring-4 ring-gold/30' : ''} ${past ? 'opacity-45' : ''}`} style={{ background: subjectColor(s.subject) }}>{s.period_no}</span>
                      {i < data.lessons.length - 1 && <span className="w-px flex-1 bg-line" />}
                    </span>
                    <div className={`mb-1 flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 ${live ? 'bg-gold/10' : ''} ${past ? 'opacity-60' : ''}`}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{s.subject}</span>
                        <span className="text-xs text-muted">{s.teacher ?? ''}{s.delivery_mode ? ` · ${s.delivery_mode}` : ''}</span>
                      </span>
                      {live ? <span className="shrink-0 rounded-full bg-gold px-2.5 py-1 text-xs font-bold text-ink">الآن</span> : <span className="shrink-0 text-xs text-muted">{fmtClock(s.starts_at)}</span>}
                    </div>
                  </motion.li>
                );
              })}
            </ol>
          )}
        </Panel>

        <Panel title="آخر درجاتي" action={<MoreLink href="/student/results">نتائجي</MoreLink>} pad={false}>
          {!data.grades.length ? (
            <p className="px-5 pb-6 pt-2 text-sm text-muted">لا درجات بعد.</p>
          ) : (
            <ul className="px-3 pb-3">
              {data.grades.map((g, i) => {
                const pct = Number(g.max_score) ? (Number(g.score) / Number(g.max_score)) * 100 : 0;
                const tone = pct >= 90 ? '#11734b' : pct >= 75 ? '#356854' : pct >= 60 ? '#d9a441' : '#b03a2e';
                return (
                  <li key={g.id} className="rounded-xl px-2.5 py-2">
                    <div className="flex items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{g.title}</span>
                        <span className="text-xs text-muted">{g.subject} · <TimeAgo iso={g.recorded_at} /></span>
                      </span>
                      <span className="shrink-0 font-bold tabular-nums" dir="ltr">{Number(g.score)}<span className="text-xs font-normal text-muted"> / {Number(g.max_score)}</span></span>
                    </div>
                    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-paper">
                      <motion.span className="block h-full rounded-full" style={{ background: tone }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, delay: 0.1 + i * 0.05 }} />
                    </span>
                    {g.note && <p className="mt-1 text-xs text-board">✎ {g.note}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {data.content.new.length > 0 && (
        <Panel title={<>جديد من معلميك <span className="text-sm font-normal text-muted">· {data.content.unseen} لم تشاهده</span></>} action={<MoreLink href="/student/content">المكتبة</MoreLink>}>
          <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-2 lg:grid-cols-4">
            {data.content.new.map((c) => (
              <Link key={c.id} href="/student/content" className="group w-56 shrink-0 snap-start overflow-hidden rounded-2xl border border-line transition-shadow hover:shadow-[0_14px_30px_-22px_rgb(31_42_36/0.7)] sm:w-auto">
                <MediaThumb kind={c.kind} url={c.url} subject={c.subject} minutes={c.minutes} className="aspect-video">
                  <span className="absolute start-2 top-2 rounded-full bg-gold px-2 py-0.5 text-[0.7rem] font-bold text-ink">جديد</span>
                </MediaThumb>
                <span className="block p-3">
                  <span className="block truncate text-sm font-bold group-hover:text-board">{c.title}</span>
                  <span className="text-xs text-muted">{c.subject} · <TimeAgo iso={c.published_at} /></span>
                </span>
              </Link>
            ))}
          </div>
        </Panel>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="اختباراتي القادمة" action={<MoreLink href="/student/exams">الجدول</MoreLink>} pad={false}>
          {!data.exams.length ? (
            <p className="px-5 pb-6 pt-2 text-sm text-muted">لا اختبارات خلال الأسابيع الثلاثة القادمة.</p>
          ) : (
            <ul className="px-3 pb-3">
              {data.exams.map((e) => (
                <li key={e.id} className="flex items-center gap-3 rounded-xl px-2.5 py-2">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl text-chalk" style={{ background: subjectColor(e.subject) }}><Icon name="exams" className="size-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{e.subject}</span>
                    <span className="text-xs text-muted">{fmtDay(e.date)}{e.starts_at ? ` · ${fmtClock(e.starts_at)}` : ''}{e.period ? ` · ${e.period}` : ''}</span>
                  </span>
                  <DaysLeft date={e.date} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="القادم في التقويم" action={<MoreLink href="/student/calendar">التقويم</MoreLink>} pad={false}>
          {!data.events.length ? (
            <p className="px-5 pb-6 pt-2 text-sm text-muted">لا مناسبات قادمة.</p>
          ) : (
            <ul className="px-3 pb-3">
              {data.events.map((e) => (
                <li key={e.starts_on + e.event} className="flex items-center gap-3 rounded-xl px-2.5 py-2">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brass-soft text-lg font-bold text-brass">{Number(e.starts_on.slice(8, 10))}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{e.event}</span>
                    <span className="text-xs text-muted">{fmtDay(e.starts_on)}</span>
                  </span>
                  <DaysLeft date={e.starts_on} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <p className="text-center text-xs text-muted">رقم الطالب <bdi>{code}</bdi></p>
    </div>
  );
}
