'use client';
import { createBrowserClient } from '@supabase/ssr';

/**
 * عميل المتصفح بهوية الطالب (من الكوكيز) — لحل النماذج فقط:
 * الحفظ التلقائي والتسليم يذهبان من المتصفح إلى القاعدة مباشرة (أسرع تحت الضغط، ولا يستهلك دوال الخادم).
 * كل دالة تتحقق من صاحب الجلسة بنفسها.
 */
let client: ReturnType<typeof createBrowserClient> | null = null;
export function browserClient() {
  if (!client) client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return client;
}
