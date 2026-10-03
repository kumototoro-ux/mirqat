"""تحقق مستقل لدفعة الرصد + المقارنة الحاسمة مع Grade Aggregation."""
import subprocess, csv, io, sys, collections
from decimal import Decimal, ROUND_HALF_UP
from common import *
S = load('/mnt/user-data/uploads/م_رقاة___نسخة_النقل_2026-10-01.xlsx')
def q(sql):
    out = subprocess.run(['su', 'postgres', '-c', f"psql -d mig_test -tA -c \"copy ({sql}) to stdout with (format csv)\""], capture_output=True, text=True)
    if out.stderr.strip(): print(out.stderr)
    return list(csv.reader(io.StringIO(out.stdout)))
fails = 0
def ok(cond, msg):
    global fails
    print(('✅' if cond else '❌'), msg); fails += 0 if cond else 1

rm = {r[0]: int(r[1]) for r in q("select source_sheet, count(*) from migration.row_map group by 1")}
for title, k in [('Daily Follow up', 'dailyfollowup'), ('Grade Aggregation', 'gradeaggregation')]:
    ok(rm.get(title) == len(S[k]['rows']), f'{title}: {rm.get(title)} محاسَب من {len(S[k]["rows"])} صف')

# 1) كل صف رصد: الطالب والدرجة والعظمى والمادة والترم والنوع والعنوان وتاريخ الرصد
ge = {int(r[0]): r[1:] for r in q("""select g.source_row, s.code, g.score, g.max_score, j.name, t.name, e.name, a.title,
      to_char(g.recorded_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS'), g.is_edited
      from public.grade_entries g join public.students s on s.id=g.student_id join public.assessments a on a.id=g.assessment_id
      join public.subjects j on j.id=a.subject_id join public.terms t on t.id=a.term_id left join public.eval_types e on e.id=a.eval_type_id""")}
bad = []
for r in S['dailyfollowup']['rows']:
    v = r[1]; g = ge.get(r[0])
    if not g: bad.append((r[0], 'مفقود')); continue
    title_ok = g[6] == raw(v[9]) or g[6].startswith(raw(v[9]) + ' (') or key(g[6]) == key(v[9])
    exp = [raw(v[0]), float(v[10]), float(v[11]), raw(v[6]), raw(v[7]), raw(v[8])]
    got = [g[0], float(g[1]), float(g[2]), g[3], g[4], g[5]]
    if exp != got or not title_ok or g[7] != str(v[12])[:19].replace('T', ' ') or (g[8] == 't') != (key(v[15]) == 'نعم'):
        bad.append((r[0], exp, got, g[6], g[7], v[12]))
ok(not bad, f'الرصد: {len(ge)} رصدًا، الطالب والدرجة والعظمى والمادة والترم والنوع والعنوان وتاريخ الرصد مطابقة' + (f' {bad[:2]}' if bad else ''))

# 2) التجميع: إعادة الحساب من الشيت (نفس معادلة الكود القديم) = ما تحسبه القاعدة الجديدة
weights = {}
for r in S['gradedistribution']['rows']:
    weights[(key(r[1][2]), key(r[1][0]))] = Decimal(str(r[1][1]))
grp = collections.defaultdict(lambda: [Decimal(0), Decimal(0)])
for r in S['dailyfollowup']['rows']:
    k = (raw(r[1][0]), key(r[1][6]), key(r[1][7]), key(r[1][8]))
    grp[k][0] += Decimal(str(r[1][10])); grp[k][1] += Decimal(str(r[1][11]))
expected = {k: ((e / m) * weights.get((k[1], k[3]), Decimal(0))).quantize(Decimal('0.01'), ROUND_HALF_UP) for k, (e, m) in grp.items()}
db = {(r[0], key(r[1]), key(r[2]), key(r[3])): Decimal(r[4]) for r in q("""select s.code, j.name, t.name, e.name, b.weighted_score
      from public.grade_breakdown b join public.students s on s.id=b.student_id join public.subjects j on j.id=b.subject_id
      join public.terms t on t.id=b.term_id join public.eval_types e on e.id=b.eval_type_id""")}
diff = [(k, expected[k], db.get(k)) for k in expected if db.get(k) != expected[k]]
ok(not diff and len(db) == len(expected), f'التجميع: {len(db)} قيمة (طالب × مادة × ترم × نوع) تطابق إعادة الحساب من الشيت 100%' + (f' {diff[:3]}' if diff else ''))

# 3) مقارنة مع Grade Aggregation المخزّن في الشيت — المتوقع: فقط الصفوف الـ37 التي لم يحدّثها النظام القديم
AGG = ['واجبات', 'بحوث و تقارير', 'اوراق عمل', 'المشاركة و تفاعل', 'اختبارات قصيرة', 'اختبارات شهرية', 'اختبار نهائي', 'اختبار شفهي', 'اختبار تحريري']
rows_diff, cells_diff = [], 0
for r in S['gradeaggregation']['rows']:
    v = r[1]; off = []
    for i, ev in enumerate(AGG):
        stored = v[8 + i]
        new = db.get((raw(v[0]), key(v[7]), key(v[2]), ev))
        s_ = None if stored in (None, '') else Decimal(str(stored)).quantize(Decimal('0.01'))
        if s_ != new: off.append(f'{ev}: الشيت {s_} ← الجديد {new}')
    if off: rows_diff.append((r[0], raw(v[0]), key(v[7]), off)); cells_diff += len(off)
ok(len(rows_diff) == 37, f'مقارنة بالمجمّع المخزّن: {len(S["gradeaggregation"]["rows"]) - len(rows_diff)} صفًا مطابقًا، و{len(rows_diff)} صفًا مختلفًا (نفس الـ37 التي كشفها الفحص — تجميع لم يحدّثه النظام القديم)')

# 4) الإخفاء
hid = q("select count(*) from public.grade_totals where not is_visible")[0][0]
ok(hid == '6', f'النتائج المخفية: {hid} (6 في الشيت)')

# 5) محاسبة كل الشيتات المنقولة حتى الآن
done = {'Settings', 'Students', 'Employees', 'Users', 'Students_Users', 'School Calendar', 'Class Timetable', 'Subject Distribution Matrix',
        'Grade Distribution', 'Enrichment Log', 'Student_Views', 'Behavior', 'Audit Log', 'Task Log', 'Forms', 'Form_Questions',
        'Form_Responses', 'Daily Follow up', 'Grade Aggregation'}
total_src = sum(len(v['rows']) for k, v in S.items() if v['title'] in done)
total_map = sum(n for t, n in rm.items() if t in done)
ok(total_src == total_map, f'المحاسبة الكلية: {total_map} صفًا محاسَبًا من {total_src} صفًا في 19 شيتًا')
with open('/home/claude/mig/out/agg_diff.tsv', 'w', encoding='utf-8') as f:
    for d in rows_diff: f.write(f'{d[0]}\t{d[1]}\t{d[2]}\t' + '؛ '.join(d[3]) + '\n')
print('\nالنتيجة:', 'كل الفحوص ناجحة' if not fails else f'{fails} فحص فشل')
sys.exit(1 if fails else 0)
