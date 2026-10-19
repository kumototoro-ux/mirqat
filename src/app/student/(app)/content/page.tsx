import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui';
import { myContent } from '@/lib/content/actions';
import { ContentLibrary } from '@/components/content/library';

export const metadata: Metadata = { title: 'الفيديوهات والإثراءات' };

export default async function StudentContent() {
  await requireUser(['student']);
  const items = await myContent();
  return (
    <>
      <PageHeader title="الفيديوهات والإثراءات" lead="شروحات وإثراءات معلميك لكل مادة — شاهدها هنا وتابع تقدمك." />
      <ContentLibrary initial={items} />
    </>
  );
}
