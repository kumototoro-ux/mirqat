import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui';
import { Icon } from '@/components/shell/icons';
import { RichText } from '@/components/assess/math';
import { Attachments } from '@/components/assess/attachments';
import { TaskSubmit } from '@/components/assess/task-submit';
import { StartButton } from '@/components/assess/start-button';
import { FormReview, type ReviewQuestion } from '@/components/assess/form-review';
import { fmtFull } from '@/components/assess/kit';
import { STATE_META, canRetry, studentState, type StudentItem } from '@/lib/assess/student';
import { fmtBytes, relTime } from '@/lib/assess/shared';
import { publicUrl, signedUrls } from '@/lib/assess/storage';
import type { Attachment } from '@/lib/assess/queries';

export const metadata: Metadata = { title: 'التفاصيل' };

type Review =
  | { status: 'none' }
  | { status: 'hidden'; submitted_at: string; attempt_no: number; show_results: string; closes_at: string | null }
  | { status: 'score_only'; score: number; max_score: number; pending_review: number; submitted_at: string; attempt_no: number }
  | { status: 'shown'; score: number; max_score: number; pending_review: number; submitted_at: string; attempt_no: number; questions: ReviewQuestion[] };

export default async function StudentItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(['student']);
  const id = Number((await params).id);
  if (!Number.isFinite(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_assessments');
  const item = ((data as StudentItem[]) ?? []).find((x) => x.id === id);
  if (!item) notFound();
  const state = studentState(item);
  const meta = STATE_META[state];

  const [att, sub, review] = await Promise.all([
    supabase.from('assessment_attachments').select('kind, name, url, storage_path, mime, size_bytes').eq('assessment_id', id).order('position'),
    item.kind === 'task'
      ? supabase.from('task_submissions').select('body, submitted_at, updated_at, graded_at, feedback, is_late, files:submission_files(id, name, mime, size_bytes, storage_path, deleted_at)').eq('assessment_id', id).maybeSingle()
      : Promise.resolve({ data: null }),
    item.kind === 'form' && item.attempts > 0 ? supabase.rpc('get_form_review', { p_assessment_id: id }) : Promise.resolve({ data: null }),
  ]);
  const attachments: Attachment[] = ((att.data ?? []) as Omit<Attachment, 'href'>[]).map((a) => ({ ...a, href: a.kind === 'link' ? a.url! : publicUrl(a.storage_path!) }));
  type SubRow = { body: string | null; submitted_at: string; updated_at: string; graded_at: string | null; feedback: string | null; is_late: boolean; files: { id: number; name: string; mime: string; size_bytes: number; storage_path: string; deleted_at: string | null }[] };
  const submission = sub.data as SubRow | null;
  const liveFiles = (submission?.files ?? []).filter((f) => !f.deleted_at);
  const urls = await signedUrls(liveFiles.map((f) => f.storage_path), 3600);
  const rv = review.data as Review | null;
  const deadline = item.kind === 'form' ? item.closes_at : item.due_at;
  const canSubmit = item.kind === 'task' && ['todo', 'late_open', 'submitted'].includes(state) && item.submission_mode !== 'none' && !submission?.graded_at;
  const attemptsLeft = (item.max_attempts ?? 1) - item.attempts;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/student/tasks" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-board">
        <Icon name="chevron" className="size-4 rotate-180" /> مهامي ونماذجي
      </Link>

      <section className="mb-4 rounded-[1.6rem] border border-line bg-surface p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className={`grid size-14 shrink-0 place-items-center rounded-2xl ${item.kind === 'form' ? 'bg-brass-soft text-brass' : 'bg-board/10 text-board'}`}>
            <Icon name={item.kind === 'form' ? 'forms' : 'tasks'} className="size-7" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={meta.tone}>{meta.label}</Badge>
              <span className="text-xs text-muted">{item.subject}{item.eval_type ? ` · ${item.eval_type}` : ''}</span>
            </div>
            <h1 className="mt-1.5 text-[1.45rem] font-bold leading-snug">{item.title}</h1>
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {deadline && (
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ${['todo', 'in_progress'].includes(state) ? 'bg-brass-soft text-brass' : 'bg-paper'}`}>
                  <Icon name="clock" className="size-3.5" /> {item.kind === 'form' ? 'يُغلق' : 'التسليم حتى'} {fmtFull(deadline)} · {relTime(deadline)}
                </span>
              )}
              {item.kind === 'form' && <span className="rounded-full bg-paper px-3 py-1">{item.questions} سؤال</span>}
              {item.kind === 'form' && item.time_limit_minutes && <span className="rounded-full bg-paper px-3 py-1">{item.time_limit_minutes} دقيقة</span>}
              {item.kind === 'form' && <span className="rounded-full bg-paper px-3 py-1">المحاولات {item.attempts}/{item.max_attempts}</span>}
              {item.max_score != null && item.kind === 'task' && <span className="rounded-full bg-paper px-3 py-1">من {item.max_score}</span>}
            </div>
          </div>
          {item.grade && (
            <div className={`shrink-0 rounded-2xl px-4 py-3 text-center ${item.grade.source === 'auto_absent' ? 'bg-danger-soft text-danger' : 'bg-ok-soft text-ok'}`}>
              <p className="text-[0.7rem] font-semibold">درجتك</p>
              <p className="text-2xl font-bold tabular-nums" dir="ltr">{Number(item.grade.score)}<span className="text-sm opacity-70">/{Number(item.grade.max_score)}</span></p>
            </div>
          )}
        </div>
        {item.description && (
          <div className="mt-5 rounded-2xl bg-paper/60 px-4 py-3.5 leading-relaxed">
            <RichText text={item.description} />
          </div>
        )}
      </section>

      {attachments.length > 0 && <Attachments items={attachments} className="mb-4" />}

      {/* ---------------- المهمة ---------------- */}
      {item.kind === 'task' && (
        <>
          {submission?.feedback && (
            <div className="mb-4 flex items-start gap-3 rounded-[1.4rem] border border-board/20 bg-board/[0.05] p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-board text-chalk"><Icon name="edit" className="size-4" /></span>
              <div>
                <p className="text-xs font-semibold text-board">ملاحظة المعلم</p>
                <p className="mt-0.5 leading-relaxed">{submission.feedback}</p>
              </div>
            </div>
          )}
          {canSubmit ? (
            <TaskSubmit
              assessmentId={item.id}
              mode={item.submission_mode}
              initialBody={submission?.body ?? ''}
              initialFiles={liveFiles.map((f) => ({ path: f.storage_path, name: f.name, size: f.size_bytes, mime: f.mime, url: urls[f.storage_path] ?? null }))}
              late={state === 'late_open' || (!!item.due_at && new Date(item.due_at).getTime() < Date.now())}
              resubmit={!!submission}
            />
          ) : submission ? (
            <section className="rounded-[1.4rem] border border-line bg-surface p-5">
              <p className="mb-3 flex items-center gap-2 font-bold"><Icon name="check" className="size-5 text-ok" /> سلّمت {fmtFull(submission.updated_at)}{submission.is_late ? ' (متأخر)' : ''}</p>
              {submission.body && <div className="whitespace-pre-wrap rounded-xl bg-paper/60 px-4 py-3 leading-relaxed">{submission.body}</div>}
              {(submission.files ?? []).length > 0 && (
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {submission.files.map((f) => (
                    <li key={f.id} className="flex items-center gap-3 rounded-xl border border-line p-2.5 text-sm">
                      <Icon name={f.mime.startsWith('image/') ? 'image' : 'clip'} className="size-5 text-board" />
                      {urls[f.storage_path] ? <a href={urls[f.storage_path]} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-semibold hover:underline">{f.name}</a> : <span className="min-w-0 flex-1 truncate text-muted">{f.name}</span>}
                      <span className="text-xs text-muted">{f.deleted_at ? 'حُذف بعد التصحيح' : fmtBytes(f.size_bytes)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <section className="rounded-[1.4rem] border border-line bg-surface p-6 text-center text-muted">
              {item.submission_mode === 'none' ? 'هذه مهمة صفية — تُرصد درجتها من المعلم مباشرة.' : state === 'missed' ? 'انتهى موعد التسليم.' : 'التسليم غير متاح الآن.'}
            </section>
          )}
        </>
      )}

      {/* ---------------- النموذج ---------------- */}
      {item.kind === 'form' && (
        <>
          {(state === 'todo' || state === 'in_progress' || canRetry(item)) && (
            <section className="mb-4 rounded-[1.4rem] border border-board/25 bg-gradient-to-br from-[#e6f0ea] to-surface p-5 text-center sm:p-6">
              <p className="text-lg font-bold">{state === 'in_progress' ? 'لديك محاولة لم تُسلَّم' : canRetry(item) ? `يمكنك محاولة أخرى (بقي ${attemptsLeft})` : 'جاهز للحل؟'}</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                {state === 'in_progress'
                  ? 'إجاباتك محفوظة — أكمل من حيث توقفت.'
                  : item.time_limit_minutes
                    ? `لديك ${item.time_limit_minutes} دقيقة من لحظة البدء. ابدأ حين تكون مستعدًا ومتصلًا بالإنترنت.`
                    : 'يمكنك الحل حتى وقت الإغلاق، وإجاباتك تُحفظ تلقائيًا.'}
              </p>
              <div className="mt-4">
                <StartButton id={item.id} label={state === 'in_progress' ? 'أكمل الحل' : canRetry(item) ? 'محاولة جديدة' : 'ابدأ الحل'} minutes={item.time_limit_minutes} questions={item.questions} attemptsLeft={attemptsLeft} resume={state === 'in_progress'} />
              </div>
            </section>
          )}
          {state === 'upcoming' && item.opens_at && (
            <section className="rounded-[1.4rem] border border-line bg-surface p-6 text-center">
              <Icon name="clock" className="mx-auto size-8 text-board" />
              <p className="mt-2 font-bold">يُفتح {fmtFull(item.opens_at)}</p>
              <p className="text-sm text-muted">{relTime(item.opens_at)}</p>
            </section>
          )}
          {state === 'missed' && !item.grade && <section className="rounded-[1.4rem] border border-line bg-surface p-6 text-center text-muted">انتهى وقت هذا النموذج.</section>}
          {rv?.status === 'hidden' && (
            <section className="rounded-[1.4rem] border border-line bg-surface p-6 text-center">
              <Icon name="check" className="mx-auto size-8 text-ok" />
              <p className="mt-2 font-bold">سلّمت إجاباتك {fmtFull(rv.submitted_at)}</p>
              <p className="mt-1 text-sm text-muted">{rv.show_results === 'after_close' ? `تظهر نتيجتك ومراجعة إجاباتك بعد إغلاق النموذج${rv.closes_at ? ` (${relTime(rv.closes_at)})` : ''}.` : 'نتيجة هذا النموذج عند المعلم.'}</p>
            </section>
          )}
          {rv?.status === 'score_only' && (
            <section className="rounded-[1.4rem] border border-line bg-surface p-6 text-center">
              <Icon name="check" className="mx-auto size-8 text-ok" />
              <p className="mt-2 font-bold">سلّمت إجاباتك {fmtFull(rv.submitted_at)}</p>
              <p className="mt-1 text-sm text-muted">درجتك ظاهرة أعلى الصفحة. استعراض الأسئلة والإجابات غير متاح في هذا الاختبار.</p>
              {rv.pending_review > 0 && <p className="mt-2 text-xs text-brass">{rv.pending_review} سؤال بانتظار تصحيح المعلم — قد تتغير درجتك.</p>}
            </section>
          )}
          {rv?.status === 'shown' && (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-bold">مراجعة إجاباتك {rv.attempt_no > 1 ? `(المحاولة ${rv.attempt_no})` : ''}</h2>
                {rv.pending_review > 0 && <Badge tone="gold">{rv.pending_review} بانتظار التصحيح</Badge>}
              </div>
              <FormReview questions={rv.questions} />
            </>
          )}
        </>
      )}
    </div>
  );
}
