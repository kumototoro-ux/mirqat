'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { Sheet } from '@/components/sheet';
import { downloadCsv } from '@/components/registry/csv';
import { fmtFull } from '@/components/assess/kit';
import type { AuthorContext } from '@/lib/assess/queries';
import { contentStats, contentViewers, deleteContent, listContent, setContentFlags, type ContentStats } from '@/lib/content/actions';
import { STATUS_LABEL, fmtMinutes, relTime, type StaffContent } from '@/lib/content/shared';
import type { PageParams, PageResult } from '@/components/registry/types';
import { ContentEditor } from './editor';
import { AttachmentList, MediaThumb, Modal, Player, RichBody, TimeAgo } from './media';

/* =====================================================================
   استوديو المحتوى للموظف: بطاقات مرئية مرقّمة من الخادم، فلاتر، تحليل المشاهدة
   ===================================================================== */

type Kind = '' | 'video' | 'enrichment';
const SIZE = 15;

export function ContentStudio({ ctx, initial, initialStats, myEmployeeId }: { ctx: AuthorContext; initial: PageResult<StaffContent>; initialStats: ContentStats; myEmployeeId: number | null }) {
  const qc = useQueryClient();
  const { toast, confirm } = useFeedback();
  const [kind, setKind] = useState<Kind>('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('');
  const [subj, setSubj] = useState('');
  const [status, setStatus] = useState('');
  const [mine, setMine] = useState(false);
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{ item?: StaffContent | null; copy?: StaffContent | null; kind: 'video' | 'enrichment' } | null>(null);
  const [viewersOf, setViewersOf] = useState<StaffContent | null>(null);
  const [preview, setPreview] = useState<StaffContent | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [qInput]);

  const params: PageParams = useMemo(() => ({ page, size: SIZE, q, sort, filters: { kind, class: cls, subject: subj, status, mine: mine ? '1' : '' } }), [page, q, sort, kind, cls, subj, status, mine]);
  const isBase = page === 1 && !q && sort === 'newest' && !kind && !cls && !subj && !status && !mine;
  const list = useQuery({ queryKey: ['content', params], queryFn: () => listContent(params), initialData: isBase ? initial : undefined, placeholderData: keepPreviousData });
  const stats = useQuery({ queryKey: ['content-stats'], queryFn: () => contentStats(), initialData: initialStats });
  const data = list.data ?? { rows: [], total: 0 };
  const pages = Math.max(1, Math.ceil(data.total / SIZE));
  const refresh = () => { qc.invalidateQueries({ queryKey: ['content'] }); qc.invalidateQueries({ queryKey: ['content-stats'] }); };
  const set = (fn: () => void) => { fn(); setPage(1); };
  const classLabel = (id: number) => ctx.classes.find((c) => c.value === id)?.label ?? '';
  const subjectName = (id: number) => ctx.subjects.find((s) => s.value === id)?.label ?? '';
  const canEdit = (r: StaffContent) => ctx.isAdmin || r.teacher_id === myEmployeeId;
  const activeFilters = [cls, subj, status].filter(Boolean).length + (mine ? 1 : 0);

  const flag = async (r: StaffContent, f: Parameters<typeof setContentFlags>[1], c?: { title: string; body: string; danger?: boolean; label: string }) => {
    if (c) {
      if (await confirm({ title: c.title, body: c.body, confirmLabel: c.label, danger: c.danger, run: () => setContentFlags(r.id, f) })) refresh();
      return;
    }
    const res = await setContentFlags(r.id, f);
    if (!res.ok) return toast(res.error, 'error');
    toast(res.message);
    refresh();
  };
  const remove = async (r: StaffContent) => {
    const ok = await confirm({ title: `حذف "${r.title}"؟`, body: `يُحذف من ${classLabel(r.class_id)} مع سجل مشاهداته (${r.viewers} طالب). لا يمكن التراجع.`, confirmLabel: 'حذف', danger: true, run: () => deleteContent(r.id) });
    if (ok) refresh();
  };

  const s = stats.data;
  return (
    <div className="space-y-4">
      {/* البطاقة العليا */}
      <section className="relative overflow-hidden rounded-[1.75rem] bg-board p-5 text-chalk sm:p-6">
        <div aria-hidden className="absolute -start-24 -top-28 size-80 rounded-full bg-gold/15 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-chalk/70">مكتبة الفصول</p>
            <p className="mt-0.5 text-2xl font-bold">
              {s.videos} فيديو · {s.enrichments} إثراء
            </p>
            <p className="mt-1 text-sm text-chalk/75">
              {s.week_views} مشاهدة هذا الأسبوع{s.completion != null ? ` · ${s.completion}% من المشاهدات مكتملة` : ''}
              {s.scheduled ? ` · ${s.scheduled} مجدول` : ''}
              {s.drafts ? ` · ${s.drafts} مسودة` : ''}
            </p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <button type="button" onClick={() => setEditor({ kind: 'video' })} className="btn-primary flex-1 bg-gold text-ink hover:bg-gold/90 sm:flex-none">
              <Icon name="play" className="size-4" /> فيديو
            </button>
            <button type="button" onClick={() => setEditor({ kind: 'enrichment' })} className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-chalk/10 px-4 py-2.5 text-sm font-semibold text-chalk ring-1 ring-chalk/20 hover:bg-chalk/20 sm:flex-none">
              <Icon name="plus" className="size-4" /> إثراء
            </button>
          </div>
        </div>
      </section>

      {/* الأدوات */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex w-full rounded-2xl border border-line bg-surface p-1 sm:w-auto" role="tablist">
          {([['', 'الكل'], ['video', 'الفيديوهات'], ['enrichment', 'الإثراءات']] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => set(() => setKind(k))} className={`relative flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors sm:flex-none sm:px-4 ${kind === k ? 'text-chalk' : 'text-muted hover:text-ink'}`}>
              {kind === k && <motion.span layoutId="ct-tab" className="absolute inset-0 rounded-xl bg-board" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
              <span className="relative">{l}</span>
            </button>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <Icon name="search" className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted" />
          <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="ابحث بالعنوان" className="field py-2.5 ps-9" />
        </div>
        <select value={sort} onChange={(e) => set(() => setSort(e.target.value))} className="field w-auto py-2.5 text-sm" aria-label="الترتيب">
          <option value="newest">الأحدث</option>
          <option value="views">الأكثر مشاهدة</option>
          <option value="oldest">الأقدم</option>
          <option value="title">بالعنوان</option>
        </select>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <select value={cls} onChange={(e) => set(() => setCls(e.target.value))} className={`field w-auto shrink-0 py-2 text-sm ${cls ? 'border-board text-board' : ''}`} aria-label="الفصل">
          <option value="">كل الفصول</option>
          {ctx.classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select value={subj} onChange={(e) => set(() => setSubj(e.target.value))} className={`field w-auto shrink-0 py-2 text-sm ${subj ? 'border-board text-board' : ''}`} aria-label="المادة">
          <option value="">كل المواد</option>
          {ctx.subjects.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        {(['', 'published', 'scheduled', 'draft', 'expired'] as const).map((k) => (
          <button key={k} type="button" onClick={() => set(() => setStatus(k))} className={`shrink-0 rounded-full px-3.5 py-2 text-sm transition-colors ${status === k ? 'bg-ink text-chalk' : 'bg-surface ring-1 ring-line hover:ring-board/40'}`}>
            {k ? STATUS_LABEL[k].label : 'كل الحالات'}
          </button>
        ))}
        <button type="button" onClick={() => set(() => setMine((v) => !v))} aria-pressed={mine} className={`shrink-0 rounded-full px-3.5 py-2 text-sm transition-colors ${mine ? 'bg-board text-chalk' : 'bg-surface ring-1 ring-line hover:ring-board/40'}`}>
          محتواي فقط
        </button>
        {activeFilters > 0 && (
          <button type="button" onClick={() => set(() => { setCls(''); setSubj(''); setStatus(''); setMine(false); })} className="shrink-0 px-2 text-sm text-danger">مسح ({activeFilters})</button>
        )}
      </div>

      {/* البطاقات */}
      <div className={`transition-opacity duration-200 ${list.isFetching && !list.isPending ? 'opacity-60' : ''}`}>
        {list.isPending ? (
          <GridSkeleton />
        ) : !data.rows.length ? (
          <div className="grid place-items-center rounded-[1.6rem] border border-dashed border-line bg-surface px-6 py-16 text-center">
            <span className="grid size-16 place-items-center rounded-2xl bg-board/10 text-board"><Icon name="content" className="size-8" /></span>
            <p className="mt-4 text-lg font-semibold">{q || activeFilters || kind ? 'لا نتائج مطابقة' : 'المكتبة فارغة'}</p>
            <p className="mt-1 max-w-sm text-sm text-muted">{q || activeFilters || kind ? 'جرّب تغيير البحث أو الفلاتر.' : 'ابدأ بنشر أول فيديو أو إثراء لطلابك — يظهر لهم فورًا في بوابتهم.'}</p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence initial={false} mode="popLayout">
              {data.rows.map((r, i) => {
                const pct = r.class_size ? Math.round((r.viewers / r.class_size) * 100) : 0;
                const st = STATUS_LABEL[r.status];
                return (
                  <motion.li key={r.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ delay: Math.min(i, 9) * 0.03 }} className="group flex flex-col overflow-hidden rounded-[1.4rem] border border-line bg-surface transition-shadow hover:shadow-[0_18px_40px_-28px_rgb(31_42_36/0.6)]">
                    <button type="button" onClick={() => setPreview(r)} className="block text-start" aria-label={`معاينة ${r.title}`}>
                      <MediaThumb kind={r.kind} url={r.url} subject={subjectName(r.subject_id)} minutes={r.minutes} className="aspect-[16/8.5]">
                        <div className="absolute start-2 top-2 flex gap-1.5">
                          {r.status !== 'published' && <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${st.tone}`}>{st.label}</span>}
                          {r.is_pinned && <span className="grid size-6 place-items-center rounded-full bg-gold text-ink" title="مثبّت"><svg viewBox="0 0 20 20" className="size-3.5" fill="currentColor"><path d="M12.5 2.5 17.5 7.5l-3 1-3.2 3.2.7 4-1.5 1.5-3-3-4 4-.7-.7 4-4-3-3L5.3 9l4 .7L12.5 6.5z" /></svg></span>}
                        </div>
                      </MediaThumb>
                    </button>
                    <div className="flex flex-1 flex-col p-4">
                      <p className="text-xs text-muted">{subjectName(r.subject_id)} · {classLabel(r.class_id)}</p>
                      <p className="mt-0.5 line-clamp-2 font-bold leading-snug">{r.title}</p>
                      <p className="mt-1 text-xs text-muted" suppressHydrationWarning>
                        {r.status === 'scheduled' && r.published_at ? `يُنشر ${fmtFull(r.published_at)}` : r.published_at ? `نُشر ${relTime(r.published_at)}` : `أُنشئ ${relTime(r.created_at)}`}
                        {!r.is_mine && r.teacher ? ` · ${r.teacher}` : ''}
                        {r.attachments.length ? ` · ${r.attachments.length} مرفق` : ''}
                      </p>
                      <button type="button" onClick={() => setViewersOf(r)} className="mt-3 rounded-xl bg-paper/70 px-3 py-2.5 text-start transition-colors hover:bg-board/[0.07]">
                        <span className="flex items-center justify-between text-xs">
                          <span className="font-semibold">{r.viewers} من {r.class_size} شاهدوه</span>
                          <span className="text-muted">{r.completed} أكملوا · <bdi dir="ltr">{pct}%</bdi></span>
                        </span>
                        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-line">
                          <motion.span className="block h-full rounded-full bg-board" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7 }} />
                        </span>
                      </button>
                      <div className="mt-auto flex items-center gap-1 pt-3">
                        {canEdit(r) ? (
                          <>
                            <IconBtn icon="edit" label="تعديل" onClick={() => setEditor({ item: r, kind: r.kind })} />
                            <IconBtn icon="copy" label="نسخ لفصول أخرى" onClick={() => setEditor({ copy: r, kind: r.kind })} />
                            <IconBtn icon="flag" label={r.is_pinned ? 'إلغاء التثبيت' : 'تثبيت'} active={r.is_pinned} onClick={() => flag(r, { is_pinned: !r.is_pinned })} />
                            {r.status === 'draft' ? (
                              <button type="button" onClick={() => flag(r, { is_draft: false }, { title: 'نشر للطلاب الآن؟', body: `يظهر "${r.title}" لطلاب ${classLabel(r.class_id)} فورًا.`, label: 'نشر' })} className="ms-auto rounded-full bg-board px-3 py-1.5 text-xs font-semibold text-chalk">نشر</button>
                            ) : r.status === 'published' ? (
                              <IconBtn icon="eye" label="إخفاء عن الطلاب" onClick={() => flag(r, { expire_now: true }, { title: 'إخفاء عن الطلاب؟', body: 'يختفي من بوابتهم الآن، ويبقى سجل المشاهدات. يمكنك إظهاره بتعديل موعد الإخفاء.', label: 'إخفاء', danger: true })} />
                            ) : null}
                            <span className="flex-1" />
                            <IconBtn icon="trash" label="حذف" danger onClick={() => remove(r)} />
                          </>
                        ) : (
                          <span className="text-xs text-muted">للعرض — أنشأه {r.teacher ?? 'معلم آخر'}</span>
                        )}
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>

      {data.total > SIZE && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted">{(page - 1) * SIZE + 1}–{Math.min(page * SIZE, data.total)} من {data.total}</span>
          <div className="flex items-center gap-1.5">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-quiet px-3 py-1.5">السابق</button>
            <span className="tabular-nums text-muted">{page}/{pages}</span>
            <button
              type="button"
              disabled={page >= pages}
              onMouseEnter={() => page < pages && qc.prefetchQuery({ queryKey: ['content', { ...params, page: page + 1 }], queryFn: () => listContent({ ...params, page: page + 1 }) })}
              onClick={() => setPage((p) => p + 1)}
              className="btn-quiet px-3 py-1.5"
            >
              التالي
            </button>
          </div>
        </div>
      )}

      {editor && <ContentEditor ctx={ctx} item={editor.item} copyFrom={editor.copy} defaultKind={editor.kind} onClose={() => setEditor(null)} onSaved={refresh} />}
      <ViewersSheet item={viewersOf} onClose={() => setViewersOf(null)} label={viewersOf ? `${viewersOf.title} · ${classLabel(viewersOf.class_id)}` : ''} />
      <Modal open={!!preview} onClose={() => setPreview(null)} label={preview?.title ?? ''}>
        {preview && <ContentView item={{ ...preview, subject: subjectName(preview.subject_id) }} />}
      </Modal>
    </div>
  );
}

function IconBtn({ icon, label, onClick, danger, active }: { icon: 'edit' | 'copy' | 'flag' | 'trash' | 'eye'; label: string; onClick: () => void; danger?: boolean; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={`grid size-9 place-items-center rounded-lg transition-colors ${active ? 'bg-gold/20 text-brass' : danger ? 'text-muted hover:bg-danger-soft hover:text-danger' : 'text-muted hover:bg-board/10 hover:text-board'}`}>
      <Icon name={icon} className="size-4" />
    </button>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-[1.4rem] border border-line bg-surface">
          <div className="skeleton aspect-[16/8.5] rounded-none" />
          <div className="space-y-2.5 p-4">
            <div className="skeleton h-3 w-1/3" />
            <div className="skeleton h-4 w-4/5" />
            <div className="skeleton h-10 w-full rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** عرض المحتوى كما يراه الطالب (معاينة للمعلم) */
export function ContentView({ item, footer }: { item: { kind: 'video' | 'enrichment'; title: string; description: string | null; url: string | null; body: string | null; attachments: StaffContent['attachments']; minutes: number | null; subject: string; teacher?: string | null }; footer?: React.ReactNode }) {
  return (
    <div>
      {item.kind === 'video' ? (
        <div className="bg-ink p-0 sm:p-0">
          <Player url={item.url} title={item.title} />
        </div>
      ) : (
        <MediaThumb kind="enrichment" url={null} subject={item.subject} className="h-28 sm:h-36" />
      )}
      <div className="space-y-4 p-5 sm:p-7">
        <div>
          <p className="text-sm text-muted">{item.subject}{item.teacher ? ` · ${item.teacher}` : ''}{item.minutes ? ` · ${fmtMinutes(item.minutes)}` : ''}</p>
          <h2 className="mt-1 text-[1.4rem] font-bold leading-snug">{item.title}</h2>
          {item.description && <p className="mt-1.5 text-muted">{item.description}</p>}
        </div>
        {item.kind === 'enrichment' && item.url && <Player url={item.url} title={item.title} />}
        {item.body && <RichBody text={item.body} />}
        <AttachmentList items={item.attachments} />
        {footer}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
function ViewersSheet({ item, onClose, label }: { item: StaffContent | null; onClose: () => void; label: string }) {
  const [tab, setTab] = useState<'all' | 'done' | 'opened' | 'not'>('all');
  const q = useQuery({ queryKey: ['viewers', item?.id], queryFn: () => contentViewers(item!.id), enabled: !!item });
  const rows = q.data ?? [];
  const done = rows.filter((r) => r.completed_at).length;
  const opened = rows.filter((r) => r.first_opened_at && !r.completed_at).length;
  const not = rows.filter((r) => !r.first_opened_at).length;
  const shown = rows.filter((r) => (tab === 'all' ? true : tab === 'done' ? !!r.completed_at : tab === 'opened' ? !!r.first_opened_at && !r.completed_at : !r.first_opened_at));
  const pct = rows.length ? Math.round(((done + opened) / rows.length) * 100) : 0;
  const exportCsv = () =>
    downloadCsv(
      `مشاهدات-${item?.title ?? ''}`,
      ['الطالب', 'رقم الطالب', 'الحالة', 'أول فتح', 'آخر فتح', 'مرات الفتح', 'أكمل في'],
      rows.map((r) => [r.name_ar, r.code, r.completed_at ? 'أكمل' : r.first_opened_at ? 'فتح' : 'لم يشاهد', r.first_opened_at ? fmtFull(r.first_opened_at) : '', r.last_opened_at ? fmtFull(r.last_opened_at) : '', r.opens, r.completed_at ? fmtFull(r.completed_at) : '']),
    );

  return (
    <Sheet open={!!item} onClose={onClose} title="من شاهد؟" subtitle={label} footer={rows.length ? <button type="button" onClick={exportCsv} className="btn-quiet w-full py-3"><Icon name="download" className="size-4" /> تنزيل الكشف (Excel)</button> : undefined}>
      {q.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}</div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-2xl bg-paper/70 p-4">
            <div className="relative grid size-20 shrink-0 place-items-center">
              <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90">
                <circle cx="40" cy="40" r="34" fill="none" stroke="#dfe5e2" strokeWidth="8" />
                <motion.circle cx="40" cy="40" r="34" fill="none" stroke="#356854" strokeWidth="8" strokeLinecap="round" strokeDasharray={213.6} initial={{ strokeDashoffset: 213.6 }} animate={{ strokeDashoffset: 213.6 - (213.6 * pct) / 100 }} transition={{ duration: 0.9 }} />
              </svg>
              <span className="text-lg font-bold tabular-nums">{pct}%</span>
            </div>
            <dl className="grid flex-1 grid-cols-3 gap-2 text-center">
              {[['أكمل', done, 'text-ok'], ['فتح فقط', opened, 'text-board'], ['لم يشاهد', not, 'text-danger']].map(([l, n, t]) => (
                <div key={l as string}>
                  <dd className={`text-xl font-bold tabular-nums ${t}`}>{n}</dd>
                  <dt className="text-xs text-muted">{l}</dt>
                </div>
              ))}
            </dl>
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            {([['all', `الكل ${rows.length}`], ['done', `أكمل ${done}`], ['opened', `فتح ${opened}`], ['not', `لم يشاهد ${not}`]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTab(k)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${tab === k ? 'bg-board text-chalk' : 'bg-paper'}`}>{l}</button>
            ))}
          </div>
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {shown.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className={`size-2.5 shrink-0 rounded-full ${r.completed_at ? 'bg-ok' : r.first_opened_at ? 'bg-board' : 'bg-danger/70'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.name_ar}</span>
                  <span className="text-xs text-muted">
                    {r.completed_at ? `أكمل ${relTime(r.completed_at)}` : r.first_opened_at ? `آخر فتح ${relTime(r.last_opened_at)}` : 'لم يفتحه بعد'}
                    {r.opens > 1 ? ` · ${r.opens} مرات` : ''}
                  </span>
                </span>
                <bdi className="text-xs text-muted">{r.code}</bdi>
              </li>
            ))}
            {!shown.length && <li className="px-4 py-8 text-center text-sm text-muted">لا أحد</li>}
          </ul>
        </div>
      )}
    </Sheet>
  );
}
