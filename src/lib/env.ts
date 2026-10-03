// المفاتيح العامة (تصل للمتصفح). المفتاح السري في supabase/admin.ts وحده.
function need(name: string, value: string | undefined): string {
  if (!value) throw new Error(`المتغير ${name} غير مضبوط — راجع .env.example وإعدادات Vercel`);
  return value;
}

export const SUPABASE_URL = need('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_ANON_KEY = need('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
