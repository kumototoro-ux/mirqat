import Link from 'next/link';
import { ViewTransition } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Portal } from '@/lib/auth/portal';
import { BoardPanel } from '@/components/board-panel';
import { LoginForm } from '@/components/login-form';
import { AVATARS } from '@/components/home/avatars';

const NOTICES: Record<string, string> = {
  disabled: 'هذا الحساب موقوف. راجع إدارة المدرسة.',
  session: 'انتهت الجلسة. سجّل الدخول مجددًا.',
};

const COPY: Record<Portal, { portal: string; title: string; lead: string; avatar: keyof typeof AVATARS }> = {
  student: {
    portal: 'بوابة الطالب',
    title: 'أهلًا بك يا بطل',
    lead: 'ادخل باسم المستخدم وكلمة المرور اللذين استلمتهما من المدرسة.',
    avatar: 'student',
  },
  staff: {
    portal: 'بوابة الموظفين',
    title: 'أهلًا بك',
    lead: 'للمعلمين والإداريين، باسم المستخدم الذي استلمته من الإدارة.',
    avatar: 'teacher',
  },
};

/**
 * شاشة دخول بوابة واحدة: من اختار بوابته لا يرى غيرها.
 * اللوحة الخضراء نفسها خلفية البطل في الرئيسية (تنكمش إليها عند الانتقال).
 */
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

      <section className="relative isolate flex flex-col overflow-hidden px-5 py-6 sm:px-10">
        {/* نقطتان ضوئيتان خلف البطاقة تعطيان عمقًا هادئًا */}
        <div aria-hidden className="absolute -end-24 -top-24 -z-10 size-80 rounded-full bg-board/10 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 start-10 -z-10 size-96 rounded-full bg-gold/10 blur-3xl" />

        <Link
          href="/"
          className="group inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface hover:text-board"
        >
          <svg viewBox="0 0 16 16" className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden>
            <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          الرئيسية
        </Link>

        <div className="flex flex-1 items-start justify-center pb-6 pt-6 sm:items-center sm:pt-0">
          <ViewTransition enter="page-in" exit="page-out" default="none">
            <div className="w-full max-w-[26rem] animate-fade-up [animation-delay:150ms]">
              <div className="flex items-center gap-4">
                <span className="grid size-14 shrink-0 animate-pop place-items-center rounded-2xl bg-board shadow-[0_12px_24px_-12px_rgb(53_104_84/0.9)] [animation-delay:350ms]">
                  <svg viewBox="0 0 64 64" className="size-9">{AVATARS[copy.avatar]}</svg>
                </span>
                <div>
                  <h1 className="text-[1.75rem] font-bold leading-tight text-ink">{copy.title}</h1>
                  <p className="text-sm font-medium text-board">{copy.portal}</p>
                </div>
              </div>
              <p className="mt-4 text-muted">{copy.lead}</p>

              {notice && (
                <p role="status" className="mt-5 animate-pop rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
                  {notice}
                </p>
              )}

              <LoginForm portal={portal} />
            </div>
          </ViewTransition>
        </div>
      </section>
    </main>
  );
}
