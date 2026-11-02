'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, type IconName } from '@/components/shell/icons';
import { changeLabel, diagnose, KIND, type Kind } from '@/lib/track/diagnose';
import { ROLES } from '@/lib/track/labels';
import { relTime } from '@/lib/assess/shared';
import { trackPeople, trackTimeline, type Person, type Timeline, type TimelineItem } from '@/lib/track/actions';

/* =====================================================================
   الخط الزمني لمستخدم: دخوله، وكل تعديل قام به، وكل مشكلة واجهته — في شاشة واحدة
   ===================================================================== */

const dayFmt = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Riyadh' });
const timeFmt = new Intl.DateTimeFormat('ar-SA-u-nu-latn', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Riyadh' });
type Row = TimelineItem & { n: number; from: string };
const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date(iso));

export function PeopleTimeline({ initialUser, initialTimeline, initialPeople }: { initialUser: string | null; initialTimeline: Timeline | null; initialPeople: Person[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [people, setPeople] = useState(initialPeople);
  const [tl, setTl] = useState(initialTimeline);
  const [user, setUser] = useState(initialUser);
  const [days, setDays] = useState(7);
  const [only, setOnly] = useState<'all' | 'change' | 'event' | 'login'>('all');
  const [pending, start] = useTransition();

  useEffect(() => {
    const t = setTimeout(() => start(async () => setPeople(await trackPeople(q))), q ? 350 : 0);
    return () => clearTimeout(t);
  }, [q]);

  const open = (id: string, d = days) => {
    setUser(id);
    router.replace(`/staff/audit?tab=people&user=${id}`, { scroll: false });
    start(async () => setTl(await trackTimeline(id, d)));
  };

  const items = (tl?.items ?? []).filter((i) => only === 'all' || i.src === only);
  // التعديلات المتتالية من نفس النوع (حفظ نموذج = عشرات الأسئلة والخيارات) تُطوى في سطر واحد بعددها
  const seen = new Map<string, Row>();
  const byDay = items.reduce<Record<string, Row[]>>((acc, i) => {
    const list = (acc[dayKey(i.at)] ??= []);
    // نفس الإضافة/التعديل على نفس الجدول في نفس الدقيقة = عملية واحدة للمستخدم
    const key = i.src === 'change' ? `${i.action}|${i.table_name}|${i.at.slice(0, 16)}` : '';
    const prev = key ? seen.get(key) : undefined;
    if (prev) {
      prev.n++;
      prev.from = i.at;
    } else {
      const row = { ...i, n: 1, from: i.at };
      list.push(row);
      if (key) seen.set(key, row);
    }
    return acc;
  }, {});

  return (
    <div className={`grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)] ${pending ? 'opacity-80' : ''}`}>
      <aside className="space-y-3">
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم أو رقم أو اسم مستخدم" className="field ps-9" aria-label="بحث عن مستخدم" />
        </div>
        <p className="px-1 text-xs text-muted">{q ? 'نتائج البحث' : 'الأكثر مشاكل ونشاطًا مؤخرًا'}</p>
        <ul className="space-y-1.5">
          {people.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => open(p.id)} className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-start transition ${user === p.id ? 'border-board bg-board/[0.06]' : 'border-line bg-surface hover:border-board/30'}`}>
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brass-soft font-bold text-brass">{p.name.trim().charAt(0)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{p.name}</span>
                  <span className="block truncate text-xs text-muted">{ROLES[p.role] ?? p.role}{p.code ? ` · ${p.code}` : ''}{p.last_change ? ` · آخر تعديل ${relTime(p.last_change)}` : ''}</span>
                </span>
                {p.problems > 0 && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-bold text-danger tabular-nums">{p.problems}</span>}
              </button>
            </li>
          ))}
          {!people.length && <li className="rounded-2xl bg-paper px-3 py-6 text-center text-sm text-muted">لا نتائج</li>}
        </ul>
      </aside>

      <section className="min-w-0">
        {!tl ? (
          <div className="grid min-h-60 place-items-center rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
            <span><Icon name="user" className="mx-auto mb-2 size-8" />اختر مستخدمًا لترى خطه الزمني: دخوله، وكل تعديل قام به، وكل مشكلة واجهته.</span>
          </div>
        ) : (
          <>
            <div className="mb-4 rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-board text-lg font-bold text-chalk">{tl.user.name.trim().charAt(0)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold">{tl.user.name}</p>
                  <p className="text-sm text-muted">{ROLES[tl.user.role] ?? tl.user.role}{tl.user.code ? ` · ${tl.user.code}` : ''} · <bdi>{tl.user.username}</bdi>{tl.user.status !== 'active' ? ' · موقوف' : ''}</p>
                </div>
                <select value={days} onChange={(e) => { const d = Number(e.target.value); setDays(d); if (user) open(user, d); }} className="field w-auto py-2 text-sm" aria-label="المدة">
                  <option value={1}>آخر يوم</option><option value={7}>آخر 7 أيام</option><option value={30}>آخر 30 يومًا</option><option value={90}>آخر 90 يومًا</option>
                </select>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Mini label="مرات الدخول" value={tl.stats.logins} />
                <Mini label="دخول فاشل" value={tl.stats.failed_logins} warn={tl.stats.failed_logins > 0} />
                <Mini label="تعديلات على البيانات" value={tl.stats.changes} />
                <Mini label="مشاكل واجهها" value={tl.stats.problems} warn={tl.stats.problems > 0} />
              </div>
              {tl.stats.last_seen && <p className="mt-3 text-xs text-muted">آخر نشاط {relTime(tl.stats.last_seen)}</p>}
            </div>

            <div className="mb-3 flex gap-1 overflow-x-auto rounded-2xl bg-paper p-1 text-sm">
              {([['all', 'الكل'], ['change', 'التعديلات'], ['event', 'المشاكل والأحداث'], ['login', 'الدخول']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setOnly(k)} className={`whitespace-nowrap rounded-xl px-3 py-1.5 ${only === k ? 'bg-surface font-semibold text-board shadow-sm' : 'text-muted'}`}>{l}</button>
              ))}
            </div>

            {!items.length ? (
              <p className="rounded-2xl bg-paper px-4 py-10 text-center text-sm text-muted">لا شيء في هذه المدة.</p>
            ) : (
              <div className="space-y-5">
                {Object.entries(byDay).map(([day, list]) => (
                  <div key={day}>
                    <p className="mb-2 text-sm font-bold text-muted">{dayFmt.format(new Date(`${day}T12:00:00+03:00`))}</p>
                    <ol className="relative space-y-1 border-s-2 border-line ps-4">
                      {list.map((i, n) => <Item key={`${i.src}-${i.id ?? n}-${i.at}`} i={i} name={tl.user.name} />)}
                    </ol>
                  </div>
                ))}
                {tl.items.length >= 300 && <p className="text-center text-xs text-muted">تُعرض آخر 300 حركة — قلّل المدة لترى الأقدم بالتفصيل.</p>}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Mini({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${warn ? 'bg-danger-soft/60' : 'bg-paper'}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${warn ? 'text-danger' : ''}`}>{value.toLocaleString('en')}</p>
    </div>
  );
}

function Item({ i, name }: { i: Row; name: string }) {
  let icon: IconName = 'edit', tone = 'bg-board/10 text-board', title = '', sub = i.details ?? '';
  if (i.src === 'login') {
    const ok = i.action === 'auth.login';
    icon = 'logout'; tone = ok ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger';
    title = ok ? 'تسجيل دخول' : 'محاولة دخول فاشلة'; sub = i.ip ? `من الجهاز ${i.ip}` : '';
  } else if (i.src === 'change') {
    icon = i.action === 'DELETE' ? 'trash' : i.action === 'INSERT' ? 'plus' : 'edit';
    tone = i.action === 'DELETE' ? 'bg-danger-soft text-danger' : i.action === 'INSERT' ? 'bg-ok-soft text-ok' : 'bg-brass-soft text-brass';
    title = changeLabel(i.action, i.table_name) + (i.n > 1 ? ` ×${i.n}` : '');
    if (i.n > 1) sub = `${i.n} سجلات بين ${timeFmt.format(new Date(i.from))} و${timeFmt.format(new Date(i.at))}`;
  } else {
    const k = KIND[(i.kind ?? 'ok') as Kind] ?? KIND.ok;
    const dg = diagnose({ action: i.action, message: i.ev?.message, code: i.ev?.code, path: i.ev?.path, duration_ms: i.ev?.duration_ms, actor_name: name, details: i.ev?.details ?? {} });
    icon = i.kind === 'slow' ? 'clock' : i.kind === 'security' || i.kind === 'access' ? 'key' : 'alert';
    tone = k.tone; title = dg.title.replace(` — ${name}`, ''); sub = dg.cause ?? '';
  }
  return (
    <li className="relative flex items-start gap-3 rounded-xl px-2 py-1.5 hover:bg-paper/60">
      <span className={`absolute -start-[1.6rem] top-2 grid size-6 place-items-center rounded-full ring-4 ring-surface ${tone}`}><Icon name={icon} className="size-3.5" /></span>
      <span className="w-14 shrink-0 pt-0.5 text-xs text-muted tabular-nums">{timeFmt.format(new Date(i.at))}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-6">{title}</span>
        {sub && <span className="block break-words text-xs leading-5 text-muted">{sub}</span>}
      </span>
    </li>
  );
}
