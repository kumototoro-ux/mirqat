'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';

/** بدء الحل: تأكيد قبل تشغيل العدّاد، ثم صفحة الحل (بلا تحميل مسبق حتى لا يبدأ الوقت قبل الضغط) */
export function StartButton({ id, label, minutes, questions, attemptsLeft, resume }: { id: number; label: string; minutes: number | null; questions: number; attemptsLeft: number; resume: boolean }) {
  const router = useRouter();
  const { confirm } = useFeedback();
  const [going, setGoing] = useState(false);
  const go = async () => {
    if (!resume) {
      const ok = await confirm({
        title: minutes ? `سيبدأ عدّاد ${minutes} دقيقة` : 'بدء الحل؟',
        body: (
          <>
            {questions} سؤال{minutes ? ` · ${minutes} دقيقة من لحظة البدء، ويُسلَّم تلقائيًا عند انتهائها` : ''}.
            <span className="mt-2 block">إجاباتك تُحفظ تلقائيًا، ولو انقطع الاتصال أو أغلقت الصفحة تكمل من نفس المكان من أي جهاز.</span>
            {attemptsLeft <= 1 && <span className="mt-2 block font-semibold text-ink">هذه محاولتك الأخيرة.</span>}
          </>
        ),
        confirmLabel: 'ابدأ',
      });
      if (!ok) return;
    }
    setGoing(true);
    router.push(`/student/solve/${id}`);
  };
  return (
    <button type="button" onClick={go} disabled={going} className="btn-primary w-full py-4 text-base sm:w-auto sm:px-10">
      {going ? <span className="spinner" /> : <Icon name="play" className="size-5" />} {label}
    </button>
  );
}
