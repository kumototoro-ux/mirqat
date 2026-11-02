// يولّد src/lib/track/migration-map.ts: أي ملف هجرة يعرّف كل دالة وجدول —
// ليقول مركز التتبع «شغّل الهجرة 32» بالضبط حين تكون القاعدة أقدم من الموقع.
// شغّله بعد إضافة أي هجرة: node scripts/track-migration-map.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const dir = 'supabase/migrations';
const fns = {}, tables = {};
for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
  const n = Number(f.slice(10, 14)) / 100; // 20261001003200_x.sql → 32
  const sql = readFileSync(`${dir}/${f}`, 'utf8');
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)/gi)) fns[m[1]] = n;
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi)) tables[m[1]] ??= n;
}
const out = `// مُولَّد تلقائيًا من supabase/migrations بـ scripts/track-migration-map.mjs — لا تعدّله يدويًا
/** آخر هجرة تعرّف كل دالة عامة */
export const FN_MIGRATION: Record<string, number> = ${JSON.stringify(fns)};
/** الهجرة التي أنشأت كل جدول */
export const TABLE_MIGRATION: Record<string, number> = ${JSON.stringify(tables)};
`;
writeFileSync('src/lib/track/migration-map.ts', out);
console.log(Object.keys(fns).length, 'functions,', Object.keys(tables).length, 'tables');
