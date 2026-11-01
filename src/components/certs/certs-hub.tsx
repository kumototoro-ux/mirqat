'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/shell/icons';
import { Badge } from '@/components/ui';
import { Sheet } from '@/components/sheet';
import { useFeedback } from '@/components/feedback';
import { searchStudents, type StudentHit } from '@/lib/assess/grading-actions';
import type { AuthorContext, Opt } from '@/lib/assess/queries';
import { branchTop, issueCert, listCerts, previewCert, revokeCert, subjectTop, type IssueInput, type TopRow } from '@/lib/certs/actions';
import { APPRECIATION_TYPES, ad, certDates, typeMeta, type AppreciationBrand, type AppreciationType, type AppreciationView } from '@/lib/certs/appreciation';
import { AppreciationViewer, exportCertsPdf } from './appreciation-sheet';

const chip = (on: boolean, dark = false) =>
  `rounded-full px-3.5 py-1.5 text-sm transition-colors ${on ? `${dark ? 'bg-ink' : 'bg-board'} font-semibold text-chalk` : 'bg-paper hover:bg-board/10'}`;

export function CertsHub({ ctx, brand, branches }: { ctx: AuthorContext; brand: AppreciationBrand; branches: Opt[] }) {
  const [tab, setTab] = useState<'issue' | 'issued'>('issue');
  const [view, setView] = useState<{ v: AppreciationView; input: IssueInput | null } | null>(null);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['certs'] });

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 rounded-2xl border border-line bg-surface p-1 sm:w-fit">
        {([['issue', 'إصدار شهادة', 'award'], ['issued', 'الشهادات الصادرة', 'check']] as const).map(([k, l, ic]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`relative flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors sm:flex-none ${tab === k ? 'text-chalk' : 'text-muted hover:text-ink'}`}>
            {tab === k && <motion.span layoutId="certs-tab" className="absolute inset-0 rounded-xl bg-board" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <Icon name={ic} className="relative size-4" /><span className="relative">{l}</span>
          </button>
        ))}
      </nav>

      {tab === 'issue' ? (
        <IssuePanel ctx={ctx} branches={branches} onOpen={(v, input) => setView({ v, input })} />
      ) : (
        <IssuedPanel ctx={ctx} brand={brand} branches={branches} onOpen={(v) => setView({ v, input: null })} />
      )}

      <CertSheet
        state={view}
        brand={brand}
        onClose={() => setView(null)}
        onIssued={(v) => { setView((s) => (s ? { ...s, v } : s)); refresh(); }}
        onRevoked={() => { setView(null); refresh(); }}
      />
    </div>
  );
}

/* --------------------------------------------------------------------- */
function IssuePanel({ ctx, branches, onOpen }: { ctx: AuthorContext; branches: Opt[]; onOpen: (v: AppreciationView, input: IssueInput) => void }) {
  const { toast } = useFeedback();
  const types = APPRECIATION_TYPES.filter((t) => ctx.isAdmin || !t.adminOnly);
  const [type, setType] = useState<AppreciationType>(ctx.isAdmin ? 'top' : 'subject');
  const [term, setTerm] = useState<number | null>(ctx.currentTerm ?? null);
  const [branch, setBranch] = useState<number | null>(branches[0]?.value ?? null);
  const [subject, setSubject] = useState<number | null>(ctx.subjects[0]?.value ?? null);
  const [classId, setClassId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [student, setStudent] = useState<StudentHit | null>(null);
  const [opening, setOpening] = useState<number | null>(null);
  const meta = typeMeta(type);
  const ranked = type === 'top' || type === 'attendance';
  const needsSubject = type === 'subject' || (type === 'custom' && !ctx.isAdmin);
  const classOpts = useMemo(() => ctx.classes.filter((c) => !subject || (ctx.subjectsByClass[c.value] ?? []).includes(subject)), [ctx, subject]);

  const top = useQuery({
    queryKey: ['certs', 'top', type, branch, term, subject, classId],
    queryFn: () => (ranked ? branchTop(type as 'top' | 'attendance', branch!, term) : subjectTop(subject!, term, classId)),
    enabled: (ranked && !!branch) || (type === 'subject' && !!subject),
    placeholderData: keepPreviousData,
  });

  const open = async (studentId: number) => {
    if (type === 'custom' && reason.trim().length < 3) return toast('اكتب سبب التقدير أولًا', 'error');
    if (needsSubject && !subject) return toast('اختر المادة', 'error');
    const input: IssueInput = { type, student_id: studentId, term_id: term, subject_id: type === 'subject' || type === 'custom' ? subject : null, reason: type === 'custom' ? reason.trim() : null };
    setOpening(studentId);
    const res = await previewCert(input);
    setOpening(null);
    if (!res.ok) return toast(res.error, 'error');
    onOpen(res.data, input);
  };

  const rows = top.data?.ok ? top.data.data : [];
  return (
    <section className="space-y-5 rounded-[1.4rem] border border-line bg-surface p-4 sm:p-5">
      {/* 1) النوع */}
      <div>
        <p className="label">نوع الشهادة</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {types.map((t) => (
            <button key={t.value} type="button" onClick={() => { setType(t.value); setStudent(null); }}
              className={`relative overflow-hidden rounded-2xl border p-3 text-start transition-colors ${type === t.value ? 'border-transparent text-white' : 'border-line hover:border-board/40'}`}
              style={type === t.value ? { background: `linear-gradient(135deg, ${t.pal.a}, ${t.pal.b})` } : undefined}>
              <span className="flex items-center gap-2 font-bold"><span className="size-2.5 rotate-45 rounded-[2px]" style={{ background: type === t.value ? '#fff' : t.pal.b }} />{t.label}</span>
              <span className={`mt-1 block text-xs leading-relaxed ${type === t.value ? 'text-white/80' : 'text-muted'}`}>{t.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 2) المدة */}
      <div>
        <p className="label">المدة المحسوبة</p>
        <div className="flex flex-wrap gap-1.5">
          {ctx.terms.map((t) => <button key={t.value} type="button" onClick={() => setTerm(t.value)} className={chip(term === t.value, true)}>{t.label}</button>)}
          <button type="button" onClick={() => setTerm(null)} className={chip(term === null, true)}>العام الدراسي كاملًا</button>
        </div>
      </div>

      {/* 3) الفرع / المادة / السبب */}
      {ranked && branches.length > 1 && (
        <div>
          <p className="label">الفرع</p>
          <div className="flex flex-wrap gap-1.5">{branches.map((b) => <button key={b.value} type="button" onClick={() => setBranch(b.value)} className={chip(branch === b.value)}>{b.label}</button>)}</div>
        </div>
      )}
      {(type === 'subject' || type === 'custom') && (
        <div>
          <p className="label">المادة {needsSubject && <span className="text-danger">*</span>}</p>
          <div className="flex flex-wrap gap-1.5">
            {type === 'custom' && ctx.isAdmin && <button type="button" onClick={() => setSubject(null)} className={chip(subject === null)}>بلا مادة</button>}
            {ctx.subjects.map((s) => <button key={s.value} type="button" onClick={() => { setSubject(s.value); setClassId(null); }} className={chip(subject === s.value)}>{s.label}</button>)}
          </div>
        </div>
      )}
      {type === 'subject' && classOpts.length > 1 && (
        <select value={classId ?? ''} onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : null)} className="field sm:w-auto" aria-label="الفصل">
          <option value="">{ctx.isAdmin ? 'كل الفصول' : 'كل فصولي'}</option>
          {classOpts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      )}
      {type === 'custom' && (
        <div>
          <p className="label">سبب التقدير <span className="text-danger">*</span></p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 300))} rows={2} className="field" placeholder="مثال: فوزه بالمركز الأول في مسابقة القرآن الكريم على مستوى المدرسة" />
          <p className="mt-1 text-xs text-muted">يُكتب في الشهادة بعد «نظير» كما هو — {ad(reason.length)}/٣٠٠</p>
        </div>
      )}

      {/* 4) المستحقون */}
      {(ranked || type === 'subject') && (
        <div>
          <p className="label">{ranked ? `الخمسة الأوائل${type === 'attendance' ? ' في الحضور' : ''} على الفرع` : 'أفضل ثلاثة في المادة'}</p>
          {top.isLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-paper" />)}</div>
          ) : top.data && !top.data.ok ? (
            <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{top.data.error}</p>
          ) : !rows.length ? (
            <p className="rounded-xl bg-paper px-4 py-3 text-sm text-muted">{ranked ? 'لا يوجد طلاب مستوفون بعد (3 درجات مرصودة أو 5 حصص حضور على الأقل).' : 'لا درجات مرصودة في هذه المادة للمدة المختارة.'}</p>
          ) : (
            <ol className={`grid gap-2 transition-opacity ${top.isFetching ? 'opacity-60' : ''}`}>
              {rows.map((r) => <RankRow key={r.student_id} r={r} type={type} busy={opening === r.student_id} onOpen={() => open(r.student_id)} />)}
            </ol>
          )}
        </div>
      )}

      {!ranked && (
        <StudentSearch
          label={type === 'subject' ? 'أو أي طالب آخر' : 'الطالب'}
          picked={student}
          onPick={(h) => { setStudent(h); if (h && type !== 'custom') void open(h.id); }}
        />
      )}
      {type === 'custom' && student && (
        <button type="button" onClick={() => open(student.id)} disabled={opening === student.id} className="btn-primary w-full py-3">
          {opening === student.id ? <span className="spinner" /> : <Icon name="eye" className="size-4" />} معاينة شهادة {student.name_ar}
        </button>
      )}
      {!ranked && type !== 'custom' && student && opening === student.id && <p className="flex items-center gap-2 text-sm text-muted"><span className="spinner" /> يتحقق من الاستحقاق…</p>}
      <p className="text-xs leading-relaxed text-muted">{meta.adminOnly ? 'للإدارة فقط · ' : ''}يتحقق النظام من الاستحقاق من الدرجات والحضور والسلوك المرصودة، ولا تتكرر الشهادة نفسها للطالب — إعادة إصدارها تحدّث أرقامها.</p>
    </section>
  );
}

function RankRow({ r, type, busy, onOpen }: { r: TopRow; type: AppreciationType; busy: boolean; onOpen: () => void }) {
  const medal = ['#c9a042', '#9aa4ae', '#b8794a'][r.rank - 1] ?? '#d6dbe0';
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line p-2.5 ps-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: medal }}>{r.rank}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{r.name}</span>
        <span className="block text-xs text-muted">{r.code} · {r.class_label}{type === 'attendance' ? ` · غياب ${r.absent ?? 0} · تأخر ${r.late ?? 0}` : ` · ${r.n} درجة`}</span>
      </span>
      <span className="text-lg font-bold tabular-nums text-board" dir="ltr">{r.pct}%</span>
      {r.issued && <Badge tone="ok">صدرت</Badge>}
      <button type="button" onClick={onOpen} disabled={busy} className="btn-quiet px-3">{busy ? <span className="spinner" /> : <Icon name="eye" className="size-4" />}<span className="hidden sm:inline">{r.issued ? 'عرض وتحديث' : 'معاينة'}</span></button>
    </li>
  );
}

function StudentSearch({ label, picked, onPick }: { label: string; picked: StudentHit | null; onPick: (h: StudentHit | null) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2 || picked) return setHits([]);
    setSearching(true);
    const t = setTimeout(async () => {
      setHits(await searchStudents(q));
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q, picked]);
  return (
    <div className="relative">
      <p className="label">{label}</p>
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-4 text-muted" />
        <input value={picked ? `${picked.name_ar} — ${picked.class_label}` : q} onChange={(e) => { setQ(e.target.value); if (picked) onPick(null); }} onFocus={(e) => picked && e.target.select()}
          placeholder="اكتب اسم الطالب أو رقمه" className="field ps-10" autoComplete="off" />
        {searching && <span className="spinner absolute inset-y-0 end-3 my-auto text-board" />}
      </div>
      <AnimatePresence>
        {hits.length > 0 && (
          <motion.ul initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-2xl border border-line bg-surface p-1 shadow-[0_20px_50px_-20px_rgb(31_42_36/0.45)]">
            {hits.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => { setHits([]); onPick(h); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start hover:bg-board/[0.06]">
                  <span className="grid size-9 place-items-center rounded-full bg-board/10 font-bold text-board">{h.name_ar.trim().charAt(0)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{h.name_ar}</span>
                    <span className="block text-xs text-muted">{h.code} · {h.class_label}</span>
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/* --------------------------------------------------------------------- */
function IssuedPanel({ ctx, brand, branches, onOpen }: { ctx: AuthorContext; brand: AppreciationBrand; branches: Opt[]; onOpen: (v: AppreciationView) => void }) {
  const { toast } = useFeedback();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [type, setType] = useState<AppreciationType | null>(null);
  const [branch, setBranch] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState<number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => { setDq(q); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const size = 12;
  const list = useQuery({
    queryKey: ['certs', 'list', dq, type, branch, page],
    queryFn: () => listCerts({ q: dq, type, branch, offset: page * size, limit: size }),
    placeholderData: keepPreviousData,
  });
  const total = list.data?.total ?? 0;
  const rows = list.data?.rows ?? [];

  const exportAll = async () => {
    const all = await listCerts({ q: dq, type, branch, offset: 0, limit: 60 });
    if (!all.rows.length) return;
    setExporting(0);
    try {
      await exportCertsPdf(all.rows, brand, `شهادات-شكر-${ad(all.rows.length)}`, setExporting);
      toast(`نُزّلت ${all.rows.length} شهادة في ملف واحد`);
    } catch {
      toast('تعذّر التصدير. حدّث الصفحة وحاول مجددًا', 'error');
    } finally {
      setExporting(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Icon name="search" className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-4 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم الطالب أو رقمه" className="field ps-10" />
        </div>
        {ctx.isAdmin && branches.length > 1 && (
          <select value={branch ?? ''} onChange={(e) => { setBranch(e.target.value ? Number(e.target.value) : null); setPage(0); }} className="field w-auto">
            <option value="">كل الفروع</option>
            {branches.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        )}
        <button type="button" onClick={exportAll} disabled={!total || exporting != null} className="btn-quiet">
          {exporting != null ? <><span className="spinner" /> {ad(exporting)}/{ad(Math.min(total, 60))}</> : <><Icon name="download" className="size-4" /> تنزيلها PDF</>}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => { setType(null); setPage(0); }} className={chip(type === null, true)}>الكل</button>
        {APPRECIATION_TYPES.filter((t) => ctx.isAdmin || !t.adminOnly).map((t) => (
          <button key={t.value} type="button" onClick={() => { setType(t.value); setPage(0); }} className={chip(type === t.value, true)}>{t.label}</button>
        ))}
      </div>

      {list.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-32 animate-pulse rounded-[1.4rem] bg-surface" />)}</div>
      ) : !rows.length ? (
        <div className="rounded-[1.4rem] border border-dashed border-line bg-surface px-6 py-12 text-center">
          <Icon name="award" className="mx-auto size-10 text-muted/60" />
          <p className="mt-3 font-semibold">{dq || type || branch ? 'لا شهادات تطابق البحث' : 'لم تُصدر شهادات بعد'}</p>
          <p className="mt-1 text-sm text-muted">ابدأ من تبويب «إصدار شهادة».</p>
        </div>
      ) : (
        <ul className={`grid gap-3 transition-opacity sm:grid-cols-2 xl:grid-cols-3 ${list.isFetching ? 'opacity-60' : ''}`}>
          {rows.map((v) => {
            const m = typeMeta(v.type);
            return (
              <li key={v.id}>
                <button type="button" onClick={() => onOpen(v)} className="group relative block w-full overflow-hidden rounded-[1.4rem] border border-line bg-surface p-4 text-start transition-shadow hover:shadow-[0_16px_36px_-24px_rgb(31_42_36/0.5)]">
                  <span aria-hidden className="absolute -end-6 -top-6 size-20 rotate-45 rounded-2xl opacity-25 transition-transform group-hover:scale-110" style={{ background: `linear-gradient(135deg, ${m.pal.a}, ${m.pal.b})` }} />
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white" style={{ background: m.pal.a }}>{m.label}</span>
                  <span className="mt-2 block truncate text-lg font-bold">{v.student}</span>
                  <span className="block truncate text-sm text-muted">{v.class_label}{v.subject ? ` · ${v.subject}` : ''}{v.metrics.pct != null ? ` · ${v.metrics.pct}%` : ''}{v.metrics.rank ? ` · المركز ${v.metrics.rank}` : ''}</span>
                  <span className="mt-2 block text-xs text-muted">{certDates(v.issued_at).split(' — ').pop()}{ctx.isAdmin && v.issuer ? ` · ${v.issuer}` : ''}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {total > size && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="btn-quiet px-3">السابق</button>
          <span className="tabular-nums text-muted">{page + 1} / {Math.ceil(total / size)}</span>
          <button type="button" onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * size >= total} className="btn-quiet px-3">التالي</button>
        </div>
      )}
    </section>
  );
}

/* --------------------------------------------------------------------- */
function CertSheet({ state, brand, onClose, onIssued, onRevoked }: {
  state: { v: AppreciationView; input: IssueInput | null } | null;
  brand: AppreciationBrand;
  onClose: () => void;
  onIssued: (v: AppreciationView) => void;
  onRevoked: () => void;
}) {
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);
  const v = state?.v;
  const draft = v && v.id == null;

  const issue = async () => {
    if (!state?.input) return;
    setBusy(true);
    const res = await issueCert(state.input);
    setBusy(false);
    if (!res.ok) return toast(res.error, 'error');
    toast(res.message ?? 'صدرت الشهادة');
    onIssued(res.data);
  };
  const revoke = async () => {
    if (!v?.id) return;
    const ok = await confirm({ title: 'إلغاء الشهادة؟', body: <>تختفي شهادة <b className="text-ink">{v.student}</b> من صفحته فورًا.</>, confirmLabel: 'إلغاء الشهادة', danger: true, run: () => revokeCert(v.id!) });
    if (ok) onRevoked();
  };

  return (
    <Sheet
      open={!!state}
      onClose={onClose}
      wide
      title={draft ? 'معاينة قبل الإصدار' : 'شهادة شكر وتقدير'}
      subtitle={v ? `${typeMeta(v.type).label} · ${v.student}` : undefined}
      footer={draft ? (
        <button type="button" onClick={issue} disabled={busy} className="btn-primary w-full py-3">
          {busy ? <span className="spinner" /> : <Icon name="award" className="size-4" />} إصدار الشهادة — تظهر في صفحة الطالب
        </button>
      ) : undefined}
    >
      {v && (
        <>
          {draft ? (
            <p className="mb-4 flex items-start gap-2 rounded-xl bg-board/[0.06] px-4 py-3 text-sm leading-relaxed text-board">
              <Icon name="check" className="mt-0.5 size-4 shrink-0" /> الطالب مستحق — راجع الشهادة ثم أصدرها. الأرقام محسوبة من الرصد الآن.
            </p>
          ) : (
            <p className="mb-4 flex items-start gap-2 rounded-xl bg-ok-soft px-4 py-3 text-sm text-ok">
              <Icon name="check" className="mt-0.5 size-4 shrink-0" /> صادرة {certDates(v.issued_at).split(' — ').pop()}{v.issuer ? ` · ${v.issuer}` : ''} — ظاهرة في صفحة الطالب
            </p>
          )}
          <AppreciationViewer
            key={`${v.id}-${v.issued_at}`}
            v={v}
            brand={brand}
            actions={!draft && <button type="button" onClick={revoke} className="btn-quiet ms-auto text-danger hover:border-danger/40"><Icon name="trash" className="size-4" /> إلغاء</button>}
          />
        </>
      )}
    </Sheet>
  );
}
