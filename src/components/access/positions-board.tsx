'use client';

import { useMemo, useState } from 'react';
import { Badge, Card } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { setPosition, type PositionBoard, type PositionEmployee } from '@/lib/access/actions';

const LEVEL = ['', 'عرض', 'تعديل', 'كامل'];

export function PositionsBoardView({ initial }: { initial: PositionBoard }) {
  const { toast, confirm } = useFeedback();
  const [emps, setEmps] = useState<PositionEmployee[]>(initial.employees);
  const [q, setQ] = useState('');
  const [onlyAssigned, setOnlyAssigned] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<number, { position: string; branch: string }>>({});

  const posName = (c: string) => initial.positions.find((p) => p.code === c)?.name ?? c;
  const branchName = (id: number) => initial.branches.find((b) => b.id === id)?.name ?? `فرع ${id}`;

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return emps.filter((e) => (!t || e.name.toLowerCase().includes(t) || e.code.toLowerCase().includes(t)) && (!onlyAssigned || e.assigned.length > 0));
  }, [emps, q, onlyAssigned]);

  const apply = async (e: PositionEmployee, position: string, branchId: number, on: boolean) => {
    if (!on) {
      const ok = await confirm({ title: `سحب منصب "${posName(position)}" من ${e.name}؟`, body: `في ${branchName(branchId)}. يسري السحب فورًا.`, confirmLabel: 'سحب', danger: true });
      if (!ok) return;
    }
    const id = `${e.id}:${position}:${branchId}`;
    setBusy(id);
    const res = await setPosition(e.id, position, branchId, on);
    setBusy(null);
    if (!res.ok) return toast(res.error, 'error');
    toast(res.message);
    setEmps((all) =>
      all.map((x) => {
        if (x.id !== e.id) return x;
        const rest = x.assigned.filter((a) => !(a.position === position && a.branchId === branchId));
        return { ...x, assigned: on ? [...rest, { position, branchId }] : rest };
      }),
    );
  };

  return (
    <div className="space-y-6">
      <Card title="ما يملكه كل منصب">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-start text-muted">
                <th className="py-2 text-start font-medium">المجال</th>
                {initial.positions.map((p) => (
                  <th key={p.code} className="px-2 py-2 text-start font-medium">{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {initial.areas.map((a) => (
                <tr key={a.area} className="border-t border-line">
                  <td className="py-2 font-medium">{a.name}</td>
                  {initial.positions.map((p) => {
                    const lv = p.caps.find((c) => c.area === a.area)?.level ?? 0;
                    return (
                      <td key={p.code} className="px-2 py-2">
                        {lv ? <Badge tone={lv === 3 ? 'ok' : lv === 2 ? 'gold' : 'neutral'}>{LEVEL[lv]}</Badge> : <span className="text-muted">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">صاحب المنصب يعمل داخل فرعه فقط. وتبقى مفاتيح المعلم (إنشاء الاختبارات وغيرها) في صفحة صلاحيات المعلمين.</p>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو الرقم" className="field max-w-xs" aria-label="بحث" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyAssigned} onChange={(e) => setOnlyAssigned(e.target.checked)} />
          أصحاب المناصب فقط
        </label>
        <span className="text-xs text-muted">{shown.length} موظف</span>
      </div>

      <ul className="space-y-3">
        {shown.map((e) => {
          const d = draft[e.id] ?? { position: initial.positions[0]?.code ?? '', branch: String(initial.branches[0]?.id ?? '') };
          return (
            <li key={e.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{e.name} <bdi className="text-xs font-normal text-muted">{e.code}</bdi></p>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {e.assigned.length === 0 && <span className="text-xs text-muted">بلا منصب</span>}
                {e.assigned.map((a) => (
                  <span key={`${a.position}:${a.branchId}`} className="inline-flex items-center gap-1.5 rounded-full bg-board/10 py-1 ps-3 pe-1 text-xs font-semibold text-board">
                    {posName(a.position)} · {branchName(a.branchId)}
                    <button
                      type="button"
                      aria-label={`سحب ${posName(a.position)}`}
                      disabled={busy === `${e.id}:${a.position}:${a.branchId}`}
                      onClick={() => apply(e, a.position, a.branchId, false)}
                      className="grid size-5 place-items-center rounded-full hover:bg-board/20 disabled:opacity-50"
                    >×</button>
                  </span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select aria-label="المنصب" className="field w-auto" value={d.position} onChange={(ev) => setDraft((s) => ({ ...s, [e.id]: { ...d, position: ev.target.value } }))}>
                  {initial.positions.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                </select>
                <select aria-label="الفرع" className="field w-auto" value={d.branch} onChange={(ev) => setDraft((s) => ({ ...s, [e.id]: { ...d, branch: ev.target.value } }))}>
                  {initial.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <button type="button" className="btn-quiet px-3 py-1.5 text-xs" disabled={!d.position || !d.branch || busy !== null} onClick={() => apply(e, d.position, Number(d.branch), true)}>
                  إسناد
                </button>
              </div>
            </li>
          );
        })}
        {shown.length === 0 && <li className="py-10 text-center text-sm text-muted">لا موظفين مطابقون</li>}
      </ul>
    </div>
  );
}
