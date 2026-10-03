import Link from 'next/link';
import { ViewTransition } from 'react';
import { createClient } from '@/lib/supabase/server';
import { LOGIN_PATH, type Portal } from '@/lib/auth/portal';
import { BoardPanel } from '@/components/board-panel';
import { LoginForm } from '@/components/login-form';

const NOTICES: Record<string, { tone: 'ok' | 'danger'; text: string }> = {
  disabled: { tone: 'danger', text: 'هذا الحساب موقوف. راجع إدارة المدرسة.' },
  session: { tone: 'danger', text: 'انتهت الجلسة. سجّل الدخول مجددًا.' },
};

const COPY: Record<Portal, { portal: string; title: string; lead: string }> = {
  student: {
    portal: 'بوابة الطالب',
    title: 'أهلًا بك يا بطل',
    lead: 'ادخل باسم المستخدم وكلمة المرور اللذين استلمتهما من المدرسة.',
  },
  staff: {
    portal: 'بوابة الموظفين',
    title: 'تسجيل دخول الموظفين',
    lead: 'للمعلمين والإداريين، باسم المستخدم الذي استلمته من الإدارة.',
  },
};

const TABS: { portal: Portal; label: string }[] = [
  { portal: 'student', label: 'طالب' },
  { portal: 'staff', label: 'معلم أو إداري' },
];

export async function LoginScreen({ portal, reason }: { portal: Portal; reason?: string }) {
  const notice = reason ? NOTICES[reason] : undefined;
  const copy = COPY[portal];

  const supabase = await createClient();
  const { data: settings } = await supabase.rpc('get_public_settings');
  const school = (settings as Record<string, unknown> | null)?.school_name;
  const schoolName = typeof school === 'string' && school.trim() && school.trim() !== 'مِرقاة' ? school.trim() : null;

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <BoardPanel schoolName={schoolName} portal={copy.portal} />

      <section className="flex flex-col px-5 py-6 sm:px-10">
        <Link
          href="/"
          className="group inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted transition-colors hover:text-board"
        >
          <svg viewBox="0 0 16 16" className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden>
            <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          الرئيسية
        </Link>

        <div className="flex flex-1 items-start justify-center pt-8 sm:items-center sm:pt-0">
          <div className="w-full max-w-sm">
            {/* التبديل بين البوابتين: المؤشر الأخضر ينتقل بين التبويبين */}
            <nav aria-label="نوع الحساب" className="grid grid-cols-2 rounded-full border border-line bg-surface p-1">
              {TABS.map((t) => {
                const active = t.portal === portal;
                return (
                  <Link
                    key={t.portal}
                    href={LOGIN_PATH[t.portal]}
                    aria-current={active ? 'page' : undefined}
                    replace
                    className={`relative rounded-full px-3 py-2 text-center text-sm font-semibold transition-colors duration-300 ${active ? 'text-chalk' : 'text-muted hover:text-ink'}`}
                  >
                    {active && (
                      <ViewTransition name="portal-pill" share="pill" default="none">
                        <span aria-hidden className="absolute inset-0 rounded-full bg-board shadow-[0_6px_16px_-8px_rgb(53_104_84/0.9)]" />
                      </ViewTransition>
                    )}
                    <span className="relative">{t.label}</span>
                  </Link>
                );
              })}
            </nav>

            <ViewTransition enter="portal-in" exit="portal-out" default="none">
              <div className="mt-9 animate-fade-up [animation-delay:200ms]">
                <h1 className="text-[1.75rem] font-bold leading-tight text-ink">{copy.title}</h1>
                <p className="mt-2 text-muted">{copy.lead}</p>

                {notice && (
                  <p
                    role="status"
                    className={
                      'mt-6 animate-pop rounded-md px-3 py-2.5 text-sm ' +
                      (notice.tone === 'ok' ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger')
                    }
                  >
                    {notice.text}
                  </p>
                )}

                <LoginForm portal={portal} />
              </div>
            </ViewTransition>
          </div>
        </div>
      </section>
    </main>
  );
}
