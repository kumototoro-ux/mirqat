'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Registry, RowButton, type RegistryHandle } from '@/components/registry/registry';
import type { PageParams, PageResult } from '@/components/registry/types';
import { Badge } from '@/components/ui';
import { Icon, type IconName } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { Sheet, ChipSelect } from '@/components/sheet';
import { subjectColor } from '@/components/timetable-grid';
import { deleteAssessment, duplicateAssessment, listAssessments, type HubRow, type HubStats } from '@/lib/assess/actions';
import { STATUS_META, relTime } from '@/lib/assess/shared';
import type { AuthorContext } from '@/lib/assess/queries';

type Tab = '' | 'task' | 'form';

export function AssessHub({
  initial,
  initialParams,
  stats,
  ctx,
  classNames,
  subjectNames,
}: {
  initial: PageResult<HubRow>;
  initialParams: PageParams;
  stats: HubStats;
  ctx: AuthorContext;
  classNames: Record<number, string>;
  subjectNames: Record<number, string>;
}) {
  const router = useRouter();
  const registry = useRef<RegistryHandle>(null);
  const { toast, confirm } = useFeedback();
  const [tab, setTab] = useState<Tab>((initialParams.filters.kind as Tab) ?? '');
  const [copying, setCopying] = useState<HubRow | null>(null);

  const switchTab = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    if (t) url.searchParams.set('kind', t);
    else url.searchParams.delete('kind');
    history.replaceState(null, '', url.pathname + url.search);
  };

  const remove = async (r: HubRow) => {
    const ok = await confirm({
      title: r.kind === 'form' ? 'حذف النموذج نهائيًا؟' : 'حذف المهمة نهائيًا؟',
      body: (
        <>
          <b className="text-ink">{r.title}</b> — {classNames[r.class_id]}
          <br />
          تُحذف المرفقات والتسليمات أيضًا. لا يمكن الحذف إن كان لها درجات مرصودة.
        </>
      ),
      confirmLabel: 'حذف',
      danger: true,
      run: () => deleteAssessment(r.id),
    });
    if (!ok) return;
    registry.current?.invalidate();
    router.refresh();
  };

  const cards: { label: string; value: number; icon: IconName; tone?: string; hint: string; filter?: Record<string, string> }[] = [
    { label: 'مفتوحة الآن', value: stats.open, icon: 'play', hint: 'يستطيع الطلاب الحل والتسليم', filter: { status: 'open' } },
    { label: 'بانتظار التصحيح', value: stats.to_grade, icon: 'edit', tone: stats.to_grade ? 'gold' : '', hint: 'تسليمات وإجابات مقالية', filter: { status: 'needs_grading' } },
    { label: 'تُغلق خلال 24 ساعة', value: stats.closing_soon, icon: 'clock', tone: stats.closing_soon ? 'danger' : '', hint: 'ذكّر من لم يسلّم', filter: { status: 'open' } },
    { label: 'مسودات', value: stats.drafts, icon: 'audit', hint: 'لم تُنشر بعد', filter: { status: 'draft' } },
  ];

  return (
    <>
      {/* الإنشاء: بابان واضحان */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <CreateCard
          href="/staff/tasks/new?kind=task"
          icon="tasks"
          title="إنشاء مهمة"
          lead="واجب، بحث، مشروع… مع مرفقات وتسليم نصي أو بالملفات"
          tone="board"
          delay={0}
        />
        <CreateCard
          href="/staff/tasks/new?kind=form"
          icon="forms"
          title="إنشاء نموذج"
          lead="اختبار إلكتروني بستة أنواع أسئلة ورياضيات وتصحيح آلي"
          tone="gold"
          delay={0.06}
        />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-[1.25rem] border border-line bg-surface p-4"
          >
            <p className="flex items-center gap-2 text-xs font-medium text-muted sm:text-sm">
              <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${c.tone === 'gold' ? 'bg-brass-soft text-brass' : c.tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-board/10 text-board'}`}>
                <Icon name={c.icon} className="size-[1.05rem]" />
              </span>
              <span className="truncate">{c.label}</span>
            </p>
            <p className={`mt-3 text-[1.9rem] font-bold leading-none tabular-nums ${c.tone === 'gold' ? 'text-brass' : c.tone === 'danger' ? 'text-danger' : ''}`}>{c.value}</p>
            <p className="mt-1.5 truncate text-xs text-muted">{c.hint}</p>
          </motion.div>
        ))}
      </div>

      {/* الكل / المهام / النماذج */}
      <div className="mb-3 inline-flex rounded-2xl border border-line bg-surface p-1" role="tablist">
        {([['', 'الكل', stats.tasks + stats.forms], ['task', 'المهام', stats.tasks], ['form', 'النماذج', stats.forms]] as const).map(([k, label, n]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => switchTab(k)}
            className={`relative flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${tab === k ? 'text-chalk' : 'text-muted hover:text-ink'}`}
          >
            {tab === k && <motion.span layoutId="hub-tab" className="absolute inset-0 rounded-xl bg-board" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className="relative">{label}</span>
            <span className={`relative rounded-full px-1.5 text-[0.7rem] tabular-nums ${tab === k ? 'bg-chalk/20' : 'bg-paper'}`}>{n}</span>
          </button>
        ))}
      </div>

      <Registry<HubRow>
        ref={registry}
        key={tab}
        queryKey="assessments"
        title={tab === 'form' ? 'النماذج' : tab === 'task' ? 'المهام' : 'المهام والنماذج'}
        fetchPage={listAssessments}
        initial={(initialParams.filters.kind ?? '') === tab ? initial : undefined}
        initialParams={{ ...initialParams, filters: { ...initialParams.filters, kind: tab } }}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/staff/tasks/${r.id}`)}
        searchPlaceholder="ابحث بالعنوان"
        emptyTitle={tab === 'form' ? 'لا نماذج بعد' : tab === 'task' ? 'لا مهام بعد' : 'لا مهام ولا نماذج بعد'}
        icon="tasks"
        sorts={[
          { value: 'newest', label: 'الأحدث' },
          { value: 'due', label: 'الأقرب موعدًا' },
          { value: 'title', label: 'العنوان' },
        ]}
        filters={[
          { key: 'status', label: 'الحالة', options: [...Object.entries(STATUS_META).map(([v, s]) => ({ value: v, label: s.label })), { value: 'needs_grading', label: 'بانتظار التصحيح' }] },
          { key: 'class', label: 'الفصل', options: ctx.classes.map((c) => ({ value: String(c.value), label: c.label })) },
          { key: 'subject', label: 'المادة', options: ctx.subjects.map((s) => ({ value: String(s.value), label: s.label })) },
          ...(ctx.isAdmin ? [{ key: 'mine', label: 'المنشئ', options: [{ value: '1', label: 'ما أنشأته أنا' }] }] : []),
        ]}
        columns={[
          {
            key: 'title',
            label: 'العنوان',
            sort: 'title',
            render: (r) => <TitleCell r={r} subject={subjectNames[r.subject_id] ?? ''} />,
          },
          { key: 'class', label: 'الفصل', render: (r) => <span className="text-sm">{classNames[r.class_id] ?? '—'}</span> },
          { key: 'status', label: 'الحالة', sort: 'due', render: (r) => <StatusCell r={r} /> },
          { key: 'progress', label: 'التسليم', render: (r) => <Progress r={r} /> },
          {
            key: 'grading',
            label: 'التصحيح',
            render: (r) =>
              r.to_grade > 0 ? (
                <Badge tone="gold">{r.to_grade} بانتظارك</Badge>
              ) : r.submitted > 0 ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-ok"><Icon name="check" className="size-4" /> مكتمل</span>
              ) : (
                <span className="text-muted">—</span>
              ),
          },
        ]}
        rowActions={(r) => (
          <>
            <RowButton icon="copy" label="نسخ" onClick={() => setCopying(r)} />
            <RowButton icon="trash" label="حذف" tone="danger" onClick={() => remove(r)} />
          </>
        )}
        mobileCard={(r) => (
          <div>
            <TitleCell r={r} subject={subjectNames[r.subject_id] ?? ''} />
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 ps-12 text-xs text-muted">
              <span>{classNames[r.class_id]}</span>
              <StatusCell r={r} inline />
              {r.to_grade > 0 && <Badge tone="gold">{r.to_grade} بانتظارك</Badge>}
            </div>
            <div className="mt-2 ps-12">
              <Progress r={r} />
            </div>
          </div>
        )}
      />

      <CopySheet row={copying} ctx={ctx} onClose={() => setCopying(null)} onDone={(ids) => {
        setCopying(null);
        registry.current?.invalidate();
        if (ids.length === 1) router.push(`/staff/tasks/${ids[0]}`);
        else router.refresh();
      }} />
    </>
  );
}

function CreateCard({ href, icon, title, lead, tone, delay }: { href: string; icon: IconName; title: string; lead: string; tone: 'board' | 'gold'; delay: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
      <Link
        href={href}
        className={`group relative flex items-center gap-4 overflow-hidden rounded-[1.4rem] border p-4 transition-all duration-300 hover:-translate-y-0.5 sm:p-5 ${
          tone === 'board'
            ? 'border-board/20 bg-gradient-to-br from-board to-board-deep text-chalk shadow-[0_18px_40px_-24px_rgb(53_104_84/0.9)]'
            : 'border-gold/40 bg-gradient-to-br from-[#fbf3e1] to-[#f4e3bb] text-ink shadow-[0_18px_40px_-26px_rgb(138_97_22/0.8)]'
        }`}
      >
        <span className={`grid size-14 shrink-0 place-items-center rounded-2xl transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3 ${tone === 'board' ? 'bg-chalk/15' : 'bg-white/70 text-brass'}`}>
          <Icon name={icon} className="size-7" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-lg font-bold">
            <Icon name="plus" className="size-4" />
            {title}
          </span>
          <span className={`mt-0.5 block text-sm leading-snug ${tone === 'board' ? 'text-chalk/75' : 'text-ink/65'}`}>{lead}</span>
        </span>
        <Icon name="chevron" className={`size-5 shrink-0 transition-transform duration-300 group-hover:-translate-x-1 ${tone === 'board' ? 'text-chalk/70' : 'text-brass'}`} />
      </Link>
    </motion.div>
  );
}

function TitleCell({ r, subject }: { r: HubRow; subject: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`relative grid size-10 shrink-0 place-items-center rounded-xl ${r.kind === 'form' ? 'bg-brass-soft text-brass' : 'bg-board/10 text-board'}`}
        title={r.kind === 'form' ? 'نموذج' : 'مهمة'}
      >
        <Icon name={r.kind === 'form' ? 'forms' : 'tasks'} className="size-5" />
        <span className="absolute -bottom-0.5 -end-0.5 size-3 rounded-full border-2 border-surface" style={{ background: subjectColor(subject) }} />
      </span>
      <div className="min-w-0">
        <p className="max-w-72 truncate font-semibold">{r.title}</p>
        <p className="truncate text-xs text-muted">
          {r.kind === 'form' ? 'نموذج' : 'مهمة'} · {subject}
          {r.kind === 'form' ? ` · ${r.questions} سؤال` : r.max_score ? ` · من ${Number(r.max_score)}` : ''}
          {r.time_limit_minutes ? ` · ${r.time_limit_minutes} د` : ''}
        </p>
      </div>
    </div>
  );
}

function StatusCell({ r, inline }: { r: HubRow; inline?: boolean }) {
  const m = STATUS_META[r.status];
  const when =
    r.status === 'scheduled'
      ? `يُفتح ${relTime(r.kind === 'form' ? r.opens_at : r.published_at)}`
      : r.status === 'open'
        ? (r.kind === 'form' ? r.closes_at : r.due_at)
          ? `يُغلق ${relTime(r.kind === 'form' ? r.closes_at : r.due_at)}`
          : 'بلا موعد'
        : r.status === 'closed'
          ? `أُغلق ${relTime(r.kind === 'form' ? r.closes_at : r.due_at)}`
          : '';
  if (inline)
    return (
      <span className="inline-flex items-center gap-1.5">
        <Badge tone={m.tone}>{m.label}</Badge>
        {when}
      </span>
    );
  return (
    <div>
      <Badge tone={m.tone}>{m.label}</Badge>
      {when && <p className="mt-1 whitespace-nowrap text-xs text-muted">{when}</p>}
    </div>
  );
}

function Progress({ r }: { r: HubRow }) {
  if (r.kind === 'task' && r.submission_mode === 'none')
    return <span className="text-xs text-muted">رُصد {r.graded} من {r.class_size}</span>;
  const pct = r.class_size ? Math.min(100, Math.round((r.submitted / r.class_size) * 100)) : 0;
  return (
    <div className="w-36 max-w-full">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold tabular-nums">{r.submitted}/{r.class_size}</span>
        <span className="tabular-nums text-muted">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper">
        <div className="h-full origin-right animate-grow rounded-full bg-board" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** نسخ بضغطة: نفس الفصل، أو فصول أخرى بنفس المادة */
export function CopySheet({ row, ctx, onClose, onDone }: { row: { id: number; title: string; class_id: number; subject_id: number; kind: string } | null; ctx: AuthorContext; onClose: () => void; onDone: (ids: number[]) => void }) {
  const { toast } = useFeedback();
  const [classes, setClasses] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const options = row ? ctx.classes.filter((c) => (ctx.subjectsByClass[c.value] ?? []).includes(row.subject_id) || c.value === row.class_id) : [];
  const run = async () => {
    if (!row) return;
    setBusy(true);
    const res = await duplicateAssessment(row.id, classes.length ? classes : [row.class_id]);
    setBusy(false);
    if (!res.ok) return toast(res.error, 'error');
    toast(res.message);
    setClasses([]);
    onDone(res.data?.ids ?? []);
  };
  return (
    <Sheet
      open={row !== null}
      onClose={onClose}
      title={row?.kind === 'form' ? 'نسخ النموذج' : 'نسخ المهمة'}
      subtitle={row?.title}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={run} disabled={busy} className="btn-primary flex-1 py-3">
            {busy ? <span className="spinner" /> : <Icon name="copy" className="size-4" />}
            {classes.length > 1 ? `نسخ إلى ${classes.length} فصول` : 'نسخ الآن'}
          </button>
          <button type="button" onClick={onClose} className="btn-quiet py-3">إلغاء</button>
        </div>
      }
    >
      <p className="mb-4 rounded-xl bg-board/[0.06] px-4 py-3 text-sm leading-relaxed text-board">
        تُنسخ الأسئلة والمرفقات والإعدادات كما هي، وتُحفظ النسخة <b>مسودة</b> بلا مواعيد حتى تراجعها وتنشرها. التسليمات والدرجات لا تُنسخ.
      </p>
      <p className="label">إلى أي فصل؟</p>
      <ChipSelect options={options.map((c) => ({ value: c.value, label: c.label }))} value={classes} onChange={setClasses} />
      <p className="mt-2 text-xs text-muted">بلا اختيار = نسخة في نفس الفصل. الفصول المعروضة التي تدرّس فيها نفس المادة.</p>
    </Sheet>
  );
}
