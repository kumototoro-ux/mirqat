'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, useTransition } from 'react';
import { Icon, type IconName } from '@/components/shell/icons';

/* =====================================================================
   قائمة مرقّمة من الخادم: 15 صفًا لكل صفحة، تُجلب الصفحة عند فتحها فقط،
   وتُحفظ كل صفحة جُلبت في ذاكرة الصفحة (لا تُطلب مرتين)، والذاكرة تُمسح بعد أي تعديل.
   الحاسوب: جدول. الجوال: بطاقات لا تخرج عن الشاشة.
   ===================================================================== */

import { PAGE_SIZE, type PageParams, type PageResult } from './types';
export type { PageParams, PageResult } from './types';

export type Column<T> = {
  key: string;
  label: string;
  /** مفتاح الترتيب عند الضغط على عنوان العمود */
  sort?: string;
  className?: string;
  render: (row: T) => React.ReactNode;
};

export type FilterDef = { key: string; label: string; options: { value: string; label: string }[] };

export type RegistryHandle = { invalidate: () => void };

type Props<T> = {
  title: string;
  fetchPage: (p: PageParams) => Promise<PageResult<T>>;
  initial: PageResult<T>;
  initialParams?: Partial<PageParams>;
  columns: Column<T>[];
  mobileCard: (row: T) => React.ReactNode;
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => React.ReactNode;
  filters?: FilterDef[];
  sorts: { value: string; label: string }[];
  searchPlaceholder: string;
  toolbar?: React.ReactNode;
  emptyTitle: string;
  icon?: IconName;
};

function keyOf(p: PageParams) {
  return JSON.stringify([p.page, p.q, p.sort, Object.entries(p.filters).sort()]);
}

function RegistryInner<T>(props: Props<T>, ref: React.Ref<RegistryHandle>) {
  const defaults: PageParams = {
    page: 1,
    q: '',
    sort: props.sorts[0]?.value ?? '',
    filters: {},
    ...props.initialParams,
  };
  const [params, setParams] = useState<PageParams>(defaults);
  const [qInput, setQInput] = useState(defaults.q);
  const [data, setData] = useState<PageResult<T>>(props.initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const cache = useRef(new Map<string, PageResult<T>>([[keyOf(defaults), props.initial]]));
  const reqId = useRef(0);
  const [, startTransition] = useTransition();
  const fetchPage = props.fetchPage;

  const load = useCallback(
    async (p: PageParams, force = false) => {
      const k = keyOf(p);
      const hit = cache.current.get(k);
      if (hit && !force) {
        setData(hit);
        setLoading(false);
        return;
      }
      const id = ++reqId.current;
      setLoading(true);
      setError(null);
      try {
        const res = await fetchPage(p);
        if (id !== reqId.current) return; // طلب أحدث سبقه
        cache.current.set(k, res);
        startTransition(() => setData(res));
      } catch (e) {
        if (id === reqId.current) setError(e instanceof Error ? e.message : 'تعذّر التحميل');
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [fetchPage],
  );

  // البحث يُرسل بعد توقف الكتابة 350ms، لا مع كل حرف
  useEffect(() => {
    if (qInput === params.q) return;
    const t = setTimeout(() => setParams((p) => ({ ...p, q: qInput.trim(), page: 1 })), 350);
    return () => clearTimeout(t);
  }, [qInput, params.q]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    load(params);
  }, [params, load]);

  useImperativeHandle(ref, () => ({
    invalidate: () => {
      cache.current.clear();
      load(params, true);
    },
  }));

  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const from = data.total ? (params.page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(params.page * PAGE_SIZE, data.total);
  const activeFilters = Object.values(params.filters).filter(Boolean).length;
  const setFilter = (k: string, v: string) => setParams((p) => ({ ...p, page: 1, filters: { ...p.filters, [k]: v } }));
  const go = (page: number) => setParams((p) => ({ ...p, page: Math.min(Math.max(1, page), pages) }));
  const toggleSort = (s: string) =>
    setParams((p) => ({ ...p, page: 1, sort: p.sort === s ? (s.endsWith('_desc') ? s.replace(/_desc$/, '') : `${s}_desc`) : s }));

  const pageList = useMemo(() => pageWindow(params.page, pages), [params.page, pages]);

  return (
    <section className="rounded-2xl border border-line bg-surface">
      {/* شريط الأدوات */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3 sm:p-4">
        <h2 className="me-auto flex items-center gap-2 text-base font-bold">
          {props.title}
          <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-medium text-muted tabular-nums">{data.total}</span>
          {loading && <span className="spinner text-board" aria-label="جارٍ التحميل" />}
        </h2>
        <div className="relative order-last w-full sm:order-none sm:w-64">
          <Icon name="search" className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted" />
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder={props.searchPlaceholder}
            aria-label="بحث"
            className="h-10 w-full rounded-xl border border-line bg-paper/60 pe-3 ps-9 text-sm transition-colors focus:border-board focus:bg-surface focus:outline-none focus:ring-2 focus:ring-gold/30"
          />
        </div>
        {props.filters && props.filters.length > 0 && (
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className={`btn h-10 border px-3 ${showFilters || activeFilters ? 'border-board/40 bg-board/10 text-board' : 'border-line bg-surface text-ink hover:border-muted'}`}
          >
            <Icon name="filter" className="size-4" />
            تصفية
            {activeFilters > 0 && <span className="grid size-5 place-items-center rounded-full bg-board text-[0.7rem] text-chalk">{activeFilters}</span>}
          </button>
        )}
        <label className="relative">
          <span className="sr-only">ترتيب</span>
          <select
            value={params.sort}
            onChange={(e) => setParams((p) => ({ ...p, page: 1, sort: e.target.value }))}
            className="h-10 appearance-none rounded-xl border border-line bg-surface pe-8 ps-3 text-sm focus:border-board focus:outline-none"
          >
            {props.sorts.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <Icon name="sort" className="pointer-events-none absolute inset-y-0 end-2.5 my-auto size-4 text-muted" />
        </label>
        {props.toolbar}
      </div>

      {showFilters && props.filters && (
        <div className="grid animate-menu gap-3 border-b border-line bg-paper/40 p-3 sm:grid-cols-3 sm:p-4">
          {props.filters.map((f) => (
            <label key={f.key} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">{f.label}</span>
              <select value={params.filters[f.key] ?? ''} onChange={(e) => setFilter(f.key, e.target.value)} className="field py-2">
                <option value="">الكل</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          ))}
          {activeFilters > 0 && (
            <button type="button" onClick={() => setParams((p) => ({ ...p, page: 1, filters: {} }))} className="self-end text-start text-sm text-danger hover:underline sm:col-span-3">
              مسح التصفية
            </button>
          )}
        </div>
      )}

      {error && <p role="alert" className="m-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">تعذّر التحميل: {error}</p>}

      {/* الحاسوب: جدول */}
      <div className="hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-paper/60 text-muted">
                {props.columns.map((c) => (
                  <th key={c.key} scope="col" className={`whitespace-nowrap px-4 py-3 text-start text-xs font-semibold ${c.className ?? ''}`}>
                    {c.sort ? (
                      <button type="button" onClick={() => toggleSort(c.sort!)} className="inline-flex items-center gap-1 transition-colors hover:text-ink">
                        {c.label}
                        <SortMark state={params.sort === c.sort ? 'asc' : params.sort === `${c.sort}_desc` ? 'desc' : null} />
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
                {props.rowActions && <th className="w-24 px-4 py-3"><span className="sr-only">إجراءات</span></th>}
              </tr>
            </thead>
            <tbody className={`divide-y divide-line transition-opacity duration-200 ${loading ? 'opacity-50' : ''}`}>
              {loading && !data.rows.length
                ? Array.from({ length: 6 }, (_, i) => <SkeletonRow key={i} cols={props.columns.length + (props.rowActions ? 1 : 0)} />)
                : data.rows.map((r, i) => (
                    <tr
                      key={props.rowKey(r)}
                      onClick={props.onRowClick ? () => props.onRowClick!(r) : undefined}
                      className={`animate-row transition-colors hover:bg-board/[0.035] ${props.onRowClick ? 'cursor-pointer' : ''}`}
                      style={{ animationDelay: `${i * 22}ms` }}
                    >
                      {props.columns.map((c) => (
                        <td key={c.key} className={`px-4 py-3 align-middle ${c.className ?? ''}`}>{c.render(r)}</td>
                      ))}
                      {props.rowActions && (
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">{props.rowActions(r)}</div>
                        </td>
                      )}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* الجوال: بطاقات */}
      <ul className={`divide-y divide-line transition-opacity duration-200 md:hidden ${loading ? 'opacity-50' : ''}`}>
        {loading && !data.rows.length
          ? Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="flex items-center gap-3 p-4">
                <div className="skeleton size-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3.5 w-2/3" />
                  <div className="skeleton h-3 w-1/3" />
                </div>
              </li>
            ))
          : data.rows.map((r, i) => (
              <li
                key={props.rowKey(r)}
                className="animate-row"
                style={{ animationDelay: `${i * 22}ms` }}
              >
                <div
                  role={props.onRowClick ? 'button' : undefined}
                  tabIndex={props.onRowClick ? 0 : undefined}
                  onClick={props.onRowClick ? () => props.onRowClick!(r) : undefined}
                  className="flex min-w-0 items-start gap-3 p-4 transition-colors active:bg-paper"
                >
                  <div className="min-w-0 flex-1">{props.mobileCard(r)}</div>
                  {props.rowActions && (
                    <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                      {props.rowActions(r)}
                    </div>
                  )}
                </div>
              </li>
            ))}
      </ul>

      {!loading && data.rows.length === 0 && (
        <div className="grid place-items-center px-6 py-14 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-board/10 text-board">
            <Icon name={props.icon ?? 'search'} className="size-7" />
          </span>
          <p className="mt-3 font-semibold">{props.emptyTitle}</p>
          {(params.q || activeFilters > 0) && <p className="mt-1 text-sm text-muted">جرّب كلمة بحث أخرى أو امسح التصفية.</p>}
        </div>
      )}

      {/* الترقيم */}
      {data.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
          <p className="text-muted">
            عرض <span className="font-semibold text-ink tabular-nums">{from}–{to}</span> من{' '}
            <span className="font-semibold text-ink tabular-nums">{data.total}</span>
          </p>
          {pages > 1 && (
            <nav aria-label="الصفحات" className="flex items-center gap-1">
              <PageBtn onClick={() => go(params.page - 1)} disabled={params.page === 1} label="السابقة">
                <Icon name="chevron" className="size-4 rotate-180" />
              </PageBtn>
              {pageList.map((p, i) =>
                p === '…' ? (
                  <span key={`gap${i}`} className="px-1 text-muted">…</span>
                ) : (
                  <PageBtn key={p} onClick={() => go(p)} active={p === params.page} label={`الصفحة ${p}`}>
                    {p}
                  </PageBtn>
                ),
              )}
              <PageBtn onClick={() => go(params.page + 1)} disabled={params.page === pages} label="التالية">
                <Icon name="chevron" className="size-4" />
              </PageBtn>
            </nav>
          )}
        </div>
      )}
    </section>
  );
}

export const Registry = forwardRef(RegistryInner) as <T>(
  p: Props<T> & { ref?: React.Ref<RegistryHandle> },
) => React.ReactElement;

function PageBtn({
  children,
  onClick,
  disabled,
  active,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm tabular-nums transition-all duration-200 disabled:pointer-events-none disabled:opacity-35 ${
        active ? 'bg-board font-semibold text-chalk shadow-[0_6px_14px_-8px_rgb(53_104_84/0.9)]' : 'border border-line bg-surface hover:border-board/40 hover:text-board'
      }`}
    >
      {children}
    </button>
  );
}

function SortMark({ state }: { state: 'asc' | 'desc' | null }) {
  return (
    <svg viewBox="0 0 10 14" className="h-3 w-2.5" aria-hidden>
      <path d="M5 1 1.5 5h7z" className={state === 'asc' ? 'fill-board' : 'fill-muted/35'} />
      <path d="M5 13 1.5 9h7z" className={state === 'desc' ? 'fill-board' : 'fill-muted/35'} />
    </svg>
  );
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }, (_, i) => (
        <td key={i} className="px-4 py-4">
          <div className={`skeleton h-3.5 ${i === 0 ? 'w-40' : 'w-20'}`} />
        </td>
      ))}
    </tr>
  );
}

/** أرقام الصفحات: الأولى والأخيرة وما حول الحالية، والفجوات "…" */
function pageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push('…');
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push('…');
  out.push(total);
  return out;
}

/* ---------------------------------------------------------------------
   بطاقات الأرقام أعلى صفحات التسجيل
--------------------------------------------------------------------- */
export function StatCards({
  items,
}: {
  items: { label: string; value: number | string; hint?: string; icon: IconName; tone?: 'board' | 'gold' | 'danger' | 'plain' }[];
}) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((s, i) => {
        const featured = i === 0;
        return (
          <div
            key={s.label}
            className={`animate-fade-up rounded-2xl border p-4 transition-transform duration-300 hover:-translate-y-0.5 sm:p-5 ${
              featured ? 'border-board/20 bg-gradient-to-br from-board/[0.14] to-board/[0.04]' : 'border-line bg-surface'
            }`}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <p className="flex items-center gap-2 text-xs font-medium text-muted sm:text-sm">
              <span className={`grid size-7 place-items-center rounded-lg ${featured ? 'bg-board text-chalk' : 'bg-paper text-board'}`}>
                <Icon name={s.icon} className="size-4" />
              </span>
              <span className="truncate">{s.label}</span>
            </p>
            <p
              className={`mt-3 text-[1.75rem] font-bold leading-none tabular-nums sm:text-[2rem] ${
                s.tone === 'gold' ? 'text-brass' : s.tone === 'danger' ? 'text-danger' : 'text-ink'
              }`}
            >
              {s.value}
            </p>
            {s.hint && <p className="mt-1.5 truncate text-xs text-muted">{s.hint}</p>}
          </div>
        );
      })}
    </div>
  );
}

/** زر إجراء صغير بأيقونة داخل الصفوف */
export function RowButton({
  icon,
  label,
  onClick,
  tone = 'plain',
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  tone?: 'plain' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid size-9 place-items-center rounded-lg transition-colors ${
        tone === 'danger' ? 'text-muted hover:bg-danger-soft hover:text-danger' : 'text-muted hover:bg-board/10 hover:text-board'
      }`}
    >
      <Icon name={icon} className="size-[1.1rem]" />
    </button>
  );
}
