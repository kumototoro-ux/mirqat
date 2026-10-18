'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { getPurgeStats, purgeGradedNow, savePurgeSettings, type PurgeStats } from '@/lib/assess/actions';
import { fmtBytes } from '@/lib/assess/shared';
import { Switch } from './kit';

const HOURS = [24, 48, 72, 168];
const label = (h: number) => (h === 168 ? 'أسبوع' : h === 24 ? '24 ساعة' : `${h} ساعة`);

/** الإعدادات العامة ← ملفات التسليم: الحذف التلقائي بعد التصحيح + حذف يدوي فوري */
export function PurgeSettings() {
  const { toast, confirm } = useFeedback();
  const [stats, setStats] = useState<PurgeStats | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [hours, setHours] = useState(48);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const s = await getPurgeStats();
    if (s) {
      setStats(s);
      setEnabled(s.settings.enabled !== false);
      setHours(Number(s.settings.hours) || 48);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const save = async (e: boolean, h: number) => {
    const ok = await confirm({
      title: e ? `تفعيل الحذف التلقائي بعد ${label(h)}؟` : 'إيقاف الحذف التلقائي؟',
      body: e ? 'تُحذف صور وملفات التسليم بعد مرور المدة على تصحيحها. النصوص والدرجات والملاحظات لا تُحذف أبدًا.' : 'تبقى كل ملفات التسليم حتى تحذفها يدويًا. انتبه لمساحة التخزين المجانية (1 جيجابايت).',
      confirmLabel: e ? 'تفعيل' : 'إيقاف',
      danger: !e,
    });
    if (!ok) return;
    setBusy('save');
    const res = await savePurgeSettings(e, h);
    setBusy(null);
    if (!res.ok) return toast(res.error, 'error');
    setEnabled(e);
    setHours(h);
    toast(res.message);
  };

  const purge = async () => {
    if (!stats?.graded_files) return toast('لا ملفات مصحّحة للحذف', 'info');
    const ok = await confirm({
      title: `حذف ${stats.graded_files} ملف مصحّح الآن؟`,
      body: <>يُوفّر <b className="text-ink">{fmtBytes(stats.graded_bytes)}</b>. تُحذف ملفات وصور التسليمات التي صُحّحت فقط — التسليمات غير المصحّحة لا تُمس، والنصوص والدرجات تبقى. لا يمكن التراجع.</>,
      confirmLabel: 'حذف الآن',
      danger: true,
    });
    if (!ok) return;
    setBusy('purge');
    const res = await purgeGradedNow();
    setBusy(null);
    if (!res.ok) return toast(res.error, 'error');
    toast(res.message);
    load();
  };

  const quota = 1024 * 1024 * 1024;
  const used = stats?.stored_bytes ?? 0;
  return (
    <>
      <p className="-mt-2 text-sm leading-relaxed text-muted">
        صور وملفات تسليم المهام تشغل مساحة التخزين. بعد تصحيحها لا حاجة لها غالبًا، فتُحذف تلقائيًا ويبقى جواب الطالب النصي ودرجته وملاحظة المعلم.
      </p>

      <section className="rounded-[1.4rem] border border-line bg-surface p-5">
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="ملفات مخزّنة" value={stats ? String(stats.stored_files) : null} hint={stats ? fmtBytes(stats.stored_bytes) : ''} />
          <Stat label="مصحّحة تنتظر الحذف" value={stats ? String(stats.graded_files) : null} hint={stats ? fmtBytes(stats.graded_bytes) : ''} tone="gold" />
          <Stat label="حُذفت حتى الآن" value={stats ? String(stats.purged_files) : null} hint="ملف" />
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-xs text-muted">
            <span>من مساحة التخزين المجانية</span>
            <span className="tabular-nums" dir="ltr">{fmtBytes(used)} / 1 GB</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-paper">
            <div className="h-full origin-right animate-grow rounded-full bg-board" style={{ width: `${Math.max(1, Math.min(100, (used / quota) * 100))}%` }} />
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-[1.4rem] border border-line bg-surface p-5">
        <Switch checked={enabled} onChange={(v) => save(v, hours)} disabled={busy === 'save'} label="حذف ملفات التسليم تلقائيًا بعد التصحيح" hint="يعمل مرة كل يوم: كل ملف مضى على تصحيحه المدة المحددة يُحذف." />
        {enabled && (
          <div className="flex flex-wrap items-center gap-2 px-1">
            <span className="text-sm text-muted">بعد</span>
            {HOURS.map((h) => (
              <button key={h} type="button" onClick={() => h !== hours && save(true, h)} className={`rounded-full px-3.5 py-1.5 text-sm transition-all ${h === hours ? 'bg-board text-chalk' : 'bg-paper hover:bg-board/10'}`}>
                {label(h)}
              </button>
            ))}
            <span className="text-sm text-muted">من التصحيح</span>
          </div>
        )}
      </section>

      <section className="flex flex-wrap items-center gap-4 rounded-[1.4rem] border border-danger/20 bg-danger-soft/30 p-5">
        <div className="min-w-0 flex-1">
          <p className="font-bold">حذف يدوي الآن</p>
          <p className="mt-0.5 text-sm text-muted">يحذف فورًا كل ملفات وصور التسليمات المصحّحة، بغض النظر عن المدة.</p>
        </div>
        <button type="button" onClick={purge} disabled={busy === 'purge' || !stats} className="btn-danger">
          {busy === 'purge' ? <span className="spinner" /> : <Icon name="trash" className="size-4" />} حذف المصحّح الآن
        </button>
      </section>
    </>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string | null; hint: string; tone?: 'gold' }) {
  return (
    <div className="rounded-2xl bg-paper/60 p-3">
      {value == null ? <div className="skeleton mx-auto h-8 w-12" /> : <p className={`text-2xl font-bold tabular-nums ${tone === 'gold' ? 'text-brass' : ''}`}>{value}</p>}
      <p className="mt-1 text-xs text-muted">{label}</p>
      <p className="text-[0.7rem] text-muted/80">{hint}</p>
    </div>
  );
}
