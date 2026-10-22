/*
  هياكل التحميل: لكل نوع صفحة هيكل يشبه شكلها الفعلي، فيظهر فورًا عند التنقل
  ويُستبدل بالمحتوى دون قفزة في التخطيط. (loading.tsx في كل مسار يختار ما يناسبه)
*/

const Bar = ({ className = '' }: { className?: string }) => <div className={`skeleton ${className}`} />;

function Shell({ children, label = 'جارٍ التحميل' }: { children: React.ReactNode; label?: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="animate-fade-in space-y-5">
      {children}
    </div>
  );
}

export function HeaderSkeleton({ actions = false }: { actions?: boolean }) {
  return (
    <div className="mb-1 flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-2.5">
        <Bar className="h-7 w-56" />
        <Bar className="h-3.5 w-80 max-w-[70vw]" />
      </div>
      {actions && <Bar className="h-11 w-36 rounded-xl" />}
    </div>
  );
}

function StatCards({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="rounded-[1.4rem] border border-line bg-surface p-4">
          <div className="flex justify-between"><Bar className="h-3 w-20" /><Bar className="size-9 rounded-xl" /></div>
          <Bar className="mt-3 h-8 w-16" />
          <Bar className="mt-2 h-2.5 w-24" />
        </div>
      ))}
    </div>
  );
}

function Rows({ n = 8, avatar = true }: { n?: number; avatar?: boolean }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-t border-line px-4 py-3.5" style={{ opacity: 1 - i * 0.09 }}>
          {avatar && <Bar className="size-9 shrink-0 rounded-full" />}
          <div className="flex-1 space-y-2"><Bar className="h-3.5 w-1/3" /><Bar className="h-3 w-1/5" /></div>
          <Bar className="hidden h-6 w-20 rounded-full sm:block" />
          <Bar className="hidden h-6 w-16 rounded-full md:block" />
        </div>
      ))}
    </>
  );
}

/** سجلّ: بطاقات إحصاء ورسم، ثم جدول بأدوات بحث وتصفية */
export function RegistrySkeleton({ chart = true }: { chart?: boolean }) {
  return (
    <Shell>
      <div className={`grid gap-3 ${chart ? 'lg:grid-cols-[1fr_1fr_1.1fr]' : ''}`}>
        <div className="grid grid-cols-2 gap-3 lg:col-span-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-[1.4rem] border border-line bg-surface p-5">
              <div className="flex justify-between"><Bar className="h-3.5 w-24" /><Bar className="size-9 rounded-xl" /></div>
              <Bar className="mt-4 h-9 w-16" />
            </div>
          ))}
        </div>
        {chart && (
          <div className="hidden items-center gap-5 rounded-[1.4rem] border border-line bg-surface p-5 lg:flex">
            <Bar className="size-32 shrink-0 rounded-full" />
            <div className="flex-1 space-y-3"><Bar className="h-3 w-full" /><Bar className="h-3 w-4/5" /><Bar className="h-3 w-3/5" /></div>
          </div>
        )}
      </div>
      <div className="overflow-hidden rounded-[1.4rem] border border-line bg-surface">
        <div className="flex flex-wrap gap-2 p-4">
          <Bar className="h-10 w-40" />
          <Bar className="h-10 flex-1" />
          <Bar className="h-10 w-28" />
        </div>
        <Rows />
      </div>
    </Shell>
  );
}

/** صفحة تفاصيل: رأس بطاقة ثم عمودان */
export function DetailSkeleton() {
  return (
    <Shell>
      <Bar className="h-4 w-28" />
      <div className="flex items-start gap-4 rounded-[1.6rem] border border-line bg-surface p-5">
        <Bar className="size-14 shrink-0 rounded-2xl" />
        <div className="flex-1 space-y-2.5"><Bar className="h-3 w-40" /><Bar className="h-6 w-2/3" /><Bar className="h-3 w-1/3" /></div>
      </div>
      <StatCards />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="overflow-hidden rounded-[1.4rem] border border-line bg-surface"><div className="p-4"><Bar className="h-4 w-32" /></div><Rows n={6} /></div>
        <div className="space-y-3 rounded-[1.4rem] border border-line bg-surface p-5">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="flex justify-between"><Bar className="h-3 w-20" /><Bar className="h-3 w-28" /></div>)}
        </div>
      </div>
    </Shell>
  );
}

/** شبكة بطاقات (الرصد، الاختبارات، المهام عند الطالب) */
export function CardGridSkeleton({ hero = false, cols = 3 }: { hero?: boolean; cols?: 2 | 3 }) {
  return (
    <Shell>
      <HeaderSkeleton />
      {hero && <Bar className="h-28 rounded-[1.75rem]" />}
      <div className="flex gap-2"><Bar className="h-10 w-64 rounded-2xl" /><Bar className="h-10 w-28 rounded-2xl" /></div>
      <div className={`grid gap-3 sm:grid-cols-2 ${cols === 3 ? 'xl:grid-cols-3' : ''}`}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-[1.4rem] border border-line bg-surface p-4" style={{ opacity: 1 - i * 0.08 }}>
            <div className="flex items-start gap-3"><Bar className="size-11 shrink-0 rounded-xl" /><div className="flex-1 space-y-2"><Bar className="h-4 w-3/4" /><Bar className="h-3 w-1/2" /></div></div>
            <Bar className="h-2 w-full rounded-full" />
            <div className="flex gap-2"><Bar className="h-6 w-16 rounded-full" /><Bar className="h-6 w-20 rounded-full" /></div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

/** الجداول الأسبوعية: بطاقة الحصة الحالية ثم شبكة الأيام × الحصص */
export function TimetableSkeleton() {
  return (
    <Shell>
      <HeaderSkeleton />
      <Bar className="h-28 rounded-[1.75rem]" />
      <div className="overflow-hidden rounded-[1.4rem] border border-line bg-surface p-4">
        <div className="mb-3 grid grid-cols-7 gap-2">{Array.from({ length: 7 }, (_, i) => <Bar key={i} className="h-8" />)}</div>
        {Array.from({ length: 5 }, (_, r) => (
          <div key={r} className="mb-2 grid grid-cols-7 gap-2" style={{ opacity: 1 - r * 0.12 }}>
            {Array.from({ length: 7 }, (_, i) => <Bar key={i} className="h-14 rounded-xl" />)}
          </div>
        ))}
      </div>
    </Shell>
  );
}

/** التقويم: بطاقة الأسبوع الحالي ثم خط زمني */
export function TimelineSkeleton() {
  return (
    <Shell>
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Bar className="h-36 rounded-[1.75rem]" />
        <Bar className="h-36 rounded-[1.75rem]" />
      </div>
      <div className="space-y-3 rounded-[1.4rem] border border-line bg-surface p-5">
        <Bar className="h-9 w-56 rounded-xl" />
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex items-center gap-3" style={{ opacity: 1 - i * 0.1 }}>
            <Bar className="h-16 flex-1 rounded-xl" />
            <Bar className="size-3 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </Shell>
  );
}

/** نماذج الإدخال: أقسام مرقّمة بحقول */
export function FormSkeleton({ sections = 3, narrow = false }: { sections?: number; narrow?: boolean }) {
  return (
    <Shell>
      <HeaderSkeleton />
      <div className={`space-y-4 ${narrow ? 'mx-auto max-w-md' : ''}`}>
        {Array.from({ length: sections }, (_, s) => (
          <div key={s} className="space-y-4 rounded-[1.4rem] border border-line bg-surface p-5">
            <div className="flex items-center gap-3"><Bar className="size-8 rounded-full" /><Bar className="h-4 w-40" /></div>
            {Array.from({ length: 3 }, (_, i) => <div key={i} className="space-y-2"><Bar className="h-3 w-24" /><Bar className="h-11 w-full rounded-xl" /></div>)}
          </div>
        ))}
      </div>
    </Shell>
  );
}

/** الإعدادات: قائمة أقسام جانبية ومحتوى */
export function SettingsSkeleton() {
  return (
    <Shell>
      <HeaderSkeleton />
      <div className="grid gap-5 lg:grid-cols-[14rem_1fr]">
        <div className="hidden space-y-2 lg:block">{Array.from({ length: 10 }, (_, i) => <Bar key={i} className="h-9 rounded-xl" />)}</div>
        <div className="space-y-4">
          {[0, 1].map((k) => (
            <div key={k} className="space-y-4 rounded-[1.4rem] border border-line bg-surface p-5">
              <Bar className="h-5 w-40" /><Bar className="h-3 w-72 max-w-full" />
              {Array.from({ length: 4 }, (_, i) => <Bar key={i} className="h-11 rounded-xl" />)}
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}

/** التقارير: بطاقة رأس خضراء، ملخص، ثم جداول ورسوم */
export function ReportSkeleton() {
  return (
    <Shell>
      <div className="flex justify-between"><Bar className="h-4 w-20" /><Bar className="h-9 w-36 rounded-xl" /></div>
      <div className="h-36 rounded-[1.75rem] bg-board/85" />
      <StatCards />
      <div className="space-y-3 rounded-[1.4rem] border border-line bg-surface p-5">
        <Bar className="h-5 w-48" />
        {Array.from({ length: 5 }, (_, i) => <Bar key={i} className="h-9 rounded-lg" />)}
      </div>
      <Bar className="h-64 rounded-[1.4rem]" />
    </Shell>
  );
}

/** صفحات التبويبات بعمودين (التحضير، السلوك، النتائج) */
export function SplitSkeleton({ hero = false }: { hero?: boolean }) {
  return (
    <Shell>
      <HeaderSkeleton />
      <Bar className="h-11 w-80 max-w-full rounded-2xl" />
      {hero && <Bar className="h-32 rounded-[1.75rem]" />}
      <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
        <div className="space-y-3">
          <Bar className="h-28 rounded-[1.4rem]" />
          <div className="overflow-hidden rounded-[1.4rem] border border-line bg-surface"><Rows n={5} avatar={false} /></div>
        </div>
        <div className="overflow-hidden rounded-[1.4rem] border border-line bg-surface"><div className="p-4"><Bar className="h-10 w-full rounded-xl" /></div><Rows n={7} /></div>
      </div>
    </Shell>
  );
}
