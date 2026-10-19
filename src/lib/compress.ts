'use client';

/* =====================================================================
   ضغط الصور في المتصفح قبل الرفع: تصغير الأبعاد ثم WebP (أو JPEG) بجودة تنازلية
   حتى يصغر الحجم عن الهدف. صورة جوال 4 ميقا تصير عادة 150–350 ك.ب بوضوح كافٍ للتصحيح.
   الملفات الأخرى (PDF/Word) مضغوطة أصلًا بطبيعتها، فتُقبل كما هي إن كانت ≤ الحد.
   ===================================================================== */

const IMAGE_RE = /^image\/(jpeg|png|webp|heic|heif|gif|bmp)$/i;

export type Prepared = { file: File; original: number; compressed: boolean };

async function decode(file: File): Promise<{ draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; width: number; height: number; close: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h), width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* يجرّب الطريقة القديمة */
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return { draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h), width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
}

const toBlob = (c: HTMLCanvasElement, type: string, q: number) => new Promise<Blob | null>((r) => c.toBlob(r, type, q));

export async function compressImage(file: File, { target = 350 * 1024, max = 1024 * 1024 } = {}): Promise<File> {
  const src = await decode(file);
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const webp = (await toBlob(Object.assign(document.createElement('canvas'), { width: 2, height: 2 }), 'image/webp', 0.8))?.type === 'image/webp';
    const type = webp ? 'image/webp' : 'image/jpeg';
    let best: Blob | null = null;
    for (const edge of [1800, 1500, 1200, 1000, 800]) {
      const scale = Math.min(1, edge / Math.max(src.width, src.height));
      canvas.width = Math.max(1, Math.round(src.width * scale));
      canvas.height = Math.max(1, Math.round(src.height * scale));
      ctx.fillStyle = '#fff'; // الشفافية تصير بيضاء (أوضح للأوراق المصوّرة)
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      src.draw(ctx, canvas.width, canvas.height);
      for (const q of [0.8, 0.7, 0.6, 0.5]) {
        const b = await toBlob(canvas, type, q);
        if (!b) continue;
        if (!best || b.size < best.size) best = b;
        if (b.size <= target) break;
      }
      if (best && best.size <= target) break;
    }
    if (!best || best.size > max) throw new Error('تعذّر ضغط الصورة تحت 1 ميقا');
    const name = file.name.replace(/\.[^.]+$/, '') + (webp ? '.webp' : '.jpg');
    return new File([best], name, { type, lastModified: Date.now() });
  } finally {
    src.close();
  }
}

/** يجهّز ملف الطالب: يضغط الصور دائمًا، ويرفض غيرها إن تجاوز الحد */
export async function prepareUpload(file: File, max = 1024 * 1024): Promise<Prepared> {
  const isImage = IMAGE_RE.test(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  if (isImage) {
    const out = await compressImage(file, { max });
    return { file: out, original: file.size, compressed: true };
  }
  if (file.size > max) throw new Error(`"${file.name}" أكبر من 1 ميقا. احفظه بحجم أصغر (مثلًا PDF مضغوط) أو صوّره صورة`);
  return { file, original: file.size, compressed: false };
}
