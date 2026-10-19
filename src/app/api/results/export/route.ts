import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getClasses, getSchoolName } from '@/lib/data';
import type { ClassReport } from '@/lib/results/shared';
import { buildResultsWorkbook } from '@/lib/results/excel';

/**
 * كشف نتائج فصل كامل لفصل دراسي — ملف Excel احترافي للإدارة:
 *  ورقة "الكشف": كل بيانات الطالب + لكل مادة: كل نوع تقييم وأقسامه ومجموعها وتقديرها + الإجمالي والمواظبة والسلوك
 *  ورقة "تحليل المواد": المتوسط والأعلى والأدنى ونسبة النجاح والممتازين لكل مادة
 * الحساب كله من class_results في القاعدة (وهي ترفض غير الإداري).
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin' || user.status !== 'active') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const url = new URL(request.url);
  const classId = Number(url.searchParams.get('class'));
  const termId = Number(url.searchParams.get('term'));
  if (!classId || !termId) return NextResponse.json({ error: 'class and term required' }, { status: 400 });

  const supabase = await createClient();
  const [{ data, error }, classes, school] = await Promise.all([
    supabase.rpc('class_results', { p_class_id: classId, p_term_id: termId }),
    getClasses(),
    getSchoolName(),
  ]);
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'not found' }, { status: error?.code === '42501' ? 403 : 400 });
  const rep = data as ClassReport;
  const cls = classes.find((c) => c.id === classId);
  const classTitle = cls ? `${cls.label} · ${cls.branch}` : `فصل ${classId}`;

  const buf = await buildResultsWorkbook(rep, classTitle, school);
  const fname = `نتائج ${cls?.label ?? classId} ${rep.term?.name ?? ''}.xlsx`.replace(/[\\/:*?"<>|]/g, '-');
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="results.xlsx"; filename*=UTF-8''${encodeURIComponent(fname)}`,
      'Cache-Control': 'no-store',
    },
  });
}
