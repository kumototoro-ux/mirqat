/**
 * إنشاء حسابات الدخول الـ46 القديمة (Users + Students_Users) بكلمات مرور جديدة.
 *
 * يُشغَّل مرة واحدة من جهاز أنس (يحتاج المفتاح السري في .env.local، ولا يُشغَّل على Vercel):
 *   npm run provision:legacy            ← معاينة فقط، لا ينشئ شيئًا
 *   npm run provision:legacy -- --apply ← ينشئ الحسابات ويكتب كلمات المرور في secrets/
 *
 * آمن للتكرار: الحساب الذي أُنشئ له حساب لا يُنشأ مرة ثانية.
 */
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadLegacy, planLegacy, provisionLegacy } from '../src/lib/accounts/core';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('✖ NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY مطلوبان في .env.local');
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const apply = process.argv.includes('--apply');

const ROLE = { admin: 'إداري', teacher: 'معلم', student: 'طالب' } as const;
const STATUS = { active: 'نشط', disabled: 'موقوف' } as const;

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function preview() {
  const plans = (await loadLegacy(admin)).map(planLegacy);
  const todo = plans.filter((p) => p.ok);
  const done = plans.filter((p) => !p.ok && p.problem === 'أُنشئ له حساب من قبل');
  const bad = plans.filter((p) => !p.ok && p.problem !== 'أُنشئ له حساب من قبل');

  console.log(`\nالحسابات القديمة: ${plans.length} — جاهز: ${todo.length}، أُنشئ من قبل: ${done.length}، فيه مشكلة: ${bad.length}\n`);
  console.table(
    todo.map((p) => p.ok && {
      'الرمز': p.row.code,
      'الاسم': p.row.full_name,
      'اسم المستخدم': p.account.username,
      'الدور': ROLE[p.account.role],
      'الحالة': STATUS[p.account.status ?? 'active'],
      'الحالة في الشيت': p.row.status_raw ?? '(فارغ)',
    }),
  );
  for (const p of bad) if (!p.ok) console.log(`✖ ${p.row.code} ${p.row.username}: ${p.problem}`);

  // تكرار اسم المستخدم (بلا حساسية لحالة الأحرف) يُفشل الإنشاء — نكشفه قبل البدء
  const seen = new Map<string, string>();
  for (const p of todo) {
    if (!p.ok) continue;
    const k = p.account.username.trim().toLowerCase();
    if (seen.has(k)) console.log(`✖ اسم مستخدم مكرر: ${p.account.username} (${seen.get(k)} و ${p.row.code})`);
    else seen.set(k, p.row.code);
  }
  console.log('\nللإنشاء الفعلي: npm run provision:legacy -- --apply\n');
}

async function run() {
  const results = await provisionLegacy(admin);
  const made = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  if (made.length) {
    const dir = join(process.cwd(), 'secrets');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `legacy-passwords-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`);
    const lines = [
      ['الرمز', 'الاسم', 'اسم المستخدم', 'كلمة المرور المؤقتة', 'الدور', 'الحالة'].join(','),
      ...made.map((r) => r.ok
        ? [r.code, r.name, r.username, r.password, ROLE[r.role], STATUS[r.status]].map(csvCell).join(',')
        : ''),
    ];
    // BOM ليفتحه Excel بالعربية صحيحًا، وصلاحية قراءة لصاحب الجهاز فقط
    writeFileSync(file, '\uFEFF' + lines.join('\r\n') + '\r\n', { mode: 0o600 });
    console.log(`\n✔ أُنشئ ${made.length} حسابًا. كلمات المرور في:\n  ${file}`);
    console.log('  وزّعها ثم احذف الملف. صاحب كل حساب يغيّر كلمته عند أول دخول.');
  } else {
    console.log('\nلم يُنشأ أي حساب جديد.');
  }
  for (const r of failed) if (!r.ok) console.log(`✖ ${r.code} ${r.username}: ${r.problem}`);
  if (failed.length) process.exitCode = 2;
}

(apply ? run() : preview()).catch((e) => {
  console.error('✖', e instanceof Error ? e.message : e);
  process.exit(1);
});
