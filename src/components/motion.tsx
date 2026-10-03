import { ViewTransition } from 'react';

/**
 * اسم المنصة "مِرقاة" عنصر واحد يتنقّل بين الصفحات: من وسط صفحة الاختيار
 * إلى لوحة الدخول ثم إلى رأس الصفحة — فيرى المستخدم أنه في نفس المكان لا مكان جديد.
 */
export function Brand({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition name="brand" share="morph" default="none">
      {children}
    </ViewTransition>
  );
}

/** محتوى الصفحة: يتلاشى القديم بسرعة، ويصعد الجديد بهدوء */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      {children}
    </ViewTransition>
  );
}
