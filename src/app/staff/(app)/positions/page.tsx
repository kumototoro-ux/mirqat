import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getPositionBoard } from '@/lib/access/actions';
import { PageHeader } from '@/components/ui';
import { PositionsBoardView } from '@/components/access/positions-board';

export const metadata: Metadata = { title: 'مناصب الفروع' };

export default async function PositionsPage() {
  await requireUser(['admin']);
  const board = await getPositionBoard();
  return (
    <>
      <PageHeader
        title="مناصب الفروع"
        lead="أسند لموظف منصب مدير فرع أو وكيل أو مشرف أو مسؤول قبول في فرع بعينه، واسحبه متى شئت. يعمل صاحب المنصب داخل فرعه فقط، والمنع يُفرض في قاعدة البيانات نفسها."
      />
      <PositionsBoardView initial={board} />
    </>
  );
}
