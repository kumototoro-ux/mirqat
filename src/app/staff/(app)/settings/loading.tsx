/** هيكل عظمي لصفحة الإعدادات: عمود الأقسام وبطاقة المحتوى */
export default function Loading() {
  return (
    <div aria-busy="true" className="grid animate-fade-in gap-6 lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:gap-10">
      <div className="hidden space-y-5 lg:block">
        {[3, 5, 2, 2].map((n, g) => (
          <div key={g} className="space-y-2">
            <div className="skeleton h-3 w-20" />
            {Array.from({ length: n }, (_, i) => <div key={i} className="skeleton h-9 w-full rounded-xl" />)}
          </div>
        ))}
      </div>
      <div className="flex gap-2 overflow-hidden lg:hidden">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-9 w-24 shrink-0 rounded-full" />)}</div>
      <div className="max-w-3xl space-y-4">
        <div className="skeleton h-3 w-16" />
        <div className="skeleton h-7 w-40" />
        <div className="space-y-4 rounded-[1.4rem] border border-line bg-surface p-6">
          <div className="skeleton h-5 w-36" />
          <div className="skeleton h-3.5 w-72 max-w-full" />
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-12 w-full" style={{ opacity: 1 - i * 0.14 }} />)}
        </div>
      </div>
    </div>
  );
}
