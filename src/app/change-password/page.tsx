import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { homeFor } from '@/lib/auth/roles';
import { ChangePasswordForm } from './change-password-form';
import { Brand, PageTransition } from '@/components/motion';

export const metadata: Metadata = { title: 'تغيير كلمة المرور' };

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/signout?reason=session');
  if (user.status !== 'active') redirect('/auth/signout?reason=disabled');

  const forced = user.mustChangePassword;

  return (
    <main className="flex min-h-dvh items-start justify-center px-5 py-12 sm:items-center">
      <PageTransition>
      <div className="w-full max-w-sm animate-fade-up">
        <Brand>
          <p className="w-fit font-display text-2xl font-bold text-board">مِرقاة</p>
        </Brand>
        <h1 className="mt-6 text-[1.75rem] font-bold leading-tight">
          {forced ? 'اختر كلمة مرور جديدة' : 'تغيير كلمة المرور'}
        </h1>
        <p className="mt-2 text-muted">
          {forced
            ? `أهلًا ${user.displayName}. الكلمة التي استلمتها مؤقتة، فاختر كلمتك الخاصة قبل المتابعة.`
            : 'الكلمة الجديدة تسري من الدخول القادم على كل الأجهزة.'}
        </p>

        <ChangePasswordForm />

        <div className="mt-6 flex items-center justify-between text-sm">
          {!forced && (
            <a href={homeFor(user.role)} className="text-muted underline-offset-4 hover:text-ink hover:underline">
              رجوع دون تغيير
            </a>
          )}
          <form action="/auth/signout" method="post" className="ms-auto">
            <button type="submit" className="text-muted underline-offset-4 hover:text-ink hover:underline">
              خروج
            </button>
          </form>
        </div>
      </div>
      </PageTransition>
    </main>
  );
}
