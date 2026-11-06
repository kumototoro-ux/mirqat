import type { NextConfig } from 'next';

/**
 * رؤوس أمان لكل الصفحات:
 * - لا يُعرض الموقع داخل إطار موقع آخر (حماية من خداع النقر)
 * - سياسة المحتوى (CSP) بـ nonce لكل طلب تُضاف في src/proxy.ts (انظر src/lib/csp.ts)
 * - HTTPS إلزامي، ولا يُرسل عنوان الصفحة لمواقع أخرى
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  experimental: {
    // ذاكرة المسارات في المتصفح: الرجوع لصفحة زرتها قبل أقل من 30 ثانية لا يطلبها من الخادم مجددًا
    staleTimes: { dynamic: 30, static: 300 },
    // رفع شعار المدرسة (حتى 2 ميجابايت) عبر Server Action
    serverActions: { bodySizeLimit: '8mb' },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), payment=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
