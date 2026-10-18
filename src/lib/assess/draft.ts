// حالة محرر النموذج + الاستيراد من Excel أو نص منسوخ (مشترك، بلا 'use client')
import { joinBlanks, parseBlanks, type QType } from './shared';

export type DraftOption = { id?: number; body: string; is_correct: boolean };
export type DraftQuestion = {
  key: string;
  id?: number;
  qtype: QType;
  /** للفراغات: النص بصيغة المعلم {{إجابة|بديل}} */
  body: string;
  image_url: string | null;
  points: number;
  section_title: string;
  explanation: string;
  options: DraftOption[];
  answers: string[];
  pairs: { l: string; r: string }[];
  max_chars: number | null;
};

let seq = 0;
export const newKey = () => `q${Date.now().toString(36)}${(seq++).toString(36)}`;

export function blankQuestion(qtype: QType, points = 1): DraftQuestion {
  return {
    key: newKey(),
    qtype,
    body: qtype === 'fill' ? '' : '',
    image_url: null,
    points,
    section_title: '',
    explanation: '',
    options:
      qtype === 'tf'
        ? [{ body: 'صح', is_correct: true }, { body: 'خطأ', is_correct: false }]
        : qtype === 'mcq'
          ? [{ body: '', is_correct: true }, { body: '', is_correct: false }, { body: '', is_correct: false }]
          : [],
    answers: qtype === 'short' ? [''] : [],
    pairs: qtype === 'match' ? [{ l: '', r: '' }, { l: '', r: '' }, { l: '', r: '' }] : [],
    max_chars: null,
  };
}

/** تحويل نوع السؤال مع الإبقاء على ما يمكن */
export function convertQuestion(q: DraftQuestion, qtype: QType): DraftQuestion {
  const b = blankQuestion(qtype, q.points);
  return {
    ...b,
    key: q.key,
    id: q.id,
    body: q.body,
    image_url: q.image_url,
    section_title: q.section_title,
    explanation: q.explanation,
    options: qtype === 'mcq' && q.options.length >= 2 && q.qtype === 'mcq' ? q.options : b.options,
  };
}

/** من بيانات الخادم إلى المحرر */
export type ServerQuestion = {
  id: number;
  qtype: QType;
  body: string;
  image_url: string | null;
  points: number;
  section_title: string | null;
  explanation: string | null;
  config: { answers?: string[]; pairs?: { l: string; r: string }[]; blanks?: string[][]; max_chars?: number };
  options: { id: number; body: string; is_correct: boolean }[];
};
export function fromServer(q: ServerQuestion): DraftQuestion {
  return {
    key: `s${q.id}`,
    id: q.id,
    qtype: q.qtype,
    body: q.qtype === 'fill' ? joinBlanks(q.body, q.config.blanks ?? []) : q.body,
    image_url: q.image_url,
    points: Number(q.points),
    section_title: q.section_title ?? '',
    explanation: q.explanation ?? '',
    options: q.options.map((o) => ({ id: o.id, body: o.body, is_correct: o.is_correct })),
    answers: q.config.answers?.length ? q.config.answers : q.qtype === 'short' ? [''] : [],
    pairs: q.config.pairs ?? [],
    max_chars: q.config.max_chars ?? null,
  };
}

/** من المحرر إلى دالة الحفظ */
export function toPayload(q: DraftQuestion) {
  const base = {
    id: q.id ?? null,
    qtype: q.qtype,
    image_url: q.image_url,
    points: q.points,
    section_title: q.section_title || null,
    explanation: q.explanation || null,
  };
  switch (q.qtype) {
    case 'mcq':
    case 'tf':
      return { ...base, body: q.body, options: q.options.map((o) => ({ id: o.id ?? null, body: o.body, is_correct: o.is_correct })) };
    case 'short':
      return { ...base, body: q.body, config: { answers: q.answers.map((a) => a.trim()).filter(Boolean) } };
    case 'long':
      return { ...base, body: q.body, config: q.max_chars ? { max_chars: q.max_chars } : {} };
    case 'match':
      return { ...base, body: q.body, config: { pairs: q.pairs.filter((p) => p.l.trim() && p.r.trim()) } };
    case 'fill': {
      const { body, blanks } = parseBlanks(q.body);
      return { ...base, body, config: { blanks } };
    }
  }
}

/** مشكلات تمنع الحفظ — تظهر للمعلم على السؤال نفسه */
export function questionIssues(q: DraftQuestion): string[] {
  const out: string[] = [];
  if (!q.body.trim()) out.push('اكتب نص السؤال');
  if (!(q.points >= 0)) out.push('الدرجة غير صحيحة');
  if (q.qtype === 'mcq') {
    if (q.options.filter((o) => o.body.trim()).length < 2) out.push('خياران على الأقل');
    if (q.options.some((o) => !o.body.trim())) out.push('احذف الخيارات الفارغة أو اكتبها');
    if (q.options.filter((o) => o.is_correct).length !== 1) out.push('حدّد الإجابة الصحيحة');
  }
  if (q.qtype === 'tf' && q.options.filter((o) => o.is_correct).length !== 1) out.push('حدّد صح أو خطأ');
  if (q.qtype === 'match' && q.pairs.filter((p) => p.l.trim() && p.r.trim()).length < 2) out.push('زوجان على الأقل');
  if (q.qtype === 'fill') {
    const { blanks } = parseBlanks(q.body);
    if (!blanks.length) out.push('ضع الإجابة بين قوسين مزدوجين {{ }}');
    if (blanks.some((b) => !b.length)) out.push('فراغ بلا إجابة');
  }
  return out;
}

/* =====================================================================
   الاستيراد من نص منسوخ
   1) ما عاصمة السعودية؟ (2)
   أ) جدة
   ب) الرياض *
   ---
   الأرض كروية
   الإجابة: صح
   ---
   H2O = ماء
   ===================================================================== */
const OPTION_RE = /^\s*(?:[أابتثجحخدذرزسشصضطظعغفقكلمنهوي]|[a-hA-H]|\d{1,2}|[-•●○▪])\s*[)\-.:،]\s*(.+)$/;
const ANSWER_RE = /^\s*(?:الإجابة|الاجابة|الجواب|الحل|answer|ans)\s*[:：\-]\s*(.+)$/i;
const POINTS_RE = /\s*[(\[（]\s*(\d+(?:[.,]\d+)?)\s*(?:درجة|درجات|د|نقطة|نقاط|pts?|points?)?\s*[)\]）]\s*$/i;
const NUM_PREFIX_RE = /^\s*(?:س\s*\d+|سؤال\s*\d+|\d{1,3}|Q\d+)\s*[)\-.:،]\s*/i;
const MATCH_RE = /^(.+?)\s*(?:=|⇄|↔|->|→|=>|:=)\s*(.+)$/;
const isTrue = (s: string) => /^(صح|صحيح|صواب|true|t|نعم|✓|✔)$/i.test(s.trim());
const isFalse = (s: string) => /^(خطأ|خطا|غلط|false|f|لا|✗|✘|×)$/i.test(s.trim());
const CORRECT_MARK = /\s*(?:\*|✓|✔|\(صح\)|\(صحيح\))\s*$/;

function splitBlocks(text: string): string[][] {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: string[][] = [];
  let cur: string[] = [];
  const flush = () => {
    if (cur.some((l) => l.trim())) blocks.push(cur.filter((l) => l.trim()));
    cur = [];
  };
  for (const line of lines) {
    if (!line.trim() || /^\s*(-{3,}|_{3,}|={3,})\s*$/.test(line)) {
      flush();
      continue;
    }
    // سطر يبدأ برقم سؤال جديد وفي الكتلة الحالية خيارات أو إجابة = بداية سؤال جديد
    if (NUM_PREFIX_RE.test(line) && !OPTION_RE.test(line) && cur.length && cur.some((l) => OPTION_RE.test(l) || ANSWER_RE.test(l))) flush();
    cur.push(line);
  }
  flush();
  return blocks;
}

export function parseText(text: string, defaultPoints = 1): { questions: DraftQuestion[]; skipped: number } {
  const out: DraftQuestion[] = [];
  let skipped = 0;
  for (const block of splitBlocks(text)) {
    const qLines: string[] = [];
    const opts: { body: string; correct: boolean }[] = [];
    const pairs: { l: string; r: string }[] = [];
    let answer: string | null = null;
    for (const raw of block) {
      const ans = raw.match(ANSWER_RE);
      if (ans) {
        answer = ans[1].trim();
        continue;
      }
      const opt = qLines.length ? raw.match(OPTION_RE) : null;
      if (opt) {
        const correct = CORRECT_MARK.test(opt[1]);
        opts.push({ body: opt[1].replace(CORRECT_MARK, '').trim(), correct });
        continue;
      }
      const m = qLines.length ? raw.match(MATCH_RE) : null;
      if (m && !/\{\{/.test(raw)) {
        pairs.push({ l: m[1].trim(), r: m[2].trim() });
        continue;
      }
      qLines.push(raw);
    }
    if (!qLines.length) {
      skipped++;
      continue;
    }
    let body = qLines.join('\n').replace(NUM_PREFIX_RE, '').trim();
    let points = defaultPoints;
    const p = body.match(POINTS_RE);
    if (p) {
      points = Number(p[1].replace(',', '.'));
      body = body.replace(POINTS_RE, '').trim();
    }
    let q: DraftQuestion;
    if (/\{\{[^}]+\}\}/.test(body)) {
      q = { ...blankQuestion('fill', points), body };
    } else if (pairs.length >= 2 && !opts.length) {
      q = { ...blankQuestion('match', points), body, pairs };
    } else if (opts.length >= 2) {
      if (opts.length === 2 && opts.every((o) => isTrue(o.body) || isFalse(o.body))) {
        const trueCorrect = opts.find((o) => isTrue(o.body))?.correct ?? (answer ? isTrue(answer) : true);
        q = { ...blankQuestion('tf', points), body, options: [{ body: 'صح', is_correct: trueCorrect }, { body: 'خطأ', is_correct: !trueCorrect }] };
      } else {
        let idx = opts.findIndex((o) => o.correct);
        if (idx < 0 && answer) idx = matchAnswer(answer, opts.map((o) => o.body));
        q = { ...blankQuestion('mcq', points), body, options: opts.map((o, i) => ({ body: o.body, is_correct: i === Math.max(0, idx) })) };
      }
    } else if (answer && (isTrue(answer) || isFalse(answer))) {
      q = { ...blankQuestion('tf', points), body, options: [{ body: 'صح', is_correct: isTrue(answer) }, { body: 'خطأ', is_correct: isFalse(answer) }] };
    } else if (answer) {
      q = { ...blankQuestion('short', points), body, answers: answer.split(/\s*[|،,]\s*/).filter(Boolean) };
    } else {
      q = { ...blankQuestion('long', points), body };
    }
    out.push(q);
  }
  return { questions: out, skipped };
}

const LETTERS_AR = 'أبجدهوزحطي';
const LETTERS_EN = 'abcdefghij';
function matchAnswer(answer: string, options: string[]): number {
  const a = answer.trim().replace(/[)\.]$/, '');
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const byText = options.findIndex((o) => norm(o) === norm(a));
  if (byText >= 0) return byText;
  if (/^\d{1,2}$/.test(a)) return Number(a) - 1;
  const ar = LETTERS_AR.indexOf(a === 'ا' ? 'أ' : a);
  if (a.length === 1 && ar >= 0) return ar;
  const en = LETTERS_EN.indexOf(a.toLowerCase());
  if (a.length === 1 && en >= 0) return en;
  return 0;
}

/* =====================================================================
   الاستيراد من Excel/CSV
   الأعمدة: النوع | السؤال | الدرجة | الإجابة | خيار 1 … خيار 6
   ===================================================================== */
export const SHEET_HEADER = ['النوع', 'السؤال', 'الدرجة', 'الإجابة', 'خيار 1', 'خيار 2', 'خيار 3', 'خيار 4', 'خيار 5', 'خيار 6'];
export const SHEET_EXAMPLES: string[][] = [
  ['اختيار', 'ما عاصمة المملكة العربية السعودية؟', '2', '2', 'جدة', 'الرياض', 'مكة المكرمة', 'الدمام', '', ''],
  ['صح وخطأ', 'يغلي الماء عند 100 درجة مئوية', '1', 'صح', '', '', '', '', '', ''],
  ['قصيرة', 'ناتج $\\frac{1}{2} + \\frac{1}{4}$ ؟', '2', '3/4|0.75', '', '', '', '', '', ''],
  ['مقالية', 'اشرح دورة الماء في الطبيعة', '5', '', '', '', '', '', '', ''],
  ['توصيل', 'صل المركّب باسمه', '3', '', 'H2O = ماء', 'NaCl = ملح الطعام', 'CO2 = ثاني أكسيد الكربون', '', '', ''],
  ['فراغ', 'أكبر كوكب في المجموعة الشمسية هو {{المشتري}}', '1', '', '', '', '', '', '', ''],
];

function typeOf(s: string): DraftQuestion['qtype'] | null {
  const t = s.trim().toLowerCase();
  if (/اختيار|متعدد|mcq|choice/.test(t)) return 'mcq';
  if (/صح|خطأ|خطا|tf|true/.test(t)) return 'tf';
  if (/قصير|short/.test(t)) return 'short';
  if (/مقال|طويل|long|essay/.test(t)) return 'long';
  if (/توصيل|صل|match/.test(t)) return 'match';
  if (/فراغ|املأ|fill|blank/.test(t)) return 'fill';
  return null;
}

export function parseRows(rows: unknown[][], defaultPoints = 1): { questions: DraftQuestion[]; skipped: number; errors: string[] } {
  const cells = rows.map((r) => r.map((c) => (c == null ? '' : String(c).trim())));
  let start = 0;
  if (cells[0] && cells[0].some((c) => /النوع|السؤال|type|question/i.test(c))) start = 1;
  const out: DraftQuestion[] = [];
  const errors: string[] = [];
  let skipped = 0;
  for (let i = start; i < cells.length; i++) {
    const [typeCell = '', body = '', pointsCell = '', answer = '', ...rest] = cells[i];
    if (!body) {
      if (cells[i].some(Boolean)) skipped++;
      continue;
    }
    const opts = rest.filter(Boolean);
    const points = Number(pointsCell.replace(',', '.')) || defaultPoints;
    const qtype = typeOf(typeCell) ?? (/\{\{/.test(body) ? 'fill' : opts.length >= 2 ? 'mcq' : answer ? (isTrue(answer) || isFalse(answer) ? 'tf' : 'short') : 'long');
    const row = i + 1;
    if (qtype === 'mcq') {
      if (opts.length < 2) {
        errors.push(`الصف ${row}: سؤال اختيار يحتاج خيارين على الأقل`);
        continue;
      }
      const idx = matchAnswer(answer || '1', opts);
      out.push({ ...blankQuestion('mcq', points), body, options: opts.map((o, j) => ({ body: o, is_correct: j === idx })) });
    } else if (qtype === 'tf') {
      const t = answer ? isTrue(answer) : true;
      out.push({ ...blankQuestion('tf', points), body, options: [{ body: 'صح', is_correct: t }, { body: 'خطأ', is_correct: !t }] });
    } else if (qtype === 'short') {
      out.push({ ...blankQuestion('short', points), body, answers: answer.split(/\s*[|،]\s*/).filter(Boolean) });
    } else if (qtype === 'long') {
      out.push({ ...blankQuestion('long', points), body });
    } else if (qtype === 'match') {
      const pairs = opts.map((o) => o.match(MATCH_RE)).filter(Boolean).map((m) => ({ l: m![1].trim(), r: m![2].trim() }));
      if (pairs.length < 2) {
        errors.push(`الصف ${row}: التوصيل يُكتب في الخيارات بصيغة "يسار = يمين"`);
        continue;
      }
      out.push({ ...blankQuestion('match', points), body, pairs });
    } else {
      if (!/\{\{[^}]+\}\}/.test(body)) {
        errors.push(`الصف ${row}: ضع إجابة الفراغ بين {{ }} داخل نص السؤال`);
        continue;
      }
      out.push({ ...blankQuestion('fill', points), body });
    }
  }
  return { questions: out, skipped, errors };
}

/** CSV بسيط (فاصلة أو فاصلة منقوطة أو Tab) — للصق من Excel أو ملف CSV */
export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^﻿/, '').replace(/\r/g, '');
  const first = clean.split('\n')[0] ?? '';
  const sep = first.includes('\t') ? '\t' : (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && !cell) quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** هل النص المنسوخ جدول (من Excel) أم أسئلة مكتوبة؟ */
export function looksTabular(text: string) {
  const lines = text.split('\n').filter((l) => l.trim());
  return lines.length > 0 && lines.filter((l) => l.includes('\t')).length >= Math.ceil(lines.length * 0.6);
}
