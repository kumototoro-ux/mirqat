'use client';

import '@fontsource/aref-ruqaa/arabic-700.css';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { dataUrlToBlob, saveBlob } from '@/components/results/notice';
import { certDates, certFileName, certText, typeMeta, type AppreciationBrand, type AppreciationView } from '@/lib/certs/appreciation';

/* =====================================================================
   شهادة الشكر والتقدير — A4 أفقي (1123×794) بقالبين هادئين:
   رسمي (الأوائل/الحضور/السلوك) وعصري (المادة/الأنشطة/التقدير الخاص).
   الشعار والرؤية والبسملة والتوقيع والختم من إعدادات الشهادة.
   ===================================================================== */

export const AW = 1123;
export const AH = 794;
const SANS = '"IBM Plex Sans Arabic", system-ui, sans-serif';
const KUFI = '"Reem Kufi", "IBM Plex Sans Arabic", serif';
const NAME = '"Amiri", "IBM Plex Sans Arabic", serif';
const RUQAA = '"Aref Ruqaa", "Amiri", serif';

/** حجم خط يتقلّص مع طول النص ليبقى في سطر/أسطر محدودة */
const fit = (text: string, size: number, fitsChars: number, min: number) => {
  const l = [...text].length;
  return l <= fitsChars ? size : Math.max(min, Math.round((size * fitsChars) / l));
};

function Star({ cx, cy, r, color, width = 2 }: { cx: number; cy: number; r: number; color: string; width?: number }) {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const rr = i % 2 === 0 ? r : r * 0.62;
    const a = Math.PI / 8 + (Math.PI * i) / 8;
    pts.push(`${cx + Math.cos(a) * rr},${cy + Math.sin(a) * rr}`);
  }
  return <polygon points={pts.join(' ')} fill="none" stroke={color} strokeWidth={width} />;
}

function Emblem({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="-50 -50 100 100" aria-hidden>
      <circle r="48" fill={color} />
      <polygon points={Array.from({ length: 16 }, (_, i) => { const rr = i % 2 ? 18 : 31; const a = Math.PI / 8 + (Math.PI * i) / 8; return `${Math.cos(a) * rr},${Math.sin(a) * rr}`; }).join(' ')} fill="rgba(255,255,255,.92)" />
      <circle r="8" fill={color} />
    </svg>
  );
}

function Logos({ brand, color, top, side, h }: { brand: AppreciationBrand; color: string; top: number; side: number; h: number }) {
  return (
    <>
      <div style={{ position: 'absolute', top, right: side, width: h * 1.25, height: h, display: 'grid', placeItems: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {brand.images.logo ? <img src={brand.images.logo} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <Emblem color={color} size={h * 0.8} />}
      </div>
      {brand.images.vision && (
        <div style={{ position: 'absolute', top, left: side, width: h * 1.6, height: h, display: 'grid', placeItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.images.vision} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
      )}
    </>
  );
}

function Stats({ items, a, soft }: { items: { label: string; value: string }[]; a: string; soft: string }) {
  const st = items.filter((s) => s.value).slice(0, 3);
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 22 }}>
      {st.map((s) => (
        <div key={s.label} style={{ width: 200, padding: '10px 10px 9px', borderRadius: 14, background: soft, border: '1px solid rgba(0,0,0,.06)', textAlign: 'center' }}>
          <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: fit(s.value, 22, 14, 13), color: a, lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden' }}>{s.value}</div>
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: '#6b7280', marginTop: 2 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/** توقيع: صورة التوقيع فوق الخط (للمدير)، ثم المسمى والاسم */
function Sign({ title, name, sig, color }: { title: string; name: string; sig?: string; color: string }) {
  return (
    <div style={{ width: 230, textAlign: 'center', fontFamily: SANS }}>
      <div style={{ height: 58, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {sig && <img src={sig} alt="" style={{ maxHeight: 58, maxWidth: 190, objectFit: 'contain', marginBottom: -6 }} />}
      </div>
      <div style={{ borderTop: '1.5px solid rgba(0,0,0,.25)', paddingTop: 6 }}>
        <div style={{ fontWeight: 600, fontSize: 16, color: '#374151' }}>{title}</div>
        {name && <div style={{ fontSize: fit(name, 15, 24, 11), color, marginTop: 2, whiteSpace: 'nowrap' }}>{name}</div>}
      </div>
    </div>
  );
}

function Signatures({ v, brand, color, bottom, inset }: { v: AppreciationView; brand: AppreciationBrand; color: string; bottom: number; inset: number }) {
  const stamp = brand.images.stamp;
  return (
    <div style={{ position: 'absolute', left: inset, right: inset, bottom, display: 'flex', justifyContent: v.issuer_role ? 'space-between' : 'center', alignItems: 'flex-end' }}>
      {v.issuer_role && <Sign title={v.issuer_role} name={v.issuer ?? ''} color={color} />}
      {/* الختم بجوار توقيع المدير (لا تحته): في الوسط بين التوقيعين، أو يسار توقيع المدير وحده */}
      {stamp && (
        <div style={{ position: 'absolute', left: v.issuer_role ? '50%' : 'calc(50% - 250px)', bottom: 4, transform: v.issuer_role ? 'translateX(-50%) rotate(-8deg)' : 'rotate(-8deg)', width: 112, height: 112, opacity: 0.92 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={stamp} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
      )}
      <Sign title={brand.principal.title} name={brand.principal.name} sig={brand.images.signature} color={color} />
    </div>
  );
}

function Basmala({ brand, top, color }: { brand: AppreciationBrand; top: number; color: string }) {
  if (!brand.showBasmala) return null;
  return (
    <div style={{ position: 'absolute', top, left: 0, right: 0, display: 'flex', justifyContent: 'center', height: 34 }}>
      {brand.images.basmala ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.images.basmala} alt="" style={{ maxHeight: 34, maxWidth: 260, objectFit: 'contain' }} />
      ) : (
        <span style={{ fontFamily: NAME, fontWeight: 700, fontSize: 19, color }}>بسم الله الرحمن الرحيم</span>
      )}
    </div>
  );
}

function Body({ v, brand, a, b, soft, top, maxW }: { v: AppreciationView; brand: AppreciationBrand; a: string; b: string; soft: string; top: number; maxW: number }) {
  const t = certText(v, brand.school);
  return (
    <div style={{ position: 'absolute', top, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div style={{ fontFamily: SANS, fontSize: fit(t.intro, 21, 60, 16), color: '#1f2937', maxWidth: maxW }}>{t.intro}</div>
      <div style={{ fontFamily: NAME, fontWeight: 700, fontSize: fit(v.student, 52, 24, 32), color: a, lineHeight: 1.45, marginTop: 4, whiteSpace: 'nowrap' }}>{v.student}</div>
      <div style={{ fontFamily: SANS, fontSize: 13.5, color: '#6b7280', marginTop: -4 }}>{v.class_label}{v.branch ? ` · ${v.branch}` : ''}</div>
      {t.ribbon && <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 19, color: b, marginTop: 10 }}>{t.ribbon}</div>}
      <p style={{ fontFamily: SANS, fontSize: fit(t.body, 18.5, 190, 14.5), color: '#374151', lineHeight: 1.85, maxWidth: maxW, margin: `${t.ribbon ? 8 : 14}px 0 18px` }}>{t.body}</p>
      <Stats items={t.stats} a={a} soft={soft} />
    </div>
  );
}

function Formal({ v, brand }: { v: AppreciationView; brand: AppreciationBrand }) {
  const { a, b, soft, s } = typeMeta(v.type).pal;
  return (
    <>
      <svg width={AW} height={AH} style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <rect width={AW} height={AH} fill="#eceef1" />
        <polygon points={`${AW - 360},0 ${AW},0 ${AW},245`} fill={s[0]} />
        <polygon points={`${AW - 490},0 ${AW - 410},0 ${AW},360 ${AW},300`} fill={s[1]} />
        <polygon points={`0,${AH} 0,${AH - 270} 335,${AH}`} fill={s[0]} />
        <polygon points={`0,360 0,488 84,443 84,385`} fill={s[1]} />
        <polygon points={`${AW},450 ${AW},578 ${AW - 77},527 ${AW - 77},475`} fill={s[2]} />
        <polygon points={`410,${AH} 488,${AH} 167,${AH - 58}`} fill={s[2]} />
      </svg>
      <div style={{ position: 'absolute', inset: 34, background: '#fff', boxShadow: '0 8px 24px rgba(20,40,60,.18)' }} />
      <div style={{ position: 'absolute', inset: 50, border: `1px solid ${a}2e` }} />
      <div style={{ position: 'absolute', inset: 56, border: `0.75px solid ${b}55` }} />
      <svg width={AW} height={AH} style={{ position: 'absolute', inset: 0, opacity: 0.05 }} aria-hidden>
        {[78, 117, 156, 195, 234].map((r) => <Star key={r} cx={AW / 2} cy={420} r={r} color={a} />)}
      </svg>
      <Logos brand={brand} color={a} top={72} side={84} h={96} />
      <Basmala brand={brand} top={66} color={a} />
      <div style={{ position: 'absolute', top: brand.showBasmala ? 98 : 84, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ fontFamily: KUFI, fontWeight: 700, fontSize: 52, color: a, wordSpacing: 14, lineHeight: 1.3 }}>شهادة شكر وتقدير</div>
        <svg width="260" height="20" viewBox="0 0 260 20" aria-hidden style={{ display: 'block', margin: '2px auto 0' }}>
          <line x1="0" y1="10" x2="112" y2="10" stroke={b} strokeWidth="2" />
          <line x1="148" y1="10" x2="260" y2="10" stroke={b} strokeWidth="2" />
          <polygon points="130,2 138,10 130,18 122,10" fill={b} />
        </svg>
      </div>
      <Body v={v} brand={brand} a={a} b={b} soft={soft} top={brand.showBasmala ? 200 : 190} maxW={700} />
      <Signatures v={v} brand={brand} color={a} bottom={88} inset={150} />
      <div style={{ position: 'absolute', bottom: 64, left: 0, right: 0, textAlign: 'center', fontFamily: SANS, fontSize: 12, color: '#6b7280' }}>حُرّرت بتاريخ {certDates(v.issued_at)}</div>
    </>
  );
}

function Diamond({ x, y, s, fill, stroke }: { x: number; y: number; s: number; fill: string; stroke?: string }) {
  return <rect x={x - s / 2} y={y - s / 2} width={s} height={s} transform={`rotate(45 ${x} ${y})`} fill={fill} stroke={stroke} strokeWidth={stroke ? 2 : 0} />;
}

function Modern({ v, brand }: { v: AppreciationView; brand: AppreciationBrand }) {
  const { a, b, soft, s } = typeMeta(v.type).pal;
  const side = (flip: boolean) => {
    const X = (x: number) => (flip ? AW - x : x);
    const id = flip ? 'r' : 'l';
    return (
      <g key={id}>
        <Diamond x={X(32)} y={78} s={96} fill={`url(#g1${id})`} />
        <Diamond x={X(26)} y={215} s={122} fill={`url(#g2${id})`} />
        <Diamond x={X(78)} y={350} s={135} fill={`url(#g1${id})`} />
        <Diamond x={X(26)} y={492} s={110} fill={`url(#g2${id})`} />
        <Diamond x={X(78)} y={622} s={128} fill={`url(#g1${id})`} />
        <Diamond x={X(32)} y={757} s={110} fill={`url(#g2${id})`} />
        <Diamond x={X(130)} y={220} s={64} fill="none" stroke="rgba(150,170,180,.45)" />
        <Diamond x={X(139)} y={479} s={45} fill="#dfe3e6" />
        <Diamond x={X(133)} y={84} s={35} fill="#dfe3e6" />
        <Diamond x={X(149)} y={718} s={41} fill="#dfe3e6" />
        <Diamond x={X(137)} y={362} s={14} fill={a} />
      </g>
    );
  };
  return (
    <>
      <svg width={AW} height={AH} style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <defs>
          {['l', 'r'].map((id) => (
            <g key={id}>
              <linearGradient id={`g1${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={s[0]} /><stop offset="1" stopColor={s[1]} /></linearGradient>
              <linearGradient id={`g2${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={s[1]} /><stop offset="1" stopColor={s[0]} /></linearGradient>
            </g>
          ))}
        </defs>
        <rect width={AW} height={AH} fill="#fff" />
        {side(false)}
        {side(true)}
        <line x1={AW / 2 - 130} y1={AH - 48} x2={AW / 2 + 130} y2={AH - 48} stroke={s[2]} strokeWidth="1.5" />
      </svg>
      <Logos brand={brand} color={a} top={52} side={196} h={84} />
      <Basmala brand={brand} top={46} color={a} />
      <div style={{ position: 'absolute', top: brand.showBasmala ? 78 : 64, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ fontFamily: RUQAA, fontWeight: 700, fontSize: 64, color: a, lineHeight: 1.45 }}>شهادة شكر وتقدير</div>
        <div style={{ width: 260, height: 1.5, background: 'rgba(0,0,0,.12)', margin: '10px auto 0' }} />
      </div>
      <Body v={v} brand={brand} a={a} b={b} soft={soft} top={brand.showBasmala ? 200 : 186} maxW={640} />
      <Signatures v={v} brand={brand} color={a} bottom={78} inset={235} />
      <div style={{ position: 'absolute', bottom: 56, left: 0, right: 0, textAlign: 'center', fontFamily: SANS, fontSize: 12, color: '#6b7280' }}>حُرّرت بتاريخ {certDates(v.issued_at)}</div>
    </>
  );
}

export function AppreciationSheet({ v, brand }: { v: AppreciationView; brand: AppreciationBrand }) {
  return (
    <div dir="rtl" data-cert-sheet style={{ position: 'relative', width: AW, height: AH, overflow: 'hidden', background: '#fff', color: '#1f2937' }}>
      {typeMeta(v.type).layout === 'formal' ? <Formal v={v} brand={brand} /> : <Modern v={v} brand={brand} />}
    </div>
  );
}

/* ---------------------------------------------------------------------
   التصدير: PNG بدقة مضاعفة، وPDF أفقي (JPEG داخله لحجم أصغر)
--------------------------------------------------------------------- */
async function snap(node: HTMLElement, jpeg: boolean) {
  const { toPng, toJpeg } = await import('html-to-image');
  await document.fonts.ready;
  const opts = { pixelRatio: 2.5, backgroundColor: '#ffffff', width: AW, height: AH, style: { transform: 'none' }, cacheBust: true, quality: 0.92 };
  const fn = jpeg ? toJpeg : toPng;
  await fn(node, opts).catch(() => null); // التمريرة الأولى تُحمّل الخطوط والصور داخل الصورة
  return fn(node, opts);
}
async function landscapePdf() {
  const { jsPDF } = await import('jspdf');
  return new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
}

/** عرض الشهادة مصغّرة على عرض الحاوية + تنزيل PDF/صورة */
export function AppreciationViewer({ v, brand, actions }: { v: AppreciationView; brand: AppreciationBrand; actions?: React.ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [busy, setBusy] = useState<'png' | 'pdf' | null>(null);
  const { toast } = useFeedback();

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / AW)));
    ro.observe(el);
    setScale(Math.min(1, el.clientWidth / AW));
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const t = setTimeout(() => { void import('html-to-image'); void import('jspdf'); }, 1000);
    return () => clearTimeout(t);
  }, []);

  const download = async (kind: 'png' | 'pdf') => {
    if (!sheet.current) return;
    setBusy(kind);
    try {
      const img = await snap(sheet.current.firstElementChild as HTMLElement, kind === 'pdf');
      if (kind === 'png') saveBlob(dataUrlToBlob(img), `${certFileName(v)}.png`);
      else {
        const pdf = await landscapePdf();
        pdf.addImage(img, 'JPEG', 0, 0, 297, 210, undefined, 'FAST');
        pdf.setProperties({ title: certFileName(v), creator: 'مِرقاة' });
        saveBlob(pdf.output('blob'), `${certFileName(v)}.pdf`);
      }
      toast(kind === 'png' ? 'نُزّلت الشهادة صورةً' : 'نُزّلت الشهادة PDF');
    } catch {
      toast('تعذّر التنزيل. حدّث الصفحة وحاول مجددًا', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => download('pdf')} disabled={!!busy} className="btn-primary">
          {busy === 'pdf' ? <span className="spinner" /> : <Icon name="download" className="size-4" />} تنزيل PDF
        </button>
        <button type="button" onClick={() => download('png')} disabled={!!busy} className="btn-quiet">
          {busy === 'png' ? <span className="spinner" /> : <Icon name="image" className="size-4" />} صورة
        </button>
        {actions}
      </div>
      <div ref={wrap} className="w-full">
        <div className="overflow-hidden rounded-xl border border-line shadow-[0_18px_40px_-28px_rgb(31_42_36/0.45)]" style={{ width: AW * scale, height: AH * scale }}>
          <div ref={sheet} style={{ width: AW, height: AH, transform: `scale(${scale})`, transformOrigin: 'top right' }}>
            <AppreciationSheet v={v} brand={brand} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** عدة شهادات في ملف PDF واحد — تُرسم كل واحدة خارج الشاشة ثم تُلتقط */
export async function exportCertsPdf(list: AppreciationView[], brand: AppreciationBrand, fileName: string, onProgress: (n: number) => void) {
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;top:0;left:-${AW + 200}px;width:${AW}px;height:${AH}px;pointer-events:none;z-index:-1`;
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    const pdf = await landscapePdf();
    for (let i = 0; i < list.length; i++) {
      flushSync(() => root.render(<AppreciationSheet key={i} v={list[i]} brand={brand} />));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const img = await snap(host.firstElementChild as HTMLElement, true);
      if (i) pdf.addPage('a4', 'landscape');
      pdf.addImage(img, 'JPEG', 0, 0, 297, 210, undefined, 'FAST');
      onProgress(i + 1);
    }
    pdf.setProperties({ title: fileName, creator: 'مِرقاة' });
    saveBlob(pdf.output('blob'), `${fileName}.pdf`);
  } finally {
    root.unmount();
    host.remove();
  }
}
