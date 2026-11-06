/**
 * سياسة أمان المحتوى (CSP) بـ nonce لكل طلب: لا يُنفَّذ سكربت إلا إن حمل رمز هذا الطلب
 * (يضعه Next تلقائيًا على سكربتاته)، فحتى لو تسرّب HTML مُحقَن لا يعمل سكربته.
 * 'strict-dynamic' لتحميل الحزم التي تستدعيها السكربتات الموثوقة.
 * الأنماط تبقى inline لأن React يكتب style على العناصر (لا خطر تنفيذ).
 */
export function buildCsp(nonce: string, dev = process.env.NODE_ENV === 'development'): string {
  let supabase = '';
  try {
    supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin;
  } catch {
    /* بلا عنوان: لا يُضاف */
  }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    // شعار المدرسة رابط خارجي يحدده الإداري
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `media-src 'self' blob: ${supabase}`.trim(),
    `connect-src 'self' ${supabase} ${supabase.replace('https://', 'wss://')}`.trim(),
    // الفيديوهات المضمّنة في المنصة (يوتيوب بلا تتبع، فيميو، قوقل درايف)
    'frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://drive.google.com',
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}
