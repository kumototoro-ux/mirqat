/**
 * قراءة كل الصفوف بصفحات: واجهة Supabase تقطع أي نتيجة عند حد أقصى (1000 افتراضيًا)
 * بصمت حتى لو كتبنا .limit(5000). فمع بيانات المدرسة الحقيقية كانت تُقتطع جداول مثل خطة المواد وحصص الجدول.
 * تُستعمل مع استعلام مرتّب بترتيب ثابت (يُنهَى بالمفتاح id) حتى لا يتكرر صف ولا يضيع.
 * الشكل المُعاد {data, error} كشكل الاستعلام العادي، فتحلّ محله مباشرة.
 */
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function selectAll<T>(page: (from: number, to: number) => Page<T>, size = 1000, cap = 100_000): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < size) break;
  }
  return { data: out, error: null };
}
