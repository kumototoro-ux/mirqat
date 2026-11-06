import Link from 'next/link';

/** ترقيم بروابط عادية (الصفحة في العنوان فتُحفظ وتُشارك) */
export function Pager({ total, page, size, href }: { total: number; page: number; size: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  const btn = 'rounded-lg border border-line bg-surface px-3 py-1.5 text-sm transition-colors hover:border-accent/40';
  return (
    <nav className="mt-4 flex items-center justify-between gap-3 text-sm" aria-label="الصفحات">
      {page > 1 ? <Link href={href(page - 1)} className={btn}>السابق</Link> : <span />}
      <span className="text-muted tabular-nums">صفحة {page} من {pages} · {total} نتيجة</span>
      {page < pages ? <Link href={href(page + 1)} className={btn}>التالي</Link> : <span />}
    </nav>
  );
}

/** يبني رابط الصفحة الحالية مع تعديل بعض المعاملات */
export function withParams(base: string, params: Record<string, string | number | undefined | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
