/** إعدادات إمكانية الوصول: كوكي واحدة (mq-a11y) تُطبَّق من الخادم على <html> فلا وميض عند التحميل */
export const A11Y_COOKIE = 'mq-a11y';

export type A11y = {
  /** حجم الخط: 0 عادي، 1 كبير، 2 أكبر، 3 الأكبر */
  text: 0 | 1 | 2 | 3;
  contrast: boolean;
  /** خط أوضح: خط نظام بسيط مع مسافات أوسع */
  font: boolean;
  /** إيقاف الحركات والانتقالات */
  motion: boolean;
  /** تمييز الروابط بخط سفلي */
  links: boolean;
  /** مؤشر فأرة أكبر */
  cursor: boolean;
};

export const A11Y_DEFAULT: A11y = { text: 0, contrast: false, font: false, motion: false, links: false, cursor: false };

export function parseA11y(raw: string | undefined): A11y {
  const out = { ...A11Y_DEFAULT };
  if (!raw) return out;
  const p = new URLSearchParams(raw);
  const t = Number(p.get('t'));
  if (t === 1 || t === 2 || t === 3) out.text = t;
  out.contrast = p.get('c') === '1';
  out.font = p.get('f') === '1';
  out.motion = p.get('m') === '1';
  out.links = p.get('l') === '1';
  out.cursor = p.get('k') === '1';
  return out;
}

export function serializeA11y(a: A11y): string {
  return `t=${a.text}&c=${+a.contrast}&f=${+a.font}&m=${+a.motion}&l=${+a.links}&k=${+a.cursor}`;
}

/** سمات <html> المقابلة (undefined = غير مفعّل) */
export function a11yAttrs(a: A11y) {
  return {
    'data-a11y-text': a.text ? String(a.text) : undefined,
    'data-a11y-contrast': a.contrast ? '1' : undefined,
    'data-a11y-font': a.font ? '1' : undefined,
    'data-a11y-motion': a.motion ? '1' : undefined,
    'data-a11y-links': a.links ? '1' : undefined,
    'data-a11y-cursor': a.cursor ? '1' : undefined,
  };
}

export const isDefault = (a: A11y) => serializeA11y(a) === serializeA11y(A11Y_DEFAULT);
