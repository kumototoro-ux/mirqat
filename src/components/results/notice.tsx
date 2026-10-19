'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { LogoMark } from '@/components/home/logo-mark';
import { SECTIONS, n2, rating, type NoticeSettings, type ReportSubject, type ReportStudent, type TermInfo } from '@/lib/results/shared';

/* =====================================================================
   إشعار درجات الفصل الدراسي — ثنائي اللغة، بمقاس A4 ثابت (794px)
   يُعرض مصغّرًا ليناسب أي شاشة، ويُصدَّر بمقاسه الأصلي صورةً أو PDF
   ===================================================================== */

export const NOTICE_WIDTH = 794;

export type NoticeData = {
  term: TermInfo | null;
  subjects: ReportSubject[];
  student: ReportStudent;
  school: { name: string; logo: string | null };
  settings: NoticeSettings;
};

const termEn = (name: string) =>
  /الأول|الاول|أول/.test(name) ? 'First Term' : /الثاني|ثاني/.test(name) ? 'Second Term' : /الثالث|ثالث/.test(name) ? 'Third Term' : /الصيفي/.test(name) ? 'Summer Term' : name;

const issued = () => {
  const d = new Date();
  return {
    g: new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh' }).format(d),
    h: new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh' }).format(d),
  };
};

function Score({ v, max, strong }: { v: number | null; max?: number | null; strong?: boolean }) {
  if (v == null) return <span style={{ color: '#9aa6a0' }}>—</span>;
  return (
    <span dir="ltr" style={{ whiteSpace: 'nowrap' }}>
      <b style={{ fontSize: strong ? 15 : 13.5, color: '#1f2a24' }}>{n2(v)}</b>
      {max ? <span style={{ fontSize: 10.5, color: '#7b8a82' }}> / {n2(max)}</span> : null}
    </span>
  );
}

function Bi({ ar, en, align = 'center' }: { ar: string; en?: string | null; align?: 'center' | 'start' }) {
  // تحت رأس الجدول الأخضر: الإنجليزي بلون فاتح
  return (
    <span style={{ display: 'block', textAlign: align }}>
      <span style={{ display: 'block', fontWeight: 600 }}>{ar}</span>
      {en ? <span dir="ltr" style={{ display: 'block', fontSize: 10, color: 'rgba(238,244,241,.72)', fontWeight: 500, letterSpacing: 0.2, textAlign: align === 'start' ? 'right' : 'center' }}>{en}</span> : null}
    </span>
  );
}

export function NoticeSheet({ data }: { data: NoticeData }) {
  const { student: s, subjects, term, school, settings } = data;
  const by = new Map(subjects.map((x) => [x.id, x]));
  const rows = s.subjects.map((r) => ({ r, sub: by.get(r.subject_id) })).filter((x) => x.sub);
  const shown = SECTIONS.filter((sec) => subjects.some((x) => Number(x[sec.key]) > 0));
  const cols = shown.length ? shown : SECTIONS;
  const overall = rating(s.average);
  const att = s.attendance;
  const attR = rating(att.pct);
  const behR = rating(s.behavior.score);
  const when = issued();
  const intisab = att.pct == null && att.intisab;
  const cell: React.CSSProperties = { padding: '9px 8px', borderBottom: '1px solid #e4eae7', textAlign: 'center', verticalAlign: 'middle' };
  const head: React.CSSProperties = { padding: '9px 6px', fontSize: 12, color: '#eef4f1', background: '#356854', textAlign: 'center', verticalAlign: 'middle' };

  return (
    <div
      dir="rtl"
      style={{ width: NOTICE_WIDTH, minHeight: 1123, background: '#ffffff', color: '#1f2a24', fontFamily: '"IBM Plex Sans Arabic", system-ui, sans-serif', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
    >
      {/* رأس الإشعار: شريط أخضر بنقشة السدو */}
      <div style={{ position: 'relative', background: '#356854', color: '#eef4f1', padding: '26px 36px 22px', overflow: 'hidden' }}>
        <svg aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <defs>
            <pattern id="notice-sadu" width="44" height="44" patternUnits="userSpaceOnUse">
              <g fill="none" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1.6">
                <path d="M22 3 L41 22 L22 41 L3 22 Z" />
                <path d="M22 12 L32 22 L22 32 L12 22 Z" />
              </g>
              <rect x="19.5" y="19.5" width="5" height="5" transform="rotate(45 22 22)" fill="#d9a441" fillOpacity="0.2" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#notice-sadu)" />
        </svg>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 74, height: 74, borderRadius: 18, background: '#ffffff', display: 'grid', placeItems: 'center', flexShrink: 0, boxShadow: '0 8px 20px -10px rgba(0,0,0,.45)' }}>
            {school.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={school.logo} alt="" style={{ maxWidth: 60, maxHeight: 60, objectFit: 'contain' }} />
            ) : (
              <LogoMark className="h-11 w-12" />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: '#d9a441', fontWeight: 600 }}>{school.name}</div>
            <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.35, marginTop: 2 }}>إشعار درجات الفصل الدراسي</div>
            <div dir="ltr" style={{ fontSize: 12.5, color: 'rgba(238,244,241,.78)', textAlign: 'right', letterSpacing: 0.3 }}>Semester Grade Notice</div>
          </div>
          <div style={{ textAlign: 'center', background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 14, padding: '8px 14px', flexShrink: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{term?.name ?? ''}</div>
            <div dir="ltr" style={{ fontSize: 10.5, color: 'rgba(238,244,241,.75)' }}>{term ? termEn(term.name) : ''}</div>
            <div style={{ fontSize: 11.5, color: '#d9a441', marginTop: 2, fontWeight: 600 }}>{term?.year ? `العام ${term.year}` : ''}</div>
          </div>
        </div>
      </div>
      <div style={{ height: 5, background: 'linear-gradient(90deg,#d9a441,#e9c57a 40%,#d9a441)' }} />

      <div style={{ padding: '22px 36px 0', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* بيانات الطالب */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 0, border: '1px solid #e1e8e4', borderRadius: 16, overflow: 'hidden' }}>
          {[
            { ar: 'اسم الطالب', en: 'Student Name', v: s.name_ar, sub: s.name_en },
            { ar: 'رقم الطالب', en: 'Student No.', v: s.code, ltr: true },
            { ar: 'رقم الهوية', en: 'National ID', v: s.national_id || '—', ltr: true },
            { ar: 'الصف والشعبة', en: 'Grade & Section', v: [s.grade, s.section].filter(Boolean).join(' / ') || '—' },
            { ar: 'المرحلة', en: 'Stage', v: s.stage || '—' },
            { ar: 'الفرع', en: 'Branch', v: s.branch || '—' },
          ].map((f, i) => (
            <div key={f.ar} style={{ padding: '9px 14px', background: i % 2 ? '#fafcfb' : '#f4f8f6', borderInlineStart: i % 3 ? '1px solid #e1e8e4' : 'none', borderTop: i > 2 ? '1px solid #e1e8e4' : 'none' }}>
              <div style={{ fontSize: 10.5, color: '#6b7a72', display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                <span>{f.ar}</span>
                <span dir="ltr">{f.en}</span>
              </div>
              <div dir={f.ltr ? 'ltr' : undefined} style={{ fontSize: 14.5, fontWeight: 700, marginTop: 2, textAlign: 'right' }}>{f.v}</div>
              {f.sub ? <div dir="ltr" style={{ fontSize: 10.5, color: '#6b7a72', textAlign: 'right' }}>{f.sub}</div> : null}
            </div>
          ))}
        </div>

        {/* جدول الدرجات */}
        <div style={{ border: '1px solid #dfe6e2', borderRadius: 16, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...head, textAlign: 'right', paddingInlineStart: 14, width: '26%' }}><Bi ar="المادة" en="Subject" align="start" /></th>
                {cols.map((c) => (
                  <th key={c.key} style={head}><Bi ar={c.ar} en={c.en} /></th>
                ))}
                <th style={{ ...head, background: '#284e3f' }}><Bi ar="المجموع" en="Total" /></th>
                <th style={{ ...head, background: '#284e3f' }}><Bi ar="التقدير" en="Grade" /></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ r, sub }, i) => {
                const rt = rating(r.pct);
                return (
                  <tr key={r.subject_id} style={{ background: i % 2 ? '#fbfcfb' : '#ffffff' }}>
                    <td style={{ ...cell, textAlign: 'right', paddingInlineStart: 14 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{sub!.name}</div>
                      {sub!.name_en ? <div dir="ltr" style={{ fontSize: 10, color: '#6b7a72', textAlign: 'right' }}>{sub!.name_en}</div> : null}
                    </td>
                    {cols.map((c) => (
                      <td key={c.key} style={cell}>
                        {Number(sub![c.key]) > 0 ? <Score v={r[c.key]} max={sub![c.key]} /> : <span style={{ color: '#b7c1bc' }}>—</span>}
                      </td>
                    ))}
                    <td style={{ ...cell, background: 'rgba(53,104,84,.05)' }}><Score v={r.total} max={r.max} strong /></td>
                    <td style={{ ...cell, background: 'rgba(53,104,84,.05)' }}>
                      {rt ? (
                        <span style={{ display: 'inline-block', minWidth: 74 }}>
                          <span style={{ display: 'block', fontWeight: 700, color: rt.text, fontSize: 13 }}>{rt.ar}</span>
                          <span dir="ltr" style={{ display: 'block', fontSize: 10, color: '#6b7a72' }}>{rt.en}</span>
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: '#9aa6a0' }}>لم تُرصد<br /><span dir="ltr">Not graded</span></span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={cols.length + 3} style={{ ...cell, padding: 28, color: '#6b7a72' }}>لا درجات معتمدة بعد · No grades yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* المواظبة والسلوك والملخص */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.35fr', gap: 12 }}>
          <div style={{ border: '1px solid #dfe6e2', borderRadius: 16, padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7a72' }}><span>المواظبة</span><span dir="ltr">Attendance</span></div>
            {intisab ? (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#8a6116' }}>طالب منتسب</div>
                <div dir="ltr" style={{ fontSize: 10.5, color: '#6b7a72', textAlign: 'right' }}>Affiliated (distance) student</div>
              </div>
            ) : att.pct == null ? (
              <div style={{ marginTop: 8, fontSize: 13, color: '#9aa6a0' }}>لم يُسجَّل تحضير</div>
            ) : (
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <span dir="ltr" style={{ fontSize: 26, fontWeight: 700 }}>{n2(att.pct)}<span style={{ fontSize: 13, color: '#7b8a82' }}>%</span></span>
                <span style={{ textAlign: 'left' }}>
                  <span style={{ display: 'block', fontWeight: 700, color: attR?.text, fontSize: 13 }}>{attR?.ar}</span>
                  <span dir="ltr" style={{ display: 'block', fontSize: 10, color: '#6b7a72' }}>{attR?.en}</span>
                </span>
              </div>
            )}
          </div>
          <div style={{ border: '1px solid #dfe6e2', borderRadius: 16, padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7a72' }}><span>السلوك</span><span dir="ltr">Behavior</span></div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <span dir="ltr" style={{ fontSize: 26, fontWeight: 700 }}>{n2(s.behavior.score)}<span style={{ fontSize: 13, color: '#7b8a82' }}> / 100</span></span>
              <span style={{ textAlign: 'left' }}>
                <span style={{ display: 'block', fontWeight: 700, color: behR?.text, fontSize: 13 }}>{behR?.ar}</span>
                <span dir="ltr" style={{ display: 'block', fontSize: 10, color: '#6b7a72' }}>{behR?.en}</span>
              </span>
            </div>
          </div>
          <div style={{ borderRadius: 16, padding: '12px 16px', background: 'linear-gradient(135deg,#356854,#284e3f)', color: '#eef4f1', display: 'grid', gridTemplateColumns: '1fr 1fr 1.1fr', gap: 6, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>المجموع <span dir="ltr">Total</span></div>
              <div dir="ltr" style={{ fontSize: 17, fontWeight: 700, textAlign: 'right' }}>{n2(s.total)}<span style={{ fontSize: 10.5, opacity: 0.7 }}> / {n2(s.max_total)}</span></div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>المعدل <span dir="ltr">Average</span></div>
              <div dir="ltr" style={{ fontSize: 22, fontWeight: 700, color: '#f0cf8a', textAlign: 'right' }}>{s.average == null ? '—' : `${n2(s.average)}%`}</div>
            </div>
            <div style={{ textAlign: 'center', background: 'rgba(255,255,255,.1)', borderRadius: 12, padding: '6px 4px' }}>
              <div style={{ fontSize: 10.5, opacity: 0.8 }}>التقدير العام</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{overall?.ar ?? '—'}</div>
              <div dir="ltr" style={{ fontSize: 10, opacity: 0.8 }}>{overall?.en ?? 'Overall'}</div>
            </div>
          </div>
        </div>

        {/* تنبيه: ليس شهادة نهائية */}
        <div style={{ border: '1px dashed #d9a441', background: '#fbf5e6', borderRadius: 14, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ width: 22, height: 22, borderRadius: 999, background: '#d9a441', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>!</span>
          <div style={{ fontSize: 12, lineHeight: 1.75, color: '#5b4511' }}>
            <b>تنبيه:</b> هذا إشعار بدرجات الفصل الدراسي فقط، وليس شهادة نهائية ولا تقييمًا نهائيًا للطالب. تصدر شهادة أعمال السنة المعتمدة بعد اكتمال الفصلين.
            <div dir="ltr" style={{ textAlign: 'right', fontSize: 10.5, color: '#7a6326' }}>Notice: this document reports semester grades only. It is not a final certificate and not a final evaluation.</div>
          </div>
        </div>
        {settings.note ? <p style={{ fontSize: 12, color: '#4d5c55', lineHeight: 1.8, margin: 0 }}>{settings.note}</p> : null}

        <div style={{ flex: 1 }} />
        {/* التذييل */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, padding: '14px 0 22px', borderTop: '1px solid #e4eae7', fontSize: 11, color: '#6b7a72' }}>
          <div>
            <div>تاريخ الإصدار: <b style={{ color: '#1f2a24' }}>{when.h}</b></div>
            <div>الموافق: {when.g}</div>
          </div>
          {settings.principal ? (
            <div style={{ textAlign: 'center', minWidth: 170 }}>
              <div>مدير المدرسة <span dir="ltr">· Principal</span></div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1f2a24', marginTop: 4 }}>{settings.principal}</div>
              <div style={{ borderTop: '1px solid #c9d3ce', marginTop: 16, width: 150, marginInline: 'auto' }} />
            </div>
          ) : null}
          <div style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}>
            <LogoMark className="h-4 w-5" />
            <span>صادر إلكترونيًا من منصة مِرقاة</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
function dataUrlToBlob(url: string) {
  const [head, b64] = url.split(',');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: head.slice(5).split(';')[0] });
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** يعرض الإشعار مصغّرًا ليناسب العرض المتاح، مع تنزيله صورةً أو PDF بمقاسه الأصلي */
export function NoticeViewer({ data, fileName }: { data: NoticeData; fileName: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(1123);
  const [busy, setBusy] = useState<'png' | 'pdf' | null>(null);
  const { toast } = useFeedback();

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => {
      setScale(Math.min(1, el.clientWidth / NOTICE_WIDTH));
      if (sheet.current) setHeight(sheet.current.offsetHeight);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    if (sheet.current) ro.observe(sheet.current);
    return () => ro.disconnect();
  }, []);

  const render = async () => {
    const { toPng } = await import('html-to-image');
    await document.fonts.ready;
    const node = sheet.current!;
    const opts = { pixelRatio: 2, backgroundColor: '#ffffff', width: NOTICE_WIDTH, height: node.offsetHeight, style: { transform: 'none' }, cacheBust: true };
    // التمريرة الأولى تُحمّل الخطوط والصور في ذاكرة المتصفح (Safari يحتاجها)
    await toPng(node, opts).catch(() => null);
    return { png: await toPng(node, opts), h: node.offsetHeight };
  };

  const download = async (kind: 'png' | 'pdf') => {
    setBusy(kind);
    try {
      const { png, h } = await render();
      if (kind === 'png') {
        saveBlob(dataUrlToBlob(png), `${fileName}.png`);
      } else {
        const { jsPDF } = await import('jspdf');
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
        const pw = 210;
        const ph = 297;
        let w = pw;
        let hh = (h / NOTICE_WIDTH) * pw;
        if (hh > ph) {
          w = (ph / hh) * pw;
          hh = ph;
        }
        pdf.addImage(png, 'PNG', (pw - w) / 2, 0, w, hh, undefined, 'FAST');
        pdf.setProperties({ title: fileName, creator: 'مِرقاة' });
        saveBlob(pdf.output('blob'), `${fileName}.pdf`);
      }
      toast(kind === 'png' ? 'نُزّل الإشعار صورةً' : 'نُزّل الإشعار PDF');
    } catch {
      toast('تعذّر التنزيل. حدّث الصفحة وحاول مجددًا', 'error');
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    // يحمّل مكتبتي التصدير مسبقًا بعد ظهور الإشعار، فيكون التنزيل فوريًا
    const t = setTimeout(() => { void import('html-to-image'); void import('jspdf'); }, 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => download('pdf')} disabled={!!busy} className="btn-primary">
          {busy === 'pdf' ? <span className="spinner" /> : <Icon name="download" className="size-4" />} تنزيل PDF
        </button>
        <button type="button" onClick={() => download('png')} disabled={!!busy} className="btn-quiet">
          {busy === 'png' ? <span className="spinner" /> : <Icon name="image" className="size-4" />} تنزيل صورة
        </button>
        <span className="text-xs text-muted">بمقاس A4 وجودة عالية</span>
      </div>
      <div ref={wrap} className="w-full">
        <div className="overflow-hidden rounded-2xl border border-line shadow-[0_18px_40px_-28px_rgb(31_42_36/0.45)]" style={{ width: NOTICE_WIDTH * scale, height: height * scale }}>
          <div ref={sheet} style={{ width: NOTICE_WIDTH, transform: `scale(${scale})`, transformOrigin: 'top right' }}>
            <NoticeSheet data={data} />
          </div>
        </div>
      </div>
    </div>
  );
}
