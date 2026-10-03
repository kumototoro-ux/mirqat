import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'مِرقاة', template: '%s · مِرقاة' },
  description: 'منصة مِرقاة التعليمية',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#356854',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
