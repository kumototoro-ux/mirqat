// قارئ ورقة الإجابة (الفقاعات) — يعمل في المتصفح بلا خادم.
// الخطوات: تدرّج رمادي ← عتبة محلية ← المربعات الأربعة ← تحويل المنظور ← فك QR ← قياس تظليل كل دائرة.
// منقول من Apps Script (ExamScanLib: exrScan) مع هندسة omr.ts وعدد خيارات متغير.
// الدوال نقية: تأخذ بكسلات وتُرجع نتيجة — لا تلمس الصفحة. يُختبر في Node بصورة اصطناعية.

import jsQR from 'jsqr';
import { OMR, omrCenters, parseOmrQr, type OmrItem, type OmrQr } from './omr';

export type Pixels = { data: Uint8ClampedArray; width: number; height: number };
type Gray = { g: Float32Array; w: number; h: number; f: number };
type Pt = { x: number; y: number };
type Cand = Pt & { area: number };
type H = number[];

export type BubbleStatus = 'ok' | 'weak' | 'blank' | 'multi';
export type ScanAnswer = {
  /** فهارس الخيارات المظلَّلة (فارغة = لا شيء) */
  picks: number[];
  status: BubbleStatus;
  /** مواضع الدوائر في الصورة الأصلية (للرسم فوقها) */
  px: [number, number][];
};
export type ScanResult =
  | { ok: false; error: string }
  | { ok: true; qr: OmrQr | null; qrText: string | null; rtl: boolean; answers: ScanAnswer[]; corners: [number, number][] };

const MAX_DIM = 2000;
const MARKER_C: [number, number][] = OMR.markers.map(([x, y]) => [x + OMR.marker / 2, y + OMR.marker / 2]);
const SIDE_W = MARKER_C[1][0] - MARKER_C[0][0]; // 188
const SIDE_H = MARKER_C[2][1] - MARKER_C[0][1]; // 275
const FILL_R = OMR.bubble / 2 - 0.7; // نصف قطر منطقة القياس داخل الدائرة (مم)

function prep(img: Pixels): Gray {
  const W = img.width, Hh = img.height, f = Math.max(1, Math.max(W, Hh) / MAX_DIM);
  const w = Math.round(W / f), h = Math.round(Hh / f), g = new Float32Array(w * h), d = img.data;
  if (f === 1) {
    for (let i = 0, n = w * h; i < n; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  } else {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * f), x1 = Math.min(W, Math.floor((x + 1) * f)), y0 = Math.floor(y * f), y1 = Math.min(Hh, Math.floor((y + 1) * f));
      let s = 0, c = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const p = (yy * W + xx) * 4; s += 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]; c++; }
      g[y * w + x] = c ? s / c : 255;
    }
  }
  return { g, w, h, f };
}

/** 1 = داكن (عتبة محلية بالصورة التكاملية) */
function binary(P: Gray) {
  const { w, h, g } = P, integ = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += g[y * w + x]; integ[(y + 1) * (w + 1) + x + 1] = integ[y * (w + 1) + x + 1] + row; }
  }
  const win = Math.max(15, Math.round(Math.min(w, h) / 10)) | 1, r = win >> 1, bin = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - r), yb = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - r), xb = Math.min(w, x + r + 1);
      const sum = integ[yb * (w + 1) + xb] - integ[ya * (w + 1) + xb] - integ[yb * (w + 1) + xa] + integ[ya * (w + 1) + xa];
      bin[y * w + x] = g[y * w + x] < (sum / ((xb - xa) * (yb - ya))) * 0.78 ? 1 : 0;
    }
  }
  return bin;
}

/** مكوّنات متصلة تشبه المربعات الصلبة */
function squares(bin: Uint8Array, w: number, h: number): Cand[] {
  const seen = new Uint8Array(w * h), out: Cand[] = [], stack: number[] = [];
  const minS = 12, maxS = Math.max(40, Math.round(Math.max(w, h) * 0.09));
  for (let s = 0; s < w * h; s++) {
    if (!bin[s] || seen[s]) continue;
    let minx = w, maxx = 0, miny = h, maxy = 0, area = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    stack.length = 0; stack.push(s); seen[s] = 1;
    while (stack.length) {
      const p = stack.pop()!, x = p % w, y = (p - x) / w;
      area++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
      if (x > 0 && bin[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < w - 1 && bin[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && bin[p - w] && !seen[p - w]) { seen[p - w] = 1; stack.push(p - w); }
      if (y < h - 1 && bin[p + w] && !seen[p + w]) { seen[p + w] = 1; stack.push(p + w); }
    }
    const bw = maxx - minx + 1, bh = maxy - miny + 1;
    if (bw < minS || bh < minS || bw > maxS || bh > maxS) continue;
    const asp = bw / bh;
    if (asp < 0.5 || asp > 2 || area / (bw * bh) < 0.5) continue;
    const cx = sx / area, cy = sy / area, a = sxx / area - cx * cx, b = sxy / area - cx * cy, c = syy / area - cy * cy;
    const tr = a + c, det = a * c - b * b, disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det)), l1 = tr / 2 + disc, l2 = tr / 2 - disc;
    if (l2 <= 0 || l1 / l2 > 1.7) continue;
    const ideal = area / 12; // المربع الصلب: التباين = مساحة/12
    if (Math.abs((l1 + l2) / 2 - ideal) / ideal > 0.35) continue;
    out.push({ x: cx, y: cy, area });
  }
  return out;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** أفضل رباعي: أحجام متقاربة + أضلاع متقابلة متساوية + نسبة 188:275 + محدّب — والأكبر يفوز */
function pickQuad(all: Cand[]) {
  const cands = all.slice().sort((a, b) => b.area - a.area).slice(0, 14), n = cands.length;
  let best: { score: number; pts: Cand[] } | null = null;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) for (let l = k + 1; l < n; l++) {
    const pts = [cands[i], cands[j], cands[k], cands[l]];
    const amin = Math.min(...pts.map((p) => p.area)), amax = Math.max(...pts.map((p) => p.area));
    if (amin / amax < 0.55) continue;
    const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4, cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
    pts.sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx));
    const s = [dist(pts[0], pts[1]), dist(pts[1], pts[2]), dist(pts[2], pts[3]), dist(pts[3], pts[0])];
    const e1 = Math.abs(s[0] - s[2]) / Math.max(s[0], s[2]), e2 = Math.abs(s[1] - s[3]) / Math.max(s[1], s[3]);
    if (e1 > 0.3 || e2 > 0.3) continue;
    const want = SIDE_W / SIDE_H;
    const ratio = Math.min((s[0] + s[2]) / (s[1] + s[3]), (s[1] + s[3]) / (s[0] + s[2])), eAsp = Math.abs(ratio - want) / want;
    if (eAsp > 0.25) continue;
    let sg = 0, convex = true;
    for (let m = 0; m < 4; m++) {
      const a = pts[m], b = pts[(m + 1) % 4], c = pts[(m + 2) % 4], cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (!sg) sg = Math.sign(cr); else if (Math.sign(cr) !== sg) convex = false;
    }
    if (!convex) continue;
    let qa = 0;
    for (let t = 0; t < 4; t++) { const u = pts[t], v = pts[(t + 1) % 4]; qa += u.x * v.y - v.x * u.y; }
    const score = (Math.abs(qa) / 2) * (1 - 0.5 * (e1 + e2 + eAsp)) * (0.5 + (0.5 * amin) / amax);
    if (!best || score > best.score) best = { score, pts };
  }
  return best;
}

/** تحويل المنظور (DLT): مم ← بكسل */
function homography(src: [number, number][], dst: [number, number][]): H | null {
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let c = 0; c < 8; c++) {
    let piv = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-12) return null;
    [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
    for (let r = c + 1; r < 8; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  const h = new Array<number>(8);
  for (let r = 7; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < 8; k++) s -= A[r][k] * h[k]; h[r] = s / A[r][r]; }
  return [...h, 1];
}
const map = (H: H, x: number, y: number): [number, number] => {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
};
function bilinear(P: Gray, x: number, y: number) {
  const { g, w, h } = P;
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return 255;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  return (g[y0 * w + x0] * (1 - fx) + g[y0 * w + x1] * fx) * (1 - fy) + (g[y1 * w + x0] * (1 - fx) + g[y1 * w + x1] * fx) * fy;
}

/** يقتطع منطقة الـQR مصحَّحة المنظور ويفك الشيفرة */
function decodeQr(P: Gray, H: H): string | null {
  const q = OMR.qr, m = 2.5, x0 = q.x - m, y0 = q.y - m, size = q.s + 2 * m, px = 12, N = Math.round(size * px);
  const rgba = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const [u, v] = map(H, x0 + x / px, y0 + y / px), val = bilinear(P, u, v), i = (y * N + x) * 4;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = val; rgba[i + 3] = 255;
  }
  const r = jsQR(rgba, N, N, { inversionAttempts: 'attemptBoth' });
  return r?.data || null;
}

type Measure = { d: number; c: number; px: [number, number] };
/** تظليل دائرة: c = نسبة البكسلات الداكنة، d = متوسط العتمة — مقارنةً بالورق حولها */
function measure(P: Gray, H: H, cx: number, cy: number, ringMax: number): Measure {
  const c = map(H, cx, cy), ex = map(H, cx + 1, cy), ey = map(H, cx, cy + 1);
  const s = Math.sqrt(Math.abs((ex[0] - c[0]) * (ey[1] - c[1]) - (ex[1] - c[1]) * (ey[0] - c[0]))); // بكسل لكل مم
  const ring: number[] = [], r0 = OMR.bubble / 2 + 0.6, r1 = Math.max(r0 + 0.2, ringMax);
  for (let a = 0; a < 24; a++) for (let rr = r0; rr <= r1 + 1e-9; rr += (r1 - r0) / 2 || 1) {
    const ang = (a * Math.PI) / 12, [u, v] = map(H, cx + rr * Math.cos(ang), cy + rr * Math.sin(ang));
    ring.push(bilinear(P, u, v));
  }
  ring.sort((p, q) => p - q);
  const white = ring[Math.floor(ring.length * 0.7)] || 255;
  const rad = FILL_R * s;
  let sum = 0, cnt = 0, dark = 0;
  for (let y = Math.floor(c[1] - rad); y <= Math.ceil(c[1] + rad); y++) for (let x = Math.floor(c[0] - rad); x <= Math.ceil(c[0] + rad); x++) {
    if ((x - c[0]) ** 2 + (y - c[1]) ** 2 > rad * rad) continue;
    const v = bilinear(P, x, y); sum += v; cnt++; if (v < white * 0.62) dark++;
  }
  if (!cnt) return { d: 0, c: 0, px: c };
  return { d: Math.max(0, Math.min(1, (white - sum / cnt) / Math.max(white, 1))), c: dark / cnt, px: c };
}

/** قرار كل سؤال: العتبة من مستوى الدوائر غير المظلَّلة في الورقة نفسها (الحرف المطبوع داخلها يرفعه قليلًا) */
function decide(ms: Measure[][]): Omit<ScanAnswer, 'px'>[] {
  const sc = (m: Measure) => 0.6 * m.c + 0.4 * (m.d / 0.5);
  const vals = ms.flat().map(sc).sort((a, b) => a - b);
  const base = vals[Math.floor(vals.length * 0.4)] || 0, T = Math.max(0.22, base + 0.25);
  return ms.map((row) => {
    const s = row.map(sc), top = Math.max(...s), picks: number[] = [];
    s.forEach((v, i) => { if (v >= T && v >= top * 0.6) picks.push(i); });
    let second = 0;
    s.forEach((v, i) => { if (!picks.includes(i) && v > second) second = v; });
    const crowded = second >= Math.max(0.3 * top, T * 0.6); // دائرة ثانية فيها أثر ملحوظ: يراجعها المعلم
    const status: BubbleStatus = picks.length === 0 ? (top > T * 0.5 ? 'weak' : 'blank') : picks.length === 1 ? (top > T * 1.5 && !crowded ? 'ok' : 'weak') : 'multi';
    return { picks, status };
  });
}

/**
 * يقرأ الورقة. items = أسئلة الاختيار بترتيبها في النموذج (كما في الطباعة).
 * defaultRtl يُستعمل فقط إن تعذّرت قراءة الـQR.
 */
export function scanSheet(img: Pixels, items: OmrItem[], defaultRtl = true): ScanResult {
  if (!items.length) return { ok: false, error: 'لا أسئلة اختيار في هذا النموذج' };
  const P = prep(img), cands = squares(binary(P), P.w, P.h);
  if (cands.length < 4) return { ok: false, error: 'لم أجد المربعات السوداء الأربعة في الزوايا — صوّر الورقة كاملة بوضوح وإضاءة جيدة' };
  const quad = pickQuad(cands);
  if (!quad) return { ok: false, error: 'تعذّر تحديد زوايا الورقة — تأكد أن المربعات الأربعة ظاهرة بالكامل' };

  // الضلع العلوي (188مم) أقصر من الجانبي (275مم): يبقى احتمالان (مقلوبة أو لا) — يحسمهما الـQR
  let info: { H: H; qr: string | null } | null = null, fallback: { H: H; qr: null } | null = null;
  for (let r = 0; r < 4 && !info; r++) {
    const P4 = quad.pts;
    if (dist(P4[r], P4[(r + 1) % 4]) >= dist(P4[(r + 1) % 4], P4[(r + 2) % 4])) continue;
    const dst = [0, 1, 2, 3].map((i) => { const p = P4[(r + i) % 4]; return [p.x, p.y] as [number, number]; });
    const Hm = homography([MARKER_C[0], MARKER_C[1], MARKER_C[3], MARKER_C[2]], dst);
    if (!Hm) continue;
    let qr: string | null = null;
    try { qr = decodeQr(P, Hm); } catch { qr = null; }
    if (qr) info = { H: Hm, qr }; else if (!fallback) fallback = { H: Hm, qr: null };
  }
  const use = info ?? fallback;
  if (!use) return { ok: false, error: 'تعذّر تحديد اتجاه الورقة' };

  const qr = use.qr ? parseOmrQr(use.qr) : null;
  const rtl = qr ? qr.rtl : defaultRtl;
  const centers = omrCenters(items, rtl);
  const ringMax = Math.min(4.5, OMR.pitch - OMR.bubble / 2 - 0.4);
  const ms = centers.map((c) => c.opts.map((o) => measure(P, use.H, o.x, o.y, ringMax)));
  const decided = decide(ms);
  const answers = decided.map((d, i) => ({ ...d, px: ms[i].map((m) => [m.px[0] * P.f, m.px[1] * P.f] as [number, number]) }));
  const corners = MARKER_C.map(([x, y]) => { const p = map(use.H, x, y); return [p[0] * P.f, p[1] * P.f] as [number, number]; });
  return { ok: true, qr, qrText: use.qr, rtl, answers, corners };
}
