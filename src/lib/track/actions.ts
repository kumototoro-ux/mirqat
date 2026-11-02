'use server';

import { getCurrentUser, requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { track } from './server';

/* مركز التتبع — إجراءات المتصفح والإداري */

export type ClientEvent = { action: 'client.error' | 'perf.page'; message?: string; path?: string; duration_ms?: number; details?: Record<string, unknown> };

/** أخطاء المتصفح وبطء الصفحات عند المستخدم الفعلي (حد 5 أحداث لكل طلب، والقاعدة تمنع الإغراق) */
export async function reportClient(events: ClientEvent[]) {
  if (!Array.isArray(events)) return;
  const user = await getCurrentUser().catch(() => null);
  for (const e of events.slice(0, 5)) {
    if (e?.action !== 'client.error' && e?.action !== 'perf.page') continue;
    const details = Object.fromEntries(
      Object.entries(e.details ?? {}).slice(0, 10).map(([k, v]) => [k.slice(0, 30), typeof v === 'string' ? v.slice(0, 300) : typeof v === 'number' || typeof v === 'boolean' ? v : null]),
    );
    await track({
      action: e.action,
      severity: e.action === 'client.error' ? 'error' : 'warning',
      message: typeof e.message === 'string' ? e.message.slice(0, 800) : null,
      path: typeof e.path === 'string' ? e.path.slice(0, 300) : null,
      duration_ms: typeof e.duration_ms === 'number' && Number.isFinite(e.duration_ms) ? Math.min(e.duration_ms, 600000) : null,
      actor_id: user?.id ?? null,
      actor_name: user?.displayName ?? null,
      details,
    });
  }
}

/* ---------------------------------------------------------------------
   شاشة مركز التتبع (الإداري)
--------------------------------------------------------------------- */
export type TrackEventRow = {
  id: number; at: string; severity: string; kind: string; needs_action: boolean; action: string; fingerprint: string;
  actor_id: string | null; actor_name: string | null; actor_role: string | null; actor_code: string | null;
  path: string | null; message: string | null; code: string | null; duration_ms: number | null;
  details: Record<string, unknown>; ip: string | null; user_agent: string | null;
};
export type TrackGroup = {
  fingerprint: string; count: number; last_at: string; first_at: string; needs_action: boolean; people: string[]; people_n: number;
  resolved: boolean; resolved_at: string | null; resolved_by: string | null; note: string | null; sample: TrackEventRow;
};
export type TrackSummary = {
  counts: { needs_action: number; system: number; user: number; security: number; slow: number; config: number; total: number; people: number };
  groups: TrackGroup[];
  by_day: { day: string; problems: number; slow: number; security: number }[];
};
export type TrackFilters = { hours?: number; view?: string; kind?: string; q?: string; fingerprint?: string; actor_id?: string; page?: number; size?: number };
export type TimelineItem = {
  src: 'login' | 'change' | 'event'; at: string; action: string; kind: string | null; table_name: string | null; details: string | null; ip: string | null; id: number | null;
  ev: { message: string | null; code: string | null; path: string | null; duration_ms: number | null; details: Record<string, unknown> } | null;
};
export type Timeline = {
  user: { id: string; username: string; role: string; status: string; name: string; code: string | null };
  stats: { logins: number; failed_logins: number; changes: number; problems: number; last_seen: string | null };
  items: TimelineItem[];
};
export type Person = { id: string; name: string; code: string | null; role: string; problems: number; last_change: string | null };

export async function trackSummary(hours: number): Promise<TrackSummary | null> {
  await requireUser(['admin']);
  const { data } = await (await createClient()).rpc('track_summary', { p_hours: hours });
  return (data as TrackSummary | null) ?? null;
}

export async function trackEvents(f: TrackFilters): Promise<{ total: number; rows: TrackEventRow[] }> {
  await requireUser(['admin']);
  const { data } = await (await createClient()).rpc('track_events', { p: f });
  return (data as { total: number; rows: TrackEventRow[] } | null) ?? { total: 0, rows: [] };
}

export async function trackTimeline(actor: string, days: number): Promise<Timeline | null> {
  await requireUser(['admin']);
  const { data } = await (await createClient()).rpc('track_timeline', { p_actor: actor, p_days: days });
  return (data as Timeline | null) ?? null;
}

export async function trackPeople(q: string): Promise<Person[]> {
  await requireUser(['admin']);
  const { data } = await (await createClient()).rpc('track_people', { p_q: q.slice(0, 40) || null });
  return (data as Person[] | null) ?? [];
}

export async function trackResolve(fingerprint: string, resolved: boolean, note?: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  await requireUser(['admin']);
  const { error } = await (await createClient()).rpc('track_resolve', { p_fingerprint: fingerprint, p_resolved: resolved, p_note: note ?? null });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: resolved ? 'عُلّمت كمحلولة — تعود تلقائيًا إن تكررت' : 'أُعيد فتح المشكلة' };
}
