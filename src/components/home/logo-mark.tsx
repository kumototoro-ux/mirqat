// شعار مِرقاة: قوس مدبّب يحتضن أربع درجات صاعدة (الأخيرة ذهبية) ونجمة معرفة،
// وقمر ذهبي صغير يدور على حافة القوس. الحركة اختيارية؛ وفي السكون يستقر القمر عند قمة القوس.
const ARCH = 'M16 106V62Q16 30 60 6Q104 30 104 62V106';
const BARS = [
  { x: 34, y: 86, h: 14 },
  { x: 49, y: 75, h: 25 },
  { x: 64, y: 64, h: 36 },
];

export function LogoMark({
  className = '',
  tone = 'green',
  animated = false,
}: {
  className?: string;
  tone?: 'green' | 'light';
  /** يشغّل الرسم التدريجي ودوران القمر */
  animated?: boolean;
}) {
  const ink = tone === 'green' ? '#356854' : '#eef4f1';
  const gold = '#d9a441';
  return (
    <svg viewBox="0 0 120 120" aria-hidden className={`mq-logo ${animated ? 'is-live' : ''} ${className}`}>
      <path d="M8 106H112" stroke={ink} strokeOpacity="0.3" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M25 106V63Q25 37 60 16Q95 37 95 63V106" stroke={ink} strokeOpacity="0.4" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path className="mq-arch" pathLength={1} d={ARCH} stroke={ink} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {BARS.map((b, i) => (
        <rect key={b.x} className="mq-bar" x={b.x} y={b.y} width="10" height={b.h} rx="2" fill={ink} fillOpacity={0.62 + i * 0.19} style={{ animationDelay: `${0.7 + i * 0.12}s` }} />
      ))}
      <rect className="mq-bar" x="79" y="53" width="10" height="47" rx="2" fill={gold} style={{ animationDelay: '1.06s' }} />
      <path className="mq-star" d="M50 29l2.9 6.1L59 38l-6.1 2.9L50 47l-2.9-6.1L41 38l6.1-2.9z" fill={gold} />
      <g className="mq-orbit" style={{ offsetPath: `path('${ARCH}')` }}>
        <circle r="7.5" fill={gold} fillOpacity="0.28" />
        <circle r="3.6" fill={gold} />
      </g>
    </svg>
  );
}
