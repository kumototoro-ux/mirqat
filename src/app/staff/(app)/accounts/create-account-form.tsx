'use client';

import { useActionState, useState } from 'react';
import { createAccountAction, type AccountActionState } from './actions';
import { IssuedPasswordCard } from './issued-password';

const initial: AccountActionState = { error: null, issued: null };

export function CreateAccountForm() {
  const [state, action, pending] = useActionState(createAccountAction, initial);
  const [kind, setKind] = useState<'employee' | 'student'>('employee');

  return (
    <div className="space-y-4">
      <form action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[auto_1fr_1fr_auto_auto] lg:items-end">
        <fieldset>
          <legend className="label">السجل</legend>
          <div className="flex rounded-md border border-line bg-surface p-0.5">
            {(['employee', 'student'] as const).map((k) => (
              <label
                key={k}
                className={
                  'cursor-pointer rounded px-3 py-2 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brass ' +
                  (kind === k ? 'bg-board text-chalk' : 'text-muted hover:text-ink')
                }
              >
                <input
                  type="radio"
                  name="kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                  className="sr-only"
                />
                {k === 'employee' ? 'موظف' : 'طالب'}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="code" className="label">{kind === 'employee' ? 'رمز الموظف' : 'رقم الطالب'}</label>
          <input id="code" name="code" className="field" dir="auto" required autoComplete="off" />
        </div>
        <div>
          <label htmlFor="new-username" className="label">اسم المستخدم</label>
          <input id="new-username" name="username" className="field" dir="auto" required autoComplete="off" spellCheck={false} />
        </div>

        {kind === 'employee' ? (
          <div>
            <label htmlFor="role" className="label">الدور</label>
            <select id="role" name="role" className="field" defaultValue="teacher">
              <option value="teacher">معلم</option>
              <option value="admin">إداري</option>
            </select>
          </div>
        ) : (
          <input type="hidden" name="role" value="student" />
        )}

        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}
        </button>
      </form>

      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {state.issued && <IssuedPasswordCard key={state.issued.password} issued={state.issued} />}
    </div>
  );
}
