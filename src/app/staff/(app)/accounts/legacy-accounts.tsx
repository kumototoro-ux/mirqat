'use client';

import { useState, useTransition } from 'react';
import { provisionLegacyAction, type LegacyActionState } from './actions';

export type LegacyPreview = { pending: number; problems: { code: string; username: string; problem: string }[] };

function downloadCsv(rows: LegacyActionState['created']) {
  const cell = (v: string | null) => {
    const s = v ?? '';
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    ['الرمز', 'الاسم', 'اسم المستخدم', 'كلمة المرور المؤقتة', 'الدور', 'الحالة'].join(','),
    ...rows.map((r) => [r.code, r.name, r.username, r.password, r.role, r.status].map(cell).join(',')),
  ];
  // BOM ليفتحه Excel بالعربية صحيحًا
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `كلمات-المرور-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** الحسابات المنقولة من النظام القديم: إنشاؤها كلها بضغطة، وعرض كلماتها مرة واحدة */
export function LegacyAccounts({ preview }: { preview: LegacyPreview }) {
  const [result, setResult] = useState<LegacyActionState | null>(null);
  const [pending, start] = useTransition();
  const [downloaded, setDownloaded] = useState(false);

  if (!result && preview.pending === 0 && preview.problems.length === 0) return null;

  return (
    <section aria-labelledby="legacy" className="mt-8 rounded-2xl border border-brass/40 bg-brass-soft/40 p-5">
      <h2 id="legacy" className="text-lg font-semibold">حسابات النظام القديم</h2>

      {!result && (
        <>
          <p className="mt-1 text-muted">
            {preview.pending > 0
              ? `${preview.pending.toLocaleString('ar-SA')} حسابًا من النظام القديم بلا حساب دخول بعد. تُنشأ بأسماء المستخدمين القديمة نفسها، وبكلمات مرور مؤقتة جديدة يغيّرها كل شخص عند أول دخول.`
              : 'كل الحسابات القديمة الصالحة أُنشئت.'}
          </p>
          {preview.problems.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-danger">
              {preview.problems.map((p) => (
                <li key={p.code + p.username}>
                  <bdi>{p.username}</bdi> ({p.code}): {p.problem}
                </li>
              ))}
            </ul>
          )}
          {preview.pending > 0 && (
            <button
              type="button"
              className="btn-primary mt-4"
              disabled={pending}
              onClick={() => {
                if (!confirm(`إنشاء ${preview.pending} حسابًا الآن؟ ستظهر كلمات المرور مرة واحدة فقط.`)) return;
                start(async () => setResult(await provisionLegacyAction()));
              }}
            >
              {pending ? (
                <>
                  <span className="spinner" aria-hidden />
                  جارٍ الإنشاء… قد يستغرق دقيقة
                </>
              ) : (
                `إنشاء الحسابات (${preview.pending.toLocaleString('ar-SA')})`
              )}
            </button>
          )}
        </>
      )}

      {result && (
        <div className="mt-2 animate-pop">
          {result.error && <p role="alert" className="text-danger">{result.error}</p>}
          {result.created.length > 0 && (
            <>
              <p className="text-ok">
                أُنشئ {result.created.length.toLocaleString('ar-SA')} حسابًا. نزّل الملف الآن: كلمات المرور لن تظهر مرة أخرى بعد مغادرة الصفحة.
              </p>
              <button
                type="button"
                className="btn-primary mt-3"
                onClick={() => {
                  downloadCsv(result.created);
                  setDownloaded(true);
                }}
              >
                {downloaded ? 'نُزّل الملف ✓ (نزّله مجددًا)' : 'تنزيل كلمات المرور (Excel)'}
              </button>
              <div className="mt-4 max-h-96 overflow-auto rounded-lg border border-line bg-surface">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="sticky top-0 bg-paper text-muted">
                    <tr>
                      <th className="px-3 py-2 text-start font-medium">الاسم</th>
                      <th className="px-3 py-2 text-start font-medium">اسم المستخدم</th>
                      <th className="px-3 py-2 text-start font-medium">كلمة المرور المؤقتة</th>
                      <th className="px-3 py-2 text-start font-medium">الدور</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {result.created.map((r) => (
                      <tr key={r.username}>
                        <td className="px-3 py-2">{r.name ?? r.code}</td>
                        <td className="px-3 py-2"><bdi>{r.username}</bdi></td>
                        <td className="px-3 py-2 font-semibold tracking-wider" dir="ltr">{r.password}</td>
                        <td className="px-3 py-2">{r.role}{r.status === 'موقوف' ? ' (موقوف)' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {result.failed.length > 0 && (
            <div className="mt-4">
              <p className="font-medium text-danger">لم تُنشأ ({result.failed.length.toLocaleString('ar-SA')}):</p>
              <ul className="mt-1 space-y-1 text-sm text-danger">
                {result.failed.map((f) => (
                  <li key={f.code + f.username}><bdi>{f.username}</bdi> ({f.code}): {f.problem}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
