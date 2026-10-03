'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PAGE_SIZE, type ActionResult, type PageParams, type PageResult } from '@/components/registry/types';

export type EmployeeRow = {
  id: number;
  code: string;
  name_ar: string;
  job_role: string | null;
  user_type: string | null;
  gender: string | null;
  is_active: boolean;
  branches: string[];
  subjects: string[];
  has_account: boolean;
};

type Raw = Omit<EmployeeRow, 'branches' | 'subjects' | 'has_account'> & {
  staff_scope: { branch: { name: string } | null; subject: { name: string } | null }[];
  profiles: { id: string }[];
};

const SORTS: Record<string, { col: string; asc: boolean }> = {
  name: { col: 'name_ar', asc: true },
  name_desc: { col: 'name_ar', asc: false },
  code: { col: 'code', asc: true },
  code_desc: { col: 'code', asc: false },
  newest: { col: 'created_at', asc: false },
  newest_desc: { col: 'created_at', asc: true },
};
const clean = (q: string) => q.replace(/[,()*%\\"]/g, ' ').trim().slice(0, 60);

export async function listEmployees(p: PageParams): Promise<PageResult<EmployeeRow>> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const page = Math.max(1, Math.floor(p.page) || 1);
  const sort = SORTS[p.sort] ?? SORTS.name;
  let q = supabase
    .from('employees')
    .select('id, code, name_ar, job_role, user_type, gender, is_active, staff_scope(branch:branches(name), subject:subjects(name)), profiles(id)', { count: 'exact' })
    .order(sort.col, { ascending: sort.asc })
    .order('id')
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const term = clean(p.q ?? '');
  if (term) q = q.or(`name_ar.ilike.%${term}%,code.ilike.%${term}%,national_id.ilike.%${term}%`);
  const f = p.filters ?? {};
  if (f.type) q = q.eq('user_type', f.type);
  if (f.active) q = q.eq('is_active', f.active === '1');
  const { data, error, count } = await q.returns<Raw[]>();
  if (error) throw new Error(error.message);
  return {
    total: count ?? 0,
    rows: (data ?? []).map(({ staff_scope, profiles, ...r }) => ({
      ...r,
      branches: [...new Set(staff_scope.flatMap((s) => (s.branch ? [s.branch.name] : [])))],
      subjects: [...new Set(staff_scope.flatMap((s) => (s.subject ? [s.subject.name] : [])))],
      has_account: profiles.length > 0,
    })),
  };
}

export type EmployeeForm = {
  id: number | null;
  code?: string;
  national_id: string;
  name_ar: string;
  name_en: string;
  user_type: 'admin' | 'teacher';
  job_role: string;
  gender: string;
  is_active: boolean;
  branch_id: number | null;
  stage_id: number | null;
  grade_ids: number[];
  section_ids: number[];
  subject_ids: number[];
};

export async function getEmployee(id: number): Promise<EmployeeForm | null> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const { data } = await supabase
    .from('employees')
    .select('id, code, national_id, name_ar, name_en, user_type, job_role, gender, is_active, staff_scope(branch_id, stage_id, grade_id, section_id, subject_id)')
    .eq('id', id)
    .maybeSingle<{
      id: number; code: string; national_id: string | null; name_ar: string; name_en: string | null; user_type: string | null;
      job_role: string | null; gender: string | null; is_active: boolean;
      staff_scope: { branch_id: number | null; stage_id: number | null; grade_id: number | null; section_id: number | null; subject_id: number | null }[];
    }>();
  if (!data) return null;
  const pick = (k: 'branch_id' | 'stage_id' | 'grade_id' | 'section_id' | 'subject_id') =>
    data.staff_scope.flatMap((s) => (s[k] != null ? [s[k] as number] : []));
  return {
    id: data.id,
    code: data.code,
    national_id: data.national_id ?? '',
    name_ar: data.name_ar,
    name_en: data.name_en ?? '',
    user_type: data.user_type === 'admin' ? 'admin' : 'teacher',
    job_role: data.job_role ?? '',
    gender: data.gender ?? '',
    is_active: data.is_active,
    branch_id: pick('branch_id')[0] ?? null,
    stage_id: pick('stage_id')[0] ?? null,
    grade_ids: pick('grade_id'),
    section_ids: pick('section_id'),
    subject_ids: pick('subject_id'),
  };
}

export async function saveEmployee(form: EmployeeForm): Promise<ActionResult> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('save_employee', {
    p_id: form.id,
    p: {
      national_id: form.national_id,
      name_ar: form.name_ar,
      name_en: form.name_en,
      user_type: form.user_type,
      job_role: form.job_role,
      gender: form.gender,
      ...(form.id ? { is_active: form.is_active } : {}),
      scope: {
        branch_id: form.branch_id,
        stage_id: form.stage_id,
        grade_ids: form.grade_ids,
        section_ids: form.section_ids,
        subject_ids: form.subject_ids,
      },
    },
  });
  if (error) return { ok: false, error: error.message };
  const row = (data as { id: number; code: string; user_id: string | null; role: string }[] | null)?.[0];
  // إن كان له حساب: دور الجلسة يتبع نوعه الجديد
  if (row?.user_id) {
    const { error: metaError } = await createAdminClient().auth.admin.updateUserById(row.user_id, { app_metadata: { role: row.role } });
    if (metaError) console.error('role metadata', metaError);
  }
  revalidatePath('/staff/employees');
  return { ok: true, message: form.id ? 'تم حفظ التعديل' : `تم تسجيل الموظف برقم ${row?.code ?? ''}`, code: row?.code };
}

export async function deleteEmployee(id: number): Promise<ActionResult> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('delete_employee', { p_id: id });
  if (error) return { ok: false, error: error.message };
  if (data) {
    const { error: authError } = await createAdminClient().auth.admin.deleteUser(data as string);
    if (authError) console.error('delete auth user', authError);
  }
  revalidatePath('/staff/employees');
  return { ok: true, message: 'تم حذف الموظف' };
}
