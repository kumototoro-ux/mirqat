'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/states/error-state';
import { isStaleDeployError, reloadOnce } from '@/lib/stale-deploy';

/** أخطاء الصفحات خارج بوابتي الموظفين والطلاب (الدخول، تغيير كلمة المرور). التحديث تلقائي إن كان السبب إصدارًا جديدًا */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = isStaleDeployError(error);
  useEffect(() => {
    if (stale) reloadOnce();
  }, [stale]);
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-4">
      <ErrorState error={error} reset={() => (stale ? window.location.reload() : reset())} home="/" />
    </main>
  );
}
