import Link from 'next/link';
import { LogoMark } from '@/components/home/logo-mark';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6">
      <div className="text-center">
        <LogoMark className="mx-auto h-16 w-16" animated />
        <p className="mt-6 font-display text-7xl font-bold text-board/20">404</p>
        <h1 className="mt-2 text-2xl font-bold">الصفحة غير موجودة</h1>
        <p className="mt-2 text-muted">ربما نُقلت أو حُذفت، أو أن الرابط غير صحيح.</p>
        <Link href="/" className="btn-primary mt-7">العودة لمِرقاة</Link>
      </div>
    </main>
  );
}
