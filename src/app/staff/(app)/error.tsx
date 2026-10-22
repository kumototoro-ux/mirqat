'use client';

import { ErrorState } from '@/components/states/error-state';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState error={error} reset={reset} home="/staff" />;
}
