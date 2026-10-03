import { createClient } from '@/lib/supabase/server';
import { Badge, Empty, ErrorNote, FilterBar, PageHeader, PreviewNote, SearchInput, Select, Table, Td } from '@/components/ui';
import { CLASS_SELECT, classLabel, fmtDate, fmtDateTime, fmtNum, type ClassRef } from '@/lib/format';
import { classOptions, getSubjects, getTerms } from '@/lib/data';
import { subjectColor } from '@/components/timetable-grid';

type Row = {
  id: number;
  title: string;
  max_score: number | null;
  due_at: string | null;
  published_at: string | null;
  grades_recorded_at: string | null;
  created_at: string;
  class: ClassRef;
  subject: { name: string } | null;
  eval_type: { name: string } | null;
  teacher: { name_ar: string } | null;
  term: { name: string } | null;
  form: { status: 'draft' | 'published' | 'closed'; opens_at: string | null; closes_at: string | null; max_attempts: number } | null;
};

const FORM_STATUS = {
  draft: { label: 'مسودة', tone: 'neutral' },
  published: { label: 'منشور', tone: 'ok' },
  closed: { label: 'مغلق', tone: 'danger' },
} as const;

/** قائمة المهام أو النماذج: نفس الجدول بفلاتر الفصل والمادة والفصل الدراسي والبحث */
export async function AssessmentsView({
  kind,
  searchParams,
  teacherId,
}: {
  kind: 'task' | 'form';
  searchParams: { class?: string; subject?: string; term?: string; q?: string };
  teacherId: number | null;
}) {
  const [classes, subjects, terms] = await Promise.all([classOptions(), getSubjects(), getTerms()]);
  const classId = Number(searchParams.class) || null;
  const subjectId = Number(searchParams.subject) || null;
  const termId = Number(searchParams.term) || null;
  const q = (searchParams.q ?? '').replace(/[,()*%\\"]/g, ' ').trim().slice(0, 60);

  const supabase = await createClient();
  let query = supabase
    .from('assessments')
    .select(
      `id, title, max_score, due_at, published_at, grades_recorded_at, created_at,
       class:classes(${CLASS_SELECT}), subject:subjects(name), eval_type:eval_types(name),
       teacher:employees(name_ar), term:terms(name),
       form:form_details(status, opens_at, closes_at, max_attempts)`,
      { count: 'exact' },
    )
    .eq('kind', kind)
    .order('created_at', { ascending: false })
    .limit(150);
  if (classId) query = query.eq('class_id', classId);
  if (subjectId) query = query.eq('subject_id', subjectId);
  if (termId) query = query.eq('term_id', termId);
  if (q) query = query.ilike('title', `%${q}%`);
  const { data, error, count } = await query.returns<Row[]>();
  const rows = data ?? [];
  const isForm = kind === 'form';

  return (
    <>
      <PageHeader
        title={isForm ? 'النماذج الإلكترونية' : 'المهام والتكاليف'}
        lead={
          <>
            {fmtNum(count ?? 0)} {isForm ? 'نموذج' : 'مهمة'}
            {teacherId !== null ? ' ضمن نطاقك' : ''}
          </>
        }
      />
      <PreviewNote>
        هذه الصفحة للعرض الآن. إنشاء {isForm ? 'النماذج وأسئلتها' : 'المهام'} وتعديلها ورصدها يأتي في المرحلة القادمة.
      </PreviewNote>
      <FilterBar>
        <SearchInput value={q} placeholder="عنوان…" className="w-48" />
        <Select name="class" label="الفصل" value={classId} options={classes} placeholder="كل الفصول" className="w-56" />
        <Select name="subject" label="المادة" value={subjectId} options={subjects.map((s) => ({ value: s.id, label: s.name }))} placeholder="كل المواد" className="w-44" />
        <Select name="term" label="الفصل الدراسي" value={termId} options={terms.map((t) => ({ value: t.id, label: `${t.name} ${t.year}` }))} placeholder="الكل" className="w-44" />
      </FilterBar>
      <ErrorNote error={error} />
      {rows.length === 0 ? (
        <Empty title={`لا ${isForm ? 'نماذج' : 'مهام'} مطابقة`} />
      ) : (
        <Table
          minWidth={900}
          head={isForm ? ['النموذج', 'الفصل', 'التقييم', 'الحالة', 'فترة الحل', 'المحاولات', 'المعلم'] : ['المهمة', 'الفصل', 'التقييم', 'الدرجة', 'التسليم', 'الرصد', 'المعلم']}
        >
          {rows.map((r) => (
            <tr key={r.id}>
              <Td>
                <div className="flex items-center gap-3">
                  <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: subjectColor(r.subject?.name ?? '') }} />
                  <div className="min-w-0">
                    <p className="max-w-72 truncate font-medium">{r.title}</p>
                    <p className="text-xs text-muted">{r.subject?.name} · {r.term?.name}</p>
                  </div>
                </div>
              </Td>
              <Td className="whitespace-nowrap">{classLabel(r.class, true)}</Td>
              <Td className="whitespace-nowrap">{r.eval_type?.name ?? '—'}</Td>
              {isForm ? (
                <>
                  <Td>{r.form ? <Badge tone={FORM_STATUS[r.form.status].tone}>{FORM_STATUS[r.form.status].label}</Badge> : '—'}</Td>
                  <Td className="whitespace-nowrap text-xs text-muted">
                    {r.form?.opens_at ? fmtDateTime(r.form.opens_at) : '—'}
                    <br />
                    {r.form?.closes_at ? `← ${fmtDateTime(r.form.closes_at)}` : ''}
                  </Td>
                  <Td className="tabular-nums">{r.form?.max_attempts ?? '—'}</Td>
                </>
              ) : (
                <>
                  <Td className="tabular-nums">{r.max_score != null ? fmtNum(r.max_score, 2) : '—'}</Td>
                  <Td className="whitespace-nowrap text-muted">{r.due_at ? fmtDate(r.due_at) : '—'}</Td>
                  <Td>{r.grades_recorded_at ? <Badge tone="ok">مرصودة</Badge> : <Badge tone="gold">لم تُرصد</Badge>}</Td>
                </>
              )}
              <Td className="whitespace-nowrap text-muted">{r.teacher?.name_ar ?? '—'}</Td>
            </tr>
          ))}
        </Table>
      )}
      {(count ?? 0) > rows.length && <p className="mt-3 text-sm text-muted">يظهر أحدث {rows.length}. استخدم الفلاتر للوصول إلى غيرها.</p>}
    </>
  );
}
