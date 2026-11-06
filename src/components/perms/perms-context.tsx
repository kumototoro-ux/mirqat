'use client';

import { createContext, useContext } from 'react';
import { NO_PERMS, type PermKey, type PermMap } from '@/lib/perms/keys';

const Ctx = createContext<PermMap>(NO_PERMS);

/** يمرّر مفاتيح الحساب لأزرار الواجهة (إخفاء فقط — المنع الحقيقي داخل القاعدة) */
export function PermsProvider({ perms, children }: { perms: PermMap; children: React.ReactNode }) {
  return <Ctx.Provider value={perms}>{children}</Ctx.Provider>;
}

export function usePerm(key: PermKey): boolean {
  return useContext(Ctx)[key];
}
