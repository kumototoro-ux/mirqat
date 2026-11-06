/** الثيمات: وضع العرض + لون الهوية. يُحفظ في كوكي ويُطبَّق من الخادم على <html> فلا وميض عند التحميل */
export const THEME_COOKIE = 'mq-theme';
export const PALETTE_COOKIE = 'mq-palette';

export const MODES = [
  { id: 'auto', label: 'تلقائي' },
  { id: 'light', label: 'فاتح' },
  { id: 'dark', label: 'داكن' },
] as const;

export const PALETTES = [
  { id: 'green', label: 'الأخضر', color: '#356854' },
  { id: 'ocean', label: 'الأزرق', color: '#2a6f8a' },
  { id: 'indigo', label: 'النيلي', color: '#4c5aa6' },
  { id: 'plum', label: 'البنفسجي', color: '#7a4b8c' },
  { id: 'copper', label: 'النحاسي', color: '#a3562f' },
  { id: 'slate', label: 'الرمادي', color: '#455a64' },
] as const;

export type Mode = (typeof MODES)[number]['id'];
export type PaletteId = (typeof PALETTES)[number]['id'];

export const parseMode = (v: string | undefined): Mode => (MODES.some((m) => m.id === v) ? (v as Mode) : 'auto');
export const parsePalette = (v: string | undefined): PaletteId => (PALETTES.some((p) => p.id === v) ? (v as PaletteId) : 'green');
