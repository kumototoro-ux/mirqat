import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getPermMatrix } from '@/lib/perms/actions';
import { PageHeader } from '@/components/ui';
import { PermissionsMatrix } from '@/components/perms/permissions-matrix';

export const metadata: Metadata = { title: 'صلاحيات المعلمين' };

export default async function PermissionsPage() {
  await requireUser(['admin']);
  const matrix = await getPermMatrix();
  return (
    <>
      <PageHeader
        title="صلاحيات المعلمين"
        lead="امنح كل معلم ما يحتاجه واسحب ما لا يحتاجه. الإداري يملك كل المفاتيح دائمًا، والمنع يُفرض في قاعدة البيانات نفسها."
      />
      <PermissionsMatrix initial={matrix} />
    </>
  );
}
