'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/components/shell/icons';
import { findStudents, studentsByIds, type StudentHit } from '@/lib/results/actions';

/** اختيار طالب أو أكثر بالبحث (الاسم أو الرقم أو الهوية) */
export function StudentPicker({ value, onChange, single, classLabel }: { value: number[]; onChange: (ids: number[]) => void; single?: boolean; classLabel: (id: number | null) => string }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [known, setKnown] = useState<Record<number, StudentHit>>({});
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 280);
    return () => clearTimeout(t);
  }, [q]);
  const hits = useQuery({ queryKey: ['find-students', debounced], queryFn: () => findStudents(debounced), enabled: debounced.trim().length >= 2 });
  const missing = value.filter((id) => !known[id]);
  const loaded = useQuery({ queryKey: ['students-by-ids', missing.join()], queryFn: () => studentsByIds(missing), enabled: missing.length > 0 });
  useEffect(() => {
    if (loaded.data?.length) setKnown((k) => ({ ...k, ...Object.fromEntries(loaded.data.map((s) => [s.id, s])) }));
  }, [loaded.data]);

  const add = (s: StudentHit) => {
    setKnown((k) => ({ ...k, [s.id]: s }));
    onChange(single ? [s.id] : value.includes(s.id) ? value : [...value, s.id]);
    setQ('');
  };

  return (
    <div className="rounded-xl border border-line p-2.5">
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((id) => (
            <span key={id} className="inline-flex items-center gap-1.5 rounded-full bg-board px-3 py-1.5 text-sm text-chalk">
              {known[id]?.name_ar ?? '…'}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== id))} aria-label="إزالة" className="grid size-4 place-items-center rounded-full bg-chalk/20">
                <Icon name="close" className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {(!single || !value.length) && (
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو رقم الطالب أو الهوية" className="field py-2 ps-9" />
          {debounced.trim().length >= 2 && (
            <ul className="mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-line bg-surface">
              {hits.isFetching && !hits.data && <li className="px-3 py-2.5 text-sm text-muted">جارٍ البحث…</li>}
              {hits.data?.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => add(s)} className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-paper">
                    <span className="min-w-0 flex-1 truncate font-medium">{s.name_ar}</span>
                    <span className="shrink-0 text-xs text-muted">{classLabel(s.class_id)}</span>
                    <bdi className="shrink-0 text-xs text-muted">{s.code}</bdi>
                    {value.includes(s.id) && <Icon name="check" className="size-4 text-ok" />}
                  </button>
                </li>
              ))}
              {hits.data && !hits.data.length && <li className="px-3 py-2.5 text-sm text-muted">لا نتائج</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
