'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MAX_SUBMISSION_BYTES } from './shared';
import { SUB_BUCKET, ensureBucket, removePaths, safeName, sniff } from './storage';

/* =====================================================================
   تسليم الطالب لمهمة: كل ملف يُرفع بطلب مستقل (≤ 1 ميقا بعد الضغط في المتصفح)،
   ثم يُسلَّم النص ومسارات الملفات معًا. القاعدة ترفض أي مسار لم يرفعه نفس الطالب.
   ===================================================================== */

type Res<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; error: string };
const fail = (m: string): { ok: false; error: string } => ({ ok: false, error: m.replace(/^ERROR:\s*/, '') });

export type UploadedFile = { path: string; name: string; mime: string; size: number };

export async function uploadSubmissionFile(fd: FormData): Promise<Res<UploadedFile>> {
  const user = await requireUser(['student']);
  const assessmentId = Number(fd.get('assessment_id'));
  const file = fd.get('file');
  if (!assessmentId || !(file instanceof File) || !file.size) return fail('اختر ملفًا');
  if (file.size > MAX_SUBMISSION_BYTES) return fail('حجم الملف أكبر من 1 ميقا حتى بعد الضغط. صغّر الملف ثم أعد المحاولة');

  // هل يستطيع هذا الطالب التسليم الآن؟ (بجلسته هو، تحت RLS)
  const supabase = await createClient();
  const { data: can, error: canError } = await supabase.rpc('can_submit_task', { p_assessment_id: assessmentId });
  if (canError) return fail(canError.message);
  const studentId = (can as { student_id: number }).student_id;
  if (!studentId || studentId !== user.studentId) return fail('لا تملك التسليم');
  if ((can as { mode: string }).mode === 'text') return fail('هذه المهمة جوابها نصي فقط');

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes, file.name);
  if (!kind) return fail('نوع الملف غير مدعوم: صورة (JPG/PNG/WEBP) أو PDF أو Word أو PowerPoint أو Excel');

  await ensureBucket(SUB_BUCKET);
  const admin = createAdminClient();
  const path = `subs/${assessmentId}/${studentId}/${crypto.randomUUID()}.${kind.ext}`;
  const { error } = await admin.storage.from(SUB_BUCKET).upload(path, bytes, { contentType: kind.mime, upsert: false });
  if (error) return fail(`تعذّر الرفع: ${error.message}`);
  const name = safeName(file.name);
  const { error: regError } = await admin.rpc('register_upload', {
    p_student_id: studentId,
    p_assessment_id: assessmentId,
    p_path: path,
    p_name: name,
    p_mime: kind.mime,
    p_size: bytes.length,
  });
  if (regError) {
    await removePaths([path]);
    return fail(regError.message);
  }
  return { ok: true, message: 'رُفع الملف', data: { path, name, mime: kind.mime, size: bytes.length } };
}

export async function submitTask(assessmentId: number, body: string, paths: string[]): Promise<Res<{ late: boolean }>> {
  await requireUser(['student']);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('submit_task', { p_assessment_id: assessmentId, p_body: body, p_files: paths });
  if (error) return fail(error.message);
  const res = data as { removed_paths: string[]; late: boolean };
  await removePaths(res.removed_paths ?? []);
  revalidatePath('/student/tasks');
  revalidatePath(`/student/tasks/${assessmentId}`);
  revalidatePath(`/staff/tasks/${assessmentId}`);
  return { ok: true, message: res.late ? 'سُلّمت المهمة (تسليم متأخر)' : 'سُلّمت المهمة بنجاح', data: { late: res.late } };
}
