import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Badge, Card, Empty, PageHeader, StatGrid } from '@/components/ui';
import { CLASS_SELECT, classLabel, fmtDate, fmtDateTime, fmtNum, scoreTone, type ClassRef } from '@/lib/format';
import { getCurrentTermId, getTerms } from '@/lib/data';
import { subjectColor } from '@/components/timetable-grid';

export const metadata: Metadata = { title: 'ملف الطالب' };

type Student = {
  id: number;
  code: string;
  national_id: string | null;
  name_ar: string;
  name_en: string | null;
  nationality: string | null;
  birth_date: string | null;
  birth_date_text: string | null;
  gender: string | null;
  fee_status: string | null;
  status: string;
  enrolled_at: string | null;
  created_at: string;
  class: ClassRef;
  profile: { username: string; status: string; must_change_password: boolean; last_login_at: string | null }[];
};

type Entry = {
  id: number;
  score: number;
  max_score: number;
  source: 'manual' | 'form' | 'auto_absent';
  recorded_at: string;
  assessment: { title: string; kind: string; subject: { name: string } | null; eval_type: { name: string } | null } | null;
};

export default async function StudentProfile({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ term?: string }>;
}) {
  await requireUser(['admin']);
  const { id } = await params;
  const sp = await searchParams;
  const studentId = Number(id);
  if (!Number.isInteger(studentId)) notFound();

  const supabase = await createClient();
  const [{ data: s }, terms, currentTerm] = await Promise.all([
    supabase
      .from('students')
      .select(
        `id, code, national_id, name_ar, name_en, nationality, birth_date, birth_date_text, gender, fee_status, status, enrolled_at, created_at,
         class:classes(${CLASS_SELECT}), profile:profiles(username, status, must_change_password, last_login_at)`,
      )
      .eq('id', studentId)
      .maybeSingle<Student>(),
    getTerms(),
    getCurrentTermId(),
  ]);
  if (!s) notFound();
  const termId = Number(sp.term) || currentTerm;

  const [{ data: totals }, { data: entries }, { data: attendance }, { data: subjects }] = await Promise.all([
    supabase.from('grade_totals').select('subject_id, total, is_visible').eq('student_id', studentId).eq('term_id', termId ?? -1),
    supabase
      .from('grade_entries')
      .select('id, score, max_score, source, recorded_at, assessment:assessments(title, kind, subject:subjects(name), eval_type:eval_types(name))')
      .eq('student_id', studentId)
      .order('recorded_at', { ascending: false })
      .limit(12)
      .returns<Entry[]>(),
    supabase.from('attendance_records').select('status:attendance_statuses(name)').eq('student_id', studentId).returns<{ status: { name: string } | null }[]>(),
    supabase.from('subjects').select('id, name'),
  ]);

  const att = new Map<string, number>();
  (attendance ?? []).forEach((a) => att.set(a.status?.name ?? '—', (att.get(a.status?.name ?? '—') ?? 0) + 1));
  const subjectName = (sid: number) => subjects?.find((x) => x.id === sid)?.name ?? '—';
  const acc = s.profile?.[0];
  const avg = totals?.length ? totals.reduce((a, t) => a + Number(t.total), 0) / totals.length : null;

  const info: [string, React.ReactNode][] = [
    ['رقم الطالب', <bdi key="c">{s.code}</bdi>],
    ['رقم الهوية', s.national_id ? <bdi key="n">{s.national_id}</bdi> : '—'],
    ['الاسم بالإنجليزي', s.name_en ?? '—'],
    ['الجنسية', s.nationality ?? '—'],
    ['تاريخ الميلاد', s.birth_date ? fmtDate(s.birth_date) : (s.birth_date_text ?? '—')],
    ['الجنس', s.gender ?? '—'],
    ['الرسوم', s.fee_status ?? '—'],
    ['تاريخ التسجيل', s.enrolled_at ? fmtDate(s.enrolled_at) : 'قبل النظام الجديد'],
  ];

  return (
    <>
      <Link href="/staff/students" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-board">
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        الطلاب
      </Link>
      <PageHeader
        title={s.name_ar}
        lead={`${classLabel(s.class, true)}`}
        actions={<Badge tone={s.status === 'active' ? 'ok' : 'danger'}>{s.status === 'active' ? 'منتظم' : s.status === 'withdrawn' ? 'منسحب' : 'متخرج'}</Badge>}
      />

      <div className="space-y-6">
        <StatGrid
          items={[
            { label: 'متوسط المواد', value: avg != null ? fmtNum(avg, 1) : '—', hint: terms.find((t) => t.id === termId)?.name },
            { label: 'مواد مرصودة', value: fmtNum(totals?.length ?? 0) },
            { label: 'سجلات التحضير', value: fmtNum(attendance?.length ?? 0) },
            {
              label: 'غياب',
              value: fmtNum([...att.entries()].filter(([k]) => /غائب|غياب/.test(k)).reduce((a, [, n]) => a + n, 0)),
              tone: 'danger',
            },
          ]}
        />

        <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
          <div className="space-y-6">
            <Card title="البيانات الأساسية">
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
                {info.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted">{k}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            <Card title="حساب الدخول">
              {acc ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
                  <dt className="text-muted">اسم المستخدم</dt>
                  <dd className="font-medium"><bdi>{acc.username}</bdi></dd>
                  <dt className="text-muted">الحالة</dt>
                  <dd>
                    <Badge tone={acc.status !== 'active' ? 'danger' : acc.must_change_password ? 'gold' : 'ok'}>
                      {acc.status !== 'active' ? 'موقوف' : acc.must_change_password ? 'بكلمة مؤقتة' : 'مفعّل'}
                    </Badge>
                  </dd>
                  <dt className="text-muted">آخر دخول</dt>
                  <dd>{acc.last_login_at ? fmtDateTime(acc.last_login_at) : 'لم يدخل بعد'}</dd>
                </dl>
              ) : (
                <p className="text-sm text-muted">لا حساب دخول لهذا الطالب.</p>
              )}
            </Card>
          </div>

          <div className="space-y-6">
            <Card
              title="النتائج"
              action={
                <form className="flex items-center gap-2">
                  <select name="term" defaultValue={termId ?? ''} className="field w-auto py-1 text-sm">
                    {terms.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} {t.year}</option>
                    ))}
                  </select>
                  <button className="btn-quiet px-3 py-1 text-xs">عرض</button>
                </form>
              }
            >
              {!totals?.length ? (
                <p className="text-sm text-muted">لا درجات في هذا الفصل الدراسي.</p>
              ) : (
                <ul className="space-y-3">
                  {totals
                    .sort((a, b) => Number(b.total) - Number(a.total))
                    .map((t) => {
                      const v = Number(t.total);
                      const name = subjectName(t.subject_id);
                      return (
                        <li key={t.subject_id}>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span className="font-medium">{name}{!t.is_visible && <span className="ms-2 text-xs text-muted">(مخفية عن الطالب)</span>}</span>
                            <span className={`rounded-md px-1.5 font-semibold tabular-nums ${scoreTone(v)}`}>{fmtNum(v, 2)}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-paper">
                            <div className="h-full origin-right animate-grow rounded-full" style={{ width: `${Math.min(100, v)}%`, background: subjectColor(name) }} />
                          </div>
                        </li>
                      );
                    })}
                </ul>
              )}
            </Card>

            <Card title="آخر الدرجات المرصودة" pad={false}>
              {!entries?.length ? (
                <div className="p-5"><Empty title="لا درجات بعد" /></div>
              ) : (
                <ul className="divide-y divide-line">
                  {entries.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                      <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: subjectColor(e.assessment?.subject?.name ?? '') }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{e.assessment?.title}</p>
                        <p className="text-xs text-muted">
                          {e.assessment?.subject?.name} · {e.assessment?.eval_type?.name ?? '—'} · {fmtDate(e.recorded_at)}
                          {e.source === 'auto_absent' && ' · صفر تلقائي لعدم الحل'}
                        </p>
                      </div>
                      <span className="font-semibold tabular-nums">
                        {fmtNum(Number(e.score), 2)} <span className="text-xs font-normal text-muted">/ {fmtNum(Number(e.max_score), 2)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
