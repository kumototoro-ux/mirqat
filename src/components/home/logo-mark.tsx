// شعار مِرقاة من الموقع القديم: أربع درجات خضراء متدرجة والخامسة ذهبية
const BARS = [
  { x: 4, y: 58, h: 24, o: 0.55 },
  { x: 22, y: 46, h: 36, o: 0.7 },
  { x: 40, y: 34, h: 48, o: 0.85 },
  { x: 58, y: 22, h: 60, o: 1 },
];

export function LogoMark({
  className = '',
  tone = 'green',
  animated = false,
}: {
  className?: string;
  tone?: 'green' | 'light';
  animated?: boolean;
}) {
  const fill = tone === 'green' ? '#356854' : '#eef4f1';
  const anim = animated ? 'origin-bottom animate-rise [transform-box:fill-box]' : '';
  return (
    <svg viewBox="0 0 96 90" aria-hidden className={className}>
      {BARS.map((b, i) => (
        <rect
          key={b.x}
          x={b.x}
          y={b.y}
          width="16"
          height={b.h}
          rx="2"
          fill={fill}
          fillOpacity={b.o}
          className={anim}
          style={animated ? { animationDelay: `${i * 90}ms` } : undefined}
        />
      ))}
      <rect
        x="76"
        y="10"
        width="16"
        height="72"
        rx="2"
        fill="#d9a441"
        className={anim}
        style={animated ? { animationDelay: '380ms' } : undefined}
      />
    </svg>
  );
}
