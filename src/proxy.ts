import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { homeFor, readSessionMeta } from '@/lib/auth/roles';
import { diagnose } from '@/lib/track/diagnose';

/**
 * يعمل قبل كل صفحة:
 *  1) يجدّد جلسة Supabase ويكتب الكوكيز الجديدة
 *  2) توجيه سريع حسب الدور (من الجلسة) — للراحة فقط.
 *     القرار الحقيقي في الصفحات (requireUser من القاعدة) وفي RLS.
 */
const LOGIN_PATHS = ['/login', '/student/login'];
// /api/cron: المهام المجدولة تحمي نفسها بـ CRON_SECRET (لا جلسة مستخدم فيها)
const PUBLIC_PATHS = [...LOGIN_PATHS, '/auth/signout', '/api/cron'];

/** مسار الصفحة لمركز التتبع: الصفحات والعمليات تعرف أين وقع الخطأ */
function pass(request: NextRequest) {
  const h = new Headers(request.headers);
  h.set('x-mq-path', (request.nextUrl.pathname + request.nextUrl.search).slice(0, 300));
  return NextResponse.next({ request: { headers: h } });
}

/** فتح صفحة ليست من صلاحية الدور: يُسجَّل تنبيهًا أمنيًا في مركز التتبع (بعد الرد) */
function trackForbidden(event: NextFetchEvent, request: NextRequest, sub: string, role: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return;
  const path = request.nextUrl.pathname.slice(0, 300);
  const dg = diagnose({ action: 'page.forbidden', path });
  const p = {
    action: 'page.forbidden', severity: 'security', kind: dg.kind, needs_action: dg.needsAction, fingerprint: dg.fingerprint,
    actor_id: sub, actor_role: role, path,
    ip: (request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-forwarded-for'))?.split(',')[0]?.trim() || null, user_agent: request.headers.get('user-agent')?.slice(0, 300) ?? null,
  };
  event.waitUntil(
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/track_log`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p }),
    }).then(() => undefined, () => undefined),
  );
}

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  let response = pass(request);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = pass(request);
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // لا شيء بين إنشاء العميل وهذا السطر: getClaims يجدّد الجلسة إن انتهت
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const path = request.nextUrl.pathname;
  const isPublic = path === '/' || PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));

  const go = (to: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = '';
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (!claims) {
    if (isPublic) return response;
    return go(path.startsWith('/student') ? '/student/login' : '/login');
  }

  // التغيير الإلزامي لكلمة المرور تفرضه الصفحات من القاعدة (requireUser)، لا الجلسة:
  // علامة الجلسة قد تتأخر عن القاعدة حتى تتجدد.
  const { role } = readSessionMeta(claims.app_metadata);
  if (!role) {
    // جلسة بلا دور (حساب لم يُنشئه الخادم) — لا مكان له
    return path.startsWith('/auth/signout') ? response : go('/auth/signout');
  }
  if (path === '/' || LOGIN_PATHS.includes(path)) return go(homeFor(role));
  const forbidden = (path.startsWith('/staff') && role === 'student')
    || (path.startsWith('/student') && role !== 'student')
    || (path.startsWith('/staff/accounts') && role !== 'admin');
  if (forbidden) {
    trackForbidden(event, request, String(claims.sub), role);
    return go(homeFor(role));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)'],
};
