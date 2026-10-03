'use client';

import { useActionState, useState } from 'react';
import { changePassword, type ChangePasswordState } from './actions';

const initial: ChangePasswordState = { error: null };

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, initial);
  const [attempt, setAttempt] = useState(0);

  return (
    <form action={action} onSubmit={() => setAttempt((n) => n + 1)} className="mt-8 space-y-5">
      <div>
        <label htmlFor="password" className="label">كلمة المرور الجديدة</label>
        <input
          id="password"
          name="password"
          type="password"
          className="field"
          dir="ltr"
          autoComplete="new-password"
          minLength={8}
          required
          aria-describedby="password-hint"
        />
        <p id="password-hint" className="mt-1.5 text-sm text-muted">8 خانات على الأقل، بلا مسافات.</p>
      </div>
      <div>
        <label htmlFor="confirm" className="label">أعد كتابتها</label>
        <input id="confirm" name="confirm" type="password" className="field" dir="ltr" autoComplete="new-password" required />
      </div>

      <p role="alert" aria-live="polite" className="min-h-6 text-sm text-danger">
        {state.error && <span key={attempt} className="inline-block animate-nudge">{state.error}</span>}
      </p>

      <button type="submit" className="btn-primary w-full py-3 text-base" disabled={pending}>
        {pending ? (
          <>
            <span className="spinner" aria-hidden />
            جارٍ الحفظ…
          </>
        ) : (
          'حفظ كلمة المرور'
        )}
      </button>
    </form>
  );
}
