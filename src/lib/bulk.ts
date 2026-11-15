/** نتيجة حذف جماعي: ما حُذف، وما تعذّر مع سببه (يُعرض للمستخدم بدل صمت أو فشل كلي) */
export type BulkDeleteResult =
  | { ok: true; deleted: number; failed: { name: string; reason: string }[]; message: string }
  | { ok: false; error: string };

const MAX_NAMES = 4;

/** سبب قصير مفهوم من رسالة القاعدة الطويلة */
export function shortReason(raw: string, hint: string): string {
  if (/فلا يُحذف/.test(raw)) return hint;
  if (/FORBIDDEN|خارج نطاق|للإدارة فقط/.test(raw)) return 'خارج صلاحيتك';
  if (/بنفسك/.test(raw)) return 'لا يمكنك حذف نفسك';
  return raw.replace(/^[A-Z]+:\s*/, '').slice(0, 90);
}

/** رسالة ملخّصة: «حُذف 8 · تعذّر 2: أحمد (السبب)، …» */
export function bulkMessage(what: string, deleted: number, failed: { name: string; reason: string }[]): string {
  const head = deleted ? `حُذف ${deleted} ${what}` : 'لم يُحذف شيء';
  if (!failed.length) return head;
  const shown = failed.slice(0, MAX_NAMES).map((f) => `${f.name} (${f.reason})`).join('، ');
  return `${head} · تعذّر ${failed.length}: ${shown}${failed.length > MAX_NAMES ? ` و${failed.length - MAX_NAMES} آخرين` : ''}`;
}
