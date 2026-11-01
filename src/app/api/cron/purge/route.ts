import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runPurge } from '@/lib/assess/purge';

/**
 * المهمة اليومية (Vercel Cron — انظر vercel.json):
 *  1) تُسلِّم جلسات النماذج المنتهية وتسوّي غياب النماذج المغلقة (صفر لمن لم يحل)
 *  2) تحذف ملفات التسليم المصحّحة بعد المدة المحددة في الإعدادات، والرفعات التي لم تُسلَّم
 *  3) نبض يومي للقاعدة: قراءات وكتابة خفيفة تبقي مشروع Supabase المجاني نشطًا حتى في الإجازات
 *     (يتجمد بعد أسبوع بلا نشاط كافٍ — و Vercel Hobby يسمح بمهمة يومية واحدة، وهذا يكفي)
 * محمية بـ CRON_SECRET: Vercel يرسله تلقائيًا، ولا يستطيع غيره تشغيلها.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const admin = createAdminClient();
  const settled = await admin.rpc('settle_due_forms');
  const purged = await runPurge(false);
  // النبض: عدة طلبات حقيقية للقاعدة (قراءة جداول مختلفة + تسجيل آخر نبض)
  const [students, terms] = await Promise.all([
    admin.from('students').select('id', { count: 'exact', head: true }),
    admin.from('terms').select('id').limit(1),
    admin.from('app_settings').select('key').limit(1),
  ]);
  await admin.from('app_settings').upsert({ key: 'heartbeat', value: { at: new Date().toISOString(), students: students.count ?? 0 }, is_public: false, updated_at: new Date().toISOString() });
  return NextResponse.json({ ok: true, settled: settled.data ?? 0, purged, heartbeat: !terms.error });
}
