"""مولّد الدفعة الأولى من ملفات النقل (كل شيء عدا النماذج والرصد والتحضير وربط الحصص)."""
import collections, os, sys
from common import *

SRC = sys.argv[1] if len(sys.argv) > 1 else '/mnt/user-data/uploads/م_رقاة___نسخة_النقل_2026-10-01.xlsx'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/home/claude/mig/out'
ACADEMIC_YEAR = '1448هـ'

S = load(SRC)
def rows(k): return S[k]['rows'] if k in S else []
def c(row, n): return row[1][n - 1] if n - 1 < len(row[1]) else None

# =====================================================================
# القوائم المرجعية: الاسم المعتمد = كما هو في Settings حرفيًا
# =====================================================================
class RefList:
    def __init__(self, label):
        self.label, self.items, self.by_key, self.added = label, [], {}, []
    def add(self, v, from_settings=True):
        k = key(v)
        if not k or k in self.by_key:
            return
        name = raw(v) if from_settings else k
        self.by_key[k] = name
        self.items.append(name)
        if not from_settings:
            self.added.append(name)
    def name(self, v):
        k = key(v)
        if not k:
            return None
        if k not in self.by_key:
            self.add(v, from_settings=False)
        return self.by_key[k]

def settings_col(n):
    return [c(r, n) for r in rows('settings') if key(c(r, n))]

L = {k: RefList(k) for k in ['branch', 'stage', 'grade', 'section', 'subject', 'term', 'eval', 'att_status', 'beh_status']}
for v in settings_col(1): L['branch'].add(v)
for v in settings_col(2): L['stage'].add(v)
for v in settings_col(3): L['grade'].add(v)
for v in settings_col(4): L['section'].add(v)
for v in settings_col(5): L['subject'].add(v)
for v in settings_col(10): L['term'].add(v)
for v in settings_col(12) + settings_col(13): L['eval'].add(v)
for v in settings_col(9): L['att_status'].add(v)
for v in settings_col(11): L['beh_status'].add(v)
EXAM_ONLY = {key(v) for v in settings_col(13)} - {key(v) for v in settings_col(12)}

# مراحل الصفوف: من التركيبات الفعلية في البيانات، ثم بالاسم لما لم يُستخدم
grade_stage = {}
def note_combo(stage, grade):
    st, g = L['stage'].name(stage), L['grade'].name(grade)
    if st and g:
        grade_stage.setdefault(g, set()).add(st)

COMBO_SOURCES = [('students', 9, 10), ('subjectdistributionmatrix', 2, 3), ('classtimetable', 2, 3), ('tasklog', 4, 5),
                 ('enrichmentlog', 4, 5), ('forms', 5, 6), ('dailyfollowup', 4, 5), ('gradeaggregation', 5, 6)]
for sheet, sc, gc in COMBO_SOURCES:
    for r in rows(sheet):
        note_combo(c(r, sc), c(r, gc))

def stem(stage_name):
    s = ar_norm(stage_name)
    s = s[2:] if s.startswith('ال') else s
    return s[:-1] if s.endswith('ه') else s

for g in L['grade'].items:
    if g in grade_stage:
        continue
    cands = [st for st in L['stage'].items if stem(st) in ar_norm(g)]
    if len(cands) != 1:
        raise SystemExit(f'لا يمكن تحديد مرحلة الصف: {g} ← {cands}')
    grade_stage[g] = {cands[0]}
for g, sts in grade_stage.items():
    if len(sts) > 1:
        raise SystemExit(f'الصف {g} مستخدم في أكثر من مرحلة {sts} — يحتاج قرارًا')
GRADE_STAGE = {g: next(iter(sts)) for g, sts in grade_stage.items()}

def class_of(branch, stage, grade, section):
    b, g, sec = L['branch'].name(branch), L['grade'].name(grade), L['section'].name(section)
    if not (b and g and sec):
        return None
    return (b, GRADE_STAGE[g], g, sec)

CLASSES = []
CLASS_SET = set()
def note_class(cl):
    if cl and cl not in CLASS_SET:
        CLASS_SET.add(cl)
        CLASSES.append(cl)
CLASS_SOURCES = [('students', 8, 9, 10, 11), ('subjectdistributionmatrix', 1, 2, 3, 4), ('classtimetable', 1, 2, 3, 4),
                 ('tasklog', 3, 4, 5, 6), ('enrichmentlog', 3, 4, 5, 6), ('forms', 4, 5, 6, 7), ('dailyfollowup', 3, 4, 5, 6),
                 ('gradeaggregation', 4, 5, 6, 7), ('studentviews', 3, 4, 5, 6)]
for sheet, bc, sc, gc, secc in CLASS_SOURCES:
    for r in rows(sheet):
        if key(c(r, sc)) or key(c(r, gc)):
            note_class(class_of(c(r, bc), c(r, sc), c(r, gc), c(r, secc)))
CLASSES.sort(key=lambda x: (L['branch'].items.index(x[0]), L['grade'].items.index(x[2]), L['section'].items.index(x[3])))

def class_sql(cl):
    return f"migration.class_id({lit(cl[0])}, {lit(cl[1])}, {lit(cl[2])}, {lit(cl[3])})"

# المواد والأنواع المستخدمة في البيانات (تُضاف للقوائم إن لم تكن فيها)
for sheet, cols in [('subjectdistributionmatrix', [5]), ('classtimetable', [11]), ('tasklog', [7]), ('enrichmentlog', [7]),
                    ('forms', [8]), ('dailyfollowup', [7]), ('gradedistribution', [3]), ('gradeaggregation', [8])]:
    for r in rows(sheet):
        for col in cols:
            for v in (split_list(c(r, col)) if sheet == 'subjectdistributionmatrix' else [c(r, col)]):
                L['subject'].name(v)
for sheet, col in [('tasklog', 8), ('forms', 16), ('dailyfollowup', 9), ('gradedistribution', 1)]:
    for r in rows(sheet):
        L['eval'].name(c(r, col))
for sheet, col in [('tasklog', 19), ('enrichmentlog', 14), ('forms', 9), ('dailyfollowup', 8), ('schoolcalendar', 1),
                   ('attendanceandabsence', 4), ('behavior', 4), ('gradeaggregation', 3)]:
    for r in rows(sheet):
        L['term'].name(c(r, col))

# =====================================================================
# التقويم: تحويل (ترم + اسم أسبوع) أو (تاريخ) → صف التقويم
# =====================================================================
CAL = []
for r in rows('schoolcalendar'):
    CAL.append({'row': r[0], 'term': L['term'].name(c(r, 1)), 'period': raw(c(r, 2)), 'label': raw(c(r, 3)),
                'start': parse_date(c(r, 4)), 'end': parse_date(c(r, 5)), 'event': raw(c(r, 6)), 'color': raw(c(r, 7))})
def nested(e):
    return any(o is not e and o['start'] <= e['start'] and o['end'] >= e['end'] and
               (o['end'] > e['end'] or o['start'] < e['start']) for o in CAL if o['start'] and e['start'])
WEEKS = [e for e in CAL if e['start'] and e['end'] and not nested(e)]

def week_by_label(term, label):
    """الأسبوع بالترم واسمه: مطابقة نصية ثم بالرقم الترتيبي ('الثاني' = 2)."""
    t = L['term'].name(term)
    if not t or not key(label):
        return None
    for w in WEEKS:
        if w['term'] == t and ar_norm(w['label']) == ar_norm(label):
            return w
    n = ordinal(label)
    if n is None:
        return None
    hits = [w for w in WEEKS if w['term'] == t and ordinal(w['label']) == n]
    return hits[0] if len(hits) == 1 else None

def week_by_date(d):
    if not d:
        return None
    hits = [w for w in WEEKS if w['start'] <= d <= w['end']]
    return hits[0] if len(hits) == 1 else None

def cal_sql(e):
    return f"migration.calendar_id({lit(e['term'])}, {lit(e['start'])}::date, {lit(e['end'])}::date)"

# =====================================================================
# الملف 1: البنية المرجعية
# =====================================================================
def batch_reference():
    b = Batch('01_reference', 'الدفعة 1 — البنية المرجعية (الأعوام، الفروع، الصفوف، المواد، الفصول، النسب، الإعدادات)')
    b.comment('العام الدراسي والفصول الدراسية')
    b.sql(f"insert into public.academic_years (name, is_current) values ({lit(ACADEMIC_YEAR)}, true);"); b.count('public.academic_years')
    for i, t in enumerate(L['term'].items, 1):
        b.sql(f"insert into public.terms (academic_year_id, name, sort_order) values ((select id from public.academic_years where is_current), {lit(t)}, {i});")
        b.count('public.terms')

    b.comment('القوائم')
    for lst, table in [('branch', 'branches'), ('stage', 'stages'), ('section', 'sections'), ('subject', 'subjects')]:
        for i, v in enumerate(L[lst].items, 1):
            b.sql(f"insert into public.{table} (name, sort_order) values ({lit(v)}, {i});"); b.count('public.' + table)
    for i, g in enumerate(L['grade'].items, 1):
        b.sql(f"insert into public.grades (stage_id, name, sort_order) values (migration.stage_id({lit(GRADE_STAGE[g])}), {lit(g)}, {i});")
        b.count('public.grades')
    for i, v in enumerate(L['eval'].items, 1):
        cat = 'exam' if key(v) in EXAM_ONLY else 'continuous'
        b.sql(f"insert into public.eval_types (name, category, sort_order) values ({lit(v)}, {lit(cat)}, {i});"); b.count('public.eval_types')
    for i, v in enumerate(L['att_status'].items, 1):
        b.sql(f"insert into public.attendance_statuses (name, sort_order) values ({lit(v)}, {i});"); b.count('public.attendance_statuses')
    for i, v in enumerate(L['beh_status'].items, 1):
        b.sql(f"insert into public.behavior_statuses (name, sort_order) values ({lit(v)}, {i});"); b.count('public.behavior_statuses')

    b.comment(f'الفصول ({len(CLASSES)})')
    for cl in CLASSES:
        b.sql(f"insert into public.classes (branch_id, grade_id, section_id) values (migration.branch_id({lit(cl[0])}), "
              f"migration.grade_id({lit(cl[1])}, {lit(cl[2])}), migration.section_id({lit(cl[3])}));")
        b.count('public.classes')

    b.comment('Settings — كل صف قوائم، يُحاسب كمنقول')
    for r in rows('settings'):
        b.account('Settings', r[0], 'migrated', 'reference lists')

    b.comment('توزيع المواد (Subject Distribution Matrix)')
    for r in rows('subjectdistributionmatrix'):
        br, gr, sec = L['branch'].name(c(r, 1)), L['grade'].name(c(r, 3)), L['section'].name(c(r, 4))
        for sub in split_list(c(r, 5)):
            b.sql(f"insert into public.subject_matrix (branch_id, grade_id, section_id, subject_id, source_row) values ("
                  f"migration.branch_id({lit(br)}), migration.grade_id({lit(GRADE_STAGE[gr])}, {lit(gr)}), "
                  f"{('migration.section_id(' + lit(sec) + ')') if sec else 'null'}, migration.subject_id({lit(L['subject'].name(sub))}), {r[0]});")
            b.count('public.subject_matrix')
        b.account('Subject Distribution Matrix', r[0], 'migrated', 'subject_matrix')

    b.comment('نسب التقييم (Grade Distribution)')
    seen = set()
    for r in rows('gradedistribution'):
        sub, ev, w = L['subject'].name(c(r, 3)), L['eval'].name(c(r, 1)), num(c(r, 2))
        k = (sub, ev)
        if not sub or not ev or w is None or not (0 <= w <= 100) or k in seen:
            reason = 'نسبة مكررة لنفس المادة والنوع' if k in seen else 'صف ناقص أو نسبة غير صالحة'
            b.quarantine_row('Grade Distribution', r[0], 'A:C', f'{raw(c(r,1))} | {raw(c(r,2))} | {raw(c(r,3))}', reason)
            b.account('Grade Distribution', r[0], 'quarantined', note=reason)
            continue
        seen.add(k)
        b.sql(f"insert into public.grade_weights (subject_id, eval_type_id, weight, source_row) values ("
              f"migration.subject_id({lit(sub)}), migration.eval_type_id({lit(ev)}), {lit(w)}, {r[0]});")
        b.count('public.grade_weights')
        b.account('Grade Distribution', r[0], 'migrated', 'grade_weights')

    b.comment('الإعدادات (Settings الأعمدة N–R + ما كان في Script Properties)')
    sv = lambda n: [raw(x) for x in settings_col(n)]
    settings = [
        ('school_name', (sv(14) or ['مِرقاة'])[0], True),
        ('school_logo_url', (sv(15) or [''])[0], True),
        ('results_visible_grades', sv(16), False),
        ('weekly_grades_visibility', sv(17), False),
        ('show_exam_schedule', (sv(18) or [''])[0], False),
        ('calendar_visibility', 'all', False),   # كانت في Script Properties — القيمة الافتراضية للكود القديم
        ('exam_visibility', 'all', False),
    ]
    for k_, v, pub in settings:
        b.sql(f"insert into public.app_settings (key, value, is_public) values ({lit(k_)}, {jlit(v)}, {lit(pub)});")
        b.count('public.app_settings')
    return b

# =====================================================================
# الملف 2: الأشخاص والحسابات
# =====================================================================
def batch_people():
    b = Batch('02_people', 'الدفعة 1 — الطلاب والموظفون والصلاحيات والحسابات القديمة')
    b.comment('الطلاب')
    nat_seen = {}
    for r in rows('students'):
        code = raw(c(r, 1))
        cl = class_of(c(r, 8), c(r, 9), c(r, 10), c(r, 11))
        nat = key(c(r, 2)) or None
        if nat and nat in nat_seen:
            b.quarantine_row('Students', r[0], 'B', nat, f'رقم هوية مكرر مع صف {nat_seen[nat]} — نُقل الطالب بلا رقم هوية حتى يُراجَع')
            nat = None
        elif nat:
            nat_seen[nat] = r[0]
        bd_raw = c(r, 6)
        bd = parse_date(bd_raw)
        bd_text = None if bd or bd_raw is None else raw(bd_raw)
        if bd_text == '#VALUE!':
            b.quarantine_row('Students', r[0], 'F', bd_text, 'تاريخ ميلاد تالف في الشيت — يُراجَع من الأصل')
        enrolled = parse_ts(c(r, 16))
        b.sql("insert into public.students (code, national_id, name_ar, name_en, nationality, birth_date, birth_date_text, gender, "
              "class_id, fee_status, enrolled_at, is_edited, source_row) values ("
              + ', '.join([lit(code), lit(nat), lit(raw(c(r, 3))), lit(raw(c(r, 4))), lit(raw(c(r, 5))),
                           (lit(bd) + '::date') if bd else 'null', lit(bd_text), lit(raw(c(r, 7))),
                           class_sql(cl) if cl else 'null', lit(raw(c(r, 13))),
                           (lit(enrolled) + '::timestamptz') if enrolled else 'null',
                           lit(key(c(r, 15)) == 'نعم'), str(r[0])]) + ');')
        b.count('public.students')
        b.account('Students', r[0], 'migrated', 'students', code)

    b.comment('الموظفون')
    for r in rows('employees'):
        code = raw(c(r, 1))
        b.sql("insert into public.employees (code, national_id, name_ar, name_en, user_type, job_role, gender, is_edited, source_row) values ("
              + ', '.join([lit(code), lit(key(c(r, 2)) or None), lit(raw(c(r, 3))), lit(raw(c(r, 4))), lit(raw(c(r, 5))),
                           lit(raw(c(r, 6))), lit(raw(c(r, 7))), lit(key(c(r, 13)) == 'نعم'), str(r[0])]) + ');')
        b.count('public.employees')
        b.account('Employees', r[0], 'migrated', 'employees', code)

    b.comment('صلاحيات المعلمين — من حساب الدخول (Users) لأنه ما تعتمده جلسة النظام القديم فعليًا')
    for r in rows('users'):
        code = raw(c(r, 1))
        if key(c(r, 6)).lower() == 'admin':
            continue
        dims = [('branch_id', 'branch_id', 5, 'branch'), ('grade_id', None, 9, 'grade'),
                ('section_id', 'section_id', 10, 'section'), ('subject_id', 'subject_id', 8, 'subject')]
        for col, fn, idx, lst in dims:
            for v in split_list(c(r, idx)):
                name = L[lst].name(v)
                if lst == 'grade':
                    val = f"migration.grade_id({lit(GRADE_STAGE[name])}, {lit(name)})"
                else:
                    val = f"migration.{fn}({lit(name)})"
                b.sql(f"insert into public.staff_scope (employee_id, {col}) values (migration.employee_id({lit(code)}), {val});")
                b.count('public.staff_scope')

    b.comment('حسابات الدخول القديمة (تُنشأ حسابات Supabase Auth منها لاحقًا بأداة من الخادم)')
    for sheet, kind, title in [('users', 'staff', 'Users'), ('studentsusers', 'student', 'Students_Users')]:
        for r in rows(sheet):
            pw = raw(c(r, 4))
            hashed = bool(pw) and len(key(pw)) == 64 and all(ch in '0123456789abcdefABCDEF' for ch in key(pw))
            b.sql("insert into migration.legacy_accounts (kind, code, username, password_value, password_hashed, status_raw, user_type, "
                  "role_raw, full_name, scope_branch, scope_subject, scope_grades, scope_sections, source_sheet, source_row) values ("
                  + ', '.join([lit(kind), lit(raw(c(r, 1))), lit(raw(c(r, 3))), lit(pw), lit(hashed), lit(raw(c(r, 11))),
                               lit(raw(c(r, 6))), lit(raw(c(r, 7))), lit(raw(c(r, 2))), lit(raw(c(r, 5))), lit(raw(c(r, 8))),
                               lit(raw(c(r, 9))), lit(raw(c(r, 10))), lit(title), str(r[0])]) + ');')
            b.count('migration.legacy_accounts')
            b.account(title, r[0], 'migrated', 'migration.legacy_accounts', raw(c(r, 1)))
    return b

# =====================================================================
# الملف 3: التقويم والجدول
# =====================================================================
def batch_calendar():
    b = Batch('03_calendar_timetable', 'الدفعة 1 — التقويم الدراسي وجدول الحصص')
    b.comment('التقويم')
    for e in CAL:
        if not (e['term'] and e['start'] and e['end']) or e['end'] < e['start']:
            b.quarantine_row('School Calendar', e['row'], 'A:E', f"{e['term']} {e['start']} {e['end']}", 'صف تقويم ناقص أو تواريخه مقلوبة')
            b.account('School Calendar', e['row'], 'quarantined')
            continue
        b.sql("insert into public.calendar_entries (term_id, period_label, week_label, starts_on, ends_on, event, color, source_row) values ("
              + ', '.join([f"migration.term_id({lit(e['term'])})", lit(e['period']), lit(e['label']), lit(e['start']) + '::date',
                           lit(e['end']) + '::date', lit(e['event']), lit(e['color']), str(e['row'])]) + ');')
        b.count('public.calendar_entries')
        b.account('School Calendar', e['row'], 'migrated', 'calendar_entries')

    b.comment('جدول الحصص والاختبارات')
    emp_codes = {key(c(r, 1)) for r in rows('employees')}
    for r in rows('classtimetable'):
        cl = class_of(c(r, 1), c(r, 2), c(r, 3), c(r, 4))
        sub = L['subject'].name(c(r, 11))
        emp = key(c(r, 12))
        teacher = f"migration.employee_id({lit(emp)})" if emp in emp_codes else 'null'
        is_exam = key(c(r, 5)) != 'جدول حصص'
        if is_exam:
            d = parse_date(c(r, 8))
            if not (cl and sub and d):
                b.quarantine_row('Class Timetable', r[0], 'A:K', ' | '.join(str(raw(x)) for x in r[1][:11]), 'صف اختبار ناقص')
                b.account('Class Timetable', r[0], 'quarantined'); continue
            t = parse_time(c(r, 9))
            b.sql("insert into public.exam_schedule (class_id, subject_id, teacher_id, exam_date, starts_at, exam_period, color, source_row) values ("
                  + ', '.join([class_sql(cl), f"migration.subject_id({lit(sub)})", teacher, lit(d) + '::date',
                               (lit(t) + '::time') if t else 'null', lit(raw(c(r, 10))), lit(raw(c(r, 14))), str(r[0])]) + ');')
            b.count('public.exam_schedule')
            b.account('Class Timetable', r[0], 'migrated', 'exam_schedule'); continue
        day, per = day_no(c(r, 6)), period_no(c(r, 7))
        if not (cl and sub) or day is None or per is None:
            b.quarantine_row('Class Timetable', r[0], 'A:K', ' | '.join(str(raw(x)) for x in r[1][:11]), 'حصة ناقصة أو يومها/رقمها غير مفهوم')
            b.account('Class Timetable', r[0], 'quarantined'); continue
        t = parse_time(c(r, 9))
        b.sql("insert into public.timetable_slots (class_id, subject_id, teacher_id, day_of_week, period_no, starts_at, delivery_mode, color, source_row) values ("
              + ', '.join([class_sql(cl), f"migration.subject_id({lit(sub)})", teacher, str(day), str(per),
                           (lit(t) + '::time') if t else 'null', lit(raw(c(r, 15))), lit(raw(c(r, 14))), str(r[0])]) + ');')
        b.count('public.timetable_slots')
        b.account('Class Timetable', r[0], 'migrated', 'timetable_slots')
    return b

# =====================================================================
# الملف 4: التكاليف العادية، المحتوى، المشاهدات، السلوك، سجل النشاط
# =====================================================================
def due_ts(date_v, time_v):
    d = parse_date(date_v)
    if not d:
        return None
    t = parse_time(time_v) or '23:59'
    return f'{d} {t}:00+03'

def batch_activity():
    b = Batch('04_tasks_content', 'الدفعة 1 — التكاليف العادية، الفيديو والإثراء، المشاهدات، السلوك، سجل النشاط')
    emp_codes = {key(c(r, 1)) for r in rows('employees')}
    teacher = lambda v: f"migration.employee_id({lit(key(v))})" if key(v) in emp_codes else 'null'

    b.comment('Task Log: التكاليف العادية فقط. صفوف التكليف المرافقة لنموذج (لها Form_id) تُدمج مع نماذجها في دفعة النماذج')
    content_rows = []
    for r in rows('tasklog'):
        disp = key(c(r, 20))
        if disp in ('فيديو', 'اثراء'):
            content_rows.append(('Task Log', r, disp, 9, 10, 11, 13, 14, 15, 19)); continue
        if key(c(r, 21)):
            continue  # تُحاسب في دفعة النماذج كـ merged
        cl = class_of(c(r, 3), c(r, 4), c(r, 5), c(r, 6))
        sub, term, ev = L['subject'].name(c(r, 7)), L['term'].name(c(r, 19)), L['eval'].name(c(r, 8))
        mx = num(c(r, 12))
        if not (cl and sub and term) or not mx or mx <= 0:
            b.quarantine_row('Task Log', r[0], 'A:S', ' | '.join(str(raw(x)) for x in r[1][:19]), 'تكليف ناقص (فصل/مادة/ترم/درجة عظمى)')
            b.account('Task Log', r[0], 'quarantined'); continue
        pub = parse_ts(c(r, 13))
        wk = week_by_date(parse_date(c(r, 13)))
        due = due_ts(c(r, 14), c(r, 15))
        rec = parse_ts(c(r, 17))
        b.sql("insert into public.assessments (kind, class_id, subject_id, term_id, eval_type_id, teacher_id, title, description, link_url, "
              "max_score, published_at, due_at, week_id, grades_recorded_at, grades_edited, source_sheet, source_row) values ("
              + ', '.join(["'task'", class_sql(cl), f"migration.subject_id({lit(sub)})", f"migration.term_id({lit(term)})",
                           f"migration.eval_type_id({lit(ev)})" if ev else 'null', teacher(c(r, 1)),
                           lit(raw(c(r, 9))), lit(raw(c(r, 10))), lit(raw(c(r, 11))), lit(mx),
                           (lit(pub) + '::timestamptz') if pub else 'null', (lit(due) + '::timestamptz') if due else 'null',
                           cal_sql(wk) if wk else 'null', (lit(rec) + '::timestamptz') if rec else 'null',
                           lit(key(c(r, 18)) == 'نعم'), "'Task Log'", str(r[0])]) + ');')
        b.count('public.assessments')
        b.account('Task Log', r[0], 'migrated', 'assessments')

    b.comment('الفيديو والإثراء: Enrichment Log + صفوف الفيديو/الإثراء المتبقية في Task Log')
    for r in rows('enrichmentlog'):
        content_rows.append(('Enrichment Log', r, key(c(r, 15)), 8, 9, 10, 11, 12, 13, 14))
    content_index = collections.defaultdict(list)
    for sheet, r, disp, ti, de, li, pu, ex, tm, te in content_rows:
        cl = class_of(c(r, 3), c(r, 4), c(r, 5), c(r, 6))
        sub = L['subject'].name(c(r, 7))
        kind = {'فيديو': 'video', 'اثراء': 'enrichment'}.get(disp)
        if not (cl and sub and kind and key(c(r, ti))):
            b.quarantine_row(sheet, r[0], 'A:O', ' | '.join(str(raw(x)) for x in r[1][:15]), 'محتوى ناقص أو نوع عرض غير معروف')
            b.account(sheet, r[0], 'quarantined'); continue
        pub = parse_ts(c(r, pu))
        exp = due_ts(c(r, ex), c(r, tm))
        term = L['term'].name(c(r, te))
        b.sql("insert into public.content_items (kind, class_id, subject_id, term_id, teacher_id, title, description, url, published_at, "
              "expires_at, source_sheet, source_row) values ("
              + ', '.join([lit(kind), class_sql(cl), f"migration.subject_id({lit(sub)})",
                           f"migration.term_id({lit(term)})" if term else 'null', teacher(c(r, 1)),
                           lit(raw(c(r, ti))), lit(raw(c(r, de))), lit(raw(c(r, li))),
                           (lit(pub) + '::timestamptz') if pub else 'null', (lit(exp) + '::timestamptz') if exp else 'null',
                           lit(sheet), str(r[0])]) + ');')
        b.count('public.content_items')
        b.account(sheet, r[0], 'migrated', 'content_items')
        content_index[(cl, sub, key(c(r, ti)), kind)].append((sheet, r[0]))

    b.comment('المشاهدات (Student_Views): تُربط بالمحتوى بالفصل + المادة + العنوان + النوع')
    student_codes = {key(c(r, 1)) for r in rows('students')}
    seen_views = set()
    for r in rows('studentviews'):
        sid = key(c(r, 1))
        kind = {'فيديو': 'video', 'اثراء': 'enrichment'}.get(key(c(r, 8)))
        cl = class_of(c(r, 3), c(r, 4), c(r, 5), c(r, 6))
        hits = content_index.get((cl, L['subject'].name(c(r, 7)), key(c(r, 10)), kind), []) if cl else []
        if sid not in student_codes:
            b.quarantine_row('Student_Views', r[0], 'A:K', f'{sid} | {raw(c(r,8))} | {raw(c(r,10))}', 'مشاهدة لطالب غير موجود')
            b.account('Student_Views', r[0], 'quarantined', note='مشاهدة لطالب غير موجود'); continue
        if not hits:
            b.quarantine_row('Student_Views', r[0], 'A:K', f'{sid} | {raw(c(r,8))} | {raw(c(r,10))}', 'المحتوى غير موجود')
            b.account('Student_Views', r[0], 'quarantined', note='المحتوى غير موجود'); continue
        # النظام القديم يعتبر المشاهدة بالمادة + العنوان، فإن نُشر نفس المحتوى مرتين تُحسب المشاهدة للاثنين
        new_targets = [h for h in hits if (sid, h) not in seen_views]
        if not new_targets:
            b.account('Student_Views', r[0], 'merged', 'student_views', note='مشاهدة مكررة لنفس الطالب ونفس المحتوى'); continue
        for h in new_targets:
            seen_views.add((sid, h))
            b.sql(f"insert into public.student_views (student_id, content_item_id, source_row) values (migration.student_id({lit(sid)}), "
                  f"migration.content_id({lit(h[0])}, {h[1]}), {r[0]});")
            b.count('public.student_views')
        b.account('Student_Views', r[0], 'migrated', 'student_views',
                  note=('مرتبطة بـ ' + str(len(new_targets)) + ' محتوى بنفس العنوان') if len(new_targets) > 1 else None)

    b.comment('السلوك')
    for r in rows('behavior'):
        sid = key(c(r, 1))
        term = L['term'].name(c(r, 4))
        wk = week_by_label(c(r, 4), c(r, 5))
        day = day_no(c(r, 6))
        st = L['beh_status'].name(c(r, 7))
        if sid not in student_codes:
            b.quarantine_row('Behavior', r[0], 'A', sid, 'سلوك لطالب غير موجود'); b.account('Behavior', r[0], 'quarantined'); continue
        # لا يوجد وقت تسجيل في الشيت: يُستنتج من بداية الأسبوع + اليوم
        rec = 'now()'
        if wk and day is not None:
            rec = f"({lit(wk['start'])}::date + {day})::timestamp at time zone 'Asia/Riyadh'"
        b.sql("insert into public.behavior_records (student_id, term_id, week_id, day_of_week, status_id, score, note, recorded_by, "
              "recorder_type, recorded_at, source_row) values ("
              + ', '.join([f"migration.student_id({lit(sid)})", f"migration.term_id({lit(term)})" if term else 'null',
                           cal_sql(wk) if wk else 'null', str(day) if day is not None else 'null',
                           f"(select id from public.behavior_statuses where name = {lit(st)})" if st else 'null',
                           lit(num(c(r, 8))), lit(raw(c(r, 9))), teacher(c(r, 10)), lit(raw(c(r, 11))), rec, str(r[0])]) + ');')
        b.count('public.behavior_records')
        b.account('Behavior', r[0], 'migrated', 'behavior_records')

    b.comment('سجل النشاط القديم (Audit Log) — يُنقل كما هو، والعمود F يُحفظ داخل السجل نفسه')
    for r in rows('auditlog'):
        role_action = raw(c(r, 4)) or ''
        role, _, action = role_action.partition('|')
        action = action.strip() if action else role.strip()
        role = role.strip() if _ else None
        extra = {'العمود F': raw(c(r, 6))} if raw(c(r, 6)) else None
        ts = parse_ts(c(r, 1))
        b.sql("insert into public.audit_log (occurred_at, actor_code, actor_name, actor_role, action, details, new_data, source_row) values ("
              + ', '.join([(lit(ts) + '::timestamptz') if ts else 'now()', lit(raw(c(r, 2))), lit(raw(c(r, 3))), lit(role),
                           lit(action or '—'), lit(raw(c(r, 5))), jlit(extra) if extra else 'null', str(r[0])]) + ');')
        b.count('public.audit_log')
        b.account('Audit Log', r[0], 'migrated', 'audit_log')
    return b

# =====================================================================
if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    baseline = collections.Counter()
    for fn in [batch_reference, batch_people, batch_calendar, batch_activity]:
        b = fn()
        path = os.path.join(OUT, b.name + '.sql')
        with open(path, 'w', encoding='utf-8') as f:
            f.write(b.render(dict(baseline)))
        for t, n in b.expect.items(): baseline[t] += n
        for s_, n in b.accounted.items(): baseline['rowmap:' + s_] += n
        print(f'{b.name}: {sum(b.expect.values())} سجل، {len(b.quarantine)} في الحجر، {sum(b.accounted.values())} صف محاسَب')
        for q in b.quarantine: print('   حجر:', q[0], q[1], q[4])
    added = {k: v.added for k, v in L.items() if v.added}
    print('قيم أُضيفت للقوائم من البيانات (ليست في Settings):', added or 'لا شيء')
    print('الفصول:', len(CLASSES), '| مراحل الصفوف:', GRADE_STAGE)
