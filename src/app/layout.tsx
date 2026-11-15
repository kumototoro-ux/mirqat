import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { Tracker } from '@/components/track/tracker';
import { A11yRoot } from '@/components/a11y/a11y-root';
import { A11Y_COOKIE, a11yAttrs, parseA11y } from '@/lib/a11y';
import { PALETTE_COOKIE, THEME_COOKIE, parseMode, parsePalette } from '@/lib/theme';

export const metadata: Metadata = {
  title: { default: 'مِرقاة', template: '%s · مِرقاة' },
  description: 'منصة مِرقاة التعليمية',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#356854' },
    { media: '(prefers-color-scheme: dark)', color: '#121815' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const jar = await cookies();
  const mode = parseMode(jar.get(THEME_COOKIE)?.value);
  const palette = parsePalette(jar.get(PALETTE_COOKIE)?.value);
  const a11y = parseA11y(jar.get(A11Y_COOKIE)?.value ? decodeURIComponent(jar.get(A11Y_COOKIE)!.value) : undefined);
  return (
    <html lang="ar" dir="rtl" data-scroll-behavior="smooth" data-theme={mode === 'auto' ? undefined : mode} data-palette={palette === 'green' ? undefined : palette} {...a11yAttrs(a11y)}>
      <body className="min-h-dvh">
        <a href="#main-content" className="skip-link">انتقل للمحتوى</a>
        <A11yRoot initial={a11y}>{children}</A11yRoot>
        <Tracker />
      </body>
    </html>
  );
}
