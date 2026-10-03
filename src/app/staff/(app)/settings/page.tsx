import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Badge, Card, PageHeader, PreviewNote } from '@/components/ui';
import { fmtNum } from '@/lib/format';

export const metadata: Metadata = { title: 'الإعدادات العامة' };

const SETTING_LABELS: Record<string, string> = {
  school_name: 'اسم المدرسة',
  school_logo_url: 'رابط شعار المدرسة',
  results_visible_grades: 'الصفوف التي تظهر لها النتائج',
  weekly_grades_visibility: 'إظهار الدرجات الأسبوعية',
  show_exam_schedule: 'إظهار جدول الاختبارات',
  calendar_visibility: 'إظهار التقويم',
  exam_visibility: 'إظهار الاختبارات',
  announcements: 'إعلانات الصفحة الرئيسية',
};

function show(v: unknown): string {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join('، ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export default async function SettingsPage() {
  await requireUser(['admin']);
  const supabase = await createClient();
  const [settings, branches, stages, grades, sections, subjects, evalTypes, weights, attStatuses, behStatuses, matrix] = await Promise.all([
    supabase.from('app_settings').select('key, value, is_public').order('key'),
    supabase.from('branches').select('id, name, is_active').order('sort_order'),
    supabase.from('stages').select('id, name').order('sort_order'),
    supabase.from('grades').select('id, name, stage:stages(name)').order('sort_order').returns<{ id: number; name: string; stage: { name: string } | null }[]>(),
    supabase.from('sections').select('id, name').order('sort_order'),
    supabase.from('subjects').select('id, name, is_active').order('sort_order'),
    supabase.from('eval_types').select('id, name, category').order('sort_order'),
    supabase.from('grade_weights').select('weight, subject:subjects(name), eval_type:eval_types(name)').returns<{ weight: number; subject: { name: string } | null; eval_type: { name: string } | null }[]>(),
    supabase.from('attendance_statuses').select('id, name').order('sort_order'),
    supabase.from('behavior_statuses').select('id, name').order('sort_order'),
    supabase.from('subject_matrix').select('id', { count: 'exact', head: true }),
  ]);

  const lists: { title: string; items: { key: string | number; label: string; muted?: boolean }[] }[] = [
    { title: 'الفروع', items: (branches.data ?? []).map((b) => ({ key: b.id, label: b.name, muted: !b.is_active })) },
    { title: 'المراحل', items: (stages.data ?? []).map((s) => ({ key: s.id, label: s.name })) },
    { title: 'الصفوف', items: (grades.data ?? []).map((g) => ({ key: g.id, label: `${g.name}${g.stage ? ' ' + g.stage.name : ''}` })) },
    { title: 'الشعب', items: (sections.data ?? []).map((s) => ({ key: s.id, label: s.name })) },
    { title: 'المواد', items: (subjects.data ?? []).map((s) => ({ key: s.id, label: s.name, muted: !s.is_active })) },
    { title: 'أنواع التقييم', items: (evalTypes.data ?? []).map((e) => ({ key: e.id, label: `${e.name}${e.category === 'exam' ? ' (اختبار)' : ''}` })) },
    { title: 'حالات الحضور', items: (attStatuses.data ?? []).map((s) => ({ key: s.id, label: s.name })) },
    { title: 'حالات السلوك', items: (behStatuses.data ?? []).map((s) => ({ key: s.id, label: s.name })) },
  ];

  const bySubject = new Map<string, { type: string; w: number }[]>();
  (weights.data ?? []).forEach((w) => {
    const k = w.subject?.name ?? '—';
    bySubject.set(k, [...(bySubject.get(k) ?? []), { type: w.eval_type?.name ?? '—', w: Number(w.weight) }]);
  });

  return (
    <>
      <PageHeader title="الإعدادات العامة" lead="القوائم المرجعية وإعدادات النظام كما نُقلت من الشيت." />
      <PreviewNote>للعرض الآن. التعديل من هنا يأتي مع شاشات الإعدادات.</PreviewNote>
      <div className="space-y-6">
        <Card title="إعدادات النظام" pad={false}>
          <dl className="divide-y divide-line">
            {(settings.data ?? []).map((s) => (
              <div key={s.key} className="grid gap-1 px-5 py-3 sm:grid-cols-[16rem_1fr] sm:gap-4">
                <dt className="text-sm">
                  <span className="font-medium">{SETTING_LABELS[s.key] ?? s.key}</span>
                  {s.is_public && <span className="ms-2"><Badge tone="board">عام</Badge></span>}
                </dt>
                <dd className="break-words text-sm text-muted">{show(s.value)}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {lists.map((l) => (
            <Card key={l.title} title={<>{l.title} <span className="text-sm font-normal text-muted">({fmtNum(l.items.length)})</span></>}>
              {l.items.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {l.items.map((i) => (
                    <li key={i.key}><Badge tone={i.muted ? 'neutral' : 'board'}>{i.label}{i.muted ? ' (معطّل)' : ''}</Badge></li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">فارغة</p>
              )}
            </Card>
          ))}
        </div>

        <Card title={<>توزيع الدرجات <span className="text-sm font-normal text-muted">· توزيع المواد على الفصول: {fmtNum(matrix.count ?? 0)} صف</span></>}>
          {bySubject.size === 0 ? (
            <p className="text-sm text-muted">لا أوزان بعد.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...bySubject.entries()].map(([subject, ws]) => {
                const total = ws.reduce((a, w) => a + w.w, 0);
                return (
                  <div key={subject} className="rounded-xl border border-line p-3">
                    <p className="mb-2 flex justify-between text-sm font-semibold">
                      {subject}
                      <span className={total === 100 ? 'text-ok' : 'text-danger'}>{fmtNum(total)}%</span>
                    </p>
                    <div className="flex h-2.5 overflow-hidden rounded-full bg-paper">
                      {ws.map((w, i) => (
                        <span key={i} className="h-full border-s border-surface first:border-0" style={{ width: `${w.w}%`, background: `hsl(${150 + i * 38} 32% ${38 + i * 6}%)` }} title={`${w.type}: ${w.w}%`} />
                      ))}
                    </div>
                    <ul className="mt-2 space-y-0.5 text-xs text-muted">
                      {ws.map((w, i) => (
                        <li key={i} className="flex justify-between"><span>{w.type}</span><span className="tabular-nums">{fmtNum(w.w)}%</span></li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
