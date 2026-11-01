import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui';
import { getAuthorContext } from '@/lib/assess/queries';
import { getAppreciationBrand } from '@/lib/certs/brand';
import { CertsHub } from '@/components/certs/certs-hub';

export const metadata: Metadata = { title: 'شهادات الشكر والتقدير' };

export default async function CertificatesPage() {
  const user = await requireUser(['admin', 'teacher']);
  const [ctx, brand] = await Promise.all([getAuthorContext(user), getAppreciationBrand()]);
  const branches = [...new Map(ctx.classes.map((c) => [c.branch_id, c.branch])).entries()].map(([value, label]) => ({ value, label }));
  return (
    <>
      <PageHeader
        title="شهادات الشكر والتقدير"
        lead={ctx.isAdmin
          ? 'أصدر شهادات الأوائل والحضور والسلوك والمواد والأنشطة — يتحقق النظام من الاستحقاق، وتظهر الشهادة في صفحة الطالب فور إصدارها.'
          : 'كرّم طلابك المتميزين في موادك وأنشطتهم، أو بتقدير خاص تكتب سببه — تظهر الشهادة في صفحة الطالب فور إصدارها.'}
      />
      <CertsHub ctx={ctx} brand={brand} branches={branches} />
    </>
  );
}
