'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** اختيار الفرع: يحدّث ?branch= ويصفّر الصفحة والباقي يبقى */
export function BranchSwitch({ branches, value }: { branches: { id: number; name: string }[]; value: number }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  if (branches.length < 2) return <span className="rounded-full bg-board/10 px-3 py-1 text-sm font-semibold text-board">{branches[0]?.name}</span>;
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="text-muted">الفرع</span>
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(sp.toString());
          next.set('branch', e.target.value);
          next.delete('page');
          next.delete('teacher');
          router.push(`${path}?${next.toString()}`);
        }}
        className="rounded-xl border border-line bg-surface px-3 py-1.5 font-semibold focus:outline-none focus:ring-2 focus:ring-board/30"
      >
        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </label>
  );
}
