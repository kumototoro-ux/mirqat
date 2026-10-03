// مشترك بين الخادم والمتصفح (لا 'use client' هنا: الثوابت تُقرأ كقيم في الخادم)

export const PAGE_SIZE = 15;

export type PageParams = {
  page: number;
  q: string;
  sort: string;
  filters: Record<string, string>;
};

export type PageResult<T> = { rows: T[]; total: number };

export type ActionResult = { ok: true; message: string; code?: string; password?: string } | { ok: false; error: string };
