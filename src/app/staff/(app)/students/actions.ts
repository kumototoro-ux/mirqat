'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CLASS_SELECT, classLabel, type ClassRef } from '@/lib/format';
import { PAGE_SIZE, type ActionResult, type PageParams, type PageResult } from '@/components/registry/types';

export type StudentRow = {
  id: number;
  code: string;
  name_ar: string;
  national_id: string | null;
  gender: string | null;
  nationality: string | null;
  fee_status: string | null;
  status: 'active' | 'withdrawn' | 'graduated';
  enrolled_at: string | null;
  class_label: string;
  has_account: boolean;
};

type Raw = Omit<StudentRow, 'class_label' | 'has_account'> & { class: ClassRef; profiles: { id: string }[] };

const SORTS: Record<string, { col: string; asc: boolean }> = {
  name: { col: 'name_ar', asc: true },
  name_desc: { col: 'name_ar', asc: false },
  code: { col: 'code', asc: true },
  code_desc: { col: 'code', asc: false },
  newest: { col: 'created_at', asc: false },
  newest_desc: { col: 'created_at', asc: true },
};

const clean = (q: string) => q.replace(/[,()*%\\"]/g, ' ').trim().slice(0, 60);

/** صفحة واحدة من الطلاب (15 صفًا) مع العدد الكلي — استعلام واحد */
export async function listStudents(p: PageParams): Promise<PageResult<StudentRow>> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const page = Math.max(1, Math.floor(p.page) || 1);
  const sort = SORTS[p.sort] ?? SORTS.name;
  let q = supabase
    .from('students')
    .select(`id, code, name_ar, national_id, gender, nationality, fee_status, status, enrolled_at, class:classes(${CLASS_SELECT}), profiles(id)`, {
      count: 'exact',
    })
    .order(sort.col, { ascending: sort.asc })
    .order('id')
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const term = clean(p.q ?? '');
  if (term) q = q.or(`name_ar.ilike.%${term}%,code.ilike.%${term}%,national_id.ilike.%${term}%`);
  const f = p.filters ?? {};
  if (f.class) q = q.eq('class_id', Number(f.class));
  if (f.status) q = q.eq('status', f.status);
  if (f.fee) q = q.eq('fee_status', f.fee);
  const { data, error, count } = await q.returns<Raw[]>();
  if (error) throw new Error(error.message);
  return {
    total: count ?? 0,
    rows: (data ?? []).map(({ class: c, profiles, ...r }) => ({ ...r, class_label: classLabel(c, true), has_account: profiles.length > 0 })),
  };
}

export type StudentForm = {
  id: number | null;
  code?: string;
  national_id: string;
  name_ar: string;
  name_en: string;
  nationality: string;
  birth_date: string;
  gender: string;
  branch_id: number | null;
  stage_id: number | null;
  grade_id: number | null;
  section_id: number | null;
  fee_status: string;
  status: string;
};

/** بيانات طالب كاملة لنموذج التعديل */
export async function getStudent(id: number): Promise<StudentForm | null> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const { data } = await supabase
    .from('students')
    .select('id, code, national_id, name_ar, name_en, nationality, birth_date, gender, fee_status, status, class:classes(branch_id, grade_id, section_id, grade:grades(stage_id))')
    .eq('id', id)
    .maybeSingle<{
      id: number; code: string; national_id: string | null; name_ar: string; name_en: string | null; nationality: string | null;
      birth_date: string | null; gender: string | null; fee_status: string | null; status: string;
      class: { branch_id: number; grade_id: number; section_id: number; grade: { stage_id: number } | null } | null;
    }>();
  if (!data) return null;
  return {
    id: data.id,
    code: data.code,
    national_id: data.national_id ?? '',
    name_ar: data.name_ar,
    name_en: data.name_en ?? '',
    nationality: data.nationality ?? '',
    birth_date: data.birth_date ?? '',
    gender: data.gender ?? '',
    branch_id: data.class?.branch_id ?? null,
    stage_id: data.class?.grade?.stage_id ?? null,
    grade_id: data.class?.grade_id ?? null,
    section_id: data.class?.section_id ?? null,
    fee_status: data.fee_status ?? '',
    status: data.status,
  };
}


export async function saveStudent(form: StudentForm): Promise<ActionResult> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const payload = {
    national_id: form.national_id,
    name_ar: form.name_ar,
    name_en: form.name_en,
    nationality: form.nationality,
    birth_date: form.birth_date,
    gender: form.gender,
    branch_id: form.branch_id,
    grade_id: form.grade_id,
    section_id: form.section_id,
    fee_status: form.fee_status,
    ...(form.id ? { status: form.status } : {}),
  };
  const { data, error } = await supabase.rpc('save_student', { p_id: form.id, p: payload });
  if (error) return { ok: false, error: error.message };
  const row = (data as { id: number; code: string }[] | null)?.[0];
  revalidatePath('/staff/students');
  return { ok: true, message: form.id ? 'تم حفظ التعديل' : `تم تسجيل الطالب برقم ${row?.code ?? ''}`, code: row?.code };
}

export async function deleteStudent(id: number): Promise<ActionResult> {
  await requireUser(['admin']);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('delete_student', { p_id: id });
  if (error) return { ok: false, error: error.message };
  // إن كان له حساب دخول، يُحذف من Supabase Auth أيضًا (القاعدة حذفت ربطه)
  if (data) {
    const { error: authError } = await createAdminClient().auth.admin.deleteUser(data as string);
    if (authError) console.error('delete auth user', authError);
  }
  revalidatePath('/staff/students');
  return { ok: true, message: 'تم حذف الطالب' };
}
