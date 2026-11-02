// هندسة ورقة الإجابة (الفقاعات) بالمليمتر — نقية ومشتركة بين الطباعة وقارئ الكاميرا لاحقًا.
// منقولة من Apps Script (EXG/exsCenters) مع دعم عدد خيارات متغير (صح/خطأ = 2، اختيار من متعدد حتى 6).
// ⚠️ أي تغيير هنا يغيّر مواضع الفقاعات: حدّث القارئ معه.

export const OMR = {
  pageW: 210,
  pageH: 297,
  marker: 8,
  markers: [[7, 7], [195, 7], [7, 282], [195, 282]] as [number, number][],
  gridX0: 18,
  gridX1: 192,
  gridY0: 80,
  gridY1: 274,
  bubble: 6,
  rowMax: 10,
  rowMin: 6.8,
  numW: 9,
  pitch: 8.5,
  qr: { x: 20, y: 43.5, s: 23 },
  maxQ: 100,
};

/** رمز QR: MQ2|رقم النموذج|رقم الطالب (0 = ورقة بلا اسم)|اتجاه الحروف R/L|عدد أسئلة الاختيار
 *  الحقلان الأخيران يتيحان للقارئ رسم نفس المواضع، واكتشاف تعديل الأسئلة بعد الطباعة */
export const omrQrText = (assessmentId: number, studentId: number | null, rtl = true, count?: number) =>
  `MQ2|${assessmentId}|${studentId ?? 0}|${rtl ? 'R' : 'L'}${count != null ? `|${count}` : ''}`;

export type OmrQr = { assessmentId: number; studentId: number | null; rtl: boolean; count: number | null };
export function parseOmrQr(text: string): OmrQr | null {
  const m = /^MQ2\|(\d{1,18})\|(\d{1,18})(?:\|([RL]))?(?:\|(\d{1,4}))?$/.exec(text.trim());
  if (!m) return null;
  const sid = Number(m[2]);
  return { assessmentId: Number(m[1]), studentId: sid > 0 ? sid : null, rtl: m[3] !== 'L', count: m[4] != null ? Number(m[4]) : null };
}

export type OmrItem = { n: number; opts: number };

export function omrLayout(items: OmrItem[]) {
  const n = items.length;
  const maxOpts = Math.max(2, ...items.map((i) => i.opts));
  const blockW = OMR.numW + maxOpts * OMR.pitch;
  const fitCols = Math.max(1, Math.floor((OMR.gridX1 - OMR.gridX0) / (blockW + 3)));
  const want = n <= 20 ? 1 : n <= 40 ? 2 : n <= 60 ? 3 : n <= 80 ? 4 : 5;
  const cols = Math.min(want, fitCols);
  const rows = Math.max(1, Math.ceil(n / cols));
  const rowH = Math.min(OMR.rowMax, (OMR.gridY1 - OMR.gridY0) / rows);
  return { cols, rows, rowH, colW: (OMR.gridX1 - OMR.gridX0) / cols, blockW, maxOpts, fits: rowH >= OMR.rowMin };
}

/** مراكز الفقاعات بالمليمتر: لكل سؤال رقمه وموضع كل خيار. الأعمدة من اليمين في الحروف العربية */
export function omrCenters(items: OmrItem[], rtl: boolean) {
  const L = omrLayout(items);
  return items.map((it, q) => {
    const c = Math.floor(q / L.rows);
    const r = q % L.rows;
    const y = OMR.gridY0 + L.rowH * (r + 0.5);
    const colLeft = rtl ? OMR.gridX1 - (c + 1) * L.colW : OMR.gridX0 + c * L.colW;
    const bl = colLeft + (L.colW - L.blockW) / 2;
    const br = bl + L.blockW;
    const opts = Array.from({ length: it.opts }, (_, i) => ({
      x: rtl ? br - OMR.numW - OMR.pitch * (i + 0.5) : bl + OMR.numW + OMR.pitch * (i + 0.5),
      y,
    }));
    return { n: it.n, num: { x: rtl ? br - OMR.numW / 2 : bl + OMR.numW / 2, y }, opts };
  });
}

export const LETTERS = { ar: ['أ', 'ب', 'ج', 'د', 'هـ', 'و'], en: ['A', 'B', 'C', 'D', 'E', 'F'] };
