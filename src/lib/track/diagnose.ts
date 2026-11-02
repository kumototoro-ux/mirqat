// تشخيص أحداث مركز التتبع بلغة واضحة: ماذا حدث — لماذا — ما الحل — ونوعه وهل يحتاج تدخل الإدارة.
// نقي (بلا قاعدة بيانات) ويعمل في الخادم والمتصفح: الخادم يحسب النوع والبصمة عند التسجيل،
// والواجهة تبني الشرح عند العرض — فتحسين الصياغة لاحقًا يشمل الأحداث القديمة.
// مستوحى من سجل التتبع في «مرقاة للرصد الذكي».

import { FN_MIGRATION, TABLE_MIGRATION } from './migration-map';
import { opLabel, pageLabel, TABLES } from './labels';

export type Kind = 'ok' | 'user' | 'config' | 'access' | 'system' | 'security' | 'slow';
export type Severity = 'info' | 'warning' | 'error' | 'security';

export const KIND: Record<Kind, { label: string; hint: string; tone: string; dot: string }> = {
  ok: { label: 'عملية عادية', hint: 'لا يحتاج أي إجراء', tone: 'bg-paper text-muted', dot: 'bg-muted/50' },
  user: { label: 'خطأ مستخدم', hint: 'أدخل المستخدم شيئًا غير صحيح ومنعه النظام', tone: 'bg-brass-soft text-brass', dot: 'bg-gold' },
  config: { label: 'إعداد ناقص', hint: 'يحتاج تعديلًا من الإدارة أو تحديث القاعدة', tone: 'bg-board/10 text-board', dot: 'bg-board' },
  access: { label: 'صلاحية', hint: 'عملية خارج نطاق المستخدم أو حساب موقوف', tone: 'bg-paper text-ink', dot: 'bg-ink/50' },
  system: { label: 'خطأ تقني', hint: 'مشكلة حقيقية في النظام — تحتاج المطوّر', tone: 'bg-danger-soft text-danger', dot: 'bg-danger' },
  security: { label: 'تنبيه أمني', hint: 'محاولة غير مصرّح بها أو مشبوهة', tone: 'bg-ink text-chalk', dot: 'bg-ink' },
  slow: { label: 'بطء', hint: 'عملية أو صفحة أخذت وقتًا أطول من المعقول', tone: 'bg-[#e9e4f5] text-[#5b4a8a]', dot: 'bg-[#7c68b8]' },
};

/** الحدث كما يُسجَّل (من الخادم أو المتصفح) */
export type TrackInput = {
  action: string;
  severity?: Severity;
  message?: string | null;
  code?: string | null;
  path?: string | null;
  duration_ms?: number | null;
  actor_name?: string | null;
  details?: Record<string, unknown>;
};

export type Diagnosis = {
  kind: Kind;
  needsAction: boolean;
  /** مفتاح تجميع المتشابه (بلا اسم الشخص) */
  fingerprint: string;
  /** جملة تصف ما حدث لهذا الحدث بالذات */
  title: string;
  /** عنوان المجموعة */
  group: string;
  cause?: string;
  fix?: string;
};

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
/** يزيل الأرقام والمعرّفات من الرسالة ليتجمع المتشابه */
const norm = (s: string) => s.replace(/[0-9٠-٩]+/g, '#').replace(/[a-f0-9-]{20,}/gi, '…').replace(/\s+/g, ' ').trim().slice(0, 70);

/** أخطاء تعني أن قاعدة البيانات أقدم من نسخة الموقع */
const SCHEMA = /^(PGRST20[0-5]|42883|42P01|42703)$/;
const SCHEMA_TEXT = /could not find (the|a) (table|function|relationship|column)|does not exist|schema cache/i;
const SESSION = /^(PGRST30[0-3])$|jwt expired|JWT|AUTH_REQUIRED|session/i;

/** أي هجرة تُنشئ الدالة/الجدول المذكور في العملية أو الرسالة */
export function migrationFor(op: string, text: string): number | null {
  const [type, name] = op.split(':');
  if (type === 'rpc' && FN_MIGRATION[name]) return FN_MIGRATION[name];
  if (type === 'table' && TABLE_MIGRATION[name]) return TABLE_MIGRATION[name];
  const fn = /function public\.([a-z0-9_]+)|public\.([a-z0-9_]+)\(/i.exec(text);
  const n = fn && (FN_MIGRATION[fn[1] ?? fn[2]] ?? null);
  if (n) return n;
  const col = /relation "?(?:public\.)?([a-z_]+)"?|table '?(?:public\.)?([a-z_]+)/i.exec(text);
  return col ? (TABLE_MIGRATION[col[1] ?? col[2]] ?? null) : null;
}

export function diagnose(e: TrackInput): Diagnosis {
  const d = e.details ?? {};
  const who = e.actor_name || (d.username ? `«${str(d.username)}»` : 'زائر');
  const page = pageLabel(e.path);
  const at = page ? ` في «${page}»` : '';
  const msg = str(e.message);
  const code = str(e.code);
  const op = str(d.op);
  const opName = opLabel(op);
  const a = e.action;

  // ------------------------------------------------------------ الدخول
  if (a === 'auth.login_failed') return {
    kind: 'user', needsAction: false, fingerprint: 'auth:wrong',
    title: `كلمة مرور أو اسم مستخدم خاطئ — ${who}`, group: 'دخول ببيانات خاطئة',
    cause: 'اسم المستخدم أو كلمة المرور غير صحيحة: غالبًا نسيها، أو لوحة المفاتيح بلغة أخرى، أو الحساب لم يُنشأ.',
    fix: 'إذا نسيها: الحسابات ← إعادة تعيين كلمة المرور. بعد 5 محاولات خاطئة يُقفل الدخول 15 دقيقة تلقائيًا.',
  };
  if (a === 'auth.login_locked') return {
    kind: 'security', needsAction: true, fingerprint: 'auth:locked',
    title: `أُوقفت محاولات الدخول مؤقتًا — ${who}`, group: 'إيقاف محاولات دخول متكررة',
    cause: 'خمس محاولات خاطئة من نفس الجهاز خلال 15 دقيقة (فيُوقف ذلك الجهاز وحده ويبقى صاحب الحساب يدخل من جهازه)، أو 30 محاولة من أجهزة مختلفة (فيُقفل الحساب كله). إما أن صاحب الحساب نسي كلمة المرور، أو شخص آخر يحاول تخمينها.',
    fix: 'تواصل مع صاحب الحساب: إن كان هو فأعد تعيين كلمة المرور، وإن لم يكن فغيّرها فورًا وراجع عنوان الجهاز في التفاصيل.',
  };
  if (a === 'auth.ip_locked') return {
    kind: 'security', needsAction: true, fingerprint: 'auth:ip',
    title: `إيقاف الدخول من جهاز بعد محاولات كثيرة — ${who}`, group: 'جهاز أُوقف بعد محاولات دخول كثيرة',
    cause: 'محاولات دخول خاطئة كثيرة من نفس الجهاز/الشبكة على حسابات مختلفة — نمط تخمين.',
    fix: 'إن كان جهاز معمل أو شبكة المدرسة فانتظر 15 دقيقة. وإن تكرر من جهاز مجهول فهي محاولة اختراق: راجع عنوان الجهاز.',
  };
  if (a === 'auth.login_disabled') return {
    kind: 'access', needsAction: false, fingerprint: 'auth:disabled',
    title: `محاولة دخول بحساب موقوف — ${who}`, group: 'دخول بحساب موقوف',
    cause: 'الحساب موقوف من الإدارة.', fix: 'إذا كان الإيقاف بالخطأ: الحسابات ← تفعيل الحساب.',
  };
  if (a === 'page.forbidden') return {
    kind: 'security', needsAction: false, fingerprint: `forbidden:${pageLabel(e.path) || 'page'}`,
    title: `فتح صفحة ليست من صلاحيته${at} — ${who}`, group: `فتح «${page || 'صفحة'}» بلا صلاحية`,
    cause: 'كتب الرابط يدويًا أو فتح رابطًا محفوظًا أو مرسلًا من حساب آخر. النظام منعه وأعاده لصفحته الرئيسية.',
    fix: 'غالبًا غير مقصود. إذا تكرر كثيرًا من نفس الشخص فراجعه.',
  };

  // ------------------------------------------------------------ البطء
  if (a === 'db.slow') {
    const s = Math.round((e.duration_ms ?? 0) / 100) / 10;
    return {
      kind: 'slow', needsAction: (e.duration_ms ?? 0) >= 5000, fingerprint: `slow:${op}`,
      title: `«${opName}» أخذت ${s} ثانية${at} — ${who}`, group: `بطء في «${opName}»`,
      cause: 'الاستعلام في قاعدة البيانات أبطأ من المعقول (أكثر من ثانيتين). يزداد عادة مع كثرة البيانات.',
      fix: 'إذا تكرر كثيرًا أرسل اسم العملية للمطوّر ليحسّنها (فهرس أو إعادة كتابة الاستعلام).',
    };
  }
  if (a === 'perf.page') {
    const s = Math.round((e.duration_ms ?? 0) / 100) / 10;
    const metric = str(d.metric);
    return {
      kind: 'slow', needsAction: false, fingerprint: `page:${page || e.path}:${metric}`,
      title: `${metric === 'INP' ? 'استجابة بطيئة للضغط' : 'تحميل بطيء'} ${s} ث${at} — ${who}`,
      group: `${metric === 'INP' ? 'استجابة بطيئة' : 'تحميل بطيء'} في «${page || e.path}»`,
      cause: metric === 'INP'
        ? 'الصفحة تأخرت في الاستجابة بعد ضغطة المستخدم — غالبًا حسابات ثقيلة في المتصفح أو جهاز ضعيف.'
        : 'الصفحة أخذت وقتًا طويلًا حتى ظهر محتواها الرئيسي — شبكة ضعيفة، أو جهاز قديم، أو بيانات كثيرة.',
      fix: 'إذا تكرر عند أشخاص كثيرين فالمشكلة في الصفحة وتحتاج المطوّر؛ وإن كان عند شخص واحد فغالبًا شبكته أو جهازه.',
    };
  }

  // ------------------------------------------------------------ أخطاء الخادم والمتصفح
  if (a === 'server.error') {
    if (SCHEMA.test(code) || SCHEMA_TEXT.test(msg)) return schema(op, msg, who, page);
    return {
      kind: 'system', needsAction: true, fingerprint: `server:${str(d.route) || page}:${norm(msg).slice(0, 40)}`,
      title: `تعذّر فتح «${page || e.path}» — ${who}`, group: `تعذّر فتح «${page || str(d.route)}»`,
      cause: msg ? `رسالة الخادم: ${msg}` : 'خطأ غير متوقع في الخادم أثناء تجهيز الصفحة.',
      fix: 'ليس خطأ المستخدم. أرسل للمطوّر رمز الخطأ (digest) والرسالة من «التفاصيل التقنية».',
    };
  }
  if (a === 'client.error') {
    const echo = /Server Components render|digest|Minified React error #(418|419|423)/i.test(msg);
    const chunk = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg);
    if (chunk) return {
      kind: 'user', needsAction: false, fingerprint: 'client:chunk',
      title: `الصفحة كانت مفتوحة من نسخة قديمة للموقع${at} — ${who}`, group: 'صفحة مفتوحة من نسخة قديمة بعد تحديث الموقع',
      cause: 'نُشر تحديث للموقع والمستخدم فاتح الصفحة من قبل، فطلبت ملفًا لم يعد موجودًا.',
      fix: 'لا شيء: يكفي تحديث الصفحة. يحدث طبيعيًا بعد كل نشر.',
    };
    return {
      kind: 'system', needsAction: !echo, fingerprint: echo ? 'client:echo' : `client:${norm(msg).slice(0, 60)}`,
      title: `${echo ? 'ظهرت صفحة الخطأ' : 'خطأ تقني في المتصفح'}${at} — ${who}`,
      group: echo ? 'صفحة خطأ ظهرت للمستخدم (السبب مسجّل كخطأ خادم بنفس الوقت)' : `خطأ في المتصفح: ${norm(msg) || 'غير معروف'}`,
      cause: echo ? 'انعكاس في المتصفح لخطأ حدث في الخادم — ابحث بالرمز في نفس الدقيقة لتجد السبب.' : msg ? `رسالة الخطأ: ${msg}` : 'خطأ غير متوقع في المتصفح.',
      fix: echo ? (d.digest ? `ابحث في السجل بالرمز ${str(d.digest)}.` : 'راجع أحداث «تعذّر فتح» في نفس الوقت.')
        : 'اطلب من المستخدم تحديث الصفحة. إذا تكرر أرسل الرسالة والصفحة والمتصفح للمطوّر.',
    };
  }

  // ------------------------------------------------------------ أخطاء قاعدة البيانات
  if (a === 'db.network') return {
    kind: 'system', needsAction: true, fingerprint: 'db:network',
    title: `تعذّر الاتصال بقاعدة البيانات أثناء «${opName}» — ${who}`, group: 'انقطاع الاتصال بقاعدة البيانات',
    cause: 'الخادم لم يصل إلى Supabase: انقطاع مؤقت، أو المشروع متجمد أو متوقف.',
    fix: 'افتح لوحة Supabase وتأكد أن المشروع يعمل (غير متوقف/متجمد). إذا كان يعمل وتكرر فأبلغ المطوّر.',
  };
  if (a === 'db.error') {
    const status = Number(d.status) || 0;
    if (SCHEMA.test(code) || SCHEMA_TEXT.test(msg)) return schema(op, msg + ' ' + str(d.details), who, page);
    if (SESSION.test(code) || SESSION.test(msg) || status === 401) return {
      kind: 'user', needsAction: false, fingerprint: 'db:session',
      title: `انتهت الجلسة أثناء «${opName}» — ${who}`, group: 'انتهاء الجلسة أثناء العمل',
      cause: 'بقيت الصفحة مفتوحة طويلًا فانتهت صلاحية الدخول.', fix: 'يكفي تحديث الصفحة أو الدخول من جديد.',
    };
    if (code === '42501' || /FORBIDDEN|permission denied|row-level security/i.test(msg)) return {
      kind: 'security', needsAction: false, fingerprint: `db:forbidden:${op}`,
      title: `«${opName}» بلا صلاحية${at} — ${who}`, group: `محاولة «${opName}» بلا صلاحية`,
      cause: 'قاعدة البيانات رفضت العملية لأنها خارج صلاحية المستخدم أو نطاقه (فصوله وموادّه).',
      fix: 'إن كان يجب أن يملكها: راجع نطاقه في «تسجيل الموظفين». وإن تكرر من نفس الشخص دون سبب فراجعه.',
    };
    if (/لا تملك|ليس من|خارج نطاق|ليست لديك/.test(msg)) return {
      kind: 'access', needsAction: false, fingerprint: `db:scope:${op}:${norm(msg)}`,
      title: `${msg} — ${who}`, group: `«${opName}»: ${norm(msg)}`,
      cause: 'العملية خارج نطاق المستخدم أو على بيانات لا تخصه، والنظام منعها.',
      fix: 'إن كان يجب أن يملكها فراجع نطاقه أو صاحب المهمة. غير ذلك لا يلزم إجراء.',
    };
    if (code === '23505') return {
      kind: 'user', needsAction: false, fingerprint: `db:dup:${op}`,
      title: `بيانات مكررة عند «${opName}» — ${who}`, group: `بيانات مكررة عند «${opName}»`,
      cause: 'القيمة مسجّلة من قبل (رقم أو اسم مكرر).', fix: 'النظام منع التكرار — لا يلزم إجراء.',
    };
    if (code === '23503') return {
      kind: 'user', needsAction: false, fingerprint: `db:fk:${op}`,
      title: `لا يمكن «${opName}» لوجود بيانات مرتبطة — ${who}`, group: `«${opName}» مرفوض لوجود بيانات مرتبطة`,
      cause: 'العنصر مرتبط ببيانات أخرى (طلاب، رصد، مهام).', fix: 'انقل أو احذف المرتبط أولًا، أو استعمل «إيقاف» بدل الحذف.',
    };
    if (code === '57014') return {
      kind: 'slow', needsAction: true, fingerprint: `db:timeout:${op}`,
      title: `انتهت مهلة «${opName}» قبل أن تكتمل — ${who}`, group: `«${opName}» تتجاوز المهلة`,
      cause: 'الاستعلام أخذ أطول من الحد المسموح في Supabase فأُلغي، ولم تكتمل العملية للمستخدم.',
      fix: 'تحتاج المطوّر: أرسل اسم العملية ليحسّنها.',
    };
    if (code === 'P0001' || code === '23514' || code === '22P02' || code === '22023' || status === 400) {
      // رسالة تحقق عربية من القاعدة: ظهرت للمستخدم ومنعته — طبيعية ما لم تتكرر كثيرًا
      const arabic = /[؀-ۿ]/.test(msg);
      return {
        kind: arabic ? 'user' : 'system', needsAction: !arabic, fingerprint: `db:check:${op}:${norm(msg)}`,
        title: `${arabic ? msg : `رُفضت «${opName}»`}${at} — ${who}`,
        group: `«${opName}»: ${norm(msg) || 'بيانات غير صحيحة'}`,
        cause: arabic ? `النظام رفض «${opName}» وأظهر للمستخدم: ${msg}` : `رسالة النظام: ${msg}`,
        fix: arabic ? 'رسالة تحقق طبيعية — لا يلزم إجراء إلا إذا تكررت كثيرًا (قد تعني أن الشاشة تحتاج توضيحًا).'
          : 'البيانات المرسلة لا تطابق ما تتوقعه القاعدة — غالبًا خلل في الصفحة. أرسل التفاصيل للمطوّر.',
      };
    }
    return {
      kind: 'system', needsAction: true, fingerprint: `db:sys:${op}:${code || status}`,
      title: `خطأ تقني أثناء «${opName}»${at} — ${who}`, group: `خطأ تقني أثناء «${opName}»`,
      cause: msg ? `رسالة النظام: ${msg}` : `قاعدة البيانات ردّت بخطأ ${status || ''}.`,
      fix: 'ليس خطأ المستخدم. أعد المحاولة؛ إذا تكرر أرسل التفاصيل التقنية للمطوّر.',
    };
  }

  return {
    kind: e.severity === 'error' ? 'system' : e.severity === 'security' ? 'security' : 'ok',
    needsAction: e.severity === 'error', fingerprint: `other:${a}`,
    title: `${a}${at} — ${who}`, group: a, cause: msg || undefined,
  };
}

function schema(op: string, text: string, who: string, page: string): Diagnosis {
  const n = migrationFor(op, text);
  const opName = opLabel(op);
  return {
    kind: 'config', needsAction: true, fingerprint: `schema:${n ?? op}`,
    title: `${page ? `تعذّر «${page}»` : `تعذّر «${opName}»`}: قاعدة البيانات تحتاج تحديثًا — ${who}`,
    group: n ? `قاعدة البيانات تحتاج تشغيل الهجرة ${n}` : 'قاعدة البيانات أقدم من نسخة الموقع',
    cause: n
      ? `الموقع تحدّث لكن الهجرة ${n} لم تُشغَّل بعد في Supabase، فالدالة أو الجدول المطلوب (${op.split(':')[1] ?? ''}) غير موجود أو بصيغة قديمة.`
      : 'الموقع تحدّث لكن إحدى ملفات الهجرة لم تُشغَّل بعد في Supabase.',
    fix: n
      ? `Supabase ← SQL Editor ← الصق ملف الهجرة ${n} (مجلد supabase/migrations) ← Run، ثم أعد فتح الصفحة.`
      : 'شغّل ملفات الهجرة التي لم تُشغَّل بعد بالترتيب في Supabase ← SQL Editor.',
  };
}

/** وصف مختصر لعملية من الخط الزمني (تغيير على البيانات) */
export function changeLabel(action: string, table: string | null) {
  const t = table ? TABLES[table] ?? table : '';
  return `${action === 'INSERT' ? 'إضافة' : action === 'UPDATE' ? 'تعديل' : action === 'DELETE' ? 'حذف' : action} ${t}`.trim();
}
