/**
 * مركز التتبع: أي خطأ يحدث في الخادم أثناء فتح صفحة أو تنفيذ عملية يُسجَّل
 * بالرسالة الحقيقية والصفحة والمستخدم ورمز الخطأ (digest) الذي يظهر له في صفحة الخطأ.
 */
export async function register() {}

type Req = { path: string; method: string; headers: Record<string, string | string[] | undefined> };
type Ctx = { routerKind: string; routePath: string; routeType: string; renderSource?: string };

export async function onRequestError(err: unknown, request: Req, context: Ctx) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
    const e = err as { message?: string; digest?: string; code?: string };
    // إعادة التوجيه وصفحات 404 ليست أخطاء
    if (/NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR/.test(String(e?.digest ?? e?.message ?? ''))) return;

    // من المستخدم؟ من كوكيز الجلسة (بلا طلب شبكة)
    const raw = request.headers.cookie;
    const cookieHeader = Array.isArray(raw) ? raw.join('; ') : raw ?? '';
    const cookies = cookieHeader.split(/;\s*/).filter(Boolean).map((c) => {
      const i = c.indexOf('=');
      return { name: c.slice(0, i), value: decodeURIComponent(c.slice(i + 1)) };
    });
    let actor: string | null = null;
    try {
      const { createServerClient } = await import('@supabase/ssr');
      const sb = createServerClient(url, anon, { cookies: { getAll: () => cookies, setAll: () => {} } });
      const { data } = await sb.auth.getSession();
      actor = data.session?.user?.id ?? null;
    } catch { /* زائر */ }

    const { track } = await import('@/lib/track/server');
    const ua = request.headers['user-agent'];
    const fwd = request.headers['x-forwarded-for'];
    await track({
      action: 'server.error',
      severity: 'error',
      actor_id: actor,
      path: request.path?.slice(0, 300) ?? null,
      message: String(e?.message ?? err).slice(0, 800),
      code: e?.code ?? null,
      ip: (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim() ?? null,
      user_agent: (Array.isArray(ua) ? ua[0] : ua)?.slice(0, 300) ?? null,
      details: { digest: e?.digest, route: context.routePath, kind: context.routeType, source: context.renderSource, method: request.method },
    });
  } catch (x) {
    console.error('[onRequestError] failed to log', x);
  }
}
