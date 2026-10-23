'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { Sheet } from '@/components/sheet';
import { saveGrant, saveRule, studentCard, type Grant, type OverviewRow } from '@/lib/results/actions';
import { SECTIONS, n2, rating, type Access, type ClassReport, type NoticeSettings, type ReleaseRule, type ReportStudent, type Section } from '@/lib/results/shared';
import { NoticeViewer } from './notice';
import { ReportSummary, SubjectBreakdown } from './report-view';
import { ReleaseRules } from './release-rules';
import { ResultsSettings } from './results-settings';
import { CertificatesTab } from './certificates-tab';
import type { CertBrand } from './certificate';
import type { CertSettings } from '@/lib/results/certificate';

export type RefData = {
  terms: { id: number; name: string; year: string; is_current: boolean }[];
  classes: { id: number; label: string; branch: string }[];
  branches: { id: number; name: string; is_intisab: boolean }[];
  stages: { id: number; name: string }[];
  grades: { id: number; name: string; stage_id: number }[];
  subjects: { id: number; name: string; name_en: string | null }[];
  evalTypes: { id: number; name: string; name_en: string | null; report_section: Section; category: string }[];
};

type Tab = 'board' | 'certs' | 'rules' | 'settings';

const href = (p: { tab?: Tab; term?: number; class?: number | null }) => {
  const q = new URLSearchParams();
  if (p.tab && p.tab !== 'board') q.set('tab', p.tab);
  if (p.term) q.set('term', String(p.term));
  if (p.class) q.set('class', String(p.class));
  const s = q.toString();
  return `/staff/results${s ? `?${s}` : ''}`;
};

export function ResultsAdmin({
  tab,
  termId,
  classId,
  ref_,
  overview,
  initialClass,
  rules,
  grants,
  notice,
  brand,
  cert,
}: {
  tab: Tab;
  termId: number;
  classId: number | null;
  ref_: RefData;
  overview: OverviewRow[];
  initialClass: ClassReport | null;
  rules: ReleaseRule[];
  grants: Grant[];
  notice: NoticeSettings;
  brand: { name: string; logo: string | null };
  cert: { settings: CertSettings; brand: CertBrand } | null;
}) {
  const term = ref_.terms.find((t) => t.id === termId);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex w-full rounded-2xl border border-line bg-surface p-1 sm:inline-flex sm:w-auto" role="tablist">
          {([['board', 'الكشوف', 'results'], ['certs', 'الشهادات', 'award'], ['rules', 'الإتاحة', 'eye'], ['settings', 'الإعدادات', 'settings']] as const).map(([k, l, ic]) => (
            <Link key={k} href={href({ tab: k, term: termId })} role="tab" aria-selected={tab === k} className={`relative flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 py-2 text-[0.82rem] font-semibold transition-colors sm:flex-none sm:px-4 sm:text-sm ${tab === k ? 'text-chalk' : 'text-muted hover:text-ink'}`}>
              {tab === k && <motion.span layoutId="res-tab" className="absolute inset-0 rounded-xl bg-board" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
              <Icon name={ic} className="relative hidden size-4 sm:block" />
              <span className="relative">{l}</span>
            </Link>
          ))}
        </div>
        {tab === 'board' && (
          <div className="flex max-w-full gap-1.5 overflow-x-auto pb-0.5">
            {ref_.terms.map((t) => (
              <Link key={t.id} href={href({ term: t.id, class: classId })} aria-current={t.id === termId ? 'page' : undefined} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-colors ${t.id === termId ? 'bg-ink text-chalk' : 'bg-surface text-ink ring-1 ring-line hover:ring-board/40'}`}>
                {t.name} <span className="text-xs opacity-60">{t.year}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <motion.div key={`${tab}-${classId}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
        {tab === 'board' &&
          (classId ? (
            <ClassView key={`${classId}-${termId}`} classId={classId} termId={termId} termName={term ? `${term.name} ${term.year}` : ''} ref_={ref_} data={initialClass} notice={notice} brand={brand} />
          ) : (
            <Board termId={termId} ref_={ref_} overview={overview} />
          ))}
        {tab === 'certs' && cert && <CertificatesTab ref_={ref_} settings={cert.settings} brand={cert.brand} schoolName={brand.name} principal={notice.principal} />}
        {tab === 'rules' && <ReleaseRules ref_={ref_} rules={rules} />}
        {tab === 'settings' && <ResultsSettings ref_={ref_} grants={grants} notice={notice} />}
      </motion.div>
    </>
  );
}

/* =====================================================================
   لوحة الفصول: معدل كل فصل وحالة إتاحته
   ===================================================================== */
function Board({ termId, ref_, overview }: { termId: number; ref_: RefData; overview: OverviewRow[] }) {
  const by = new Map(overview.map((o) => [o.class_id, o]));
  const groups = useMemo(() => {
    const m = new Map<string, RefData['classes']>();
    for (const c of ref_.classes) m.set(c.branch, [...(m.get(c.branch) ?? []), c]);
    return [...m.entries()];
  }, [ref_.classes]);
  const all = overview.reduce((a, o) => ({ s: a.s + o.students, v: a.v + o.visible, g: a.g + o.graded }), { s: 0, v: 0, g: 0 });
  const avgs = overview.filter((o) => o.average != null);
  const schoolAvg = avgs.length ? avgs.reduce((a, o) => a + Number(o.average) * o.graded, 0) / Math.max(1, avgs.reduce((a, o) => a + o.graded, 0)) : null;

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
        {[
          { l: 'معدل المدرسة', v: schoolAvg == null ? '—' : `${n2(schoolAvg)}%`, t: rating(schoolAvg)?.tone },
          { l: 'طلاب لهم درجات', v: `${all.g} من ${all.s}` },
          { l: 'النتائج ظاهرة لـ', v: `${all.v} طالب`, t: all.v ? 'text-ok' : 'text-brass' },
          { l: 'محجوبة عن', v: `${all.s - all.v} طالب`, t: all.s - all.v ? 'text-brass' : 'text-muted' },
        ].map((x) => (
          <div key={x.l} className="bg-surface px-4 py-3.5 sm:px-5">
            <dt className="text-sm text-muted">{x.l}</dt>
            <dd className={`mt-1 text-[1.45rem] font-bold tabular-nums ${x.t ?? ''}`}>{x.v}</dd>
          </div>
        ))}
      </dl>
      {groups.map(([branch, list]) => (
        <section key={branch}>
          {groups.length > 1 && <h2 className="mb-2.5 text-sm font-bold text-muted">{branch}</h2>}
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((c, i) => {
              const o = by.get(c.id);
              const r = rating(o?.average ?? null);
              const state = !o || !o.students ? 'empty' : o.visible === o.students ? 'open' : o.visible === 0 ? 'closed' : 'partial';
              return (
                <motion.li key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}>
                  <Link href={href({ term: termId, class: c.id })} className="group block rounded-[1.4rem] border border-line bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-board/40 hover:shadow-[0_14px_30px_-22px_rgb(53_104_84/0.8)]">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{c.label}</p>
                        <p className="text-xs text-muted">{o?.students ?? 0} طالب · {o?.graded ?? 0} لهم درجات</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold ${state === 'open' ? 'bg-ok-soft text-ok' : state === 'closed' ? 'bg-brass-soft text-brass' : state === 'partial' ? 'bg-board/10 text-board' : 'bg-paper text-muted'}`}>
                        {state === 'open' ? 'ظاهرة' : state === 'closed' ? 'محجوبة' : state === 'partial' ? `ظاهرة لـ ${o!.visible}` : 'لا طلاب'}
                      </span>
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[1.6rem] font-bold leading-none tabular-nums" dir="ltr">{o?.average == null ? '—' : `${n2(o.average)}%`}</p>
                        <p className={`mt-1 text-xs font-semibold ${r?.tone ?? 'text-muted'}`}>{r ? `${r.ar} · ${r.en}` : 'لا درجات بعد'}</p>
                        {o?.progress != null && o.average != null && Number(o.progress) - Number(o.average) > 1 && (
                          <p className="mt-1 text-[0.7rem] text-muted">الأداء حتى الآن <b className={`tabular-nums ${rating(o.progress)?.tone ?? ''}`} dir="ltr">{n2(o.progress)}%</b></p>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-board opacity-70 transition-opacity group-hover:opacity-100">
                        الكشف <Icon name="chevron" className="size-4" />
                      </span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Number(o?.average ?? 0))}%`, background: r?.bar ?? 'transparent' }} />
                    </div>
                  </Link>
                </motion.li>
              );
            })}
          </ul>
        </section>
      ))}
      {!ref_.classes.length && <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-muted">لا فصول مفعّلة.</p>}
    </div>
  );
}

/* =====================================================================
   كشف الفصل: جدول الطلاب × المواد، مع Excel وإجراءات الإتاحة
   ===================================================================== */
const PAGE = 15;

function ClassView({ classId, termId, termName, ref_, data, notice, brand }: { classId: number; termId: number; termName: string; ref_: RefData; data: ClassReport | null; notice: NoticeSettings; brand: { name: string; logo: string | null } }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const cls = ref_.classes.find((c) => c.id === classId);
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'total' | 'sections'>('total');
  const [sort, setSort] = useState<'name' | 'rank'>('name');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(PAGE);
  const [open, setOpen] = useState<ReportStudent | null>(null);

  if (!data)
    return (
      <div className="rounded-[1.4rem] border border-line bg-surface px-6 py-14 text-center">
        <p className="font-semibold">تعذّر تحميل الكشف</p>
        <Link href={href({ term: termId })} className="btn-quiet mt-4">العودة للفصول</Link>
      </div>
    );

  const students = data.students
    .filter((s) => !q.trim() || s.name_ar.includes(q.trim()) || s.code.includes(q.trim()) || (s.national_id ?? '').includes(q.trim()))
    .sort((a, b) => (sort === 'rank' ? (a.rank ?? 1e9) - (b.rank ?? 1e9) : a.name_ar.localeCompare(b.name_ar, 'ar')));
  const pages = Math.max(1, Math.ceil(students.length / size));
  const view = students.slice(page * size, page * size + size);
  const graded = data.students.filter((s) => s.average != null);
  const avg = graded.length ? graded.reduce((a, s) => a + Number(s.average), 0) / graded.length : null;
  const progAll = graded.filter((s) => s.progress != null);
  const prog = progAll.length ? progAll.reduce((a, s) => a + Number(s.progress), 0) / progAll.length : null;
  const top = [...graded].sort((a, b) => Number(b.average) - Number(a.average))[0];
  const weak = graded.filter((s) => Number(s.average) < 60).length;
  const visibleN = data.students.filter((s) => data.access[String(s.id)]?.visible).length;

  const quick = async (kind: 'block' | 'allow') => {
    const ok = await confirm({
      title: kind === 'block' ? `حجب نتائج ${cls?.label ?? 'الفصل'}؟` : `إتاحة نتائج ${cls?.label ?? 'الفصل'}؟`,
      body: kind === 'block' ? `تُحجب نتائج ${termName} عن ${data.students.length} طالب حتى تلغي القاعدة أو تحدد موعد إتاحة من تبويب "إتاحة النتائج".` : `تظهر نتائج ${termName} لطلاب الفصل الآن، حتى لو كان هناك حجب أعم (فرع أو مرحلة أو الكل).`,
      confirmLabel: kind === 'block' ? 'حجب' : 'إتاحة',
      danger: kind === 'block',
      run: () => saveRule(null, { kind, term_ids: [termId], branch_ids: [], stage_ids: [], grade_ids: [], class_ids: [classId], student_ids: [], opens_at: null, closes_at: null, note: kind === 'block' ? 'حجب سريع من كشف الفصل' : 'إتاحة سريعة من كشف الفصل' }),
    });
    if (!ok) return;
    router.refresh();
  };

  const subjects = data.subjects;
  const cellW = mode === 'sections' ? 150 : 86;

  return (
    <div className="space-y-4">
      <Link href={href({ term: termId })} className="inline-flex items-center gap-1 text-sm text-muted hover:text-board">
        <Icon name="chevron" className="size-4 rotate-180" /> كل الفصول
      </Link>
      <section className="flex flex-wrap items-center gap-4 rounded-[1.6rem] border border-line bg-surface p-5">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-board text-gold"><Icon name="results" className="size-7" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">{cls?.branch} · {termName}</p>
          <h2 className="text-[1.4rem] font-bold leading-snug">{cls?.label ?? 'الفصل'}</h2>
          <p className="mt-1 text-sm text-muted">
            {data.students.length} طالب · {subjects.length} مادة ·{' '}
            <span className={visibleN === data.students.length ? 'text-ok' : visibleN ? 'text-board' : 'text-brass'}>
              {visibleN === data.students.length ? 'النتائج ظاهرة للجميع' : visibleN ? `ظاهرة لـ ${visibleN} طالب` : 'محجوبة عن الطلاب'}
            </span>
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <a href={`/api/results/export?class=${classId}&term=${termId}`} className="btn-primary flex-1 sm:flex-none" download>
            <Icon name="download" className="size-4" /> Excel
          </a>
          {visibleN > 0 ? (
            <button type="button" onClick={() => quick('block')} className="btn-quiet flex-1 sm:flex-none"><Icon name="key" className="size-4" /> حجب</button>
          ) : (
            <button type="button" onClick={() => quick('allow')} className="btn-quiet flex-1 sm:flex-none"><Icon name="eye" className="size-4" /> إتاحة</button>
          )}
        </div>
      </section>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
        {[
          { l: 'معدل الفصل', v: avg == null ? '—' : `${n2(avg)}%`, h: prog != null && avg != null && prog - avg > 1 ? `الأداء حتى الآن ${n2(prog)}% (${rating(prog)?.ar})` : rating(avg) ? `${rating(avg)!.ar} · ${rating(avg)!.en}` : '' },
          { l: 'الأول على الفصل', v: top ? `${n2(top.average)}%` : '—', h: top?.name_ar ?? '' },
          { l: 'تحت 60%', v: String(weak), h: weak ? 'بحاجة لمتابعة' : 'لا أحد 🎉' },
          { l: 'لهم درجات', v: `${graded.length} من ${data.students.length}`, h: '' },
        ].map((x) => (
          <div key={x.l} className="bg-surface px-4 py-3.5">
            <dt className="text-sm text-muted">{x.l}</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums">{x.v}</dd>
            {x.h && <p className="truncate text-xs text-muted">{x.h}</p>}
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full min-w-0 sm:w-auto sm:max-w-xs sm:flex-1">
          <Icon name="search" className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="بحث بالاسم أو الرقم أو الهوية" className="field py-2 ps-9" />
        </div>
        <div className="flex rounded-xl border border-line bg-surface p-0.5 text-sm">
          {([['total', 'المجموع'], ['sections', 'الأقسام']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMode(k)} className={`rounded-lg px-3 py-1.5 ${mode === k ? 'bg-board text-chalk' : 'text-muted'}`}>{l}</button>
          ))}
        </div>
        <button type="button" onClick={() => setSort((s) => (s === 'name' ? 'rank' : 'name'))} className="btn-quiet px-3 py-2 text-sm">
          <Icon name="sort" className="size-4" /> {sort === 'name' ? 'أبجديًا' : 'بالترتيب'}
        </button>
      </div>

      {!subjects.length ? (
        <div className="rounded-[1.4rem] border border-dashed border-line bg-surface px-6 py-12 text-center text-muted">لا مواد موزعة على هذا الفصل. راجع توزيع المواد في الإعدادات.</div>
      ) : (
        <div className="overflow-x-auto rounded-[1.4rem] border border-line bg-surface">
          <table className="w-full text-sm" style={{ minWidth: 300 + subjects.length * cellW + 410 }}>
            <thead className="border-b border-line bg-paper/70 text-muted">
              <tr>
                <th className="sticky start-0 z-10 bg-paper px-4 py-2.5 text-start font-medium">الطالب</th>
                {subjects.map((s) => (
                  <th key={s.id} className="px-2 py-2 text-center font-medium" style={{ minWidth: cellW }}>
                    <span className="block text-ink">{s.name}</span>
                    {mode === 'sections' ? (
                      <span className="mt-0.5 flex justify-center gap-2 text-[0.65rem] font-normal">
                        {SECTIONS.filter((x) => Number(s[x.key]) > 0).map((x) => <span key={x.key} title={x.ar}>{x.key === 'term_work' ? 'أعمال' : x.key === 'quizzes' ? 'قصيرة' : 'نهائي'} {n2(s[x.key])}</span>)}
                      </span>
                    ) : (
                      <span className="text-[0.7rem] font-normal">من {n2(s.max)}</span>
                    )}
                  </th>
                ))}
                <th className="px-2 py-2.5 text-center font-medium">المعدل</th>
                <th className="px-2 py-2.5 text-center font-medium" title="المجموع ÷ درجات ما رُصد حتى الآن">حتى الآن</th>
                <th className="px-2 py-2.5 text-center font-medium">الترتيب</th>
                <th className="px-2 py-2.5 text-center font-medium">المواظبة</th>
                <th className="px-2 py-2.5 text-center font-medium">السلوك</th>
                <th className="px-2 py-2.5 text-center font-medium">الإتاحة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {view.map((s) => {
                const acc: Access | undefined = data.access[String(s.id)];
                const by = new Map(s.subjects.map((x) => [x.subject_id, x]));
                const r = rating(s.average);
                return (
                  <tr key={s.id} className="transition-colors hover:bg-paper/50">
                    <th scope="row" className="sticky start-0 bg-surface px-4 py-2 text-start font-medium">
                      <button type="button" onClick={() => setOpen(s)} className="text-start hover:text-board">
                        <span className="block max-w-48 truncate">{s.name_ar}</span>
                        <span className="block text-xs font-normal text-muted"><bdi>{s.code}</bdi>{s.is_intisab ? ' · منتسب' : ''}</span>
                      </button>
                    </th>
                    {subjects.map((sub) => {
                      const x = by.get(sub.id);
                      // اللون حسب الأداء فيما رُصد (لا يحمرّ الجدول كله في أول الفصل)
                      const rt = rating(x?.progress ?? x?.pct);
                      if (!x || x.total == null) return <td key={sub.id} className="px-2 py-2 text-center text-muted">—</td>;
                      return (
                        <td key={sub.id} className={`px-2 py-2 text-center ${x.visible ? '' : 'opacity-60'}`} title={x.visible ? '' : 'مخفية عن الطالب'}>
                          {mode === 'total' ? (
                            <span className="inline-block min-w-14 rounded-lg px-2 py-1 font-bold tabular-nums" style={{ background: `${rt?.bar}1a`, color: rt?.text }}>{n2(x.total)}</span>
                          ) : (
                            <span className="flex items-center justify-center gap-1.5 tabular-nums">
                              {SECTIONS.filter((k) => Number(sub[k.key]) > 0).map((k) => <span key={k.key} className="rounded-md bg-paper px-1.5 py-0.5 text-xs">{x[k.key] == null ? '—' : n2(x[k.key])}</span>)}
                              <b className="ms-1" style={{ color: rt?.text }}>{n2(x.total)}</b>
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-center">
                      <span className="block font-bold tabular-nums" dir="ltr">{s.average == null ? '—' : `${n2(s.average)}%`}</span>
                      {r && <span className={`text-[0.7rem] font-semibold ${r.tone}`}>{r.ar}</span>}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className={`font-semibold tabular-nums ${rating(s.progress)?.tone ?? 'text-muted'}`} dir="ltr">{s.progress == null ? '—' : `${n2(s.progress)}%`}</span>
                    </td>
                    <td className="px-2 py-2 text-center font-bold tabular-nums">{s.rank ?? '—'}</td>
                    <td className="px-2 py-2 text-center tabular-nums">
                      {s.attendance.pct == null ? <span className="text-xs text-brass">{s.attendance.intisab ? 'منتسب' : '—'}</span> : <span dir="ltr">{n2(s.attendance.pct)}%</span>}
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums">{n2(s.behavior.score)}</td>
                    <td className="px-2 py-2 text-center">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${acc?.visible ? 'bg-ok-soft text-ok' : 'bg-brass-soft text-brass'}`}>{acc?.visible ? 'ظاهرة' : acc?.reason === 'not_yet' ? 'لاحقًا' : acc?.reason === 'ended' ? 'انتهت' : 'محجوبة'}</span>
                    </td>
                  </tr>
                );
              })}
              {!view.length && (
                <tr><td colSpan={subjects.length + 7} className="px-4 py-12 text-center text-muted">لا نتائج للبحث</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {students.length > PAGE && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted">{page * size + 1}–{Math.min(students.length, (page + 1) * size)} من {students.length}</span>
          <div className="flex items-center gap-1.5">
            <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }} className="field w-auto py-1.5 text-sm">
              {[15, 25, 50].map((n) => <option key={n} value={n}>{n} لكل صفحة</option>)}
            </select>
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="btn-quiet px-3 py-1.5">السابق</button>
            <span className="tabular-nums text-muted">{page + 1}/{pages}</span>
            <button type="button" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="btn-quiet px-3 py-1.5">التالي</button>
          </div>
        </div>
      )}

      <StudentSheet student={open} termId={termId} termName={termName} access={open ? data.access[String(open.id)] : undefined} onClose={() => setOpen(null)} notice={notice} brand={brand} />
    </div>
  );
}

/* --------------------------------------------------------------------- */
function StudentSheet({ student, termId, termName, access, onClose, notice, brand }: { student: ReportStudent | null; termId: number; termName: string; access?: Access; onClose: () => void; notice: NoticeSettings; brand: { name: string; logo: string | null } }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const card = useQuery({ queryKey: ['student-card', student?.id, termId], queryFn: () => studentCard(student!.id, termId), enabled: !!student });
  const c = card.data?.status === 'ok' ? card.data : null;

  const rule = async (kind: 'block' | 'allow') => {
    if (!student) return;
    const ok = await confirm({
      title: kind === 'block' ? `حجب نتيجة ${student.name_ar}؟` : `إتاحة نتيجة ${student.name_ar}؟`,
      body: kind === 'block' ? `لا يرى إشعار ${termName} حتى تلغي القاعدة.` : `يرى إشعار ${termName} الآن حتى لو كان فصله محجوبًا.`,
      confirmLabel: kind === 'block' ? 'حجب' : 'إتاحة',
      danger: kind === 'block',
      run: () => saveRule(null, { kind, term_ids: [termId], branch_ids: [], stage_ids: [], grade_ids: [], class_ids: [], student_ids: [student.id], opens_at: null, closes_at: null, note: null }),
    });
    if (!ok) return;
    onClose();
    router.refresh();
  };
  const grant = async () => {
    if (!student) return;
    const ok = await confirm({ title: `منح درجة المواظبة لـ ${student.name_ar}؟`, body: `طالب منتسب: تُحتسب له مواظبة 100% في ${termName} بطلبه. يمكنك تعديل الدرجة أو إلغاء المنح من الإعدادات.`, confirmLabel: 'منح', run: () => saveGrant(student.id, termId, 100, 'بطلب الطالب') });
    if (!ok) return;
    void card.refetch();
    router.refresh();
  };

  return (
    <Sheet open={!!student} onClose={onClose} title={student?.name_ar ?? ''} subtitle={student ? `${student.code} · ${termName}` : ''} wide>
      {card.isLoading ? (
        <div className="space-y-3">
          <div className="h-40 animate-pulse rounded-[1.75rem] bg-paper" />
          <div className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-[1.4rem] bg-paper" />)}</div>
        </div>
      ) : c?.student ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${access?.visible ? 'bg-ok-soft text-ok' : 'bg-brass-soft text-brass'}`}>
              <Icon name={access?.visible ? 'eye' : 'key'} className="size-3.5" /> {access?.visible ? 'ظاهرة للطالب' : 'محجوبة عن الطالب'}
            </span>
            <span className="flex-1" />
            {access?.visible ? (
              <button type="button" onClick={() => rule('block')} className="btn-quiet px-3 py-1.5 text-xs">حجب عنه</button>
            ) : (
              <button type="button" onClick={() => rule('allow')} className="btn-quiet px-3 py-1.5 text-xs">إتاحة له</button>
            )}
            {c.student.attendance.intisab && !c.student.attendance.granted && (
              <button type="button" onClick={grant} className="btn-quiet px-3 py-1.5 text-xs">منح المواظبة</button>
            )}
          </div>
          <ReportSummary s={c.student} />
          <SubjectBreakdown s={c.student} subjects={c.subjects} showEvals />
          <div>
            <h3 className="mb-2 font-bold">إشعار الدرجات</h3>
            <NoticeViewer data={{ term: c.term, subjects: c.subjects, student: c.student, school: brand, settings: notice }} fileName={`إشعار-درجات-${c.student.name_ar.replace(/\s+/g, '-')}-${(c.term?.name ?? '').replace(/\s+/g, '-')}`} />
          </div>
        </div>
      ) : (
        <p className="py-10 text-center text-muted">تعذّر تحميل الإشعار</p>
      )}
    </Sheet>
  );
}
