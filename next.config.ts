import type { NextConfig } from 'next';

/**
 * رؤوس أمان لكل الصفحات:
 * - لا يُعرض الموقع داخل إطار موقع آخر (حماية من خداع النقر)
 * - السكربتات والاتصالات من الموقع نفسه وSupabase فقط
 * - HTTPS إلزامي، ولا يُرسل عنوان الصفحة لمواقع أخرى
 */
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin;
  } catch {
    return '';
  }
})();

const csp = [
  "default-src 'self'",
  // Next.js يحتاج سكربتات مضمّنة للتحميل الأولي
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // شعار المدرسة رابط خارجي يحدده الإداري
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace('https://', 'wss://')}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // ذاكرة المسارات في المتصفح: الرجوع لصفحة زرتها قبل أقل من 30 ثانية لا يطلبها من الخادم مجددًا
    staleTimes: { dynamic: 30, static: 300 },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
