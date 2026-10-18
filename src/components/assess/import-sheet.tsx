'use client';

import { useMemo, useRef, useState } from 'react';
import { Sheet } from '@/components/sheet';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { downloadCsv } from '@/components/registry/csv';
import { SHEET_EXAMPLES, SHEET_HEADER, looksTabular, parseDelimited, parseRows, parseText, type DraftQuestion } from '@/lib/assess/draft';
import { QTYPE_LABEL } from '@/lib/assess/shared';
import { RichText } from './math';

const SAMPLE = `1) ما عاصمة المملكة العربية السعودية؟ (2)
أ) جدة
ب) الرياض *
ج) مكة المكرمة

2) يغلي الماء عند 100 درجة مئوية
الإجابة: صح

3) ناتج $\\frac{1}{2}+\\frac{1}{4}$ ؟
الإجابة: 3/4 | 0.75

4) أكبر كوكب في المجموعة الشمسية هو {{المشتري}}

5) صل كل مركب باسمه (3)
H2O = ماء
NaCl = ملح الطعام
CO2 = ثاني أكسيد الكربون

6) اشرح دورة الماء في الطبيعة (5)`;

export function ImportSheet({ open, onClose, onImport }: { open: boolean; onClose: () => void; onImport: (q: DraftQuestion[]) => void }) {
  const { toast } = useFeedback();
  const [tab, setTab] = useState<'text' | 'file'>('text');
  const [text, setText] = useState('');
  const [fileResult, setFileResult] = useState<{ questions: DraftQuestion[]; skipped: number; errors: string[]; name: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [points, setPoints] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);

  const textResult = useMemo(() => {
    if (!text.trim()) return null;
    if (looksTabular(text)) return { ...parseRows(parseDelimited(text), points) };
    return { ...parseText(text, points), errors: [] as string[] };
  }, [text, points]);
  const result = tab === 'text' ? textResult : fileResult;

  const readFile = async (f: File | undefined) => {
    if (!f) return;
    setReading(true);
    try {
      let rows: unknown[][];
      if (/\.csv$/i.test(f.name) || f.type === 'text/csv') {
        rows = parseDelimited(await f.text());
      } else {
        const { default: readXlsxFile } = await import('read-excel-file');
        rows = (await readXlsxFile(f)) as unknown[][];
      }
      setFileResult({ ...parseRows(rows, points), name: f.name });
    } catch {
      toast('تعذّرت قراءة الملف. استخدم القالب (xlsx أو csv)', 'error');
    } finally {
      setReading(false);
    }
  };

  const done = () => {
    if (!result?.questions.length) return;
    onImport(result.questions);
    toast(`أُضيف ${result.questions.length} سؤال — راجعها قبل الحفظ`);
    setText('');
    setFileResult(null);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="استيراد أسئلة"
      subtitle="من نص منسوخ أو ملف Excel"
      footer={
        <div className="flex items-center gap-2">
          <button type="button" onClick={done} disabled={!result?.questions.length} className="btn-primary flex-1 py-3">
            <Icon name="download" className="size-4" />
            {result?.questions.length ? `إضافة ${result.questions.length} سؤال` : 'لا أسئلة بعد'}
          </button>
          <button type="button" onClick={onClose} className="btn-quiet py-3">إلغاء</button>
        </div>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-paper p-1">
        {(['text', 'file'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-lg py-2 text-sm font-semibold transition-all ${tab === t ? 'bg-surface text-board shadow-sm' : 'text-muted'}`}>
            {t === 'text' ? 'لصق نص' : 'ملف Excel'}
          </button>
        ))}
      </div>

      <label className="mb-4 flex items-center gap-2 text-sm">
        <span className="text-muted">الدرجة الافتراضية لكل سؤال</span>
        <input type="number" min={0} step={0.5} value={points} onChange={(e) => setPoints(Number(e.target.value) || 0)} className="field w-20 py-1.5 text-center tabular-nums" dir="ltr" />
      </label>

      {tab === 'text' ? (
        <>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} className="field font-mono text-sm leading-relaxed" placeholder="الصق الأسئلة هنا… أو انسخ صفوفًا من Excel مباشرة" />
          <details className="mt-3 rounded-xl border border-line p-3 text-sm">
            <summary className="cursor-pointer font-semibold text-board">طريقة الكتابة (مثال جاهز)</summary>
            <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted">
              <li>• سطر فارغ بين كل سؤال والآخر، والدرجة بين قوسين في آخر السؤال <code>(2)</code></li>
              <li>• الخيارات بحروف <code>أ) ب) ج)</code> والصحيح بنجمة <code>*</code> في آخره</li>
              <li>• صح وخطأ: <code>الإجابة: صح</code> — القصيرة: <code>الإجابة: 4 | أربعة</code></li>
              <li>• التوصيل: سطور <code>يسار = يمين</code> — الفراغ: <code>{'{{الإجابة}}'}</code> داخل النص</li>
              <li>• بلا خيارات ولا إجابة = سؤال مقالي</li>
            </ul>
            <button type="button" onClick={() => setText(SAMPLE)} className="mt-2 text-xs font-semibold text-board underline">ضع المثال في الصندوق</button>
          </details>
        </>
      ) : (
        <>
          <input ref={fileRef} type="file" accept=".xlsx,.csv" hidden onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ''; }} />
          <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-4 py-8 text-center transition-colors hover:border-board/50 hover:bg-board/[0.03]">
            {reading ? <span className="spinner size-6 text-board" /> : <Icon name="upload" className="size-8 text-board" />}
            <span className="font-semibold">{fileResult?.name ?? 'اختر ملف Excel أو CSV'}</span>
            <span className="text-xs text-muted">الأعمدة: النوع · السؤال · الدرجة · الإجابة · خيار 1 … خيار 6</span>
          </button>
          <button type="button" onClick={() => downloadCsv('قالب-أسئلة', SHEET_HEADER, SHEET_EXAMPLES)} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-board hover:underline">
            <Icon name="download" className="size-4" /> تحميل القالب
          </button>
          <p className="mt-1 text-xs text-muted">في الاختيار: الإجابة رقم الخيار الصحيح أو نصه. التوصيل: كل خيار بصيغة &quot;يسار = يمين&quot;.</p>
        </>
      )}

      {result && (
        <div className="mt-5">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <span className="grid size-6 place-items-center rounded-full bg-ok text-chalk"><Icon name="check" className="size-3.5" /></span>
            تعرّفت على {result.questions.length} سؤال
            {result.skipped > 0 && <span className="text-xs font-normal text-muted">· تُرك {result.skipped}</span>}
          </p>
          {result.errors.length > 0 && (
            <ul className="mb-2 space-y-1 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">
              {result.errors.slice(0, 6).map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          <ol className="max-h-72 space-y-1.5 overflow-y-auto">
            {result.questions.map((q, i) => (
              <li key={q.key} className="flex items-start gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                <span className="mt-0.5 font-bold tabular-nums text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <RichText text={q.body.length > 120 ? q.body.slice(0, 120) + '…' : q.body} />
                  {q.qtype === 'mcq' && <span className="block text-xs text-ok">✓ {q.options.find((o) => o.is_correct)?.body}</span>}
                  {q.qtype === 'tf' && <span className="block text-xs text-ok">✓ {q.options.find((o) => o.is_correct)?.body}</span>}
                  {q.qtype === 'short' && q.answers.length > 0 && <span className="block text-xs text-ok">✓ {q.answers.join(' | ')}</span>}
                </span>
                <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-[0.7rem] font-semibold">{QTYPE_LABEL[q.qtype]}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted">{q.points}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Sheet>
  );
}
