'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { Icon } from '@/components/shell/icons';
import { Sheet } from '@/components/sheet';
import { certDates, typeMeta, type AppreciationBrand, type AppreciationView } from '@/lib/certs/appreciation';
import { AppreciationViewer } from './appreciation-sheet';

/** شهادات الشكر والتقدير في صفحة نتائج الطالب */
export function StudentAppreciation({ certs, brand }: { certs: AppreciationView[]; brand: AppreciationBrand }) {
  const [open, setOpen] = useState<AppreciationView | null>(null);
  return (
    <section className="mb-6">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><Icon name="award" className="size-5 text-brass" /> شهادات الشكر والتقدير <span className="text-sm font-normal text-muted">({certs.length})</span></h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {certs.map((v, i) => {
          const m = typeMeta(v.type);
          return (
            <motion.li key={v.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <button type="button" onClick={() => setOpen(v)} className="group relative flex w-full items-center gap-3 overflow-hidden rounded-[1.4rem] p-4 text-start text-white shadow-[0_16px_36px_-24px_rgb(31_42_36/0.6)]" style={{ background: `linear-gradient(135deg, ${m.pal.a}, ${m.pal.b})` }}>
                <span aria-hidden className="absolute -end-8 -top-8 size-24 rotate-45 rounded-3xl bg-white/10 transition-transform group-hover:scale-110" />
                <span className="relative grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15"><Icon name="award" className="size-6" /></span>
                <span className="relative min-w-0 flex-1">
                  <span className="block font-bold">{m.label}{v.subject ? ` — ${v.subject}` : ''}</span>
                  <span className="block truncate text-sm text-white/80">{v.term ?? (v.year ? `العام ${v.year}هـ` : '')} · {certDates(v.issued_at).split(' — ').pop()}</span>
                </span>
                <Icon name="chevron" className="relative size-4 rotate-180 opacity-70" />
              </button>
            </motion.li>
          );
        })}
      </ul>
      <Sheet open={!!open} onClose={() => setOpen(null)} wide title="شهادة شكر وتقدير" subtitle={open ? typeMeta(open.type).label : undefined}>
        {open && <AppreciationViewer key={open.id} v={open} brand={brand} />}
      </Sheet>
    </section>
  );
}
