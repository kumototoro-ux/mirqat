import 'server-only';
import ExcelJS from 'exceljs';
import { normAr } from './arabic';

/* أدوات Excel المشتركة للاستيراد: قراءة آمنة للخلايا، اكتشاف صف العناوين، وتنسيق النماذج */

export const XL = { head: 'FF356854', headText: 'FFFFFFFF', opt: 'FFEAF2EE', ink: 'FF1F2A24', gold: 'FFD9A441', line: 'FFDFE5E2' };
const thin = { style: 'thin' as const, color: { argb: XL.line } };
export const box = { top: thin, left: thin, bottom: thin, right: thin };

export function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('result' in v) return v.result instanceof Date ? v.result.toISOString().slice(0, 10) : String(v.result ?? '');
    if ('error' in v) return '';
  }
  return String(v).trim();
}

export async function readBook(file: File, maxBytes = 3 * 1024 * 1024) {
  if (!(file instanceof File) || !file.size) throw new Error('اختر ملف Excel');
  if (file.size > maxBytes) throw new Error(`حجم الملف أكبر من ${Math.round(maxBytes / 1024 / 1024)} ميجابايت`);
  if (!/\.xlsx$/i.test(file.name)) throw new Error('الصيغة المطلوبة xlsx (احفظ الملف من Excel بصيغة Excel Workbook)');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error('تعذّرت قراءة الملف. تأكد أنه بصيغة xlsx وغير محمي بكلمة مرور');
  }
  return wb;
}

/**
 * يبحث في أول 10 صفوف من كل ورقة ظاهرة عن صف العناوين الذي يحوي الأعمدة المطلوبة،
 * ويعيد الورقة ورقم الصف وخريطة (مفتاح ← رقم العمود)
 */
export function findTable<K extends string>(wb: ExcelJS.Workbook, aliases: Record<K, string[]>, required: NoInfer<K>[], prefer?: string) {
  const index = new Map<string, K>();
  (Object.entries(aliases) as [K, string[]][]).forEach(([k, names]) => names.forEach((n) => { if (!index.has(normAr(n))) index.set(normAr(n), k); }));
  const sheets = [...wb.worksheets].filter((w) => w.state === 'visible' || w.name === prefer).sort((a, b) => Number(b.name === prefer) - Number(a.name === prefer));
  for (const ws of sheets) {
    for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
      const map: Partial<Record<K, number>> = {};
      const extra: { col: number; title: string }[] = [];
      ws.getRow(r).eachCell((c, col) => {
        const t = cellText(c.value);
        const k = index.get(normAr(t));
        if (k && !map[k]) map[k] = col;
        else if (t) extra.push({ col, title: t });
      });
      if (required.every((k) => map[k])) return { ws, headerRow: r, map, extra };
    }
  }
  return null;
}

/** يلوّن صف العناوين ويضيف ملاحظة لكل عمود */
export function styleHead(ws: ExcelJS.Worksheet, cols: { h: string; w: number; note?: string; required?: boolean; text?: boolean }[]) {
  ws.columns = cols.map((c) => ({ width: c.w }));
  const head = ws.getRow(1);
  head.values = cols.map((c) => c.h);
  head.height = 34;
  head.eachCell((c, i) => {
    const col = cols[i - 1];
    c.font = { name: 'Arial', bold: true, size: 11, color: { argb: col.required ? XL.headText : XL.ink } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col.required ? XL.head : XL.opt } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = box;
    if (col.note) c.note = col.note;
  });
  cols.forEach((c, i) => { if (c.text) ws.getColumn(i + 1).numFmt = '@'; });
}

export function listValidation(ws: ExcelJS.Worksheet, range: string, formula: string, title: string, strict = true) {
  const dv = (ws as unknown as { dataValidations: { add: (r: string, v: Record<string, unknown>) => void } }).dataValidations;
  dv.add(range, {
    type: 'list', allowBlank: true, formulae: [formula], showErrorMessage: true, errorStyle: strict ? 'stop' : 'warning',
    errorTitle: title, error: strict ? 'اختر قيمة من القائمة المنسدلة' : 'القيمة ليست في القائمة — يمكنك المتابعة',
  });
}

export function helpSheet(wb: ExcelJS.Workbook, lines: [string, 'title' | 'h' | 'p'][]) {
  const help = wb.addWorksheet('التعليمات', { views: [{ rightToLeft: true }] });
  help.getColumn(1).width = 3;
  help.getColumn(2).width = 100;
  lines.forEach(([t, kind], i) => {
    const c = help.getCell(i + 2, 2);
    c.value = t;
    c.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
    c.font = kind === 'title' ? { name: 'Arial', size: 16, bold: true, color: { argb: XL.head } }
      : kind === 'h' ? { name: 'Arial', size: 12.5, bold: true, color: { argb: 'FF8A6116' } }
      : { name: 'Arial', size: 11.5, color: { argb: XL.ink } };
    help.getRow(i + 2).height = kind === 'title' ? 34 : kind === 'h' ? 28 : t.length > 95 ? 36 : 22;
  });
}

export async function toBase64(wb: ExcelJS.Workbook) {
  return Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
}
