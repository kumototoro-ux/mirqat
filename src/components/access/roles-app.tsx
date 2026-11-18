'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Card } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { PermissionsMatrix } from '@/components/perms/permissions-matrix';
import type { PermMatrix } from '@/lib/perms/actions';
import { deletePosition, savePosition, setPositionBranches, setPositionCaps, type PositionBoard, type PositionEmployee, type PositionInfo } from '@/lib/access/actions';
import { setBranchBuilding } from '@/lib/perf/actions';

export type RolesTab = 'positions' | 'holders' | 'teachers';
const TABS: { key: RolesTab; label: string; hint: string }[] = [
  { key: 'positions', label: 'المناصب وما تملكه', hint: 'أضف منصبًا وعدّل صلاحياته' },
  { key: 'holders', label: 'أصحاب المناصب', hint: 'أسند المنصب لموظف في فرع أو أكثر' },
  { key: 'teachers', label: 'مفاتيح المعلمين', hint: 'ما يُسمح للمعلم بإنشائه وطباعته' },
];

const LEVELS = [
  { v: 0, label: 'لا شيء', short: '—' },
  { v: 1, label: 'عرض', short: 'عرض' },
  { v: 2, label: 'تعديل', short: 'تعديل' },
  { v: 3, label: 'كامل', short: 'كامل' },
] as const;
const TIER_LABEL = { school: 'على مستوى المدرسة', branch: 'داخل الفرع' } as const;

export function RolesApp({ board, matrix, initialTab }: { board: PositionBoard; matrix: PermMatrix; initialTab: RolesTab }) {
  const [tab, setTab] = useState<RolesTab>(initialTab);
  const choose = (t: RolesTab) => {
    setTab(t);
    try { window.history.replaceState(null, '', `?tab=${t}`); } catch { /* غير مهم */ }
  };
  return (
    <div className="space-y-6">
      <Hierarchy />
      <div role="tablist" aria-label="الأدوار والصلاحيات" className="flex flex-wrap gap-2 border-b border-line pb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            onClick={() => choose(t.key)}
            className={`rounded-xl px-4 py-2 text-start transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${tab === t.key ? 'bg-board text-chalk' : 'bg-surface text-ink ring-1 ring-inset ring-line hover:ring-accent/40'}`}
          >
            <span className="block text-sm font-semibold">{t.label}</span>
            <span className={`block text-xs ${tab === t.key ? 'text-chalk/75' : 'text-muted'}`}>{t.hint}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'positions' && <PositionsTab board={board} />}
        {tab === 'holders' && <HoldersTab board={board} />}
        {tab === 'teachers' && <PermissionsMatrix initial={matrix} />}
      </div>
    </div>
  );
}

/** الهرم الثابت: الأدمن ثم مدير المدرسة ثم مدير الفرع — ثلاثة أشياء مختلفة */
function Hierarchy() {
  const tiers = [
    { name: 'الأدمن', scope: 'المنصة كلها', tone: 'bg-gold/20 text-brass', body: 'ينشئ الفروع ويدير الإعدادات والنسخ الاحتياطي والأمان وحسابات الإدارة. حساب أدمن، ولا يُسند له منصب.' },
    { name: 'مدير المدرسة', scope: 'الفروع المسندة إليه', tone: 'bg-board text-chalk', body: 'يشرف على عدة فروع أو كلها بحسب الإسناد، ويستلم تقارير الأداء. أقل من الأدمن: لا ينشئ فروعًا ولا يغيّر إعدادات المنصة.' },
    { name: 'مدير الفرع', scope: 'فرع واحد', tone: 'bg-accent/15 text-accent', body: 'يدير فرعه فقط: الطلاب والجداول والتحضير، ويعلن النتائج ويحجبها لفرعه. ومعه وكيل ومشرفون ومسؤول قبول في الفرع نفسه.' },
  ];
  return (
    <ol className="grid gap-3 md:grid-cols-3" aria-label="تدرج الأدوار من الأعلى إلى الأدنى">
      {tiers.map((t, i) => (
        <li key={t.name} className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center gap-2">
            <span className={`grid size-7 place-items-center rounded-full text-xs font-bold ${t.tone}`} aria-hidden>{i + 1}</span>
            <p className="font-semibold">{t.name}</p>
            <span className="ms-auto text-xs text-muted">{t.scope}</span>
          </div>
          <p className="mt-2 text-xs leading-6 text-muted">{t.body}</p>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* المناصب وما تملكه                                                   */
/* ------------------------------------------------------------------ */
type Draft = { code: string | null; name: string; nameF: string; description: string; tier: 'school' | 'branch'; rank: number; caps: Record<string, number> };

const toDraft = (p: PositionInfo): Draft => ({
  code: p.code, name: p.name, nameF: p.nameF, description: p.description, tier: p.tier, rank: p.rank,
  caps: Object.fromEntries(p.caps.map((c) => [c.area, c.level])),
});
const blank = (): Draft => ({ code: null, name: '', nameF: '', description: '', tier: 'branch', rank: 0, caps: {} });
const same = (a: Draft, b: Draft) =>
  a.name === b.name && a.nameF === b.nameF && a.description === b.description && a.tier === b.tier && a.rank === b.rank &&
  Object.keys({ ...a.caps, ...b.caps }).every((k) => (a.caps[k] ?? 0) === (b.caps[k] ?? 0));

function PositionsTab({ board }: { board: PositionBoard }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [list, setList] = useState<PositionInfo[]>(board.positions);
  const [sel, setSel] = useState<string>(board.positions[0]?.code ?? 'new');
  const current = list.find((p) => p.code === sel) ?? null;
  const base = useMemo<Draft>(() => (current ? toDraft(current) : blank()), [current]);
  const [draft, setDraft] = useState<Draft>(base);
  const [busy, setBusy] = useState(false);
  const dirty = !same(draft, base);
  const isNew = sel === 'new';
  const locked = !!current?.isSystem;

  const pick = async (code: string) => {
    if (code === sel) return;
    if (dirty && !(await confirm({ title: 'تغييرات غير محفوظة', body: 'ستضيع التعديلات الحالية إن انتقلت الآن.', confirmLabel: 'انتقل دون حفظ', danger: true }))) return;
    setSel(code);
    const next = list.find((p) => p.code === code);
    setDraft(next ? toDraft(next) : blank());
  };

  const setCap = (area: string, v: number) => setDraft((d) => ({ ...d, caps: { ...d.caps, [area]: v } }));
  const copyFrom = (code: string) => {
    const src = list.find((p) => p.code === code);
    if (src) setDraft((d) => ({ ...d, caps: Object.fromEntries(src.caps.map((c) => [c.area, c.level])) }));
  };

  const save = async () => {
    if (!draft.name.trim()) return toast('اسم المنصب مطلوب', 'error');
    setBusy(true);
    const r = await savePosition({ code: draft.code ?? undefined, name: draft.name, nameF: draft.nameF || draft.name, tier: draft.tier, rank: draft.rank, description: draft.description });
    if (!r.ok) { setBusy(false); return toast(r.error, 'error'); }
    const code = r.code ?? draft.code!;
    const c = await setPositionCaps(code, draft.caps);
    setBusy(false);
    if (!c.ok) return toast(c.error, 'error');
    toast(isNew ? 'أُضيف المنصب وضُبطت صلاحياته' : 'حُفظ المنصب وصلاحياته');
    const caps = Object.entries(draft.caps).filter(([, v]) => v > 0).map(([area, level]) => ({ area, level }));
    const info: PositionInfo = { code, name: draft.name.trim(), nameF: (draft.nameF || draft.name).trim(), tier: draft.tier, rank: draft.rank, isSystem: current?.isSystem ?? false, description: draft.description.trim(), holders: current?.holders ?? 0, caps };
    setList((all) => (isNew ? [...all, info] : all.map((p) => (p.code === code ? info : p))));
    setSel(code);
    setDraft(toDraft(info));
    router.refresh();
  };

  const remove = async () => {
    if (!current) return;
    const ok = await confirm({ title: `حذف منصب "${current.name}"؟`, body: 'يُحذف المنصب وصلاحياته. لا يُحذف إن كان يشغله أحد.', confirmLabel: 'حذف', danger: true });
    if (!ok) return;
    setBusy(true);
    const r = await deletePosition(current.code);
    setBusy(false);
    if (!r.ok) return toast(r.error, 'error');
    toast(r.message);
    const rest = list.filter((p) => p.code !== current.code);
    setList(rest);
    setSel(rest[0]?.code ?? 'new');
    setDraft(rest[0] ? toDraft(rest[0]) : blank());
    router.refresh();
  };

  const groups = (['school', 'branch'] as const).map((t) => ({ tier: t, items: list.filter((p) => p.tier === t) }));
  const capCount = Object.values(draft.caps).filter((v) => v > 0).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="space-y-4" aria-label="قائمة المناصب">
        {groups.map((g) => (
          <div key={g.tier}>
            <p className="mb-1.5 px-1 text-xs font-semibold text-muted">{TIER_LABEL[g.tier]}</p>
            <ul className="space-y-1.5">
              {g.items.map((p) => (
                <li key={p.code}>
                  <button
                    type="button"
                    onClick={() => pick(p.code)}
                    aria-current={sel === p.code}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-start text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${sel === p.code ? 'bg-board text-chalk' : 'bg-surface ring-1 ring-inset ring-line hover:ring-accent/40'}`}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${sel === p.code ? 'bg-chalk/15' : 'bg-paper text-muted'}`}>{p.holders}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <button type="button" onClick={() => pick('new')} className={`btn-quiet w-full justify-center py-2.5 text-sm ${isNew ? 'ring-2 ring-accent' : ''}`}>+ منصب جديد</button>
      </aside>

      <Card
        title={isNew ? 'منصب جديد' : draft.name || 'منصب'}
        action={!isNew && current ? <span className="flex items-center gap-2">{locked && <Badge tone="gold">أساسي</Badge>}<Badge>{TIER_LABEL[current.tier]}</Badge></span> : undefined}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">الاسم للموظف</span>
            <input className="field" value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="مثال: مسؤول المختبر" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">الاسم للموظفة</span>
            <input className="field" value={draft.nameF} maxLength={60} onChange={(e) => setDraft({ ...draft, nameF: e.target.value })} placeholder="مثال: مسؤولة المختبر" />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">وصف قصير</span>
            <input className="field" value={draft.description} maxLength={300} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="ماذا يفعل صاحب هذا المنصب؟" />
          </label>
          {(isNew || !locked) && (
            <>
              <fieldset className="text-sm">
                <legend className="mb-1 font-medium">نطاق عمله</legend>
                <div className="flex flex-wrap gap-2">
                  {(['branch', 'school'] as const).map((t) => (
                    <label key={t} className={`cursor-pointer rounded-full px-3.5 py-1.5 ring-1 ring-inset ${draft.tier === t ? 'bg-board text-chalk ring-accent' : 'bg-surface ring-line'}`}>
                      <input type="radio" className="sr-only" name="tier" checked={draft.tier === t} onChange={() => setDraft({ ...draft, tier: t })} />
                      {TIER_LABEL[t]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="text-sm">
                <legend className="mb-1 font-medium">الحماية بين المناصب</legend>
                <div className="flex flex-wrap gap-2">
                  {[{ v: 0, l: 'عادية' }, { v: 1, l: 'تدير حسابات من لا منصب له' }].map((o) => (
                    <label key={o.v} className={`cursor-pointer rounded-full px-3.5 py-1.5 ring-1 ring-inset ${draft.rank === o.v ? 'bg-board text-chalk ring-accent' : 'bg-surface ring-line'}`}>
                      <input type="radio" className="sr-only" name="rank" checked={draft.rank === o.v} onChange={() => setDraft({ ...draft, rank: o.v })} />
                      {o.l}
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}
        </div>
        {locked && <p className="mt-3 rounded-xl bg-paper p-3 text-xs leading-6 text-muted">هذا منصب أساسي: يمكنك تغيير اسمه ووصفه وصلاحياته، أما نطاقه ورتبته وحذفه فمحفوظة لأن تقارير الأداء وقواعد الحماية تعتمد عليها.</p>}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg font-semibold">ما يملكه المنصب <span className="text-sm font-normal text-muted">({capCount} من {board.areas.length} مجالًا)</span></h3>
          <label className="flex items-center gap-2 text-xs text-muted">
            ابدأ من صلاحيات
            <select className="field w-auto py-1.5 text-xs" value="" onChange={(e) => e.target.value && copyFrom(e.target.value)} aria-label="نسخ الصلاحيات من منصب آخر">
              <option value="">اختر منصبًا</option>
              {list.filter((p) => p.code !== sel).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-3 divide-y divide-line rounded-2xl border border-line">
          {board.areas.map((a) => {
            const v = draft.caps[a.area] ?? 0;
            return (
              <div key={a.area} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className={`text-sm ${v ? 'font-medium' : 'text-muted'}`}>{a.name}</span>
                <div role="radiogroup" aria-label={`مستوى ${a.name}`} className="inline-flex overflow-hidden rounded-lg ring-1 ring-inset ring-line">
                  {LEVELS.map((l) => (
                    <button
                      key={l.v}
                      type="button"
                      role="radio"
                      aria-checked={v === l.v}
                      onClick={() => setCap(a.area, l.v)}
                      className={`px-3 py-1.5 text-xs font-medium transition focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-accent ${v === l.v ? (l.v === 3 ? 'bg-ok text-white' : l.v === 2 ? 'bg-gold text-ink' : l.v === 1 ? 'bg-board text-chalk' : 'bg-paper text-ink') : 'bg-surface text-muted hover:bg-paper'}`}
                    >{l.short}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs leading-6 text-muted">
          <b className="text-ink">عرض</b> يرى فقط · <b className="text-ink">تعديل</b> يعدّل ضمن فرعه · <b className="text-ink">كامل</b> ينشئ ويحذف ويستورد. يعمل صاحب المنصب داخل فروعه المسندة فقط، والمنع يُفرض في قاعدة البيانات. يسري التغيير فورًا على كل من يشغل المنصب.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary px-5" disabled={busy || (!dirty && !isNew) || !draft.name.trim()} onClick={save}>
            {busy ? 'جارٍ الحفظ…' : isNew ? 'إضافة المنصب' : 'حفظ التغييرات'}
          </button>
          {dirty && !isNew && <button type="button" className="btn-quiet px-4" disabled={busy} onClick={() => setDraft(base)}>تراجع</button>}
          {!isNew && current && !current.isSystem && (
            <button type="button" className="btn-quiet ms-auto px-4 text-danger" disabled={busy} onClick={remove}>حذف المنصب</button>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* أصحاب المناصب                                                       */
/* ------------------------------------------------------------------ */
function HoldersTab({ board }: { board: PositionBoard }) {
  const { toast, confirm } = useFeedback();
  const [emps, setEmps] = useState<PositionEmployee[]>(board.employees);
  const [q, setQ] = useState('');
  const [onlyAssigned, setOnlyAssigned] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [pos, setPos] = useState<string>(board.positions[0]?.code ?? '');
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [buildings, setBuildings] = useState<Record<number, boolean>>(Object.fromEntries(board.branches.map((b) => [b.id, b.hasBuilding])));

  const posOf = (c: string) => board.positions.find((p) => p.code === c);
  const branchName = (id: number) => board.branches.find((b) => b.id === id)?.name ?? `فرع ${id}`;
  const allIds = board.branches.map((b) => b.id);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return emps.filter((e) => (!t || e.name.toLowerCase().includes(t) || e.code.toLowerCase().includes(t)) && (!onlyAssigned || e.assigned.length > 0));
  }, [emps, q, onlyAssigned]);

  const openFor = (e: PositionEmployee, code: string) => {
    setOpenId(e.id);
    setPos(code);
    setPicked(e.assigned.filter((a) => a.position === code).map((a) => a.branchId));
  };
  const toggle = (id: number) => setPicked((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const save = async (e: PositionEmployee) => {
    const had = e.assigned.filter((a) => a.position === pos).length;
    if (picked.length === 0 && had > 0) {
      const ok = await confirm({ title: `سحب منصب "${posOf(pos)?.name}" من ${e.name}؟`, body: 'يسري السحب فورًا في كل الفروع.', confirmLabel: 'سحب', danger: true });
      if (!ok) return;
    }
    setBusy(true);
    const res = await setPositionBranches(e.id, pos, picked);
    setBusy(false);
    if (!res.ok) return toast(res.error, 'error');
    toast(res.message);
    setEmps((all) => all.map((x) => (x.id === e.id ? { ...x, assigned: [...x.assigned.filter((a) => a.position !== pos), ...picked.map((b) => ({ position: pos, branchId: b }))] } : x)));
    setOpenId(null);
  };

  const toggleBuilding = async (id: number) => {
    const next = !buildings[id];
    const res = await setBranchBuilding(id, next);
    if (!res.ok) return toast(res.error, 'error');
    setBuildings((m) => ({ ...m, [id]: next }));
    toast(res.message);
  };

  // تجميع مناصب الموظف: منصب واحد بفروعه
  const grouped = (e: PositionEmployee) => {
    const m = new Map<string, number[]>();
    for (const a of e.assigned) m.set(a.position, [...(m.get(a.position) ?? []), a.branchId]);
    return [...m.entries()];
  };
  const branchesText = (ids: number[]) => (ids.length === allIds.length && allIds.length > 1 ? 'كل الفروع' : ids.map(branchName).join('، '));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو الرقم" className="field max-w-xs" aria-label="بحث" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyAssigned} onChange={(e) => setOnlyAssigned(e.target.checked)} />
          أصحاب المناصب فقط
        </label>
        <span className="text-xs text-muted">{shown.length} موظف</span>
      </div>

      <ul className="space-y-3">
        {shown.map((e) => {
          const g = grouped(e);
          const open = openId === e.id;
          return (
            <li key={e.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{e.name} <bdi className="text-xs font-normal text-muted">{e.code}</bdi></p>
                {!open && <button type="button" className="btn-quiet px-3 py-1.5 text-xs" onClick={() => openFor(e, pos || board.positions[0]?.code || '')}>إسناد أو تعديل</button>}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {g.length === 0 && <span className="text-xs text-muted">بلا منصب</span>}
                {g.map(([code, ids]) => {
                  const p = posOf(code);
                  return (
                    <button key={code} type="button" onClick={() => openFor(e, code)} title="تعديل فروع هذا المنصب"
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${p?.tier === 'school' ? 'bg-board text-chalk' : 'bg-accent/10 text-accent'}`}>
                      {p?.name ?? code}<span className="font-normal opacity-80">· {branchesText(ids)}</span>
                    </button>
                  );
                })}
              </div>
              {open && (
                <div className="mt-4 space-y-3 rounded-xl bg-paper p-4">
                  <label className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">المنصب</span>
                    <select className="field w-auto" value={pos} onChange={(ev) => { setPos(ev.target.value); setPicked(e.assigned.filter((a) => a.position === ev.target.value).map((a) => a.branchId)); }}>
                      {board.positions.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                    </select>
                  </label>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="font-medium">الفروع</span>
                      <button type="button" className="text-xs text-accent hover:underline" onClick={() => setPicked(picked.length === allIds.length ? [] : allIds)}>
                        {picked.length === allIds.length ? 'إلغاء الكل' : 'كل الفروع'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {board.branches.map((b) => (
                        <button key={b.id} type="button" role="checkbox" aria-checked={picked.includes(b.id)} onClick={() => toggle(b.id)}
                          className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition ${picked.includes(b.id) ? 'bg-board text-chalk ring-accent' : 'bg-surface text-muted ring-line hover:ring-accent/40'}`}>
                          {b.name}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted">{posOf(pos)?.tier === 'school' ? 'منصب على مستوى المدرسة: اختر الفروع التي يشرف عليها أو «كل الفروع».' : 'منصب داخل الفرع: اختر الفرع أو الفروع التي يعمل فيها. ترك الكل فارغًا يسحب المنصب.'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary px-4 py-1.5 text-sm" disabled={busy || !pos} onClick={() => save(e)}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>
                    <button type="button" className="btn-quiet px-4 py-1.5 text-sm" disabled={busy} onClick={() => setOpenId(null)}>إغلاق</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {shown.length === 0 && <li className="py-10 text-center text-sm text-muted">لا موظفين مطابقون</li>}
      </ul>

      <Card title="الفروع التي لها مبنى دراسي">
        <p className="mb-3 text-xs text-muted">تظهر بنود «المبنى والبيئة المدرسية» في تقرير الأداء للفروع التي لها مبنى فقط.</p>
        <div className="flex flex-wrap gap-2">
          {board.branches.map((b) => (
            <button key={b.id} type="button" role="switch" aria-checked={buildings[b.id]} onClick={() => toggleBuilding(b.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset transition ${buildings[b.id] ? 'bg-board text-chalk ring-accent' : 'bg-surface text-muted ring-line hover:ring-accent/40'}`}>
              {b.name}{buildings[b.id] ? ' · له مبنى' : ''}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
