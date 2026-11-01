'use server';

import ExcelJS from 'exceljs';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getSchoolName } from '@/lib/data';
import { digits, gradeKey, nameKey, normAr, sectionKey } from './arabic';
import { cellText, findTable, helpSheet, listValidation, readBook, styleHead, toBase64 } from './excel';

/* =====================================================================
   استيراد الطلاب من Excel (للإدارة): نموذج ← رفع ← معاينة مدققة ← حفظ
   الرقم الأكاديمي (رمز الطالب) هو المفتاح: إعادة الرفع تحدّث ولا تكرر
   ===================================================================== */

type Res<T> = { ok: true; data: T } | { ok: false; error: string };
const ADMIN = ['admin'] as const;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const FEES = ['سدد', 'جزئي', 'إعفاء', 'لم يسدد'];

type Ref = Awaited<ReturnType<typeof loadRef>>;
async function loadRef() {
  const supabase = await createClient();
  const [b, st, g, sec, cls] = await Promise.all([
    supabase.from('branches').select('id, name, is_active').order('sort_order').order('id'),
    supabase.from('stages').select('id, name').order('sort_order'),
    supabase.from('grades').select('id, name, stage_id').order('sort_order'),
    supabase.from('sections').select('id, name').order('sort_order'),
    supabase.from('classes').select('id, branch_id, grade_id, section_id').eq('is_active', true),
  ]);
  const stages = (st.data ?? []) as { id: number; name: string }[];
  const grades = ((g.data ?? []) as { id: number; name: string; stage_id: number }[]).map((x) => {
    const stage = stages.find((s) => s.id === x.stage_id)?.name ?? '';
    const stageAdj = stage.replace(/ية$/, 'ي').replace(/ة$/, '');
    const has = stage && gradeKey(x.name).split(' ').some((w) => gradeKey(stage).split(' ').includes(w) && w.length > 3);
    return { ...x, stage, label: has || !stage ? x.name : `${x.name} ${stageAdj}`, key: gradeKey(`${x.name} ${stage}`) };
  });
  return {
    supabase,
    branches: ((b.data ?? []) as { id: number; name: string; is_active: boolean }[]).filter((x) => x.is_active !== false),
    grades,
    sections: (sec.data ?? []) as { id: number; name: string }[],
    classes: (cls.data ?? []) as { id: number; branch_id: number; grade_id: number; section_id: number }[],
  };
}

/* ------------------------------ النموذج ------------------------------ */
export async function studentTemplate(): Promise<Res<{ b64: string; name: string }>> {
  await requireUser(ADMIN);
  try {
    const ref = await loadRef();
    const school = await getSchoolName();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'مِرقاة';
    const ws = wb.addWorksheet('الطلاب', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    styleHead(ws, [
      { h: 'الرقم الأكاديمي', w: 16, required: true, text: true, note: 'رقم الطالب في المدرسة — يصبح اسم المستخدم. يمنع التكرار عند إعادة الرفع. اتركه فارغًا ليُولَّد تلقائيًا' },
      { h: 'اسم الطالب (عربي)', w: 34, required: true, note: 'مطلوب — الاسم الرباعي' },
      { h: 'الصف الدراسي', w: 20, required: true, note: 'مطلوب — من القائمة' },
      { h: 'الشعبة', w: 10, note: 'من القائمة. إن كان للصف شعبة واحدة في الفرع يُضم إليها تلقائيًا' },
      { h: 'الفرع', w: 22, note: 'من القائمة، أو اختر الفرع الافتراضي عند الرفع' },
      { h: 'اسم الطالب (إنجليزي)', w: 30, note: 'اختياري — يظهر في الشهادة' },
      { h: 'تاريخ الميلاد', w: 14, text: true, note: 'اختياري — ميلادي (2012-03-04) أو هجري كما هو' },
      { h: 'الجنسية', w: 14, note: 'اختياري' },
      { h: 'رقم الهوية', w: 16, text: true, note: 'اختياري — لا يتكرر لطالبين' },
      { h: 'الجنس', w: 10, note: 'اختياري — ذكر / أنثى' },
      { h: 'حالة الرسوم', w: 18, note: 'اختياري' },
    ]);
    const lists = wb.addWorksheet('lists', { state: 'hidden' });
    ref.grades.forEach((g, i) => (lists.getCell(i + 1, 1).value = g.label));
    ref.sections.forEach((s, i) => (lists.getCell(i + 1, 2).value = s.name));
    ref.branches.forEach((b, i) => (lists.getCell(i + 1, 3).value = b.name));
    ['ذكر', 'أنثى'].forEach((v, i) => (lists.getCell(i + 1, 4).value = v));
    FEES.forEach((v, i) => (lists.getCell(i + 1, 5).value = v));
    const N = 5000;
    if (ref.grades.length) listValidation(ws, `C2:C${N}`, `lists!$A$1:$A$${ref.grades.length}`, 'الصف الدراسي');
    if (ref.sections.length) listValidation(ws, `D2:D${N}`, `lists!$B$1:$B$${ref.sections.length}`, 'الشعبة', false);
    if (ref.branches.length) listValidation(ws, `E2:E${N}`, `lists!$C$1:$C$${ref.branches.length}`, 'الفرع');
    listValidation(ws, `J2:J${N}`, 'lists!$D$1:$D$2', 'الجنس');
    listValidation(ws, `K2:K${N}`, `lists!$E$1:$E$${FEES.length}`, 'حالة الرسوم', false);
    helpSheet(wb, [
      [`${school} — نموذج استيراد الطلاب`, 'title'],
      ['طريقة الاستخدام', 'h'],
      ['1. انسخ بيانات الطلاب والصقها في ورقة «الطلاب» بدءًا من الصف الثاني (العمود الأخضر مطلوب).', 'p'],
      ['2. احفظ الملف بصيغة xlsx، ثم ارفعه من: الإعدادات ← الاستيراد من Excel ← الطلاب. تظهر معاينة تدقق كل صف قبل الحفظ.', 'p'],
      ['3. بعد الحفظ: أنشئ حسابات الدخول من «حسابات الطلاب» ← «إنشاء الحسابات الناقصة» (اسم المستخدم = الرقم الأكاديمي).', 'p'],
      ['الرقم الأكاديمي', 'h'],
      ['• هو المفتاح: إعادة رفع الملف تحدّث بيانات الطالب الموجود بنفس الرقم ولا تكرره. شعبته لا تتغير إلا إذا كتبت شعبة جديدة.', 'p'],
      ['• إن تركته فارغًا يُولَّد رقم تلقائي (S0001…) — لكن إعادة رفع الملف حينها تكرر الطالب.', 'p'],
      ['الأعمدة يمكن أن تكون بأي ترتيب', 'h'],
      ['• يتعرف الموقع على العناوين بأسمائها الشائعة (الاسم، اسم الطالب، الصف، رقم الطالب، الهوية…). ويمكن لصق ورقة الطلاب من النظام القديم كما هي.', 'p'],
      ['الصفوف المتاحة: ' + (ref.grades.map((g) => g.label).join('، ') || '—'), 'p'],
      ['الشعب المتاحة: ' + (ref.sections.map((s) => s.name).join('، ') || '—'), 'p'],
      ['الفروع: ' + (ref.branches.map((b) => b.name).join('، ') || '—'), 'p'],
    ]);
    return { ok: true, data: { b64: await toBase64(wb), name: 'نموذج-استيراد-الطلاب.xlsx' } };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

/* ------------------------------ القراءة والتدقيق ------------------------------ */
export type StudentRow = {
  row: number;
  code: string | null;
  name_ar: string;
  name_en: string | null;
  grade: string;
  section: string;
  branch: string;
  birth_date: string | null;
  nationality: string | null;
  national_id: string | null;
  gender: string | null;
  fee_status: string | null;
  branch_id?: number;
  grade_id?: number;
  section_id?: number | null;
  newSection?: boolean;
  existing?: boolean;
  warn?: string;
  error?: string;
};
export type StudentPreview = {
  total: number;
  valid: number;
  errors: number;
  updates: number;
  noCode: number;
  noSection: number;
  newSections: string[];
  headers: { key: string; label: string; found: string | null }[];
  rows: StudentRow[];
};

const COLS = {
  code: ['الرقم الأكاديمي', 'رقم أكاديمي', 'رقم الطالب', 'رمز الطالب', 'الرقم', 'رقم القيد', 'Students_id', 'student id', 'academic number', 'code'],
  name_ar: ['اسم الطالب (عربي)', 'اسم الطالب الرباعي (عربي)', 'اسم الطالب الرباعي', 'اسم الطالب', 'اسم الطالبة', 'الاسم', 'الاسم الكامل', 'الاسم الرباعي', 'الاسم بالعربي', 'name_ar'],
  name_en: ['اسم الطالب (إنجليزي)', 'اسم الطالب بالإنجليزي', 'الاسم بالإنجليزي', 'الاسم الإنجليزي', 'english name', 'name en', 'name_en'],
  grade: ['الصف الدراسي', 'الصف', 'grades', 'grade'],
  stage: ['المرحلة', 'المرحلة الدراسية', 'stages', 'stage'],
  section: ['الشعبة', 'الفصل', 'sections', 'section'],
  branch: ['الفرع', 'اسم الفرع', 'branch'],
  birth_date: ['تاريخ الميلاد', 'الميلاد', 'birth date', 'date of birth'],
  nationality: ['الجنسية', 'nationality'],
  national_id: ['رقم الهوية', 'الهوية', 'السجل المدني', 'رقم الإقامة', 'national id', 'id number'],
  gender: ['الجنس', 'النوع', 'gender'],
  fee_status: ['حالة الرسوم', 'الرسوم', 'fee status'],
} as const;
type ColKey = keyof typeof COLS;
const LABEL: Record<ColKey, string> = {
  code: 'الرقم الأكاديمي', name_ar: 'الاسم', name_en: 'الاسم بالإنجليزي', grade: 'الصف', stage: 'المرحلة', section: 'الشعبة', branch: 'الفرع',
  birth_date: 'الميلاد', nationality: 'الجنسية', national_id: 'الهوية', gender: 'الجنس', fee_status: 'الرسوم',
};

async function parseStudents(file: File, defaultBranch: number | null, ref: Ref): Promise<StudentPreview> {
  const wb = await readBook(file);
  const t = findTable(wb, COLS as unknown as Record<ColKey, string[]>, ['name_ar', 'grade'], 'الطلاب');
  if (!t) throw new Error('لم أجد عمودي «اسم الطالب» و«الصف الدراسي» في أول 10 صفوف من الملف');
  const { ws, headerRow, map } = t;

  const bFind = (s: string) => ref.branches.find((b) => nameKey(b.name) === nameKey(s));
  const gIndex = new Map(ref.grades.map((g) => [g.key, g]));
  const secFind = (s: string) => ref.sections.find((x) => sectionKey(x.name) === sectionKey(s));

  const rows: StudentRow[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k: ColKey) => (map[k] ? cellText(row.getCell(map[k]!).value).trim() : '');
    const name = get('name_ar').replace(/\s+/g, ' ');
    if (!name) continue;
    const g = normAr(get('gender'));
    rows.push({
      row: r,
      code: digits(get('code')).replace(/\s+/g, '') || null,
      name_ar: name,
      name_en: get('name_en').replace(/\s+/g, ' ') || null,
      grade: [get('grade'), get('stage') && !gradeKey(get('grade')).includes(gradeKey(get('stage'))) ? get('stage') : ''].filter(Boolean).join(' '),
      section: get('section'),
      branch: get('branch'),
      birth_date: get('birth_date') || null,
      nationality: get('nationality') || null,
      national_id: digits(get('national_id')).replace(/\s+/g, '') || null,
      gender: /ذكر|ولد|طالب$|^m$|male/.test(g) ? 'ذكر' : /انث|بنت|طالبه|^f$|female/.test(g) ? 'أنثى' : get('gender') || null,
      fee_status: get('fee_status') || null,
    });
  }
  if (!rows.length) throw new Error('لا صفوف بيانات تحت العناوين');
  if (rows.length > 5000) throw new Error('الحد 5000 طالب في الملف الواحد');

  // الموجود مسبقًا (بالرقم) والهويات المسجلة لغيرهم — على دفعات
  const codes = [...new Set(rows.map((x) => x.code).filter(Boolean) as string[])];
  const nids = [...new Set(rows.map((x) => x.national_id).filter(Boolean) as string[])];
  const existing = new Set<string>();
  const nidOwner = new Map<string, string>();
  for (let i = 0; i < codes.length; i += 300) {
    const { data } = await ref.supabase.from('students').select('code').in('code', codes.slice(i, i + 300));
    (data ?? []).forEach((d) => existing.add(d.code as string));
  }
  for (let i = 0; i < nids.length; i += 300) {
    const { data } = await ref.supabase.from('students').select('code, national_id').in('national_id', nids.slice(i, i + 300));
    (data ?? []).forEach((d) => nidOwner.set(d.national_id as string, d.code as string));
  }

  const seenCode = new Set<string>();
  const seenNid = new Set<string>();
  const newSections = new Set<string>();
  for (const it of rows) {
    const errs: string[] = [];
    if (it.name_ar.split(' ').length < 2) errs.push('الاسم ناقص');
    if (it.code && !/^[\w-]{1,30}$/.test(it.code)) errs.push('الرقم الأكاديمي فيه رموز غير مقبولة');
    if (it.code && seenCode.has(it.code)) errs.push('الرقم مكرر في الملف');
    if (it.code) seenCode.add(it.code);
    if (it.national_id) {
      if (seenNid.has(it.national_id)) errs.push('رقم الهوية مكرر في الملف');
      seenNid.add(it.national_id);
      const owner = nidOwner.get(it.national_id);
      if (owner && owner !== it.code) errs.push(`رقم الهوية مسجّل للطالب ${owner}`);
    }
    if (it.birth_date && /^\d{4}-\d{2}-\d{2}$/.test(it.birth_date) && Number.isNaN(Date.parse(it.birth_date))) errs.push('تاريخ الميلاد غير صحيح');

    const b = it.branch ? bFind(it.branch) : ref.branches.find((x) => x.id === defaultBranch) ?? (ref.branches.length === 1 ? ref.branches[0] : undefined);
    if (!b) errs.push(it.branch ? `الفرع «${it.branch}» غير موجود` : 'حدد الفرع (عمود الفرع أو الفرع الافتراضي)');
    const g = gIndex.get(gradeKey(it.grade));
    if (!g) errs.push(`الصف «${it.grade || 'فارغ'}» غير معروف`);
    if (b && g) {
      it.branch_id = b.id;
      it.grade_id = g.id;
      it.branch = b.name;
      it.grade = g.label;
      if (it.section) {
        const s = secFind(it.section);
        if (s) {
          it.section_id = s.id;
          it.section = s.name;
        } else {
          it.newSection = true;
          newSections.add(it.section.trim());
        }
      } else {
        const only = ref.classes.filter((c) => c.branch_id === b.id && c.grade_id === g.id);
        if (only.length === 1) {
          it.section_id = only[0].section_id;
          it.section = ref.sections.find((s) => s.id === only[0].section_id)?.name ?? '';
        } else if (!(it.code && existing.has(it.code))) {
          it.warn = only.length ? 'بلا شعبة — حدّدها لاحقًا ليظهر لمعلميه' : 'لا فصل لهذا الصف في الفرع بعد';
        }
      }
    }
    if (it.code && existing.has(it.code)) it.existing = true;
    if (errs.length) it.error = errs.join('، ');
  }

  return {
    total: rows.length,
    valid: rows.filter((r) => !r.error).length,
    errors: rows.filter((r) => r.error).length,
    updates: rows.filter((r) => !r.error && r.existing).length,
    noCode: rows.filter((r) => !r.error && !r.code).length,
    noSection: rows.filter((r) => !r.error && r.warn).length,
    newSections: [...newSections],
    headers: (Object.keys(COLS) as ColKey[]).map((k) => ({ key: k, label: LABEL[k], found: map[k] ? cellText(ws.getRow(headerRow).getCell(map[k]!).value) : null })),
    rows,
  };
}

export async function previewStudents(fd: FormData): Promise<Res<StudentPreview>> {
  await requireUser(ADMIN);
  try {
    const ref = await loadRef();
    const p = await parseStudents(fd.get('file') as File, Number(fd.get('branch')) || null, ref);
    // للواجهة: الأخطاء أولًا ثم التحذيرات، حتى 400 صف
    const order = (r: StudentRow) => (r.error ? 0 : r.warn ? 1 : 2);
    return { ok: true, data: { ...p, rows: [...p.rows].sort((a, b) => order(a) - order(b) || a.row - b.row).slice(0, 400) } };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function commitStudents(fd: FormData): Promise<Res<{ created: number; updated: number; failed: { row: number; error: string }[]; sections: number }>> {
  await requireUser(ADMIN);
  try {
    const ref = await loadRef();
    const p = await parseStudents(fd.get('file') as File, Number(fd.get('branch')) || null, ref);
    const valid = p.rows.filter((r) => !r.error);
    if (!valid.length) return { ok: false, error: 'لا صفوف صالحة للاستيراد' };

    // الشعب الناقصة: تُنشأ إن وافق الإداري
    let made = 0;
    if (p.newSections.length) {
      if (fd.get('createSections') !== '1') return { ok: false, error: 'في الملف شعب غير موجودة. فعّل «إنشاء الشعب الناقصة» أو صحّح الملف' };
      const { data, error } = await ref.supabase.from('sections').insert(p.newSections.map((name) => ({ name }))).select('id, name');
      if (error) return { ok: false, error: `تعذّر إنشاء الشعب: ${error.message}` };
      made = data?.length ?? 0;
      for (const r of valid.filter((x) => x.newSection)) r.section_id = data?.find((s) => sectionKey(s.name) === sectionKey(r.section))?.id ?? null;
    }

    let created = 0;
    let updated = 0;
    const failed: { row: number; error: string }[] = [];
    for (let i = 0; i < valid.length; i += 1000) {
      const chunk = valid.slice(i, i + 1000);
      const { data, error } = await ref.supabase.rpc('import_students', {
        p_rows: chunk.map((r) => ({
          code: r.code, name_ar: r.name_ar, name_en: r.name_en, nationality: r.nationality, birth_date: r.birth_date,
          national_id: r.national_id, gender: r.gender, fee_status: r.fee_status,
          branch_id: r.branch_id, grade_id: r.grade_id, section_id: r.section_id ?? null,
        })),
      });
      if (error) return { ok: false, error: error.message };
      const d = data as { created: number; updated: number; errors: { i: number; error: string }[] };
      created += d.created;
      updated += d.updated;
      d.errors.forEach((e) => failed.push({ row: chunk[e.i - 1]?.row ?? 0, error: e.error }));
    }
    revalidatePath('/staff/students');
    revalidatePath('/staff/student-accounts');
    return { ok: true, data: { created, updated, failed, sections: made } };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}
