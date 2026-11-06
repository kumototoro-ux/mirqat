'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { Icon, type IconName } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { diagnose, KIND, type Kind } from '@/lib/track/diagnose';
import { opLabel, pageLabel, ROLES } from '@/lib/track/labels';
import { fmtFull, relTime } from '@/lib/assess/shared';
import { trackEvents, trackResolve, trackSummary, type TrackEventRow, type TrackFilters, type TrackGroup, type TrackSummary } from '@/lib/track/actions';

/* =====================================================================
   مركز التتبع: كل مشكلة مشروحة — ماذا حدث، لماذا، وما الحل
   ===================================================================== */

const RANGES: { h: number; label: string }[] = [
  { h: 24, label: 'آخر 24 ساعة' }, { h: 168, label: 'آخر 7 أيام' }, { h: 720, label: 'آخر 30 يومًا' }, { h: 0, label: 'كل الفترة' },
];
const VIEWS: { v: string; label: string }[] = [
  { v: 'problems', label: 'المشاكل فقط' }, { v: 'all', label: 'كل الأحداث' }, { v: 'system', label: 'أخطاء تقنية وإعداد' },
  { v: 'security', label: 'الأمان والصلاحيات' }, { v: 'slow', label: 'البطء' },
];
const asInput = (r: TrackEventRow) => ({ action: r.action, severity: r.severity as never, message: r.message, code: r.code, path: r.path, duration_ms: r.duration_ms, actor_name: r.actor_name, details: r.details });

export function TrackCenter({ initialSummary, initialEvents }: { initialSummary: TrackSummary | null; initialEvents: { total: number; rows: TrackEventRow[] } }) {
  const { toast, confirm } = useFeedback();
  const [hours, setHours] = useState(24);
  const [summary, setSummary] = useState(initialSummary);
  const [f, setF] = useState<TrackFilters>({ hours: 24, view: 'problems', page: 1, size: 30 });
  const [events, setEvents] = useState(initialEvents);
  const [q, setQ] = useState('');
  const [pending, start] = useTransition();
  const first = useRef(true);
  const listRef = useRef<HTMLDivElement>(null);

  const load = (nf: TrackFilters, withSummary = false) => {
    setF(nf);
    start(async () => {
      const [ev, sm] = await Promise.all([trackEvents(nf), withSummary ? trackSummary(nf.hours ?? 24) : Promise.resolve(null)]);
      setEvents(ev);
      if (sm) setSummary(sm);
    });
  };
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => load({ ...f, q, page: 1 }), 400);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const setRange = (h: number) => { setHours(h); load({ ...f, hours: h, page: 1 }, true); };
  const focus = (patch: TrackFilters) => {
    load({ ...f, view: 'all', fingerprint: undefined, actor_id: undefined, ...patch, page: 1 });
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const clearFocus = () => load({ ...f, fingerprint: undefined, actor_id: undefined, view: 'problems', page: 1 });
  const focusedGroup = f.fingerprint ? summary?.groups.find((g) => g.fingerprint === f.fingerprint) : undefined;

  const resolve = async (g: TrackGroup) => {
    const dg = diagnose(asInput(g.sample));
    if (g.resolved) {
      const res = await trackResolve(g.fingerprint, false);
      if (!res.ok) return toast(res.error, 'error');
      toast(res.message);
    } else {
      const ok = await confirm({
        title: 'تعليم المشكلة كمحلولة؟',
        body: <span>«{dg.group}» — تختفي من «تحتاج تدخلك»، وتعود تلقائيًا إن تكررت بعد الآن.</span>,
        confirmLabel: 'تم الحل',
        run: () => trackResolve(g.fingerprint, true),
      });
      if (!ok) return;
    }
    load(f, true);
  };

  const c = summary?.counts;
  const pages = Math.max(1, Math.ceil(events.total / (f.size ?? 30)));

  return (
    <div className={`transition-opacity ${pending ? 'opacity-70' : ''}`}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 overflow-x-auto rounded-2xl bg-paper p-1">
          {RANGES.map((r) => (
            <button key={r.h} type="button" onClick={() => setRange(r.h)} className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-sm ${hours === r.h ? 'bg-surface font-semibold text-accent shadow-sm' : 'text-muted hover:text-ink'}`}>{r.label}</button>
          ))}
        </div>
        <button type="button" onClick={() => load(f, true)} className="btn-quiet ms-auto px-3 py-2 text-sm" aria-label="تحديث">
          {pending ? <span className="spinner" /> : <Icon name="undo" className="size-4 -scale-x-100" />} تحديث
        </button>
      </div>

      {/* المؤشرات */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="تحتاج تدخلك" value={c?.needs_action ?? 0} icon="flag" tone={c?.needs_action ? 'danger' : 'ok'} hint={c?.needs_action ? 'غير المحلولة' : 'لا شيء ينتظرك'} />
        <Kpi label="أخطاء تقنية وإعداد" value={(c?.system ?? 0) + (c?.config ?? 0)} icon="alert" hint="تحتاج المطوّر أو الإدارة" onClick={() => focus({ view: 'system' })} />
        <Kpi label="أخطاء مستخدمين" value={c?.user ?? 0} icon="user" hint="النظام منعها وشرحها لهم" onClick={() => focus({ view: 'problems', kind: 'user' })} />
        <Kpi label="الأمان والصلاحيات" value={c?.security ?? 0} icon="key" hint="دخول فاشل، صفحات بلا صلاحية" onClick={() => focus({ view: 'security' })} />
        <Kpi label="البطء" value={c?.slow ?? 0} icon="clock" hint="أكثر من ثانيتين" onClick={() => focus({ view: 'slow' })} />
      </div>
      {summary && summary.by_day.length > 1 && <DayBars days={summary.by_day} />}

      {/* أبرز المشاكل */}
      {!f.fingerprint && !f.actor_id && (
        <section className="mb-6">
          <h2 className="mb-3 text-lg font-bold">أبرز المشاكل <span className="text-sm font-normal text-muted">· {RANGES.find((r) => r.h === hours)?.label}</span></h2>
          {!summary?.groups.length ? (
            <div className="flex items-center gap-3 rounded-2xl border border-ok/25 bg-ok-soft/40 p-5 text-sm">
              <span className="grid size-9 place-items-center rounded-full bg-ok text-on-ok"><Icon name="check" className="size-5" /></span>
              لا مشاكل في هذه الفترة. كل شيء يعمل بشكل طبيعي.
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {summary.groups.map((g) => <GroupCard key={g.fingerprint} g={g} onShow={() => focus({ fingerprint: g.fingerprint })} onResolve={() => resolve(g)} />)}
            </div>
          )}
        </section>
      )}

      {/* فلتر نشط */}
      {(f.fingerprint || f.actor_id) && (
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3">
            <Icon name="filter" className="size-4 text-muted" />
            <span className="rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">
              {f.actor_id ? `كل أحداث ${events.rows[0]?.actor_name ?? 'المستخدم'}` : focusedGroup ? diagnose(asInput(focusedGroup.sample)).group : 'مشكلة محددة'}
            </span>
            <button type="button" onClick={clearFocus} className="ms-auto text-sm text-muted hover:text-ink">عرض الكل ✕</button>
          </div>
          {focusedGroup && <Explain {...diagnose(asInput(focusedGroup.sample))} />}
        </div>
      )}

      {/* الأحداث */}
      <section ref={listRef} className="scroll-mt-24 overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <h2 className="me-auto px-1 font-bold">الأحداث <span className="text-sm font-normal text-muted tabular-nums">({events.total.toLocaleString('en')})</span></h2>
          <div className="relative w-full sm:w-64">
            <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم، رقم، صفحة، رسالة أو رمز خطأ" className="field py-2 ps-9 text-sm" aria-label="بحث في الأحداث" />
          </div>
          {!f.fingerprint && !f.actor_id && (
            <select value={f.view} onChange={(e) => load({ ...f, view: e.target.value, kind: undefined, page: 1 })} className="field w-full py-2 text-sm sm:w-48" aria-label="نوع الأحداث">
              {VIEWS.map((v) => <option key={v.v} value={v.v}>{v.label}</option>)}
            </select>
          )}
        </div>
        {events.rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted">لا أحداث. غيّر الفترة أو اختر «كل الأحداث».</p>
        ) : (
          <ul className="divide-y divide-line">
            {events.rows.map((r) => <EventRow key={r.id} r={r} onActor={(id) => focus({ actor_id: id })} onSame={(fp) => focus({ fingerprint: fp })} focusedFp={f.fingerprint} />)}
          </ul>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3">
            <button type="button" disabled={(f.page ?? 1) <= 1} onClick={() => load({ ...f, page: (f.page ?? 1) - 1 })} className="btn-quiet px-3 py-1.5 text-sm disabled:opacity-40">الأحدث</button>
            <span className="text-sm text-muted tabular-nums">صفحة {f.page ?? 1} من {pages}</span>
            <button type="button" disabled={(f.page ?? 1) >= pages} onClick={() => load({ ...f, page: (f.page ?? 1) + 1 })} className="btn-quiet px-3 py-1.5 text-sm disabled:opacity-40">الأقدم</button>
          </div>
        )}
      </section>
      <Legend />
    </div>
  );
}

function Kpi({ label, value, icon, hint, tone, onClick }: { label: string; value: number; icon: IconName; hint?: string; tone?: 'danger' | 'ok'; onClick?: () => void }) {
  const cls = tone === 'danger' ? 'border-danger/30 bg-danger-soft/50' : tone === 'ok' ? 'border-ok/25 bg-ok-soft/30' : 'border-line bg-surface';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className={`rounded-2xl border p-4 text-start transition ${cls} ${onClick ? 'hover:-translate-y-0.5 hover:border-accent/30' : ''}`}>
      <span className="flex items-center gap-2 text-sm text-muted"><Icon name={icon} className={`size-4 ${tone === 'danger' ? 'text-danger' : ''}`} />{label}</span>
      <span className={`mt-1.5 block text-[1.8rem] font-bold leading-none tabular-nums ${tone === 'danger' ? 'text-danger' : ''}`}>{value.toLocaleString('en')}</span>
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </Tag>
  );
}

/** مشاكل كل يوم (آخر 30 يومًا كحد أقصى) */
function DayBars({ days }: { days: TrackSummary['by_day'] }) {
  const max = Math.max(1, ...days.map((d) => d.problems + d.slow + d.security));
  return (
    <div className="mb-6 rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted">
        <span className="me-auto text-sm font-semibold text-ink">المشاكل حسب اليوم</span>
        <span className="flex items-center gap-1"><i className="size-2.5 rounded-sm bg-danger/80" /> أخطاء</span>
        <span className="flex items-center gap-1"><i className="size-2.5 rounded-sm bg-ink/70" /> أمان</span>
        <span className="flex items-center gap-1"><i className="size-2.5 rounded-sm bg-[#7c68b8]" /> بطء</span>
      </div>
      <div className="flex h-24 items-end gap-1" dir="ltr">
        {days.map((d) => {
          const t = d.problems + d.slow + d.security;
          return (
            <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end" title={`${d.day}: ${d.problems} أخطاء · ${d.security} أمان · ${d.slow} بطء`}>
              <div className="flex w-full flex-col overflow-hidden rounded-t" style={{ height: `${(t / max) * 100}%`, minHeight: t ? 3 : 0 }}>
                <div className="bg-[#7c68b8]" style={{ flex: d.slow }} />
                <div className="bg-ink/70" style={{ flex: d.security }} />
                <div className="bg-danger/80" style={{ flex: d.problems }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted tabular-nums" dir="ltr"><span>{days[0]?.day.slice(5)}</span><span>{days[days.length - 1]?.day.slice(5)}</span></div>
    </div>
  );
}

function GroupCard({ g, onShow, onResolve }: { g: TrackGroup; onShow: () => void; onResolve: () => void }) {
  const dg = diagnose(asInput(g.sample));
  const k = KIND[dg.kind];
  const [open, setOpen] = useState(false);
  return (
    <motion.article layout className={`rounded-2xl border p-4 ${g.resolved ? 'border-line bg-paper/50 opacity-75' : g.needs_action ? 'border-danger/30 bg-surface' : 'border-line bg-surface'}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${k.dot}`} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">{dg.group}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span className={`rounded-full px-2 py-0.5 font-semibold ${k.tone}`}>{k.label}</span>
            <span className="font-bold text-ink tabular-nums">{g.count.toLocaleString('en')} مرة</span>
            <span>· آخرها {relTime(g.last_at)}</span>
            {g.people_n > 0 && <span>· {g.people.slice(0, 2).join('، ')}{g.people_n > 2 ? ` و${g.people_n - 2} آخرين` : ''}</span>}
            {g.resolved && <span className="font-semibold text-ok">· محلولة{g.resolved_by ? ` (${g.resolved_by})` : ''}</span>}
            {!g.resolved && g.needs_action && <span className="font-semibold text-danger">· تحتاج تدخلك</span>}
          </p>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <Explain cause={dg.cause} fix={dg.fix} className="mt-3" />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setOpen(!open)} className="btn-quiet px-3 py-1.5 text-xs"><Icon name="sparkle" className="size-3.5" /> {open ? 'إخفاء الشرح' : 'لماذا وما الحل؟'}</button>
        <button type="button" onClick={onShow} className="btn-quiet px-3 py-1.5 text-xs"><Icon name="eye" className="size-3.5" /> الأحداث</button>
        {dg.kind !== 'ok' && (
          <button type="button" onClick={onResolve} className={`ms-auto rounded-xl px-3 py-1.5 text-xs font-semibold ${g.resolved ? 'bg-paper text-muted hover:text-ink' : 'bg-ok-soft text-ok hover:bg-ok hover:text-on-ok'}`}>
            {g.resolved ? 'إعادة فتح' : '✓ تم الحل'}
          </button>
        )}
      </div>
    </motion.article>
  );
}

export function Explain({ cause, fix, className = '' }: { cause?: string; fix?: string; className?: string }) {
  if (!cause && !fix) return null;
  return (
    <div className={`grid gap-2 sm:grid-cols-2 ${className}`}>
      {cause && (
        <div className="rounded-xl bg-paper px-3 py-2.5 text-sm leading-relaxed">
          <p className="mb-0.5 flex items-center gap-1.5 text-xs font-bold text-muted"><Icon name="alert" className="size-3.5" /> لماذا حدث؟</p>{cause}
        </div>
      )}
      {fix && (
        <div className="rounded-xl bg-board/[0.06] px-3 py-2.5 text-sm leading-relaxed">
          <p className="mb-0.5 flex items-center gap-1.5 text-xs font-bold text-accent"><Icon name="check" className="size-3.5" /> ما الحل؟</p>{fix}
        </div>
      )}
    </div>
  );
}

function EventRow({ r, onActor, onSame, focusedFp }: { r: TrackEventRow; onActor: (id: string) => void; onSame: (fp: string) => void; focusedFp?: string }) {
  const [open, setOpen] = useState(false);
  const dg = useMemo(() => diagnose(asInput(r)), [r]);
  const k = KIND[r.kind as Kind] ?? KIND.ok;
  return (
    <li>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 px-4 py-3 text-start hover:bg-paper/50">
        <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${k.dot}`} />
        <span className="min-w-0 flex-1">
          <span className={`block break-words text-sm leading-6 ${r.kind !== 'ok' ? 'font-semibold' : ''}`}>{dg.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${k.tone}`}>{k.label}</span>
            <span>{fmtFull(r.at)}</span>
            {r.actor_role && <span>· {ROLES[r.actor_role] ?? r.actor_role}</span>}
            {r.needs_action && <span className="font-semibold text-danger">· يحتاج تدخل</span>}
          </span>
        </span>
        <Icon name="chevron" className={`mt-1.5 size-4 shrink-0 text-muted transition ${open ? 'rotate-90' : '-rotate-90'}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-3 px-4 pb-4">
              <Explain cause={dg.cause} fix={dg.fix} />
              <div className="flex flex-wrap gap-2">
                {r.actor_id && (
                  <>
                    <button type="button" onClick={() => onActor(r.actor_id!)} className="btn-quiet px-3 py-1.5 text-xs"><Icon name="user" className="size-3.5" /> كل أحداث {r.actor_name?.split(' ')[0] ?? 'المستخدم'}</button>
                    <Link href={`/staff/audit?tab=people&user=${r.actor_id}`} className="btn-quiet px-3 py-1.5 text-xs"><Icon name="clock" className="size-3.5" /> خطه الزمني</Link>
                  </>
                )}
                {r.kind !== 'ok' && focusedFp !== r.fingerprint && (
                  <button type="button" onClick={() => onSame(r.fingerprint)} className="btn-quiet px-3 py-1.5 text-xs"><Icon name="filter" className="size-3.5" /> نفس المشكلة عند الآخرين</button>
                )}
              </div>
              <Technical r={r} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function Technical({ r }: { r: TrackEventRow }) {
  const d = r.details ?? {};
  const rows: [string, string | null | undefined][] = [
    ['الصفحة', r.path ? `${pageLabel(r.path)} (${r.path})` : null],
    ['العملية', typeof d.op === 'string' ? `${opLabel(d.op)} — ${d.op}` : null],
    ['الحدث', r.action],
    ['رمز الخطأ', r.code],
    ['الرسالة', r.message],
    ['المدة', r.duration_ms != null ? `${(r.duration_ms / 1000).toFixed(1)} ثانية` : null],
    ['رمز الصفحة (digest)', typeof d.digest === 'string' ? d.digest : null],
    ['المستخدم', r.actor_name ? `${r.actor_name}${r.actor_code ? ` · ${r.actor_code}` : ''}` : (typeof d.username === 'string' ? d.username : null)],
    ['الجهاز', r.ip],
    ['المتصفح', r.user_agent],
  ];
  const extra = Object.entries(d).filter(([key, v]) => !['op', 'digest', 'username'].includes(key) && v != null && v !== '');
  return (
    <details className="rounded-xl border border-line text-xs">
      <summary className="cursor-pointer px-3 py-2 font-semibold text-muted">التفاصيل التقنية (للمطوّر)</summary>
      <dl className="grid gap-x-3 gap-y-1.5 border-t border-line px-3 py-2.5 sm:grid-cols-[9rem_1fr]">
        {rows.filter(([, v]) => v).map(([label, v]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="break-all font-mono text-[11px]" dir="auto">{v}</dd>
          </div>
        ))}
        {extra.map(([key, v]) => (
          <div key={key} className="contents">
            <dt className="text-muted" dir="ltr">{key}</dt>
            <dd className="break-all font-mono text-[11px]" dir="ltr">{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function Legend() {
  return (
    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 px-1 text-xs text-muted">
      {(Object.keys(KIND) as Kind[]).map((k) => (
        <span key={k} className="flex items-center gap-1.5" title={KIND[k].hint}><i className={`size-2 rounded-full ${KIND[k].dot}`} />{KIND[k].label}: {KIND[k].hint}</span>
      ))}
    </div>
  );
}
