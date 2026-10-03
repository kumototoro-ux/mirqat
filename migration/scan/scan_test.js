// اختبار سكربت الفحص: شيت مصدر وهمي فيه مشاكل مزروعة عمدًا، ومحمي بحارس يرمي خطأ عند أي محاولة كتابة.
const fs = require('fs');
const vm = require('vm');

let failures = 0, passes = 0;
function ok(cond, msg) { if (cond) { passes++; console.log('PASS:', msg); } else { failures++; console.log('FAIL:', msg); } }

// ---------------------------------------------------------------- الحارس
const SOURCE_ACCESS_LOG = [];
function guard(obj, allowed, label) {
  return new Proxy(obj, {
    get(target, prop) {
      if (typeof prop === 'symbol' || prop === 'then') return target[prop];
      if (!allowed.includes(prop)) {
        SOURCE_ACCESS_LOG.push(label + '.' + String(prop));
        throw new Error('WRITE/UNSAFE ACCESS ON SOURCE: ' + label + '.' + String(prop));
      }
      return target[prop];
    }
  });
}

function fmtDisplay(v) {
  if (v instanceof Date) {
    const p = n => String(n).padStart(2, '0');
    return v.getFullYear() + '-' + p(v.getMonth() + 1) + '-' + p(v.getDate()) + ' ' + p(v.getHours()) + ':' + p(v.getMinutes());
  }
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v === null || v === undefined) return '';
  return String(v);
}

function makeSourceSheet(name, grid, formulas) {
  const lastRow = (() => { for (let r = grid.length - 1; r >= 0; r--) if (grid[r].some(v => v !== '' && v != null)) return r + 1; return 0; })();
  const lastCol = grid.reduce((m, row) => { let c = 0; row.forEach((v, i) => { if (v !== '' && v != null) c = i + 1; }); return Math.max(m, c); }, 0);
  const sheet = {
    getName: () => name,
    getLastRow: () => lastRow,
    getLastColumn: () => lastCol,
    getRange: (r, c, nr, nc) => {
      const cell = (i, j) => { const row = grid[r - 1 + i] || []; const v = row[c - 1 + j]; return v === undefined ? '' : v; };
      const build = f => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => f(i, j)));
      const range = {
        getValues: () => build(cell),
        getDisplayValues: () => build((i, j) => fmtDisplay(cell(i, j))),
        getFormulas: () => build((i, j) => (formulas && formulas[(r + i) + ':' + (c + j)]) || '')
      };
      return guard(range, ['getValues', 'getDisplayValues', 'getFormulas'], name + '.Range');
    }
  };
  return guard(sheet, ['getName', 'getLastRow', 'getLastColumn', 'getRange'], name);
}

// ---------------------------------------------------------------- البيانات المزروعة
const D = (s) => new Date(s);
const H64 = 'a'.repeat(64);
const pad = (row, n) => { const r = row.slice(); while (r.length < n) r.push(''); return r; };

const tabs = {
  'Settings': [
    ['branches', 'stages', 'grades', 'sections', 'subject', 'user_types', 'roles', 'account_statuses', 'attendance_statuses', 'terms', 'حالة السلوك', 'نوع التقييم المستمر', 'الاختبارات', 'اسم المدرسة', 'رابط', 'نتائج', 'درجات', 'اختبارات'],
    ['B1', 'S', 'G1', 'A', 'رياضيات', 'admin', 'role_admin', 'active', 'حاضر', 'الترم الأول', 'ممتاز', 'واجبات', 'اختبارات قصيرة', 'دار الهدى', '', '', '', ''],
    ['', '', 'G2', 'B', 'علوم', 'teacher', '', 'inactive', 'غائب', '', '', 'مشاركة', '', '', '', '', '', ''],
    ['', '', '', 'A ', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
  ],
  'Students': [
    ['Students_id', 'رقم الهوية', 'الاسم بالعربي', 'en', 'الجنسية', 'الميلاد', 'الجنس', 'branch', 'stages', 'grades', 'sections', 'subject', 'حالة الرسوم', 'تم التعديل1', 'تم التعديل', 'تاريخ التسجيل'],
    ['S1', '111', 'طالب 1', '', 'سعودي', D('2012-01-01'), 'ذكر', 'B1', 'S', 'G1', 'A', 'x', 'مسدد', '', '', ''],
    ['S2', '222', 'طالب 2', '', '', '', '', 'B1', 'S', 'G1', 'A', '', '', 'قديم', '', ''],
    ['S3', '333', 'طالب 3', '', '', '', '', 'B1', 'S', 'G1', 'B', '', '', '', '', ''],
    ['S1', '444', 'مكرر', '', '', '', '', 'B1', 'S', 'G1', 'A', '', '', '', '', ''],
    ['S5', '222', 'فرع خطأ', '', '', '', '', 'B9', 'S', 'G1', 'A', '', '', '', '', ''],
    ['S6', '', 'بلا شعبة', '', '', '', '', 'B1', 'S', 'G1', '', '', '', '', '', D('2026-09-15')]
  ],
  'Employees': [
    ['Employees_id', 'هوية', 'الاسم', 'en', 'user_types', 'role', 'الجنس', 'Branch', 'Stage', 'Grade', 'Section', 'Subject', 'تم'],
    ['E1', '9', 'معلم 1', '', 'teacher', '', '', 'B1', '', 'G1', 'A', 'رياضيات', ''],
    ['E2', '8', 'معلم 2', '', 'teacher', '', '', 'B1', '', 'G1', '', 'علوم', ''],
    ['E3', '7', 'معلم بلا حساب', '', 'teacher', '', '', '', '', '', '', '', '']
  ],
  'Users': [
    ['user_id', 'full_name', 'username', 'password', 'branch', 'user_type', 'role', 'subject', 'grades', 'sections', 'account_statuses'],
    ['E1', 'معلم 1', 'e1', H64, 'B1', 'teacher', 'role_teacher', 'رياضيات', 'G1', 'A', 'active'],
    ['E2', 'معلم 2', 'e2', 'plain123', 'B1', 'teacher', 'role_teacher', 'علوم', 'G1', '', 'active'],
    ['ADM', 'مدير', 'admin', H64, '', 'admin', 'role_admin', '', '', '', 'active']
  ],
  'Students_Users': [
    ['user_id', 'full_name', 'username', 'password', 'branch', 'user_type', 'role', 'subject', 'grades', 'sections', 'account_statuses'],
    ['S1', 'طالب 1', 's1', H64, 'B1', 'student', '', '', 'G1', 'A', 'active'],
    ['S2', 'طالب 2', 'S1 ', 'pw', 'B1', 'student', '', '', 'G2', 'A', 'active'],
    ['X9', 'يتيم', 'x9', '', 'B1', 'student', '', '', 'G1', 'A', 'inactive']
  ],
  'School Calendar': [
    ['terms', 'الفترة', 'الاسبوع', 'بداية', 'نهاية', 'الحدث', 'اللون'],
    ['الترم الأول', '', '1', D('2026-09-06'), D('2026-09-10'), '', ''],
    ['الترم الأول', '', '3', D('2026-09-20'), D('2026-09-24'), '', ''],
    ['الترم الأول', '', 'اليوم الوطني', D('2026-09-23'), D('2026-09-23'), 'إجازة', ''],
    ['الترم الأول', '', '4', 'غير مفهوم', D('2026-10-01'), '', '']
  ],
  'Class Timetable': [
    ['Branch', 'Stage', 'Grade', 'Section', 'النوع', 'Day', 'الحصة', 'تاريخ', 'الوقت', 'فترة', 'Subject', 'Id Emp', 'EmpName', 'اللون', 'نوع الحصة'],
    ['B1', 'S', 'G1', 'A', 'جدول حصص', 'الأحد', 'الاولى', '', '', '', 'رياضيات', 'E1', 'معلم 1', '', 'افتراضي'],
    ['B1', 'S', 'G1', 'A', 'جدول حصص', 'الاحد', 'الأولى', '', '', '', 'رياضيات', 'E1', 'معلم 1', '', ''],
    ['B1', 'S', 'G1', 'A', 'جدول حصص', 'السبت', '3', '', '', '', 'علوم', 'E99', '', '', ''],
    ['B1', 'S', 'G1', 'A', 'جدول اختبارات', '', '', D('2026-10-05'), '', 'الأولى', 'رياضيات', 'E1', '', '', '']
  ],
  'Task Log': [
    pad(['Employees_id', 'اسم المعلم', 'branch', 'stages', 'grades', 'sections', 'subject', 'نوع التقييم', 'اسم التكليف'], 21),
    pad(['E1', 'معلم 1', 'B1', 'S', 'G1', 'A', 'رياضيات', 'واجبات', 'واجب 1', '', '', 10, D('2026-09-07'), D('2026-09-09'), '', 'لا', '', '', 'الترم الأول', 'مهمة', ''], 21),
    pad(['E1', 'معلم 1', 'B1', 'S', 'G1', 'A', 'رياضيات', 'واجبات', 'واجب 1', '', '', 10, D('2026-09-21'), '', '', '', '', '', 'الترم الأول', 'مهمة', ''], 21),
    pad(['E1', 'معلم 1', 'B1', 'S', 'G1', 'A', 'رياضيات', '', 'فيديو قديم', '', 'http://x', '', '', '', '', '', '', '', 'الترم الأول', 'فيديو', ''], 21),
    pad(['E1', 'معلم 1', 'B1', 'S', 'G1,G2', 'A', 'رياضيات', 'واجبات', 'واجب جماعي', '', '', 'عشرة', '', '', '', '', '', '', 'الترم الأول', 'مهمة', 'FM404'], 21)
  ],
  'Enrichment Log': [
    pad(['Employees_id'], 15),
    pad(['E1', 'معلم 1', 'B1', 'S', 'G1', 'A', 'رياضيات', 'فيديو الكسور', '', 'http://v', D('2026-09-08'), '', '', 'الترم الأول', 'فيديو'], 15)
  ],
  'Forms': [
    pad(['Form_id', 'Employees_id', 'اسم المعلم', 'branch', 'stages', 'grades', 'sections', 'subject', 'terms', 'العنوان', 'الوصف', 'تاريخ الإغلاق', 'تاريخ الفتح', 'محاولات', 'الحالة', 'نوع التقييم', 'العمود 1', 'تمت تسوية الغياب'], 18),
    pad(['FM1', 'E1', 'معلم 1', 'B1', 'S', 'G1', 'A', 'رياضيات', 'الترم الأول', 'اختبار 1', '', D('2026-09-07 08:00'), D('2026-09-08 08:00'), 1, 'منشور', 'اختبارات قصيرة', '', ''], 18),
    pad(['FM2', 'E1', 'معلم 1', 'B1', 'S', 'G1', 'A', 'رياضيات', 'الترم الأول', 'اختبار 2', '', D('2026-09-10 08:00'), D('2026-09-09 08:00'), 'x', 'مغلق', 'اختبارات قصيرة', '', 'نعم'], 18),
    pad(['FM3', 'E1', 'معلم 1', 'B1', 'S', 'G1', 'A', 'رياضيات', 'الترم الأول', 'فارغ', '', '', '', 1, 'مسودة', '', '', ''], 18)
  ],
  'Form_Questions': [
    pad(['Question_id', 'Form_id', 'نص السؤال', 'نوع الاجابات', 'الخيارات', 'الخيار الصحيح', 'الدرجة', 'صورة السؤال', 'العمود 1'], 10),
    pad(['Q1', 'FM1', 'صح أم خطأ', 'اختيار من متعدد', 'True||False', true, 2, '', 'القسم 1', ''], 10),
    pad(['Q2', 'FM1', 'اختر', 'اختيار من متعدد', 'أ||ب||ج', 'ب', 3, '', 'القسم 1', 'تعليمات'], 10),
    pad(['Q3', 'FM9', 'يتيم', 'اختيار من متعدد', 'a||b', 'a', 1, '', '', ''], 10),
    pad(['Q4', 'FM2', 'مكرر', 'اختيار من متعدد', 'x||x', 'x', 1, '', '', ''], 10),
    pad(['Q5', 'FM2', 'بلا صحيح', 'اختيار من متعدد', 'y||w', 'z', 'ثلاث', '', '', ''], 10),
    pad(['Q1', 'FM2', 'معرف مكرر', 'اختيار من متعدد', 'm||n', 'm', 1, '', '', ''], 10)
  ],
  'Form_Responses': [
    ['Response_id', 'Form_id', 'Students_id', 'اسم الطالب', 'branch', 'grades', 'sections', 'الإجابات', 'الدرجة', 'وقت التسليم', 'الدرجة العظمى', 'المستحقة'],
    ['R1', 'FM1', 'S1', 'طالب 1', 'B1', 'G1', 'A', '{"Q1":"True","Q2":"ب"}', 5, 5, D('2026-09-07 09:00'), ''],
    ['R2', 'FM1', 'S2', 'طالب 2', 'B1', 'G1', 'A', '__AUTO_ABSENT__', 0, 5, D('2026-09-08 08:00'), ''],
    ['R3', 'FM1', 'S3', 'طالب 3', 'B1', 'G1', 'B', '{"Q1":"True","Q2":"د"}', 2, 5, D('2026-09-07 09:00'), 7],
    ['R4', 'FM9', 'S1', 'طالب 1', 'B1', 'G1', 'A', '{}', 0, 0, D('2026-09-07 09:00'), ''],
    ['R5', 'FM1', 'S77', 'مجهول', 'B1', 'G1', 'A', '{تالف', 0, 5, D('2026-09-07 09:00'), ''],
    ['R6', 'FM1', 'S1', 'طالب 1', 'B1', 'G1', 'A', '{"Q1":"True","Q2":"أ"}', 4, 5, D('2026-09-07 10:00'), '']
  ],
  'Daily Follow up': [
    pad(['Students_id'], 17),
    pad(['S1', 'طالب 1', 'B1', 'S', 'G1', 'A', 'رياضيات', 'الترم الأول', 'واجبات', 'واجب 1', 8, 10, D('2026-09-09')], 17),
    pad(['S1', 'طالب 1', 'B1', 'S', 'G1', 'A', 'رياضيات', 'الترم الأول', 'اختبارات قصيرة', 'اختبار 1', 5, 5, D('2026-09-07')], 17),
    pad(['S2', 'طالب 2', 'B1', 'S', 'G1', 'A', 'رياضيات', 'الترم الأول', 'مشاركة', 'مشاركة صفية', 3, 5, D('2026-09-08')], 17),
    pad(['S2', 'طالب 2', 'B1', 'S', 'G1', 'A', 'رياضيات', 'الترم الأول', 'مشاركة', 'مشاركة صفية', 4, 5, D('2026-09-09')], 17),
    pad(['S3', 'طالب 3', 'B1', 'S', 'G1', 'B', 'رياضيات', 'الترم الأول', 'واجبات', 'واجب ب', 12, 10, D('2026-09-09')], 17),
    pad(['S77', 'مجهول', 'B1', 'S', 'G1', 'A', 'رياضيات', 'الترم الأول', 'واجبات', 'واجب ج', 'ممتاز', 10, D('2026-09-09')], 17)
  ],
  'Grade Aggregation': [
    pad(['Students_id'], 18),
    pad(['S1', 'طالب 1', 'الترم الأول', 'B1', 'S', 'G1', 'A', 'رياضيات', '', '', '', '', 30, '', '', '', '', 'لا'], 18),
    pad(['S2', 'طالب 2', 'الترم الأول', 'B1', 'S', 'G1', 'A', 'رياضيات', 5, '', '', '', '', '', '', '', '', 'نعم'], 18)
  ],
  'Grade Distribution': [
    ['التقييم', 'الدرجة', 'المادة', 'نوع التقييم'],
    ['واجبات', 20, 'رياضيات', ''],
    ['اختبارات قصيرة', 30, 'رياضيات', '']
  ],
  'Subject Distribution Matrix': [
    ['branch', 'stages', 'grades', 'sections', 'subject'],
    ['B1', 'S', 'G1', '', 'رياضيات,علوم']
  ],
  'Period Links': [
    ['Timetable_row', 'Employees_id', 'terms', 'الاسبوع', 'نوع المحتوى', 'رقم صف المحتوى', 'عنوان المحتوى', 'تاريخ الربط'],
    [2, 'E1', 'الترم الأول', '1', 'مهمة', 2, 'واجب 1', D('2026-09-06')],
    [2, 'E1', 'الترم الأول', '1', 'مهمة', 3, 'عنوان قديم أُزيح', D('2026-09-06')],
    [99, 'E1', 'الترم الأول', '1', 'فيديو', 2, 'فيديو الكسور', D('2026-09-06')],
    [2, 'E1', 'الترم الأول', '1', 'نموذج', 2, 'اختبار 1', D('2026-09-06')],
    [2, 'E1', 'الترم الأول', '1', 'اثراء', 50, 'محذوف', D('2026-09-06')]
  ],
  'Attendance and Absence': [
    pad(['Students_id'], 15),
    pad(['S1', 'طالب 1', 'B1', 'الترم الأول', '1', 'الأحد', 'الاولى', 'حاضر', '', 'رياضيات', 'E1', 'معلم 1', 'معلم', D('2026-09-06 08:00'), ''], 15),
    pad(['S1', 'طالب 1', 'B1', 'الترم الأول', '1', 'الاحد', '1', 'غائب', '', 'رياضيات', 'E1', 'معلم 1', 'معلم', D('2026-09-06 09:00'), ''], 15),
    pad(['S2', 'طالب 2', 'B1', 'الترم الأول', '9', 'الاثنين', 'الثانية', 'حاضر', 'رياضيات', 'ملاحظة', 'E1', 'معلم 1', 'معلم', D('2026-09-07 08:00'), ''], 15)
  ],
  'Behavior': [
    pad(['Students_id'], 12),
    ['S1', 'طالب 1', 'B1', 'الترم الأول', '1', 'الأحد', 'ممتاز', 5, '', 'E1', 'معلم', ''],
    ['S99', 'مجهول', 'B1', 'الترم الأول', '1', 'الأحد', 'ممتاز', 5, '', 'E1', 'معلم 1', 'معلم']
  ],
  'Student_Views': [
    pad(['Students_id'], 11),
    ['S1', 'طالب 1', 'B1', 'S', 'G1', 'A', 'رياضيات', 'فيديو', '', 'فيديو الكسور', 'نعم'],
    ['S1', 'طالب 1', 'B1', 'S', 'G1', 'A', 'رياضيات', 'مهمة', '', 'محذوف', 'نعم']
  ],
  'Audit Log': [
    ['Timestamp', 'EmpId', 'EmpName', 'Role, Action', 'Details', 'العمود 1'],
    [D('2026-09-01'), 'E1', 'معلم 1', 'role_teacher | دخول', '', '']
  ],
  'Old Data': [['x', 'y'], ['1', '2']]
};

const sourceTabs = Object.keys(tabs).map(n => makeSourceSheet(n, tabs[n], n === 'Students' ? { '2:12': '=X()' } : null));
const sourceSS = guard({ getSheets: () => sourceTabs, getName: () => 'نسخة اختبار' }, ['getSheets', 'getName'], 'Spreadsheet');

// ---------------------------------------------------------------- التقرير (وجهة الكتابة الوحيدة المسموحة)
const report = { tabs: {}, deleted: [] };
function makeReportSheet(name) {
  const s = { name, data: null,
    getName: () => name, setRightToLeft: () => {}, setFrozenRows: () => {},
    getRange: () => ({ setNumberFormat: () => {}, setValues: v => { s.data = v; }, setFontWeight: () => {} }) };
  return s;
}
const reportSS = {
  sheets: [makeReportSheet('Sheet1')],
  insertSheet(name) { const s = makeReportSheet(name); this.sheets.push(s); report.tabs[name] = s; return s; },
  getSheets() { return this.sheets; },
  deleteSheet(s) { report.deleted.push(s.name); this.sheets = this.sheets.filter(x => x !== s); },
  getUrl: () => 'https://docs.google.com/spreadsheets/d/REPORT'
};

const sandbox = {
  SpreadsheetApp: {
    openById: id => { if (id !== 'COPY_ID_0000000000000000000000000') throw new Error('wrong id: ' + id); return sourceSS; },
    create: () => reportSS
  },
  Session: { getScriptTimeZone: () => 'Asia/Riyadh' },
  Utilities: { formatDate: () => '2026-10-01 20:00' },
  Logger: { log: m => console.log('  [log]', m) },
  console
};
vm.createContext(sandbox);
let code = fs.readFileSync(__dirname + '/MigrationScan.js', 'utf8').replace("'1muQ5iBDJhmrYt7EULjlwX63ju9ddlAQa9b2E8v-kHkA'", "'ا' + 'COPY_ID_0000000000000000000000000' + 'هنا'");
vm.runInContext(code + '\n;this.__run = runMigrationScan;', sandbox);
const url = sandbox.__run();
vm.runInContext('this.__ex = extractSpreadsheetId_;', sandbox);
ok(sandbox.__ex('ا1muQ5iBDJhmrYt7EULjlwX63ju9ddlAQa9b2E8v-kHkA') === '1muQ5iBDJhmrYt7EULjlwX63ju9ddlAQa9b2E8v-kHkA', 'المعرّف يُستخرج رغم الحرف العربي الزائد');
ok(sandbox.__ex('https://docs.google.com/spreadsheets/d/1muQ5iBDJhmrYt7EULjlwX63ju9ddlAQa9b2E8v-kHkA/edit?gid=0#gid=0') === '1muQ5iBDJhmrYt7EULjlwX63ju9ddlAQa9b2E8v-kHkA', 'المعرّف يُستخرج من الرابط الكامل');
ok(sandbox.__ex('ضع_معرف_نسخة_الشيت_هنا') === '', 'النص الافتراضي بلا معرّف يُرفض برسالة واضحة');

// ---------------------------------------------------------------- التحقق
const issues = report.tabs['المشاكل'].data.slice(1).map(r => ({ sev: r[0], sheet: r[1], check: r[2], count: Number(r[3]), rows: r[4], samples: r[5] }));
const find = (sheet, part) => issues.filter(i => i.sheet.includes(sheet) && i.check.includes(part));
const one = (sheet, part) => find(sheet, part)[0];
const has = (sheet, part, count, sev) => {
  const i = one(sheet, part);
  ok(i && (count === undefined || i.count === count) && (!sev || i.sev === sev),
     `${sheet} ← ${part}` + (count !== undefined ? ` = ${count}` : '') + (i ? `  (وُجد: ${i.count} ${i.sev})` : '  (لم يوجد)'));
};

ok(SOURCE_ACCESS_LOG.length === 0, 'لا أي محاولة كتابة أو وصول غير مسموح على الشيت المصدر');
ok(issues.every(i => !i.check.includes('تعذّر تنفيذ')), 'كل الفحوص اكتملت بلا خطأ داخلي: ' + issues.filter(i => i.check.includes('تعذّر')).map(i => i.samples).join(' | '));
ok(url.includes('REPORT'), 'رابط التقرير أُرجع');
ok(report.deleted.includes('Sheet1'), 'الورقة الافتراضية الفارغة حُذفت من التقرير');
ok(['ملخص', 'المشاكل', 'العناوين', 'أنواع الأعمدة', 'القيم المرجعية'].every(t => report.tabs[t]), 'التقرير فيه التبويبات الخمسة');

// الخصوصية
const allText = JSON.stringify(Object.values(report.tabs).map(t => t.data));
ok(!allText.includes('plain123') && !allText.includes(H64) && !allText.includes('"pw"'), 'لا كلمات مرور في التقرير');
ok(!allText.includes('2012-01-01'), 'لا تواريخ ميلاد في التقرير');
ok(!/["⟂ ]111["⟂ ]|"444"/.test(allText), 'لا أرقام هوية في التقرير');

// الجرد
has('Old Data', 'تبويب لا يعرفه الكود', 1, 'حرج');
has('Students', 'عمود N', 1, 'حرج');
has('Form_Responses', 'عمود L', 1, 'حرج');
has('Students', 'معادلات', 1);
ok(report.tabs['العناوين'].data.some(r => r[0] === 'Forms' && r[1] === 'L' && r[4] === 'العنوان مختلف'), 'العناوين: Forms L مكتشف كعنوان مختلف');

// الطلاب والحسابات
has('Students', 'Students_id مكرر', 1, 'حرج');
has('Students', 'رقم هوية طالب مكرر', 1);
has('Students', 'بلا فرع أو مرحلة', 1);
has('Students', 'قائمة الفروع', 1);
has('Students_Users', 'username مكرر', 1, 'حرج');
has('Students_Users', 'لا يقابله طالب', 1, 'حرج');
has('Students_Users', 'فصل الطالب في حسابه يختلف', 1);
has('Students_Users', 'بلا كلمة مرور', 1);
has('Users', 'معلم ناقص الصلاحيات', 1, 'حرج');
ok(one('Users', 'ناقص الصلاحيات').samples.includes('الشعبة'), 'نقص الصلاحية يسمّي البعد الناقص (الشعبة)');
has('Users', 'لا يقابله موظف', 1);
has('Employees', 'موظف بلا حساب', 1);
ok(one('Users', 'حالة كلمات المرور').samples.includes('نص صريح: 1'), 'كلمات المرور: صريحة 1 في Users');

// المراجع
has('Settings', 'متشابهة في قائمة الشعب', undefined);
ok(report.tabs['القيم المرجعية'].data.some(r => r[1] === 'علوم' && r[4].includes('Subject Distribution Matrix')), 'قوائم المواد المفصولة بفواصل تُفكّك (علوم من المصفوفة)');

// التقويم والجدول
has('School Calendar', 'لا يُفهم', 1, 'حرج');
has('School Calendar', 'محتواة داخل أسابيع', 1);
has('Class Timetable', 'يوم لا يُفهم', 1, 'حرج');
has('Class Timetable', 'نفس المادة مكررة', 1, 'حرج');
has('Class Timetable', 'معرّف معلم غير موجود', 1);

// التكاليف والنماذج
has('Task_Log', 'بنفس العنوان', 1);
has('Task_Log', 'لأكثر من فرع', 1, 'حرج');
has('Task_Log', 'نموذج غير موجود', 1);
has('Task_Log', 'قيمة غير رقمية', 1);
has('Forms', 'تاريخ الإغلاق قبل', 1, 'حرج');
has('Forms', 'نماذج بلا أي سؤال', 1);
has('Forms', 'عدد محاولات غير صالح', 1);

// الأسئلة
has('Form_Questions', 'Question_id مكرر', 1, 'حرج');
has('Form_Questions', 'لنموذج غير موجود', 1, 'حرج');
has('Form_Questions', 'خيار مكرر', 1, 'حرج');
has('Form_Questions', 'تحوّلت لقيمة منطقية', 1);
has('Form_Questions', 'باختلاف حالة الأحرف', 1);
has('Form_Questions', 'لا تطابق أي خيار', 1, 'حرج');
has('Form_Questions', 'درجة سؤال غير رقمية', 1);

// الإجابات
has('Form_Responses', 'لنموذج غير موجود', 1, 'حرج');
has('Form_Responses', 'لطالب غير موجود', 1, 'حرج');
has('Form_Responses', 'تالف', 1, 'حرج');
has('Form_Responses', 'لا تطابق أي خيار حالي', 1);
has('Form_Responses', 'تختلف عن إعادة التصحيح', 1);
has('Form_Responses', 'محاولات أكثر من المسموح', 1);
ok(one('Form_Responses', 'عدد الإجابات').samples.includes('صفر تلقائي: 1'), 'عدّ الأصفار التلقائية');

// الرصد والتجميع
has('Daily Follow up', 'يطابق أكثر من تكليف', 1, 'حرج');
has('Daily Follow up', 'رصد مكرر', 1, 'حرج');
has('Daily Follow up', 'أكبر من العظمى', 1, 'حرج');
has('Daily Follow up', 'غير صالحة', 1, 'حرج');
has('Daily Follow up', 'لطالب غير موجود', 1, 'حرج');
const link = one('Daily Follow up', 'ربط الرصد');
ok(link.samples.includes('مطابق لنموذج: 1') && link.samples.includes('غامض: 1') && link.samples.includes('سيُنشأ له 3 تقييم يدوي'),
   'ربط الرصد: نموذج 1، غامض 1، 3 تقييمات يدوية — ' + link.samples);
has('Grade Distribution', 'لا يساوي 100', 1);
has('Grade Aggregation', 'لا يطابق إعادة الحساب', 2);
has('Grade Aggregation', 'مخفية', 1);

// ربط الحصص
has('Period Links', 'روابط سليمة', 2);
has('Period Links', 'بعنوان مختلف', 1);
has('Period Links', 'لم تعد موجودة', 1);
has('Period Links', 'غير موجود', 1);

// التحضير والسلوك والمشاهدات
has('Attendance', 'تحضير مكرر', 1, 'حرج');
has('Attendance', 'أسبوع غير موجود', 1, 'حرج');
has('Behavior', 'لطالب غير موجود', 1, 'حرج');
has('Student_Views', 'لم يعد موجودًا', 1);

// الأعمدة المقلوبة
const f = one('Forms', 'L/M');
ok(f && f.sev === 'حرج' && f.samples.includes('يتبع الكود: 1') && f.samples.includes('يتبع العنوان: 1'), 'Forms L/M: مختلط مكتشف — ' + (f && f.samples));
const att = one('Attendance', 'I/J');
ok(att && att.sev === 'حرج', 'التحضير I/J: مختلط مكتشف — ' + (att && att.samples));
const fr = one('Form_Responses', 'J/K');
ok(fr && fr.sev === 'معلومة' && fr.samples.includes('يتبع الكود: 6'), 'الإجابات J/K: كلها تتبع الكود — ' + (fr && fr.samples));
const beh = one('Behavior', 'K نوع الشخص');
ok(beh && beh.sev === 'حرج', 'السلوك K: مختلط (نوع شخص / اسم معلم) — ' + (beh && beh.samples));

console.log(`\n${passes} نجح، ${failures} فشل`);
process.exit(failures ? 1 : 0);
