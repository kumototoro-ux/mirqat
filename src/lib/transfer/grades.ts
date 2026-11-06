'use server';

import ExcelJS from 'exceljs';
import { selectAll } from '@/lib/supabase/all';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getSchoolName, getTerms } from '@/lib/data';
import { digits, nameKey, normAr } from './arabic';
import { XL, box, cellText, findTable, helpSheet, readBook, toBase64 } from './excel';

/* =====================================================================
   استيراد مجاميع فصل دراسي (الترم الأول من النظام القديم) — للإدارة
   يقبل ورقة «Grade Aggregation» كما هي: صف لكل (طالب × مادة × ترم)،
   وعمود لكل نوع تقييم فيه الدرجة الموزونة. «اختبار شفهي» يُضم لـ«اختبارات قصيرة».
   ===================================================================== */

type Res<T> = { ok: true; data: T } | { ok: false; error: string };
const ADMIN = ['admin'] as const;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const MERGE: Record<string, string> = { [normAr('اختبار شفهي')]: normAr('اختبارات قصيرة') };

async function loadRef(termId: number) {
  const supabase = await createClient();
  const [terms, subj, ev, w] = await Promise.all([
    getTerms(),
    supabase.from('subjects').select('id, name, name_en'),
    supabase.from('eval_types').select('id, name').order('sort_order'),
    supabase.from('grade_weights').select('subject_id, eval_type_id, weight').gt('weight', 0),
  ]);
  const term = terms.find((t) => t.id === termId);
  if (!term) throw new Error('الفصل الدراسي غير موجود');
  const weights = new Map<string, number>();
  ((w.data ?? []) as { subject_id: number; eval_type_id: number; weight: number }[]).forEach((x) => weights.set(`${x.subject_id}:${x.eval_type_id}`, Number(x.weight)));
  return {
    supabase,
    term,
    subjects: (subj.data ?? []) as { id: number; name: string; name_en: string | null }[],
    types: (ev.data ?? []) as { id: number; name: string }[],
    weights,
  };
}

/* ------------------------------ النموذج ------------------------------ */
export async function gradesTemplate(termId: number, branchId: number | null): Promise<Res<{ b64: string; name: string }>> {
  await requireUser(ADMIN);
  try {
    const ref = await loadRef(termId);
    const school = await getSchoolName();
    const usedTypes = ref.types.filter((t) => [...ref.weights.keys()].some((k) => k.endsWith(`:${t.id}`)));
    // طلاب الفرع مع مواد فصولهم (من توزيع المواد) — صف لكل طالب ومادة، جاهز للتعبئة
    const { data: rows } = await ref.supabase.rpc('backup_rows', { p_table: 'students', p_branch: branchId, p_offset: 0, p_limit: 5000 });
    const { data: matrix } = await selectAll((a, b) => ref.supabase
      .from('subject_matrix')
      .select('branch:branches(name), grade:grades(name), section:sections(name), subject:subjects(name)')
      .order('id')
      .range(a, b));
    const subjFor = (b: string, g: string, s: string) =>
      [...new Set(((matrix ?? []) as unknown as { branch: { name: string } | null; grade: { name: string } | null; section: { name: string } | null; subject: { name: string } | null }[])
        .filter((m) => m.branch?.name === b && m.grade?.name === g && (!m.section || m.section.name === s))
        .map((m) => m.subject?.name ?? '')
        .filter(Boolean))];

    const wb = new ExcelJS.Workbook();
    wb.creator = 'مِرقاة';
    const ws = wb.addWorksheet('Grade Aggregation', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1, xSplit: 2 }] });
    const fixed = ['Students_id', 'اسم الطالب', 'terms', 'branch', 'stages', 'grades', 'sections', 'subject'];
    ws.columns = [14, 32, 14, 18, 14, 12, 10, 22, ...usedTypes.map(() => 13)].map((w) => ({ width: w }));
    const head = ws.getRow(1);
    head.values = [...fixed, ...usedTypes.map((t) => t.name)];
    head.height = 36;
    head.eachCell((c, i) => {
      const isType = i > fixed.length;
      c.font = { name: 'Arial', bold: true, size: 11, color: { argb: isType ? XL.ink : XL.headText } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isType ? 'FFFBF4E4' : XL.head } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = box;
      if (isType) c.note = 'الدرجة الموزونة لهذا النوع (من وزنه في المادة) — اتركها فارغة إن لم يُرصد';
    });
    ws.getColumn(1).numFmt = '@';
    let r = 2;
    for (const s of (rows ?? []) as Record<string, string>[]) {
      if (s['الحالة'] !== 'active') continue;
      for (const subject of subjFor(s['الفرع'], s['الصف'], s['الشعبة'])) {
        ws.getRow(r).values = [s['الرقم'], s['الاسم'], ref.term.name, s['الفرع'], s['المرحلة'], s['الصف'], s['الشعبة'], subject];
        r++;
      }
    }
    // ورقة الأوزان: لمراجعة الحد الأعلى لكل نوع في كل مادة
    const wsW = wb.addWorksheet('الأوزان', { views: [{ rightToLeft: true }] });
    wsW.columns = [24, ...usedTypes.map(() => 13)].map((w) => ({ width: w }));
    wsW.getRow(1).values = ['المادة', ...usedTypes.map((t) => t.name)];
    wsW.getRow(1).eachCell((c) => { c.font = { name: 'Arial', bold: true, color: { argb: XL.headText } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.head } }; c.border = box; c.alignment = { horizontal: 'center', wrapText: true }; });
    ref.subjects.forEach((sj, i) => {
      wsW.getRow(i + 2).values = [sj.name, ...usedTypes.map((t) => ref.weights.get(`${sj.id}:${t.id}`) ?? '')];
    });
    helpSheet(wb, [
      [`${school} — استيراد مجاميع ${ref.term.name} ${ref.term.year}`, 'title'],
      ['أسهل طريقة', 'h'],
      ['• انسخ ورقة «Grade Aggregation» من النظام القديم كما هي (صفوف الترم الأول) والصقها في ورقة «Grade Aggregation» هنا، أو ارفع ملفها مباشرة.', 'p'],
      ['• أو عبّئ هذا النموذج: فيه صف لكل طالب ومادة من مواد فصله، واكتب الدرجة الموزونة لكل نوع تقييم.', 'p'],
      ['القواعد', 'h'],
      ['• الدرجة في كل نوع موزونة: لا تتجاوز وزن النوع في المادة (ورقة «الأوزان»). الخلية الفارغة = لم يُرصد.', 'p'],
      ['• «اختبار شفهي» يُضم تلقائيًا إلى «اختبارات قصيرة».', 'p'],
      ['• يُطابَق الطالب برقمه (Students_id) فاستورد الطلاب أولًا. وتُطابَق المادة باسمها.', 'p'],
      ['• عمود terms: الصفوف التي لا تخص الفصل الدراسي المختار تُتجاهل. وإعادة الرفع تحدّث الدرجات ولا تكررها.', 'p'],
    ]);
    return { ok: true, data: { b64: await toBase64(wb), name: `نموذج-مجاميع-${ref.term.name.replace(/\s+/g, '-')}.xlsx` } };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

/* ------------------------------ القراءة والتدقيق ------------------------------ */
export type GradeIssue = { row: number; code: string; subject: string; error: string };
export type GradesPreview = {
  rows: number;
  values: number;
  students: number;
  subjects: number;
  skippedTerm: number;
  types: { title: string; matched: string | null }[];
  issues: GradeIssue[];
  issueCount: number;
  sample: { code: string; name: string; subject: string; total: number }[];
};
type Value = { student_id: number; subject_id: number; eval_type_id: number; value: number };

const COLS = {
  code: ['Students_id', 'الرقم الأكاديمي', 'رقم الطالب', 'رمز الطالب', 'الرقم', 'code'],
  name: ['اسم الطالب', 'الاسم', 'student name'],
  term: ['terms', 'الفصل الدراسي', 'الترم', 'term'],
  subject: ['subject', 'المادة', 'اسم المادة'],
  visible: ['امكانية الرؤية', 'إمكانية الرؤية', 'visible'],
  branch: ['branch', 'الفرع'],
  stage: ['stages', 'المرحلة'],
  grade: ['grades', 'الصف'],
  section: ['sections', 'الشعبة'],
} as const;
type ColKey = keyof typeof COLS;

async function parseGrades(file: File, termId: number) {
  const ref = await loadRef(termId);
  const wb = await readBook(file, 6 * 1024 * 1024);
  const t = findTable(wb, COLS as unknown as Record<ColKey, string[]>, ['code', 'subject'], 'Grade Aggregation');
  if (!t) throw new Error('لم أجد عمودي «Students_id» و«subject» (أو «رقم الطالب» و«المادة») في أول 10 صفوف');
  const { ws, headerRow, map, extra } = t;

  const typeIndex = new Map(ref.types.map((x) => [normAr(x.name), x]));
  const typeCols = extra
    .map((e) => {
      const k = normAr(e.title);
      const ty = typeIndex.get(MERGE[k] ?? k);
      return { col: e.col, title: e.title, type: ty ?? null };
    })
    .filter((x) => x.type || /اختبار|واجب|مشارك|بحوث|اوراق|عمل/.test(normAr(x.title)));
  if (!typeCols.some((x) => x.type)) throw new Error('لم أجد أعمدة أنواع التقييم (واجبات، اختبارات قصيرة…) بأسماء أنواع التقييم في الموقع');

  const subjIndex = new Map<string, { id: number; name: string }>();
  ref.subjects.forEach((s) => {
    subjIndex.set(nameKey(s.name), s);
    if (s.name_en) subjIndex.set(nameKey(s.name_en), s);
  });
  const termKey = nameKey(ref.term.name);

  type Raw = { row: number; code: string; name: string; subject: string; cells: { type: { id: number; name: string }; raw: string }[] };
  const raws: Raw[] = [];
  let skippedTerm = 0;
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k: ColKey) => (map[k] ? cellText(row.getCell(map[k]!).value).trim() : '');
    const code = digits(get('code')).replace(/\s+/g, '');
    if (!code) continue;
    const term = get('term');
    if (term && nameKey(term) !== termKey) {
      skippedTerm++;
      continue;
    }
    raws.push({
      row: r, code, name: get('name'), subject: get('subject').replace(/\s+/g, ' '),
      cells: typeCols.filter((x) => x.type).map((x) => ({ type: x.type!, raw: cellText(row.getCell(x.col).value).trim() })),
    });
  }
  if (!raws.length) throw new Error(skippedTerm ? `كل الصفوف (${skippedTerm}) لفصل دراسي آخر — تأكد من اختيار ${ref.term.name}` : 'لا صفوف بيانات تحت العناوين');

  // الطلاب بأرقامهم
  const codes = [...new Set(raws.map((x) => x.code))];
  const students = new Map<string, { id: number; class_id: number | null }>();
  for (let i = 0; i < codes.length; i += 300) {
    const { data } = await ref.supabase.from('students').select('id, code, class_id').in('code', codes.slice(i, i + 300));
    (data ?? []).forEach((d) => students.set(d.code as string, { id: d.id as number, class_id: d.class_id as number | null }));
  }

  const issues: GradeIssue[] = [];
  const acc = new Map<string, Value>(); // (طالب، مادة، نوع) — الشفهي يُجمع مع القصيرة
  for (const x of raws) {
    const st = students.get(x.code);
    const sj = subjIndex.get(nameKey(x.subject));
    if (!st) { issues.push({ row: x.row, code: x.code, subject: x.subject, error: 'الطالب غير موجود — استورد الطلاب أولًا' }); continue; }
    if (!st.class_id) { issues.push({ row: x.row, code: x.code, subject: x.subject, error: 'الطالب بلا فصل (شعبة)' }); continue; }
    if (!sj) { issues.push({ row: x.row, code: x.code, subject: x.subject, error: `المادة «${x.subject || 'فارغة'}» غير موجودة` }); continue; }
    for (const c of x.cells) {
      if (c.raw === '' || c.raw === '-' || c.raw === '—') continue;
      const v = Number(digits(c.raw).replace(',', '.'));
      if (!Number.isFinite(v) || v < 0) { issues.push({ row: x.row, code: x.code, subject: sj.name, error: `«${c.type.name}»: قيمة غير رقمية (${c.raw})` }); continue; }
      const key = `${st.id}:${sj.id}:${c.type.id}`;
      const cur = acc.get(key);
      acc.set(key, { student_id: st.id, subject_id: sj.id, eval_type_id: c.type.id, value: (cur?.value ?? 0) + v });
    }
  }
  // الحد: لا تتجاوز وزن النوع
  const values: Value[] = [];
  const byStudent = new Map([...students.entries()].map(([code, s]) => [s.id, code]));
  for (const v of acc.values()) {
    const w = ref.weights.get(`${v.subject_id}:${v.eval_type_id}`) ?? 0;
    const tName = ref.types.find((t) => t.id === v.eval_type_id)?.name ?? '';
    const sName = ref.subjects.find((s) => s.id === v.subject_id)?.name ?? '';
    if (w <= 0) issues.push({ row: 0, code: byStudent.get(v.student_id) ?? '', subject: sName, error: `«${tName}» بلا وزن في هذه المادة (الإعدادات ← توزيع الدرجات)` });
    else if (v.value > w + 0.005) issues.push({ row: 0, code: byStudent.get(v.student_id) ?? '', subject: sName, error: `«${tName}» ${v.value} أكبر من وزنه ${w}` });
    else values.push({ ...v, value: Math.round(v.value * 100) / 100 });
  }
  // العينة من القيم المقبولة فقط (كما ستظهر في النتائج)
  const names = new Map(raws.map((x) => [x.code, x.name]));
  const ok = new Map<string, { code: string; name: string; subject: string; total: number }>();
  for (const v of values) {
    const code = byStudent.get(v.student_id) ?? '';
    const k = `${v.student_id}:${v.subject_id}`;
    const t = ok.get(k) ?? { code, name: names.get(code) ?? '', subject: ref.subjects.find((s) => s.id === v.subject_id)?.name ?? '', total: 0 };
    t.total += v.value;
    ok.set(k, t);
  }
  return { ref, raws, values, issues, skippedTerm, typeCols, totals: [...ok.values()] };
}

export async function previewGrades(fd: FormData): Promise<Res<GradesPreview>> {
  await requireUser(ADMIN);
  try {
    const p = await parseGrades(fd.get('file') as File, Number(fd.get('term')));
    return {
      ok: true,
      data: {
        rows: p.raws.length,
        values: p.values.length,
        students: new Set(p.values.map((v) => v.student_id)).size,
        subjects: new Set(p.values.map((v) => v.subject_id)).size,
        skippedTerm: p.skippedTerm,
        types: p.typeCols.map((x) => ({ title: x.title, matched: x.type?.name ?? null })),
        issues: p.issues.slice(0, 300),
        issueCount: p.issues.length,
        sample: p.totals.slice(0, 12).map((t) => ({ ...t, total: Math.round(t.total * 100) / 100 })),
      },
    };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function commitGrades(fd: FormData): Promise<Res<{ saved: number; failed: number }>> {
  await requireUser(ADMIN);
  try {
    const termId = Number(fd.get('term'));
    const p = await parseGrades(fd.get('file') as File, termId);
    if (!p.values.length) return { ok: false, error: 'لا درجات صالحة للحفظ' };
    let saved = 0;
    let failed = 0;
    for (let i = 0; i < p.values.length; i += 4000) {
      const { data, error } = await p.ref.supabase.rpc('import_term_grades', { p_term: termId, p_rows: p.values.slice(i, i + 4000) });
      if (error) return { ok: false, error: error.message };
      const d = data as { saved: number; errors: unknown[] };
      saved += d.saved;
      failed += d.errors.length;
    }
    revalidatePath('/staff/results');
    return { ok: true, data: { saved, failed } };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}
