'use client';

import { useActionState, useState } from 'react';
import { loginStaff, loginStudent, type LoginState } from '@/app/login/actions';
import type { Portal } from '@/lib/auth/portal';

const initial: LoginState = { error: null, username: '' };

export function LoginForm({ portal }: { portal: Portal }) {
  const [state, action, pending] = useActionState(portal === 'staff' ? loginStaff : loginStudent, initial);
  const [showPassword, setShowPassword] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const describedBy = state.error ? 'login-error' : undefined;

  return (
    <form action={action} onSubmit={() => setAttempt((n) => n + 1)} className="mt-8 space-y-5" noValidate>
      <div>
        <label htmlFor="username" className="label">اسم المستخدم</label>
        <input
          id="username"
          name="username"
          className="field"
          dir="auto"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={state.username}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={describedBy}
        />
      </div>

      <div>
        <label htmlFor="password" className="label">كلمة المرور</label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            className="field ps-20"
            dir="ltr"
            autoComplete="current-password"
            required
            aria-invalid={state.error ? true : undefined}
            aria-describedby={describedBy}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 end-0 rounded-e-md px-3 text-sm text-muted transition-colors hover:text-ink"
            aria-pressed={showPassword}
          >
            {showPassword ? 'إخفاء' : 'إظهار'}
          </button>
        </div>
      </div>

      <p id="login-error" role="alert" aria-live="polite" className="min-h-6 text-sm text-danger">
        {/* المفتاح يعيد الحركة مع كل محاولة خاطئة، حتى لو تكررت نفس الرسالة */}
        {state.error && <span key={attempt} className="inline-block animate-nudge">{state.error}</span>}
      </p>

      <button type="submit" className="btn-primary w-full py-3 text-base" disabled={pending}>
        {pending ? (
          <>
            <span className="spinner" aria-hidden />
            جارٍ الدخول…
          </>
        ) : (
          'دخول'
        )}
      </button>
    </form>
  );
}
