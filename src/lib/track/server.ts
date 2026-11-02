import 'server-only';
import { after } from 'next/server';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { diagnose, type TrackInput } from './diagnose';

/* =====================================================================
   مركز التتبع — التسجيل من الخادم
   الحدث يُشخَّص هنا (النوع والبصمة والحاجة لتدخل) ثم يُكتب بعد إرسال الرد للمستخدم (after)
   فلا يبطئ أي صفحة. الكتابة بالمفتاح السري عبر track_log (تملأ اسم المستخدم ودوره وتمنع الإغراق).
   ===================================================================== */

export type TrackEvent = TrackInput & { actor_id?: string | null; ip?: string | null; user_agent?: string | null };

/** أبطأ من هذا يُسجَّل استعلامًا بطيئًا */
export const SLOW_DB_MS = 2000;

async function send(p: Record<string, unknown>) {
  try {
    await createAdminClient().rpc('track_log', { p });
  } catch (err) {
    console.error('[track] failed to log', err);
  }
}

/** مسار الصفحة وعنوان الجهاز والمتصفح من الطلب الحالي (يضع proxy.ts المسار في x-mq-path) */
export async function requestMeta(): Promise<{ path: string | null; ip: string | null; user_agent: string | null }> {
  try {
    const h = await headers();
    let path = h.get('x-mq-path');
    if (!path) {
      const ref = h.get('referer');
      try { path = ref ? new URL(ref).pathname : null; } catch { path = null; }
    }
    return {
      path,
      ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null,
      user_agent: h.get('user-agent')?.slice(0, 300) ?? null,
    };
  } catch {
    return { path: null, ip: null, user_agent: null };
  }
}

/** يسجّل حدثًا: يكمل بيانات الطلب، يشخّصه، ويكتبه بعد الرد */
export async function track(e: TrackEvent) {
  const m = e.path !== undefined && e.ip !== undefined ? { path: e.path, ip: e.ip, user_agent: e.user_agent ?? null } : await requestMeta();
  const dg = diagnose({ ...e, path: e.path ?? m.path });
  const payload = {
    action: e.action,
    severity: e.severity ?? (dg.kind === 'system' ? 'error' : dg.kind === 'security' ? 'security' : dg.kind === 'ok' ? 'info' : 'warning'),
    kind: dg.kind,
    needs_action: dg.needsAction,
    fingerprint: dg.fingerprint,
    actor_id: e.actor_id ?? null,
    actor_name: e.actor_name ?? null,
    path: e.path ?? m.path,
    message: e.message ?? null,
    code: e.code ?? null,
    duration_ms: e.duration_ms != null ? Math.round(e.duration_ms) : null,
    details: e.details ?? {},
    ip: e.ip ?? m.ip,
    user_agent: e.user_agent ?? m.user_agent,
  };
  try {
    after(() => send(payload));
  } catch {
    // خارج طلب (مثل onRequestError): نكتب مباشرة
    await send(payload);
  }
}

/** معرّف المستخدم من رمز الدخول المرسل لـ Supabase (بلا طلب إضافي) */
export function subFromAuthHeader(auth: string | null | undefined): string | null {
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  const part = token?.split('.')[1];
  if (!part) return null;
  try {
    const json = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as { sub?: string; role?: string };
    return json.role === 'authenticated' && json.sub ? json.sub : null;
  } catch {
    return null;
  }
}

/**
 * fetch لعميل Supabase بهوية المستخدم: يلتقط كل خطأ من قاعدة البيانات وكل استعلام بطيء — من أي صفحة أو عملية،
 * دون تعديل كل ملف. لا يغيّر الرد نفسه أبدًا.
 */
export function trackedFetch(base: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const hdrs = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const op = opFromUrl(url, method);
    const t0 = performance.now();
    let res: Response;
    try {
      res = await base(input, init);
    } catch (err) {
      if (op) void track({ action: 'db.network', message: String((err as Error)?.message ?? err).slice(0, 300), actor_id: subFromAuthHeader(hdrs.get('authorization')), details: { op } });
      throw err;
    }
    if (!op) return res;
    const ms = performance.now() - t0;
    // 406 = لا صف عند maybeSingle — ليس خطأ
    if (res.status >= 400 && res.status !== 406) {
      const body = (await res.clone().json().catch(() => null)) as { code?: string; message?: string; details?: string; hint?: string } | null;
      if (body?.code !== 'PGRST116') {
        void track({
          action: 'db.error', code: body?.code ?? String(res.status), message: body?.message?.slice(0, 500) ?? res.statusText,
          duration_ms: ms, actor_id: subFromAuthHeader(hdrs.get('authorization')),
          details: { op, status: res.status, details: body?.details?.slice(0, 300), hint: body?.hint?.slice(0, 200) },
        });
      }
    } else if (ms >= SLOW_DB_MS && url.pathname.startsWith('/rest/')) {
      void track({ action: 'db.slow', duration_ms: ms, actor_id: subFromAuthHeader(hdrs.get('authorization')), details: { op } });
    }
    return res;
  };
}

/** «rpc:save_form» / «table:students:PATCH» / «storage:upload» — أو null لما لا نتتبعه (الدخول وتجديد الجلسة) */
function opFromUrl(url: URL, method: string): string | null {
  const p = url.pathname;
  if (p.startsWith('/rest/v1/rpc/')) return `rpc:${p.slice(13).split('/')[0]}`;
  if (p.startsWith('/rest/v1/')) return `table:${p.slice(9).split('/')[0]}:${method}`;
  if (p.startsWith('/storage/v1/object/sign')) return 'storage:sign';
  if (p.startsWith('/storage/v1/object/')) return method === 'POST' || method === 'PUT' ? 'storage:upload' : method === 'DELETE' ? 'storage:delete' : 'storage:read';
  return null;
}
