import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';
import { BehaviorApp } from '@/components/conduct/behavior-app';
import { getAuthorContext } from '@/lib/assess/queries';
import { behaviorBoard, recentBehavior } from '@/lib/conduct/actions';

export const metadata: Metadata = { title: 'السلوك' };

export default async function BehaviorPage() {
  const user = await requireUser(['admin', 'teacher']);
  const supabase = await createClient();
  const ctx = await getAuthorContext(user);
  const [statuses, board, recent] = await Promise.all([
    supabase.from('behavior_statuses').select('id, name').order('sort_order').order('id'),
    behaviorBoard(ctx.currentTerm),
    recentBehavior(25),
  ]);
  return (
    <>
      <PageHeader
        title="السلوك"
        lead={user.role === 'admin' ? 'كل طالب يبدأ من 100 في الفصل الدراسي: السلبي يُخصم، والإيجابي يُحتسب للتميز.' : 'سجّل سلوك طلاب فصولك. يبدأ كل طالب من 100، والسلبي يُخصم منه.'}
      />
      <BehaviorApp ctx={ctx} statuses={statuses.data ?? []} initialBoard={board} initialRecent={recent} myEmployeeId={user.employeeId} />
    </>
  );
}
