import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readSessionMeta } from '@/lib/auth/roles';
import { LOGIN_PATH } from '@/lib/auth/portal';

const REASONS = new Set(['disabled', 'session']);

/** الخروج: يمسح الجلسة ثم يعود لبوابة صاحبها (الطالب لبوابة الطالب، والموظف لبوابة الموظفين) */
async function signOut(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const role = readSessionMeta(data?.claims?.app_metadata).role;
  await supabase.auth.signOut();

  const params = request.nextUrl.searchParams;
  const isStudent = role ? role === 'student' : params.get('portal') === 'student';
  const url = new URL(LOGIN_PATH[isStudent ? 'student' : 'staff'], request.url);
  const reason = params.get('reason');
  if (reason && REASONS.has(reason)) url.searchParams.set('reason', reason);
  return NextResponse.redirect(url, { status: 303 });
}

export const GET = signOut;
export const POST = signOut;
