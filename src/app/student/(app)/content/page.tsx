import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Badge, Empty, PageHeader } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { getMe } from '@/lib/student';
import { subjectColor } from '@/components/timetable-grid';

export const metadata: Metadata = { title: 'الإثراءات' };

export default async function StudentContent() {
  await requireUser(['student']);
  const me = await getMe();
  const supabase = await createClient();
  const { data } = await supabase
    .from('content_items')
    .select('id, kind, title, description, url, published_at, subject:subjects(name)')
    .eq('class_id', me?.class_id ?? -1)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(100)
    .returns<{ id: number; kind: string; title: string; description: string | null; url: string | null; published_at: string | null; subject: { name: string } | null }[]>();

  return (
    <>
      <PageHeader title="الإثراءات والفيديوهات" lead="محتوى إضافي من معلميك لكل مادة." />
      {(data ?? []).length === 0 ? (
        <Empty title="لا محتوى منشور بعد" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(data ?? []).map((c) => (
            <li key={c.id}>
              <a
                href={c.url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-4 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_18px_36px_-26px_rgb(31_42_36/0.5)]"
              >
                <span className="grid size-11 place-items-center rounded-xl text-chalk transition-transform duration-300 group-hover:scale-105" style={{ background: subjectColor(c.subject?.name ?? '') }}>
                  {c.kind === 'video' ? (
                    <svg viewBox="0 0 20 20" className="size-5" fill="currentColor"><path d="m7 5 8 5-8 5z" /></svg>
                  ) : (
                    <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 4h9l3 3v9H4z" /><path d="M7 9h6M7 12h4" /></svg>
                  )}
                </span>
                <p className="mt-3 font-semibold leading-snug group-hover:text-board">{c.title}</p>
                <p className="text-sm text-muted">{c.subject?.name}</p>
                {c.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{c.description}</p>}
                <div className="mt-auto flex gap-1.5 pt-3">
                  <Badge tone="board">{c.kind === 'video' ? 'فيديو' : 'إثراء'}</Badge>
                  {c.published_at && <Badge>{fmtDate(c.published_at)}</Badge>}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
