'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { REF_TAG } from '@/lib/data';

/* =====================================================================
   النسخة الاحتياطية والتصفير (للإدارة فقط)
   - النسخة: صفوف مقروءة من backup_rows على صفحات، يجمعها المتصفح في ملف Excel واحد
   - التصفير: admin_reset_data في القاعدة (ذري)، ثم حذف حسابات الدخول والملفات على دفعات
   ===================================================================== */

type Res<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const ADMIN = ['admin'] as const;
const TABLES = ['students', 'employees', 'totals', 'grades', 'assessments', 'questions', 'attendance', 'behavior', 'content', 'settings'] as const;
export type BackupTable = (typeof TABLES)[number];

export async function backupContext(): Promise<Res<{ branches: { id: number; name: string }[]; terms: { id: number; name: string; year: string; is_current: boolean }[]; school: string; lastBackup: { at: string; branch: number | null } | null }>> {
  await requireUser(ADMIN);
  const supabase = await createClient();
  const [b, t, s, lb] = await Promise.all([
    supabase.from('branches').select('id, name').order('sort_order').order('id'),
    supabase.from('terms').select('id, name, sort_order, year:academic_years(name, is_current)').order('sort_order'),
    supabase.from('app_settings').select('value').eq('key', 'school_name').maybeSingle(),
    supabase.from('app_settings').select('value').eq('key', 'last_backup').maybeSingle(),
  ]);
  const terms = ((t.data ?? []) as unknown as { id: number; name: string; year: { name: string; is_current: boolean } | null }[])
    .map((x) => ({ id: x.id, name: x.name, year: x.year?.name ?? '', is_current: !!x.year?.is_current }))
    .sort((a, c) => Number(c.is_current) - Number(a.is_current));
  const v = lb.data?.value as { at?: string; branch?: number | null } | null;
  return {
    ok: true,
    data: {
      branches: (b.data ?? []) as { id: number; name: string }[],
      terms,
      school: typeof s.data?.value === 'string' ? s.data.value : 'المدرسة',
      lastBackup: v?.at ? { at: v.at, branch: v.branch ?? null } : null,
    },
  };
}

/** صفحة من جدول (حتى 2000 صف) — بالأسماء لا بالأرقام */
export async function backupRows(table: BackupTable, branch: number | null, offset: number): Promise<Res<Record<string, unknown>[]>> {
  await requireUser(ADMIN);
  if (!TABLES.includes(table)) return { ok: false, error: 'جدول غير معروف' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('backup_rows', { p_table: table, p_branch: branch, p_offset: offset, p_limit: 2000 });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as Record<string, unknown>[] };
}

/** يُسجَّل بعد اكتمال تنزيل الملف — شرط للتصفير خلال 24 ساعة */
export async function markBackup(branch: number | null): Promise<Res> {
  const me = await requireUser(ADMIN);
  const supabase = await createClient();
  const { error } = await supabase.from('app_settings').upsert({ key: 'last_backup', value: { at: new Date().toISOString(), branch, by: me.id }, is_public: false, updated_at: new Date().toISOString(), updated_by: me.id });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

export type ResetPreview = {
  students: number; accounts: number; assessments: number; grades: number; attendance: number; behavior: number; content: number;
  employees: number | null; audit: number | null; last_backup: { at: string; branch: number | null } | null;
};
export async function resetPreview(branch: number | null): Promise<Res<ResetPreview>> {
  await requireUser(ADMIN);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_reset_preview', { p_branch: branch });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as ResetPreview };
}

export type ResetPart = 'students' | 'assessments' | 'conduct' | 'content' | 'employees' | 'audit';
export type ResetDone = { counts: Record<string, number>; users: string[]; files: Record<'task-files' | 'submissions', string[]> };

export async function resetData(branch: number | null, parts: ResetPart[], confirm: string): Promise<Res<ResetDone>> {
  await requireUser(ADMIN);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_reset_data', { p_branch: branch, p_parts: parts, p_confirm: confirm });
  if (error) return { ok: false, error: error.message.replace(/^ERROR:\s*/, '') };
  updateTag(REF_TAG);
  for (const p of ['/staff', '/staff/students', '/staff/employees', '/staff/tasks', '/staff/grading', '/staff/results', '/staff/attendance', '/staff/content']) revalidatePath(p);
  return { ok: true, data: data as ResetDone };
}

/**
 * يحذف حسابات دخول لم يعد لها سجل في profiles فقط (لا يمكن حذف حساب قائم بهذه الدالة)
 */
export async function purgeAuthUsers(ids: string[]): Promise<Res<{ deleted: number }>> {
  await requireUser(ADMIN);
  const list = ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 60);
  if (!list.length) return { ok: true, data: { deleted: 0 } };
  const admin = createAdminClient();
  const { data: still } = await admin.from('profiles').select('id').in('id', list);
  const alive = new Set((still ?? []).map((x) => x.id as string));
  let deleted = 0;
  for (const id of list) {
    if (alive.has(id)) continue;
    const { error } = await admin.auth.admin.deleteUser(id);
    if (!error || /not.?found/i.test(error.message)) deleted++;
  }
  return { ok: true, data: { deleted } };
}

/** يحذف ملفات لم يعد يشير إليها أي سجل (بعد التصفير) */
export async function purgeFiles(bucket: 'task-files' | 'submissions', paths: string[]): Promise<Res<{ deleted: number }>> {
  await requireUser(ADMIN);
  if (bucket !== 'task-files' && bucket !== 'submissions') return { ok: false, error: 'مخزن غير معروف' };
  const list = [...new Set(paths.filter((p) => typeof p === 'string' && p && !p.includes('..')))].slice(0, 200);
  if (!list.length) return { ok: true, data: { deleted: 0 } };
  const admin = createAdminClient();
  const used = new Set<string>();
  if (bucket === 'submissions') {
    const [a, b] = await Promise.all([
      admin.from('submission_files').select('storage_path').in('storage_path', list),
      admin.from('pending_uploads').select('storage_path').in('storage_path', list),
    ]);
    [...(a.data ?? []), ...(b.data ?? [])].forEach((x) => used.add(x.storage_path as string));
  } else {
    const [a, b] = await Promise.all([
      admin.from('assessment_attachments').select('storage_path').in('storage_path', list),
      admin.from('form_questions').select('image_url').in('image_url', list.map((p) => `storage:${p}`)),
    ]);
    (a.data ?? []).forEach((x) => used.add(x.storage_path as string));
    (b.data ?? []).forEach((x) => used.add(String(x.image_url).slice(8)));
  }
  const gone = list.filter((p) => !used.has(p));
  if (!gone.length) return { ok: true, data: { deleted: 0 } };
  const { error } = await admin.storage.from(bucket).remove(gone);
  if (error && !/not.?found/i.test(error.message)) return { ok: false, error: error.message };
  return { ok: true, data: { deleted: gone.length } };
}
