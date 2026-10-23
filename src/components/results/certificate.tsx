'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { LogoMark } from '@/components/home/logo-mark';
import { certRating, fillTitle, fmt, gradeLabel, principalTitle, type CertImageKind, type CertSettings, type YearCert } from '@/lib/results/certificate';
import { dataUrlToBlob, saveBlob } from './notice';

/* =====================================================================
   شهادة نهاية العام — على نسق الشهادة المعتمدة، بمقاس A4 ثابت (794×1123)
   ===================================================================== */

export const CERT_W = 794;
export const CERT_H = 1123;

export type CertBrand = { logo: string | null; images: Partial<Record<CertImageKind, string>> };

const INK = '#1b2420';
const MINT = '#e3faf1';
const B = `1px solid ${INK}`;

const termEn = (name: string) =>
  /الأول|الاول|أول/.test(name) ? 'First Academic Semester' : /الثاني|ثاني/.test(name) ? 'Second Academic Semester' : /الثالث|ثالث/.test(name) ? 'Third Academic Semester' : name;

const fill = (tpl: string, ar: string, en: string) => tpl.replaceAll('{الصف}', ar).replaceAll('{grade}', en || ar);

const dob = (d: string | null) => {
  if (!d) return { ar: '—', en: '—' };
  const [y, m, day] = d.slice(0, 10).split('-');
  return { ar: `${day}/${m}/${y}`, en: `${y}/${m}/${day}` };
};

const td = (x: React.CSSProperties = {}): React.CSSProperties => ({ border: B, padding: '3px 4px', textAlign: 'center', verticalAlign: 'middle', lineHeight: 1.25, fontVariantNumeric: 'tabular-nums', ...x });

/**
 * كثافة جداول الفصول حسب عدد المواد: قليلها بصفوف أرحب وخط أكبر،
 * وكثيرها بصفوف أضيق وخط أصغر، لتبقى الشهادة في صفحة A4 واحدة
 */
function density(rows: number, terms: number, target: number | null) {
  // تقدير أولي لما يتبقى لصفوف المواد، ثم يُستبدل بالقياس الفعلي بعد الرسم
  const est = (575 - Math.max(0, terms - 2) * 52) / Math.max(1, rows);
  const rowH = Math.max(12.5, Math.min(30, target ?? est));
  const font = Math.max(8.5, Math.min(12.5, rowH * 0.56));
  const pad = Math.max(0.5, (rowH - font * 1.3 - 1) / 2);
  return { rowH, font, head: Math.max(8, Math.min(10.5, font - 1)), pad, headPad: Math.max(1, Math.min(4, pad - 1)) };
}
const th = (x: React.CSSProperties = {}): React.CSSProperties => td({ background: MINT, fontWeight: 700, ...x });

function Lines({ text, size, ltr }: { text: string; size: number; ltr?: boolean }) {
  return (
    <div dir={ltr ? 'ltr' : 'rtl'} style={{ fontSize: size, lineHeight: 1.55, textAlign: 'center', fontWeight: 600 }}>
      {text.split('\n').map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}

function Img({ src, h, w, alt = '' }: { src?: string | null; h: number; w: number; alt?: string }) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} style={{ maxHeight: h, maxWidth: w, objectFit: 'contain', display: 'block', margin: '0 auto' }} />;
}

export function CertificateSheet({ cert, settings, brand }: { cert: YearCert; settings: CertSettings; brand: CertBrand }) {
  const s = cert.student;
  const g = gradeLabel(settings, s.stage, s.grade);
  const overall = certRating(cert.average);
  const passed = !cert.below.length && !cert.missing;
  const d = dob(s.birth_date);
  const vert: React.CSSProperties = { writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap', fontWeight: 700, fontSize: 11.5, margin: '0 auto' };
  const nRows = cert.terms.reduce((a, t) => a + Math.max(1, t.rows.length), 0);
  // ضبط تلقائي بالقياس: ارتفاع كل ما عدا صفوف المواد ثابت، فيُوزَّع الباقي من صفحة A4 على الصفوف بالتساوي
  const box = useRef<HTMLDivElement>(null);
  const spacer = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<number | null>(null);
  const tries = useRef(0);
  const good = useRef<number | null>(null);
  const [fitted, setFitted] = useState(false);
  useEffect(() => {
    // يُقاس بعد أن يرسم المتصفح الإطار فعلًا (requestAnimationFrame)، ثم يُعاد الضبط حتى يستقر
    const id = requestAnimationFrame(() => {
      const el = box.current;
      if (!el || !spacer.current) return;
      if (tries.current >= 99) return setFitted(true);
      const natural = el.offsetHeight - spacer.current.offsetHeight;
      let rowsH = 0;
      el.querySelectorAll<HTMLElement>('tr[data-row]').forEach((r) => (rowsH += r.offsetHeight));
      // متوسط الصف الحالي + نصيبه من الفرق، مع حفظ أكبر قياس ثبت أنه يتسع فلا يتأرجح
      const limit = CERT_H - 4;
      const avg = rowsH / Math.max(1, nRows);
      const fits = natural <= limit;
      if (fits) good.current = Math.max(good.current ?? 0, target ?? avg);
      else if (good.current != null && tries.current > 0) {
        setTarget(good.current);
        tries.current = 99;
        return;
      }
      const next = Math.max(12.5, Math.min(30, avg + (limit - natural) / Math.max(1, nRows)));
      const step = Math.floor(next * 4) / 4;
      if (Math.abs(next - avg) > 0.4 && tries.current < 6 && step !== target) {
        tries.current++;
        setTarget(step);
      } else setFitted(true);
    });
    return () => cancelAnimationFrame(id);
  }, [target, nRows]);
  const D = density(nRows, cert.terms.length, target);
  const sz = D.font;
  const rc = (x: React.CSSProperties = {}) => td({ padding: `${D.pad}px 4px`, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', ...x });
  const rh = (x: React.CSSProperties = {}) => th({ fontSize: D.head, padding: `${D.headPad}px 2px`, lineHeight: 1.15, ...x });
  const long = (t: string | null | undefined, n: number) => { const l = (t ?? '').length; return l > n ? { fontSize: `${Math.max(0.72, n / l)}em`, letterSpacing: -0.1 } : {}; };
  const logo = brand.images.logo ?? brand.logo;
  const pt = principalTitle(settings);
  return (
    <div ref={box} data-fitted={fitted ? '1' : undefined} dir="rtl" style={{ width: CERT_W, minHeight: CERT_H, background: '#fff', color: INK, fontFamily: '"IBM Plex Sans Arabic", system-ui, sans-serif', padding: 14, boxSizing: 'border-box' }}>
      <div style={{ border: '1.5px solid #356854', padding: 3, minHeight: CERT_H - 28, boxSizing: 'border-box', display: 'flex' }}>
        <div style={{ border: '0.75px solid #d9a441', flex: 1, padding: '14px 18px 12px', display: 'flex', flexDirection: 'column' }}>
          {/* الترويسة: الدولة (والجهة الداعمة للمدارس الخاصة) يمينًا، البسملة والشعار وسطًا، الإنجليزي والرؤية يسارًا */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 230px 1fr', alignItems: 'center', gap: 10, minHeight: 150 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.6 }}>{settings.header_ar}</div>
              {settings.school_type === 'private' && settings.sponsor_ar && <Lines text={settings.sponsor_ar} size={12} />}
            </div>
            <div style={{ textAlign: 'center' }}>
              {settings.show_basmala &&
                (brand.images.basmala ? (
                  <div style={{ marginBottom: 6 }}><Img src={brand.images.basmala} h={42} w={210} alt="بسم الله الرحمن الرحيم" /></div>
                ) : (
                  <div style={{ fontFamily: 'Amiri, "IBM Plex Sans Arabic", serif', fontSize: 20, fontWeight: 700, lineHeight: 1.4, marginBottom: 4 }}>بسم الله الرحمن الرحيم</div>
                ))}
              {logo ? <Img src={logo} h={118} w={210} /> : <LogoMark className="mx-auto h-20 w-24" />}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div dir="ltr" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.6 }}>{settings.header_en}</div>
                {settings.school_type === 'private' && settings.sponsor_en && <Lines text={settings.sponsor_en} size={11.5} ltr />}
              </div>
              <Img src={brand.images.vision} h={92} w={190} />
            </div>
          </div>

          {/* العنوان: يُركَّب من القالب + اسم الصف + العام */}
          <div style={{ textAlign: 'center', margin: '8px 0 8px' }}>
            <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.5 }}>{fillTitle(settings.title_ar, g.ar, settings.year_hijri, 'ar')}</div>
            {g.en && <div dir="ltr" style={{ fontSize: 13.5, fontWeight: 600, color: '#2c3a34' }}>{fillTitle(settings.title_en, g.en, settings.year_greg, 'en')}</div>}
          </div>

          {/* بيانات الطالب */}
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 11.5 }}>
            <colgroup>
              <col style={{ width: '15%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '15%' }} />
            </colgroup>
            <tbody>
              {(settings.year_hijri || settings.year_greg) && (
                <tr>
                  <td style={th()}>العام الدراسي</td>
                  <td style={td({ fontWeight: 700 })} colSpan={2}>{settings.year_hijri ? <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{settings.year_hijri}</span> : '—'}{settings.year_hijri ? ' هـ' : ''}</td>
                  <td style={td({ fontWeight: 700 })} colSpan={2} dir="ltr">{settings.year_greg || '—'}</td>
                  <td style={th()} dir="ltr">Academic Year</td>
                </tr>
              )}
              <tr>
                <td style={th()}>اسم المدرسة</td>
                <td style={td({ fontWeight: 700 })} colSpan={2}>
                  {settings.school_ar}
                  {settings.school_code ? (
                    <>
                      <span style={{ fontWeight: 500, color: '#55645d' }}> · </span>
                      <span dir="ltr" style={{ fontWeight: 500, color: '#55645d', unicodeBidi: 'isolate' }}>{settings.school_code}</span>
                    </>
                  ) : null}
                </td>
                <td style={td({ fontWeight: 700 })} colSpan={2} dir="ltr">{settings.school_en}</td>
                <td style={th()} dir="ltr">School Name</td>
              </tr>
              <tr>
                <td style={th()}>اسم الطالب</td>
                <td style={td({ fontWeight: 700 })} colSpan={2}>{s.name_ar}</td>
                <td style={td({ fontWeight: 700, fontSize: (s.name_en ?? '').length > 34 ? 9.5 : 10.5 })} colSpan={2} dir="ltr">{(s.name_en ?? '').toUpperCase()}</td>
                <td style={th()} dir="ltr">Student Name</td>
              </tr>
              <tr>
                <td style={th()}>تاريخ الميلاد</td>
                <td style={td({ fontWeight: 600 })} dir="ltr">{d.ar}</td>
                <td style={th()} dir="ltr">Date of Birth</td>
                <td style={th()}>الجنسية</td>
                <td style={td({ fontWeight: 600 })}>{s.nationality || '—'}</td>
                <td style={th()} dir="ltr">Nationality</td>
              </tr>
              <tr>
                <td style={th()}>رقم الهوية</td>
                <td style={td({ fontWeight: 600 })} dir="ltr">{s.national_id || '—'}</td>
                <td style={th()} dir="ltr">Identity No.</td>
                <td style={th()}>رقم الطالب</td>
                <td style={td({ fontWeight: 600 })} dir="ltr">{s.code}</td>
                <td style={th()} dir="ltr">Student No.</td>
              </tr>
            </tbody>
          </table>

          {/* الفصول الدراسية */}
          {cert.terms.map(({ term, rows }) => (
            <table key={term.id} style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: sz, marginTop: 7 }}>
              <colgroup>
                <col style={{ width: '4%' }} />
                <col style={{ width: '22.5%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '7.5%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '4%' }} />
              </colgroup>
              <tbody>
                <tr>
                  <th style={rh()} rowSpan={Math.max(rows.length, 1) + 1}>
                    <span style={vert}>{term.name}</span>
                  </th>
                  <th style={rh()}>المادة</th>
                  <th style={rh()}>أدوات تقييم متنوعة<div dir="ltr" style={{ fontWeight: 600 }}>Evaluation tools</div></th>
                  <th style={rh()}>اختبارات قصيرة<div dir="ltr" style={{ fontWeight: 600 }}>Short tests</div></th>
                  <th style={rh()}>الاختبار النهائي<div dir="ltr" style={{ fontWeight: 600 }}>Final exam</div></th>
                  <th style={rh()}>المجموع<div dir="ltr" style={{ fontWeight: 600 }}>Total</div></th>
                  <th style={rh()}>التقدير</th>
                  <th style={rh()} dir="ltr">Grade</th>
                  <th style={rh()} dir="ltr">Subject</th>
                  <th style={rh()} rowSpan={Math.max(rows.length, 1) + 1}>
                    <span dir="ltr" style={vert}>{termEn(term.name)}</span>
                  </th>
                </tr>
                {rows.map((r) => {
                  const rt = certRating(r.pct);
                  const v = (k: 'term_work' | 'quizzes' | 'final') => (r.has[k] ? (r[k] == null ? '' : fmt(r[k])) : '-');
                  return (
                    <tr key={r.subject_id} data-row>
                      <td style={rc({ fontWeight: 700, ...long(r.name, 26) })}>{r.name}</td>
                      <td style={rc()} dir="ltr">{v('term_work')}</td>
                      <td style={rc()} dir="ltr">{v('quizzes')}</td>
                      <td style={rc()} dir="ltr">{v('final')}</td>
                      <td style={rc({ fontWeight: 700 })} dir="ltr">{r.total == null ? '' : fmt(r.total)}</td>
                      <td style={rc({ fontWeight: 600 })}>{rt?.ar ?? ''}</td>
                      <td style={rc()} dir="ltr">{rt?.en ?? ''}</td>
                      <td style={rc({ fontWeight: 700, ...long(r.name_en, 24) })} dir="ltr">{r.name_en ?? ''}</td>
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr>
                    <td style={rc({ padding: 10, color: '#6b7a72' })} colSpan={8}>لا درجات معتمدة · No grades</td>
                  </tr>
                )}
              </tbody>
            </table>
          ))}

          {/* التوقيع (تحت اسم المدير مباشرة) | الختم مستقلًا | الملخص */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 1.35fr', gap: 12, marginTop: 10, alignItems: 'center' }}>
            <div style={{ textAlign: 'center', alignSelf: 'start' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{pt.ar}</div>
              <div dir="ltr" style={{ fontSize: 10.5, fontWeight: 600, color: '#55645d' }}>{pt.en}</div>
              {settings.principal_name && <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 5 }}>{settings.principal_name}</div>}
              {settings.principal_name_en && <div dir="ltr" style={{ fontSize: 10.5, color: '#55645d' }}>{settings.principal_name_en}</div>}
              <div style={{ height: 70, marginTop: 2, display: 'grid', placeItems: 'center' }}>
                <Img src={brand.images.signature} h={66} w={170} />
              </div>
            </div>
            <div style={{ display: 'grid', placeItems: 'center' }}>
              <Img src={brand.images.stamp} h={122} w={126} />
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 11.5 }}>
              <colgroup>
                <col style={{ width: '30%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '30%' }} />
              </colgroup>
              <tbody>
                {[
                  { ar: 'المواظبة', en: 'Attendance', v: cert.intisab ? null : fmt(cert.attendance), note: cert.intisab ? { ar: 'منتسب', en: 'Affiliated' } : null },
                  { ar: 'السلوك', en: 'Behavior', v: fmt(cert.behavior) },
                  { ar: 'المجموع التراكمي', en: 'Total Weighted', v: fmt(cert.total) },
                  { ar: 'المعدل', en: 'CGPA', v: cert.average == null ? '—' : `${fmt(cert.average)}%` },
                ].map((x) => (
                  <tr key={x.ar}>
                    <td style={th()}>{x.ar}</td>
                    {x.note ? (
                      <>
                        <td style={td({ fontWeight: 700 })}>{x.note.ar}</td>
                        <td style={td({ fontWeight: 700 })} dir="ltr">{x.note.en}</td>
                      </>
                    ) : (
                      <td style={td({ fontWeight: 700, fontSize: 13 })} colSpan={2} dir="ltr">{x.v}</td>
                    )}
                    <td style={th()} dir="ltr">{x.en}</td>
                  </tr>
                ))}
                <tr>
                  <td style={th()}>التقدير العام</td>
                  <td style={td({ fontWeight: 700, fontSize: 12.5 })}>{overall?.ar ?? '—'}</td>
                  <td style={td({ fontWeight: 700 })} dir="ltr">{overall?.en ?? '—'}</td>
                  <td style={th()} dir="ltr">General Grade</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div ref={spacer} style={{ flex: 1 }} />
          {passed && (
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.7 }}>{fill(settings.closing_ar, g.ar, g.en)}</div>
              {settings.closing_en && <div dir="ltr" style={{ fontSize: 11, color: '#2c3a34', lineHeight: 1.6 }}>{fill(settings.closing_en, g.ar, g.en)}</div>}
            </div>
          )}
          {settings.show_footer && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 8.5, color: '#8a968f' }}>
              <LogoMark className="h-3 w-4" />
              <span>صادرة إلكترونيًا من منصة مِرقاة</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/** صورة الشهادة: PNG للتنزيل كصورة، وJPEG عالي الجودة داخل PDF (حجم أصغر بكثير) */
async function renderPng(node: HTMLElement, jpeg = false) {
  const { toPng, toJpeg } = await import('html-to-image');
  await document.fonts.ready;
  const opts = { pixelRatio: 2, backgroundColor: '#ffffff', width: CERT_W, height: node.offsetHeight, style: { transform: 'none' }, cacheBust: true, quality: 0.9 };
  const fn = jpeg ? toJpeg : toPng;
  await fn(node, opts).catch(() => null);
  return { png: await fn(node, opts), h: node.offsetHeight };
}

async function newPdf() {
  const { jsPDF } = await import('jspdf');
  return new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
}

function addPage(pdf: Awaited<ReturnType<typeof newPdf>>, png: string, h: number) {
  const pw = 210;
  const ph = 297;
  let w = pw;
  let hh = (h / CERT_W) * pw;
  if (hh > ph) {
    w = (ph / hh) * pw;
    hh = ph;
  }
  pdf.addImage(png, png.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', (pw - w) / 2, 0, w, hh, undefined, 'FAST');
}

/** يعرض الشهادة مصغّرة ليناسب العرض، مع تنزيلها PDF أو صورة بمقاسها الأصلي */
export function CertificateViewer({ cert, settings, brand, fileName }: { cert: YearCert; settings: CertSettings; brand: CertBrand; fileName: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(CERT_H);
  const [busy, setBusy] = useState<'png' | 'pdf' | null>(null);
  const { toast } = useFeedback();

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => {
      setScale(Math.min(1, el.clientWidth / CERT_W));
      if (sheet.current) setHeight(sheet.current.offsetHeight);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    if (sheet.current) ro.observe(sheet.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { void import('html-to-image'); void import('jspdf'); }, 1200);
    return () => clearTimeout(t);
  }, []);

  const download = async (kind: 'png' | 'pdf') => {
    setBusy(kind);
    try {
      const { png, h } = await renderPng(sheet.current!, kind === 'pdf');
      if (kind === 'png') saveBlob(dataUrlToBlob(png), `${fileName}.png`);
      else {
        const pdf = await newPdf();
        addPage(pdf, png, h);
        pdf.setProperties({ title: fileName, creator: 'مِرقاة' });
        saveBlob(pdf.output('blob'), `${fileName}.pdf`);
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
          {busy === 'png' ? <span className="spinner" /> : <Icon name="image" className="size-4" />} تنزيل صورة
        </button>
        <span className="text-xs text-muted">بمقاس A4 جاهزة للطباعة</span>
      </div>
      <div ref={wrap} className="w-full">
        <div className="overflow-hidden rounded-2xl border border-line shadow-[0_18px_40px_-28px_rgb(31_42_36/0.45)]" style={{ width: CERT_W * scale, height: height * scale }}>
          <div ref={sheet} style={{ width: CERT_W, transform: `scale(${scale})`, transformOrigin: 'top right' }}>
            <CertificateSheet cert={cert} settings={settings} brand={brand} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * شهادات فصل كامل في ملف PDF واحد (صفحة لكل طالب):
 * تُرسم كل شهادة خارج الشاشة ثم تُلتقط وتُضاف، واحدةً تلو الأخرى
 */
export async function exportClassPdf(
  certs: YearCert[],
  settings: CertSettings,
  brand: CertBrand,
  fileName: string,
  onProgress: (done: number) => void,
) {
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;top:0;left:-${CERT_W + 200}px;width:${CERT_W}px;pointer-events:none;z-index:-1`;
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    const pdf = await newPdf();
    for (let i = 0; i < certs.length; i++) {
      flushSync(() => root.render(<CertificateSheet key={i} cert={certs[i]} settings={settings} brand={brand} />));
      // ينتظر حتى تضبط الشهادة صفوفها على صفحة A4 (بضعة إطارات)
      for (let f = 0; f < 30 && !host.querySelector('[data-fitted]'); f++) await new Promise((r) => requestAnimationFrame(() => r(null)));
      const { png, h } = await renderPng(host.firstElementChild as HTMLElement, true);
      if (i) pdf.addPage();
      addPage(pdf, png, h);
      onProgress(i + 1);
    }
    pdf.setProperties({ title: fileName, creator: 'مِرقاة' });
    saveBlob(pdf.output('blob'), `${fileName}.pdf`);
  } finally {
    root.unmount();
    host.remove();
  }
}
