'use client';

import { useEffect, useState } from 'react';
import { MODES, PALETTES, PALETTE_COOKIE, THEME_COOKIE, parseMode, parsePalette, type Mode, type PaletteId } from '@/lib/theme';

const YEAR = 60 * 60 * 24 * 365;
const save = (name: string, value: string) => { document.cookie = `${name}=${value}; path=/; max-age=${YEAR}; samesite=lax`; };

/** اختيار وضع العرض (تلقائي/فاتح/داكن) ولون الهوية — يُطبَّق فورًا ويبقى على هذا الجهاز */
export function ThemePicker({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [pal, setPal] = useState<PaletteId | null>(null);

  useEffect(() => {
    const d = document.documentElement.dataset;
    setMode(parseMode(d.theme));
    setPal(parsePalette(d.palette));
  }, []);

  const pickMode = (m: Mode) => {
    setMode(m);
    if (m === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = m;
    save(THEME_COOKIE, m);
  };
  const pickPal = (p: PaletteId) => {
    setPal(p);
    if (p === 'green') delete document.documentElement.dataset.palette; else document.documentElement.dataset.palette = p;
    save(PALETTE_COOKIE, p);
  };

  const onBoard = tone === 'dark';
  return (
    <div className="space-y-3 px-1 py-1" data-local="1">
      <div>
        <p className={`mb-1.5 px-2 text-xs font-medium ${onBoard ? 'text-chalk/70' : 'text-muted'}`}>المظهر</p>
        <div role="radiogroup" aria-label="وضع العرض" className={`grid grid-cols-3 gap-1 rounded-xl p-1 ${onBoard ? 'bg-chalk/10' : 'bg-paper'}`}>
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => pickMode(m.id)}
              className={`rounded-lg py-1.5 text-sm transition-colors ${
                mode === m.id ? (onBoard ? 'bg-chalk font-semibold text-board' : 'bg-surface font-semibold text-accent shadow-sm') : onBoard ? 'text-chalk/80 hover:bg-chalk/10' : 'text-muted hover:text-ink'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className={`mb-1.5 px-2 text-xs font-medium ${onBoard ? 'text-chalk/70' : 'text-muted'}`}>لون المنصة</p>
        <div role="radiogroup" aria-label="لون المنصة" className="flex flex-wrap gap-2 px-2">
          {PALETTES.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={pal === p.id}
              aria-label={p.label}
              title={p.label}
              onClick={() => pickPal(p.id)}
              style={{ background: p.color }}
              className={`size-7 rounded-full ring-offset-2 transition-transform hover:scale-110 ${pal === p.id ? `ring-2 ring-gold ${onBoard ? 'ring-offset-board' : 'ring-offset-surface'}` : ''}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
