// توحيد النصوص العربية للمطابقة بين ملفات Excel وبيانات النظام (مأخوذ من مرقاة للرصد الذكي ومكيّف هنا)

/** الهمزات، التاء المربوطة، الياء، التشكيل، الأرقام الهندية، المسافات */
export function normAr(s: unknown): string {
  return String(s ?? '')
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** أرقام فقط بالإنجليزية (للأرقام الأكاديمية والهويات) */
export const digits = (s: unknown) =>
  String(s ?? '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .trim();

const ORD: Record<string, string> = {
  '1': 'اول', '2': 'ثاني', '3': 'ثالث', '4': 'رابع', '5': 'خامس', '6': 'سادس',
  اولي: 'اول', ثانيه: 'ثاني', ثالثه: 'ثالث', رابعه: 'رابع', خامسه: 'خامس', سادسه: 'سادس',
  ابتدايي: 'ابتدايي', ابتداييه: 'ابتدايي', متوسط: 'متوسط', متوسطه: 'متوسط', ثانوي: 'ثانوي', ثانويه: 'ثانوي',
  روضه: 'تمهيدي', تمهيدي: 'تمهيدي', kg: 'تمهيدي',
};

/** مفتاح الصف: "1 متوسط" = "الأول المتوسط" = "الصف الأول متوسط" — والمرحلة جزء منه */
export function gradeKey(s: unknown): string {
  return [...new Set(
    normAr(s)
      .replace(/(\d)([^\d\s])/g, '$1 $2')
      .split(' ')
      .filter(Boolean)
      .map((w) => (w.startsWith('ال') && w.length > 3 ? w.slice(2) : w))
      .map((w) => ORD[w] ?? w)
      .filter((w) => !['صف', 'الصف', 'مرحله', 'المرحله'].includes(w)),
  )]
    .sort()
    .join(' ');
}

/** مفتاح الشعبة: "أ" = "1" = "شعبة أ" = "فصل 1" */
export function sectionKey(s: unknown): string {
  const map: Record<string, string> = { ا: '1', ب: '2', ج: '3', د: '4', ه: '5', و: '6', ز: '7', ح: '8' };
  const w = normAr(s).replace(/^(شعبه|فصل|الفصل|الشعبه)\s*/, '').trim();
  return map[w] ?? w;
}

/** مفتاح الفرع والمادة ونوع التقييم: بلا "فرع"/"مادة" في أوله، والمسافات موحدة */
export const nameKey = (s: unknown) => normAr(s).replace(/^(فرع|ماده|مادة)\s+/, '');
