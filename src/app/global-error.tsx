'use client';

import { useEffect } from 'react';
import { isStaleDeployError, reloadOnce } from '@/lib/stale-deploy';

/** آخر شبكة أمان: خطأ في التخطيط الجذري نفسه. لا يعتمد على أي مكوّن أو نمط من الموقع */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    if (isStaleDeployError(error)) reloadOnce();
  }, [error]);
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, minHeight: '100dvh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui, Tahoma, sans-serif', background: '#f5f7f6', color: '#1f2a24' }}>
        <div style={{ textAlign: 'center', padding: 24, maxWidth: 360 }}>
          <h1 style={{ fontSize: 22 }}>تعذّر تحميل الصفحة</h1>
          <p style={{ color: '#5f6e66', lineHeight: 1.8 }}>ربما صدر إصدار جديد من الموقع. حدّث الصفحة وأعد المحاولة.</p>
          <button type="button" onClick={() => window.location.reload()} style={{ marginTop: 12, padding: '10px 22px', borderRadius: 12, border: 0, background: '#356854', color: '#fff', fontSize: 16, cursor: 'pointer' }}>
            تحديث الصفحة
          </button>
        </div>
      </body>
    </html>
  );
}
