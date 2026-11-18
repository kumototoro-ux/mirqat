import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getPositionBoard } from '@/lib/access/actions';
import { getPermMatrix } from '@/lib/perms/actions';
import { PageHeader } from '@/components/ui';
import { RolesApp, type RolesTab } from '@/components/access/roles-app';

export const metadata: Metadata = { title: 'الأدوار والصلاحيات' };

const TABS: RolesTab[] = ['positions', 'holders', 'teachers'];

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireUser(['admin']);
  const { tab } = await searchParams;
  const [board, matrix] = await Promise.all([getPositionBoard(), getPermMatrix()]);
  return (
    <>
      <PageHeader
        title="الأدوار والصلاحيات"
        lead="أنشئ المناصب وعدّل ما يملكه كل منصب، وأسنده لموظف في فرع أو أكثر، وتحكّم بمفاتيح المعلمين. يعمل صاحب المنصب داخل فروعه المسندة فقط، والمنع يُفرض في قاعدة البيانات نفسها."
      />
      <RolesApp board={board} matrix={matrix} initialTab={TABS.includes(tab as RolesTab) ? (tab as RolesTab) : 'positions'} />
    </>
  );
}
