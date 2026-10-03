import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { homeFor, readSessionMeta } from '@/lib/auth/roles';

/**
 * يعمل قبل كل صفحة:
 *  1) يجدّد جلسة Supabase ويكتب الكوكيز الجديدة
 *  2) توجيه سريع حسب الدور (من الجلسة) — للراحة فقط.
 *     القرار الحقيقي في الصفحات (requireUser من القاعدة) وفي RLS.
 */
const LOGIN_PATHS = ['/login', '/student/login'];
const PUBLIC_PATHS = [...LOGIN_PATHS, '/auth/signout'];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
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
  if (path.startsWith('/staff') && role === 'student') return go(homeFor(role));
  if (path.startsWith('/student') && role !== 'student') return go(homeFor(role));
  if (path.startsWith('/staff/accounts') && role !== 'admin') return go(homeFor(role));

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)'],
};
