'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from './icons';
import { listStudents } from '@/app/staff/(app)/students/actions';

/* =====================================================================
   أدوات الشريط العلوي في الجوال:
   - بحث سريع عن طالب بشاشة كاملة ونتائج حية (للإداري)
   - بطاقة "اليوم": التاريخ الميلادي والهجري والأسبوع الدراسي
   - إخفاء الشريط عند التمرير لأسفل وإظهاره عند التمرير لأعلى
   ===================================================================== */

/** يخفي الشريط العلوي على الجوال أثناء النزول في الصفحة، ويعيده عند أي صعود */
export function useHideOnScroll() {
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    let last = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        setScrolled(y > 8);
        if (mq.matches) {
          if (y > last + 6 && y > 90) setHidden(true);
          else if (y < last - 6 || y < 90) setHidden(false);
        } else setHidden(false);
        last = y;
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return { hidden, scrolled };
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', k);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return createPortal(children, document.body);
}

export function QuickSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 120);
    else {
      setQ('');
      setTerm('');
    }
  }, [open]);

  const { data, isFetching } = useQuery({
    queryKey: ['quick-search', term],
    queryFn: () => listStudents({ page: 1, size: 10, q: term, sort: 'name', filters: {} }),
    enabled: open && term.length >= 2,
  });

  const go = (code: string) => {
    setOpen(false);
    router.push(`/staff/students?q=${encodeURIComponent(code)}`);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="بحث عن طالب" className="grid size-10 place-items-center rounded-xl border border-line bg-surface text-ink transition-transform active:scale-95">
        <Icon name="search" className="size-5" />
      </button>
      <AnimatePresence>
        {open && (
          <Overlay onClose={() => setOpen(false)}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-ink/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ y: -30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 36 }}
              className="fixed inset-x-0 top-0 z-[61] max-h-[85dvh] overflow-hidden rounded-b-[1.6rem] bg-surface shadow-2xl"
            >
              <div className="flex items-center gap-2 border-b border-line p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
                <div className="relative flex-1">
                  <Icon name="search" className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-5 text-muted" />
                  <input
                    ref={input}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="اسم الطالب أو رقمه أو هويته"
                    className="h-12 w-full rounded-2xl bg-paper pe-10 ps-11 text-base focus:outline-none focus:ring-2 focus:ring-board/30"
                    enterKeyHint="search"
                    onKeyDown={(e) => e.key === 'Enter' && q.trim() && go(q.trim())}
                  />
                  {isFetching && <span className="spinner absolute inset-y-0 end-3.5 my-auto text-board" />}
                </div>
                <button type="button" onClick={() => setOpen(false)} className="h-12 px-2 text-sm font-semibold text-board">إلغاء</button>
              </div>
              <div className="max-h-[65dvh] overflow-y-auto p-2">
                {term.length < 2 ? (
                  <p className="px-3 py-8 text-center text-sm text-muted">اكتب حرفين على الأقل للبحث في كل الطلاب.</p>
                ) : data && data.rows.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-muted">لا طلاب مطابقون لـ "{term}".</p>
                ) : (
                  <ul>
                    {(data?.rows ?? []).map((r, i) => (
                      <motion.li key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }}>
                        <button type="button" onClick={() => go(r.code)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-start transition-colors active:bg-paper">
                          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-board/10 font-bold text-board">{r.name_ar.trim().charAt(0)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">{r.name_ar}</span>
                            <span className="block truncate text-xs text-muted"><bdi>{r.code}</bdi> · {r.class_label}</span>
                          </span>
                          <Icon name="chevron" className="size-4 text-muted" />
                        </button>
                      </motion.li>
                    ))}
                    {data && data.total > data.rows.length && (
                      <li>
                        <button type="button" onClick={() => go(term)} className="w-full rounded-2xl px-3 py-3 text-center text-sm font-semibold text-board active:bg-paper">
                          عرض كل النتائج ({data.total})
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </motion.div>
          </Overlay>
        )}
      </AnimatePresence>
    </>
  );
}

export function TodayButton({ today, week }: { today: { day: string; date: string; hijri: string }; week: { label: string; range: string } | null }) {
  const [open, setOpen] = useState(false);
  const day = today.date.match(/\d+/)?.[0] ?? '';
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="اليوم والأسبوع" className="relative grid size-10 place-items-center overflow-hidden rounded-xl border border-line bg-surface leading-none transition-transform active:scale-95">
        <span className="absolute inset-x-0 top-0 h-2.5 bg-board" />
        <span className="mt-2 text-[0.95rem] font-bold tabular-nums">{day}</span>
      </button>
      <AnimatePresence>
        {open && (
          <Overlay onClose={() => setOpen(false)}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-ink/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ y: -24, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -16, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              className="fixed inset-x-3 top-[calc(4.75rem+env(safe-area-inset-top))] z-[61] overflow-hidden rounded-[1.6rem] bg-board p-5 text-chalk shadow-2xl"
              onClick={() => setOpen(false)}
            >
              <div aria-hidden className="absolute -end-10 -top-10 size-40 rounded-full bg-gold/25 blur-2xl" />
              <p className="relative text-sm text-chalk/70">{today.day}</p>
              <p className="relative mt-1 text-2xl font-bold">{today.date}</p>
              <p className="relative text-chalk/75">{today.hijri}</p>
              {week && (
                <div className="relative mt-4 flex items-center justify-between rounded-2xl bg-chalk/10 px-4 py-3">
                  <span>
                    <span className="block text-xs text-chalk/65">الأسبوع الدراسي</span>
                    <span className="block font-bold">{week.label}</span>
                  </span>
                  <span className="text-sm text-chalk/75">{week.range}</span>
                </div>
              )}
            </motion.div>
          </Overlay>
        )}
      </AnimatePresence>
    </>
  );
}
