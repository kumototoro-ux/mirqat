/**
 * =====================================================================
 *  مِرقاة — فحص ما قبل النقل (قراءة فقط)
 * =====================================================================
 *  يعمل في مشروع Apps Script مستقل وجديد، لا علاقة له بموقعي الموظفين والطلاب.
 *  يقرأ نسخة الشيت فقط — لا يكتب فيها حرفًا واحدًا — ويكتب تقريره في ملف جديد منفصل في Drive.
 *
 *  طريقة الاستخدام:
 *   1) ضع معرّف النسخة في SOURCE_SPREADSHEET_ID أدناه
 *      (المعرّف هو الجزء الطويل في رابط الشيت بين /d/ و /edit)
 *   2) اختر الدالة runMigrationScan من القائمة أعلى المحرر واضغط Run
 *   3) وافق على الصلاحيات أول مرة
 *   4) رابط التقرير يظهر في Execution log
 *
 *  التقرير لا يحتوي كلمات مرور ولا أرقام هوية ولا تواريخ ميلاد — فقط أرقام صفوف ومعرّفات وأعداد.
 * =====================================================================
 */

const SCAN_CONFIG = {
  SOURCE_SPREADSHEET_ID: '1muQ5iBDJhmrYt7EULjlwX63ju9ddlAQa9b2E8v-kHkA', // يقبل المعرّف أو الرابط الكامل
  MAX_SAMPLES: 12,            // أقصى عدد أمثلة لكل مشكلة
  TIME_BUDGET_MS: 5 * 60 * 1000 // يتوقف عن الفحوص الثقيلة قبل حد Apps Script (6 دقائق)
};

// ---------------------------------------------------------------------
// خرائط الأعمدة — منسوخة من Code.js بالموقعين (الموقع هو المرجع، لا العنوان)
// النوع: id معرّف | t نص | n رقم | d تاريخ | tm وقت | secret سري لا يُعرض | any بلا فحص
// ---------------------------------------------------------------------
const SPEC = {
  SETTINGS: { name: 'Settings', list: true, cols: {
    1: ['branches', 't'], 2: ['stages', 't'], 3: ['grades', 't'], 4: ['sections', 't'], 5: ['subject', 't'],
    6: ['user_types', 't'], 7: ['roles', 't'], 8: ['account_statuses', 't'], 9: ['attendance_statuses', 't'],
    10: ['terms', 't'], 11: ['حالة السلوك', 't'], 12: ['نوع التقييم المستمر', 't'], 13: ['الاختبارات', 't'],
    14: ['اسم المدرسة', 't'], 15: ['رابط لوقو المدرسة', 't'], 16: ['التحكم بعرض النتائج', 't'],
    17: ['التحكم بعرض الدرجات', 't'], 18: ['اظهار جدول الاختبارات', 't'] } },
  STUDENTS: { name: 'Students', cols: {
    1: ['Students_id', 'id'], 2: ['رقم الهوية', 'secret'], 3: ['الاسم بالعربي', 't'], 4: ['الاسم بالانجليزي', 't'],
    5: ['الجنسية', 't'], 6: ['تاريخ الميلاد', 'secret'], 7: ['الجنس', 't'], 8: ['branch', 't'], 9: ['stages', 't'],
    10: ['grades', 't'], 11: ['sections', 't'], 12: ['subject (معادلة — لا تُنقل)', 'skip'], 13: ['حالة الرسوم', 't'],
    15: ['تم التعديل', 'any'], 16: ['تاريخ التسجيل', 'd'] } },
  EMPLOYEES: { name: 'Employees', cols: {
    1: ['Employees_id', 'id'], 2: ['رقم الهوية', 'secret'], 3: ['الاسم بالعربي', 't'], 4: ['الاسم بالانجليزي', 't'],
    5: ['user_types', 't'], 6: ['role', 't'], 7: ['الجنس', 't'], 8: ['branch', 't'], 9: ['stages', 't'],
    10: ['grades', 't'], 11: ['sections', 't'], 12: ['subject', 't'], 13: ['تم التعديل', 'any'] } },
  USERS: { name: 'Users', cols: {
    1: ['user_id', 'id'], 2: ['full_name', 't'], 3: ['username', 'id'], 4: ['password', 'secret'], 5: ['branch', 't'],
    6: ['user_type', 't'], 7: ['role', 't'], 8: ['subject', 't'], 9: ['grades', 't'], 10: ['sections', 't'],
    11: ['account_statuses', 't'] } },
  STUDENTS_USERS: { name: 'Students_Users', cols: {
    1: ['user_id', 'id'], 2: ['full_name', 't'], 3: ['username', 'id'], 4: ['password', 'secret'], 5: ['branch', 't'],
    6: ['user_type', 't'], 7: ['role', 't'], 8: ['subject', 't'], 9: ['grades', 't'], 10: ['sections', 't'],
    11: ['account_statuses', 't'] } },
  CALENDAR: { name: 'School Calendar', cols: {
    1: ['terms', 't'], 2: ['الفترة', 'any'], 3: ['الاسبوع', 'any'], 4: ['تاريخ بداية كل اسبوع', 'd'],
    5: ['تاريخ نهاية كل اسبوع', 'd'], 6: ['الحدث', 't'], 7: ['اللون', 't'] } },
  TIMETABLE: { name: 'Class Timetable', cols: {
    1: ['Branch', 't'], 2: ['Stage', 't'], 3: ['Grade', 't'], 4: ['Section', 't'], 5: ['النوع', 't'], 6: ['Day', 't'],
    7: ['رقم الحصة', 'any'], 8: ['تاريخ الاختبار', 'd'], 9: ['الوقت', 'tm'], 10: ['فتره الاختبار', 'any'],
    11: ['Subject', 't'], 12: ['Id Emp', 'id'], 13: ['EmpName', 't'], 14: ['اللون', 't'], 15: ['نوع الحصة', 't'] } },
  TASK_LOG: { name: 'Task_Log', cols: {
    1: ['Employees_id', 'id'], 2: ['اسم المعلم', 't'], 3: ['branch', 't'], 4: ['stages', 't'], 5: ['grades', 't'],
    6: ['sections', 't'], 7: ['subject', 't'], 8: ['نوع التقييم', 't'], 9: ['اسم التكليف', 't'], 10: ['تفاصيل التكليف', 't'],
    11: ['الرابط', 't'], 12: ['الدرجة العظمى', 'n'], 13: ['تاريخ الطرح', 'd'], 14: ['تاريخ الانتهاء', 'd'],
    15: ['وقت الانتهاء', 'tm'], 16: ['هل تم رصد الدرجة', 'any'], 17: ['وقت وتاريخ تسجيل الرصد', 'd'],
    18: ['هل تم التعديل على رصد التكليف', 'any'], 19: ['الترم', 't'], 20: ['طريقة العرض', 't'], 21: ['Form_id', 'id'],
    22: ['الأسبوع', 'any'], 23: ['الحصة', 'any'] } },
  ENRICHMENT: { name: 'Enrichment Log', cols: {
    1: ['Employees_id', 'id'], 2: ['اسم المعلم', 't'], 3: ['branch', 't'], 4: ['stages', 't'], 5: ['grades', 't'],
    6: ['sections', 't'], 7: ['subject', 't'], 8: ['اسم التكليف', 't'], 9: ['تفاصيل التكليف', 't'], 10: ['الرابط', 't'],
    11: ['تاريخ الطرح', 'd'], 12: ['تاريخ الانتهاء', 'd'], 13: ['وقت الانتهاء', 'tm'], 14: ['الترم', 't'], 15: ['طريقة العرض', 't'] } },
  DAILY: { name: 'Daily Follow up', cols: {
    1: ['Students_id', 'id'], 2: ['اسم الطالب', 't'], 3: ['branch', 't'], 4: ['stages', 't'], 5: ['grades', 't'],
    6: ['sections', 't'], 7: ['subject', 't'], 8: ['terms', 't'], 9: ['نوع التقييم', 't'], 10: ['اسم التكليف', 't'],
    11: ['الدرجة المستحقة', 'n'], 12: ['الدرجة العظمى', 'n'], 13: ['تاريخ الرصد', 'd'], 14: ['Employees_id', 'id'],
    15: ['اسم المعلم', 't'], 16: ['هل تم التعديل', 'any'], 17: ['تاريخ التعديل', 'd'] } },
  FORMS: { name: 'Forms', cols: {
    1: ['Form_id', 'id'], 2: ['Employees_id', 'id'], 3: ['اسم المعلم', 't'], 4: ['branch', 't'], 5: ['stages', 't'],
    6: ['grades', 't'], 7: ['sections', 't'], 8: ['subject', 't'], 9: ['terms', 't'], 10: ['العنوان', 't'], 11: ['الوصف', 't'],
    12: ['تاريخ الفتح', 'd'], 13: ['تاريخ الإغلاق', 'd'], 14: ['محاولات مسموحة', 'n'], 15: ['حالة', 't'],
    16: ['نوع التقييم', 't'], 17: ['فيديو المقدمة', 't'], 18: ['تمت تسوية الغياب', 'any'] } },
  FORM_QUESTIONS: { name: 'Form_Questions', cols: {
    1: ['Question_id', 'id'], 2: ['Form_id', 'id'], 3: ['نص السؤال', 't'], 4: ['نوع السؤال', 't'], 5: ['الخيارات', 't'],
    6: ['الإجابة الصحيحة', 't'], 7: ['الدرجة', 'n'], 8: ['صورة السؤال', 't'], 9: ['اسم القسم', 't'], 10: ['نص تعليمات القسم', 't'] } },
  FORM_RESPONSES: { name: 'Form_Responses', cols: {
    1: ['Response_id', 'id'], 2: ['Form_id', 'id'], 3: ['Students_id', 'id'], 4: ['اسم الطالب', 't'], 5: ['branch', 't'],
    6: ['grades', 't'], 7: ['sections', 't'], 8: ['الإجابات', 't'], 9: ['الدرجة المستحقة', 'n'], 10: ['الدرجة العظمى', 'n'],
    11: ['وقت التسليم', 'd'] } },
  PERIOD_LINKS: { name: 'Period Links', cols: {
    1: ['Timetable_row', 'n'], 2: ['Employees_id', 'id'], 3: ['terms', 't'], 4: ['الاسبوع', 'any'], 5: ['نوع المحتوى', 't'],
    6: ['رقم صف المحتوى', 'n'], 7: ['عنوان المحتوى', 't'], 8: ['تاريخ الربط', 'd'] } },
  ATTENDANCE: { name: 'Attendance and Absence', cols: {
    1: ['Students_id', 'id'], 2: ['اسم الطالب', 't'], 3: ['branch', 't'], 4: ['terms', 't'], 5: ['الاسبوع', 'any'], 6: ['اليوم', 't'],
    7: ['الحصة', 'any'], 8: ['حالة التحضير', 't'], 9: ['الملاحظة', 't'], 10: ['subject', 't'], 11: ['Employees_id', 'id'],
    12: ['الاسم Employees', 't'], 13: ['نوع الشخص', 't'], 14: ['وقت التسجيل', 'd'], 15: ['تم التعديل', 'any'] } },
  BEHAVIOR: { name: 'Behavior', cols: {
    1: ['Students_id', 'id'], 2: ['اسم الطالب', 't'], 3: ['branch', 't'], 4: ['terms', 't'], 5: ['الاسبوع', 'any'], 6: ['اليوم', 't'],
    7: ['حالة السلوك', 't'], 8: ['الدرجة', 'n'], 9: ['الملاحظة', 't'], 10: ['Employees_id', 'id'], 11: ['نوع الشخص', 't'] } },
  GRADE_AGG: { name: 'Grade Aggregation', cols: {
    1: ['Students_id', 'id'], 2: ['اسم الطالب', 't'], 3: ['terms', 't'], 4: ['branch', 't'], 5: ['stages', 't'], 6: ['grades', 't'],
    7: ['sections', 't'], 8: ['subject', 't'], 9: ['واجبات', 'n'], 10: ['بحوث و تقارير', 'n'], 11: ['اوراق عمل', 'n'],
    12: ['المشاركة و تفاعل', 'n'], 13: ['اختبارات قصيرة', 'n'], 14: ['اختبارات شهرية', 'n'], 15: ['اختبار نهائي', 'n'],
    16: ['اختبار شفهي', 'n'], 17: ['اختبار تحريري', 'n'], 18: ['امكانية الرؤية', 't'] } },
  GRADE_DIST: { name: 'Grade Distribution', cols: { 1: ['نوع التقييم', 't'], 2: ['النسبة', 'n'], 3: ['المادة', 't'] } },
  MATRIX: { name: 'Subject Distribution Matrix', cols: {
    1: ['branch', 't'], 2: ['stages', 't'], 3: ['grades', 't'], 4: ['sections', 't'], 5: ['subject', 't'] } },
  STUDENT_VIEWS: { name: 'Student_Views', cols: {
    1: ['Students_id', 'id'], 2: ['اسم الطالب', 't'], 3: ['branch', 't'], 4: ['stages', 't'], 5: ['grades', 't'], 6: ['sections', 't'],
    7: ['subject', 't'], 8: ['نوع العرض', 't'], 9: ['نوع التقييم', 't'], 10: ['اسم التكليف', 't'], 11: ['هل تم رؤيته', 'any'] } },
  AUDIT: { name: 'Audit Log', cols: {
    1: ['Timestamp', 'd'], 2: ['EmpId', 'id'], 3: ['EmpName', 't'], 4: ['Role, Action', 't'], 5: ['Details', 't'] } }
};

const EVAL_AGG_COLS = [9, 10, 11, 12, 13, 14, 15, 16, 17]; // أعمدة أنواع التقييم في Grade Aggregation
const ABSENT_SENTINEL = '__AUTO_ABSENT__';
const SEVERITY_ORDER = { 'حرج': 0, 'تحذير': 1, 'معلومة': 2 };

// =====================================================================
// نقطة التشغيل
// =====================================================================
function runMigrationScan() {
  const started = Date.now();
  const sourceId = extractSpreadsheetId_(SCAN_CONFIG.SOURCE_SPREADSHEET_ID);
  if (!sourceId) {
    throw new Error('لم أجد معرّفًا صالحًا في SOURCE_SPREADSHEET_ID — الصق رابط نسخة الشيت أو الجزء بين /d/ و /edit');
  }
  Logger.log('🔎 يفحص الشيت: ' + sourceId);
  const ctx = newScanContext_(started);
  const source = SpreadsheetApp.openById(sourceId);
  ctx.sourceName = source.getName();

  loadAllSheets_(ctx, source);
  runAllChecks_(ctx);

  const url = writeReport_(ctx);
  Logger.log('✅ انتهى الفحص خلال ' + Math.round((Date.now() - started) / 1000) + ' ثانية');
  Logger.log('📄 رابط التقرير: ' + url);
  Logger.log('ملخص: ' + JSON.stringify(severityTotals_(ctx)));
  return url;
}

// يستخرج المعرّف من رابط كامل أو من نص فيه حروف زائدة (مثل بقايا نص عربي حوله)
function extractSpreadsheetId_(raw) {
  const s = String(raw || '');
  const fromUrl = /\/d\/([a-zA-Z0-9_-]{25,})/.exec(s);
  if (fromUrl) return fromUrl[1];
  const bare = /[a-zA-Z0-9_-]{25,}/.exec(s);
  return bare ? bare[0] : '';
}

function newScanContext_(started) {
  return {
    started: started, sheets: {}, extraTabs: [], issues: [], headers: [], profiles: [], refs: {},
    skipped: [], sourceName: ''
  };
}

function timeLeft_(ctx) { return SCAN_CONFIG.TIME_BUDGET_MS - (Date.now() - ctx.started); }

function runAllChecks_(ctx) {
  const checks = [
    ['جرد الشيتات والأعمدة', checkInventory_],
    ['أنواع القيم', checkColumnTypes_],
    ['القيم المرجعية', checkReferenceValues_],
    ['الطلاب والموظفون', checkPeople_],
    ['الحسابات والصلاحيات', checkAccounts_],
    ['التقويم', checkCalendar_],
    ['الجدول', checkTimetable_],
    ['التكاليف والنماذج', checkTasksAndForms_],
    ['الأسئلة', checkQuestions_],
    ['الإجابات', checkResponses_],
    ['الرصد اليومي', checkDailyFollowup_],
    ['التجميع', checkAggregation_],
    ['ربط الحصص', checkPeriodLinks_],
    ['التحضير والسلوك والمشاهدات', checkAttendanceBehavior_],
    ['الأعمدة المقلوبة', checkSwappedColumns_]
  ];
  checks.forEach(function (c) {
    if (timeLeft_(ctx) < 20000) { ctx.skipped.push(c[0]); return; }
    try { c[1](ctx); }
    catch (e) { addIssue_(ctx, 'حرج', '—', 'تعذّر تنفيذ فحص: ' + c[0], 1, [], [String(e && e.message || e)], 'خطأ داخلي بالسكربت — أرسل التقرير كما هو'); }
  });
  if (ctx.skipped.length) {
    addIssue_(ctx, 'تحذير', '—', 'فحوص لم تكتمل لضيق الوقت', ctx.skipped.length, [], ctx.skipped,
      'شغّل السكربت مرة أخرى أو ارفع TIME_BUDGET_MS');
  }
}

// =====================================================================
// القراءة (قراءة فقط — لا يوجد في هذا الملف أي استدعاء كتابة على الشيت المصدر)
// =====================================================================
function normSheetName_(s) { return String(s).replace(/[\s_]+/g, '').toLowerCase(); }

function loadAllSheets_(ctx, source) {
  const tabs = source.getSheets();
  const used = {};
  Object.keys(SPEC).forEach(function (key) {
    const spec = SPEC[key];
    const tab = tabs.filter(function (t) { return normSheetName_(t.getName()) === normSheetName_(spec.name); })[0];
    if (!tab) { ctx.sheets[key] = null; return; }
    used[tab.getName()] = true;
    ctx.sheets[key] = readTab_(tab, spec);
  });
  tabs.forEach(function (t) {
    if (!used[t.getName()]) ctx.extraTabs.push({ name: t.getName(), rows: t.getLastRow(), cols: t.getLastColumn() });
  });
}

function readTab_(tab, spec) {
  const lastRow = tab.getLastRow();
  const lastCol = tab.getLastColumn();
  const maxMapped = Math.max.apply(null, Object.keys(spec.cols).map(Number));
  const width = Math.max(lastCol, 1);
  const out = { tabName: tab.getName(), lastRow: lastRow, lastCol: lastCol, maxMapped: maxMapped,
                header: [], rows: [], formulas: 0 };
  if (lastRow < 1) return out;
  const range = tab.getRange(1, 1, lastRow, width);
  const values = range.getValues();
  const display = range.getDisplayValues();
  let formulas = null;
  try { formulas = range.getFormulas(); } catch (e) { formulas = null; }
  out.header = display[0];
  for (let r = 1; r < values.length; r++) {
    const v = values[r], d = display[r];
    let any = false;
    for (let c = 0; c < v.length; c++) if (!isBlank_(v[c])) { any = true; break; }
    if (!any) continue;
    const row = { n: r + 1, v: v, d: d, f: formulas ? formulas[r] : null };
    if (row.f && row.f.some(function (x) { return x; })) out.formulas++;
    out.rows.push(row);
  }
  return out;
}

// =====================================================================
// أدوات
// =====================================================================
function isBlank_(v) { return v === '' || v === null || v === undefined; }
function isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()); }
function str_(v) { return isBlank_(v) ? '' : (isDate_(v) ? v.toISOString() : String(v)); }
function clean_(v) {
  return str_(v).replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00AD]/g, '').replace(/\u00A0/g, ' ').trim();
}
function hasInvisible_(v) {
  const s = str_(v);
  return s !== s.trim() || /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00AD\u00A0]/.test(s);
}
function arNorm_(v) {
  return clean_(v).replace(/[\u064B-\u065F\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه').replace(/\s+/g, '').toLowerCase();
}
function splitList_(v) { return clean_(v).split(',').map(function (s) { return s.trim(); }).filter(Boolean); }
function num_(v) {
  if (typeof v === 'number') return v;
  const s = clean_(v).replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); });
  if (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}
function toDate_(v) {
  if (isDate_(v)) return v;
  const s = clean_(v);
  if (!s) return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function dayKey_(v) {
  const s = arNorm_(v);
  if (!s) return '';
  if (s.indexOf('حد') !== -1 || s.indexOf('sun') === 0) return 0;
  if (s.indexOf('ثنين') !== -1 || s.indexOf('تنين') !== -1 || s.indexOf('mon') === 0) return 1;
  if (s.indexOf('ثلاث') !== -1 || s.indexOf('تلات') !== -1 || s.indexOf('tue') === 0) return 2;
  if (s.indexOf('ربع') !== -1 || s.indexOf('wed') === 0) return 3;
  if (s.indexOf('خميس') !== -1 || s.indexOf('thu') === 0) return 4;
  return '';
}
function periodNo_(v) {
  if (typeof v === 'number') return v >= 1 && v <= 12 ? v : null;
  const raw = clean_(v).replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); });
  const n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
  if (!isNaN(n)) return n >= 1 && n <= 12 ? n : null;
  const s = arNorm_(raw);
  if (!s) return null;
  if (s.indexOf('عشر') !== -1) {
    if (s.indexOf('حادي') !== -1) return 11;
    if (s.indexOf('ثاني') !== -1) return 12;
  }
  const words = [['اول', 1], ['ثاني', 2], ['ثالث', 3], ['رابع', 4], ['خامس', 5], ['سادس', 6], ['سابع', 7], ['ثامن', 8], ['تاسع', 9], ['عاشر', 10]];
  for (let i = 0; i < words.length; i++) if (s.indexOf(words[i][0]) !== -1) return words[i][1];
  return null;
}
function col_(row, c) { return row.v[c - 1]; }
function disp_(row, c) { return row.d[c - 1]; }
function rowsOf_(ctx, key) { return ctx.sheets[key] ? ctx.sheets[key].rows : []; }
function key_() { return Array.prototype.slice.call(arguments).map(function (x) { return clean_(x); }).join('|'); }

function addIssue_(ctx, severity, sheet, check, count, rows, samples, note) {
  if (!count) return;
  ctx.issues.push({
    severity: severity, sheet: sheet, check: check, count: count,
    rows: (rows || []).slice(0, SCAN_CONFIG.MAX_SAMPLES).join('، '),
    samples: (samples || []).slice(0, SCAN_CONFIG.MAX_SAMPLES).map(function (s) { return String(s).slice(0, 80); }).join(' ⟂ '),
    note: note || ''
  });
}
// تجميع صفوف مشكلة واحدة ثم إضافتها مرة واحدة
function collector_() { return { rows: [], samples: [], count: 0, add: function (r, s) { this.count++; this.rows.push(r); if (s !== undefined) this.samples.push(s); } }; }
function flush_(ctx, c, severity, sheet, check, note) { addIssue_(ctx, severity, sheet, check, c.count, c.rows, c.samples, note); }

function severityTotals_(ctx) {
  const t = { 'حرج': 0, 'تحذير': 0, 'معلومة': 0 };
  ctx.issues.forEach(function (i) { t[i.severity]++; });
  return t;
}

// =====================================================================
// 1) الجرد: الشيتات، العناوين، الأعمدة غير المعروفة، الصفوف الشاردة
// =====================================================================
function checkInventory_(ctx) {
  ctx.extraTabs.forEach(function (t) {
    addIssue_(ctx, t.rows > 1 ? 'حرج' : 'معلومة', t.name, 'تبويب لا يعرفه الكود', 1, [], [t.rows + ' صف × ' + t.cols + ' عمود'],
      'لن يُنقل تلقائيًا — قرّر: يُنقل أم يُؤرشف أم يُهمل');
  });

  Object.keys(SPEC).forEach(function (key) {
    const spec = SPEC[key], sh = ctx.sheets[key];
    if (!sh) {
      addIssue_(ctx, 'تحذير', spec.name, 'شيت متوقع غير موجود', 1, [], [], 'إن كان يُنشأ تلقائيًا عند أول استخدام فهذا طبيعي');
      return;
    }
    const width = Math.max(sh.lastCol, sh.maxMapped);
    for (let c = 1; c <= width; c++) {
      const m = spec.cols[c];
      const h = sh.header[c - 1] === undefined ? '' : sh.header[c - 1];
      let status;
      if (!m) status = c <= sh.lastCol ? 'عمود لا يعرفه الكود' : '';
      else if (c > sh.lastCol) status = 'غير موجود بالشيت';
      else status = arNorm_(h) === arNorm_(m[0]) ? 'مطابق' : 'العنوان مختلف';
      if (status) ctx.headers.push([spec.name, columnLetter_(c), h, m ? m[0] : '—', status]);
    }

    // أعمدة فيها بيانات ولا يعرفها الكود
    for (let c = 1; c <= sh.lastCol; c++) {
      if (spec.cols[c]) continue;
      const cl = collector_();
      sh.rows.forEach(function (r) { if (!isBlank_(col_(r, c))) cl.add(r.n, disp_(r, c)); });
      flush_(ctx, cl, 'حرج', spec.name, 'بيانات في عمود ' + columnLetter_(c) + ' (' + (sh.header[c - 1] || 'بلا عنوان') + ') لا يقرؤه الكود',
        'يجب تقرير مصيرها قبل النقل حتى لا تضيع');
    }

    // صفوف لا بيانات فيها إلا في أعمدة غير معروفة
    if (!spec.list) {
      const mapped = Object.keys(spec.cols).map(Number);
      const stray = collector_();
      sh.rows.forEach(function (r) {
        const hasMapped = mapped.some(function (c) { return !isBlank_(col_(r, c)); });
        if (!hasMapped) stray.add(r.n);
      });
      flush_(ctx, stray, 'تحذير', spec.name, 'صفوف بيانات خارج الأعمدة المعروفة فقط', 'غالبًا خلايا شاردة — راجعها');

      const last = sh.rows.length ? sh.rows[sh.rows.length - 1].n : 1;
      if (sh.lastRow - last > 50) {
        addIssue_(ctx, 'معلومة', spec.name, 'آخر صف مستخدم أبعد كثيرًا من آخر صف بيانات', 1, [sh.lastRow], [], 'خلايا فارغة منسّقة — لا خطر على النقل');
      }
    }
    if (sh.formulas) {
      addIssue_(ctx, key === 'STUDENTS' ? 'معلومة' : 'تحذير', spec.name, 'صفوف تحتوي معادلات', sh.formulas, [], [],
        'تُنقل قيمها الناتجة فقط، لا المعادلة');
    }
  });
}

function columnLetter_(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

// =====================================================================
// 2) أنواع القيم في كل عمود (ما حوّله Sheets من نفسه)
// =====================================================================
function checkColumnTypes_(ctx) {
  Object.keys(SPEC).forEach(function (key) {
    const spec = SPEC[key], sh = ctx.sheets[key];
    if (!sh || spec.list) return;
    Object.keys(spec.cols).map(Number).forEach(function (c) {
      const name = spec.cols[c][0], type = spec.cols[c][1];
      const p = { text: 0, number: 0, bool: 0, date: 0, empty: 0 };
      const bad = collector_(), inv = collector_();
      sh.rows.forEach(function (r) {
        const v = col_(r, c);
        if (isBlank_(v)) { p.empty++; return; }
        if (isDate_(v)) p.date++; else if (typeof v === 'boolean') p.bool++; else if (typeof v === 'number') p.number++; else p.text++;
        const showable = type !== 'secret';
        if (type === 'id' && (isDate_(v) || typeof v === 'boolean')) bad.add(r.n, showable ? disp_(r, c) : '');
        else if (type === 't' && (isDate_(v) || typeof v === 'boolean')) bad.add(r.n, disp_(r, c));
        else if (type === 'n' && isNaN(num_(v))) bad.add(r.n, disp_(r, c));
        else if (type === 'd' && !toDate_(v)) bad.add(r.n, disp_(r, c));
        else if (type === 'tm' && !isDate_(v) && !/^\s*\d{1,2}:\d{2}/.test(str_(v))) bad.add(r.n, disp_(r, c));
        if ((type === 'id' || type === 't') && typeof v === 'string' && hasInvisible_(v)) inv.add(r.n, JSON.stringify(v));
      });
      ctx.profiles.push([spec.name, columnLetter_(c), name, type, p.text, p.number, p.bool, p.date, p.empty]);
      const what = { id: 'معرّف تحوّل لتاريخ أو منطقي', t: 'نص تحوّل لتاريخ أو قيمة منطقية', n: 'قيمة غير رقمية في عمود رقمي',
                     d: 'تاريخ لا يُفهم', tm: 'وقت لا يُفهم' }[type];
      if (what) flush_(ctx, bad, type === 'id' ? 'حرج' : 'تحذير', spec.name, what + ' — ' + name,
        type === 't' ? 'يُنقل بالقيمة المعروضة كما تظهر بالشيت' : 'يذهب للحجر إن لم يُصحَّح');
      flush_(ctx, inv, 'معلومة', spec.name, 'مسافات أو رموز خفية — ' + name, 'تُنقل كما هي حرفيًا، والمطابقة تتجاهلها');
    });
  });
}

// =====================================================================
// 3) القيم المرجعية: كل قيمة مستخدمة هل هي موجودة في قوائم Settings؟
// =====================================================================
function settingsList_(ctx, c) {
  const set = {};
  rowsOf_(ctx, 'SETTINGS').forEach(function (r) { const v = clean_(col_(r, c)); if (v) set[v] = true; });
  return set;
}

function checkReferenceValues_(ctx) {
  const lists = {
    'الفروع': settingsList_(ctx, 1), 'المراحل': settingsList_(ctx, 2), 'الصفوف': settingsList_(ctx, 3),
    'الشعب': settingsList_(ctx, 4), 'المواد': settingsList_(ctx, 5), 'الفصول الدراسية': settingsList_(ctx, 10),
    'أنواع التقييم': Object.assign({}, settingsList_(ctx, 12), settingsList_(ctx, 13)),
    'حالات التحضير': settingsList_(ctx, 9), 'حالات السلوك': settingsList_(ctx, 11), 'حالات الحساب': settingsList_(ctx, 8)
  };
  ctx.settingsLists = lists;

  // تكرار داخل قوائم Settings نفسها
  [[1, 'الفروع'], [2, 'المراحل'], [3, 'الصفوف'], [4, 'الشعب'], [5, 'المواد'], [10, 'الفصول الدراسية']].forEach(function (x) {
    const seen = {}, dup = collector_();
    rowsOf_(ctx, 'SETTINGS').forEach(function (r) {
      const v = clean_(col_(r, x[0])); if (!v) return;
      const k = arNorm_(v);
      if (seen[k] !== undefined && seen[k] !== v) dup.add(r.n, seen[k] + ' ≈ ' + v);
      else if (seen[k] === v) dup.add(r.n, v);
      seen[k] = v;
    });
    flush_(ctx, dup, 'تحذير', 'Settings', 'قيم مكررة أو متشابهة في قائمة ' + x[1], 'ستصير صفًا واحدًا — تأكد أنها نفس الشيء');
  });

  const uses = [
    ['الفروع', 'STUDENTS', 8], ['الفروع', 'EMPLOYEES', 8, true], ['الفروع', 'USERS', 5, true], ['الفروع', 'TIMETABLE', 1],
    ['الفروع', 'TASK_LOG', 3], ['الفروع', 'ENRICHMENT', 3], ['الفروع', 'FORMS', 4], ['الفروع', 'DAILY', 3], ['الفروع', 'MATRIX', 1],
    ['المراحل', 'STUDENTS', 9], ['المراحل', 'EMPLOYEES', 9, true], ['المراحل', 'TIMETABLE', 2], ['المراحل', 'TASK_LOG', 4],
    ['المراحل', 'FORMS', 5], ['المراحل', 'MATRIX', 2],
    ['الصفوف', 'STUDENTS', 10], ['الصفوف', 'EMPLOYEES', 10, true], ['الصفوف', 'USERS', 9, true], ['الصفوف', 'TIMETABLE', 3],
    ['الصفوف', 'TASK_LOG', 5], ['الصفوف', 'ENRICHMENT', 5], ['الصفوف', 'FORMS', 6], ['الصفوف', 'DAILY', 5], ['الصفوف', 'MATRIX', 3],
    ['الشعب', 'STUDENTS', 11], ['الشعب', 'EMPLOYEES', 11, true], ['الشعب', 'USERS', 10, true], ['الشعب', 'TIMETABLE', 4],
    ['الشعب', 'TASK_LOG', 6], ['الشعب', 'ENRICHMENT', 6], ['الشعب', 'FORMS', 7], ['الشعب', 'DAILY', 6], ['الشعب', 'MATRIX', 4, true],
    ['المواد', 'EMPLOYEES', 12, true], ['المواد', 'USERS', 8, true], ['المواد', 'TIMETABLE', 11], ['المواد', 'TASK_LOG', 7],
    ['المواد', 'ENRICHMENT', 7], ['المواد', 'FORMS', 8], ['المواد', 'DAILY', 7], ['المواد', 'MATRIX', 5, true],
    ['المواد', 'GRADE_DIST', 3], ['المواد', 'ATTENDANCE', 10], ['المواد', 'GRADE_AGG', 8],
    ['الفصول الدراسية', 'CALENDAR', 1], ['الفصول الدراسية', 'TASK_LOG', 19], ['الفصول الدراسية', 'ENRICHMENT', 14],
    ['الفصول الدراسية', 'FORMS', 9], ['الفصول الدراسية', 'DAILY', 8], ['الفصول الدراسية', 'ATTENDANCE', 4],
    ['الفصول الدراسية', 'BEHAVIOR', 4], ['الفصول الدراسية', 'GRADE_AGG', 3],
    ['أنواع التقييم', 'TASK_LOG', 8], ['أنواع التقييم', 'FORMS', 16], ['أنواع التقييم', 'DAILY', 9], ['أنواع التقييم', 'GRADE_DIST', 1],
    ['حالات التحضير', 'ATTENDANCE', 8], ['حالات السلوك', 'BEHAVIOR', 7],
    ['حالات الحساب', 'USERS', 11], ['حالات الحساب', 'STUDENTS_USERS', 11]
  ];
  uses.forEach(function (u) {
    const list = lists[u[0]], spec = SPEC[u[1]];
    rowsOf_(ctx, u[1]).forEach(function (r) {
      const raw = col_(r, u[2]);
      if (isBlank_(raw)) return;
      const vals = u[3] ? splitList_(raw) : [clean_(raw)];
      vals.forEach(function (v) {
        const k = u[0] + '||' + v;
        if (!ctx.refs[k]) ctx.refs[k] = { list: u[0], value: v, inSettings: !!list[v], count: 0, where: {} };
        ctx.refs[k].count++;
        ctx.refs[k].where[spec.name + ':' + columnLetter_(u[2])] = true;
      });
    });
  });
  Object.keys(ctx.refs).forEach(function (k) {
    const r = ctx.refs[k];
    if (!r.inSettings) {
      addIssue_(ctx, 'تحذير', Object.keys(r.where).join('، '), 'قيمة غير موجودة في قائمة ' + r.list + ' بشيت Settings', r.count, [], [r.value],
        'إما خطأ إملائي يُوحَّد، أو قيمة صحيحة تُضاف للقائمة');
    }
    if (clean_(r.value).indexOf('،') !== -1) {
      addIssue_(ctx, 'تحذير', Object.keys(r.where).join('، '), 'قائمة مفصولة بفاصلة عربية (،)', r.count, [], [r.value],
        'الكود يفصل بالفاصلة الإنجليزية فقط — هذه تُقرأ قيمة واحدة');
    }
  });
}

// =====================================================================
// 4) الطلاب والموظفون
// =====================================================================
function dupCheck_(ctx, key, c, label, severity, normalizer) {
  const seen = {}, dup = collector_(), blank = collector_();
  rowsOf_(ctx, key).forEach(function (r) {
    const v = (normalizer || clean_)(col_(r, c));
    if (!v) { blank.add(r.n); return; }
    if (seen[v]) dup.add(r.n, (SPEC[key].cols[c][1] === 'secret' ? '(مخفي)' : v) + ' ← مكرر مع صف ' + seen[v]);
    else seen[v] = r.n;
  });
  flush_(ctx, dup, severity, SPEC[key].name, label + ' مكرر', 'القيد الفريد سيرفض الثاني — يذهب للحجر');
  flush_(ctx, blank, severity, SPEC[key].name, label + ' فارغ', 'سجل بلا معرّف لا يمكن ربطه');
}

function idSet_(ctx, key, c) {
  const s = {};
  rowsOf_(ctx, key).forEach(function (r) { const v = clean_(col_(r, c)); if (v) s[v] = r; });
  return s;
}

function checkPeople_(ctx) {
  dupCheck_(ctx, 'STUDENTS', 1, 'Students_id', 'حرج');
  dupCheck_(ctx, 'EMPLOYEES', 1, 'Employees_id', 'حرج');
  // الهوية: التكرار فقط (الفارغ مسموح)
  [['STUDENTS', 'رقم هوية طالب'], ['EMPLOYEES', 'رقم هوية موظف']].forEach(function (x) {
    const seen = {}, dup = collector_();
    rowsOf_(ctx, x[0]).forEach(function (r) {
      const v = clean_(col_(r, 2)); if (!v) return;
      if (seen[v]) dup.add(r.n + ' و ' + seen[v]); else seen[v] = r.n;
    });
    flush_(ctx, dup, 'تحذير', SPEC[x[0]].name, x[1] + ' مكرر', 'غالبًا نفس الشخص مسجّل مرتين — يُراجع يدويًا');
  });

  const noClass = collector_(), multi = collector_();
  rowsOf_(ctx, 'STUDENTS').forEach(function (r) {
    const parts = [8, 9, 10, 11].map(function (c) { return clean_(col_(r, c)); });
    if (parts.some(function (p) { return !p; })) noClass.add(r.n, clean_(col_(r, 1)));
    if (parts.some(function (p) { return p.indexOf(',') !== -1; })) multi.add(r.n, clean_(col_(r, 1)));
  });
  flush_(ctx, noClass, 'تحذير', 'Students', 'طالب بلا فرع أو مرحلة أو صف أو شعبة', 'يُنقل بلا فصل — لن يرى أي محتوى حتى يُكمَل');
  flush_(ctx, multi, 'حرج', 'Students', 'طالب بأكثر من قيمة في الفرع/الصف/الشعبة', 'الطالب ينتمي لفصل واحد فقط');

  // الصف ينتمي لأكثر من مرحلة؟ (يحدد هل الصف يحتاج سجلًا مستقلًا لكل مرحلة)
  const gradeStages = {};
  ['STUDENTS', 'MATRIX', 'TIMETABLE'].forEach(function (k) {
    const cs = k === 'STUDENTS' ? [9, 10] : (k === 'MATRIX' ? [2, 3] : [2, 3]);
    rowsOf_(ctx, k).forEach(function (r) {
      const st = clean_(col_(r, cs[0])), g = clean_(col_(r, cs[1]));
      if (!st || !g) return;
      (gradeStages[g] = gradeStages[g] || {})[st] = true;
    });
  });
  Object.keys(gradeStages).forEach(function (g) {
    const st = Object.keys(gradeStages[g]);
    if (st.length > 1) addIssue_(ctx, 'معلومة', 'Students/Matrix/Timetable', 'صف بنفس الاسم في أكثر من مرحلة', 1, [], [g + ' ← ' + st.join('، ')],
      'طبيعي — سيُنشأ صف مستقل لكل مرحلة');
  });
}

// =====================================================================
// 5) الحسابات والصلاحيات
// =====================================================================
function checkAccounts_(ctx) {
  const students = idSet_(ctx, 'STUDENTS', 1), employees = idSet_(ctx, 'EMPLOYEES', 1);
  [['USERS', employees, 'موظف'], ['STUDENTS_USERS', students, 'طالب']].forEach(function (x) {
    const name = SPEC[x[0]].name;
    dupCheck_(ctx, x[0], 1, 'user_id', 'حرج');
    dupCheck_(ctx, x[0], 3, 'username', 'حرج', function (v) { return clean_(v).toLowerCase(); });

    const orphan = collector_(), hashed = { h: 0, plain: 0, empty: 0 }, inactive = collector_();
    rowsOf_(ctx, x[0]).forEach(function (r) {
      const id = clean_(col_(r, 1));
      if (id && !x[1][id]) orphan.add(r.n, id);
      const p = str_(col_(r, 4));
      if (!p) hashed.empty++; else if (/^[a-f0-9]{64}$/i.test(p)) hashed.h++; else hashed.plain++;
      const st = clean_(col_(r, 11));
      if (st && st !== 'active') inactive.add(r.n, id + ' (' + st + ')');
    });
    flush_(ctx, orphan, 'حرج', name, 'حساب لا يقابله ' + x[2] + ' في شيته', 'حساب بلا سجل — لا يمكن ربطه، يُراجع');
    flush_(ctx, inactive, 'معلومة', name, 'حسابات غير مفعّلة', 'تُنقل معطّلة');
    addIssue_(ctx, 'معلومة', name, 'حالة كلمات المرور', rowsOf_(ctx, x[0]).length, [],
      ['مشفّرة: ' + hashed.h, 'نص صريح: ' + hashed.plain, 'فارغة: ' + hashed.empty],
      'المشفّرة تُتحقق عند أول دخول، والصريحة تُنقل مباشرة لـ Supabase Auth، والفارغة تحتاج كلمة جديدة');
    if (hashed.empty) addIssue_(ctx, 'تحذير', name, 'حسابات بلا كلمة مرور', hashed.empty, [], [], 'لن يستطيع صاحبها الدخول');
  });

  // صلاحيات المعلمين: الرفض هو الأصل في النظام الجديد
  const missing = collector_(), noAccount = collector_();
  const accounts = idSet_(ctx, 'USERS', 1);
  rowsOf_(ctx, 'USERS').forEach(function (r) {
    if (clean_(col_(r, 6)).toLowerCase() === 'admin') return;
    const dims = [[5, 'الفرع'], [9, 'الصف'], [10, 'الشعبة'], [8, 'المادة']].filter(function (d) { return !clean_(col_(r, d[0])); })
      .map(function (d) { return d[1]; });
    if (dims.length) missing.add(r.n, clean_(col_(r, 1)) + ' ← ينقصه: ' + dims.join('، '));
  });
  flush_(ctx, missing, 'حرج', 'Users', 'معلم ناقص الصلاحيات',
    'في النظام القديم الحقل الفارغ = يرى الكل، في الجديد = لا يرى شيئًا. أكمل صلاحياته قبل النقل');
  rowsOf_(ctx, 'EMPLOYEES').forEach(function (r) {
    const id = clean_(col_(r, 1));
    if (id && !accounts[id]) noAccount.add(r.n, id);
  });
  flush_(ctx, noAccount, 'معلومة', 'Employees', 'موظف بلا حساب دخول', 'يُنقل سجله، ويُنشأ حسابه لاحقًا عند الحاجة');

  // اختلاف صف/شعبة الطالب بين حسابه وسجله (الجلسة الحالية تعتمد على الحساب!)
  const drift = collector_(), studNoAcc = collector_();
  const studAcc = idSet_(ctx, 'STUDENTS_USERS', 1);
  rowsOf_(ctx, 'STUDENTS_USERS').forEach(function (r) {
    const s = students[clean_(col_(r, 1))];
    if (!s) return;
    const a = [clean_(col_(r, 5)), clean_(col_(r, 9)), clean_(col_(r, 10))].join(' / ');
    const b = [clean_(col_(s, 8)), clean_(col_(s, 10)), clean_(col_(s, 11))].join(' / ');
    if (a !== b) drift.add(r.n, clean_(col_(r, 1)) + ': الحساب ' + a + ' ≠ السجل ' + b);
  });
  flush_(ctx, drift, 'تحذير', 'Students_Users', 'فصل الطالب في حسابه يختلف عن سجله',
    'النظام الجديد يعتمد السجل (Students) — الطالب سيرى محتوى فصله الحقيقي');
  rowsOf_(ctx, 'STUDENTS').forEach(function (r) { const id = clean_(col_(r, 1)); if (id && !studAcc[id]) studNoAcc.add(r.n, id); });
  flush_(ctx, studNoAcc, 'معلومة', 'Students', 'طالب بلا حساب دخول', 'يُنقل سجله، ويُنشأ حسابه لاحقًا');
}

// =====================================================================
// 6) التقويم
// =====================================================================
function checkCalendar_(ctx) {
  const rows = rowsOf_(ctx, 'CALENDAR');
  const bad = collector_(), reversed = collector_(), nested = collector_(), noTerm = collector_();
  const parsed = [];
  rows.forEach(function (r) {
    const s = toDate_(col_(r, 4)), e = toDate_(col_(r, 5));
    if (!clean_(col_(r, 1))) noTerm.add(r.n);
    if (!s || !e) { bad.add(r.n, disp_(r, 4) + ' → ' + disp_(r, 5)); return; }
    if (e < s) reversed.add(r.n, disp_(r, 4) + ' → ' + disp_(r, 5));
    parsed.push({ n: r.n, s: s, e: e, term: clean_(col_(r, 1)), week: clean_(col_(r, 3)), event: clean_(col_(r, 6)) });
  });
  parsed.forEach(function (a) {
    const host = parsed.filter(function (b) { return b.n !== a.n && b.s <= a.s && b.e >= a.e && (b.e - b.s) > (a.e - a.s); })[0];
    if (host) nested.add(a.n, (a.event || a.week) + ' داخل صف ' + host.n);
  });
  flush_(ctx, noTerm, 'حرج', 'School Calendar', 'صف تقويم بلا فصل دراسي', 'لا يمكن ربطه بترم');
  flush_(ctx, bad, 'حرج', 'School Calendar', 'تاريخ بداية أو نهاية لا يُفهم', 'يذهب للحجر');
  flush_(ctx, reversed, 'حرج', 'School Calendar', 'النهاية قبل البداية', 'القاعدة ترفضه');
  flush_(ctx, nested, 'معلومة', 'School Calendar', 'صفوف محتواة داخل أسابيع (إجازات/أحداث)', 'تُنقل كأحداث، ولا تُعدّ أسابيع — نفس السلوك الحالي');

  // مفتاح الأسبوع: (ترم، اسم الأسبوع) يجب أن يكون فريدًا لربط المهام والتحضير به
  const seen = {}, dupWeek = collector_();
  parsed.forEach(function (p) {
    if (nested.rows.indexOf(p.n) !== -1 || !p.week) return;
    const k = p.term + '|' + p.week;
    if (seen[k]) dupWeek.add(p.n, k + ' (مع صف ' + seen[k] + ')'); else seen[k] = p.n;
  });
  flush_(ctx, dupWeek, 'تحذير', 'School Calendar', 'نفس اسم الأسبوع مكرر في نفس الترم', 'التحضير والمهام المرتبطة به ستكون غامضة');
  ctx.weekKeys = seen;
}

// =====================================================================
// 7) جدول الحصص والاختبارات
// =====================================================================
function checkTimetable_(ctx) {
  const employees = idSet_(ctx, 'EMPLOYEES', 1);
  const types = {}, badDay = collector_(), badPeriod = collector_(), dup = collector_(), noTeacher = collector_(), badExamDate = collector_();
  const seen = {};
  rowsOf_(ctx, 'TIMETABLE').forEach(function (r) {
    const t = clean_(col_(r, 5));
    types[t] = (types[t] || 0) + 1;
    const emp = clean_(col_(r, 12));
    if (emp && !employees[emp]) noTeacher.add(r.n, emp);
    if (t === 'جدول حصص') {
      const d = dayKey_(col_(r, 6)), p = periodNo_(col_(r, 7));
      if (d === '') badDay.add(r.n, disp_(r, 6));
      if (p === null) badPeriod.add(r.n, disp_(r, 7));
      if (d !== '' && p !== null) {
        const k = key_(col_(r, 1), col_(r, 3), col_(r, 4), d, p, col_(r, 11));
        if (seen[k]) dup.add(r.n, 'مع صف ' + seen[k]); else seen[k] = r.n;
      }
    } else if (!toDate_(col_(r, 8))) {
      badExamDate.add(r.n, disp_(r, 8));
    }
  });
  addIssue_(ctx, 'معلومة', 'Class Timetable', 'قيم عمود النوع', Object.keys(types).length, [],
    Object.keys(types).map(function (k) { return (k || '(فارغ)') + ': ' + types[k]; }), 'كل ما ليس "جدول حصص" يُعامَل كاختبار');
  flush_(ctx, badDay, 'حرج', 'Class Timetable', 'يوم لا يُفهم', 'يذهب للحجر — صحّح الاسم');
  flush_(ctx, badPeriod, 'حرج', 'Class Timetable', 'رقم حصة لا يُفهم', 'يذهب للحجر — صحّح القيمة');
  flush_(ctx, dup, 'حرج', 'Class Timetable', 'نفس المادة مكررة في نفس الحصة لنفس الفصل', 'القيد الفريد يرفض الثاني');
  flush_(ctx, noTeacher, 'تحذير', 'Class Timetable', 'معرّف معلم غير موجود في Employees', 'تُنقل الحصة بلا معلم');
  flush_(ctx, badExamDate, 'تحذير', 'Class Timetable', 'صف اختبار بلا تاريخ صالح', 'يذهب للحجر');
}

// =====================================================================
// 8) التكاليف والإثراءات والنماذج
// =====================================================================
function checkTasksAndForms_(ctx) {
  const forms = idSet_(ctx, 'FORMS', 1);
  const employees = idSet_(ctx, 'EMPLOYEES', 1);
  const disp = {}, badForm = collector_(), multi = collector_(), dupTitle = collector_(), noTeacher = collector_();
  const seen = {};
  rowsOf_(ctx, 'TASK_LOG').forEach(function (r) {
    const t = clean_(col_(r, 20)) || '(فارغ)';
    disp[t] = (disp[t] || 0) + 1;
    const f = clean_(col_(r, 21));
    if (f && !forms[f]) badForm.add(r.n, f);
    if ([3, 5, 6].some(function (c) { return clean_(col_(r, c)).indexOf(',') !== -1; })) multi.add(r.n, clean_(col_(r, 9)));
    if (!employees[clean_(col_(r, 1))]) noTeacher.add(r.n, clean_(col_(r, 1)));
    if (t === 'مهمة' || t === '(فارغ)') {
      const k = key_(col_(r, 3), col_(r, 5), col_(r, 6), col_(r, 7), col_(r, 19), col_(r, 9));
      if (seen[k]) dupTitle.add(r.n, clean_(col_(r, 9)) + ' (مع صف ' + seen[k] + ')'); else seen[k] = r.n;
    }
  });
  addIssue_(ctx, 'معلومة', 'Task_Log', 'قيم طريقة العرض', Object.keys(disp).length, [],
    Object.keys(disp).map(function (k) { return k + ': ' + disp[k]; }), 'فيديو/إثراء بقيت هنا تُنقل كمحتوى لا كتكليف');
  flush_(ctx, badForm, 'تحذير', 'Task_Log', 'تكليف مرتبط بنموذج غير موجود', 'يُنقل كتكليف عادي');
  flush_(ctx, multi, 'حرج', 'Task_Log', 'تكليف لأكثر من فرع/صف/شعبة في صف واحد', 'سيُقسَّم تقييمًا لكل فصل — قرار يحتاج تأكيدك');
  flush_(ctx, dupTitle, 'تحذير', 'Task_Log', 'تكليفان بنفس العنوان لنفس الفصل والمادة والترم',
    'الرصد مرتبط بالعنوان — لا يمكن معرفة أي رصد يتبع أي تكليف. يُدمجان أو يُعاد تسمية أحدهما');
  flush_(ctx, noTeacher, 'تحذير', 'Task_Log', 'معلم التكليف غير موجود في Employees', 'يُنقل بلا معلم (يراه الإداري فقط)');

  const eDisp = {}, eMulti = collector_();
  rowsOf_(ctx, 'ENRICHMENT').forEach(function (r) {
    const t = clean_(col_(r, 15)) || '(فارغ)';
    eDisp[t] = (eDisp[t] || 0) + 1;
    if ([3, 5, 6].some(function (c) { return clean_(col_(r, c)).indexOf(',') !== -1; })) eMulti.add(r.n);
  });
  addIssue_(ctx, 'معلومة', 'Enrichment Log', 'قيم طريقة العرض', Object.keys(eDisp).length, [],
    Object.keys(eDisp).map(function (k) { return k + ': ' + eDisp[k]; }), '');
  flush_(ctx, eMulti, 'حرج', 'Enrichment Log', 'محتوى لأكثر من فصل في صف واحد', 'سيُقسَّم لكل فصل');

  dupCheck_(ctx, 'FORMS', 1, 'Form_id', 'حرج');
  const statuses = {}, badWindow = collector_(), fMulti = collector_(), badAttempts = collector_();
  const qCount = {};
  rowsOf_(ctx, 'FORM_QUESTIONS').forEach(function (r) { const f = clean_(col_(r, 2)); qCount[f] = (qCount[f] || 0) + 1; });
  const noQ = collector_();
  rowsOf_(ctx, 'FORMS').forEach(function (r) {
    const s = clean_(col_(r, 15)) || '(فارغ)';
    statuses[s] = (statuses[s] || 0) + 1;
    const o = toDate_(col_(r, 12)), c = toDate_(col_(r, 13));
    if (o && c && c <= o) badWindow.add(r.n, clean_(col_(r, 1)) + ': فتح ' + disp_(r, 12) + ' / إغلاق ' + disp_(r, 13));
    if ([4, 6, 7].some(function (k) { return clean_(col_(r, k)).indexOf(',') !== -1; })) fMulti.add(r.n, clean_(col_(r, 1)));
    if (!isBlank_(col_(r, 14)) && !(num_(col_(r, 14)) >= 1)) badAttempts.add(r.n, disp_(r, 14));
    if (!qCount[clean_(col_(r, 1))]) noQ.add(r.n, clean_(col_(r, 1)));
  });
  addIssue_(ctx, 'معلومة', 'Forms', 'قيم الحالة', Object.keys(statuses).length, [],
    Object.keys(statuses).map(function (k) { return k + ': ' + statuses[k]; }), 'المتوقع: مسودة / منشور / مغلق');
  flush_(ctx, badWindow, 'حرج', 'Forms', 'تاريخ الإغلاق قبل أو يساوي تاريخ الفتح (حسب مواقع الكود L=فتح M=إغلاق)',
    'إن كانت كثيرة فالبيانات قد تتبع العناوين المقلوبة — راجع قسم الأعمدة المقلوبة');
  flush_(ctx, fMulti, 'حرج', 'Forms', 'نموذج لأكثر من فصل', 'النموذج لفصل واحد في الكود الحالي');
  flush_(ctx, badAttempts, 'تحذير', 'Forms', 'عدد محاولات غير صالح', 'يُنقل 1 افتراضيًا');
  flush_(ctx, noQ, 'معلومة', 'Forms', 'نماذج بلا أي سؤال', 'تُنقل كمسودات فارغة');
}

// =====================================================================
// 9) الأسئلة
// =====================================================================
function parseOptions_(raw) { return clean_(raw).split('||').map(function (o) { return o.trim(); }).filter(Boolean); }

function resolveCorrect_(raw, opts) {
  const c = clean_(raw);
  if (!c) return { ok: false, how: 'فارغة' };
  if (opts.indexOf(c) !== -1) return { ok: true, how: 'مطابقة', value: c };
  const byCase = opts.filter(function (o) { return o.toLowerCase() === c.toLowerCase(); });
  if (byCase.length === 1) return { ok: true, how: 'حالة الأحرف', value: byCase[0] };
  return { ok: false, how: 'لا تطابق' };
}

function checkQuestions_(ctx) {
  dupCheck_(ctx, 'FORM_QUESTIONS', 1, 'Question_id', 'حرج');
  const forms = idSet_(ctx, 'FORMS', 1);
  const orphan = collector_(), fewOpts = collector_(), dupOpts = collector_(), caseOnly = collector_(), noMatch = collector_(),
        boolCorrect = collector_(), badPoints = collector_(), types = {};
  ctx.questions = {};
  rowsOf_(ctx, 'FORM_QUESTIONS').forEach(function (r) {
    const qid = clean_(col_(r, 1)), fid = clean_(col_(r, 2));
    if (!forms[fid]) orphan.add(r.n, qid + ' → ' + fid);
    const t = clean_(col_(r, 4)) || '(فارغ)';
    types[t] = (types[t] || 0) + 1;
    const opts = parseOptions_(col_(r, 5));
    if (opts.length < 2) fewOpts.add(r.n, qid);
    const uniq = {}; opts.forEach(function (o) { uniq[o] = (uniq[o] || 0) + 1; });
    if (Object.keys(uniq).some(function (o) { return uniq[o] > 1; })) dupOpts.add(r.n, qid);
    if (typeof col_(r, 6) === 'boolean') boolCorrect.add(r.n, qid + ': ' + disp_(r, 6));
    const res = resolveCorrect_(disp_(r, 6), opts);
    if (res.ok && res.how === 'حالة الأحرف') caseOnly.add(r.n, qid);
    if (!res.ok) noMatch.add(r.n, qid + ' (' + res.how + ')');
    if (isNaN(num_(col_(r, 7)))) badPoints.add(r.n, qid + ': ' + disp_(r, 7));
    // المفتاح (نموذج|سؤال) لا السؤال وحده: معرّف السؤال قد يتكرر بين نموذجين
    ctx.questions[fid + '|' + qid] = { form: fid, qid: qid, opts: opts, correct: res.ok ? res.value : null, points: num_(col_(r, 7)) || 0 };
  });
  addIssue_(ctx, 'معلومة', 'Form_Questions', 'أنواع الأسئلة', Object.keys(types).length, [],
    Object.keys(types).map(function (k) { return k + ': ' + types[k]; }), '');
  flush_(ctx, orphan, 'حرج', 'Form_Questions', 'سؤال لنموذج غير موجود', 'يذهب للحجر');
  flush_(ctx, fewOpts, 'تحذير', 'Form_Questions', 'سؤال بأقل من خيارين', '');
  flush_(ctx, dupOpts, 'حرج', 'Form_Questions', 'خيار مكرر بنفس النص في سؤال واحد',
    'الإجابات مخزّنة بالنص — لا يمكن معرفة أي الخيارين اختار الطالب');
  flush_(ctx, boolCorrect, 'تحذير', 'Form_Questions', 'الإجابة الصحيحة تحوّلت لقيمة منطقية (مثل FM0011)', 'تُقرأ بالقيمة المعروضة');
  flush_(ctx, caseOnly, 'معلومة', 'Form_Questions', 'الإجابة الصحيحة تطابق خيارًا باختلاف حالة الأحرف فقط', 'تُحل تلقائيًا كما يفعل الكود الحالي');
  flush_(ctx, noMatch, 'حرج', 'Form_Questions', 'الإجابة الصحيحة لا تطابق أي خيار', 'لا يمكن تعليم الخيار الصحيح — قرار يدوي');
  flush_(ctx, badPoints, 'تحذير', 'Form_Questions', 'درجة سؤال غير رقمية', 'تُعامل 0 كما يفعل الكود الحالي');
}

// =====================================================================
// 10) إجابات الطلاب
// =====================================================================
function checkResponses_(ctx) {
  dupCheck_(ctx, 'FORM_RESPONSES', 1, 'Response_id', 'حرج');
  const forms = idSet_(ctx, 'FORMS', 1), students = idSet_(ctx, 'STUDENTS', 1);
  const qs = ctx.questions || {};
  const orphanF = collector_(), orphanS = collector_(), badJson = collector_(), foreignQ = collector_(), badAnswer = collector_(),
        scoreDiff = collector_(), overAttempts = collector_(), absentDup = collector_();
  let absent = 0, real = 0;
  const perStudent = {}, maxByForm = {};
  Object.keys(qs).forEach(function (k) { maxByForm[qs[k].form] = (maxByForm[qs[k].form] || 0) + qs[k].points; });
  rowsOf_(ctx, 'FORM_RESPONSES').forEach(function (r) {
    const rid = clean_(col_(r, 1)), fid = clean_(col_(r, 2)), sid = clean_(col_(r, 3));
    if (!forms[fid]) orphanF.add(r.n, rid + ' → ' + fid);
    if (!students[sid]) orphanS.add(r.n, rid + ' → ' + sid);
    const raw = str_(col_(r, 8));
    const k = fid + '|' + sid;
    perStudent[k] = perStudent[k] || { real: 0, absent: 0, rows: [] };
    perStudent[k].rows.push(r.n);
    if (raw === ABSENT_SENTINEL) { absent++; perStudent[k].absent++; return; }
    real++; perStudent[k].real++;
    let ans;
    try { ans = JSON.parse(raw || '{}'); } catch (e) { badJson.add(r.n, rid); return; }
    let earned = 0, broken = false;
    const max = maxByForm[fid] || 0;
    Object.keys(ans).forEach(function (qid) {
      const q = qs[fid + '|' + qid];
      if (!q) { foreignQ.add(r.n, rid + ': ' + qid); broken = true; return; }
      const a = clean_(ans[qid]);
      if (q.opts.indexOf(a) === -1) { badAnswer.add(r.n, rid + ': ' + qid); broken = true; return; }
      if (q.correct !== null && a === q.correct) earned += q.points;
    });
    const stored = num_(col_(r, 9));
    if (!broken && !isNaN(stored) && Math.abs(Math.round(earned * 100) / 100 - stored) > 0.01) {
      scoreDiff.add(r.n, rid + ': مخزّنة ' + stored + ' / بالأسئلة الحالية ' + Math.round(earned * 100) / 100 + ' من ' + max);
    }
  });
  const allowed = {};
  rowsOf_(ctx, 'FORMS').forEach(function (r) { allowed[clean_(col_(r, 1))] = num_(col_(r, 14)) || 1; });
  Object.keys(perStudent).forEach(function (k) {
    const p = perStudent[k], fid = k.split('|')[0];
    if (p.real > (allowed[fid] || 1)) overAttempts.add(p.rows[0], k + ': ' + p.real + ' محاولات');
    if (p.absent > 1) absentDup.add(p.rows[0], k);
  });
  addIssue_(ctx, 'معلومة', 'Form_Responses', 'عدد الإجابات', real + absent, [], ['حقيقية: ' + real, 'صفر تلقائي: ' + absent], '');
  flush_(ctx, orphanF, 'حرج', 'Form_Responses', 'إجابة لنموذج غير موجود', 'يذهب للحجر مع نصه الكامل');
  flush_(ctx, orphanS, 'حرج', 'Form_Responses', 'إجابة لطالب غير موجود في Students', 'يذهب للحجر');
  flush_(ctx, badJson, 'حرج', 'Form_Responses', 'نص الإجابات تالف (ليس JSON)', 'تُحفظ الدرجة والنص الخام، بلا تفاصيل الإجابات');
  flush_(ctx, foreignQ, 'تحذير', 'Form_Responses', 'إجابة لسؤال لم يعد في النموذج', 'الدرجة المخزنة تُحفظ كما هي، والإجابة تبقى في النص الخام');
  flush_(ctx, badAnswer, 'تحذير', 'Form_Responses', 'إجابة لا تطابق أي خيار حالي (سؤال عُدّل بعد الإجابة)',
    'لا يمكن ربطها بمعرّف خيار — الدرجة المخزنة تُحفظ، والنص الخام يبقى');
  flush_(ctx, scoreDiff, 'تحذير', 'Form_Responses', 'الدرجة المخزنة تختلف عن إعادة التصحيح بالأسئلة الحالية',
    'تُنقل الدرجة المخزنة كما هي — لا تُعاد معالجة أي درجة');
  flush_(ctx, overAttempts, 'معلومة', 'Form_Responses', 'محاولات أكثر من المسموح', 'تُنقل كلها مرقّمة');
  flush_(ctx, absentDup, 'تحذير', 'Form_Responses', 'أكثر من صفر تلقائي لنفس الطالب ونفس النموذج', 'يُنقل واحد فقط');
}

// =====================================================================
// 11) الرصد اليومي — أهم فحص: كل رصد يجب أن يرتبط بتقييم واحد
// =====================================================================
function checkDailyFollowup_(ctx) {
  const students = idSet_(ctx, 'STUDENTS', 1);
  const taskIdx = {}, formIdx = {};
  rowsOf_(ctx, 'TASK_LOG').forEach(function (r) {
    const t = clean_(col_(r, 20));
    if (t && t !== 'مهمة') return;
    const k = key_(col_(r, 3), col_(r, 5), col_(r, 6), col_(r, 7), col_(r, 19), col_(r, 9));
    (taskIdx[k] = taskIdx[k] || []).push(r.n);
  });
  rowsOf_(ctx, 'FORMS').forEach(function (r) {
    const k = key_(col_(r, 4), col_(r, 6), col_(r, 7), col_(r, 8), col_(r, 9), col_(r, 10));
    (formIdx[k] = formIdx[k] || []).push(r.n);
  });

  const stats = { task: 0, form: 0, manual: 0, ambiguous: 0 };
  const orphan = collector_(), bad = collector_(), over = collector_(), dup = collector_(), amb = collector_();
  const seen = {}, manualGroups = {};
  rowsOf_(ctx, 'DAILY').forEach(function (r) {
    const sid = clean_(col_(r, 1));
    if (!students[sid]) orphan.add(r.n, sid);
    const s = num_(col_(r, 11)), m = num_(col_(r, 12));
    if (isNaN(s) || isNaN(m) || m <= 0 || s < 0) bad.add(r.n, disp_(r, 11) + ' / ' + disp_(r, 12));
    else if (s > m) over.add(r.n, s + ' > ' + m);

    const k = key_(col_(r, 3), col_(r, 5), col_(r, 6), col_(r, 7), col_(r, 8), col_(r, 10));
    const t = taskIdx[k] || [], f = formIdx[k] || [];
    let target;
    if (t.length + f.length > 1) { stats.ambiguous++; amb.add(r.n, clean_(col_(r, 10)) + ' (' + t.length + ' تكليف، ' + f.length + ' نموذج)'); target = 'amb:' + k; }
    else if (t.length === 1) { stats.task++; target = 'T' + t[0]; }
    else if (f.length === 1) { stats.form++; target = 'F' + f[0]; }
    else { stats.manual++; target = 'M:' + k + '|' + clean_(col_(r, 9)); manualGroups[target] = true; }

    const dk = target + '|' + sid;
    if (seen[dk]) dup.add(r.n, sid + ' — ' + clean_(col_(r, 10)) + ' (مع صف ' + seen[dk] + ')'); else seen[dk] = r.n;
  });
  addIssue_(ctx, 'معلومة', 'Daily Follow up', 'ربط الرصد بالتقييمات', rowsOf_(ctx, 'DAILY').length, [],
    ['مطابق لتكليف: ' + stats.task, 'مطابق لنموذج: ' + stats.form, 'رصد يدوي بلا تكليف: ' + stats.manual +
     ' (سيُنشأ له ' + Object.keys(manualGroups).length + ' تقييم يدوي)', 'غامض: ' + stats.ambiguous],
    'المطابقة بالفصل + المادة + الترم + العنوان');
  flush_(ctx, amb, 'حرج', 'Daily Follow up', 'رصد يطابق أكثر من تكليف/نموذج', 'لا يمكن تحديد صاحبه آليًا — قرار يدوي');
  flush_(ctx, orphan, 'حرج', 'Daily Follow up', 'رصد لطالب غير موجود في Students', 'يذهب للحجر');
  flush_(ctx, bad, 'حرج', 'Daily Follow up', 'درجة أو عظمى غير صالحة', 'يذهب للحجر');
  flush_(ctx, over, 'حرج', 'Daily Follow up', 'الدرجة أكبر من العظمى', 'القاعدة ترفضه — يُصحَّح قبل النقل');
  flush_(ctx, dup, 'حرج', 'Daily Follow up', 'رصد مكرر لنفس الطالب ونفس التقييم', 'قرار: أي الصفين هو الصحيح');
}

// =====================================================================
// 12) التجميع — خط الأساس للتحقق النهائي: هل يطابق المخزّن إعادة الحساب؟
// =====================================================================
function checkAggregation_(ctx) {
  const weights = {};
  rowsOf_(ctx, 'GRADE_DIST').forEach(function (r) {
    const sub = clean_(col_(r, 3)), ev = clean_(col_(r, 1));
    (weights[sub] = weights[sub] || {})[ev] = num_(col_(r, 2)) || 0;
  });
  const sums = collector_();
  Object.keys(weights).forEach(function (sub) {
    const total = Object.keys(weights[sub]).reduce(function (s, k) { return s + weights[sub][k]; }, 0);
    if (Math.abs(total - 100) > 0.01) sums.add('', sub + ': ' + total);
  });
  flush_(ctx, sums, 'تحذير', 'Grade Distribution', 'مجموع نسب المادة لا يساوي 100', 'لا يمنع النقل — يؤثر على المجاميع');

  const groups = {};
  rowsOf_(ctx, 'DAILY').forEach(function (r) {
    const k = key_(col_(r, 1), col_(r, 7), col_(r, 8));
    const ev = clean_(col_(r, 9));
    const g = (groups[k] = groups[k] || {});
    const e = (g[ev] = g[ev] || { s: 0, m: 0 });
    e.s += num_(col_(r, 11)) || 0; e.m += num_(col_(r, 12)) || 0;
  });
  const header = ctx.sheets.GRADE_AGG ? ctx.sheets.GRADE_AGG : null;
  const evalNames = EVAL_AGG_COLS.map(function (c) { return SPEC.GRADE_AGG.cols[c][0]; });
  const diff = collector_(), hidden = collector_(), noAgg = collector_();
  const aggSeen = {};
  rowsOf_(ctx, 'GRADE_AGG').forEach(function (r) {
    const k = key_(col_(r, 1), col_(r, 8), col_(r, 3));
    aggSeen[k] = true;
    if (clean_(col_(r, 18)) === 'لا') hidden.add(r.n, k);
    const g = groups[k] || {}, w = weights[clean_(col_(r, 8))] || {};
    const off = [];
    EVAL_AGG_COLS.forEach(function (c, i) {
      const ev = evalNames[i], e = g[ev];
      const expected = !e ? '' : (e.m > 0 ? Math.round((e.s / e.m) * (w[ev] || 0) * 100) / 100 : 0);
      const stored = isBlank_(col_(r, c)) ? '' : num_(col_(r, c));
      if (expected === '' && stored === '') return;
      if (expected === '' || stored === '' || Math.abs(expected - stored) > 0.01) off.push(ev + ': ' + stored + '≠' + expected);
    });
    if (off.length) diff.add(r.n, k + ' → ' + off.join('، '));
  });
  Object.keys(groups).forEach(function (k) { if (!aggSeen[k]) noAgg.add('', k); });
  addIssue_(ctx, 'معلومة', 'Grade Aggregation', 'مطابقة التجميع المخزّن مع إعادة الحساب من الرصد',
    rowsOf_(ctx, 'GRADE_AGG').length, [], ['مختلف: ' + diff.count, 'مطابق: ' + (rowsOf_(ctx, 'GRADE_AGG').length - diff.count)],
    'هذا خط الأساس: بعد النقل يجب أن تطابق القاعدة الجديدة الأرقام المحسوبة');
  flush_(ctx, diff, 'تحذير', 'Grade Aggregation', 'مجموع مخزّن لا يطابق إعادة الحساب',
    'غالبًا تجميع لم يُحدَّث (خلل القفل المتداخل القديم). القاعدة الجديدة تحسب من الرصد مباشرة');
  flush_(ctx, noAgg, 'معلومة', 'Grade Aggregation', 'رصد بلا صف تجميع مقابل', 'سيظهر في الجديد تلقائيًا');
  flush_(ctx, hidden, 'معلومة', 'Grade Aggregation', 'نتائج مخفية بقرار الإدارة', 'تُنقل إلى grade_visibility');
}

// =====================================================================
// 13) ربط الحصص — أرقام صفوف: هل ما زالت تشير للمحتوى الصحيح؟
// =====================================================================
function checkPeriodLinks_(ctx) {
  const byRow = function (key) { const m = {}; rowsOf_(ctx, key).forEach(function (r) { m[r.n] = r; }); return m; };
  const tt = byRow('TIMETABLE'), tasks = byRow('TASK_LOG'), forms = byRow('FORMS'), enr = byRow('ENRICHMENT');
  const target = { 'مهمة': [tasks, 9], 'نموذج': [forms, 10], 'فيديو': [enr, 8], 'اثراء': [enr, 8] };
  const badSlot = collector_(), badRow = collector_(), mismatch = collector_(), badType = collector_();
  let ok = 0;
  rowsOf_(ctx, 'PERIOD_LINKS').forEach(function (r) {
    const slot = tt[num_(col_(r, 1))];
    if (!slot || clean_(col_(slot, 5)) !== 'جدول حصص') { badSlot.add(r.n, disp_(r, 1)); return; }
    const t = target[clean_(col_(r, 5))];
    if (!t) { badType.add(r.n, disp_(r, 5)); return; }
    const c = t[0][num_(col_(r, 6))];
    if (!c) { badRow.add(r.n, disp_(r, 5) + ' صف ' + disp_(r, 6)); return; }
    if (clean_(col_(c, t[1])) !== clean_(col_(r, 7))) { mismatch.add(r.n, '"' + clean_(col_(r, 7)) + '" ≠ "' + clean_(col_(c, t[1])) + '"'); return; }
    ok++;
  });
  addIssue_(ctx, 'معلومة', 'Period Links', 'روابط سليمة', ok, [], [], 'تُنقل بمفاتيح حقيقية');
  flush_(ctx, badSlot, 'تحذير', 'Period Links', 'الحصة المشار إليها لم تعد موجودة', 'رابط تالف — يذهب للحجر');
  flush_(ctx, badRow, 'تحذير', 'Period Links', 'صف المحتوى المشار إليه غير موجود', 'رابط تالف — يذهب للحجر');
  flush_(ctx, mismatch, 'تحذير', 'Period Links', 'رقم الصف يشير لمحتوى بعنوان مختلف (أُزيح بحذف صف)',
    'يُحاول النقل مطابقته بالعنوان، وإلا يذهب للحجر');
  flush_(ctx, badType, 'تحذير', 'Period Links', 'نوع محتوى غير معروف', '');
}

// =====================================================================
// 14) التحضير والسلوك والمشاهدات
// =====================================================================
function checkAttendanceBehavior_(ctx) {
  const students = idSet_(ctx, 'STUDENTS', 1);
  const weeks = ctx.weekKeys || {};
  const orphan = collector_(), badDay = collector_(), badPeriod = collector_(), noWeek = collector_(), dup = collector_(), badTime = collector_();
  const seen = {};
  rowsOf_(ctx, 'ATTENDANCE').forEach(function (r) {
    const sid = clean_(col_(r, 1));
    if (!students[sid]) orphan.add(r.n, sid);
    const d = dayKey_(col_(r, 6)), p = periodNo_(col_(r, 7));
    if (d === '') badDay.add(r.n, disp_(r, 6));
    if (p === null) badPeriod.add(r.n, disp_(r, 7));
    if (!weeks[clean_(col_(r, 4)) + '|' + clean_(col_(r, 5))]) noWeek.add(r.n, clean_(col_(r, 4)) + ' / ' + clean_(col_(r, 5)));
    if (!toDate_(col_(r, 14))) badTime.add(r.n, disp_(r, 14));
    const k = key_(sid, col_(r, 4), col_(r, 5), d, p);
    if (d !== '' && p !== null) { if (seen[k]) dup.add(r.n, 'مع صف ' + seen[k]); else seen[k] = r.n; }
  });
  flush_(ctx, orphan, 'حرج', 'Attendance and Absence', 'تحضير لطالب غير موجود', 'يذهب للحجر');
  flush_(ctx, badDay, 'حرج', 'Attendance and Absence', 'يوم لا يُفهم', 'يذهب للحجر');
  flush_(ctx, badPeriod, 'حرج', 'Attendance and Absence', 'حصة لا تُفهم', 'يذهب للحجر');
  flush_(ctx, noWeek, 'حرج', 'Attendance and Absence', 'أسبوع غير موجود في التقويم لهذا الترم', 'لا يمكن ربطه بأسبوع — يذهب للحجر');
  flush_(ctx, dup, 'حرج', 'Attendance and Absence', 'تحضير مكرر لنفس الطالب ونفس الحصة ونفس اليوم', 'القيد الفريد يرفض الثاني');
  flush_(ctx, badTime, 'تحذير', 'Attendance and Absence', 'وقت تسجيل لا يُفهم', 'مهل التعديل تعتمد عليه');

  const bOrphan = collector_();
  rowsOf_(ctx, 'BEHAVIOR').forEach(function (r) { const s = clean_(col_(r, 1)); if (!students[s]) bOrphan.add(r.n, s); });
  flush_(ctx, bOrphan, 'حرج', 'Behavior', 'سلوك لطالب غير موجود', 'يذهب للحجر');

  const titles = {};
  rowsOf_(ctx, 'TASK_LOG').forEach(function (r) { titles[key_(col_(r, 7), col_(r, 9))] = true; });
  rowsOf_(ctx, 'ENRICHMENT').forEach(function (r) { titles[key_(col_(r, 7), col_(r, 8))] = true; });
  const vOrphan = collector_(), vNoTarget = collector_();
  rowsOf_(ctx, 'STUDENT_VIEWS').forEach(function (r) {
    if (!students[clean_(col_(r, 1))]) vOrphan.add(r.n, clean_(col_(r, 1)));
    if (!titles[key_(col_(r, 7), col_(r, 10))]) vNoTarget.add(r.n, clean_(col_(r, 10)));
  });
  flush_(ctx, vOrphan, 'تحذير', 'Student_Views', 'مشاهدة لطالب غير موجود', 'تُهمل (سجل مشاهدة فقط)');
  flush_(ctx, vNoTarget, 'تحذير', 'Student_Views', 'مشاهدة لمحتوى لم يعد موجودًا', 'تُهمل (سجل مشاهدة فقط)');
}

// =====================================================================
// 15) الأعمدة ذات العناوين المقلوبة — هل البيانات تتبع موقع الكود أم العنوان؟
// =====================================================================
function checkSwappedColumns_(ctx) {
  const subjects = (ctx.settingsLists || {})['المواد'] || {};
  const evals = (ctx.settingsLists || {})['أنواع التقييم'] || {};
  const report = function (sheet, what, codeWay, headerWay, other, note) {
    const mixed = codeWay > 0 && headerWay > 0;
    addIssue_(ctx, mixed ? 'حرج' : 'معلومة', sheet, 'عمود مقلوب العنوان: ' + what, codeWay + headerWay + other, [],
      ['يتبع الكود: ' + codeWay, 'يتبع العنوان: ' + headerWay, 'غير محدد: ' + other],
      mixed ? 'مختلط! بعض الصفوف بمعنى وبعضها بمعنى آخر — يُنقل كل صف حسب محتواه، ويُراجع غير المحدد'
            : (headerWay > 0 ? 'البيانات تتبع العنوان لا الكود — سيُعتمد العنوان' : note));
  };

  // Forms: L/M (الكود: L فتح، M إغلاق)
  let a = 0, b = 0, o = 0;
  rowsOf_(ctx, 'FORMS').forEach(function (r) {
    const L = toDate_(col_(r, 12)), M = toDate_(col_(r, 13));
    if (L && M) { if (L < M) a++; else if (L > M) b++; else o++; } else o++;
  });
  report('Forms', 'L/M تاريخ الفتح والإغلاق', a, b, o, 'L فتح و M إغلاق كما يكتب الكود');

  // Form_Responses: J/K (الكود: J عظمى، K وقت)
  a = 0; b = 0; o = 0;
  rowsOf_(ctx, 'FORM_RESPONSES').forEach(function (r) {
    const J = col_(r, 10), K = col_(r, 11);
    if (!isNaN(num_(J)) && !isDate_(J) && toDate_(K)) a++; else if (isDate_(J) && !isNaN(num_(K))) b++; else o++;
  });
  report('Form_Responses', 'J/K الدرجة العظمى ووقت التسليم', a, b, o, 'J عظمى و K وقت كما يكتب الكود');

  // Attendance: I/J (الكود: I ملاحظة، J مادة)
  a = 0; b = 0; o = 0;
  rowsOf_(ctx, 'ATTENDANCE').forEach(function (r) {
    const I = clean_(col_(r, 9)), J = clean_(col_(r, 10));
    if (subjects[J] && !subjects[I]) a++; else if (subjects[I] && !subjects[J]) b++; else if (I || J) o++;
  });
  report('Attendance and Absence', 'I/J الملاحظة والمادة', a, b, o, 'I ملاحظة و J مادة كما يكتب الكود');

  // Behavior: K/L (الكود: K نوع الشخص، L غير معروف)
  const empNames = {};
  rowsOf_(ctx, 'EMPLOYEES').forEach(function (r) { empNames[clean_(col_(r, 3))] = true; });
  a = 0; b = 0; o = 0;
  const kValues = {};
  rowsOf_(ctx, 'BEHAVIOR').forEach(function (r) {
    const K = clean_(col_(r, 11)), L = clean_(col_(r, 12));
    if (K) kValues[K] = (kValues[K] || 0) + 1;
    if (empNames[K]) b++; else if (K && !L) a++; else if (K || L) o++;
  });
  report('Behavior', 'K نوع الشخص أم اسم المعلم', a, b, o, 'K نوع الشخص كما يكتب الكود');
  addIssue_(ctx, 'معلومة', 'Behavior', 'قيم العمود K', Object.keys(kValues).length, [],
    Object.keys(kValues).slice(0, 10).map(function (k) { return k + ': ' + kValues[k]; }), '');

  // Grade Distribution: A/B/C/D
  let aEval = 0, bNum = 0, cSub = 0, dEval = 0, dAny = 0;
  rowsOf_(ctx, 'GRADE_DIST').forEach(function (r) {
    if (evals[clean_(col_(r, 1))]) aEval++;
    if (!isNaN(num_(col_(r, 2)))) bNum++;
    if (subjects[clean_(col_(r, 3))]) cSub++;
    if (!isBlank_(col_(r, 4))) { dAny++; if (evals[clean_(col_(r, 4))]) dEval++; }
  });
  addIssue_(ctx, dAny && dEval > aEval ? 'حرج' : 'معلومة', 'Grade Distribution', 'تحقق أعمدة توزيع الدرجات',
    rowsOf_(ctx, 'GRADE_DIST').length, [],
    ['A نوع تقييم معروف: ' + aEval, 'B رقم: ' + bNum, 'C مادة معروفة: ' + cSub, 'D غير فارغ: ' + dAny + ' (منها نوع تقييم: ' + dEval + ')'],
    'الكود يقرأ A نوع التقييم، B النسبة، C المادة، ولا يقرأ D');

  // أعمدة إضافية: محتواها
  [['FORM_RESPONSES', 12, 'L (المستحقة)'], ['STUDENTS', 14, 'N (تم التعديل1)'], ['BEHAVIOR', 12, 'L'], ['AUDIT', 6, 'F']].forEach(function (x) {
    let filled = 0, numeric = 0;
    rowsOf_(ctx, x[0]).forEach(function (r) {
      const v = col_(r, x[1]);
      if (!isBlank_(v)) { filled++; if (!isNaN(num_(v))) numeric++; }
    });
    addIssue_(ctx, 'معلومة', SPEC[x[0]].name, 'محتوى العمود ' + x[2], filled || 1, [], ['غير فارغ: ' + filled, 'رقمي: ' + numeric],
      filled ? 'فيه بيانات — يُحفظ في النسخة الخام ويُقرَّر مصيره' : 'فارغ — لا شيء يضيع');
  });

  // Form_Questions: I/J أقسام
  let i = 0, j = 0;
  rowsOf_(ctx, 'FORM_QUESTIONS').forEach(function (r) { if (!isBlank_(col_(r, 9))) i++; if (!isBlank_(col_(r, 10))) j++; });
  addIssue_(ctx, 'معلومة', 'Form_Questions', 'الأقسام (I اسم القسم، J تعليماته)', i + j || 1, [], ['I غير فارغ: ' + i, 'J غير فارغ: ' + j], '');
}

// =====================================================================
// كتابة التقرير — في ملف جديد منفصل تمامًا عن المصدر
// =====================================================================
function writeReport_(ctx) {
  const tz = Session.getScriptTimeZone() || 'Asia/Riyadh';
  const stamp = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
  const out = SpreadsheetApp.create('تقرير فحص مِرقاة قبل النقل — ' + stamp);

  const issues = ctx.issues.slice().sort(function (x, y) {
    return (SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity]) || String(x.sheet).localeCompare(String(y.sheet));
  });
  const totals = severityTotals_(ctx);

  const summary = [
    ['تقرير فحص ما قبل النقل — مِرقاة', ''],
    ['الملف المفحوص', ctx.sourceName],
    ['وقت الفحص', stamp],
    ['مدة الفحص (ثانية)', Math.round((Date.now() - ctx.started) / 1000)],
    ['', ''],
    ['حرج (يجب حله أو تقريره قبل النقل)', totals['حرج']],
    ['تحذير (يحتاج مراجعة)', totals['تحذير']],
    ['معلومة', totals['معلومة']],
    ['', ''],
    ['الشيت', 'صفوف البيانات']
  ];
  Object.keys(SPEC).forEach(function (k) {
    summary.push([SPEC[k].name, ctx.sheets[k] ? ctx.sheets[k].rows.length : 'غير موجود']);
  });
  ctx.extraTabs.forEach(function (t) { summary.push([t.name + ' (غير معروف للكود)', Math.max(t.rows - 1, 0)]); });

  writeTab_(out, 'ملخص', summary, true);
  writeTab_(out, 'المشاكل', [['الخطورة', 'الشيت', 'الفحص', 'العدد', 'صفوف (عينة)', 'أمثلة', 'ماذا سيحدث / المطلوب']]
    .concat(issues.map(function (i) { return [i.severity, i.sheet, i.check, i.count, i.rows, i.samples, i.note]; })));
  writeTab_(out, 'العناوين', [['الشيت', 'العمود', 'العنوان في الشيت', 'المعنى في الكود', 'الحالة']].concat(ctx.headers));
  writeTab_(out, 'أنواع الأعمدة', [['الشيت', 'العمود', 'المعنى', 'النوع المتوقع', 'نص', 'رقم', 'منطقي', 'تاريخ', 'فارغ']].concat(ctx.profiles));
  writeTab_(out, 'القيم المرجعية', [['القائمة', 'القيمة', 'موجودة في Settings', 'مرات الاستخدام', 'أين']].concat(
    Object.keys(ctx.refs).map(function (k) { const r = ctx.refs[k]; return [r.list, r.value, r.inSettings ? 'نعم' : 'لا', r.count, Object.keys(r.where).join('، ')]; })
      .sort(function (x, y) { return String(x[0] + x[1]).localeCompare(String(y[0] + y[1])); })));

  const first = out.getSheets()[0];
  if (first.getName() === 'Sheet1' || first.getName() === 'الورقة1' || first.getName() === 'ورقة1') out.deleteSheet(first);
  return out.getUrl();
}

function writeTab_(ss, name, rows, isSummary) {
  const sh = ss.insertSheet(name);
  sh.setRightToLeft(true);
  if (!rows.length) return;
  const width = Math.max.apply(null, rows.map(function (r) { return r.length; }));
  const data = rows.map(function (r) { const x = r.slice(); while (x.length < width) x.push(''); return x.map(function (v) { return v === null || v === undefined ? '' : v; }); });
  const range = sh.getRange(1, 1, data.length, width);
  range.setNumberFormat('@');
  range.setValues(data.map(function (r) { return r.map(function (v) { return String(v); }); }));
  sh.getRange(1, 1, 1, width).setFontWeight('bold');
  if (!isSummary) sh.setFrozenRows(1);
}
