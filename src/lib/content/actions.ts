'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser, requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { pageSize, type PageParams, type PageResult } from '@/components/registry/types';
import { MAX_ATTACHMENT_BYTES } from '@/lib/assess/shared';
import { TASK_BUCKET, ensureBucket, removePaths, safeName, sniff } from '@/lib/assess/storage';
import { parseMedia, type ContentAttachment, type StaffContent, type StudentContent, type Viewer } from './shared';

/* =====================================================================
   الفيديوهات والإثراءات — كل تحقق في القاعدة (save_content وأخواتها)
   ===================================================================== */

type Res<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; error: string };
const STAFF = ['admin', 'teacher'] as const;
const friendly = (m: string) =>
  /row-level security|FORBIDDEN|42501|permission denied/.test(m) ? 'لا تملك صلاحية هذه العملية' : /JWT|AUTH_REQUIRED/.test(m) ? 'انتهت الجلسة. سجّل الدخول من جديد' : m.replace(/^ERROR:\s*/, '');
const touch = () => {
  revalidatePath('/staff/content');
  revalidatePath('/student/content');
  revalidatePath('/student');
  revalidatePath('/staff');
};

export async function listContent(p: PageParams): Promise<PageResult<StaffContent>> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const f = p.filters ?? {};
  const { data, error } = await supabase.rpc('staff_content', {
    p: { page: p.page, size: pageSize(p), q: (p.q ?? '').slice(0, 60), sort: p.sort, kind: f.kind || null, class_id: f.class || null, subject_id: f.subject || null, status: f.status || null, mine: f.mine === '1' },
  });
  if (error) throw new Error(friendly(error.message));
  return data as PageResult<StaffContent>;
}

export type ContentStats = { videos: number; enrichments: number; scheduled: number; drafts: number; week_views: number; completion: number | null };
export async function contentStats(): Promise<ContentStats> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data } = await supabase.rpc('content_stats');
  return (data as ContentStats) ?? { videos: 0, enrichments: 0, scheduled: 0, drafts: 0, week_views: 0, completion: null };
}

export async function contentViewers(id: number): Promise<Viewer[]> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('content_viewers', { p_id: id });
  if (error) throw new Error(friendly(error.message));
  return (data as Viewer[]) ?? [];
}

export type ContentInput = {
  kind: 'video' | 'enrichment';
  title: string;
  description: string | null;
  url: string | null;
  body: string | null;
  subject_id: number | null;
  term_id: number | null;
  minutes: number | null;
  published_at: string | null;
  expires_at: string | null;
  is_pinned: boolean;
  is_draft: boolean;
  attachments: ContentAttachment[];
};

export async function saveContent(id: number | null, input: ContentInput, classIds: number[]): Promise<Res<{ ids: number[] }>> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('save_content', { p_id: id, p: input, p_class_ids: classIds });
  if (error) return { ok: false, error: friendly(error.message) };
  touch();
  const n = (data as number[]).length;
  return {
    ok: true,
    message: id ? 'حُفظت التعديلات' : input.is_draft ? 'حُفظت كمسودة' : n > 1 ? `نُشر في ${n} فصول` : input.published_at && Date.parse(input.published_at) > Date.now() ? 'جُدول النشر' : 'نُشر للطلاب',
    data: { ids: data as number[] },
  };
}

export async function setContentFlags(id: number, flags: { is_pinned?: boolean; is_draft?: boolean; expire_now?: boolean; expires_at?: string | null }): Promise<Res> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_content_flags', { p_id: id, p: flags });
  if (error) return { ok: false, error: friendly(error.message) };
  touch();
  return {
    ok: true,
    message: flags.is_pinned === true ? 'ثُبّت في الأعلى' : flags.is_pinned === false ? 'أُلغي التثبيت' : flags.is_draft === false ? 'نُشر للطلاب' : flags.is_draft ? 'أُخفي كمسودة' : flags.expire_now ? 'أُخفي عن الطلاب' : 'حُفظ',
  };
}

export async function deleteContent(id: number): Promise<Res> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('delete_content', { p_id: id });
  if (error) return { ok: false, error: friendly(error.message) };
  await removePaths((data as string[]) ?? []);
  touch();
  return { ok: true, message: 'حُذف المحتوى' };
}

/** رفع مرفق إثراء (صورة/PDF/Office) إلى المخزن العام بمسار عشوائي */
export async function uploadContentFile(fd: FormData): Promise<Res<ContentAttachment>> {
  await requireUser(STAFF);
  const file = fd.get('file');
  if (!(file instanceof File) || !file.size) return { ok: false, error: 'اختر ملفًا' };
  if (file.size > MAX_ATTACHMENT_BYTES) return { ok: false, error: 'حجم الملف أكبر من 3 ميقا — ارفعه على قوقل درايف وضع رابطه' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes, file.name);
  if (!kind) return { ok: false, error: 'نوع الملف غير مدعوم: صورة أو PDF أو Word أو PowerPoint أو Excel' };
  await ensureBucket(TASK_BUCKET);
  const path = `content/${crypto.randomUUID()}/a.${kind.ext}`;
  const { error } = await createAdminClient().storage.from(TASK_BUCKET).upload(path, bytes, { contentType: kind.mime, cacheControl: '31536000', upsert: false });
  if (error) return { ok: false, error: `تعذّر الرفع: ${error.message}` };
  return { ok: true, message: 'رُفع الملف', data: { name: safeName(file.name), storage_path: path, mime: kind.mime, size_bytes: bytes.length, kind: kind.mime.startsWith('image/') ? 'image' : 'file' } };
}

/** عنوان الفيديو وصاحبه من يوتيوب/فيميو (oEmbed) لتعبئة النموذج تلقائيًا */
export async function linkMeta(url: string): Promise<{ title: string | null; author: string | null; thumb: string | null }> {
  const empty = { title: null, author: null, thumb: null };
  // طلب خلفي: لا يحوّل المستخدم لصفحة الدخول إن انتهت الجلسة، يكتفي بعدم التعبئة
  const user = await getCurrentUser();
  if (!user || (user.role !== 'admin' && user.role !== 'teacher')) return empty;
  const m = parseMedia(url);
  if (!m || (m.provider !== 'youtube' && m.provider !== 'vimeo')) return empty;
  const endpoint = m.provider === 'youtube' ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(m.watch)}` : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(m.watch)}`;
  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(3500), next: { revalidate: 86400 } });
    if (!res.ok) return empty;
    const j = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
    return { title: j.title?.slice(0, 200) ?? null, author: j.author_name ?? null, thumb: typeof j.thumbnail_url === 'string' && j.thumbnail_url.startsWith('https://') ? j.thumbnail_url : null };
  } catch {
    return empty;
  }
}

/* --------------------------------- الطالب --------------------------------- */
export async function myContent(): Promise<StudentContent[]> {
  await requireUser(['student']);
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_content');
  return (data as StudentContent[]) ?? [];
}

export async function openContent(id: number): Promise<Res> {
  await requireUser(['student']);
  const supabase = await createClient();
  const { error } = await supabase.rpc('open_content', { p_id: id });
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true, message: '' };
}

export async function setContentProgress(id: number, completed: boolean | null, saved: boolean | null): Promise<Res> {
  await requireUser(['student']);
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_content_progress', { p_id: id, p_completed: completed, p_saved: saved });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath('/student');
  return { ok: true, message: completed === true ? 'أحسنت! سُجّل إكمالك ✓' : completed === false ? 'أُلغي الإكمال' : saved ? 'حُفظ في قائمتك' : 'أُزيل من المحفوظات' };
}
