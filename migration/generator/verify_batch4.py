"""تحقق مستقل للتحضير وربط الحصص + المحاسبة النهائية لكل الشيتات."""
import subprocess, csv, io, sys, collections
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

# التحضير: كل سجل منقول يطابق صفه الأصلي
at = {int(r[0]): r[1:] for r in q("""select a.source_row, s.code, c.week_label, a.day_of_week, a.period_no, st.name, coalesce(j.name,''),
      coalesce(a.note,''), to_char(a.recorded_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS')
      from public.attendance_records a join public.students s on s.id=a.student_id join public.calendar_entries c on c.id=a.week_id
      join public.attendance_statuses st on st.id=a.status_id left join public.subjects j on j.id=a.subject_id""")}
src = {r[0]: r[1] for r in S['attendanceandabsence']['rows']}
bad = []
for row, g in at.items():
    v = src[row]
    exp_week = raw(v[4]) if key(v[4]) else 'الثالث'   # الصفوف الـ24 بلا أسبوع سُجّلت 17 سبتمبر (الأسبوع الثالث)
    exp = [raw(v[0]), exp_week, str(day_no(v[5])), str(period_no(v[6])), raw(v[7]), raw(v[9]) or '', raw(v[8]) or '', str(v[13])[:19].replace('T', ' ')]
    if g != exp: bad.append((row, exp, g))
ok(not bad, f'التحضير: {len(at)} سجلًا، الطالب والأسبوع واليوم والحصة والحالة والمادة والملاحظة ووقت التسجيل مطابقة' + (f' {bad[:2]}' if bad else ''))

# الصفوف الأقدم المحجورة: لكل واحد سجل معتمد أحدث لنفس (الطالب، الأسبوع، اليوم، الحصة، المادة)
qr = [int(r[0]) for r in q("select source_row from migration.quarantine where source_sheet='Attendance and Absence'")]
kept_keys = {(g[0], g[1], g[2], g[3], g[5]): (row, g[7]) for row, g in at.items()}
bad = []
for row in qr:
    v = src[row]
    k = (raw(v[0]), raw(v[4]) or 'الثالث', str(day_no(v[5])), str(period_no(v[6])), raw(v[9]) or '')
    kept = kept_keys.get(k)
    if not kept or kept[1] < str(v[13])[:19].replace('T', ' '): bad.append((row, k, kept))
ok(len(qr) == 45 and not bad, f'التكرار: {len(qr)} نسخة أقدم في الحجر، ولكل واحدة سجل معتمد أحدث منها لنفس الطالب والحصة')
ok(len(at) + len(qr) == len(src), f'التحضير: {len(at)} معتمد + {len(qr)} نسخة أقدم = {len(src)} صفًا')

# ربط الحصص: الحصة والأسبوع وعنوان المحتوى المربوط = المحفوظ في الشيت
pl = {int(r[0]): r[1:] for r in q("""select p.source_row, t.source_row, c.week_label, coalesce(a.title, ci.title)
      from public.period_links p join public.timetable_slots t on t.id=p.slot_id join public.calendar_entries c on c.id=p.week_id
      left join public.assessments a on a.id=p.assessment_id left join public.content_items ci on ci.id=p.content_item_id""")}
bad = [(r[0], pl.get(r[0])) for r in S['periodlinks']['rows']
       if pl.get(r[0]) is None or [pl[r[0]][0], key(pl[r[0]][1]), key(pl[r[0]][2])] != [str(int(r[1][0])), key(r[1][3]), key(r[1][6])]]
ok(not bad, f'ربط الحصص: {len(pl)} رابطًا، الحصة والأسبوع وعنوان المحتوى مطابقة' + (f' {bad[:3]}' if bad else ''))

# المحاسبة النهائية: كل صف في كل شيت بيانات
rm = {r[0]: int(r[1]) for r in q("select source_sheet, count(*) from migration.row_map group by 1")}
data_sheets = [v for k, v in S.items() if k != 'فهرسالأعمدة']
missing = [(v['title'], len(v['rows']), rm.get(v['title'], 0)) for v in data_sheets if rm.get(v['title'], 0) != len(v['rows'])]
total = sum(len(v['rows']) for v in data_sheets)
ok(not missing and sum(rm.values()) == total, f'المحاسبة النهائية: {sum(rm.values())} صفًا محاسَبًا من {total} صفًا في {len(data_sheets)} شيتًا' + (f' {missing}' if missing else ''))
dup = q("select source_sheet, source_row from migration.row_map group by 1,2 having count(*) > 1")
ok(not dup, 'لا صف محاسَب مرتين')
for r in q("select status, count(*) from migration.row_map group by 1 order by 2 desc"): print('   ', r[0], r[1])
print('\nالنتيجة:', 'كل الفحوص ناجحة' if not fails else f'{fails} فحص فشل')
sys.exit(1 if fails else 0)
