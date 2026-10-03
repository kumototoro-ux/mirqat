import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Badge, Empty, ErrorNote, FilterBar, PageHeader, PreviewNote, Select, Tabs } from '@/components/ui';
import { CLASS_SELECT, classLabel, fmtDate, type ClassRef } from '@/lib/format';
import { classOptions } from '@/lib/data';
import { subjectColor } from '@/components/timetable-grid';

export const metadata: Metadata = { title: 'الإثراءات والفيديوهات' };

type Row = {
  id: number;
  kind: 'video' | 'enrichment';
  title: string;
  description: string | null;
  url: string | null;
  published_at: string | null;
  expires_at: string | null;
  class: ClassRef;
  subject: { name: string } | null;
  teacher: { name_ar: string } | null;
};

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ kind?: string; class?: string }> }) {
  await requireUser(['admin', 'teacher']);
  const sp = await searchParams;
  const kind = sp.kind === 'enrichment' ? 'enrichment' : 'video';
  const classId = Number(sp.class) || null;
  const supabase = await createClient();
  let q = supabase
    .from('content_items')
    .select(`id, kind, title, description, url, published_at, expires_at, class:classes(${CLASS_SELECT}), subject:subjects(name), teacher:employees(name_ar)`)
    .eq('kind', kind)
    .order('created_at', { ascending: false })
    .limit(120);
  if (classId) q = q.eq('class_id', classId);
  const [{ data, error }, classes] = await Promise.all([q.returns<Row[]>(), classOptions()]);
  const rows = data ?? [];
  const qs = classId ? `&class=${classId}` : '';

  return (
    <>
      <PageHeader title="الإثراءات والفيديوهات" lead="المحتوى المنشور للطلاب لكل فصل ومادة." />
      <PreviewNote>للعرض الآن. النشر ورصد المشاهدة يأتيان بعد الإطلاق كما في الخطة.</PreviewNote>
      <Tabs
        active={kind}
        items={[
          { key: 'video', label: 'الفيديوهات', href: `/staff/content?kind=video${qs}` },
          { key: 'enrichment', label: 'الإثراءات', href: `/staff/content?kind=enrichment${qs}` },
        ]}
      />
      <FilterBar>
        <input type="hidden" name="kind" value={kind} />
        <Select name="class" label="الفصل" value={classId} options={classes} placeholder="كل الفصول" className="w-64" />
      </FilterBar>
      <ErrorNote error={error} />
      {rows.length === 0 ? (
        <Empty title={kind === 'video' ? 'لا فيديوهات' : 'لا إثراءات'} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <li key={r.id} className="group flex flex-col rounded-2xl border border-line bg-surface p-4 transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-26px_rgb(31_42_36/0.5)]">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl text-chalk" style={{ background: subjectColor(r.subject?.name ?? '') }}>
                  {kind === 'video' ? (
                    <svg viewBox="0 0 20 20" className="size-5" fill="currentColor"><path d="m7 5 8 5-8 5z" /></svg>
                  ) : (
                    <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 4h9l3 3v9H4z" /><path d="M7 9h6M7 12h4" /></svg>
                  )}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold leading-snug">{r.title}</p>
                  <p className="text-sm text-muted">{r.subject?.name} · {classLabel(r.class, true)}</p>
                </div>
              </div>
              {r.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{r.description}</p>}
              <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                {r.teacher && <Badge>{r.teacher.name_ar}</Badge>}
                {r.published_at && <Badge>{fmtDate(r.published_at)}</Badge>}
                {r.url && (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="ms-auto text-sm font-medium text-board hover:underline">
                    فتح
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
