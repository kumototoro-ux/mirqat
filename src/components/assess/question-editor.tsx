'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { uploadAttachment } from '@/lib/assess/actions';
import { convertQuestion, questionIssues, type DraftQuestion } from '@/lib/assess/draft';
import { QTYPES, assetUrl, parseBlanks, type QType } from '@/lib/assess/shared';
import { compressImage } from '@/lib/compress';
import { MathField, RichText } from './math';

const LETTERS = 'أبجدهوزحطي';

export function QuestionCard({
  q,
  index,
  total,
  locked,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
  showIssues,
}: {
  q: DraftQuestion;
  index: number;
  total: number;
  /** وصلت إجابات: لا تغيير في البنية (النوع/عدد الخيارات/الأزواج/الفراغات) */
  locked: boolean;
  onChange: (q: DraftQuestion) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  showIssues: boolean;
}) {
  const { toast } = useFeedback();
  const [open, setOpen] = useState(true);
  const [more, setMore] = useState(Boolean(q.explanation || q.section_title));
  const [uploading, setUploading] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);
  const issues = questionIssues(q);
  const set = (patch: Partial<DraftQuestion>) => onChange({ ...q, ...patch });
  const meta = QTYPES.find((t) => t.value === q.qtype)!;
  const isNew = !q.id;
  const structLocked = locked && !isNew;

  const uploadImage = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true);
    try {
      const file = await compressImage(f, { target: 300 * 1024, max: 2 * 1024 * 1024 });
      const fd = new FormData();
      fd.set('file', file);
      fd.set('purpose', 'question');
      const res = await uploadAttachment(fd);
      if (!res.ok) toast(res.error, 'error');
      else set({ image_url: res.data!.storage_path });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className={`rounded-[1.25rem] border bg-surface transition-[border-color,box-shadow] ${showIssues && issues.length ? 'border-danger/40 shadow-[0_0_0_3px_rgb(176_58_46/0.08)]' : 'border-line'}`}
    >
      {q.section_title && (
        <div className="rounded-t-[1.25rem] border-b border-line bg-board/[0.05] px-4 py-2 text-sm font-bold text-board">{q.section_title}</div>
      )}
      <header className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink text-sm font-bold tabular-nums text-chalk">{index + 1}</span>
        <label className="relative">
          <select
            value={q.qtype}
            disabled={structLocked}
            onChange={(e) => onChange(convertQuestion(q, e.target.value as QType))}
            className="h-9 appearance-none rounded-lg border border-line bg-paper/60 pe-8 ps-3 text-sm font-semibold focus:border-board focus:outline-none disabled:opacity-70"
            aria-label="نوع السؤال"
          >
            {QTYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <Icon name="chevron" className="pointer-events-none absolute inset-y-0 end-2 my-auto size-4 -rotate-90 text-muted" />
        </label>
        <label className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-paper/60 px-2 text-sm">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={1000}
            step={0.5}
            value={Number.isFinite(q.points) ? q.points : ''}
            onChange={(e) => set({ points: e.target.value === '' ? NaN : Number(e.target.value) })}
            className="w-12 bg-transparent text-center font-bold tabular-nums focus:outline-none"
            dir="ltr"
            aria-label="الدرجة"
          />
          <span className="text-muted">درجة</span>
        </label>
        {!open && <span className="min-w-0 flex-1 truncate text-sm text-muted"><RichText text={q.body.slice(0, 90) || '—'} /></span>}
        <div className="ms-auto flex items-center gap-0.5">
          <IconBtn icon="arrowUp" label="لأعلى" disabled={index === 0} onClick={() => onMove(-1)} />
          <IconBtn icon="arrowDown" label="لأسفل" disabled={index === total - 1} onClick={() => onMove(1)} />
          <IconBtn icon="copy" label="تكرار" disabled={locked} onClick={onDuplicate} />
          <IconBtn icon="trash" label="حذف" tone="danger" disabled={structLocked} onClick={onRemove} />
          <IconBtn icon="chevron" label={open ? 'طي' : 'فتح'} onClick={() => setOpen((o) => !o)} rotate={open ? 90 : -90} />
        </div>
      </header>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="space-y-4 border-t border-line px-3 pb-4 pt-3.5 sm:px-4">
              {q.qtype === 'fill' ? (
                <FillEditor q={q} set={set} locked={structLocked} />
              ) : (
                <MathField value={q.body} onChange={(v) => set({ body: v })} rows={2} placeholder="نص السؤال…" ariaLabel="نص السؤال" />
              )}

              {/* صورة السؤال */}
              {q.image_url ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={assetUrl(q.image_url) ?? ''} alt="" className="max-h-56 rounded-xl border border-line object-contain" />
                  <button type="button" onClick={() => set({ image_url: null })} className="absolute -top-2 -end-2 grid size-7 place-items-center rounded-full bg-ink text-chalk shadow" aria-label="إزالة الصورة">
                    <Icon name="close" className="size-4" />
                  </button>
                </div>
              ) : null}

              {q.qtype === 'mcq' && <McqEditor q={q} set={set} locked={structLocked} />}
              {q.qtype === 'tf' && <TfEditor q={q} set={set} />}
              {q.qtype === 'short' && <ShortEditor q={q} set={set} />}
              {q.qtype === 'long' && (
                <p className="rounded-xl bg-paper/70 px-3 py-2.5 text-sm text-muted">يكتب الطالب إجابة مفصّلة، وتصححها أنت من صفحة النتائج.</p>
              )}
              {q.qtype === 'match' && <MatchEditor q={q} set={set} locked={structLocked} />}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input ref={imgRef} type="file" accept="image/*" hidden onChange={(e) => { uploadImage(e.target.files?.[0]); e.target.value = ''; }} />
                <button type="button" onClick={() => imgRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-board/10 hover:text-board">
                  {uploading ? <span className="spinner" /> : <Icon name="image" className="size-4" />} {q.image_url ? 'تغيير الصورة' : 'صورة'}
                </button>
                <button type="button" onClick={() => setMore((m) => !m)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-board/10 hover:text-board">
                  <Icon name="plus" className="size-4" /> عنوان قسم وشرح الإجابة
                </button>
                <span className="ms-auto text-xs text-muted">{meta.hint}</span>
              </div>
              {more && (
                <div className="grid gap-3 rounded-xl border border-dashed border-line p-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-muted">عنوان قسم يظهر قبل هذا السؤال</span>
                    <input value={q.section_title} onChange={(e) => set({ section_title: e.target.value })} className="field py-2" placeholder="مثال: القسم الثاني — المقالي" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-muted">شرح الإجابة (يظهر للطالب في المراجعة)</span>
                    <input value={q.explanation} onChange={(e) => set({ explanation: e.target.value })} className="field py-2" placeholder="لماذا هذه الإجابة صحيحة؟" />
                  </label>
                </div>
              )}

              {showIssues && issues.length > 0 && (
                <p className="flex animate-nudge items-center gap-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
                  <Icon name="alert" className="size-4 shrink-0" /> {issues.join(' · ')}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

function IconBtn({ icon, label, onClick, disabled, tone, rotate }: { icon: Parameters<typeof Icon>[0]['name']; label: string; onClick: () => void; disabled?: boolean; tone?: 'danger'; rotate?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`grid size-8 place-items-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-30 ${tone === 'danger' ? 'text-muted hover:bg-danger-soft hover:text-danger' : 'text-muted hover:bg-board/10 hover:text-board'}`}
    >
      <span style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined} className="transition-transform duration-200">
        <Icon name={icon} className="size-4" />
      </span>
    </button>
  );
}

type EditorProps = { q: DraftQuestion; set: (p: Partial<DraftQuestion>) => void; locked?: boolean };

function McqEditor({ q, set, locked }: EditorProps) {
  const update = (i: number, patch: Partial<DraftQuestion['options'][number]>) => set({ options: q.options.map((o, j) => (j === i ? { ...o, ...patch } : patch.is_correct ? { ...o, is_correct: false } : o)) });
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-muted">الخيارات — اضغط الدائرة لتحديد الإجابة الصحيحة</p>
      <ul className="space-y-2">
        {q.options.map((o, i) => (
          <li key={i} className={`flex items-start gap-2 rounded-xl border p-1.5 transition-colors ${o.is_correct ? 'border-ok/50 bg-ok-soft/40' : 'border-transparent'}`}>
            <button
              type="button"
              onClick={() => update(i, { is_correct: true })}
              aria-label={`الإجابة الصحيحة: ${LETTERS[i]}`}
              aria-pressed={o.is_correct}
              className={`mt-1.5 grid size-8 shrink-0 place-items-center rounded-full border-2 text-sm font-bold transition-all ${o.is_correct ? 'border-ok bg-ok text-chalk' : 'border-line text-muted hover:border-ok/60'}`}
            >
              {o.is_correct ? <Icon name="check" className="size-4" /> : LETTERS[i]}
            </button>
            <div className="min-w-0 flex-1">
              <MathField value={o.body} onChange={(v) => update(i, { body: v })} multiline={false} placeholder={`الخيار ${LETTERS[i]}`} ariaLabel={`الخيار ${LETTERS[i]}`} />
            </div>
            <button
              type="button"
              disabled={locked || q.options.length <= 2}
              onClick={() => set({ options: q.options.filter((_, j) => j !== i).map((x, j, arr) => (o.is_correct && j === 0 && !arr.some((y) => y.is_correct) ? { ...x, is_correct: true } : x)) })}
              className="mt-1.5 grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-25"
              aria-label="حذف الخيار"
            >
              <Icon name="close" className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      {!locked && q.options.length < 10 && (
        <button type="button" onClick={() => set({ options: [...q.options, { body: '', is_correct: false }] })} className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-board hover:bg-board/10">
          <Icon name="plus" className="size-4" /> خيار
        </button>
      )}
    </div>
  );
}

function TfEditor({ q, set }: EditorProps) {
  const trueCorrect = q.options[0]?.is_correct;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-muted">الإجابة الصحيحة</p>
      <div className="grid max-w-sm grid-cols-2 gap-2">
        {[true, false].map((v) => {
          const on = trueCorrect === v;
          return (
            <button
              key={String(v)}
              type="button"
              onClick={() => set({ options: [{ ...q.options[0], body: 'صح', is_correct: v }, { ...q.options[1], body: 'خطأ', is_correct: !v }] })}
              className={`flex items-center justify-center gap-2 rounded-xl border-2 py-3 font-bold transition-all active:scale-95 ${on ? (v ? 'border-ok bg-ok-soft text-ok' : 'border-danger bg-danger-soft text-danger') : 'border-line text-muted hover:border-muted'}`}
            >
              {v ? '✓ صح' : '✗ خطأ'}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ShortEditor({ q, set }: EditorProps) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-muted">الإجابات المقبولة — أي واحدة منها تُصحَّح صحيحة</p>
      <ul className="space-y-2">
        {q.answers.map((a, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ok-soft text-ok"><Icon name="check" className="size-3.5" /></span>
            <input value={a} onChange={(e) => set({ answers: q.answers.map((x, j) => (j === i ? e.target.value : x)) })} className="field py-2" placeholder={i === 0 ? 'مثال: الرياض' : 'إجابة بديلة'} />
            <button type="button" onClick={() => set({ answers: q.answers.filter((_, j) => j !== i) })} disabled={q.answers.length <= 1} className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-25" aria-label="حذف">
              <Icon name="close" className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => set({ answers: [...q.answers, ''] })} className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-board hover:bg-board/10">
        <Icon name="plus" className="size-4" /> إجابة بديلة
      </button>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        المقارنة تتجاهل التشكيل والمسافات والهمزات والتاء المربوطة، والأرقام العربية = الإنجليزية (٤ = 4). اترك الإجابات فارغة لتصححها يدويًا.
      </p>
    </div>
  );
}

function MatchEditor({ q, set, locked }: EditorProps) {
  const upd = (i: number, k: 'l' | 'r', v: string) => set({ pairs: q.pairs.map((p, j) => (j === i ? { ...p, [k]: v } : p)) });
  return (
    <div>
      <div className="mb-2 grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 text-xs font-semibold text-muted">
        <span>العمود الأول</span>
        <span />
        <span>ما يقابله (يُخلط للطالب)</span>
        <span className="w-8" />
      </div>
      <ul className="space-y-2">
        {q.pairs.map((p, i) => (
          <li key={i} className="grid grid-cols-[1fr_auto_1fr_auto] items-start gap-2">
            <MathField value={p.l} onChange={(v) => upd(i, 'l', v)} multiline={false} placeholder={`${i + 1}`} />
            <span className="mt-2.5 text-board">⇄</span>
            <MathField value={p.r} onChange={(v) => upd(i, 'r', v)} multiline={false} placeholder="المقابل" />
            <button type="button" onClick={() => set({ pairs: q.pairs.filter((_, j) => j !== i) })} disabled={locked || q.pairs.length <= 2} className="mt-1.5 grid size-8 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-25" aria-label="حذف">
              <Icon name="close" className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      {!locked && q.pairs.length < 12 && (
        <button type="button" onClick={() => set({ pairs: [...q.pairs, { l: '', r: '' }] })} className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-board hover:bg-board/10">
          <Icon name="plus" className="size-4" /> زوج
        </button>
      )}
      <p className="mt-2 text-xs text-muted">الدرجة تُوزَّع على الأزواج: كل توصيل صحيح يأخذ جزءه.</p>
    </div>
  );
}

function FillEditor({ q, set, locked }: EditorProps) {
  const { blanks, body } = parseBlanks(q.body);
  return (
    <div>
      <MathField value={q.body} onChange={(v) => set({ body: v })} rows={3} placeholder="عاصمة المملكة العربية السعودية هي {{الرياض}} وتقع في منطقة {{نجد|الوسطى}}" ariaLabel="نص السؤال بالفراغات" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!locked && (
          <button type="button" onClick={() => set({ body: `${q.body}${q.body && !q.body.endsWith(' ') ? ' ' : ''}{{}}` })} className="inline-flex items-center gap-1.5 rounded-lg bg-board/10 px-2.5 py-1.5 text-sm font-semibold text-board hover:bg-board/15">
          <Icon name="plus" className="size-4" /> فراغ
          </button>
        )}
        <span className="text-xs leading-relaxed text-muted">
          ضع الإجابة بين قوسين مزدوجين <code dir="ltr">{'{{ }}'}</code>، والبدائل بخط عمودي <code dir="ltr">{'{{4|أربعة}}'}</code>
        </span>
      </div>
      {blanks.length > 0 && (
        <div className="mt-3 rounded-xl bg-paper/70 px-3 py-2.5 text-[0.95rem] leading-loose">
          <span className="me-2 text-xs font-semibold text-board">يراها الطالب:</span>
          <RichText
            text={body}
            blank={(n) => (
              <span className="mx-1 inline-flex min-w-16 items-center justify-center rounded-md border-b-2 border-board bg-surface px-2 text-xs text-ok" title={blanks[n - 1]?.join(' | ')}>
                {blanks[n - 1]?.[0] || '؟'}
              </span>
            )}
          />
        </div>
      )}
    </div>
  );
}
