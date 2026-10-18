'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '@/components/shell/icons';
import { Badge } from '@/components/ui';
import { subjectColor } from '@/components/timetable-grid';
import { STATE_META, canRetry, deadlineOf, studentState, type StudentItem, type StudentState } from '@/lib/assess/student';
import { relTime } from '@/lib/assess/shared';

type Tab = 'todo' | 'done' | 'missed' | 'all';
const TODO: StudentState[] = ['todo', 'in_progress', 'late_open', 'upcoming'];
const DONE: StudentState[] = ['submitted', 'graded', 'classwork'];

function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** تذكير بما يُغلق قريبًا ولم يُسلَّم بعد */
export function DueReminders({ items, compact }: { items: StudentItem[]; compact?: boolean }) {
  const now = useNow();
  const soon = items
    .filter((i) => ['todo', 'in_progress', 'late_open'].includes(studentState(i, now)))
    .filter((i) => {
      const d = deadlineOf(i);
      return d && new Date(d).getTime() - now < 48 * 3600000 && new Date(d).getTime() > now;
    })
    .sort((a, b) => new Date(deadlineOf(a)!).getTime() - new Date(deadlineOf(b)!).getTime());
  if (!soon.length) return null;
  return (
    <motion.section initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className={`overflow-hidden rounded-[1.4rem] border border-gold/50 bg-gradient-to-br from-[#fbf3e1] to-[#f6e7c4] ${compact ? 'mb-5' : 'mb-6'}`}>
      <p className="flex items-center gap-2 px-4 pt-3.5 text-sm font-bold text-brass">
        <span className="relative grid size-7 place-items-center rounded-full bg-gold text-white">
          <Icon name="clock" className="size-4" />
          <span className="absolute inset-0 animate-ping rounded-full bg-gold/50" />
        </span>
        تذكير: {soon.length === 1 ? 'مهمة تُغلق قريبًا ولم تسلّمها' : `${soon.length} تُغلق قريبًا ولم تسلّمها`}
      </p>
      <ul className="space-y-1.5 p-3">
        {soon.slice(0, compact ? 3 : 6).map((i) => {
          const hrs = (new Date(deadlineOf(i)!).getTime() - now) / 3600000;
          return (
            <li key={i.id}>
              <Link href={`/student/tasks/${i.id}`} className="flex items-center gap-3 rounded-xl bg-white/75 px-3 py-2.5 transition-colors hover:bg-white">
                <Icon name={i.kind === 'form' ? 'forms' : 'tasks'} className="size-5 shrink-0 text-brass" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{i.title}</span>
                  <span className="text-xs text-muted">{i.subject}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${hrs < 3 ? 'bg-danger text-chalk' : 'bg-gold/25 text-brass'}`}>يُغلق {relTime(deadlineOf(i), now)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </motion.section>
  );
}

export function StudentAssessments({ items }: { items: StudentItem[] }) {
  const now = useNow();
  const withState = useMemo(() => items.map((i) => ({ i, s: studentState(i, now) })), [items, now]);
  const counts = {
    todo: withState.filter((x) => TODO.includes(x.s)).length,
    done: withState.filter((x) => DONE.includes(x.s)).length,
    missed: withState.filter((x) => x.s === 'missed').length,
    all: withState.length,
  };
  const [tab, setTab] = useState<Tab>(counts.todo ? 'todo' : 'all');
  const [kind, setKind] = useState<'' | 'task' | 'form'>('');
  const list = withState
    .filter((x) => (tab === 'todo' ? TODO.includes(x.s) : tab === 'done' ? DONE.includes(x.s) : tab === 'missed' ? x.s === 'missed' : true))
    .filter((x) => !kind || x.i.kind === kind)
    .sort((a, b) => {
      if (tab !== 'todo') return 0;
      const da = deadlineOf(a.i) ? new Date(deadlineOf(a.i)!).getTime() : Infinity;
      const db = deadlineOf(b.i) ? new Date(deadlineOf(b.i)!).getTime() : Infinity;
      return da - db;
    });

  return (
    <>
      <DueReminders items={items} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex w-full rounded-2xl border border-line bg-surface p-1 sm:inline-flex sm:w-auto" role="tablist">
          {(
            [
              ['todo', 'المطلوب'],
              ['done', 'المسلّمة'],
              ['missed', 'الفائتة'],
              ['all', 'الكل'],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-sm font-semibold transition-colors sm:flex-none sm:px-3.5 ${tab === k ? 'text-chalk' : 'text-muted hover:text-ink'}`}>
              {tab === k && <motion.span layoutId="st-tab" className="absolute inset-0 rounded-xl bg-board" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
              <span className="relative">{label}</span>
              {counts[k] > 0 && <span className={`relative rounded-full px-1.5 text-[0.7rem] tabular-nums ${tab === k ? 'bg-chalk/20' : k === 'todo' ? 'bg-gold/30 text-brass' : 'bg-paper'}`}>{counts[k]}</span>}
            </button>
          ))}
        </div>
        <div className="ms-auto flex gap-1">
          {([['', 'الكل'], ['task', 'مهام'], ['form', 'نماذج']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setKind(k)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${kind === k ? 'bg-ink text-chalk' : 'bg-surface text-muted ring-1 ring-line'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="grid place-items-center rounded-[1.4rem] border border-line bg-surface px-6 py-16 text-center">
          <span className="grid size-16 place-items-center rounded-2xl bg-ok-soft text-ok"><Icon name={tab === 'todo' ? 'check' : 'tasks'} className="size-8" /></span>
          <p className="mt-4 text-lg font-semibold">{tab === 'todo' ? 'لا شيء مطلوب منك الآن' : 'لا شيء هنا'}</p>
          {tab === 'todo' && <p className="mt-1 text-sm text-muted">أحسنت! كل مهامك مسلّمة.</p>}
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          <AnimatePresence initial={false}>
            {list.map(({ i, s }, n) => (
              <motion.li key={i.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: Math.min(n, 10) * 0.03, duration: 0.3 }}>
                <ItemCard i={i} s={s} now={now} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </>
  );
}

function ItemCard({ i, s, now }: { i: StudentItem; s: StudentState; now: number }) {
  const m = STATE_META[s];
  const d = deadlineOf(i);
  const urgent = d && ['todo', 'in_progress'].includes(s) && new Date(d).getTime() - now < 24 * 3600000;
  const pct = i.grade ? Math.round((Number(i.grade.score) / Number(i.grade.max_score)) * 100) : null;
  return (
    <Link
      href={`/student/tasks/${i.id}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-[1.4rem] border border-line bg-surface p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-board/30 hover:shadow-[0_18px_40px_-28px_rgb(31_42_36/0.6)]"
    >
      <span className="absolute inset-y-0 start-0 w-1.5" style={{ background: subjectColor(i.subject ?? '') }} />
      <div className="flex items-start gap-3 ps-1">
        <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${i.kind === 'form' ? 'bg-brass-soft text-brass' : 'bg-board/10 text-board'}`}>
          <Icon name={i.kind === 'form' ? 'forms' : 'tasks'} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-snug">{i.title}</p>
          <p className="mt-0.5 text-sm text-muted">
            {i.subject}
            {i.eval_type ? ` · ${i.eval_type}` : ''}
          </p>
        </div>
        {pct != null ? (
          <span className={`shrink-0 rounded-xl px-2.5 py-1 text-sm font-bold tabular-nums ${i.grade?.source === 'auto_absent' ? 'bg-danger-soft text-danger' : pct >= 85 ? 'bg-ok-soft text-ok' : pct >= 50 ? 'bg-board/10 text-board' : 'bg-danger-soft text-danger'}`} dir="ltr">
            {Number(i.grade!.score)} / {Number(i.grade!.max_score)}
          </span>
        ) : (
          <Badge tone={m.tone}>{m.label}</Badge>
        )}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 ps-1 text-xs text-muted">
        {i.kind === 'form' && (
          <span className="inline-flex items-center gap-1">
            <Icon name="forms" className="size-3.5" /> {i.questions} سؤال{i.time_limit_minutes ? ` · ${i.time_limit_minutes} دقيقة` : ''}
          </span>
        )}
        {s === 'upcoming' && i.opens_at && <span>يُفتح {relTime(i.opens_at, now)}</span>}
        {d && !['graded', 'submitted', 'missed'].includes(s) && (
          <span className={`inline-flex items-center gap-1 ${urgent ? 'font-bold text-danger' : ''}`}>
            <Icon name="clock" className="size-3.5" /> {s === 'late_open' ? `انتهى ${relTime(d, now)}` : `يُغلق ${relTime(d, now)}`}
          </span>
        )}
        {s === 'submitted' && <span className="text-board">بانتظار التصحيح</span>}
        {canRetry(i, now) && <span className="font-semibold text-board">يمكنك محاولة أخرى</span>}
        {i.grade?.source === 'auto_absent' && <span className="text-danger">صفر لعدم الحل</span>}
        {i.submission?.feedback && <span className="inline-flex items-center gap-1 text-board"><Icon name="edit" className="size-3.5" /> ملاحظة من المعلم</span>}
        <span className="ms-auto inline-flex items-center gap-1 font-semibold text-board opacity-0 transition-opacity group-hover:opacity-100">
          فتح <Icon name="chevron" className="size-3.5" />
        </span>
      </div>
    </Link>
  );
}
