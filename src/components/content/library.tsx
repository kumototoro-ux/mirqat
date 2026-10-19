'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { subjectColor } from '@/components/timetable-grid';
import { openContent, setContentProgress } from '@/lib/content/actions';
import { isNew, parseMedia, type StudentContent } from '@/lib/content/shared';
import { MediaThumb, Modal, TimeAgo } from './media';
import { ContentView } from './studio';

/* =====================================================================
   مكتبة الطالب: تقدّم لكل مادة، أكمل ما بدأته، جديد، محفوظ، ومشغّل داخل المنصة
   ===================================================================== */

type Tab = 'all' | 'video' | 'enrichment' | 'unseen' | 'saved';
const STEP = 15;

export function ContentLibrary({ initial }: { initial: StudentContent[] }) {
  const { toast } = useFeedback();
  const [items, setItems] = useState(initial);
  const [tab, setTab] = useState<Tab>('all');
  const [subject, setSubject] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(STEP);
  const [openId, setOpenId] = useState<number | null>(null);
  const open = items.find((x) => x.id === openId) ?? null;

  const patch = (id: number, p: Partial<StudentContent>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const show = (c: StudentContent) => {
    setOpenId(c.id);
    const now = new Date().toISOString();
    patch(c.id, { opened_at: c.opened_at ?? now, last_opened_at: now });
    void openContent(c.id);
  };
  const toggleDone = async (c: StudentContent) => {
    const done = !c.completed_at;
    patch(c.id, { completed_at: done ? new Date().toISOString() : null });
    const res = await setContentProgress(c.id, done, null);
    if (!res.ok) { patch(c.id, { completed_at: c.completed_at }); return toast(res.error, 'error'); }
    toast(res.message);
  };
  const toggleSave = async (c: StudentContent) => {
    const saved = !c.saved_at;
    patch(c.id, { saved_at: saved ? new Date().toISOString() : null });
    const res = await setContentProgress(c.id, null, saved);
    if (!res.ok) { patch(c.id, { saved_at: c.saved_at }); return toast(res.error, 'error'); }
    toast(res.message);
  };

  const subjects = useMemo(() => {
    const m = new Map<number, { id: number; name: string; total: number; done: number }>();
    for (const c of items) {
      const s = m.get(c.subject_id) ?? { id: c.subject_id, name: c.subject, total: 0, done: 0 };
      s.total++;
      if (c.completed_at) s.done++;
      m.set(c.subject_id, s);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [items]);

  const done = items.filter((c) => c.completed_at).length;
  const unseen = items.filter((c) => !c.opened_at).length;
  const continuing = items.filter((c) => c.opened_at && !c.completed_at).sort((a, b) => (b.last_opened_at ?? '').localeCompare(a.last_opened_at ?? '')).slice(0, 6);
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  const filtered = items.filter(
    (c) =>
      (tab === 'all' || (tab === 'video' && c.kind === 'video') || (tab === 'enrichment' && c.kind === 'enrichment') || (tab === 'unseen' && !c.opened_at) || (tab === 'saved' && c.saved_at)) &&
      (!subject || c.subject_id === subject) &&
      (!q.trim() || c.title.includes(q.trim()) || c.subject.includes(q.trim())),
  );
  const nextInSubject = open ? items.filter((x) => x.subject_id === open.subject_id && x.id !== open.id && !x.completed_at)[0] : null;

  if (!items.length)
    return (
      <div className="relative grid place-items-center overflow-hidden rounded-[1.75rem] border border-line bg-surface px-6 py-16 text-center">
        <div aria-hidden className="absolute -top-24 size-72 rounded-full bg-gold/10 blur-3xl" />
        <span className="relative grid size-16 place-items-center rounded-2xl bg-board text-gold"><Icon name="content" className="size-8" /></span>
        <p className="relative mt-4 text-lg font-bold">لا محتوى منشور بعد</p>
        <p className="relative mt-1 max-w-sm text-sm text-muted">عندما ينشر معلموك شروحات أو إثراءات تظهر هنا فورًا، وتتابع تقدمك في كل مادة.</p>
      </div>
    );

  return (
    <div className="space-y-5">
      {/* التقدم */}
      <section className="relative overflow-hidden rounded-[1.75rem] bg-board p-5 text-chalk sm:p-6">
        <div aria-hidden className="absolute -end-20 -top-24 size-72 rounded-full bg-gold/15 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-5">
          <div className="relative grid size-24 shrink-0 place-items-center">
            <svg viewBox="0 0 96 96" className="absolute inset-0 -rotate-90">
              <circle cx="48" cy="48" r="40" fill="none" stroke="rgb(255 255 255 / 0.14)" strokeWidth="9" />
              <motion.circle cx="48" cy="48" r="40" fill="none" stroke="#e2b357" strokeWidth="9" strokeLinecap="round" strokeDasharray={251.3} initial={{ strokeDashoffset: 251.3 }} animate={{ strokeDashoffset: 251.3 - (251.3 * pct) / 100 }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} />
            </svg>
            <span className="text-xl font-bold tabular-nums" dir="ltr">{pct}%</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-chalk/70">تقدّمك في المكتبة</p>
            <p className="mt-0.5 text-2xl font-bold">أكملت {done} من {items.length}</p>
            <p className="mt-1 text-sm text-chalk/75">{unseen ? `${unseen} لم تشاهدها بعد` : 'شاهدت كل المحتوى المنشور 👏'}</p>
          </div>
          {unseen > 0 && (
            <button type="button" onClick={() => { setTab('unseen'); setSubject(null); }} className="w-full rounded-xl bg-gold px-4 py-2.5 text-sm font-bold text-ink transition-transform active:scale-95 sm:w-auto">
              ابدأ بالجديد
            </button>
          )}
        </div>
      </section>

      {/* أكمل ما بدأته */}
      {continuing.length > 0 && (
        <section>
          <h2 className="mb-2.5 font-bold">أكمل ما بدأته</h2>
          <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
            {continuing.map((c) => (
              <button key={c.id} type="button" onClick={() => show(c)} className="group w-60 shrink-0 snap-start overflow-hidden rounded-2xl border border-line bg-surface text-start transition-shadow hover:shadow-[0_14px_30px_-22px_rgb(31_42_36/0.7)]">
                <MediaThumb kind={c.kind} url={c.url} subject={c.subject} minutes={c.minutes} className="aspect-video" />
                <span className="block p-3">
                  <span className="block truncate text-sm font-bold">{c.title}</span>
                  <span className="text-xs text-muted">{c.subject} · فتحته <TimeAgo iso={c.last_opened_at} /></span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* المواد */}
      {subjects.length > 1 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <button type="button" onClick={() => { setSubject(null); setLimit(STEP); }} className={`shrink-0 rounded-2xl px-4 py-2 text-sm font-semibold transition-colors ${subject == null ? 'bg-ink text-chalk' : 'bg-surface ring-1 ring-line'}`}>كل المواد</button>
          {subjects.map((s) => {
            const on = subject === s.id;
            return (
              <button key={s.id} type="button" onClick={() => { setSubject(on ? null : s.id); setLimit(STEP); }} className={`flex shrink-0 items-center gap-2 rounded-2xl px-3.5 py-2 text-sm transition-colors ${on ? 'bg-ink text-chalk' : 'bg-surface ring-1 ring-line hover:ring-board/40'}`}>
                <span className="size-2.5 rounded-full" style={{ background: subjectColor(s.name) }} />
                <span className="font-semibold">{s.name}</span>
                <span className={`text-xs tabular-nums ${on ? 'text-chalk/70' : 'text-muted'}`}>{s.done}/{s.total}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex w-full overflow-x-auto rounded-2xl border border-line bg-surface p-1 sm:w-auto" role="tablist">
          {([['all', 'الكل'], ['video', 'فيديوهات'], ['enrichment', 'إثراءات'], ['unseen', `لم أشاهده${unseen ? ` (${unseen})` : ''}`], ['saved', 'المحفوظة']] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setLimit(STEP); }} className={`relative shrink-0 rounded-xl px-3 py-2 text-[0.82rem] font-semibold transition-colors sm:px-4 sm:text-sm ${tab === k ? 'text-chalk' : 'text-muted hover:text-ink'}`}>
              {tab === k && <motion.span layoutId="lib-tab" className="absolute inset-0 rounded-xl bg-board" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
              <span className="relative whitespace-nowrap">{l}</span>
            </button>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <Icon name="search" className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(STEP); }} placeholder="ابحث في المكتبة" className="field py-2.5 ps-9" />
        </div>
      </div>

      {!filtered.length ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface px-4 py-12 text-center text-muted">{tab === 'saved' ? 'لم تحفظ شيئًا بعد — اضغط علامة الحفظ على أي بطاقة.' : tab === 'unseen' ? 'لا جديد — شاهدت كل شيء ✓' : 'لا نتائج'}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false} mode="popLayout">
            {filtered.slice(0, limit).map((c, i) => (
              <motion.li key={c.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: Math.min(i, 9) * 0.03 }} className="group relative overflow-hidden rounded-[1.4rem] border border-line bg-surface transition-shadow hover:shadow-[0_18px_40px_-28px_rgb(31_42_36/0.6)]">
                <button type="button" onClick={() => show(c)} className="block w-full text-start">
                  <MediaThumb kind={c.kind} url={c.url} subject={c.subject} minutes={c.minutes} className="aspect-[16/8.5]">
                    <div className="absolute start-2 top-2 flex gap-1.5">
                      {c.completed_at ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-ok px-2 py-0.5 text-[0.7rem] font-bold text-chalk"><Icon name="check" className="size-3" /> مكتمل</span>
                      ) : !c.opened_at && isNew(c.published_at) ? (
                        <span className="rounded-full bg-gold px-2 py-0.5 text-[0.7rem] font-bold text-ink">جديد</span>
                      ) : null}
                      {c.is_pinned && <span className="rounded-full bg-white/90 px-2 py-0.5 text-[0.7rem] font-semibold text-ink">مثبّت</span>}
                    </div>
                  </MediaThumb>
                  <span className="block p-4 pe-12">
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <span className="size-2 rounded-full" style={{ background: subjectColor(c.subject) }} />
                      {c.subject} · {c.kind === 'video' ? (parseMedia(c.url)?.provider === 'link' ? 'رابط' : 'فيديو') : 'إثراء'}
                    </span>
                    <span className="mt-1 line-clamp-2 block font-bold leading-snug group-hover:text-board">{c.title}</span>
                    <span className="mt-1 block text-xs text-muted">{c.teacher ? `${c.teacher} · ` : ''}<TimeAgo iso={c.published_at} /></span>
                  </span>
                </button>
                <button type="button" onClick={() => toggleSave(c)} aria-pressed={!!c.saved_at} aria-label={c.saved_at ? 'إزالة من المحفوظة' : 'حفظ لاحقًا'} className={`absolute bottom-3 end-3 grid size-9 place-items-center rounded-full transition-colors ${c.saved_at ? 'bg-gold/20 text-brass' : 'text-muted hover:bg-paper hover:text-ink'}`}>
                  <svg viewBox="0 0 20 20" className="size-[1.1rem]" fill={c.saved_at ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M5.5 3.5h9v13l-4.5-3-4.5 3z" /></svg>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {filtered.length > limit && (
        <div className="text-center">
          <button type="button" onClick={() => setLimit((l) => l + STEP)} className="btn-quiet px-6">عرض المزيد ({filtered.length - limit})</button>
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpenId(null)} label={open?.title ?? ''}>
        {open && (
          <ContentView
            item={open}
            footer={
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                <button type="button" onClick={() => toggleDone(open)} className={open.completed_at ? 'btn-quiet text-ok' : 'btn-primary'}>
                  <Icon name="check" className="size-4" /> {open.completed_at ? 'مكتمل — إلغاء' : open.kind === 'video' ? 'أكملت المشاهدة' : 'أنهيت القراءة'}
                </button>
                <button type="button" onClick={() => toggleSave(open)} className="btn-quiet">{open.saved_at ? 'محفوظ ✓' : 'حفظ لاحقًا'}</button>
                {open.url && parseMedia(open.url)?.provider !== 'link' && (
                  <a href={parseMedia(open.url)!.watch} target="_blank" rel="noopener noreferrer" className="btn-quiet">فتح في التطبيق</a>
                )}
                <span className="flex-1" />
                {nextInSubject && (
                  <button type="button" onClick={() => show(nextInSubject)} className="inline-flex items-center gap-1 text-sm font-semibold text-board">
                    التالي: <span className="max-w-40 truncate">{nextInSubject.title}</span> <Icon name="chevron" className="size-4" />
                  </button>
                )}
              </div>
            }
          />
        )}
      </Modal>
    </div>
  );
}
