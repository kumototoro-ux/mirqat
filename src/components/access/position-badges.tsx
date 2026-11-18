import type { PosBadge } from '@/lib/access/position-badges';

/** مناصب الموظف بشارات: مدير المدرسة داكنة، ومناصب الفرع خضراء فاتحة، مع نطاقها */
export function PositionBadges({ items, compact = false }: { items: PosBadge[]; compact?: boolean }) {
  if (!items.length) return <span className="text-xs text-muted">بلا منصب</span>;
  return (
    <div className="flex max-w-64 flex-wrap gap-1">
      {items.map((p) => {
        const where = p.all ? 'كل الفروع' : p.branches.join('، ');
        return (
          <span
            key={p.code}
            title={`${p.name} · ${where}`}
            className={`inline-flex max-w-full items-center gap-1 truncate rounded-full px-2.5 py-0.5 text-xs font-semibold ${p.tier === 'school' ? 'bg-board text-chalk' : 'bg-accent/10 text-accent'}`}
          >
            {p.name}
            {!compact && <span className="truncate font-normal opacity-80">· {where}</span>}
          </span>
        );
      })}
    </div>
  );
}
