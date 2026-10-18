import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runPurge } from '@/lib/assess/purge';

/**
 * المهمة اليومية (Vercel Cron — انظر vercel.json):
 *  1) تُسلِّم جلسات النماذج المنتهية وتسوّي غياب النماذج المغلقة (صفر لمن لم يحل)
 *  2) تحذف ملفات التسليم المصحّحة بعد المدة المحددة في الإعدادات، والرفعات التي لم تُسلَّم
 * محمية بـ CRON_SECRET: Vercel يرسله تلقائيًا، ولا يستطيع غيره تشغيلها.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const settled = await createAdminClient().rpc('settle_due_forms');
  const purged = await runPurge(false);
  return NextResponse.json({ ok: true, settled: settled.data ?? 0, purged });
}
