'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '@/components/shell/icons';
import { certRating, fmt, type CertSettings, type YearCert } from '@/lib/results/certificate';
import { CertificateViewer, type CertBrand } from './certificate';

/** بطاقة شهادة نهاية العام في صفحة نتائج الطالب — تنفتح لعرض الشهادة وتنزيلها */
export function StudentCertificate({ cert, settings, brand }: { cert: YearCert; settings: CertSettings; brand: CertBrand }) {
  const [open, setOpen] = useState(false);
  const r = certRating(cert.average);
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 overflow-hidden rounded-[1.75rem] border border-gold/50 bg-surface">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="relative flex w-full items-center gap-4 overflow-hidden bg-board p-5 text-start text-chalk">
        <div aria-hidden className="absolute -start-16 -top-20 size-64 rounded-full bg-gold/20 blur-3xl" />
        <span className="relative grid size-14 shrink-0 place-items-center rounded-2xl bg-gold text-board shadow-[0_10px_24px_-12px_rgb(217_164_65/0.9)]">
          <Icon name="award" className="size-7" />
        </span>
        <span className="relative min-w-0 flex-1">
          <span className="block text-lg font-bold">شهادة نهاية العام جاهزة</span>
          <span className="block text-sm text-chalk/75">
            المعدل <b className="tabular-nums text-gold" dir="ltr">{cert.average == null ? '—' : `${fmt(cert.average)}%`}</b>
            {r ? ` · ${r.ar}` : ''} — اعرضها ونزّلها PDF
          </span>
        </span>
        <Icon name="chevron" className={`relative size-5 shrink-0 transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <div className="p-4 sm:p-5">
              <CertificateViewer cert={cert} settings={settings} brand={brand} fileName={`شهادة-${cert.student.name_ar.replace(/\s+/g, '-')}`} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
