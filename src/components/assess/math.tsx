'use client';

import 'katex/dist/katex.min.css';
import katex from 'katex';
import { Fragment, useMemo, useRef, useState } from 'react';

/* =====================================================================
   الرياضيات: النص العادي يُكتب كما هو، وما بين $…$ يُعرض معادلة (LaTeX عبر KaTeX)
   مثال: ناتج $\frac{1}{2} + \sqrt{9}$ يساوي؟
   ===================================================================== */

type Seg = { math: boolean; block?: boolean; text: string };

function split(src: string): Seg[] {
  const out: Seg[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ math: false, text: src.slice(last, m.index) });
    out.push({ math: true, block: m[1] != null, text: (m[1] ?? m[2] ?? m[3]).trim() });
    last = re.lastIndex;
  }
  if (last < src.length) out.push({ math: false, text: src.slice(last) });
  return out;
}

export const hasMath = (s: string) => /\$[^$]+\$|\\\(/.test(s);

function Tex({ tex, block }: { tex: string; block?: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { throwOnError: false, displayMode: !!block, output: 'html', strict: 'ignore', trust: false });
    } catch {
      return null;
    }
  }, [tex, block]);
  if (!html) return <code dir="ltr">{tex}</code>;
  return <span dir="ltr" className={block ? 'my-2 block overflow-x-auto overflow-y-hidden text-center' : 'inline-block max-w-full overflow-x-auto overflow-y-hidden align-middle'} dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * نص بمعادلات. blank: يستبدل [[n]] بعنصر (حقل فراغ للطالب، أو شارة للمعلم).
 */
export function RichText({ text, className = '', blank }: { text: string; className?: string; blank?: (n: number) => React.ReactNode }) {
  const segs = useMemo(() => split(text ?? ''), [text]);
  return (
    <span className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${className}`}>
      {segs.map((s, i) =>
        s.math ? (
          <Tex key={i} tex={s.text} block={s.block} />
        ) : blank ? (
          <Fragment key={i}>
            {s.text.split(/(\[\[\d+\]\])/).map((part, j) => {
              const b = part.match(/^\[\[(\d+)\]\]$/);
              return b ? <Fragment key={j}>{blank(Number(b[1]))}</Fragment> : <Fragment key={j}>{part}</Fragment>;
            })}
          </Fragment>
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        ),
      )}
    </span>
  );
}

/* ---------------------------------------------------------------------
   لوحة الرموز للمعلم: تُدرج LaTeX عند المؤشر (وتضيف $ تلقائيًا خارج المعادلة)
--------------------------------------------------------------------- */
type Sym = { label: string; tex: string; caret?: number; title?: string };
const GROUPS: { name: string; items: Sym[] }[] = [
  {
    name: 'أساسي',
    items: [
      { label: 'a⁄b', tex: '\\frac{}{}', caret: 6, title: 'كسر' },
      { label: '√', tex: '\\sqrt{}', caret: 6, title: 'جذر تربيعي' },
      { label: 'ⁿ√', tex: '\\sqrt[n]{}', caret: 9, title: 'جذر نوني' },
      { label: 'x²', tex: '^{2}', title: 'أس' },
      { label: 'xⁿ', tex: '^{}', caret: 2, title: 'أس' },
      { label: 'x₁', tex: '_{}', caret: 2, title: 'دليل سفلي' },
      { label: '×', tex: '\\times ' },
      { label: '÷', tex: '\\div ' },
      { label: '±', tex: '\\pm ' },
      { label: '≠', tex: '\\neq ' },
      { label: '≤', tex: '\\leq ' },
      { label: '≥', tex: '\\geq ' },
      { label: '≈', tex: '\\approx ' },
      { label: 'π', tex: '\\pi ' },
      { label: '∞', tex: '\\infty ' },
      { label: '°', tex: '^{\\circ}' },
      { label: '%', tex: '\\% ' },
      { label: '|x|', tex: '\\left| \\right|', caret: 7, title: 'قيمة مطلقة' },
      { label: '( )', tex: '\\left( \\right)', caret: 7 },
    ],
  },
  {
    name: 'جبر وهندسة',
    items: [
      { label: '∑', tex: '\\sum_{i=1}^{n} ' },
      { label: '∫', tex: '\\int_{a}^{b} ' },
      { label: 'lim', tex: '\\lim_{x \\to } ', caret: 11 },
      { label: 'log', tex: '\\log ' },
      { label: 'ln', tex: '\\ln ' },
      { label: 'sin', tex: '\\sin ' },
      { label: 'cos', tex: '\\cos ' },
      { label: 'tan', tex: '\\tan ' },
      { label: '∠', tex: '\\angle ' },
      { label: '△', tex: '\\triangle ' },
      { label: '∥', tex: '\\parallel ' },
      { label: '⊥', tex: '\\perp ' },
      { label: 'AB̅', tex: '\\overline{AB}' },
      { label: 'v⃗', tex: '\\vec{v}' },
      { label: '∈', tex: '\\in ' },
      { label: '∪', tex: '\\cup ' },
      { label: '∩', tex: '\\cap ' },
      { label: '∅', tex: '\\emptyset ' },
      { label: '{ نظام', tex: '\\begin{cases}  \\\\  \\end{cases}', caret: 14, title: 'نظام معادلات' },
    ],
  },
  {
    name: 'فيزياء وكيمياء',
    items: [
      { label: 'Δ', tex: '\\Delta ' },
      { label: 'α', tex: '\\alpha ' },
      { label: 'β', tex: '\\beta ' },
      { label: 'θ', tex: '\\theta ' },
      { label: 'λ', tex: '\\lambda ' },
      { label: 'μ', tex: '\\mu ' },
      { label: 'ω', tex: '\\omega ' },
      { label: 'Ω', tex: '\\Omega ' },
      { label: 'ρ', tex: '\\rho ' },
      { label: '→', tex: '\\rightarrow ' },
      { label: '⇌', tex: '\\rightleftharpoons ' },
      { label: 'H₂O', tex: '\\mathrm{H_2O}' },
      { label: 'm/s²', tex: '\\mathrm{m/s^2}' },
      { label: '×10ⁿ', tex: '\\times 10^{}', caret: 11, title: 'ترميز علمي' },
      { label: 'نص', tex: '\\text{}', caret: 6, title: 'كلمة عربية داخل المعادلة' },
    ],
  },
];

function insideMath(v: string, pos: number) {
  return (v.slice(0, pos).replace(/\\\$/g, '').split('$').length - 1) % 2 === 1;
}

/** حقل نص مع لوحة رموز ومعاينة حية للمعادلات */
export function MathField({
  value,
  onChange,
  placeholder,
  rows = 2,
  multiline = true,
  className = '',
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  multiline?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState(0);

  const insert = (s: Sym) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const inMath = insideMath(value, start);
    const before = inMath ? '' : '$';
    const text = before + s.tex + (inMath ? '' : '$');
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    const caret = start + before.length + (s.caret ?? s.tex.length);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  const common = {
    ref,
    value,
    placeholder,
    'aria-label': ariaLabel,
    dir: (multiline || !value ? 'rtl' : 'auto') as 'rtl' | 'auto',
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => onChange(e.target.value),
    className: `field ${multiline ? "min-h-[3.2rem] resize-y leading-relaxed pe-11" : "px-10"} ${className}`,
  };

  return (
    <div>
      <div className="relative">
        {multiline ? <textarea rows={rows} {...common} /> : <input {...common} />}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title="رموز رياضية"
          aria-pressed={open}
          className={`absolute end-1.5 top-1.5 grid size-8 place-items-center rounded-lg font-serif text-[0.95rem] italic transition-colors ${open ? 'bg-board text-chalk' : 'text-muted hover:bg-board/10 hover:text-board'}`}
        >
          ƒx
        </button>
      </div>
      {open && (
        <div className="mt-1.5 animate-menu rounded-xl border border-line bg-paper/60 p-2">
          <div className="mb-2 flex gap-1 overflow-x-auto">
            {GROUPS.map((g, i) => (
              <button
                key={g.name}
                type="button"
                onClick={() => setGroup(i)}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${group === i ? 'bg-surface text-board shadow-sm' : 'text-muted hover:text-ink'}`}
              >
                {g.name}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1" dir="ltr">
            {GROUPS[group].items.map((s) => (
              <button
                key={s.tex}
                type="button"
                title={s.title ?? s.tex}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insert(s)}
                className="h-8 min-w-9 rounded-lg border border-line bg-surface px-2 text-sm transition-all hover:-translate-y-0.5 hover:border-board/40 hover:text-board active:scale-95"
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[0.72rem] leading-relaxed text-muted">
            المعادلة تُكتب بين علامتي <code dir="ltr">$ $</code> — مثال: <code dir="ltr">{'$\\frac{3}{4}$'}</code>. الكلمات العربية داخل المعادلة: <code dir="ltr">{'\\text{س}'}</code>
          </p>
        </div>
      )}
      {hasMath(value) && !multiline && (
        <div className="mt-1 px-1 text-sm text-board">
          <RichText text={value} />
        </div>
      )}
      {hasMath(value) && multiline && (
        <div className="mt-1.5 rounded-xl border border-dashed border-board/30 bg-board/[0.03] px-3 py-2 text-[0.95rem]">
          <span className="me-2 text-[0.7rem] font-semibold text-board">معاينة</span>
          <RichText text={value} />
        </div>
      )}
    </div>
  );
}

/** رموز يكتبها الطالب في إجابته القصيرة (بلا LaTeX) */
const STUDENT_SYMBOLS = ['×', '÷', '−', '±', '√', '∛', 'π', '²', '³', '½', '¼', '¾', '°', '≤', '≥', '≠', '≈', '∞', '→', 'Δ'];
export function SymbolBar({ onInsert }: { onInsert: (s: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1" dir="ltr">
      {STUDENT_SYMBOLS.map((s) => (
        <button
          key={s}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(s)}
          className="h-9 min-w-9 rounded-lg border border-line bg-surface px-2 text-base transition-all hover:border-board/40 hover:text-board active:scale-95"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
