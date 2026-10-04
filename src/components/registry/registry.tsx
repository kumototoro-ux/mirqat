'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Icon, type IconName } from '@/components/shell/icons';
import { PAGE_SIZE, PAGE_SIZES, type PageParams, type PageResult } from './types';
export type { PageParams, PageResult } from './types';

/* =====================================================================
   قائمة مرقّمة من الخادم (TanStack Query):
   - تُجلب الصفحة المعروضة فقط (15 صفًا افتراضيًا)، والعدد الكلي في نفس الطلب
   - كل صفحة جُلبت تبقى في الذاكرة دقيقة: الرجوع إليها فوري بلا طلب
   - الصفحة التالية تُجهَّز عند المرور على زر "التالية" فقط
   - أثناء الجلب تبقى الصفحة السابقة ظاهرة (لا وميض)، ثم تُستبدل بحركة
   - بعد أي تعديل تُمسح ذاكرة هذه القائمة وحدها
   ===================================================================== */

export type Column<T> = {
  key: string;
  label: string;
  sort?: string;
  className?: string;
  render: (row: T) => React.ReactNode;
};
export type FilterDef = { key: string; label: string; options: { value: string; label: string }[] };
export type RegistryHandle = { invalidate: () => void };

type Props<T> = {
  queryKey: string;
  title: string;
  fetchPage: (p: PageParams) => Promise<PageResult<T>>;
  initial: PageResult<T>;
  initialParams?: Partial<PageParams>;
  columns: Column<T>[];
  mobileCard: (row: T) => React.ReactNode;
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => React.ReactNode;
  /** إجراءات جماعية على الصفوف المحددة */
  bulkActions?: (rows: T[], clear: () => void) => React.ReactNode;
  filters?: FilterDef[];
  sorts: { value: string; label: string }[];
  searchPlaceholder: string;
  toolbar?: React.ReactNode;
  emptyTitle: string;
  icon?: IconName;
};

const sameParams = (a: PageParams, b: PageParams) => JSON.stringify(a) === JSON.stringify(b);

function RegistryInner<T>(props: Props<T>, ref: React.Ref<RegistryHandle>) {
  const qc = useQueryClient();
  const base: PageParams = useMemo(
    () => ({ page: 1, size: PAGE_SIZE, q: '', sort: props.sorts[0]?.value ?? '', filters: {}, ...props.initialParams }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [params, setParams] = useState<PageParams>(base);
  const [qInput, setQInput] = useState(base.q);
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const { fetchPage, queryKey } = props;
  const [mountedAt] = useState(() => Date.now());

  const query = useQuery({
    queryKey: [queryKey, params],
    queryFn: () => fetchPage(params),
    initialData: sameParams(params, base) ? props.initial : undefined,
    initialDataUpdatedAt: mountedAt,
    placeholderData: keepPreviousData,
  });
  const data = query.data ?? { rows: [], total: 0 };
  const fetching = query.isFetching;
  const firstLoad = query.isPending;

  useEffect(() => {
    if (qInput.trim() === params.q) return;
    const t = setTimeout(() => setParams((p) => ({ ...p, q: qInput.trim(), page: 1 })), 350);
    return () => clearTimeout(t);
  }, [qInput, params.q]);

  // التحديد خاص بالصفحة المعروضة
  useEffect(() => setSelected(new Set()), [params]);

  useImperativeHandle(ref, () => ({
    invalidate: () => {
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: [queryKey] });
    },
  }));

  const size = params.size ?? PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(data.total / size));
  const from = data.total ? (params.page - 1) * size + 1 : 0;
  const to = Math.min(params.page * size, data.total);
  const activeFilters = Object.values(params.filters).filter(Boolean).length;
  const set = (patch: Partial<PageParams>) => setParams((p) => ({ ...p, page: 1, ...patch }));
  const go = (page: number) => setParams((p) => ({ ...p, page: Math.min(Math.max(1, page), pages) }));
  const prefetch = (page: number) => {
    if (page < 1 || page > pages) return;
    const next = { ...params, page };
    qc.prefetchQuery({ queryKey: [queryKey, next], queryFn: () => fetchPage(next) });
  };
  const toggleSort = (s: string) => set({ sort: params.sort === s ? `${s}_desc` : params.sort === `${s}_desc` ? s : s });
  const pageList = useMemo(() => pageWindow(params.page, pages), [params.page, pages]);

  const keys = data.rows.map(props.rowKey);
  const allOn = keys.length > 0 && keys.every((k) => selected.has(k));
  const someOn = keys.some((k) => selected.has(k));
  const toggleAll = () => setSelected(allOn ? new Set() : new Set(keys));
  const toggleOne = (k: string | number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const selectedRows = data.rows.filter((r) => selected.has(props.rowKey(r)));
  const selectable = Boolean(props.bulkActions);
  const pageId = `${params.page}-${JSON.stringify(params)}`;

  return (
    <section className="relative rounded-[1.4rem] border border-line bg-surface shadow-[0_1px_0_rgb(31_42_36/0.03)]">
      {/* شريط الأدوات */}
      <div className="flex flex-wrap items-center gap-2 p-4 sm:p-5">
        <h2 className="flex basis-full items-center gap-2.5 text-lg font-bold sm:me-auto sm:basis-auto">
          {props.title}
          <span className="rounded-full bg-board/10 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-board">{data.total}</span>
          <AnimatePresence>{fetching && !firstLoad && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="spinner text-board" />}</AnimatePresence>
        </h2>
        <div className="relative basis-full sm:basis-auto sm:w-72">
          <Icon name="search" className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-4 text-muted" />
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder={props.searchPlaceholder}
            aria-label="بحث"
            className="h-11 w-full rounded-xl border border-line bg-paper/70 pe-9 ps-10 text-[0.95rem] transition-[border-color,background-color,box-shadow] focus:border-board focus:bg-surface focus:outline-none focus:ring-4 focus:ring-gold/20"
          />
          {qInput && (
            <button type="button" onClick={() => setQInput('')} aria-label="مسح البحث" className="absolute inset-y-0 end-2 my-auto grid size-7 place-items-center rounded-lg text-muted hover:bg-paper hover:text-ink">
              <Icon name="close" className="size-4" />
            </button>
          )}
        </div>
        {props.filters && props.filters.length > 0 && (
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className={`btn h-11 rounded-xl border px-3.5 ${showFilters || activeFilters ? 'border-board/30 bg-board/10 text-board' : 'border-line bg-surface hover:border-muted'}`}
          >
            <Icon name="filter" className="size-4" />
            تصفية
            {activeFilters > 0 && <span className="grid size-5 place-items-center rounded-full bg-board text-[0.7rem] text-chalk">{activeFilters}</span>}
          </button>
        )}
        <label className="relative flex h-11 items-center gap-2 rounded-xl border border-line bg-surface ps-3.5 pe-2 text-sm">
          <span className="hidden text-muted sm:inline">ترتيب:</span>
          <select value={params.sort} onChange={(e) => set({ sort: e.target.value })} aria-label="الترتيب" className="h-full appearance-none bg-transparent pe-6 font-semibold focus:outline-none">
            {props.sorts.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <Icon name="chevron" className="pointer-events-none absolute end-2.5 size-4 -rotate-90 text-muted" />
        </label>
        {props.toolbar}
      </div>

      <AnimatePresence initial={false}>
        {showFilters && props.filters && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
            <div className="grid gap-3 border-t border-line bg-paper/50 p-4 sm:grid-cols-3 sm:px-5">
              {props.filters.map((f) => (
                <label key={f.key} className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-muted">{f.label}</span>
                  <select value={params.filters[f.key] ?? ''} onChange={(e) => set({ filters: { ...params.filters, [f.key]: e.target.value } })} className="field py-2.5">
                    <option value="">الكل</option>
                    {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              ))}
              {activeFilters > 0 && (
                <button type="button" onClick={() => set({ filters: {} })} className="flex items-center gap-1.5 justify-self-start text-sm font-medium text-danger hover:underline sm:col-span-3">
                  <Icon name="close" className="size-4" /> مسح التصفية
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {query.isError && (
        <p role="alert" className="mx-4 mb-4 flex items-center justify-between gap-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger sm:mx-5">
          تعذّر التحميل: {(query.error as Error)?.message}
          <button type="button" onClick={() => query.refetch()} className="font-semibold underline">إعادة المحاولة</button>
        </p>
      )}

      {/* الحاسوب */}
      <div className="hidden overflow-x-auto border-t border-line md:block">
        <table className="w-full text-[0.92rem]">
          <thead>
            <tr className="bg-paper/70 text-muted">
              {selectable && (
                <th className="w-12 ps-5">
                  <Check checked={allOn} indeterminate={!allOn && someOn} onChange={toggleAll} label="تحديد الكل" />
                </th>
              )}
              {props.columns.map((c) => (
                <th key={c.key} scope="col" className={`whitespace-nowrap px-4 py-3.5 text-start text-xs font-semibold ${c.className ?? ''}`}>
                  {c.sort ? (
                    <button type="button" onClick={() => toggleSort(c.sort!)} className="inline-flex items-center gap-1.5 transition-colors hover:text-ink">
                      {c.label}
                      <SortMark state={params.sort === c.sort ? 'asc' : params.sort === `${c.sort}_desc` ? 'desc' : null} />
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
              {props.rowActions && <th className="w-28 px-4"><span className="sr-only">إجراءات</span></th>}
            </tr>
          </thead>
          <tbody key={pageId} className={`divide-y divide-line/80 transition-opacity duration-200 ${fetching && query.isPlaceholderData ? 'opacity-55' : ''}`}>
            {firstLoad
              ? Array.from({ length: 6 }, (_, i) => <SkeletonRow key={i} cols={props.columns.length + (props.rowActions ? 1 : 0) + (selectable ? 1 : 0)} />)
              : data.rows.map((r, i) => {
                  const k = props.rowKey(r);
                  const on = selected.has(k);
                  return (
                    <tr
                      key={k}
                      onClick={props.onRowClick ? () => props.onRowClick!(r) : undefined}
                      className={`animate-row transition-colors ${on ? 'bg-board/[0.06]' : 'hover:bg-board/[0.03]'} ${props.onRowClick ? 'cursor-pointer' : ''}`}
                      style={{ animationDelay: `${i * 18}ms` }}
                    >
                      {selectable && (
                        <td className="ps-5" onClick={(e) => e.stopPropagation()}>
                          <Check checked={on} onChange={() => toggleOne(k)} label="تحديد" />
                        </td>
                      )}
                      {props.columns.map((c) => (
                        <td key={c.key} className={`px-4 py-3.5 align-middle ${c.className ?? ''}`}>{c.render(r)}</td>
                      ))}
                      {props.rowActions && (
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">{props.rowActions(r)}</div>
                        </td>
                      )}
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {/* الجوال */}
      <ul key={`m-${pageId}`} className={`divide-y divide-line/80 border-t border-line transition-opacity duration-200 md:hidden ${fetching && query.isPlaceholderData ? 'opacity-55' : ''}`}>
        {firstLoad
          ? Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="flex items-center gap-3 p-4">
                <div className="skeleton size-11 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2"><div className="skeleton h-4 w-2/3" /><div className="skeleton h-3 w-1/3" /></div>
              </li>
            ))
          : data.rows.map((r, i) => {
              const k = props.rowKey(r);
              const on = selected.has(k);
              return (
                <li key={k} className={`animate-row ${on ? 'bg-board/[0.06]' : ''}`} style={{ animationDelay: `${i * 18}ms` }}>
                  <div
                    role={props.onRowClick ? 'button' : undefined}
                    tabIndex={props.onRowClick ? 0 : undefined}
                    onClick={props.onRowClick ? () => props.onRowClick!(r) : undefined}
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-paper"
                  >
                    {selectable && (
                      <span onClick={(e) => e.stopPropagation()}>
                        <Check checked={on} onChange={() => toggleOne(k)} label="تحديد" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">{props.mobileCard(r)}</div>
                    {props.rowActions && <div className="flex shrink-0 gap-0.5" onClick={(e) => e.stopPropagation()}>{props.rowActions(r)}</div>}
                  </div>
                </li>
              );
            })}
      </ul>

      {!firstLoad && data.rows.length === 0 && (
        <div className="grid place-items-center border-t border-line px-6 py-16 text-center">
          <span className="grid size-16 place-items-center rounded-2xl bg-board/10 text-board">
            <Icon name={props.icon ?? 'search'} className="size-8" />
          </span>
          <p className="mt-4 text-lg font-semibold">{props.emptyTitle}</p>
          {(params.q || activeFilters > 0) && <p className="mt-1 text-muted">جرّب كلمة بحث أخرى أو امسح التصفية.</p>}
        </div>
      )}

      {/* الترقيم */}
      {data.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3.5 text-sm sm:px-5">
          <div className="flex items-center gap-2 text-muted">
            <span>عرض</span>
            <select value={size} onChange={(e) => set({ size: Number(e.target.value) })} aria-label="عدد الصفوف" className="h-9 rounded-lg border border-line bg-surface px-2 font-semibold text-ink focus:border-board focus:outline-none">
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>
              <span className="font-semibold tabular-nums text-ink">{from}–{to}</span> من <span className="font-semibold tabular-nums text-ink">{data.total}</span>
            </span>
          </div>
          {pages > 1 && (
            <nav aria-label="الصفحات" className="flex items-center gap-1">
              <PageBtn onClick={() => go(params.page - 1)} onHover={() => prefetch(params.page - 1)} disabled={params.page === 1} label="السابقة">
                <Icon name="chevron" className="size-4 rotate-180" />
              </PageBtn>
              {pageList.map((p, i) =>
                p === '…' ? (
                  <span key={`g${i}`} className="px-1 text-muted">…</span>
                ) : (
                  <PageBtn key={p} onClick={() => go(p)} onHover={() => prefetch(p)} active={p === params.page} label={`الصفحة ${p}`}>{p}</PageBtn>
                ),
              )}
              <PageBtn onClick={() => go(params.page + 1)} onHover={() => prefetch(params.page + 1)} disabled={params.page === pages} label="التالية">
                <Icon name="chevron" className="size-4" />
              </PageBtn>
            </nav>
          )}
        </div>
      )}

      {/* شريط الإجراءات الجماعية */}
      <AnimatePresence>
        {props.bulkActions && selectedRows.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="fixed inset-x-3 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl flex-wrap items-center gap-2 rounded-2xl bg-ink px-4 py-3 text-chalk shadow-[0_20px_50px_-15px_rgb(0_0_0/0.5)] lg:bottom-6"
          >
            <span className="me-auto text-sm font-semibold">
              تم تحديد <span className="tabular-nums text-gold">{selectedRows.length}</span>
            </span>
            {props.bulkActions(selectedRows, () => setSelected(new Set()))}
            <button type="button" onClick={() => setSelected(new Set())} aria-label="إلغاء التحديد" className="grid size-9 place-items-center rounded-lg text-chalk/70 hover:bg-chalk/10 hover:text-chalk">
              <Icon name="close" className="size-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export const Registry = forwardRef(RegistryInner) as <T>(p: Props<T> & { ref?: React.Ref<RegistryHandle> }) => React.ReactElement;

/** زر داخل شريط الإجراءات الجماعية */
export function BulkButton({ children, onClick, tone = 'plain', busy }: { children: React.ReactNode; onClick: () => void; tone?: 'plain' | 'danger'; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors disabled:opacity-60 ${tone === 'danger' ? 'bg-danger/90 hover:bg-danger' : 'bg-chalk/12 hover:bg-chalk/20'}`}
    >
      {busy && <span className="spinner" />}
      {children}
    </button>
  );
}

function Check({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      onClick={onChange}
      className={`grid size-5 place-items-center rounded-md border-2 transition-all duration-150 ${checked || indeterminate ? 'border-board bg-board text-chalk' : 'border-line bg-surface hover:border-board/60'}`}
    >
      {checked && <svg viewBox="0 0 16 16" className="size-3.5"><path d="m3.5 8.5 3 3 6-6.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      {!checked && indeterminate && <span className="h-0.5 w-2.5 rounded bg-chalk" />}
    </button>
  );
}

function PageBtn({ children, onClick, onHover, disabled, active, label }: { children: React.ReactNode; onClick: () => void; onHover: () => void; disabled?: boolean; active?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onHover}
      onFocus={onHover}
      disabled={disabled}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm font-medium tabular-nums transition-all duration-200 disabled:pointer-events-none disabled:opacity-35 ${
        active ? 'bg-board text-chalk shadow-[0_8px_16px_-8px_rgb(53_104_84/0.9)]' : 'border border-line bg-surface hover:-translate-y-0.5 hover:border-board/40 hover:text-board'
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
        <td key={i} className="px-4 py-4"><div className={`skeleton h-4 ${i === 0 ? 'w-40' : 'w-20'}`} /></td>
      ))}
    </tr>
  );
}

function pageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const s = Math.max(2, current - 1);
  const e = Math.min(total - 1, current + 1);
  if (s > 2) out.push('…');
  for (let i = s; i <= e; i++) out.push(i);
  if (e < total - 1) out.push('…');
  out.push(total);
  return out;
}

/** زر إجراء صغير بأيقونة داخل الصفوف */
export function RowButton({ icon, label, onClick, tone = 'plain' }: { icon: IconName; label: string; onClick: () => void; tone?: 'plain' | 'danger' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid size-9 place-items-center rounded-lg transition-colors ${tone === 'danger' ? 'text-muted hover:bg-danger-soft hover:text-danger' : 'text-muted hover:bg-board/10 hover:text-board'}`}
    >
      <Icon name={icon} className="size-[1.15rem]" />
    </button>
  );
}
