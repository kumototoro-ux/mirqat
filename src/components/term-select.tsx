'use client';

import { useRouter } from 'next/navigation';
import { markSearchNav } from '@/components/shell/pending-search';

/** اختيار الفصل الدراسي داخل الصفحة: انتقال فوري مع هيكل تحميل بدل إعادة تحميل الصفحة كاملة */
export function TermSelect({ terms, value, param = 'term' }: { terms: { id: number; name: string; year: string }[]; value: number | null; param?: string }) {
  const router = useRouter();
  return (
    <select
      value={value ?? ''}
      aria-label="الفصل الدراسي"
      onChange={(e) => {
        const u = new URL(location.href);
        u.searchParams.set(param, e.target.value);
        const href = u.pathname + u.search;
        markSearchNav(href);
        router.push(href, { scroll: false });
      }}
      className="field w-auto py-1 text-sm"
    >
      {terms.map((t) => (
        <option key={t.id} value={t.id}>{t.name} {t.year}</option>
      ))}
    </select>
  );
}
