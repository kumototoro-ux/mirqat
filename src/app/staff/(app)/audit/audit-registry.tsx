'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BulkButton, Registry } from '@/components/registry/registry';
import type { PageParams, PageResult } from '@/components/registry/types';
import { Insights } from '@/components/registry/insights';
import { downloadCsv } from '@/components/registry/csv';
import { Badge } from '@/components/ui';
import { Icon } from '@/components/shell/icons';
import { Sheet } from '@/components/sheet';
import { fmtDateTime } from '@/lib/format';
import { getAuditEntry, listAudit, type AuditRow } from './actions';

export type ActivityReport = {
  totals: { all: number; today: number; week: number; prev_week: number; logins_week: number; deletes_week: number; actors_week: number };
  by_table: { name: string; count: number }[];
};

export const TABLES: Record<string, string> = {
  students: 'الطلاب', employees: 'الموظفون', profiles: 'الحسابات', assessments: 'المهام والنماذج',
  grade_entries: 'الرصد', attendance_records: 'التحضير', behavior_records: 'السلوك', staff_scope: 'نطاقات المعلمين',
  timetable_slots: 'جدول الحصص', exam_schedule: 'الاختبارات', calendar_entries: 'التقويم', app_settings: 'الإعدادات',
  form_details: 'النماذج', form_questions: 'أسئلة النماذج', content_items: 'المحتوى', period_links: 'ربط الحصص',
  question_options: 'خيارات الأسئلة', form_attempts: 'محاولات النماذج', grade_visibility: 'ظهور الدرجات',
};
const OPS: Record<string, { label: string; tone: 'ok' | 'gold' | 'danger' | 'board' }> = {
  INSERT: { label: 'إضافة', tone: 'ok' },
  UPDATE: { label: 'تعديل', tone: 'gold' },
  DELETE: { label: 'حذف', tone: 'danger' },
  'تسجيل دخول': { label: 'تسجيل دخول', tone: 'board' },
};
const FIELD: Record<string, string> = {
  name_ar: 'الاسم', name_en: 'الاسم بالإنجليزي', national_id: 'الهوية', code: 'الرقم', status: 'الحالة', class_id: 'الفصل',
  fee_status: 'الرسوم', gender: 'الجنس', nationality: 'الجنسية', birth_date: 'الميلاد', is_active: 'نشط', user_type: 'النوع',
  job_role: 'المسمى', role: 'الدور', username: 'اسم المستخدم', must_change_password: 'كلمة مؤقتة', title: 'العنوان',
  score: 'الدرجة', max_score: 'الدرجة العظمى', value: 'القيمة', key: 'المفتاح', due_at: 'التسليم', is_edited: 'تم التعديل',
};
const HIDDEN = new Set(['created_at', 'updated_at', 'id', 'source_row', 'source_sheet', 'legacy_password_hash']);

function show(v: unknown) {
  if (v === null || v === undefined || v === '') return <span className="text-muted">—</span>;
  if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
  if (typeof v === 'object') return <code className="text-xs" dir="ltr">{JSON.stringify(v)}</code>;
  return String(v);
}

function Changes({ id, action }: { id: number; action: string }) {
  const { data, isPending } = useQuery({ queryKey: ['audit-entry', id], queryFn: () => getAuditEntry(id), staleTime: Infinity });
  if (isPending) return <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-10" />)}</div>;
  if (!data || (!data.old_data && !data.new_data)) return <p className="rounded-xl bg-paper p-4 text-sm text-muted">لا تفاصيل بيانات لهذه الحركة.</p>;
  const o = data.old_data ?? {};
  const n = data.new_data ?? {};
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter((k) => !HIDDEN.has(k));
  const changed = action === 'UPDATE' ? keys.filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k])) : keys;
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <table className="w-full text-sm">
        <thead className="bg-paper/70 text-xs text-muted">
          <tr>
            <th className="px-3 py-2.5 text-start font-semibold">الحقل</th>
            {action !== 'INSERT' && <th className="px-3 py-2.5 text-start font-semibold">قبل</th>}
            {action !== 'DELETE' && <th className="px-3 py-2.5 text-start font-semibold">بعد</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {changed.map((k) => (
            <tr key={k}>
              <td className="px-3 py-2.5 font-medium">{FIELD[k] ?? k}</td>
              {action !== 'INSERT' && <td className="px-3 py-2.5 text-danger/90 line-through decoration-danger/40">{show(o[k])}</td>}
              {action !== 'DELETE' && <td className="px-3 py-2.5 font-medium text-ok">{show(n[k])}</td>}
            </tr>
          ))}
          {changed.length === 0 && <tr><td className="px-3 py-4 text-muted" colSpan={3}>لا اختلاف في الحقول.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function AuditRegistry({ initial, initialParams, report }: { initial: PageResult<AuditRow>; initialParams: PageParams; report: ActivityReport | null }) {
  const [open, setOpen] = useState<AuditRow | null>(null);
  const t = report?.totals;
  const op = (a: string) => OPS[a] ?? { label: a, tone: 'board' as const };

  return (
    <>
      {t ? (
        <Insights
          stats={[
            { label: 'حركات اليوم', value: t.today, icon: 'audit' },
            { label: 'حركات آخر 7 أيام', value: t.week, icon: 'calendar', delta: { now: t.week, before: t.prev_week } },
            { label: 'دخول الموظفين (7 أيام)', value: t.logins_week, icon: 'logout', hint: `${t.actors_week} مستخدم نشط` },
            { label: 'عمليات حذف (7 أيام)', value: t.deletes_week, icon: 'trash', tone: t.deletes_week ? 'danger' : undefined },
          ]}
          donut={{
            title: 'النشاط حسب القسم',
            caption: 'آخر 7 أيام',
            unit: 'حركة',
            items: (report?.by_table ?? []).map((x) => ({ name: TABLES[x.name] ?? x.name, value: x.count })),
          }}
        />
      ) : (
        <p className="mb-5 rounded-xl bg-brass-soft/60 px-4 py-3 text-sm text-brass">تعذّر تحميل ملخص النشاط. السجل نفسه يعمل أدناه.</p>
      )}

      <Registry<AuditRow>
        queryKey="audit"
        title="سجل النشاط"
        fetchPage={listAudit}
        initial={initial}
        initialParams={initialParams}
        rowKey={(r) => r.id}
        onRowClick={setOpen}
        searchPlaceholder="الشخص أو رمزه أو التفاصيل"
        emptyTitle="لا حركات مطابقة"
        icon="audit"
        sorts={[{ value: 'newest', label: 'الأحدث أولًا' }, { value: 'oldest', label: 'الأقدم أولًا' }]}
        filters={[
          { key: 'period', label: 'الفترة', options: [{ value: 'today', label: 'اليوم' }, { value: 'week', label: 'آخر 7 أيام' }, { value: 'month', label: 'آخر 30 يومًا' }] },
          { key: 'action', label: 'الحركة', options: Object.entries(OPS).map(([v, o]) => ({ value: v, label: o.label })) },
          { key: 'table', label: 'القسم', options: Object.entries(TABLES).map(([v, l]) => ({ value: v, label: l })) },
        ]}
        toolbar={
          <Link href="/staff/reports/activity" className="btn h-11 rounded-xl border border-line bg-surface px-3.5 hover:border-board/40 hover:text-board">
            <Icon name="results" className="size-4" /> التقرير
          </Link>
        }
        bulkActions={(rows) => (
          <BulkButton onClick={() => downloadCsv('سجل-النشاط', ['الوقت', 'الشخص', 'الرمز', 'الحركة', 'القسم', 'التفاصيل'], rows.map((r) => [fmtDateTime(r.occurred_at), r.actor_name ?? 'النظام', r.actor_code, op(r.action).label, r.table_name ? (TABLES[r.table_name] ?? r.table_name) : '', r.details]))}>
            <Icon name="audit" className="size-4" /> تصدير
          </BulkButton>
        )}
        columns={[
          {
            key: 'who',
            label: 'الشخص',
            render: (r) => (
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-board/10 font-bold text-board">{(r.actor_name ?? 'ن').trim().charAt(0)}</span>
                <div className="min-w-0">
                  <p className="max-w-52 truncate font-semibold">{r.actor_name ?? 'النظام'}</p>
                  <p className="text-xs text-muted"><bdi>{r.actor_code ?? '—'}</bdi></p>
                </div>
              </div>
            ),
          },
          { key: 'op', label: 'الحركة', render: (r) => <Badge tone={op(r.action).tone}>{op(r.action).label}</Badge> },
          { key: 'table', label: 'القسم', render: (r) => (r.table_name ? TABLES[r.table_name] ?? r.table_name : '—') },
          { key: 'details', label: 'التفاصيل', render: (r) => <span className="block max-w-80 truncate text-muted">{r.details ?? (r.record_id ? `سجل #${r.record_id}` : '—')}</span> },
          { key: 'time', label: 'الوقت', render: (r) => <span className="whitespace-nowrap text-xs text-muted">{fmtDateTime(r.occurred_at)}</span> },
        ]}
        mobileCard={(r) => (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge tone={op(r.action).tone}>{op(r.action).label}</Badge>
              <span className="truncate text-sm font-semibold">{r.table_name ? TABLES[r.table_name] ?? r.table_name : ''}</span>
            </div>
            <p className="mt-1 truncate text-sm">{r.actor_name ?? 'النظام'}</p>
            <p className="text-xs text-muted">{fmtDateTime(r.occurred_at)}</p>
          </div>
        )}
      />

      <Sheet
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open ? `${op(open.action).label}${open.table_name ? ` · ${TABLES[open.table_name] ?? open.table_name}` : ''}` : ''}
        subtitle={open ? `${open.actor_name ?? 'النظام'} · ${fmtDateTime(open.occurred_at)}` : undefined}
      >
        {open && (
          <div className="space-y-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 rounded-2xl bg-paper p-4 text-sm">
              <dt className="text-muted">الشخص</dt><dd className="font-semibold">{open.actor_name ?? 'النظام'} {open.actor_code && <bdi className="text-muted">({open.actor_code})</bdi>}</dd>
              <dt className="text-muted">الدور</dt><dd>{open.actor_role ?? '—'}</dd>
              <dt className="text-muted">الوقت</dt><dd>{fmtDateTime(open.occurred_at)}</dd>
              {open.record_id && (<><dt className="text-muted">رقم السجل</dt><dd><bdi>{open.record_id}</bdi></dd></>)}
              {open.details && (<><dt className="text-muted">التفاصيل</dt><dd>{open.details}</dd></>)}
            </dl>
            {['INSERT', 'UPDATE', 'DELETE'].includes(open.action) && (
              <>
                <h3 className="font-bold">{open.action === 'UPDATE' ? 'ما الذي تغيّر' : open.action === 'INSERT' ? 'البيانات المضافة' : 'البيانات المحذوفة'}</h3>
                <Changes id={open.id} action={open.action} />
              </>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}
