// الفيديوهات والإثراءات — مشترك بين الخادم والمتصفح

export type ContentKind = 'video' | 'enrichment';
export type ContentStatus = 'published' | 'scheduled' | 'draft' | 'expired';
export type ContentAttachment = { name: string; storage_path: string; mime: string; size_bytes: number; kind: 'image' | 'file' };

export type StaffContent = {
  id: number;
  kind: ContentKind;
  title: string;
  description: string | null;
  url: string | null;
  body: string | null;
  attachments: ContentAttachment[];
  minutes: number | null;
  is_pinned: boolean;
  is_draft: boolean;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
  class_id: number;
  subject_id: number;
  term_id: number | null;
  teacher_id: number | null;
  teacher: string | null;
  status: ContentStatus;
  is_mine: boolean;
  class_size: number;
  viewers: number;
  completed: number;
};

export type StudentContent = {
  id: number;
  kind: ContentKind;
  title: string;
  description: string | null;
  url: string | null;
  body: string | null;
  attachments: ContentAttachment[];
  minutes: number | null;
  is_pinned: boolean;
  published_at: string;
  expires_at: string | null;
  subject_id: number;
  subject: string;
  teacher: string | null;
  opened_at: string | null;
  last_opened_at: string | null;
  completed_at: string | null;
  saved_at: string | null;
};

export type Viewer = { id: number; code: string; name_ar: string; first_opened_at: string | null; last_opened_at: string | null; opens: number; completed_at: string | null };

export type Media =
  | { provider: 'youtube'; id: string; embed: string; thumb: string; watch: string }
  | { provider: 'vimeo'; id: string; embed: string; thumb: null; watch: string }
  | { provider: 'drive'; id: string; embed: string; thumb: null; watch: string }
  | { provider: 'link'; host: string; embed: null; thumb: null; watch: string };

/** يتعرف على يوتيوب (كل صيغ الروابط) وفيميو وقوقل درايف، وإلا رابط خارجي */
export function parseMedia(raw: string | null | undefined): Media | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let yt: string | null = null;
  if (host === 'youtu.be') yt = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
    yt = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{6,})/)?.[1] ?? null;
  }
  if (yt && /^[\w-]{6,20}$/.test(yt)) {
    const t = Number(u.searchParams.get('t')?.replace(/s$/, '') ?? u.searchParams.get('start') ?? 0) || 0;
    return {
      provider: 'youtube',
      id: yt,
      embed: `https://www.youtube-nocookie.com/embed/${yt}?rel=0&modestbranding=1${t ? `&start=${t}` : ''}`,
      thumb: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`,
      watch: `https://www.youtube.com/watch?v=${yt}`,
    };
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = u.pathname.match(/(\d{5,})/)?.[1];
    if (id) return { provider: 'vimeo', id, embed: `https://player.vimeo.com/video/${id}`, thumb: null, watch: `https://vimeo.com/${id}` };
  }
  if (host === 'drive.google.com') {
    const id = u.pathname.match(/\/file\/d\/([\w-]{10,})/)?.[1] ?? u.searchParams.get('id');
    if (id) return { provider: 'drive', id, embed: `https://drive.google.com/file/d/${id}/preview`, thumb: null, watch: `https://drive.google.com/file/d/${id}/view` };
  }
  return { provider: 'link', host, embed: null, thumb: null, watch: u.toString() };
}

export const PROVIDER_LABEL: Record<Media['provider'], string> = { youtube: 'يوتيوب', vimeo: 'فيميو', drive: 'قوقل درايف', link: 'رابط خارجي' };

export const STATUS_LABEL: Record<ContentStatus, { label: string; tone: string }> = {
  published: { label: 'منشور', tone: 'bg-ok-soft text-ok' },
  scheduled: { label: 'مجدول', tone: 'bg-[#e1eef3] text-[#2a6f8a]' },
  draft: { label: 'مسودة', tone: 'bg-paper text-muted' },
  expired: { label: 'منتهي', tone: 'bg-danger-soft text-danger' },
};

export const fileHref = (path: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/task-files/${path}`;

export const isNew = (iso: string | null | undefined, days = 3) => !!iso && Date.now() - Date.parse(iso) < days * 864e5;

export const fmtMinutes = (m: number | null | undefined) => (!m ? null : m < 60 ? `${m} د` : `${Math.floor(m / 60)} س ${m % 60 ? `${m % 60} د` : ''}`.trim());

const rel = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
export function relTime(iso: string | null | undefined) {
  if (!iso) return '';
  const s = (Date.parse(iso) - Date.now()) / 1000;
  const a = Math.abs(s);
  if (a < 60) return 'الآن';
  if (a < 3600) return rel.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rel.format(Math.round(s / 3600), 'hour');
  if (a < 86400 * 30) return rel.format(Math.round(s / 86400), 'day');
  return rel.format(Math.round(s / (86400 * 30)), 'month');
}
