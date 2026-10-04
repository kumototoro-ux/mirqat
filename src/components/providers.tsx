'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { useState } from 'react';

/**
 * ذاكرة البيانات في المتصفح (TanStack Query):
 * - الصفحة التي جُلبت تبقى "طازجة" دقيقة كاملة: الرجوع إليها لا يرسل طلبًا
 * - طلبان متطابقان في نفس اللحظة يصيران طلبًا واحدًا
 * - لا إعادة جلب عند الرجوع للتبويب أو إعادة الاتصال (البيانات المدرسية لا تتغير كل ثانية)
 * MotionConfig: يحترم "تقليل الحركة" في جهاز المستخدم تلقائيًا
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 10 * 60_000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            retry: 1,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </QueryClientProvider>
  );
}
