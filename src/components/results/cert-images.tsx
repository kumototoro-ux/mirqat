'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/shell/icons';
import { useFeedback } from '@/components/feedback';
import { SettingsCard } from '@/components/settings/editors';
import { certImagesPreview, removeCertImage, uploadCertImage } from '@/lib/results/cert-actions';
import { CERT_IMAGES, type CertImageKind } from '@/lib/results/certificate';

type Images = Partial<Record<CertImageKind, string>>;

/**
 * صور الشهادة الخمس (البسملة، شعار المدرسة، الرؤية، التوقيع، الختم).
 * تُمرَّر الصور جاهزة من الصفحة، أو تُحمَّل عند فتح القسم في الإعدادات العامة.
 */
export function CertImagesEditor({ images, schoolLogo }: { images?: Images; schoolLogo?: string | null }) {
  const q = useQuery({ queryKey: ['cert-images'], queryFn: () => certImagesPreview(), enabled: !images });
  const data = images ?? q.data ?? {};
  return (
    <SettingsCard
      title="صور الشهادة"
      description="تُحفظ في مجلد خاص لا يصل إليه أحد برابط مباشر، وتُضمَّن في الشهادة عند عرضها فقط. يُفضّل PNG بخلفية شفافة، حتى 1 ميجابايت."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {CERT_IMAGES.map((x) => (
          <ImageSlot
            key={x.kind}
            kind={x.kind}
            label={x.ar}
            hint={x.hint}
            src={data[x.kind]}
            fallback={x.kind === 'logo' ? schoolLogo ?? undefined : undefined}
            loading={!images && q.isLoading}
          />
        ))}
      </div>
    </SettingsCard>
  );
}

function ImageSlot({ kind, label, hint, src, fallback, loading }: { kind: CertImageKind; label: string; hint: string; src?: string; fallback?: string; loading?: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { toast, confirm } = useFeedback();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['cert-images'] });
    router.refresh();
  };

  const pick = async (f: File) => {
    if (f.size > 1024 * 1024) return toast('حجم الصورة أكبر من 1 ميجابايت', 'error');
    const preview = URL.createObjectURL(f);
    const ok = await confirm({
      title: `رفع ${label}؟`,
      body: (
        <span className="mt-2 grid place-items-center rounded-xl bg-paper p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="max-h-28 max-w-full object-contain" />
        </span>
      ),
      confirmLabel: src ? 'استبدال' : 'رفع',
      run: async () => {
        setBusy(true);
        try {
          const fd = new FormData();
          fd.append('file', f);
          return await uploadCertImage(kind, fd);
        } finally {
          setBusy(false);
        }
      },
    });
    URL.revokeObjectURL(preview);
    if (ok) done();
  };
  const remove = async () => {
    const ok = await confirm({ title: `حذف ${label}؟`, body: kind === 'logo' ? 'تعود الشهادة لاستخدام شعار المدرسة العام.' : kind === 'basmala' ? 'تعود الشهادة للبسملة المكتوبة.' : 'تختفي من كل الشهادات.', confirmLabel: 'حذف', danger: true, run: () => removeCertImage(kind) });
    if (ok) done();
  };
  const shown = src ?? fallback;

  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-line p-3">
      <p className="text-sm font-semibold">{label}</p>
      <p className="min-h-8 text-[0.7rem] leading-snug text-muted">{hint}</p>
      <div className="relative my-2.5 grid h-24 place-items-center overflow-hidden rounded-xl bg-[repeating-conic-gradient(#f1f4f2_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]">
        {loading ? (
          <span className="size-full animate-pulse bg-paper" />
        ) : shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt={label} className={`max-h-20 max-w-[90%] object-contain ${src ? '' : 'opacity-50'}`} />
        ) : (
          <Icon name="image" className="size-7 text-muted" />
        )}
        {!src && fallback && !loading && <span className="absolute bottom-1 rounded-full bg-surface/90 px-2 text-[0.65rem] text-muted">الشعار العام</span>}
      </div>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pick(f); }} />
      <div className="mt-auto flex gap-2">
        <button type="button" onClick={() => file.current?.click()} disabled={busy || loading} className="btn-quiet flex-1 px-2 py-1.5 text-xs">
          {busy ? <span className="spinner" /> : <Icon name="upload" className="size-3.5" />} {src ? 'تغيير' : 'رفع'}
        </button>
        {src && (
          <button type="button" onClick={remove} className="btn-quiet px-2 py-1.5 text-xs text-danger" aria-label={`حذف ${label}`}>
            <Icon name="trash" className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
