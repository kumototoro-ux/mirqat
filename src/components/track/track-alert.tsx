import Link from 'next/link';
import { Icon } from '@/components/shell/icons';

/** تنبيه رئيسية الإداري: مشاكل في آخر 24 ساعة تحتاج تدخله ولم تُعلَّم محلولة */
export function TrackAlert({ count, groups }: { count: number; groups: number }) {
  return (
    <Link href="/staff/audit" className="mb-4 flex items-center gap-3 rounded-2xl border border-danger/25 bg-danger-soft/60 px-4 py-3 text-sm transition hover:border-danger/50">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-danger text-chalk"><Icon name="flag" className="size-5" /></span>
      <span className="min-w-0 flex-1">
        <b className="text-danger">{groups === 1 ? 'مشكلة تحتاج تدخلك' : `${groups} مشاكل تحتاج تدخلك`}</b>
        <span className="block text-xs text-muted">حدثت {count} مرة في آخر 24 ساعة — كل واحدة مشروحة مع الحل في مركز التتبع.</span>
      </span>
      <Icon name="chevron" className="size-4 shrink-0 text-danger" />
    </Link>
  );
}
