import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';

/**
 * عميل Supabase بهوية المستخدم الحالي (من الكوكيز).
 * كل قراءة به تمر عبر RLS — هو الافتراضي لكل الصفحات.
 * يُنشأ جديدًا لكل طلب، ولا يُشارك بين الطلبات.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // مكوّنات الخادم لا تكتب الكوكيز؛ proxy.ts يجدّد الجلسة قبلها.
        }
      },
    },
  });
}
