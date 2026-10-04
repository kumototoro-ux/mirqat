'use client';

import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_COLORS } from '@/components/registry/insights';

const tip = { borderRadius: 12, border: '1px solid #dfe5e2', fontFamily: 'inherit', direction: 'rtl' as const, fontSize: 13 };

/** أعمدة متجاورة لعدة سلاسل (مثل: التسجيل والانسحاب لكل شهر) */
export function GroupedBars({ data, series, height = 260 }: { data: Record<string, string | number>[]; series: { key: string; label: string; color: string }[]; height?: number }) {
  return (
    <div style={{ height }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={4}>
          <CartesianGrid vertical={false} stroke="#e7ece9" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#5f6e66' }} reversed />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#5f6e66' }} orientation="right" />
          <Tooltip contentStyle={tip} cursor={{ fill: 'rgb(53 104 84 / 0.06)' }} />
          <Legend wrapperStyle={{ fontSize: 13, direction: 'rtl' }} iconType="circle" />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[6, 6, 0, 0]} maxBarSize={34} animationDuration={900} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** حلقة صغيرة لتوزيع واحد (الجنس، الرسوم، الحالة) */
export function MiniDonut({ items }: { items: { name: string; value: number }[] }) {
  const total = items.reduce((a, b) => a + b.value, 0);
  if (!total) return <p className="grid h-36 place-items-center text-sm text-muted">لا بيانات</p>;
  return (
    <div className="grid items-center gap-3 sm:grid-cols-[9rem_1fr]">
      <div className="mx-auto size-36">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={items} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="100%" paddingAngle={2} cornerRadius={5} stroke="none" animationDuration={900}>
              {items.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={tip} formatter={(v, n) => [`${v} (${Math.round((Number(v) / total) * 100)}%)`, String(n)]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-1.5 text-sm">
        {items.map((it, i) => (
          <li key={it.name} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate">{it.name}</span>
            <span className="font-semibold tabular-nums">{it.value}</span>
            <span className="w-10 text-end text-xs tabular-nums text-muted">{Math.round((it.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-primary h-11 rounded-xl px-4 print:hidden">
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 9V3.5h10V9M7 17H4.5V9h15v8H17" /><rect x="7" y="14" width="10" height="7" rx="1" /></svg>
      طباعة / حفظ PDF
    </button>
  );
}
