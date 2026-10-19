/** هيكل تحميل مكتبة المحتوى: بطاقة عليا، أدوات، وبطاقات مرئية */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="جارٍ التحميل" className="animate-fade-in space-y-4">
      <div className="mb-6 space-y-2.5">
        <div className="skeleton h-7 w-64" />
        <div className="skeleton h-3.5 w-96 max-w-full" />
      </div>
      <div className="skeleton h-28 rounded-[1.75rem]" />
      <div className="flex gap-2">
        <div className="skeleton h-11 w-72 rounded-2xl" />
        <div className="skeleton h-11 flex-1 rounded-xl" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-[1.4rem] border border-line bg-surface" style={{ opacity: 1 - i * 0.08 }}>
            <div className="skeleton aspect-[16/8.5] rounded-none" />
            <div className="space-y-2.5 p-4">
              <div className="skeleton h-3 w-1/3" />
              <div className="skeleton h-4 w-4/5" />
              <div className="skeleton h-10 w-full rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
