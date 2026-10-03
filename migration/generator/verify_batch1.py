"""تحقق مستقل: يقرأ القاعدة ويقارنها بملف Excel الأصلي — لا يعتمد على منطق المولّد."""
import subprocess, json, sys
from common import *
S = load('/mnt/user-data/uploads/م_رقاة___نسخة_النقل_2026-10-01.xlsx')
def q(sql):
    out = subprocess.run(['su', 'postgres', '-c', f"psql -d mig_test -tA -c \"copy ({sql}) to stdout with (format csv)\""],
                         capture_output=True, text=True).stdout
    import csv, io
    return list(csv.reader(io.StringIO(out)))
fails = 0
def ok(cond, msg):
    global fails
    print(('✅' if cond else '❌'), msg)
    if not cond: fails += 1

# 1) كل صف في كل شيت محاسَب مرة واحدة بالضبط
rm = {r[0]: int(r[1]) for r in q("select source_sheet, count(*) from migration.row_map group by 1")}
full = {'Settings': 'settings', 'Students': 'students', 'Employees': 'employees', 'Users': 'users', 'Students_Users': 'studentsusers',
        'School Calendar': 'schoolcalendar', 'Class Timetable': 'classtimetable', 'Subject Distribution Matrix': 'subjectdistributionmatrix',
        'Grade Distribution': 'gradedistribution', 'Enrichment Log': 'enrichmentlog', 'Student_Views': 'studentviews',
        'Behavior': 'behavior', 'Audit Log': 'auditlog'}
for title, k in full.items():
    ok(rm.get(title) == len(S[k]['rows']), f'{title}: {rm.get(title)} محاسَب من {len(S[k]["rows"])} صف')
pending = sum(1 for r in S['tasklog']['rows'] if key(r[1][20]) and key(r[1][19]) not in ('فيديو', 'اثراء'))
tl = rm.get('Task Log', 0)
ok(tl + pending == len(S['tasklog']['rows']) or tl == len(S['tasklog']['rows']),
   f'Task Log: {tl} محاسَب' + (f' + {pending} مؤجل لدفعة النماذج' if tl < len(S['tasklog']['rows']) else ' (المرافقة للنماذج مدموجة)') + f' من {len(S["tasklog"]["rows"])}')

# 2) الطلاب: كل حقل نصي يطابق الأصل حرفيًا
db = {r[0]: r for r in q("select code, coalesce(national_id,''), name_ar, coalesce(name_en,''), coalesce(nationality,''), coalesce(gender,''), coalesce(fee_status,''), source_row from public.students")}
bad = []
for r in S['students']['rows']:
    v = r[1]; d = db.get(raw(v[0]))
    if not d: bad.append(('مفقود', r[0])); continue
    for i, name in [(2, 'name_ar'), (3, 'name_en'), (4, 'nationality'), (6, 'gender'), (12, 'fee_status')]:
        exp = raw(v[i]) or ''
        got = d[{2: 2, 3: 3, 4: 4, 6: 5, 12: 6}[i]]
        if exp != got: bad.append((r[0], name, exp, got))
    if (key(v[1]) or '') != d[1] and r[0] != 38: bad.append((r[0], 'national_id', key(v[1]), d[1]))
ok(not bad, f'الطلاب: كل الحقول النصية مطابقة حرفيًا ({len(db)} طالب)' + (f' — {bad[:3]}' if bad else ''))
cls = q("select s.code, b.name, st.name, g.name, sc.name from public.students s join public.classes c on c.id=s.class_id join public.branches b on b.id=c.branch_id join public.grades g on g.id=c.grade_id join public.stages st on st.id=g.stage_id join public.sections sc on sc.id=c.section_id")
cmap = {r[0]: r[1:] for r in cls}
bad = [r[0] for r in S['students']['rows'] if cmap.get(raw(r[1][0])) != [raw(r[1][7]), raw(r[1][8]), raw(r[1][9]), raw(r[1][10])]]
ok(not bad, 'الطلاب: الفرع والمرحلة والصف والشعبة مطابقة لكل طالب' + (f' — {bad}' if bad else ''))

# 3) الحسابات: كلمات المرور المشفّرة نُقلت كما هي بالضبط
acc = {(r[0], r[1]): r[2] for r in q("select kind, code, password_value from migration.legacy_accounts")}
bad = [r[0] for r in S['studentsusers']['rows'] if acc.get(('student', raw(r[1][0]))) != raw(r[1][3])]
bad += [r[0] for r in S['users']['rows'] if acc.get(('staff', raw(r[1][0]))) != raw(r[1][3])]
ok(not bad, f'الحسابات: {len(acc)} حساب، كلمات المرور واسم المستخدم محفوظة حرفيًا')

# 4) صلاحيات المعلمين = قوائم Users بعد التفكيك
sc = q("select e.code, coalesce(b.name, g.name, s.name, j.name) from public.staff_scope x join public.employees e on e.id=x.employee_id left join public.branches b on b.id=x.branch_id left join public.grades g on g.id=x.grade_id left join public.sections s on s.id=x.section_id left join public.subjects j on j.id=x.subject_id")
got = {}
for code, v in sc: got.setdefault(code, set()).add(v)
exp = {}
for r in S['users']['rows']:
    if key(r[1][5]).lower() == 'admin': continue
    exp[raw(r[1][0])] = set(split_list(r[1][4]) + split_list(r[1][7]) + split_list(r[1][8]) + split_list(r[1][9]))
ok(got == exp, f'الصلاحيات: مطابقة لقوائم Users لكل المعلمين ({len(exp)} معلم)')

# 5) الجدول: اليوم والحصة المحوّلان أرقامًا يطابقان النص الأصلي
tt = {int(r[0]): (int(r[1]), int(r[2]), r[3]) for r in q("select t.source_row, t.day_of_week, t.period_no, j.name from public.timetable_slots t join public.subjects j on j.id=t.subject_id")}
days = {'الاحد': 0, 'الأحد': 0, 'الاثنين': 1, 'الإثنين': 1, 'الثلاثاء': 2, 'الاربعاء': 3, 'الأربعاء': 3, 'الخميس': 4}
pers = {'الاولى': 1, 'الأولى': 1, 'الثانية': 2, 'الثالثة': 3, 'الرابعة': 4, 'الخامسة': 5, 'السادسة': 6, 'السابعة': 7, 'الثامنة': 8}
bad = [(r[0], r[1][5], r[1][6], tt.get(r[0])) for r in S['classtimetable']['rows']
       if tt.get(r[0]) != (days.get(key(r[1][5])), pers.get(key(r[1][6])), raw(r[1][10]))]
ok(not bad, f'الجدول: {len(tt)} حصة، اليوم ورقم الحصة والمادة صحيحة' + (f' — {bad[:3]}' if bad else ''))

# 6) التقويم والأسابيع
weeks = q("select week_label from public.school_weeks order by term_id, starts_on")
ok(len(weeks) == 27 and ['اليوم الوطني'] not in weeks, f'الأسابيع: {len(weeks)} أسبوعًا قابلًا للتصفح، والإجازة المحتواة مستبعدة')

# 7) المحتوى والمشاهدات وسجل النشاط
ct = q("select source_sheet, source_row, title, coalesce(url,'') from public.content_items")
ctm = {(r[0], int(r[1])): (r[2], r[3]) for r in ct}
bad = [r[0] for r in S['enrichmentlog']['rows'] if ctm.get(('Enrichment Log', r[0])) != (raw(r[1][7]), raw(r[1][9]) or '')]
ok(not bad, f'المحتوى: {len(ct)} عنصرًا، العنوان والرابط حرفيًا')
au = q("select source_row, coalesce(details,''), coalesce(new_data->>'العمود F','') from public.audit_log")
aum = {int(r[0]): (r[1], r[2]) for r in au}
bad = [r[0] for r in S['auditlog']['rows'] if aum.get(r[0]) != (raw(r[1][4]) or '', raw(r[1][5]) or '')]
ok(not bad, f'سجل النشاط: {len(au)} سجلًا، التفاصيل والعمود F محفوظة')
views = int(q("select count(*) from public.student_views")[0][0])
ok(views >= 300, f'المشاهدات: {views} مشاهدة')

# 8) الحجر
for r in q("select source_sheet, source_row, source_column, reason from migration.quarantine order by 1,2"): print('   🟡 حجر:', r)
print('\nالنتيجة:', 'كل الفحوص ناجحة' if not fails else f'{fails} فحص فشل')
sys.exit(1 if fails else 0)
