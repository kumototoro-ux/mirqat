'use client';

import { useState } from 'react';
import type { IssuedPassword } from './actions';

/** عرض كلمة المرور المؤقتة مرة واحدة — لا تُحفظ في أي مكان بعد مغادرة الصفحة */
export function IssuedPasswordCard({ issued }: { issued: IssuedPassword }) {
  const [copied, setCopied] = useState(false);
  const text = `اسم المستخدم: ${issued.username}\nكلمة المرور: ${issued.password}`;

  return (
    <div role="status" className="rounded-lg border border-brass/50 bg-brass-soft p-4">
      <p className="font-semibold">{issued.displayName}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">اسم المستخدم</dt>
        <dd><bdi className="font-medium">{issued.username}</bdi></dd>
        <dt className="text-muted">كلمة المرور</dt>
        <dd>
          <bdi className="select-all rounded bg-surface px-2 py-0.5 text-base font-semibold tracking-wider" dir="ltr">
            {issued.password}
          </bdi>
        </dd>
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-quiet py-1.5"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          }}
        >
          {copied ? 'نُسخت' : 'نسخ البيانات'}
        </button>
        <p className="text-sm text-muted">لن تظهر مجددًا. صاحب الحساب يغيّرها عند أول دخول.</p>
      </div>
    </div>
  );
}
