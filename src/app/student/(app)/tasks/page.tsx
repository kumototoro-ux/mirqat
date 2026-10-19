import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';
import { StudentAssessments } from '@/components/assess/student-list';
import type { StudentItem } from '@/lib/assess/student';

export const metadata: Metadata = { title: 'مهامي ونماذجي' };

export default async function StudentTasks() {
  await requireUser(['student']);
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_assessments');
  const items = ((data as StudentItem[]) ?? []).map((i) => ({ ...i, max_score: i.max_score != null ? Number(i.max_score) : null }));
  return (
    <>
      <PageHeader title="مهامي ونماذجي" lead="كل ما طلبه معلموك في مكان واحد: سلّم المهام، وحلّ النماذج، وتابع درجاتك وملاحظاتهم." />
      <StudentAssessments items={items} />
    </>
  );
}
