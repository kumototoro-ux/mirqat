import { createClient } from '@/lib/supabase/server';
import { SiteHeader } from '@/components/home/site-header';
import { Hero } from '@/components/home/hero';
import { About, Announcements, Beneficiaries, SiteFooter, type Announcement } from '@/components/home/sections';

/**
 * الصفحة الرئيسية العامة (قبل الدخول): تعريف بالمنصة، والمستفيدون، والإعلانات، والتواصل.
 * المسجّل يوجّهه proxy.ts لصفحته مباشرة.
 * اسم المدرسة وشعارها والإعلانات من الإعدادات العامة (get_public_settings) — الشيء الوحيد المتاح قبل الدخول.
 */
export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.rpc('get_public_settings');
  const settings = (data ?? {}) as Record<string, unknown>;

  const schoolName = text(settings.school_name) ?? 'مدرسة دار الهدى';
  const logoUrl = text(settings.school_logo_url);
  const announcements = parseAnnouncements(settings.announcements);

  return (
    <>
      <SiteHeader logoUrl={logoUrl} />
      <main>
        <Hero schoolName={schoolName} />
        <About schoolName={schoolName} />
        <Beneficiaries />
        <Announcements items={announcements} />
      </main>
      <SiteFooter schoolName={schoolName} />
    </>
  );
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() && v.trim() !== 'مِرقاة' ? v.trim() : null;
}

function parseAnnouncements(v: unknown): Announcement[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((a) => {
    if (!a || typeof a !== 'object') return [];
    const r = a as Record<string, unknown>;
    if (typeof r.title !== 'string' || !r.title.trim()) return [];
    return [{
      title: r.title.trim(),
      body: typeof r.body === 'string' ? r.body : undefined,
      date: typeof r.date === 'string' ? r.date : undefined,
    }];
  });
}
