import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { SUB_BUCKET } from './storage';

/** يُستدعى من الإداري يدويًا، ومن المهمة اليومية المجدولة */
export async function runPurge(manual: boolean): Promise<{ files: number; bytes: number }> {
  const admin = createAdminClient();
  let files = 0;
  let bytes = 0;
  for (let round = 0; round < 10; round++) {
    const { data } = await admin.rpc('purge_candidates', { p_manual: manual, p_limit: 500 });
    const rows = (data as { id: number; storage_path: string; size_bytes: number }[]) ?? [];
    if (!rows.length) break;
    const { error } = await admin.storage.from(SUB_BUCKET).remove(rows.map((r) => r.storage_path));
    if (error && !/not found/i.test(error.message)) break;
    await admin.rpc('mark_files_purged', { p_ids: rows.map((r) => r.id) });
    files += rows.length;
    bytes += rows.reduce((a, r) => a + r.size_bytes, 0);
    if (rows.length < 500) break;
  }
  // رفعات لم تُسلَّم خلال يوم
  const { data: stale } = await admin.rpc('stale_uploads', { p_limit: 500 });
  const paths = (stale as string[]) ?? [];
  if (paths.length) {
    await admin.storage.from(SUB_BUCKET).remove(paths);
    await admin.rpc('forget_uploads', { p_paths: paths });
  }
  return { files, bytes };
}
