import 'server-only';
import ExcelJS from 'exceljs';
import { SECTIONS, rating, type ClassReport } from './shared';

/**
 * كشف نتائج فصل كامل لفصل دراسي — ملف Excel احترافي للإدارة:
 *  ورقة "الكشف": كل بيانات الطالب + لكل مادة: كل نوع تقييم وأقسامه ومجموعها وتقديرها + الإجمالي والمواظبة والسلوك
 *  ورقة "تحليل المواد": المتوسط والأعلى والأدنى ونسبة النجاح والممتازين لكل مادة
 */
const GREEN = 'FF356854';
const DEEP = 'FF284E3F';
const GOLD = 'FFD9A441';
const PAPER = 'FFF5F7F6';
const LINE = 'FFDFE5E2';
const FONT = 'Arial';
const SUBJECT_FILLS = ['FFEAF2EE', 'FFFBF4E4'];

const thin = { style: 'thin' as const, color: { argb: LINE } };
const border = { top: thin, left: thin, bottom: thin, right: thin };
const ratingFill = (p: number | null | undefined) => {
  const r = rating(p);
  if (!r) return undefined;
  return { ar: r.ar, argb: 'FF' + r.text.slice(1).toUpperCase() };
};

export async function buildResultsWorkbook(rep: ClassReport, classTitle: string, school: string): Promise<ArrayBuffer> {
  const termTitle = rep.term ? `${rep.term.name} ${rep.term.year}` : '';
  const wb = new ExcelJS.Workbook();
  wb.creator = 'مِرقاة';
  wb.created = new Date();
  const ws = wb.addWorksheet('الكشف', { views: [{ rightToLeft: true, state: 'frozen', xSplit: 3, ySplit: 4 }], properties: { defaultRowHeight: 20 } });

  /* ---------------- تعريف الأعمدة ---------------- */
  type Col = { head: string; en?: string; width: number; group: string; groupEn?: string; fill?: string; get: (s: ClassReport['students'][number]) => string | number | null; rate?: (s: ClassReport['students'][number]) => number | null; num?: boolean; bold?: boolean };
  const info: Col[] = [
    { head: 'م', width: 5, group: 'بيانات الطالب', groupEn: 'Student', get: () => null },
    { head: 'رقم الطالب', en: 'Student No.', width: 12, group: 'بيانات الطالب', get: (s) => s.code },
    { head: 'الاسم بالعربي', en: 'Name (AR)', width: 30, group: 'بيانات الطالب', get: (s) => s.name_ar, bold: true },
    { head: 'الاسم بالإنجليزي', en: 'Name (EN)', width: 26, group: 'بيانات الطالب', get: (s) => s.name_en },
    { head: 'رقم الهوية', en: 'National ID', width: 14, group: 'بيانات الطالب', get: (s) => s.national_id },
    { head: 'الجنسية', en: 'Nationality', width: 12, group: 'بيانات الطالب', get: (s) => s.nationality },
    { head: 'تاريخ الميلاد', en: 'Birth Date', width: 13, group: 'بيانات الطالب', get: (s) => s.birth_date },
    { head: 'الجنس', en: 'Gender', width: 8, group: 'بيانات الطالب', get: (s) => s.gender },
    { head: 'الفرع', en: 'Branch', width: 14, group: 'بيانات الطالب', get: (s) => s.branch },
    { head: 'المرحلة', en: 'Stage', width: 11, group: 'بيانات الطالب', get: (s) => s.stage },
    { head: 'الصف', en: 'Grade', width: 9, group: 'بيانات الطالب', get: (s) => s.grade },
    { head: 'الشعبة', en: 'Section', width: 8, group: 'بيانات الطالب', get: (s) => s.section },
    { head: 'نظام الدراسة', en: 'Mode', width: 11, group: 'بيانات الطالب', get: (s) => (s.is_intisab ? 'انتساب' : 'انتظام') },
    { head: 'حالة الرسوم', en: 'Fees', width: 11, group: 'بيانات الطالب', get: (s) => s.fee_status },
    { head: 'تاريخ التسجيل', en: 'Enrolled', width: 12, group: 'بيانات الطالب', get: (s) => (s.enrolled_at ? s.enrolled_at.slice(0, 10) : null) },
  ];
  const subjCols: Col[] = [];
  rep.subjects.forEach((sub, i) => {
    const fill = SUBJECT_FILLS[i % 2];
    const pick = (s: ClassReport['students'][number]) => s.subjects.find((x) => x.subject_id === sub.id);
    for (const e of sub.evals) {
      subjCols.push({ head: `${e.name} (${e.weight})`, en: e.name_en ?? undefined, width: 11, group: sub.name, groupEn: sub.name_en ?? undefined, fill, num: true, get: (s) => { const v = pick(s)?.evals[String(e.id)]; return v == null ? null : Number(v); } });
    }
    for (const sec of SECTIONS) {
      if (!(Number(sub[sec.key]) > 0)) continue;
      subjCols.push({ head: `${sec.ar} (${Number(sub[sec.key])})`, en: sec.en, width: 13, group: sub.name, groupEn: sub.name_en ?? undefined, fill, num: true, bold: true, get: (s) => { const v = pick(s)?.[sec.key]; return v == null ? null : Number(v); } });
    }
    subjCols.push({ head: `المجموع (${Number(sub.max)})`, en: 'Total', width: 11, group: sub.name, groupEn: sub.name_en ?? undefined, fill, num: true, bold: true, get: (s) => { const v = pick(s)?.total; return v == null ? null : Number(v); }, rate: (s) => pick(s)?.pct ?? null });
    subjCols.push({ head: 'التقدير', en: 'Grade', width: 10, group: sub.name, groupEn: sub.name_en ?? undefined, fill, get: (s) => pick(s)?.rating_ar ?? null, rate: (s) => pick(s)?.pct ?? null });
  });
  const tail: Col[] = [
    { head: 'المجموع العام', en: 'Grand Total', width: 12, group: 'الإجمالي', groupEn: 'Overall', num: true, bold: true, get: (s) => (s.total == null ? null : Number(s.total)) },
    { head: 'من', en: 'Out of', width: 8, group: 'الإجمالي', num: true, get: (s) => (s.max_total == null ? null : Number(s.max_total)) },
    { head: 'المعدل %', en: 'Average', width: 10, group: 'الإجمالي', num: true, bold: true, get: (s) => (s.average == null ? null : Number(s.average)), rate: (s) => s.average },
    { head: 'الأداء حتى الآن %', en: 'So far', width: 11, group: 'الإجمالي', num: true, get: (s) => (s.progress == null ? null : Number(s.progress)), rate: (s) => s.progress },
    { head: 'التقدير العام', en: 'Overall Grade', width: 12, group: 'الإجمالي', get: (s) => s.rating_ar, rate: (s) => s.average },
    { head: 'Grade', en: 'English', width: 11, group: 'الإجمالي', get: (s) => s.rating_en },
    { head: 'الترتيب', en: 'Rank', width: 8, group: 'الإجمالي', num: true, bold: true, get: (s) => s.rank },
    { head: 'المواظبة %', en: 'Attendance', width: 11, group: 'المواظبة والسلوك', groupEn: 'Attendance & Behavior', num: true, get: (s) => (s.attendance.pct == null ? (s.attendance.intisab ? 'طالب منتسب' : null) : Number(s.attendance.pct)), rate: (s) => s.attendance.pct },
    { head: 'حصص مسجّلة', en: 'Sessions', width: 10, group: 'المواظبة والسلوك', num: true, get: (s) => s.attendance.total },
    { head: 'غياب', en: 'Absent', width: 8, group: 'المواظبة والسلوك', num: true, get: (s) => s.attendance.absent },
    { head: 'تأخر', en: 'Late', width: 8, group: 'المواظبة والسلوك', num: true, get: (s) => s.attendance.late },
    { head: 'استئذان', en: 'Excused', width: 9, group: 'المواظبة والسلوك', num: true, get: (s) => s.attendance.excused },
    { head: 'منح مواظبة', en: 'Granted', width: 10, group: 'المواظبة والسلوك', get: (s) => (s.attendance.granted ? 'نعم' : '') },
    { head: 'السلوك', en: 'Behavior', width: 9, group: 'المواظبة والسلوك', num: true, bold: true, get: (s) => Number(s.behavior.score), rate: (s) => s.behavior.score },
    { head: 'ملاحظات سلبية', en: 'Negative', width: 10, group: 'المواظبة والسلوك', num: true, get: (s) => s.behavior.negative },
    { head: 'إيجابي', en: 'Positive', width: 9, group: 'المواظبة والسلوك', num: true, get: (s) => s.behavior.positive },
    { head: 'الإتاحة للطالب', en: 'Visible', width: 12, group: 'المواظبة والسلوك', get: (s) => (rep.access[String(s.id)]?.visible ? 'ظاهرة' : 'محجوبة') },
  ];
  const cols = [...info, ...subjCols, ...tail];
  ws.columns = cols.map((c) => ({ width: c.width }));
  const last = cols.length;

  /* ---------------- العنوان ---------------- */
  ws.mergeCells(1, 1, 1, Math.min(last, 15));
  const t = ws.getCell(1, 1);
  t.value = `${school} — كشف نتائج ${classTitle} — ${termTitle}`;
  t.font = { name: FONT, size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
  t.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
  ws.getRow(1).height = 32;
  for (let c = 16; c <= last; c++) ws.getCell(1, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
  const graded = rep.students.filter((s) => s.average != null);
  const avg = graded.length ? graded.reduce((a, s) => a + Number(s.average), 0) / graded.length : null;
  ws.mergeCells(2, 1, 2, Math.min(last, 15));
  const sub = ws.getCell(2, 1);
  sub.value = `عدد الطلاب: ${rep.students.length}   ·   معدل الفصل: ${avg == null ? '—' : `${Math.round(avg * 100) / 100}% (${rating(avg)?.ar})`}   ·   تاريخ الإصدار: ${new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'long', timeZone: 'Asia/Riyadh' }).format(new Date())}   ·   الدرجات موزونة بنسب توزيع الدرجات`;
  sub.font = { name: FONT, size: 10, color: { argb: 'FF5F6E66' } };
  sub.alignment = { horizontal: 'right', indent: 1 };
  ws.getRow(2).height = 20;

  /* ---------------- رؤوس المجموعات والأعمدة ---------------- */
  const gRow = 3;
  const hRow = 4;
  let start = 1;
  for (let i = 1; i <= cols.length; i++) {
    const c = cols[i - 1];
    const next = cols[i];
    if (!next || next.group !== c.group) {
      if (i > start) ws.mergeCells(gRow, start, gRow, i);
      const cell = ws.getCell(gRow, start);
      cell.value = c.groupEn && c.groupEn !== c.group ? `${c.group}\n${c.groupEn}` : c.group;
      const isSubject = !!c.fill;
      cell.font = { name: FONT, size: 11, bold: true, color: { argb: isSubject ? 'FF1F2A24' : 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isSubject ? (c.fill === SUBJECT_FILLS[0] ? 'FFCFE3D9' : 'FFF3E2B8') : DEEP } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      for (let k = start; k <= i; k++) ws.getCell(gRow, k).border = border;
      start = i + 1;
    }
    const h = ws.getCell(hRow, i);
    h.value = c.en ? `${c.head}\n${c.en}` : c.head;
    h.font = { name: FONT, size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.fill ? GREEN : DEEP } };
    h.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    h.border = border;
  }
  ws.getRow(gRow).height = 34;
  ws.getRow(hRow).height = 56;

  /* ---------------- صفوف الطلاب ---------------- */
  rep.students.forEach((s, idx) => {
    const r = ws.getRow(hRow + 1 + idx);
    cols.forEach((c, j) => {
      const cell = r.getCell(j + 1);
      cell.value = j === 0 ? idx + 1 : c.get(s);
      cell.font = { name: FONT, size: 10, bold: !!c.bold };
      cell.alignment = { horizontal: j === 2 || j === 3 ? 'right' : 'center', vertical: 'middle' };
      cell.border = border;
      if (c.num && typeof cell.value === 'number') cell.numFmt = '0.##';
      const base = c.fill ?? (idx % 2 ? PAPER : 'FFFFFFFF');
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: base } };
      if (c.rate) {
        const f = ratingFill(c.rate(s));
        if (f && cell.value != null) cell.font = { name: FONT, size: 10, bold: true, color: { argb: f.argb } };
      }
    });
    r.height = 21;
  });
  ws.autoFilter = { from: { row: hRow, column: 1 }, to: { row: hRow + rep.students.length, column: last } };

  /* ---------------- ملاحظة ---------------- */
  const noteRow = hRow + rep.students.length + 2;
  ws.mergeCells(noteRow, 1, noteRow, Math.min(last, 15));
  const n = ws.getCell(noteRow, 1);
  n.value = 'التقدير: ممتاز ≥ 90 · جيد جدًا ≥ 80 · جيد ≥ 70 · مقبول ≥ 60 · ضعيف أقل من 60.   المواظبة: (الحصص − الغياب − ربع التأخر) ÷ الحصص.   السلوك: 100 − خصم الملاحظات السلبية.   هذا كشف درجات فصل دراسي وليس شهادة نهائية.';
  n.font = { name: FONT, size: 9, italic: true, color: { argb: 'FF8A6116' } };
  n.alignment = { horizontal: 'right', wrapText: true };
  ws.getRow(noteRow).height = 30;

  /* ---------------- ورقة تحليل المواد ---------------- */
  const an = wb.addWorksheet('تحليل المواد', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 2 }] });
  an.columns = [{ width: 24 }, { width: 22 }, { width: 10 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 12 }];
  an.mergeCells(1, 1, 1, 9);
  const at = an.getCell(1, 1);
  at.value = `تحليل المواد — ${classTitle} — ${termTitle}`;
  at.font = { name: FONT, size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  at.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
  at.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
  an.getRow(1).height = 28;
  const heads = ['المادة', 'Subject', 'من', 'المتوسط', 'الأعلى', 'الأدنى', 'المرصودون', 'نسبة النجاح', 'ممتاز'];
  heads.forEach((h, i) => {
    const c = an.getCell(2, i + 1);
    c.value = h;
    c.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DEEP } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = border;
  });
  rep.subjects.forEach((sj, i) => {
    const vals = rep.students.map((s) => s.subjects.find((x) => x.subject_id === sj.id)).filter((x) => x && x.total != null) as NonNullable<ClassReport['students'][number]['subjects'][number]>[];
    const tot = vals.map((v) => Number(v.total));
    const pct = vals.map((v) => Number(v.pct ?? 0));
    const mean = tot.length ? tot.reduce((a, b) => a + b, 0) / tot.length : null;
    const row = [sj.name, sj.name_en ?? '', Number(sj.max), mean == null ? null : Math.round(mean * 100) / 100, tot.length ? Math.max(...tot) : null, tot.length ? Math.min(...tot) : null, `${vals.length} / ${rep.students.length}`, pct.length ? pct.filter((p) => p >= 60).length / pct.length : null, pct.filter((p) => p >= 90).length];
    row.forEach((v, j) => {
      const c = an.getCell(3 + i, j + 1);
      c.value = v as ExcelJS.CellValue;
      c.font = { name: FONT, size: 10, bold: j === 0 || j === 3 };
      c.alignment = { horizontal: j < 2 ? 'right' : 'center' };
      c.border = border;
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 ? PAPER : 'FFFFFFFF' } };
      if (j === 7 && typeof v === 'number') c.numFmt = '0%';
      else if (typeof v === 'number') c.numFmt = '0.##';
    });
  });
  const goldRow = 4 + rep.subjects.length;
  an.getCell(goldRow, 1).value = 'نسبة النجاح = من حصل على 60% فأكثر من مجموع المادة';
  an.getCell(goldRow, 1).font = { name: FONT, size: 9, italic: true, color: { argb: GOLD } };

  ws.pageSetup = { orientation: 'landscape', paperSize: 9, scale: 70, printTitlesRow: '3:4', printTitlesColumn: 'A:C', margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } };
  an.pageSetup = { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
