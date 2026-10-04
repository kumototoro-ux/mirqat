// مشترك بين الخادم والمتصفح (لا 'use client' هنا: الثوابت تُقرأ كقيم في الخادم)

export const PAGE_SIZE = 15;
export const PAGE_SIZES = [10, 15, 25, 50] as const;

/** حجم الصفحة المطلوب، محصورًا في الخيارات المسموحة (لا يطلب أحد 5000 صف دفعة واحدة) */
export function pageSize(p: { size?: number }) {
  return (PAGE_SIZES as readonly number[]).includes(Number(p.size)) ? Number(p.size) : PAGE_SIZE;
}

export type PageParams = {
  page: number;
  size?: number;
  q: string;
  sort: string;
  filters: Record<string, string>;
};

export type PageResult<T> = { rows: T[]; total: number };

export type ActionResult = { ok: true; message: string; code?: string; password?: string } | { ok: false; error: string };
