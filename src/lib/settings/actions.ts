'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { REF_TAG } from '@/lib/data';
import type { ActionResult } from '@/components/registry/types';

/* =====================================================================
   إعدادات النظام والقوائم المرجعية — الإداري فقط (وRLS تفرض ذلك أيضًا)
   كل تعديل يمسح ذاكرة القوائم المشتركة فيراه الجميع فورًا.
   ===================================================================== */

const done = (message: string): ActionResult => {
  revalidatePath('/staff/settings');
  updateTag(REF_TAG);
  return { ok: true, message };
};
const fail = (e: { message: string } | string): ActionResult => ({ ok: false, error: friendly(typeof e === 'string' ? e : e.message) });

function friendly(m: string) {
  if (m.includes('duplicate key')) return 'هذا الاسم موجود من قبل';
  if (m.includes('violates foreign key')) return 'لا يمكن الحذف: العنصر مستخدم في سجلات أخرى. يمكنك إعادة تسميته بدلًا من ذلك';
  if (m.includes('row-level security')) return 'هذه العملية للإدارة فقط';
  return m;
}

// كل إعداد بنوع قيمته المسموح — لا يُكتب مفتاح أو شكل غير معروف
const SETTINGS: Record<string, (v: unknown) => boolean> = {
  school_name: (v) => typeof v === 'string' && v.trim().length > 1 && v.length <= 120,
  school_logo_url: (v) => typeof v === 'string' && (v === '' || /^https:\/\/\S+$/.test(v)),
  results_visible_grades: (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'),
  weekly_grades_visibility: (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'),
  calendar_visibility: (v) => typeof v === 'string' && v.length <= 60,
  exam_visibility: (v) => v === 'all' || v === 'hidden',
  show_exam_schedule: (v) => typeof v === 'string',
  announcements: (v) =>
    Array.isArray(v) &&
    v.length <= 12 &&
    v.every((a) => a && typeof a === 'object' && typeof (a as { title?: unknown }).title === 'string'),
};
const PUBLIC_KEYS = new Set(['school_name', 'school_logo_url', 'announcements']);

export async function saveSetting(key: string, value: unknown): Promise<ActionResult> {
  const me = await requireUser(['admin']);
  const check = SETTINGS[key];
  if (!check) return fail('إعداد غير معروف');
  if (!check(value)) return fail('قيمة غير صالحة لهذا الإعداد');
  const supabase = await createClient();
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value, is_public: PUBLIC_KEYS.has(key), updated_at: new Date().toISOString(), updated_by: me.id });
  if (error) return fail(error);
  return done('حُفظ الإعداد');
}

/* ---------------------------------------------------------------------
   القوائم المرجعية
--------------------------------------------------------------------- */
export type RefTable = 'branches' | 'stages' | 'grades' | 'sections' | 'subjects' | 'eval_types' | 'attendance_statuses' | 'behavior_statuses';
const TABLES: RefTable[] = ['branches', 'stages', 'grades', 'sections', 'subjects', 'eval_types', 'attendance_statuses', 'behavior_statuses'];
const HAS_ACTIVE: RefTable[] = ['branches', 'subjects'];

export type RefInput = { name: string; stage_id?: number | null; category?: 'continuous' | 'exam'; is_active?: boolean };

export async function saveRefItem(table: RefTable, id: number | null, input: RefInput): Promise<ActionResult> {
  await requireUser(['admin']);
  if (!TABLES.includes(table)) return fail('قائمة غير معروفة');
  const name = input.name?.trim();
  if (!name || name.length > 80) return fail('الاسم مطلوب (حتى 80 حرفًا)');
  const row: Record<string, unknown> = { name };
  if (table === 'grades') {
    if (!input.stage_id) return fail('اختر المرحلة');
    row.stage_id = input.stage_id;
  }
  if (table === 'eval_types' && input.category) row.category = input.category;
  if (HAS_ACTIVE.includes(table) && typeof input.is_active === 'boolean') row.is_active = input.is_active;
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from(table).update(row).eq('id', id);
    if (error) return fail(error);
    return done('حُفظ التعديل');
  }
  // الجديد يُضاف في آخر القائمة
  const { data: last } = await supabase.from(table).select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from(table).insert({ ...row, sort_order: (last?.sort_order ?? 0) + 1 });
  if (error) return fail(error);
  return done(`أُضيف "${name}"`);
}

export async function deleteRefItem(table: RefTable, id: number): Promise<ActionResult> {
  await requireUser(['admin']);
  if (!TABLES.includes(table)) return fail('قائمة غير معروفة');
  const supabase = await createClient();
  const { error, count } = await supabase.from(table).delete({ count: 'exact' }).eq('id', id);
  if (error) return fail(error);
  if (!count) return fail('العنصر غير موجود');
  return done('حُذف');
}

/** ترتيب جديد للقائمة كاملة (بعد السحب أو الأسهم) */
export async function reorderRef(table: RefTable, ids: number[]): Promise<ActionResult> {
  await requireUser(['admin']);
  if (!TABLES.includes(table) || ids.length > 200) return fail('قائمة غير معروفة');
  const supabase = await createClient();
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase.from(table).update({ sort_order: i + 1 }).eq('id', ids[i]);
    if (error) return fail(error);
  }
  return done('حُفظ الترتيب');
}

/* ---------------------------------------------------------------------
   توزيع الدرجات لمادة: مجموع النسب 100 بالضبط
--------------------------------------------------------------------- */
export async function saveWeights(subjectId: number, weights: { eval_type_id: number; weight: number }[]): Promise<ActionResult> {
  await requireUser(['admin']);
  const clean = weights.filter((w) => w.weight > 0);
  if (clean.some((w) => !Number.isFinite(w.weight) || w.weight < 0 || w.weight > 100)) return fail('كل نسبة بين 0 و100');
  const total = clean.reduce((a, w) => a + w.weight, 0);
  if (clean.length && Math.abs(total - 100) > 0.001) return fail(`مجموع النسب ${total}% — يجب أن يكون 100%`);
  const supabase = await createClient();
  // الإدراج أو التحديث أولًا ثم حذف ما أُزيل: لو فشلت خطوة لا تضيع الأوزان الحالية
  if (clean.length) {
    const { error } = await supabase
      .from('grade_weights')
      .upsert(clean.map((w) => ({ subject_id: subjectId, eval_type_id: w.eval_type_id, weight: w.weight, updated_at: new Date().toISOString() })), { onConflict: 'subject_id,eval_type_id' });
    if (error) return fail(error);
  }
  let del = supabase.from('grade_weights').delete().eq('subject_id', subjectId);
  if (clean.length) del = del.not('eval_type_id', 'in', `(${clean.map((w) => w.eval_type_id).join(',')})`);
  const { error: delError } = await del;
  if (delError) return fail(delError);
  return done('حُفظ توزيع الدرجات');
}
