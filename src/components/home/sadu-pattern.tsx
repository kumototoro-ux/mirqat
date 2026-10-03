/**
 * نقشة هندسية مستوحاة من السدو: معيّنات متداخلة وأسنان منشار.
 * تُرسم بـ SVG مكررة كخلفية، بلون فاتح شفاف فوق الأخضر.
 */
export function SaduPattern({ id = 'sadu', opacity = 0.09 }: { id?: string; opacity?: number }) {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 size-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id={id} width="56" height="56" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="#ffffff" strokeOpacity={opacity} strokeWidth="2">
            <path d="M28 4 L52 28 L28 52 L4 28 Z" />
            <path d="M28 16 L40 28 L28 40 L16 28 Z" />
            <path d="M0 0 L8 8 M56 0 L48 8 M0 56 L8 48 M56 56 L48 48" />
          </g>
          <rect x="25" y="25" width="6" height="6" transform="rotate(45 28 28)" fill="#d9a441" fillOpacity={opacity * 2.2} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
