import Link from 'next/link';

/** رأس كل صفحة: عنوان، وصف، وإجراءات اختيارية */
export function PageHeader({
  title,
  lead,
  actions,
  eyebrow,
}: {
  title: string;
  lead?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-sm font-medium text-board">{eyebrow}</p>}
        <h1 className="text-[1.65rem] font-bold leading-tight">{title}</h1>
        {lead && <p className="mt-1.5 max-w-2xl text-muted">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  className = '',
  title,
  action,
  pad = true,
}: {
  children: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  action?: React.ReactNode;
  pad?: boolean;
}) {
  return (
    <section className={`rounded-2xl border border-line bg-surface ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="font-semibold">{title}</h2>
          {action}
        </div>
      )}
      <div className={pad ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

export function StatGrid({ items }: { items: { label: string; value: React.ReactNode; hint?: string; tone?: 'board' | 'gold' | 'danger' }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
      {items.map((s) => (
        <div key={s.label} className="bg-surface px-5 py-4">
          <dt className="text-sm text-muted">{s.label}</dt>
          <dd
            className={`mt-1 text-[1.9rem] font-bold leading-none tabular-nums ${
              s.tone === 'gold' ? 'text-brass' : s.tone === 'danger' ? 'text-danger' : 'text-board'
            }`}
          >
            {s.value}
          </dd>
          {s.hint && <p className="mt-1.5 text-xs text-muted">{s.hint}</p>}
        </div>
      ))}
    </dl>
  );
}

const BADGE_TONES = {
  neutral: 'bg-paper text-muted ring-line',
  board: 'bg-board/10 text-board ring-board/20',
  gold: 'bg-brass-soft text-brass ring-brass/25',
  danger: 'bg-danger-soft text-danger ring-danger/20',
  ok: 'bg-ok-soft text-ok ring-ok/20',
} as const;

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: keyof typeof BADGE_TONES }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-14 text-center">
      <svg viewBox="0 0 48 40" className="h-10 w-12 text-board/30" aria-hidden>
        <rect x="2" y="26" width="8" height="12" rx="1.5" fill="currentColor" />
        <rect x="12" y="20" width="8" height="18" rx="1.5" fill="currentColor" />
        <rect x="22" y="14" width="8" height="24" rx="1.5" fill="currentColor" />
        <rect x="32" y="8" width="8" height="30" rx="1.5" fill="currentColor" />
      </svg>
      <p className="mt-3 font-medium">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

/** جدول بيانات: رأس ثابت، تمرير أفقي داخلي، وصفوف تتلون عند المرور */
export function Table({
  head,
  children,
  minWidth = 640,
}: {
  head: React.ReactNode[];
  children: React.ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead className="border-b border-line bg-paper/70 text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-4 py-2.5 text-start font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line [&>tr]:transition-colors [&>tr:hover]:bg-paper/50">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;
}

/**
 * شريط تصفية: نموذج GET عادي يعمل بلا جافاسكربت، والقيم في رابط الصفحة
 * (يُحفظ ويُشارك ويعمل معه زر الرجوع).
 */
export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <form className="mb-5 flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-surface p-3" role="search">
      {children}
      <button type="submit" className="btn-primary py-2">عرض</button>
    </form>
  );
}

export function Select({
  name,
  label,
  value,
  options,
  placeholder,
  className = 'w-48',
}: {
  name: string;
  label: string;
  value?: string | number | null;
  options: { value: string | number; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium text-muted">{label}</span>
      <select name={name} defaultValue={value ?? ''} className="field py-2">
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SearchInput({ name = 'q', value, placeholder, className = 'w-60' }: { name?: string; value?: string; placeholder: string; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium text-muted">بحث</span>
      <input name={name} defaultValue={value} placeholder={placeholder} className="field py-2" />
    </label>
  );
}

export function Tabs({ items, active }: { items: { href: string; label: string; key: string; count?: number }[]; active: string }) {
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {items.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? 'page' : undefined}
            className={`relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors ${on ? 'text-board' : 'text-muted hover:text-ink'}`}
          >
            {t.label}
            {t.count !== undefined && <span className="ms-1.5 text-xs text-muted">({t.count})</span>}
            {on && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-board" />}
          </Link>
        );
      })}
    </nav>
  );
}

/** تنبيه بأن الصفحة للعرض الآن، وأن أدوات الإضافة والتعديل قادمة */
export function PreviewNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-5 flex items-start gap-2 rounded-xl border border-brass/30 bg-brass-soft/50 px-4 py-2.5 text-sm text-brass">
      <svg viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0" aria-hidden>
        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 9v5M10 6.2v.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

export function ErrorNote({ error }: { error: { message: string } | null | undefined }) {
  if (!error) return null;
  return <p role="alert" className="mb-5 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">تعذّر تحميل البيانات: {error.message}</p>;
}
