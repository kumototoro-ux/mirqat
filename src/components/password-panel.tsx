import { ChangePasswordForm } from '@/app/change-password/change-password-form';

/** تغيير كلمة المرور من داخل الموقع (الإلزامي عند أول دخول له صفحة مستقلة /change-password) */
export function PasswordPanel({ name }: { name: string }) {
  return (
    <div className="mx-auto max-w-lg">
      <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <span className="grid size-12 place-items-center rounded-2xl bg-board/10 text-board">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="8" cy="15" r="3.5" /><path d="m10.5 12.5 8-8M16 7l2.5 2.5" /></svg>
        </span>
        <h2 className="mt-4 text-xl font-bold">تغيير كلمة المرور</h2>
        <p className="mt-1 text-muted">{name}، الكلمة الجديدة تسري فورًا، وتُغلق جلساتك المفتوحة على الأجهزة الأخرى.</p>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
