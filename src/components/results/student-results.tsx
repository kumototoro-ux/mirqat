'use client';

import { motion } from 'motion/react';
import { Icon } from '@/components/shell/icons';
import type { NoticeSettings, StudentCard } from '@/lib/results/shared';
import { NoticeViewer } from './notice';
import { ReportSummary, SubjectBreakdown } from './report-view';

const fmt = (iso: string) =>
  new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Riyadh' }).format(new Date(iso));

export function StudentResults({ card, brand, settings }: { card: StudentCard | null; brand: { name: string; logo: string | null }; settings: NoticeSettings }) {
  if (!card) return <Locked title="لا فصول دراسية بعد" body="تظهر نتائجك هنا عندما يبدأ الفصل الدراسي وترصد مدرستك الدرجات." />;
  if (card.status === 'hidden') {
    const a = card.access;
    if (a.reason === 'not_yet' && a.opens_at) return <Locked title="النتائج لم تُتح بعد" body={<>تُتاح نتائج هذا الفصل الدراسي <b className="text-ink">{fmt(a.opens_at)}</b>.</>} icon="clock" />;
    if (a.reason === 'ended') return <Locked title="انتهت فترة عرض النتائج" body="أغلقت الإدارة عرض نتائج هذا الفصل الدراسي. راجع المدرسة إن احتجت نسخة من الإشعار." icon="key" />;
    return <Locked title="النتائج محجوبة حاليًا" body="لم تعتمد الإدارة عرض نتائج هذا الفصل الدراسي بعد. ستظهر هنا فور إتاحتها." icon="key" />;
  }
  const s = card.student;
  if (!s) return <Locked title="لا نتائج" body="لم يُعثر على سجلك الدراسي." />;
  const name = `إشعار-درجات-${s.name_ar.replace(/\s+/g, '-')}-${(card.term?.name ?? '').replace(/\s+/g, '-')}`;

  return (
    <div className="space-y-6">
      {card.access.closes_at && (
        <p className="flex items-center gap-2 rounded-2xl border border-gold/50 bg-brass-soft/60 px-4 py-2.5 text-sm text-brass">
          <Icon name="clock" className="size-4 shrink-0" /> العرض متاح حتى {fmt(card.access.closes_at)} — نزّل إشعارك قبلها.
        </p>
      )}
      <ReportSummary s={s} />
      <section>
        <h2 className="mb-3 text-lg font-bold">المواد <span className="text-sm font-normal text-muted">· Subjects</span></h2>
        <SubjectBreakdown s={s} subjects={card.subjects} />
      </section>
      <section>
        <div className="mb-3">
          <h2 className="text-lg font-bold">إشعار الدرجات <span className="text-sm font-normal text-muted">· Grade Notice</span></h2>
          <p className="text-sm text-muted">إشعار بدرجات الفصل الدراسي — ليس شهادة نهائية.</p>
        </div>
        <NoticeViewer data={{ term: card.term, subjects: card.subjects, student: s, school: brand, settings }} fileName={name} />
      </section>
    </div>
  );
}

function Locked({ title, body, icon = 'results' }: { title: string; body: React.ReactNode; icon?: 'results' | 'clock' | 'key' }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative grid place-items-center overflow-hidden rounded-[1.75rem] border border-line bg-surface px-6 py-16 text-center">
      <div aria-hidden className="absolute -top-24 size-72 rounded-full bg-gold/10 blur-3xl" />
      <span className="relative grid size-16 place-items-center rounded-2xl bg-board text-gold shadow-[0_14px_30px_-16px_rgb(53_104_84/0.9)]">
        <Icon name={icon} className="size-8" />
      </span>
      <p className="relative mt-4 text-lg font-bold">{title}</p>
      <p className="relative mt-1 max-w-md text-sm leading-relaxed text-muted">{body}</p>
    </motion.div>
  );
}
