/** تقارير الأداء — أنواع ومسميات مشتركة (المنطق والصلاحيات كلها في القاعدة، هجرة 39) */
export const RATINGS = [
  { v: 4, label: 'ممتاز', cls: 'bg-ok/15 text-ok ring-ok/30' },
  { v: 3, label: 'جيد', cls: 'bg-board/10 text-board ring-board/30' },
  { v: 2, label: 'يحتاج تحسين', cls: 'bg-gold/20 text-brass ring-gold/40' },
  { v: 1, label: 'ضعيف', cls: 'bg-danger/10 text-danger ring-danger/30' },
  { v: 0, label: 'لا ينطبق', cls: 'bg-line/60 text-muted ring-line' },
] as const;
export const ratingLabel = (v: number | null | undefined) => RATINGS.find((r) => r.v === v)?.label ?? 'غير مقيَّم';

export const STATUS_LABEL = { draft: 'مسودة', sent: 'مُرسَل', acknowledged: 'معتمد' } as const;
export type PerfStatus = keyof typeof STATUS_LABEL;
export const VISIT_LABEL = { field: 'زيارة ميدانية', remote: 'متابعة عن بُعد' } as const;
export type VisitType = keyof typeof VISIT_LABEL;

export type PerfBranch = { id: number; name: string; has_building: boolean; directors: string[] };
export type PerfForm = { has_building: boolean; sections: { code: string; name: string; items: { code: string; title: string }[] }[] };
export type PerfListRow = {
  id: number; branch_id: number; branch: string; status: PerfStatus; visit_date: string; visit_type: VisitType; author: string;
  mine: boolean; overall_pct: number | null; sent_at: string | null; ack_at: string | null; unread: boolean;
};
export type PerfAttachment = { id: number; section: string | null; name: string; mime: string | null; size: number | null; path: string };
export type PerfReport = {
  id: number; branch_id: number; branch: string; term_id: number | null; visit_type: VisitType; visit_date: string; status: PerfStatus;
  has_building: boolean; author: string; mine: boolean; strengths: string | null; improvements: string | null; recommendations: string | null;
  actions: string | null; overall_pct: number | null; sent_at: string | null; ack_at: string | null; ack_by: string | null; director_reply: string | null;
  can_edit: boolean; can_ack: boolean; directors: string[]; attachments: PerfAttachment[];
  sections: { code: string; name: string; pct: number | null; items: { code: string; title: string; rating: number | null; note: string | null }[] }[];
};
export type PerfDraft = {
  branch_id: number; term_id: number | null; visit_type: VisitType; visit_date: string;
  strengths: string; improvements: string; recommendations: string; actions: string;
  scores: { item: string; rating: number; note: string }[];
};
export const MAX_PERF_FILE = 10 * 1024 * 1024;
