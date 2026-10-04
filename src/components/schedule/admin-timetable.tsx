'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { Insights } from '@/components/registry/insights';
import { Icon } from '@/components/shell/icons';
import { DAYS } from '@/lib/format';
import type { ViewSlot } from '@/lib/schedule/view';
import { WeekTimetable } from './week-view';

/**
 * جدول الحصص للإدارة: كل الحصص محمّلة مرة واحدة، والتبديل بين الفصول والمعلمين فوري.
 * مع مؤشرات: تغطية الفصول، حصص بلا معلم، تعارض معلم في حصتين بنفس الوقت، ونصاب كل معلم.
 */
export function AdminTimetable({ slots, classes }: { slots: ViewSlot[]; classes: { id: number; label: string }[] }) {
  const [mode, setMode] = useState<'class' | 'teacher'>('class');
  const classIds = useMemo(() => [...new Set(slots.map((s) => s.classId))], [slots]);
  const teachers = useMemo(() => {
    const m = new Map<number, { id: number; name: string; periods: number; classes: Set<number> }>();
    for (const s of slots)
      if (s.teacherId) {
        const t = m.get(s.teacherId) ?? { id: s.teacherId, name: s.teacher ?? '—', periods: 0, classes: new Set<number>() };
        t.periods++;
        t.classes.add(s.classId);
        m.set(s.teacherId, t);
      }
    return [...m.values()].sort((a, b) => b.periods - a.periods);
  }, [slots]);
  const [classId, setClassId] = useState<number>(classes.find((c) => classIds.includes(c.id))?.id ?? classes[0]?.id ?? 0);
  const [teacherId, setTeacherId] = useState<number>(teachers[0]?.id ?? 0);

  const noTeacher = slots.filter((s) => !s.teacherId);
  const conflicts = useMemo(() => {
    const seen = new Map<string, ViewSlot[]>();
    for (const s of slots) if (s.teacherId) {
      const k = `${s.teacherId}-${s.day}-${s.period}`;
      seen.set(k, [...(seen.get(k) ?? []), s]);
    }
    return [...seen.values()].filter((g) => new Set(g.map((x) => x.classId)).size > 1);
  }, [slots]);
  const shown = mode === 'class' ? slots.filter((s) => s.classId === classId) : slots.filter((s) => s.teacherId === teacherId);
  const busiest = teachers[0];

  return (
    <>
      <Insights
        stats={[
          { label: 'حصص أسبوعية', value: slots.length, icon: 'timetable', hint: `${teachers.length} معلم` },
          { label: 'فصول لها جدول', value: classIds.length, icon: 'students', hint: `من ${classes.length} فصل`, tone: classIds.length < classes.length ? 'gold' : undefined },
          { label: 'حصص بلا معلم', value: noTeacher.length, icon: 'user', tone: noTeacher.length ? 'danger' : undefined },
          { label: 'تعارضات معلمين', value: conflicts.length, icon: 'close', tone: conflicts.length ? 'danger' : undefined, hint: conflicts.length ? 'معلم في فصلين بنفس الحصة' : 'لا تعارض' },
        ]}
        donut={{
          title: 'نصاب المعلمين',
          caption: busiest ? `الأعلى: ${busiest.name}` : 'حصص كل معلم أسبوعيًا',
          unit: 'حصة',
          items: teachers.slice(0, 6).map((t) => ({ name: t.name, value: t.periods })),
        }}
      />

      {conflicts.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-5 rounded-2xl border border-danger/30 bg-danger-soft/60 p-4">
          <p className="flex items-center gap-2 font-semibold text-danger"><Icon name="close" className="size-4" /> تعارضات تحتاج تصحيحًا</p>
          <ul className="mt-2 space-y-1 text-sm">
            {conflicts.slice(0, 6).map((g) => (
              <li key={g.map((x) => x.id).join()}>
                <b>{g[0].teacher}</b> · {DAYS[g[0].day]} الحصة {g[0].period}: {g.map((x) => x.classLabel).join(' و ')}
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      <section className="rounded-[1.4rem] border border-line bg-surface p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <LayoutGroup id="tt-mode">
            <div className="flex rounded-xl bg-paper p-1">
              {(['class', 'teacher'] as const).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} className="relative rounded-lg px-4 py-2 text-sm font-semibold">
                  {mode === m && <motion.span layoutId="tt-mode-pill" className="absolute inset-0 rounded-lg bg-surface shadow-sm" transition={{ type: 'spring', stiffness: 480, damping: 36 }} />}
                  <span className={`relative ${mode === m ? 'text-board' : 'text-muted'}`}>{m === 'class' ? 'حسب الفصل' : 'حسب المعلم'}</span>
                </button>
              ))}
            </div>
          </LayoutGroup>
          {mode === 'class' ? (
            <select value={classId} onChange={(e) => setClassId(Number(e.target.value))} className="field h-11 min-w-0 flex-1 py-2 sm:max-w-sm" aria-label="الفصل">
              {classes.map((c) => <option key={c.id} value={c.id}>{c.label}{classIds.includes(c.id) ? '' : ' (بلا جدول)'}</option>)}
            </select>
          ) : (
            <select value={teacherId} onChange={(e) => setTeacherId(Number(e.target.value))} className="field h-11 min-w-0 flex-1 py-2 sm:max-w-sm" aria-label="المعلم">
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.periods} حصة</option>)}
            </select>
          )}
          <Link href="/staff/settings?s=timetable" className="btn h-11 rounded-xl border border-line bg-surface px-3.5 hover:border-board/40 hover:text-board sm:ms-auto">
            <Icon name="edit" className="size-4" /> تعديل الجدول
          </Link>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${mode}-${mode === 'class' ? classId : teacherId}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {shown.length ? (
              <WeekTimetable slots={shown} secondary={mode === 'class' ? 'teacher' : 'class'} />
            ) : (
              <p className="rounded-2xl border border-dashed border-line py-14 text-center text-muted">لا حصص لهذا {mode === 'class' ? 'الفصل' : 'المعلم'} بعد</p>
            )}
          </motion.div>
        </AnimatePresence>
      </section>
    </>
  );
}
