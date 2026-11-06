import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { Tracker } from '@/components/track/tracker';
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
  return (
    <html lang="ar" dir="rtl" data-scroll-behavior="smooth" data-theme={mode === 'auto' ? undefined : mode} data-palette={palette === 'green' ? undefined : palette}>
      <body className="min-h-dvh">
        {children}
        <Tracker />
      </body>
    </html>
  );
}
