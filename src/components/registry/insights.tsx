'use client';

import { motion } from 'motion/react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Icon, type IconName } from '@/components/shell/icons';

export type Stat = {
  label: string;
  value: number | string;
  icon: IconName;
  hint?: string;
  /** التغير عن الشهر الماضي: الرقم الحالي والسابق، وهل الصعود جيد */
  delta?: { now: number; before: number; upIsGood?: boolean };
  tone?: 'gold' | 'danger';
};

export type Slice = { name: string; value: number };

// ألوان متناسقة مع الهوية: درجات الأخضر ثم الذهبي
export const CHART_COLORS = ['#356854', '#d9a441', '#5d9478', '#8a6116', '#9cc3ad', '#2a6f8a', '#c9dccf', '#a3462f'];

function Delta({ now, before, upIsGood = true }: NonNullable<Stat['delta']>) {
  if (!before && !now) return <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold text-muted">—</span>;
  const pct = before ? Math.round(((now - before) / before) * 100) : 100;
  const up = now >= before;
  const good = up === upIsGood;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${good ? 'bg-ok text-chalk' : 'bg-danger-soft text-danger'}`} dir="ltr">
      <svg viewBox="0 0 10 10" className={`size-2.5 ${up ? '' : 'rotate-180'}`}><path d="M5 2 9 7H1z" fill="currentColor" /></svg>
      {pct > 0 ? '+' : ''}{pct}%
    </span>
  );
}

export function Insights({ stats, donut }: { stats: Stat[]; donut: { title: string; caption: string; items: Slice[]; unit: string } }) {
  const total = donut.items.reduce((a, b) => a + b.value, 0);
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)]">
      {stats.map((s, i) => {
        const featured = i === 0;
        return (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -3 }}
            className={`relative overflow-hidden rounded-[1.4rem] border p-4 sm:p-5 ${
              featured ? 'border-board/15 bg-gradient-to-br from-[#dcebe2] to-[#eef5f0]' : 'border-line bg-surface'
            } ${i < 2 ? 'lg:row-start-1' : 'lg:row-start-2'} ${i % 2 === 0 ? 'lg:col-start-1' : 'lg:col-start-2'}`}
          >
            <p className="flex items-center gap-2 text-xs font-medium text-muted sm:text-sm">
              <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${featured ? 'bg-board text-chalk' : 'bg-board/10 text-board'}`}>
                <Icon name={s.icon} className="size-[1.1rem]" />
              </span>
              <span className="truncate">{s.label}</span>
            </p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-2 sm:mt-4">
              <p className={`text-[1.75rem] sm:text-[2.1rem] font-bold leading-none tabular-nums ${s.tone === 'gold' ? 'text-brass' : s.tone === 'danger' ? 'text-danger' : 'text-ink'}`}>{s.value}</p>
              {s.delta && (
                <span className="flex flex-col items-end gap-1">
                  <Delta {...s.delta} />
                  <span className="hidden text-[0.7rem] text-muted sm:block">عن الشهر الماضي</span>
                </span>
              )}
            </div>
            {s.hint && <p className="mt-2 truncate text-xs text-muted">{s.hint}</p>}
          </motion.div>
        );
      })}

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="col-span-2 rounded-[1.4rem] border border-line bg-surface p-5 lg:col-span-1 lg:col-start-3 lg:row-span-2 lg:row-start-1"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-bold">{donut.title}</h3>
            <p className="text-xs text-muted">{donut.caption}</p>
          </div>
          <span className="rounded-full bg-board/10 px-2.5 py-1 text-xs font-semibold text-board">{total} {donut.unit}</span>
        </div>
        {total === 0 ? (
          <p className="grid h-40 place-items-center text-sm text-muted">لا بيانات بعد</p>
        ) : (
          <div className="mt-3 grid items-center gap-5 sm:grid-cols-[10rem_1fr] lg:grid-cols-1 2xl:grid-cols-[9rem_1fr]">
            <div className="relative mx-auto size-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donut.items} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="100%" paddingAngle={2.5} cornerRadius={6} stroke="none" isAnimationActive animationDuration={900}>
                    {donut.items.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v, n) => [`${v} (${Math.round((Number(v) / total) * 100)}%)`, String(n)]}
                    contentStyle={{ borderRadius: 12, border: '1px solid #dfe5e2', fontFamily: 'inherit', direction: 'rtl', fontSize: 13 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <span>
                  <span className="block text-2xl font-bold tabular-nums">{total}</span>
                  <span className="text-[0.7rem] text-muted">{donut.unit}</span>
                </span>
              </div>
            </div>
            <ul className="grid gap-2.5 sm:grid-cols-1">
              {donut.items.slice(0, 6).map((it, i) => (
                <li key={it.name} className="flex items-center gap-2.5 text-sm">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="min-w-0 flex-1 leading-snug">{it.name}</span>
                  <span className="font-semibold tabular-nums">{it.value}</span>
                  <span className="w-11 text-end text-xs tabular-nums text-muted">{total ? Math.round((it.value / total) * 100) : 0}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </motion.div>
    </div>
  );
}
