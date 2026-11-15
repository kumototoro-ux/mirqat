/**
 * صفحة مفتوحة من نشر قديم ثم نُشر إصدار جديد: عملياتها (Server Actions) وملفاتها لم تعد موجودة.
 * الحل الصحيح تحديث الصفحة، فنفعله تلقائيًا مرة واحدة (حارس يمنع تكرار التحديث بلا نهاية).
 */
const STALE = /server action|failed to find|unexpected response|loading chunk|chunkloaderror|failed to fetch dynamically imported/i;

export function isStaleDeployError(error: { message?: string } | null | undefined): boolean {
  return STALE.test(error?.message ?? '');
}

export function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem('mq-stale-reload') ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem('mq-stale-reload', String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
