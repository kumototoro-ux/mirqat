/** هيكل عظمي عام يظهر فورًا أثناء تحميل أي صفحة (loading.tsx) */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="جارٍ التحميل" className="animate-fade-in">
      <div className="mb-7 space-y-2.5">
        <div className="skeleton h-3.5 w-24" />
        <div className="skeleton h-7 w-56" />
        <div className="skeleton h-3.5 w-80 max-w-full" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-line bg-surface p-5">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton mt-3 h-7 w-14" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="mb-4 flex gap-2">
          <div className="skeleton h-10 flex-1" />
          <div className="skeleton h-10 w-28" />
        </div>
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-t border-line py-3.5" style={{ opacity: 1 - i * 0.1 }}>
            <div className="skeleton size-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-3.5 w-1/3" />
              <div className="skeleton h-3 w-1/5" />
            </div>
            <div className="skeleton hidden h-6 w-20 rounded-full sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
