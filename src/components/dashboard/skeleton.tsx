/** هيكل تحميل الرئيسية: البطل، البطاقات، الإجراءات السريعة، اللوحات */
export function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="جارٍ التحميل" className="animate-fade-in space-y-5">
      <div className="relative h-40 overflow-hidden rounded-[2rem] bg-board/90">
        <div className="absolute inset-0 animate-shimmer bg-gradient-to-l from-transparent via-white/10 to-transparent" />
        <div className="space-y-3 p-7">
          <div className="h-3 w-24 rounded-full bg-chalk/20" />
          <div className="h-8 w-56 rounded-full bg-chalk/25" />
          <div className="h-3 w-72 max-w-full rounded-full bg-chalk/15" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-[1.4rem] border border-line bg-surface p-4">
            <div className="flex justify-between"><div className="skeleton h-3 w-20" /><div className="skeleton size-9 rounded-xl" /></div>
            <div className="skeleton mt-2 h-8 w-16" />
            <div className="skeleton mt-2 h-2.5 w-24" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        {[0, 1].map((k) => (
          <div key={k} className="rounded-[1.5rem] border border-line bg-surface p-5">
            <div className="skeleton mb-4 h-4 w-32" />
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5" style={{ opacity: 1 - i * 0.15 }}>
                <div className="skeleton size-10 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2"><div className="skeleton h-3.5 w-1/2" /><div className="skeleton h-3 w-1/3" /></div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
