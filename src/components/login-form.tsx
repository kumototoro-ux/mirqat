'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { loginStaff, loginStudent, type LoginState } from '@/app/login/actions';
import type { Portal } from '@/lib/auth/portal';

const initial: LoginState = { error: null, username: '', nonce: 0 };

const UserIcon = () => (
  <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <circle cx="10" cy="7" r="3.2" />
    <path d="M3.8 17c.9-3.1 3.3-4.7 6.2-4.7s5.3 1.6 6.2 4.7" />
  </svg>
);
const LockIcon = () => (
  <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <rect x="4" y="8.5" width="12" height="8.5" rx="2" />
    <path d="M6.8 8.5V6.3a3.2 3.2 0 0 1 6.4 0v2.2" />
  </svg>
);
const EyeIcon = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M1.8 10S4.8 4.5 10 4.5 18.2 10 18.2 10 15.2 15.5 10 15.5 1.8 10 1.8 10z" />
    <circle cx="10" cy="10" r="2.6" />
    {!open && <path d="M3 3l14 14" />}
  </svg>
);

/**
 * نموذج الدخول بثلاث حالات مرئية للزر:
 *   انتظار ← دائرة تحميل وشريط يتحرك
 *   خطأ    ← البطاقة تهتز والحقول تحمرّ
 *   نجاح   ← الزر يخضرّ وترتسم علامة صح، ثم تتسع دائرة خضراء من الزر لتملأ الشاشة وينتقل
 */
export function LoginForm({ portal }: { portal: Portal }) {
  const [state, action, pending] = useActionState(portal === 'staff' ? loginStaff : loginStudent, initial);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [leaving, setLeaving] = useState<{ x: number; y: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const success = Boolean(state.redirectTo);
  const hasError = Boolean(state.error) && !pending;
  const busy = pending || success;

  // هزّة البطاقة مع كل خطأ (دون إعادة بناء النموذج، فلا يُمسح ما كتبه)
  useEffect(() => {
    if (!state.error || !formRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    formRef.current.animate(
      [
        { transform: 'none' },
        { transform: 'translateX(-9px)' },
        { transform: 'translateX(7px)' },
        { transform: 'translateX(-4px)' },
        { transform: 'translateX(2px)' },
        { transform: 'none' },
      ],
      { duration: 450, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  }, [state.nonce, state.error]);

  useEffect(() => {
    if (!state.redirectTo) return;
    router.prefetch(state.redirectTo);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const r = buttonRef.current?.getBoundingClientRect();
    const t1 = setTimeout(() => {
      if (r) setLeaving({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    }, reduce ? 0 : 650);
    const t2 = setTimeout(() => router.replace(state.redirectTo!), reduce ? 0 : 1250);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [state.redirectTo, router]);

  const fieldState = hasError
    ? 'border-danger/60 focus:border-danger focus:ring-danger/20'
    : '';

  return (
    <>
      <form
        action={action}
        noValidate
        ref={formRef}
        className="mt-7 rounded-3xl border border-line/80 bg-surface/90 p-6 shadow-[0_30px_60px_-36px_rgb(31_42_36/0.45)] backdrop-blur sm:p-7"
      >
        <div>
          <label htmlFor="username" className="label">اسم المستخدم</label>
          <div className="group relative">
            <span className="pointer-events-none absolute inset-y-0 start-0 grid w-11 place-items-center text-muted transition-colors group-focus-within:text-board">
              <UserIcon />
            </span>
            <input
              id="username"
              name="username"
              className={`field ps-11 ${fieldState}`}
              dir="auto"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={64}
              required
              readOnly={busy}
              defaultValue={state.username}
              aria-invalid={hasError || undefined}
              aria-describedby={hasError ? 'login-error' : undefined}
            />
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-ink">كلمة المرور</label>
            <button
              type="button"
              onClick={() => setHelpOpen((v) => !v)}
              aria-expanded={helpOpen}
              className="text-xs text-muted underline-offset-4 transition-colors hover:text-board hover:underline"
            >
              نسيت كلمة المرور؟
            </button>
          </div>
          <div className="group relative">
            <span className="pointer-events-none absolute inset-y-0 start-0 grid w-11 place-items-center text-muted transition-colors group-focus-within:text-board">
              <LockIcon />
            </span>
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              className={`field pe-11 ps-11 ${fieldState}`}
              dir="ltr"
              autoComplete="current-password"
              maxLength={128}
              required
              readOnly={busy}
              onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))}
              onBlur={() => setCapsLock(false)}
              aria-invalid={hasError || undefined}
              aria-describedby={hasError ? 'login-error' : undefined}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 end-0 grid w-11 place-items-center rounded-e-md text-muted transition-colors hover:text-ink"
              aria-pressed={showPassword}
              aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>
          {capsLock && (
            <p className="mt-1.5 animate-pop text-xs text-brass">زر الأحرف الكبيرة (Caps Lock) مفعّل</p>
          )}
          {helpOpen && (
            <p className="mt-2 animate-pop rounded-lg bg-paper px-3 py-2 text-xs leading-relaxed text-muted">
              تواصل مع إدارة المدرسة لتصدر لك كلمة مرور مؤقتة جديدة، ثم غيّرها عند أول دخول.
            </p>
          )}
        </div>

        <p id="login-error" role="alert" aria-live="polite" className="mt-4 min-h-5 text-sm text-danger">
          {hasError && <span key={state.nonce} className="inline-block animate-pop">{state.error}</span>}
        </p>

        <button
          ref={buttonRef}
          type="submit"
          disabled={busy}
          aria-busy={pending}
          className={`btn group relative mt-2 w-full overflow-hidden py-3.5 text-base text-chalk disabled:opacity-100 ${
            success ? 'bg-ok' : 'bg-board hover:bg-board-deep hover:shadow-[0_10px_24px_-12px_rgb(53_104_84/0.9)]'
          }`}
        >
          {/* لمعة تعبر الزر أثناء التحقق */}
          {pending && <span aria-hidden className="absolute inset-y-0 w-1/3 animate-sheen bg-gradient-to-l from-transparent via-white/25 to-transparent" />}
          {success ? (
            <span className="flex animate-pop items-center gap-2">
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
                <path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="animate-draw [stroke-dasharray:24] [stroke-dashoffset:24]" />
              </svg>
              تم الدخول
            </span>
          ) : pending ? (
            <span className="flex items-center gap-2">
              <span className="spinner" aria-hidden />
              جارٍ التحقق…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              دخول
              <svg viewBox="0 0 16 16" className="size-4 transition-transform duration-300 group-hover:-translate-x-1" aria-hidden>
                <path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          )}
        </button>
      </form>

      {/* الانتقال بعد النجاح: دائرة خضراء تتسع من الزر حتى تملأ الشاشة */}
      {leaving &&
        createPortal(
        <div
          aria-hidden
          className="fixed inset-0 z-50 grid animate-wipe place-items-center bg-board"
          style={{ ['--wx' as string]: `${leaving.x}px`, ['--wy' as string]: `${leaving.y}px` }}
        >
          <span className="animate-fade-up font-display text-6xl font-bold text-chalk [animation-delay:250ms]">مِرقاة</span>
        </div>,
          document.body,
        )}
    </>
  );
}
