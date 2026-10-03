import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '@/lib/env';

/**
 * عميل بالمفتاح السري: يتخطى RLS.
 * للخادم فقط وللعمليات التي تحتاجه حصرًا: إنشاء الحسابات، كلمات المرور، بوابة الدخول.
 * 'server-only' يُفشل البناء إن استُورد هذا الملف في مكوّن متصفح.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY غير مضبوط في بيئة الخادم');
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
