import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Tabs } from '@/components/ui';
import { TrackCenter } from '@/components/track/track-center';
import { PeopleTimeline } from '@/components/track/people-timeline';
import { trackEvents, trackPeople, trackSummary, trackTimeline } from '@/lib/track/actions';
import { listAudit } from './actions';
import { AuditRegistry, type ActivityReport } from './audit-registry';

export const metadata: Metadata = { title: 'سجل النشاط' };

/**
 * سجل النشاط بثلاثة تبويبات:
 *  - مركز التتبع: كل مشكلة مشروحة (ماذا حدث، لماذا، ما الحل) مع التجميع و«تم الحل»
 *  - سجل التغييرات: كل إضافة وتعديل وحذف على البيانات (من مشغّلات القاعدة)
 *  - نشاط مستخدم: خط زمني لشخص واحد يجمع دخوله وتعديلاته ومشاكله
 */
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ tab?: string; user?: string }> }) {
  await requireUser(['admin']);
  const { tab, user } = await searchParams;
  const active = tab === 'changes' ? 'changes' : tab === 'people' ? 'people' : 'track';
  const uid = user && /^[0-9a-f-]{36}$/i.test(user) ? user : null;

  const summary = await trackSummary(24);
  const tabs = [
    { key: 'track', label: 'مركز التتبع', href: '/staff/audit', count: summary?.counts.needs_action || undefined },
    { key: 'changes', label: 'سجل التغييرات', href: '/staff/audit?tab=changes' },
    { key: 'people', label: 'نشاط مستخدم', href: '/staff/audit?tab=people' },
  ];

  let body: React.ReactNode;
  if (active === 'changes') {
    const supabase = await createClient();
    const initialParams = { page: 1, size: 15, q: '', sort: 'newest', filters: {} };
    const [first, report] = await Promise.all([listAudit(initialParams), supabase.rpc('report_activity')]);
    body = <AuditRegistry initial={first} initialParams={initialParams} report={(report.data ?? null) as ActivityReport | null} />;
  } else if (active === 'people') {
    const [people, timeline] = await Promise.all([trackPeople(''), uid ? trackTimeline(uid, 7) : Promise.resolve(null)]);
    body = <PeopleTimeline key={uid ?? 'none'} initialUser={uid} initialTimeline={timeline} initialPeople={people} />;
  } else {
    const events = await trackEvents({ hours: 24, view: 'problems', page: 1, size: 30 });
    body = <TrackCenter initialSummary={summary} initialEvents={events} />;
  }

  return (
    <>
      <Tabs items={tabs} active={active} />
      {body}
    </>
  );
}
