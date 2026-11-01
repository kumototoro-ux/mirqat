'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { Icon } from '@/components/shell/icons';
import { RichText } from './math';
import { assetUrl } from '@/lib/assess/shared';
import type { PrintData, PrintQuestion } from '@/lib/assess/queries';
import type { AppreciationBrand } from '@/lib/certs/appreciation';
import { LETTERS, OMR, omrCenters, omrLayout, omrQrText, type OmrItem } from '@/lib/assess/omr';

/* =====================================================================
   استوديو الطباعة: ورقة الأسئلة · نسخة المعلم (نموذج الإجابة) · أوراق الإجابة (فقاعات) · ورقة المفتاح
   الصفحات بالمليمتر (A4)، والطباعة من المتصفح مباشرة أو حفظها PDF من نافذة الطباعة.
   ===================================================================== */

type Doc = 'paper' | 'teacher' | 'bubbles' | 'key';
const DOCS: { key: Doc; label: string; hint: string }[] = [
  { key: 'paper', label: 'ورقة الأسئلة', hint: 'للطلاب' },
  { key: 'teacher', label: 'نسخة المعلم', hint: 'بالإجابات الصحيحة' },
  { key: 'bubbles', label: 'أوراق الإجابة', hint: 'فقاعات لكل طالب' },
  { key: 'key', label: 'ورقة المفتاح', hint: 'الفقاعات الصحيحة مظلّلة' },
];
const ORD = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
const DEFAULT_HEAD: Record<string, string> = {
  mcq: 'اختر الإجابة الصحيحة فيما يلي',
  tf: 'اختر (صح) أو (خطأ) لكل عبارة',
  short: 'أجب عمّا يلي بإجابة قصيرة',
  long: 'أجب عن الأسئلة التالية',
  fill: 'أكمل الفراغات التالية بما يناسبها',
  match: 'صِل العمود (أ) بما يناسبه من العمود (ب)',
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const isChoice = (q: PrintQuestion) => q.qtype === 'mcq' || q.qtype === 'tf';

/** خلط ثابت لعمود (ب) في أسئلة الصل — نفسه في ورقة الطالب ونسخة المعلم */
function seeded<T>(arr: T[], seed: number) {
  const a = [...arr];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function hijri(d: string) {
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${d}T12:00:00`));
  } catch { return ''; }
}
const dayName = (d: string) => new Intl.DateTimeFormat('ar-SA', { weekday: 'long' }).format(new Date(`${d}T12:00:00`));
const tfLabel = (body: string, i: number, rtl: boolean) => {
  const t = body.trim();
  if (/^ص/.test(t)) return rtl ? 'ص' : 'T';
  if (/^خ/.test(t)) return rtl ? 'خ' : 'F';
  return (rtl ? LETTERS.ar : LETTERS.en)[i];
};

export function PrintStudio({ data, brand }: { data: PrintData; brand: AppreciationBrand }) {
  const { form, questions, roster } = data;
  const [doc, setDoc] = useState<Doc>('paper');
  const [rtl, setRtl] = useState(true);
  const [time, setTime] = useState(form.time_limit ? `${form.time_limit} دقيقة` : 'ساعة واحدة');
  const [date, setDate] = useState(() => (form.opens_at ?? form.closes_at ?? new Date().toISOString()).slice(0, 10));
  const [label, setLabel] = useState(form.eval_type ?? 'اختبار');
  const [summary, setSummary] = useState(true);
  const [big, setBig] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(() => new Set(roster.map((s) => s.id)));
  const [blank, setBlank] = useState(0);
  const [qr, setQr] = useState<Record<string, string>>({});

  const choice = useMemo(() => questions.map((q, i) => ({ q, n: i + 1 })).filter((x) => isChoice(x.q)), [questions]);
  const items: OmrItem[] = choice.map((x) => ({ n: x.n, opts: Math.min(6, Math.max(2, x.q.options.length)) }));
  const layout = omrLayout(items);
  const sheets = useMemo(
    () => [...roster.filter((s) => picked.has(s.id)), ...Array.from({ length: blank }, (_, i) => ({ id: -1 - i, code: '', name_ar: '' }))],
    [roster, picked, blank],
  );

  // رموز QR لكل ورقة (تُولَّد في المتصفح)
  useEffect(() => {
    if (doc !== 'bubbles' && doc !== 'key') return;
    let off = false;
    const ids = doc === 'key' ? [0] : sheets.map((s) => (s.id > 0 ? s.id : 0));
    Promise.all([...new Set(ids)].map(async (sid) => [String(sid), await QRCode.toString(omrQrText(form.id, sid || null), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })] as const))
      .then((pairs) => { if (!off) setQr(Object.fromEntries(pairs)); })
      .catch(() => null);
    return () => { off = true; };
  }, [doc, sheets, form.id]);

  const total = r2(questions.reduce((a, q) => a + q.points, 0));
  const head = { time, date, label, summary, big, rtl };
  const choiceCount = choice.length;

  return (
    <div className="min-h-dvh bg-[#5f6b66] print:bg-white">
      <style>{PRINT_CSS}</style>
      {/* شريط الأدوات — لا يُطبع */}
      <header className="no-print sticky top-0 z-20 border-b border-black/10 bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-3 py-2.5">
          <Link href={`/staff/tasks/${form.id}`} className="inline-flex items-center gap-1 rounded-xl px-2 py-2 text-sm text-muted hover:bg-paper hover:text-ink">
            <Icon name="chevron" className="size-4 rotate-180" /> رجوع
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{form.title}</p>
            <p className="truncate text-xs text-muted">{form.subject} · {form.class_label} · {questions.length} سؤال · {total} درجة</p>
          </div>
          <button type="button" onClick={() => window.print()} disabled={!questions.length} className="btn-primary">
            <Icon name="download" className="size-4" /> طباعة / حفظ PDF
          </button>
        </div>
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2">
          {DOCS.map((d) => (
            <button key={d.key} type="button" onClick={() => setDoc(d.key)}
              className={`shrink-0 rounded-xl px-3.5 py-2 text-start text-sm transition-colors ${doc === d.key ? 'bg-board text-chalk' : 'bg-paper hover:bg-board/10'}`}>
              <span className="block font-semibold">{d.label}</span>
              <span className={`block text-[0.7rem] ${doc === d.key ? 'text-chalk/75' : 'text-muted'}`}>{d.hint}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 p-3 lg:grid-cols-[17rem_minmax(0,1fr)] print:block print:max-w-none print:p-0">
        {/* الإعدادات — لا تُطبع */}
        <aside className="no-print h-fit space-y-3 rounded-2xl bg-surface p-4 text-sm lg:sticky lg:top-32">
          {(doc === 'paper' || doc === 'teacher') && (
            <>
              <label className="block"><span className="label">نوع الاختبار</span><input value={label} onChange={(e) => setLabel(e.target.value.slice(0, 40))} className="field" /></label>
              <label className="block"><span className="label">تاريخ الاختبار</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" />{date && <span className="mt-1 block text-xs text-muted">{dayName(date)} {hijri(date)}</span>}</label>
              <label className="block"><span className="label">الزمن</span><input value={time} onChange={(e) => setTime(e.target.value.slice(0, 30))} className="field" /></label>
              <Check on={summary} set={setSummary}>جدول رصد الدرجات (المصحح والمراجع والمدقق)</Check>
              <Check on={big} set={setBig}>خط أكبر (للصفوف الأولى)</Check>
            </>
          )}
          <div>
            <span className="label">حروف الخيارات</span>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setRtl(true)} className={`flex-1 rounded-xl py-2 ${rtl ? 'bg-board font-semibold text-chalk' : 'bg-paper'}`}>أ ب ج د</button>
              <button type="button" onClick={() => setRtl(false)} className={`flex-1 rounded-xl py-2 ${!rtl ? 'bg-board font-semibold text-chalk' : 'bg-paper'}`} dir="ltr">A B C D</button>
            </div>
          </div>
          {doc === 'bubbles' && (
            <>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="label mb-0">الطلاب ({picked.size}/{roster.length})</span>
                  <button type="button" onClick={() => setPicked(picked.size === roster.length ? new Set() : new Set(roster.map((s) => s.id)))} className="text-xs font-semibold text-board hover:underline">
                    {picked.size === roster.length ? 'إلغاء الكل' : 'تحديد الكل'}
                  </button>
                </div>
                <ul className="max-h-64 space-y-0.5 overflow-y-auto rounded-xl border border-line p-1">
                  {roster.map((s) => (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-paper">
                        <input type="checkbox" checked={picked.has(s.id)} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} className="accent-[var(--color-board)]" />
                        <span className="truncate">{s.name_ar}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
              <label className="block"><span className="label">أوراق إضافية بلا اسم</span><input type="number" min={0} max={30} value={blank} onChange={(e) => setBlank(Math.max(0, Math.min(30, Number(e.target.value) || 0)))} className="field" /></label>
            </>
          )}
          {(doc === 'bubbles' || doc === 'key') && (
            <p className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${layout.fits ? 'bg-board/[0.06] text-board' : 'bg-danger-soft text-danger'}`}>
              {!choiceCount ? 'لا أسئلة اختيار في هذا النموذج — أوراق الفقاعات للاختيار من متعدد وصح/خطأ.'
                : layout.fits ? `${choiceCount} سؤال اختيار في ${layout.cols} ${layout.cols === 1 ? 'عمود' : 'أعمدة'}${choiceCount < questions.length ? ` — ${questions.length - choiceCount} سؤال آخر يُجاب في ورقة الأسئلة` : ''}. في كل ورقة رمز QR للطالب للتصحيح بالكاميرا لاحقًا.`
                : 'أسئلة الاختيار أكثر مما تتسعه صفحة واحدة بوضوح — قسّم الاختبار إلى نموذجين.'}
            </p>
          )}
          <p className="text-xs leading-relaxed text-muted">اختر «حفظ بصيغة PDF» من نافذة الطباعة لحفظها ملفًا. اضبط الهوامش على «الافتراضي» والمقياس 100٪.</p>
        </aside>

        {/* المعاينة = ما يُطبع */}
        <main className="min-w-0 overflow-x-auto print:overflow-visible">
          {!questions.length ? (
            <div className="no-print rounded-2xl bg-surface p-10 text-center text-muted">لا أسئلة في هذا النموذج بعد.</div>
          ) : doc === 'paper' || doc === 'teacher' ? (
            <Paper data={data} brand={brand} teacher={doc === 'teacher'} opt={head} />
          ) : !choiceCount ? (
            <div className="no-print rounded-2xl bg-surface p-10 text-center text-muted">لا أسئلة اختيار لطباعة ورقة فقاعات.</div>
          ) : doc === 'key' ? (
            <Bubbles data={data} brand={brand} items={items} choice={choice} rtl={rtl} student={null} qr={qr['0']} keyMode />
          ) : !sheets.length ? (
            <div className="no-print rounded-2xl bg-surface p-10 text-center text-muted">اختر طالبًا واحدًا على الأقل.</div>
          ) : (
            sheets.map((s) => <Bubbles key={s.id} data={data} brand={brand} items={items} choice={choice} rtl={rtl} student={s.id > 0 ? s : null} qr={qr[String(s.id > 0 ? s.id : 0)]} />)
          )}
        </main>
      </div>
    </div>
  );
}

function Check({ on, set, children }: { on: boolean; set: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 leading-relaxed">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="mt-1 accent-[var(--color-board)]" />
      <span>{children}</span>
    </label>
  );
}

/* --------------------------------------------------------------------- */
type Opt = { time: string; date: string; label: string; summary: boolean; big: boolean; rtl: boolean };

function Paper({ data, brand, teacher, opt }: { data: PrintData; brand: AppreciationBrand; teacher: boolean; opt: Opt }) {
  const { form, questions } = data;
  const L = opt.rtl ? LETTERS.ar : LETTERS.en;
  const total = r2(questions.reduce((a, q) => a + q.points, 0));
  const uniform = questions.every((q) => q.points === questions[0]?.points);
  // الأقسام: عنوان القسم من المحرر، وإلا تُجمع الأسئلة المتتالية من النوع نفسه
  const groups = useMemo(() => {
    const out: { title: string; text: string | null; items: { q: PrintQuestion; n: number }[] }[] = [];
    questions.forEach((q, i) => {
      const key = q.section_title?.trim() || DEFAULT_HEAD[q.qtype];
      const g = out[out.length - 1];
      if (g && g.title === key) g.items.push({ q, n: i + 1 });
      else out.push({ title: key, text: q.section_instructions, items: [{ q, n: i + 1 }] });
    });
    return out;
  }, [questions]);

  return (
    <div className={`qp ${opt.big ? 'qp-big' : ''}`} dir="rtl">
      {teacher && <div className="qp-flag">نسخة المعلم — نموذج الإجابة (لا تُوزَّع على الطلاب)</div>}
      <div className="qp-head">
        <div className="qp-hr">
          {brand.school && <div>{brand.school}</div>}
          {form.branch && <div>الفرع: {form.branch}</div>}
          {form.term && <div>{form.term}</div>}
          <div>{opt.label}</div>
          {form.teacher && <div>المعلم: {form.teacher}</div>}
        </div>
        <div className="qp-hc">
          {brand.showBasmala && (brand.images.basmala
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={brand.images.basmala} alt="" className="qp-bsm-img" />
            : <div className="qp-bsm">بسم الله الرحمن الرحيم</div>)}
          <div className="qp-logos">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {brand.images.logo && <img src={brand.images.logo} alt="" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {brand.images.vision && <img src={brand.images.vision} alt="" />}
          </div>
        </div>
        <div className="qp-hl">
          <div>المادة: {form.subject}</div>
          <div>الصف: {form.grade}</div>
          {form.section && <div>الشعبة: {form.section}</div>}
          {opt.date && <div>اليوم: {dayName(opt.date)}</div>}
          {opt.date && <div>التاريخ: {hijri(opt.date)}</div>}
          {opt.time && <div>الزمن: {opt.time}</div>}
        </div>
      </div>
      <div className="qp-title">{form.title}</div>
      <div className="qp-top">
        <div className="qp-tot"><b>{total}</b></div>
        <div className="qp-who">
          <div className="qp-row"><b>اسم الطالب</b><i /></div>
          <div className="qp-row"><b>رقم الجلوس</b><i /></div>
        </div>
      </div>
      {opt.summary && (
        <table className="qp-sum">
          <thead>
            <tr><th rowSpan={2} style={{ width: '20mm' }}>السؤال</th><th colSpan={2}>الدرجة</th><th rowSpan={2}>اسم المصحح وتوقيعه</th><th rowSpan={2}>اسم المراجع وتوقيعه</th><th rowSpan={2}>اسم المدقق وتوقيعه</th></tr>
            <tr><th style={{ width: '22mm' }}>رقمًا</th><th style={{ width: '32mm' }}>كتابة</th></tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => (
              <tr key={gi}>
                <td><b>س{gi + 1}</b> <small>({r2(g.items.reduce((a, it) => a + it.q.points, 0))})</small></td><td /><td />
                {gi === 0 && <><td className="sg" rowSpan={groups.length + 1} /><td className="sg" rowSpan={groups.length + 1} /><td className="sg" rowSpan={groups.length + 1} /></>}
              </tr>
            ))}
            <tr><td><b>المجموع</b> <small>({total})</small></td><td /><td /></tr>
          </tbody>
        </table>
      )}
      <div className="qp-ins">(مستعينًا بالله أجب عن الأسئلة التالية)</div>

      {groups.map((g, gi) => (
        <section key={gi} className="qp-sec">
          <div className="qp-sh">
            <div>السؤال {ORD[gi] ?? gi + 1} / {g.title}{g.text && <small>{g.text}</small>}</div>
            <div className="qp-sp">{r2(g.items.reduce((a, it) => a + it.q.points, 0))} درجة</div>
          </div>
          {g.items.map(({ q, n }) => <PaperQ key={q.id} q={q} n={n} L={L} rtl={opt.rtl} teacher={teacher} points={uniform ? null : q.points} />)}
        </section>
      ))}
      <div className="qp-end">انتهت الأسئلة — مع تمنياتنا لكم بالتوفيق</div>
    </div>
  );
}

function PaperQ({ q, n, L, rtl, teacher, points }: { q: PrintQuestion; n: number; L: string[]; rtl: boolean; teacher: boolean; points: number | null }) {
  const img = assetUrl(q.image_url);
  const plainLen = (t: string) => t.replace(/\$[^$]*\$/g, 'xxxx').length;
  const blanks = q.config.blanks ?? [];
  return (
    <div className="qp-q">
      <div className="qp-n">{n}</div>
      <div className="qp-c">
        <div className="qp-tp">
          <div className="qp-st">
            {q.qtype === 'fill' ? (
              <RichText text={q.body} blank={(b) => <span className="qp-blank">{teacher ? (blanks[b - 1]?.[0] ?? '') : ''}</span>} />
            ) : <RichText text={q.body} />}
            {points != null && <span className="qp-pt">({points} {points === 1 ? 'درجة' : 'درجات'})</span>}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {img && <img className="qp-img" src={img} alt="" />}
        </div>

        {isChoice(q) && (() => {
          const max = Math.max(...q.options.map((o) => plainLen(o.body)));
          const cols = q.qtype === 'tf' ? 2 : max <= 14 ? Math.min(4, q.options.length) : max <= 36 ? 2 : 1;
          return (
            <div className="qp-o" style={{ ['--cols' as string]: cols }}>
              {q.options.map((o, k) => {
                const ok = teacher && o.is_correct;
                return (
                  <div key={o.id} className={`qp-oc ${ok ? 'ok' : ''} ${(k + 1) % cols === 0 || k === q.options.length - 1 ? 'lc' : ''} ${k >= cols ? 'r2' : ''}`}>
                    <span className="qp-l" dir={rtl ? undefined : 'ltr'}>{q.qtype === 'tf' ? tfLabel(o.body, k, rtl) : L[k]}</span>
                    <span className="qp-ot"><RichText text={o.body} />{ok ? ' ✓' : ''}</span>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {q.qtype === 'short' && (
          <div className="qp-ans"><span>الإجابة:</span><span className="qp-line">{teacher ? [...new Map((q.config.answers ?? []).map((a) => [a.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).trim(), a])).values()].join(' / ') : ''}</span></div>
        )}

        {q.qtype === 'long' && (
          <div className="qp-lines">
            {teacher && q.explanation ? <div className="qp-model"><b>إجابة نموذجية: </b><RichText text={q.explanation} /></div>
              : Array.from({ length: Math.min(12, Math.max(3, Math.ceil((q.config.max_chars ?? 400) / 110))) }, (_, i) => <div key={i} className="qp-rule" />)}
          </div>
        )}

        {q.qtype === 'match' && (() => {
          const pairs = q.config.pairs ?? [];
          const right = seeded(pairs.map((p, i) => ({ r: p.r, i })), q.id);
          return (
            <table className="qp-match">
              <thead><tr><th>العمود (أ)</th><th style={{ width: '14mm' }}>الإجابة</th><th>العمود (ب)</th></tr></thead>
              <tbody>
                {pairs.map((p, i) => (
                  <tr key={i}>
                    <td><b>{i + 1}.</b> <RichText text={p.l} /></td>
                    <td className="qp-mans">{teacher ? L[right.findIndex((x) => x.i === i)] : '(   )'}</td>
                    <td><b>{L[i]}.</b> <RichText text={right[i]?.r ?? ''} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })()}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
function Bubbles({ data, brand, items, choice, rtl, student, qr, keyMode = false }: {
  data: PrintData;
  brand: AppreciationBrand;
  items: OmrItem[];
  choice: { q: PrintQuestion; n: number }[];
  rtl: boolean;
  student: { id: number; code: string; name_ar: string } | null;
  qr?: string;
  keyMode?: boolean;
}) {
  const { form } = data;
  const L = omrLayout(items);
  const C = omrCenters(items, rtl);
  const mm = (v: number) => `${Math.round(v * 100) / 100}mm`;
  const max = r2(choice.reduce((a, x) => a + x.q.points, 0));
  return (
    <div className="omr" dir="rtl">
      {OMR.markers.map(([x, y], i) => <div key={i} className="omr-mk" style={{ left: mm(x), top: mm(y), width: mm(OMR.marker), height: mm(OMR.marker) }} />)}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {brand.images.logo && <img src={brand.images.logo} alt="" className="omr-abs" style={{ right: '18mm', top: '12mm', width: '24mm', height: '24mm', objectFit: 'contain' }} />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {brand.images.vision && <img src={brand.images.vision} alt="" className="omr-abs" style={{ left: '18mm', top: '12mm', width: '34mm', height: '24mm', objectFit: 'contain' }} />}
      <div className="omr-abs omr-title">
        <div style={{ fontSize: '14pt', fontWeight: 700, lineHeight: 1.4 }}>{keyMode ? 'نموذج الإجابة — ' : ''}{form.title}</div>
        <div style={{ fontSize: '10pt', marginTop: '1mm' }}>{brand.school ? `${brand.school} — ` : ''}{form.subject}{form.eval_type ? ` — ${form.eval_type}` : ''}</div>
      </div>
      <div className="omr-abs omr-box" />
      <div className="omr-abs" style={{ left: mm(OMR.qr.x), top: mm(OMR.qr.y), width: mm(OMR.qr.s), height: mm(OMR.qr.s) }} dangerouslySetInnerHTML={{ __html: qr ?? '' }} />
      <div className="omr-abs omr-info">
        <div className="omr-name">اسم الطالب: {keyMode ? 'نموذج الإجابة (للمعلم)' : student ? student.name_ar : <span className="omr-fill" />}</div>
        <div className="omr-line"><span><b>الصف:</b> {form.grade}{form.section ? ` / ${form.section}` : ''}</span><span><b>الفرع:</b> {form.branch}</span>{student && <span><b>الرقم:</b> {student.code}</span>}</div>
        <div className="omr-line"><span><b>الأسئلة:</b> {items.length}</span><span><b>الدرجة:</b> {max}</span>{form.term && <span><b>{form.term}</b></span>}</div>
        {!student && !keyMode && <div className="omr-line"><span><b>الرقم:</b> <span className="omr-fill short" /></span></div>}
      </div>
      {data.questions.length > choice.length && (
        <div className="omr-abs omr-other">بقية الأسئلة ({data.questions.map((q, i) => (isChoice(q) ? null : i + 1)).filter(Boolean).join('، ')}) تُجاب في ورقة الأسئلة</div>
      )}
      <div className="omr-abs omr-ins">ظلّل الدائرة بالكامل بقلم أزرق أو أسود · دائرة واحدة لكل سؤال · امسح الخطأ جيدًا · لا تكتب خارج الدوائر ولا تطوِ الورقة</div>
      {Array.from({ length: L.cols }, (_, c) => Array.from({ length: Math.floor((L.rows - 1) / 5) }, (_, k) => {
        const colLeft = rtl ? OMR.gridX1 - (c + 1) * L.colW : OMR.gridX0 + c * L.colW;
        return <div key={`${c}-${k}`} className="omr-tick" style={{ left: mm(colLeft + 2), width: mm(L.colW - 4), top: mm(OMR.gridY0 + L.rowH * (k + 1) * 5) }} />;
      }))}
      {C.map((c, i) => {
        const q = choice[i].q;
        return (
          <Fragment key={c.n}>
            <div className="omr-num" style={{ left: mm(c.num.x - OMR.numW / 2), top: mm(c.num.y - 3), width: mm(OMR.numW) }}>{c.n}</div>
            {c.opts.map((o, k) => {
              const on = keyMode && q.options[k]?.is_correct;
              return (
                <div key={k} className={`omr-bub ${rtl ? 'ar' : ''} ${on ? 'on' : ''}`} style={{ left: mm(o.x - OMR.bubble / 2), top: mm(o.y - OMR.bubble / 2), width: mm(OMR.bubble), height: mm(OMR.bubble) }}>
                  {q.qtype === 'tf' ? tfLabel(q.options[k]?.body ?? '', k, rtl) : (rtl ? LETTERS.ar : LETTERS.en)[k]}
                </div>
              );
            })}
          </Fragment>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------------- */
const PRINT_CSS = `
@page { size: A4; margin: 10mm 11mm 12mm; @bottom-center { content: "صفحة " counter(page) " من " counter(pages); font: 8.5pt Tahoma, Arial, sans-serif; color: #444; } }
@page omr { size: A4; margin: 0; @bottom-center { content: none; } }
@media print {
  .no-print { display: none !important; }
  html, body { background: #fff !important; }
  .qp { box-shadow: none !important; margin: 0 !important; padding: 0 !important; width: auto !important; min-height: 0 !important; }
  .omr { page: omr; box-shadow: none !important; margin: 0 !important; break-after: page; page-break-after: always; }
  .omr:last-child { break-after: auto; page-break-after: auto; }
}
@media screen and (max-width: 860px) { .qp, .omr { zoom: .62; } }
@media screen and (max-width: 520px) { .qp, .omr { zoom: .46; } }
.qp, .omr { -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #000; font-family: "IBM Plex Sans Arabic", Tahoma, Arial, sans-serif; }
.qp *, .omr * { box-sizing: border-box; }

/* ورقة الأسئلة: تتدفق على صفحات A4 بهوامش 10مم */
.qp { width: 210mm; min-height: 297mm; margin: 0 auto 12px; padding: 10mm 11mm 12mm; background: #fff; font-size: 10.5pt; line-height: 1.6; box-shadow: 0 4px 22px rgba(0,0,0,.3); }
.qp-big { font-size: 12.5pt; }
.qp-flag { text-align: center; color: #b00020; font-weight: 700; font-size: 10pt; margin-bottom: 2mm; border: .3mm dashed #b00020; padding: 1mm; }
.qp-head { display: grid; grid-template-columns: 1fr 40mm 1fr; gap: 3mm; align-items: start; margin-bottom: 2mm; font-size: 9pt; line-height: 1.7; font-weight: 600; }
.qp-big .qp-head { font-size: 9.5pt; }
.qp-hl { padding-right: 6mm; }
.qp-hc { text-align: center; }
.qp-bsm { font-size: 10pt; font-weight: 700; margin-bottom: 1mm; font-family: "Amiri", serif; }
.qp-bsm-img { height: 8mm; max-width: 40mm; object-fit: contain; margin: 0 auto 1mm; display: block; }
.qp-logos { display: flex; gap: 3mm; align-items: center; justify-content: center; }
.qp-logos img { height: 16mm; max-width: 24mm; object-fit: contain; }
.qp-title { text-align: center; font-weight: 700; font-size: 12.5pt; margin: 1mm 0 2.5mm; }
.qp-top { display: flex; gap: 2mm; margin-bottom: 2.5mm; }
.qp-who { flex: 1; display: flex; flex-direction: column; gap: 1.5mm; }
.qp-row { display: flex; border: .3mm solid #000; min-height: 8mm; }
.qp-row > b { width: 26mm; padding: 0 2mm; border-left: .3mm solid #000; display: flex; align-items: center; font-size: 9.5pt; }
.qp-row > i { flex: 1; }
.qp-tot { width: 30mm; border: .3mm solid #000; position: relative; background: linear-gradient(to top right, transparent calc(50% - .2mm), #000 calc(50% - .2mm), #000 calc(50% + .2mm), transparent calc(50% + .2mm)); }
.qp-tot b { position: absolute; bottom: 1.2mm; right: 3mm; font-size: 13pt; }
.qp-sum { width: 100%; border-collapse: collapse; margin-bottom: 2.5mm; font-size: 9pt; text-align: center; }
.qp-sum th, .qp-sum td { border: .3mm solid #000; padding: 0 1mm; height: 6.8mm; }
.qp-sum th { background: #f1f1f1; }
.qp-sum small { font-size: 8pt; color: #444; }
.qp-ins { text-align: center; font-size: 10pt; font-weight: 600; margin: 0 0 2.5mm; }
.qp-sec { border: .3mm solid #000; margin-bottom: 3mm; }
.qp-sh { display: flex; align-items: stretch; border-bottom: .3mm solid #000; background: #f1f1f1; break-after: avoid; page-break-after: avoid; }
.qp-sh > div:first-child { flex: 1; padding: 1mm 3mm; font-weight: 700; }
.qp-sh small { display: block; font-weight: 400; font-size: 9pt; }
.qp-sp { width: 24mm; border-right: .3mm solid #000; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 9.5pt; }
.qp-q { display: flex; border-top: .3mm solid #000; break-inside: avoid; page-break-inside: avoid; }
.qp-sh + .qp-q { border-top: 0; }
.qp-n { width: 9mm; flex: none; border-left: .3mm solid #000; display: flex; align-items: center; justify-content: center; font-weight: 700; }
.qp-c { flex: 1; min-width: 0; }
.qp-tp { display: flex; gap: 3mm; align-items: center; padding: 1.2mm 2.5mm; }
.qp-st { flex: 1; font-weight: 600; overflow-wrap: anywhere; }
.qp-pt { font-weight: 400; font-size: 8.5pt; color: #444; margin-inline-start: 2mm; }
.qp-img { max-height: 40mm; max-width: 45%; object-fit: contain; flex: none; }
.qp-o { display: grid; grid-template-columns: repeat(var(--cols), 1fr); border-top: .3mm solid #000; }
.qp-oc { display: flex; align-items: stretch; border-left: .3mm solid #000; min-width: 0; }
.qp-oc.lc { border-left: 0; }
.qp-oc.r2 { border-top: .3mm solid #000; }
.qp-oc.ok { background: #dfeee4; font-weight: 700; }
.qp-l { width: 7mm; flex: none; border-left: .3mm solid #000; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 9.5pt; }
.qp-ot { flex: 1; padding: .8mm 2mm; overflow-wrap: anywhere; display: flex; align-items: center; }
.qp-blank { display: inline-block; min-width: 26mm; border-bottom: .3mm dotted #000; margin: 0 1mm; text-align: center; font-weight: 700; color: #1b5e3a; }
.qp-ans { display: flex; gap: 2mm; align-items: flex-end; padding: 0 2.5mm 2mm; }
.qp-line { flex: 1; border-bottom: .3mm dotted #000; min-height: 6mm; font-weight: 700; color: #1b5e3a; }
.qp-lines { padding: 0 2.5mm 2mm; }
.qp-rule { height: 7.5mm; border-bottom: .3mm dotted #777; }
.qp-model { padding: 1mm 0; color: #1b5e3a; }
.qp-match { width: calc(100% - 5mm); margin: 0 2.5mm 2mm; border-collapse: collapse; font-size: .95em; }
.qp-match th, .qp-match td { border: .3mm solid #000; padding: .8mm 2mm; vertical-align: middle; }
.qp-match th { background: #f7f7f7; }
.qp-mans { text-align: center; font-weight: 700; color: #1b5e3a; }
.qp-end { text-align: center; margin-top: 4mm; font-weight: 700; font-size: 10pt; }

/* ورقة الإجابة: صفحة A4 ثابتة بمواضع مطلقة بالمليمتر (لقارئ الكاميرا) */
.omr { position: relative; width: 210mm; height: 297mm; margin: 0 auto 12px; background: #fff; overflow: hidden; box-shadow: 0 4px 22px rgba(0,0,0,.3); }
.omr-abs { position: absolute; }
.omr-mk { position: absolute; background: #000; }
.omr-title { left: 56mm; right: 46mm; top: 12mm; height: 26mm; text-align: center; display: flex; flex-direction: column; justify-content: center; }
.omr-box { left: 18mm; right: 18mm; top: 42mm; height: 27mm; border: .3mm solid #000; border-radius: 2mm; }
.omr-info { left: 46mm; right: 21mm; top: 43mm; height: 25mm; font-size: 9.5pt; line-height: 1.65; overflow: hidden; }
.omr-name { font-size: 12.5pt; font-weight: 700; margin-bottom: .5mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.omr-line { display: flex; flex-wrap: wrap; gap: 0 5mm; }
.omr-fill { display: inline-block; width: 90mm; border-bottom: .3mm dotted #000; vertical-align: bottom; }
.omr-fill.short { width: 40mm; }
.omr-ins { left: 18mm; right: 18mm; top: 71mm; text-align: center; font-size: 8.5pt; }
.omr-other { left: 18mm; right: 18mm; top: 276mm; text-align: center; font-size: 8.5pt; color: #444; }
.omr-tick { position: absolute; height: .25mm; background: #bbb; }
.omr-num { position: absolute; height: 6mm; display: flex; align-items: center; justify-content: center; font-size: 9pt; font-weight: 700; direction: ltr; }
.omr-bub { position: absolute; border: .35mm solid #000; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 7.5pt; color: #777; line-height: 1; }
.omr-bub.ar { font-size: 9pt; color: #555; padding-bottom: .4mm; }
.omr-bub.on { background: #111; color: #fff; }
`;
