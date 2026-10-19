'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Icon } from '@/components/shell/icons';
import { Badge } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { Sheet } from '@/components/sheet';
import { deleteAssessment, reopenForm, setFormStatus } from '@/lib/assess/actions';
import type { AuthorContext } from '@/lib/assess/queries';
import { STATUS_META, relTime, type ItemStatus } from '@/lib/assess/shared';
import { CopySheet } from './hub';
import { DateTime, fmtFull } from './kit';
import { RichText } from './math';

export type HeaderInfo = {
  id: number;
  kind: 'task' | 'form';
  title: string;
  description: string | null;
  class_id: number;
  class_label: string;
  subject_id: number;
  subject: string;
  eval_type: string | null;
  teacher: string | null;
  status: ItemStatus;
  formStatus?: 'draft' | 'published' | 'closed';
  opens: string | null;
  closes: string | null;
  meta: string[];
  canEdit: boolean;
  hasAttempts: boolean;
};

export function DetailHeader({ info, tabs, active, ctx }: { info: HeaderInfo; tabs: { key: string; label: string; badge?: number }[]; active: string; ctx: AuthorContext }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [copy, setCopy] = useState(false);
  const [reopen, setReopen] = useState(false);
  const [newClose, setNewClose] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const m = STATUS_META[info.status];

  const status = async (s: 'draft' | 'published' | 'closed') => {
    const ok = await confirm({
      title: s === 'published' ? 'نشر النموذج الآن؟' : s === 'closed' ? 'إغلاق النموذج الآن؟' : 'إعادته مسودة؟',
      body:
        s === 'closed'
          ? 'يتوقف الحل فورًا، وتُسلَّم إجابات من يحل الآن تلقائيًا بما حفظه، ومن لم يحل يُرصد له صفر.'
          : s === 'published'
            ? info.closes
              ? `يُغلق ${fmtFull(info.closes)} (${relTime(info.closes)}).`
              : 'حدّد وقت الإغلاق أولًا من تبويب الأسئلة.'
            : 'يختفي عن الطلاب حتى تنشره من جديد.',
      confirmLabel: s === 'published' ? 'نشر' : s === 'closed' ? 'إغلاق' : 'مسودة',
      danger: s === 'closed',
    });
    if (!ok) return;
    const res = await setFormStatus(info.id, s);
    if (!res.ok) return toast(res.error, 'error');
    toast(res.message);
    router.refresh();
  };

  const remove = async () => {
    const ok = await confirm({ title: 'حذف نهائي؟', body: <><b className="text-ink">{info.title}</b><br />تُحذف المرفقات والتسليمات. لا يمكن حذف ما له درجات مرصودة.</>, confirmLabel: 'حذف', danger: true });
    if (!ok) return;
    const res = await deleteAssessment(info.id);
    if (!res.ok) return toast(res.error, 'error');
    toast(res.message);
    router.push('/staff/tasks');
    router.refresh();
  };

  const doReopen = async () => {
    if (!newClose) return toast('حدّد وقت الإغلاق الجديد', 'error');
    setBusy(true);
    const res = await reopenForm(info.id, newClose);
    setBusy(false);
    if (!res.ok) return toast(res.error, 'error');
    toast(res.message);
    setReopen(false);
    router.refresh();
  };

  return (
    <div className="mb-5">
      <Link href="/staff/tasks" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-board">
        <Icon name="chevron" className="size-4 rotate-180" /> المهام والنماذج
      </Link>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-[1.6rem] border border-line bg-surface p-4 sm:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <span className={`grid size-14 shrink-0 place-items-center rounded-2xl ${info.kind === 'form' ? 'bg-brass-soft text-brass' : 'bg-board/10 text-board'}`}>
            <Icon name={info.kind === 'form' ? 'forms' : 'tasks'} className="size-7" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={m.tone}>{m.label}</Badge>
              <span className="text-xs text-muted">{info.kind === 'form' ? 'نموذج إلكتروني' : 'مهمة'} · {info.subject}{info.eval_type ? ` · ${info.eval_type}` : ''}</span>
            </div>
            <h1 className="mt-1.5 text-[1.45rem] font-bold leading-snug sm:text-[1.65rem]">{info.title}</h1>
            <p className="mt-1 text-sm text-muted">
              {info.class_label}
              {info.teacher ? ` · ${info.teacher}` : ''}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {info.opens && <Chip icon="play">يُفتح {fmtFull(info.opens)}</Chip>}
              {info.closes && <Chip icon="clock" tone={info.status === 'open' ? 'warn' : undefined}>{info.kind === 'form' ? 'يُغلق' : 'التسليم حتى'} {fmtFull(info.closes)} · {relTime(info.closes)}</Chip>}
              {info.meta.map((x) => <Chip key={x}>{x}</Chip>)}
            </div>
          </div>
          {info.canEdit && (
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              {info.kind === 'form' && info.formStatus === 'draft' && (
                <button type="button" onClick={() => status('published')} className="btn-primary"><Icon name="send" className="size-4" /> نشر</button>
              )}
              {info.kind === 'form' && info.status === 'open' && (
                <button type="button" onClick={() => status('closed')} className="btn-danger">إغلاق الآن</button>
              )}
              {info.kind === 'form' && info.status === 'closed' && (
                <button type="button" onClick={() => setReopen(true)} className="btn-quiet"><Icon name="undo" className="size-4" /> إعادة فتح</button>
              )}
              {info.kind === 'form' && info.formStatus !== 'draft' && !info.hasAttempts && (
                <button type="button" onClick={() => status('draft')} className="btn-quiet">مسودة</button>
              )}
              {info.status !== 'draft' && (
                <Link href={`/staff/grading/${info.id}`} className="btn-primary"><Icon name="edit" className="size-4" /> مكتب التصحيح</Link>
              )}
              <button type="button" onClick={() => setCopy(true)} className="btn-quiet"><Icon name="copy" className="size-4" /> نسخ</button>
              <button type="button" onClick={remove} className="btn-quiet px-3 text-danger hover:border-danger/40" aria-label="حذف"><Icon name="trash" className="size-4" /></button>
            </div>
          )}
        </div>
        {info.description && info.kind === 'task' && active !== 'edit' && (
          <div className="mt-4 rounded-2xl bg-paper/60 px-4 py-3 text-sm leading-relaxed">
            <RichText text={info.description.length > 400 ? info.description.slice(0, 400) + '…' : info.description} />
          </div>
        )}

        <nav className="-mx-1 mt-5 flex gap-1 overflow-x-auto border-t border-line px-1 pt-3" aria-label="الأقسام">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/staff/tasks/${info.id}?tab=${t.key}`}
              replace
              scroll={false}
              className={`relative flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${active === t.key ? 'text-chalk' : 'text-muted hover:bg-paper hover:text-ink'}`}
            >
              {active === t.key && <motion.span layoutId="detail-tab" className="absolute inset-0 rounded-xl bg-board" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
              <span className="relative">{t.label}</span>
              {t.badge ? <span className={`relative rounded-full px-1.5 text-[0.7rem] tabular-nums ${active === t.key ? 'bg-chalk/20' : 'bg-gold/25 text-brass'}`}>{t.badge}</span> : null}
            </Link>
          ))}
        </nav>
      </motion.div>

      <CopySheet row={copy ? { id: info.id, title: info.title, class_id: info.class_id, subject_id: info.subject_id, kind: info.kind } : null} ctx={ctx} onClose={() => setCopy(false)} onDone={(ids) => { setCopy(false); router.push(ids.length === 1 ? `/staff/tasks/${ids[0]}` : '/staff/tasks'); }} />

      <Sheet
        open={reopen}
        onClose={() => setReopen(false)}
        title="إعادة فتح النموذج"
        subtitle={info.title}
        footer={
          <button type="button" onClick={doReopen} disabled={busy} className="btn-primary w-full py-3">
            {busy ? <span className="spinner" /> : <Icon name="undo" className="size-4" />} إعادة الفتح
          </button>
        }
      >
        <p className="mb-4 rounded-xl bg-board/[0.06] px-4 py-3 text-sm leading-relaxed text-board">
          تُحذف الأصفار التلقائية لمن لم يحل ليستطيع الحل حتى الموعد الجديد. درجات من سلّم تبقى كما هي.
        </p>
        <p className="label">يُغلق من جديد</p>
        <DateTime value={newClose} onChange={setNewClose} quick="due" />
      </Sheet>
    </div>
  );
}

function Chip({ children, icon, tone }: { children: React.ReactNode; icon?: Parameters<typeof Icon>[0]['name']; tone?: 'warn' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${tone === 'warn' ? 'bg-brass-soft text-brass' : 'bg-paper text-ink/80'}`}>
      {icon && <Icon name={icon} className="size-3.5" />}
      {children}
    </span>
  );
}
