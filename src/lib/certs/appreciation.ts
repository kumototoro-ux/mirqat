// شهادات الشكر والتقدير — مشترك بين الخادم والمتصفح (بلا 'use client')
// نص الشهادة يُبنى عند العرض من المقاييس المحفوظة، فتتطابق عند الطالب والمعلم والإدارة.

export type AppreciationType = 'behavior' | 'attendance' | 'activities' | 'subject' | 'top' | 'custom';

export type AppreciationView = {
  id: number | null;
  type: AppreciationType;
  student_id: number;
  student: string;
  student_en: string | null;
  code: string;
  gender: 'M' | 'F';
  class_label: string;
  branch: string | null;
  branch_id: number | null;
  subject: string | null;
  subject_id: number | null;
  term: string | null;
  term_id: number | null;
  year: string | null;
  metrics: { pct?: number; n?: number; rank?: number; positive?: number; negative?: number; total?: number; absent?: number; late?: number };
  reason: string | null;
  issuer: string | null;
  /** المعلم/المعلمة — فارغ حين تُصدرها الإدارة */
  issuer_role: string | null;
  issued_by: number | null;
  issued_at: string;
};

/** هوية الشهادة: من إعدادات الشهادة (الشعار والرؤية والتوقيع والختم والبسملة واسم المدير) */
export type AppreciationBrand = {
  school: string;
  principal: { name: string; title: string };
  images: { logo?: string; vision?: string; signature?: string; stamp?: string; basmala?: string };
  showBasmala: boolean;
};

export type Layout = 'formal' | 'modern';

export const APPRECIATION_TYPES: {
  value: AppreciationType;
  label: string;
  hint: string;
  adminOnly: boolean;
  layout: Layout;
  /** a: اللون الأساسي، b: الثانوي، soft: خلفية البطاقات، s: درجات الزخرفة */
  pal: { a: string; b: string; soft: string; s: [string, string, string] };
}[] = [
  { value: 'subject', label: 'تفوق في مادة', hint: 'نسبة الطالب في كل درجات المادة المرصودة', adminOnly: false, layout: 'modern', pal: { a: '#1b6b5a', b: '#3f9b86', soft: '#e9f4f0', s: ['#7ab6a3', '#3f8f7a', '#c9a75c'] } },
  { value: 'activities', label: 'أنشطة وبحوث', hint: 'البحوث والتقارير وأوراق العمل والمشاركة', adminOnly: false, layout: 'modern', pal: { a: '#2b5f7a', b: '#3d8db0', soft: '#e8f1f6', s: ['#8fbad0', '#3d7fa0', '#c9a75c'] } },
  { value: 'custom', label: 'تقدير خاص', hint: 'سبب تكتبه أنت: مبادرة، مسابقة، خدمة…', adminOnly: false, layout: 'modern', pal: { a: '#6b4e1f', b: '#b08a3e', soft: '#f6f0e3', s: ['#dcc58f', '#b08a3e', '#7da394'] } },
  { value: 'top', label: 'الأوائل', hint: 'الخمسة الأوائل على الفرع بالمعدل العام', adminOnly: true, layout: 'formal', pal: { a: '#24476b', b: '#b39562', soft: '#eef1f6', s: ['#b3c3da', '#4d6c98', '#cdb98a'] } },
  { value: 'attendance', label: 'مواظبة وحضور', hint: 'الخمسة الأوائل على الفرع في الحضور', adminOnly: true, layout: 'formal', pal: { a: '#25697a', b: '#4b9fae', soft: '#e8f3f5', s: ['#a2d2da', '#4a95a3', '#76b8a3'] } },
  { value: 'behavior', label: 'سلوك وانضباط', hint: 'لمن له ملاحظة سلوك إيجابية', adminOnly: true, layout: 'formal', pal: { a: '#2f5f8a', b: '#4f9d8a', soft: '#e9f1f7', s: ['#a3c8df', '#5390b8', '#6bb398'] } },
];
export const typeMeta = (t: AppreciationType) => APPRECIATION_TYPES.find((x) => x.value === t)!;

const AD = '٠١٢٣٤٥٦٧٨٩';
export const ad = (n: number | string) => String(n).replace(/[0-9]/g, (d) => AD[Number(d)]);
const RANK_M = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس'];
const RANK_F = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة'];
export const rankWord = (n: number, f: boolean) => (f ? RANK_F : RANK_M)[n - 1] ?? ad(n);

/** سبب التقدير الخاص: يُكمل بـ«نظير» إن لم يبدأ بصيغة تقدير */
export function reasonSentence(reason: string) {
  const r = reason.trim().replace(/[.،]+$/, '');
  return /^(نظير|تقديرًا|تقديرا|لـ|ل|لما|لحصول|لمشارك|لفوز|لتميز|لتميّز)/.test(r) ? r : `نظير ${r}`;
}

export type CertText = {
  intro: string;
  ribbon: string | null;
  body: string;
  stats: { label: string; value: string }[];
};

/** نص الشهادة بصيغة المذكر/المؤنث — نفس صياغة Apps Script (certRenderData_) مع إضافة التقدير الخاص */
export function certText(v: AppreciationView, school: string): CertText {
  const f = v.gender === 'F';
  const G = (m: string, w: string) => (f ? w : m);
  const m = v.metrics ?? {};
  const pct = m.pct != null ? `${ad(m.pct)}٪` : '';
  const period = v.term ?? (v.year ? `العام الدراسي ${v.year}هـ` : 'العام الدراسي');
  const intro = `تتقدّم إدارة ${school || 'المدرسة'} بخالص الشكر والتقدير ${G('للطالب', 'للطالبة')}`;
  const wish = `سائلين الله ${G('له', 'لها')}`;
  switch (v.type) {
    case 'behavior':
      return {
        intro,
        ribbon: null,
        body: `نظير حسن ${G('سلوكه', 'سلوكها')} وانضباط${G('ه', 'ها')} والتزام${G('ه', 'ها')} بالأنظمة المدرسية، وما ${G('أظهره', 'أظهرته')} من خُلُقٍ رفيع واحترام لمعلمي${G('ه', 'ها')} وزملائ${G('ه', 'ها')}، ${wish} دوام التوفيق والنجاح.`,
        stats: [
          { label: 'ملاحظات السلوك الإيجابي', value: ad(m.positive ?? 0) },
          { label: 'الصف', value: v.class_label || '—' },
          { label: 'المدة', value: period },
        ],
      };
    case 'attendance':
      return {
        intro,
        ribbon: `للمواظبة والالتزام بالحضور — المركز ${rankWord(m.rank ?? 1, f)} على الفرع`,
        body: `نظير مواظبت${G('ه', 'ها')} والتزام${G('ه', 'ها')} التام بالحضور في موعده وحرص${G('ه', 'ها')} على عدم الغياب والتأخر، ${G('فكان', 'فكانت')} قدوةً حسنة لزملائ${G('ه', 'ها')} في الانضباط، وفّق${G('ه', 'ها')} الله ورعا${G('ه', 'ها')}.`,
        stats: [
          { label: 'نسبة الحضور', value: pct },
          { label: 'الترتيب على الفرع', value: rankWord(m.rank ?? 1, f) },
          { label: 'المدة', value: period },
        ],
      };
    case 'top':
      return {
        intro,
        ribbon: `لحصول${G('ه', 'ها')} على المركز ${rankWord(m.rank ?? 1, f)} على الفرع`,
        body: `نظير تفوق${G('ه', 'ها')} الدراسي ونتائج${G('ه', 'ها')} المتميّزة التي ${G('جعلته', 'جعلتها')} من أوائل ${G('طلاب', 'طالبات')} الفرع، ${wish} دوام التفوق والارتقاء.`,
        stats: [
          { label: 'المعدل العام', value: pct },
          { label: 'الترتيب على الفرع', value: rankWord(m.rank ?? 1, f) },
          { label: 'المدة', value: period },
        ],
      };
    case 'subject':
      return {
        intro,
        ribbon: null,
        body: `نظير تفوق${G('ه', 'ها')} وأدائ${G('ه', 'ها')} المتميّز في مادة ${v.subject ?? ''}، وحرص${G('ه', 'ها')} على الاجتهاد والمشاركة الفاعلة، ${wish} مزيدًا من التقدم والنجاح.`,
        stats: [
          { label: 'نسبة الأداء', value: pct },
          { label: 'المادة', value: v.subject ?? '—' },
          { label: 'المدة', value: period },
        ],
      };
    case 'activities':
      return {
        intro,
        ribbon: null,
        body: `نظير تميّز${G('ه', 'ها')} الواضح في الأنشطة والبحوث والتقارير والتزام${G('ه', 'ها')} بتسليمها بإتقان وإبداع${v.subject ? ` في مادة ${v.subject}` : ''}، ${wish} دوام التوفيق والسداد.`,
        stats: [
          { label: 'نسبة الأداء', value: pct },
          { label: 'الأنشطة المنجزة', value: ad(m.n ?? 0) },
          v.subject ? { label: 'المادة', value: v.subject } : { label: 'المدة', value: period },
        ],
      };
    default:
      return {
        intro,
        ribbon: null,
        body: `${reasonSentence(v.reason ?? '')}، ${wish} دوام التوفيق والنجاح.`,
        stats: [
          ...(v.subject ? [{ label: 'المادة', value: v.subject }] : []),
          { label: 'الصف', value: v.class_label || '—' },
          { label: 'المدة', value: period },
        ],
      };
  }
}

/** التاريخ هجري — ميلادي بالأرقام العربية */
export function certDates(iso: string) {
  const d = new Date(iso);
  const t = Number.isNaN(d.getTime()) ? new Date() : d;
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh' };
  let h = '';
  let g = '';
  try { h = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-arab', opts).format(t); } catch { /* المتصفح بلا تقويم هجري */ }
  try { g = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-arab', opts).format(t); } catch { g = t.toISOString().slice(0, 10); }
  return h ? `${h} — ${g}` : g;
}

export const certFileName = (v: AppreciationView) => `شهادة-شكر-${typeMeta(v.type).label}-${v.student}`.replace(/\s+/g, '-');
