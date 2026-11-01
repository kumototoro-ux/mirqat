'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { Field } from '@/components/sheet';
import { SettingsCard } from '@/components/settings/editors';
import {
  backupContext, backupRows, markBackup, purgeAuthUsers, purgeFiles, resetData, resetPreview,
  type BackupTable, type ResetDone, type ResetPart,
} from '@/lib/transfer/maintenance';
import { Stat, downloadBlob } from './kit';

/* =====================================================================
   النسخة الاحتياطية (ملف Excel مقروء لكل فرع أو للكل) والتصفير (للإدارة)
   ===================================================================== */

const SHEETS: { table: BackupTable; title: string }[] = [
  { table: 'students', title: 'الطلاب' },
  { table: 'employees', title: 'الموظفون' },
  { table: 'totals', title: 'مجاميع المواد' },
  { table: 'improvements', title: 'تحسين الدرجات' },
  { table: 'grades', title: 'الدرجات' },
  { table: 'assessments', title: 'المهام والنماذج' },
  { table: 'questions', title: 'أسئلة النماذج' },
  { table: 'attendance', title: 'التحضير' },
  { table: 'behavior', title: 'السلوك' },
  { table: 'content', title: 'المحتوى' },
  { table: 'settings', title: 'الإعدادات' },
];

const fmtAt = (iso: string) =>
  new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(new Date(iso));

export function DataPanel() {
  const ctx = useQuery({ queryKey: ['transfer-ctx'], queryFn: () => backupContext() });
  const c = ctx.data?.ok ? ctx.data.data : null;
  if (ctx.isLoading) return <div className="space-y-4">{[0, 1].map((i) => <div key={i} className="h-60 animate-pulse rounded-[1.4rem] bg-paper" />)}</div>;
  if (!c) return <p className="rounded-2xl border border-line bg-surface p-6 text-center text-muted">تعذّر التحميل</p>;
  return (
    <div className="space-y-5">
      <Backup branches={c.branches} school={c.school} last={c.lastBackup} />
      <Reset branches={c.branches} />
    </div>
  );
}

/* ------------------------------ النسخة الاحتياطية ------------------------------ */
function Backup({ branches, school, last }: { branches: { id: number; name: string }[]; school: string; last: { at: string; branch: number | null } | null }) {
  const { toast } = useFeedback();
  const qc = useQueryClient();
  const [scope, setScope] = useState('');
  const [progress, setProgress] = useState<{ sheet: string; rows: number; i: number } | null>(null);

  const run = async () => {
    const branch = scope ? Number(scope) : null;
    const bName = branch ? branches.find((b) => b.id === branch)?.name ?? '' : 'كل الفروع';
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'مِرقاة';
      wb.created = new Date();
      let total = 0;
      for (let i = 0; i < SHEETS.length; i++) {
        const s = SHEETS[i];
        if (s.table === 'employees' && branch) continue; // الموظفون في نسخة "كل الفروع"
        const rows: Record<string, unknown>[] = [];
        for (let off = 0; ; off += 2000) {
          setProgress({ sheet: s.title, rows: rows.length, i });
          const r = await backupRows(s.table, branch, off);
          if (!r.ok) throw new Error(`${s.title}: ${r.error}`);
          rows.push(...r.data);
          if (r.data.length < 2000) break;
        }
        // مجاميع المواد: الأنواع أعمدة
        const flat = s.table === 'totals'
          ? rows.map((x) => { const { ['الأنواع']: types, ...rest } = x as Record<string, unknown>; return { ...rest, ...(types as Record<string, unknown>) }; })
          : rows;
        let cols = [...new Set(flat.flatMap((x) => Object.keys(x)))];
        if (s.table === 'totals' && cols.includes('المجموع')) cols = [...cols.filter((k) => k !== 'المجموع'), 'المجموع'];
        const ws = wb.addWorksheet(s.title, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
        ws.columns = cols.map((k) => ({ header: k, key: k, width: Math.min(40, Math.max(12, k.length + 4)) }));
        ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF356854' } };
        ws.getRow(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        ws.getRow(1).height = 28;
        flat.forEach((x) => ws.addRow(x));
        total += flat.length;
      }
      const info = wb.addWorksheet('عن النسخة', { views: [{ rightToLeft: true }] });
      info.columns = [{ width: 24 }, { width: 50 }];
      [['المدرسة', school], ['النطاق', bName], ['التاريخ', fmtAt(new Date().toISOString())], ['عدد السجلات', String(total)], ['المصدر', 'منصة مِرقاة']].forEach((r) => info.addRow(r));
      wb.views = [{ x: 0, y: 0, width: 10000, height: 20000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];
      const buf = await wb.xlsx.writeBuffer();
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `نسخة-احتياطية-${bName.replace(/\s+/g, '-')}-${stamp}.xlsx`);
      await markBackup(branch);
      void qc.invalidateQueries({ queryKey: ['transfer-ctx'] });
      void qc.invalidateQueries({ queryKey: ['reset-preview'] });
      toast(`نُزّلت النسخة الاحتياطية (${total.toLocaleString('en')} سجل)`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'تعذّر إنشاء النسخة', 'error');
    } finally {
      setProgress(null);
    }
  };

  return (
    <SettingsCard title="النسخة الاحتياطية" description="ملف Excel واحد مقروء (بالأسماء لا بالأرقام): الطلاب، الموظفون، مجاميع المواد، تحسين الدرجات، كل الدرجات، المهام والنماذج وأسئلتها، التحضير، السلوك، المحتوى، والإعدادات.">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="النطاق" className="flex-1">
            <select value={scope} onChange={(e) => setScope(e.target.value)} disabled={!!progress} className="field">
              <option value="">كل الفروع (شامل الموظفين)</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <button type="button" onClick={run} disabled={!!progress} className="btn-primary sm:mb-0.5">
            {progress ? <span className="spinner" /> : <Icon name="download" className="size-4" />} تنزيل النسخة
          </button>
        </div>
        <AnimatePresence>
          {progress && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="space-y-2 rounded-2xl bg-paper p-3.5">
                <p className="text-sm">جارٍ تجهيز <b>{progress.sheet}</b> <span className="text-muted tabular-nums">({progress.rows.toLocaleString('en')} سجل)</span></p>
                <div className="h-1.5 overflow-hidden rounded-full bg-line">
                  <motion.div className="h-full rounded-full bg-gold" animate={{ width: `${((progress.i + 0.5) / SHEETS.length) * 100}%` }} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <p className="flex items-center gap-2 text-xs text-muted">
          <Icon name="clock" className="size-4" />
          {last ? <>آخر نسخة: <b className="text-ink">{fmtAt(last.at)}</b> — {last.branch ? branches.find((b) => b.id === last.branch)?.name : 'كل الفروع'}</> : 'لم تُنزَّل نسخة احتياطية بعد'}
        </p>
      </div>
    </SettingsCard>
  );
}

/* ------------------------------ التصفير ------------------------------ */
const PARTS: { key: ResetPart; title: string; hint: string; count: (p: Record<string, number | null>) => number | null; all?: boolean }[] = [
  { key: 'students', title: 'الطلاب وحساباتهم', hint: 'مع كل درجاتهم ومحاولاتهم وتسليماتهم وتحضيرهم وسلوكهم', count: (p) => p.students },
  { key: 'assessments', title: 'المهام والنماذج والرصد', hint: 'كل التقييمات وأسئلتها ومرفقاتها ودرجاتها', count: (p) => p.assessments },
  { key: 'conduct', title: 'التحضير والسلوك', hint: 'سجلات الحضور والملاحظات السلوكية', count: (p) => (p.attendance ?? 0) + (p.behavior ?? 0) },
  { key: 'content', title: 'الفيديوهات والإثراءات', hint: 'المحتوى ومرفقاته وسجل مشاهداته', count: (p) => p.content },
  { key: 'employees', title: 'الموظفون (عدا الإدارة)', hint: 'المعلمون وحساباتهم — لكل الفروع فقط', count: (p) => p.employees, all: true },
  { key: 'audit', title: 'سجل العمليات', hint: 'سجل النشاط القديم — لكل الفروع فقط', count: (p) => p.audit, all: true },
];

function Reset({ branches }: { branches: { id: number; name: string }[] }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { confirm, toast } = useFeedback();
  const [scope, setScope] = useState('');
  const [parts, setParts] = useState<ResetPart[]>(['students', 'assessments', 'conduct', 'content']);
  const [word, setWord] = useState('');
  const [phase, setPhase] = useState<{ label: string; done: number; total: number } | null>(null);
  const [result, setResult] = useState<ResetDone['counts'] | null>(null);
  const branch = scope ? Number(scope) : null;
  const pv = useQuery({ queryKey: ['reset-preview', branch], queryFn: () => resetPreview(branch) });
  const p = pv.data?.ok ? pv.data.data : null;
  const last = p?.last_backup;
  const fresh = !!last?.at && Date.now() - new Date(last.at).getTime() < 24 * 3600 * 1000 && (last.branch == null || last.branch === branch);
  const allowed = PARTS.filter((x) => !x.all || !branch);
  const chosen = parts.filter((k) => allowed.some((a) => a.key === k));
  const ready = fresh && chosen.length > 0 && word.trim() === 'تصفير' && !phase;

  const toggle = (k: ResetPart) => setParts((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  const go = async () => {
    const scopeName = branch ? branches.find((b) => b.id === branch)?.name : 'كل الفروع';
    const ok = await confirm({
      title: 'تصفير نهائي لا يمكن التراجع عنه؟',
      body: (
        <>
          <b className="text-danger">{scopeName}</b>: {chosen.map((k) => PARTS.find((x) => x.key === k)!.title).join('، ')}.
          <br />تبقى الإعدادات والبنية الدراسية (الفروع والصفوف والمواد والجداول) وحسابات الإدارة.
        </>
      ),
      confirmLabel: 'تصفير الآن',
      danger: true,
    });
    if (!ok) return;
    setPhase({ label: 'حذف البيانات', done: 0, total: 1 });
    const r = await resetData(branch, chosen, word.trim());
    if (!r.ok) {
      setPhase(null);
      return toast(r.error, 'error');
    }
    // حسابات الدخول ثم الملفات — على دفعات مع تقدّم ظاهر
    const users = r.data.users;
    for (let i = 0; i < users.length; i += 50) {
      setPhase({ label: 'حذف حسابات الدخول', done: i, total: users.length });
      await purgeAuthUsers(users.slice(i, i + 50));
    }
    for (const bucket of ['task-files', 'submissions'] as const) {
      const files = r.data.files[bucket] ?? [];
      for (let i = 0; i < files.length; i += 150) {
        setPhase({ label: 'حذف الملفات المرفوعة', done: i, total: files.length });
        await purgeFiles(bucket, files.slice(i, i + 150));
      }
    }
    setPhase(null);
    setWord('');
    setResult({ ...r.data.counts, accounts: users.length });
    void qc.invalidateQueries({ queryKey: ['reset-preview'] });
    router.refresh();
    toast('اكتمل التصفير');
  };

  return (
    <section className="overflow-hidden rounded-[1.4rem] border-2 border-danger/25 bg-surface">
      <header className="flex items-start gap-3 bg-danger/5 px-5 py-4 sm:px-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger/10 text-danger"><Icon name="alert" className="size-5" /></span>
        <div>
          <h2 className="font-bold text-danger">تصفير البيانات</h2>
          <p className="text-sm text-muted">لبدء فصل دراسي جديد على نظام نظيف. يتطلب نسخة احتياطية لنفس النطاق خلال آخر 24 ساعة.</p>
        </div>
      </header>
      <div className="space-y-4 p-5 sm:p-6">
        <Field label="النطاق">
          <select value={scope} onChange={(e) => { setScope(e.target.value); setResult(null); }} disabled={!!phase} className="field">
            <option value="">كل الفروع</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>

        <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${fresh ? 'bg-ok-soft text-ok' : 'bg-brass-soft text-brass'}`}>
          <Icon name={fresh ? 'check' : 'clock'} className="size-4 shrink-0" />
          {fresh ? <>نسخة احتياطية حديثة: {fmtAt(last!.at)}</> : <>نزّل نسخة احتياطية لهذا النطاق أولًا من البطاقة السابقة</>}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {allowed.map((x) => {
            const on = parts.includes(x.key);
            const n = p ? x.count(p as unknown as Record<string, number | null>) : null;
            return (
              <button key={x.key} type="button" onClick={() => toggle(x.key)} disabled={!!phase} aria-pressed={on}
                className={`flex items-start gap-3 rounded-2xl border p-3 text-start transition-colors ${on ? 'border-danger/40 bg-danger/5' : 'border-line hover:border-muted'}`}>
                <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border ${on ? 'border-danger bg-danger text-white' : 'border-line'}`}>{on && <Icon name="check" className="size-3.5" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                    {x.title}
                    {pv.isLoading ? <span className="skeleton h-4 w-10" /> : n != null && <span className="tabular-nums text-xs text-muted">{n.toLocaleString('en')}</span>}
                  </span>
                  <span className="block text-xs text-muted">{x.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        <Field label="اكتب كلمة «تصفير» للتأكيد">
          <input value={word} onChange={(e) => setWord(e.target.value)} disabled={!fresh || !!phase} className="field" placeholder="تصفير" autoComplete="off" />
        </Field>

        <AnimatePresence>
          {phase && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="space-y-2 rounded-2xl bg-paper p-3.5">
                <p className="flex items-center gap-2 text-sm"><span className="spinner" /> {phase.label} <span className="tabular-nums text-muted">{phase.total > 1 ? `${phase.done.toLocaleString('en')} / ${phase.total.toLocaleString('en')}` : ''}</span></p>
                <div className="h-1.5 overflow-hidden rounded-full bg-line"><motion.div className="h-full rounded-full bg-danger" animate={{ width: `${phase.total > 1 ? (phase.done / phase.total) * 100 : 40}%` }} /></div>
                <p className="text-xs text-muted">لا تغلق الصفحة حتى ينتهي.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {result && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries({ students: 'طلاب', accounts: 'حسابات', assessments: 'تقييمات', grades: 'درجات', attendance: 'تحضير', behavior: 'سلوك', content: 'محتوى', employees: 'موظفون', audit: 'سجل' } as Record<string, string>)
              .filter(([k]) => result[k] != null)
              .map(([k, l]) => <Stat key={k} label={`حُذف: ${l}`} value={result[k]} tone="danger" />)}
          </motion.div>
        )}

        <button type="button" onClick={go} disabled={!ready} className="btn-primary w-full bg-danger py-3 hover:bg-danger/90 disabled:opacity-50 sm:w-auto">
          <Icon name="trash" className="size-4" /> تصفير {chosen.length ? `(${chosen.length})` : ''}
        </button>
      </div>
    </section>
  );
}
