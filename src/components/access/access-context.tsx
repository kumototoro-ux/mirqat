'use client';

import { createContext, useContext } from 'react';
import { NO_ACCESS, levelOf, type Area, type MyAccess } from '@/lib/access/areas';

const Ctx = createContext<MyAccess>(NO_ACCESS);

/** يمرّر مناصب الحساب لعناصر الواجهة (إخفاء فقط — المنع الحقيقي داخل القاعدة) */
export function AccessProvider({ access, children }: { access: MyAccess; children: React.ReactNode }) {
  return <Ctx.Provider value={access}>{children}</Ctx.Provider>;
}

export function useAccessLevel(area: Area): number {
  return levelOf(useContext(Ctx), area);
}
