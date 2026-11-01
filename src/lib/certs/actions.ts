'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { AppreciationType, AppreciationView } from './appreciation';

/* شهادات الشكر والتقدير — الصلاحيات والاستحقاق كلها في القاعدة (هجرة 29) */

type Res<T> = { ok: true; data: T; message?: string } | { ok: false; error: string };
const STAFF = ['admin', 'teacher'] as const;
const friendly = (m: string) => {
  const t = m.replace(/^ERROR:\s*/, '');
  if (/^FORBIDDEN:\s*/.test(t)) return t.replace(/^FORBIDDEN:\s*/, '');
  if (/FORBIDDEN|42501|permission denied|row-level security/.test(t)) return 'ليست لديك صلاحية لهذا';
  return t;
};

export type IssueInput = { type: AppreciationType; student_id: number; subject_id?: number | null; term_id?: number | null; reason?: string | null };

export async function previewCert(p: IssueInput): Promise<Res<AppreciationView>> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('cert_preview', { p });
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true, data: data as AppreciationView };
}

export async function issueCert(p: IssueInput): Promise<Res<AppreciationView>> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('cert_issue', { p });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath('/staff/certificates');
  const v = data as AppreciationView;
  return { ok: true, data: v, message: `صدرت الشهادة لـ${v.student} — تظهر الآن في صفحته` };
}

export async function revokeCert(id: number): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { error } = await supabase.rpc('cert_revoke', { p_id: id });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath('/staff/certificates');
  return { ok: true, message: 'أُلغيت الشهادة واختفت من صفحة الطالب' };
}

export type CertList = { total: number; rows: AppreciationView[] };
export async function listCerts(f: { q?: string; type?: AppreciationType | null; branch?: number | null; offset?: number; limit?: number }): Promise<CertList> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data } = await supabase.rpc('cert_list', {
    p_q: (f.q ?? '').trim().slice(0, 40) || null,
    p_type: f.type ?? null,
    p_branch: f.branch ?? null,
    p_offset: f.offset ?? 0,
    p_limit: f.limit ?? 12,
  });
  return (data as CertList | null) ?? { total: 0, rows: [] };
}

export type TopRow = { rank: number; student_id: number; name: string; code: string; class_label: string; pct: number; n: number; absent?: number; late?: number; issued: boolean };

export async function branchTop(kind: 'top' | 'attendance', branch: number, term: number | null): Promise<Res<TopRow[]>> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('cert_top', { p_kind: kind, p_branch: branch, p_term: term });
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true, data: (data as TopRow[]) ?? [] };
}

export async function subjectTop(subject: number, term: number | null, classId: number | null): Promise<Res<TopRow[]>> {
  await requireUser(STAFF);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('cert_subject_top', { p_subject: subject, p_term: term, p_class: classId });
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true, data: (data as TopRow[]) ?? [] };
}
