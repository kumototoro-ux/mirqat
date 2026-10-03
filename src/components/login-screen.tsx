import { createClient } from '@/lib/supabase/server';
import { LOGIN_PATH, type Portal } from '@/lib/auth/portal';
import { BoardPanel } from '@/components/board-panel';
import { LoginForm } from '@/components/login-form';

const NOTICES: Record<string, { tone: 'ok' | 'danger'; text: string }> = {
  disabled: { tone: 'danger', text: 'هذا الحساب موقوف. راجع إدارة المدرسة.' },
  session: { tone: 'danger', text: 'انتهت الجلسة. سجّل الدخول مجددًا.' },
};

const COPY: Record<Portal, { portal: string; lead: string; other: string }> = {
  staff: {
    portal: 'بوابة الموظفين',
    lead: 'للمعلمين والإداريين، باسم المستخدم الذي استلمته من الإدارة.',
    other: 'أنت طالب؟ ادخل من بوابة الطالب',
  },
  student: {
    portal: 'بوابة الطالب',
    lead: 'باسم المستخدم وكلمة المرور اللذين استلمتهما من المدرسة.',
    other: 'معلم أو إداري؟ ادخل من بوابة الموظفين',
  },
};

export async function LoginScreen({ portal, reason }: { portal: Portal; reason?: string }) {
  const notice = reason ? NOTICES[reason] : undefined;
  const copy = COPY[portal];

  // اسم المدرسة من الإعدادات العامة (الدالة الوحيدة المتاحة قبل الدخول)
  const supabase = await createClient();
  const { data: settings } = await supabase.rpc('get_public_settings');
  const schoolName = pickText(settings, ['school_name', 'اسم المدرسة']);

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <BoardPanel schoolName={schoolName} portal={copy.portal} />

      <section className="flex items-start justify-center px-5 py-10 sm:items-center sm:px-10">
        <div className="w-full max-w-sm">
          <h1 className="text-[1.75rem] font-bold leading-tight text-ink">تسجيل الدخول</h1>
          <p className="mt-2 text-muted">{copy.lead}</p>

          {notice && (
            <p
              role="status"
              className={
                'mt-6 rounded-md px-3 py-2.5 text-sm ' +
                (notice.tone === 'ok' ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger')
              }
            >
              {notice.text}
            </p>
          )}

          <LoginForm portal={portal} />

          <p className="mt-8 border-t border-line pt-5 text-sm">
            <a
              href={LOGIN_PATH[portal === 'staff' ? 'student' : 'staff']}
              className="text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              {copy.other}
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}

function pickText(settings: unknown, keys: string[]): string | null {
  if (!settings || typeof settings !== 'object') return null;
  for (const k of keys) {
    const v = (settings as Record<string, unknown>)[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}
