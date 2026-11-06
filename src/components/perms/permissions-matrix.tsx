'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { setPermission, type PermMatrix, type PermRow } from '@/lib/perms/actions';
import type { PermKey } from '@/lib/perms/keys';

/** مفتاح يعمل بضغطة: يعكس القيمة الفعلية، وإن وافقت الافتراضي يُحذف الاستثناء فيبقى الجدول نظيفًا */
function Switch({ on, busy, label, onClick }: { on: boolean; busy: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-board disabled:opacity-50 ${on ? 'bg-board' : 'bg-line'}`}
    >
      <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${on ? '-translate-x-5' : '-translate-x-0.5'}`} />
    </button>
  );
}

export function PermissionsMatrix({ initial }: { initial: PermMatrix }) {
  const { toast } = useFeedback();
  const [rows, setRows] = useState<PermRow[]>(initial.rows);
  const [q, setQ] = useState('');
  const [onlyCustom, setOnlyCustom] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const keys = initial.keys;
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => (!term || r.name.toLowerCase().includes(term) || r.code.toLowerCase().includes(term)) && (!onlyCustom || Object.keys(r.overrides).length > 0));
  }, [rows, q, onlyCustom]);

  const effective = (r: PermRow, k: PermKey, def: boolean) => r.overrides[k] ?? def;

  const toggle = async (r: PermRow, k: PermKey, def: boolean) => {
    const next = !effective(r, k, def);
    const send: boolean | null = next === def ? null : next;   // يوافق الافتراضي = لا استثناء
    const id = `${r.id}:${k}`;
    setBusy(id);
    const res = await setPermission(r.id, k, send);
    setBusy(null);
    if (!res.ok) return toast(res.error, 'error');
    setRows((all) =>
      all.map((x) => {
        if (x.id !== r.id) return x;
        const o = { ...x.overrides };
        if (send === null) delete o[k];
        else o[k] = send;
        return { ...x, overrides: o };
      }),
    );
    toast(res.message);
  };

  const customCount = rows.filter((r) => Object.keys(r.overrides).length > 0).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث بالاسم أو الرمز"
          className="field h-11 w-full max-w-xs"
          aria-label="بحث عن معلم"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyCustom} onChange={(e) => setOnlyCustom(e.target.checked)} className="size-4 accent-board" />
          من لديهم استثناءات فقط <Badge>{customCount}</Badge>
        </label>
        <span className="text-xs text-muted">{shown.length} من {rows.length} موظف</span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-paper/70 text-xs text-muted">
            <tr>
              <th className="sticky start-0 z-10 bg-paper px-4 py-3 text-start font-semibold">المعلم</th>
              {keys.map((k) => (
                <th key={k.key} className="px-3 py-3 text-center font-semibold" title={k.hint ?? undefined}>
                  <span className="block leading-snug">{k.name}</span>
                  <span className="mt-1 block font-normal text-[11px]">افتراضيًا: {k.teacherDefault ? 'مفتوح' : 'مغلق'}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((r) => (
              <tr key={r.id} className="hover:bg-paper/40">
                <td className="sticky start-0 z-10 bg-surface px-4 py-3">
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-xs text-muted"><bdi>{r.code}</bdi>{!r.hasAccount && ' · بلا حساب بعد'}</p>
                </td>
                {keys.map((k) => {
                  const on = effective(r, k.key, k.teacherDefault);
                  const custom = r.overrides[k.key] !== undefined;
                  return (
                    <td key={k.key} className="px-3 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <Switch on={on} busy={busy === `${r.id}:${k.key}`} label={`${k.name} — ${r.name}`} onClick={() => toggle(r, k.key, k.teacherDefault)} />
                        {custom && <span className="text-[11px] font-medium text-brass">مخصّص</span>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={keys.length + 1} className="px-4 py-10 text-center text-muted">لا نتائج مطابقة</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">«مخصّص» يعني أن قيمة هذا المعلم تخالف الافتراضي. إعادة المفتاح إلى الافتراضي تزيل التخصيص. كل منح وسحب يظهر في سجل النشاط.</p>
    </div>
  );
}
