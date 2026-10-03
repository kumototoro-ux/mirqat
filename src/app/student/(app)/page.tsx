import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'الرئيسية' };

type StudentRow = {
  code: string;
  name_ar: string;
  class: {
    branch: { name: string } | null;
    grade: { name: string; stage: { name: string } | null } | null;
    section: { name: string } | null;
  } | null;
};

export default async function StudentHome() {
  const user = await requireUser(['student']);
  const supabase = await createClient();
  const { data: student } = await supabase
    .from('students')
    .select('code, name_ar, class:classes(branch:branches(name), grade:grades(name, stage:stages(name)), section:sections(name))')
    .eq('id', user.studentId ?? -1)
    .maybeSingle<StudentRow>();

  const c = student?.class;
  const classLabel = c
    ? [c.grade && `الصف ${c.grade.name}${c.grade.stage ? ' ' + c.grade.stage.name : ''}`, c.section && `شعبة ${c.section.name}`]
        .filter(Boolean)
        .join('، ')
    : null;

  return (
    <>
      <h1 className="text-[1.75rem] font-bold leading-tight">أهلًا {student?.name_ar ?? user.displayName}</h1>
      <dl className="mt-6 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
        <Item label="رقم الطالب" value={student?.code ?? user.code} ltr />
        <Item label="الفصل" value={classLabel} />
        <Item label="الفرع" value={c?.branch?.name ?? null} />
      </dl>
      <p className="mt-8 text-muted">جدولك ومهامك ونتائجك ستظهر هنا.</p>
    </>
  );
}

function Item({ label, value, ltr }: { label: string; value: string | null; ltr?: boolean }) {
  return (
    <div className="bg-surface px-5 py-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 font-medium">{value ? ltr ? <bdi>{value}</bdi> : value : '—'}</dd>
    </div>
  );
}
