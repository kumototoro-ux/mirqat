'use client';

import Link from 'next/link';
import { useState } from 'react';

/**
 * رابط يُجهَّز مسبقًا عند المرور أو اللمس فقط، لا لمجرد ظهوره في الشاشة:
 * القائمة فيها ~17 رابطًا، والتجهيز التلقائي لكلها مع كل صفحة يعني 17 طلبًا بلا داعٍ.
 */
export function NavLink(props: React.ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={intent ? null : false}
      onMouseEnter={(e) => {
        setIntent(true);
        props.onMouseEnter?.(e);
      }}
      onTouchStart={(e) => {
        setIntent(true);
        props.onTouchStart?.(e);
      }}
      onFocus={(e) => {
        setIntent(true);
        props.onFocus?.(e);
      }}
    />
  );
}
