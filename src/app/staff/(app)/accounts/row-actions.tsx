'use client';

import { useActionState } from 'react';
import { resetPasswordAction, setStatusAction, type AccountActionState, type StatusActionState } from './actions';
import { IssuedPasswordCard } from './issued-password';

const initial: AccountActionState = { error: null, issued: null };

export function RowActions({
  userId,
  username,
  displayName,
  status,
  isSelf,
}: {
  userId: string;
  username: string;
  displayName: string;
  status: 'active' | 'disabled';
  isSelf: boolean;
}) {
  const [state, resetAction, resetting] = useActionState(resetPasswordAction, initial);
  const [statusState, statusAction, switching] = useActionState(setStatusAction, { error: null } as StatusActionState);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-end gap-2">
        <form
          action={resetAction}
          onSubmit={(e) => {
            if (!confirm(`إصدار كلمة مؤقتة جديدة لـ ${displayName}؟ الكلمة الحالية تتوقف فورًا.`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="username" value={username} />
          <input type="hidden" name="displayName" value={displayName} />
          <button type="submit" className="btn-quiet px-3 py-1.5 text-xs" disabled={resetting}>
            {resetting ? 'جارٍ…' : 'كلمة مؤقتة جديدة'}
          </button>
        </form>

        {!isSelf && (
          <form
            action={statusAction}
            onSubmit={(e) => {
              if (status === 'active' && !confirm(`إيقاف حساب ${displayName}؟ يُمنع من الدخول فورًا.`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="status" value={status === 'active' ? 'disabled' : 'active'} />
            <button
              type="submit"
              disabled={switching}
              className={(status === 'active' ? 'btn-danger' : 'btn-quiet') + ' px-3 py-1.5 text-xs'}
            >
              {switching ? 'جارٍ…' : status === 'active' ? 'إيقاف' : 'تفعيل'}
            </button>
          </form>
        )}
      </div>
      {(state.error || statusState.error) && (
        <p role="alert" className="text-xs text-danger">{state.error ?? statusState.error}</p>
      )}
      {state.issued && (
        <div className="text-start">
          <IssuedPasswordCard key={state.issued.password} issued={state.issued} />
        </div>
      )}
    </div>
  );
}
