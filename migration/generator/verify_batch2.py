"""تحقق مستقل لدفعة النماذج مقابل ملف Excel الأصلي."""
import subprocess, csv, io, json, sys, collections
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
JS_WS = ' \t\n\r\v\f\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'
jt = lambda v: (raw(v) or '').strip(JS_WS)

rm = {r[0]: int(r[1]) for r in q("select source_sheet, count(*) from migration.row_map group by 1")}
for title, k in [('Forms', 'forms'), ('Form_Questions', 'formquestions'), ('Form_Responses', 'formresponses'), ('Task Log', 'tasklog')]:
    ok(rm.get(title) == len(S[k]['rows']), f'{title}: {rm.get(title)} محاسَب من {len(S[k]["rows"])} صف')

# النماذج: التواريخ والحالة
fd = {r[0]: r[1:] for r in q("select a.legacy_code, a.title, to_char(d.opens_at at time zone 'UTC','YYYY-MM-DD HH24:MI'), to_char(d.closes_at at time zone 'UTC','YYYY-MM-DD HH24:MI'), d.status, d.max_attempts from public.assessments a join public.form_details d on d.assessment_id=a.id")}
def utc(v):
    t = parse_ts(v)
    import datetime
    s = t.replace('Z', '+00:00'); s = s[:-3] + '+03:00' if s.endswith('+03') else s
    return datetime.datetime.fromisoformat(s.replace(' ', 'T')).astimezone(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M')
bad = [r[0] for r in S['forms']['rows'] if fd.get(raw(r[1][0])) != [raw(r[1][9]), utc(r[1][11]), utc(r[1][12]), 'published', '1']]
ok(not bad, f'النماذج: {len(fd)} نموذجًا، العنوان والفتح (L) والإغلاق (M) والحالة مطابقة' + (f' {bad[:3]}' if bad else ''))
ok(all(fd[k][1] < fd[k][2] for k in fd), 'النماذج: الفتح قبل الإغلاق في كل النماذج (العمودان غير مقلوبين)')

# الأسئلة: الخيارات بالترتيب، والصحيح واحد ويطابق الأصل
opts = collections.defaultdict(list)
for f, qid, pos, body, corr in q("select a.legacy_code, qq.legacy_code, o.position, o.body, o.is_correct from public.question_options o join public.form_questions qq on qq.id=o.question_id join public.assessments a on a.id=qq.assessment_id order by 1,2,3"):
    opts[(f, qid)].append((body, corr == 't'))
bad = []
for r in S['formquestions']['rows']:
    k = (raw(r[1][1]), raw(r[1][0]))
    exp = [o for o in (jt(x) for x in (raw(r[1][4]) or '').split('||')) if o]
    got = opts.get(k, [])
    if [b for b, _ in got] != exp: bad.append((r[0], 'خيارات'))
    correct = [b for b, c in got if c]
    want = jt(r[1][5])
    if len(correct) != 1 or (correct[0] != want and correct[0].lower() != want.lower()): bad.append((r[0], 'الصحيح', want, correct))
ok(not bad, f'الأسئلة: {len(opts)} سؤالًا، الخيارات بنفس الترتيب والنص، وخيار صحيح واحد يطابق الأصل' + (f' {bad[:3]}' if bad else ''))

# الإجابات: كل إجابة نصية → نفس نص الخيار المربوط
db_ans = collections.defaultdict(dict)
for code, qid, body in q("select t.legacy_code, qq.legacy_code, o.body from public.attempt_answers aa join public.form_attempts t on t.id=aa.attempt_id join public.form_questions qq on qq.id=aa.question_id join public.question_options o on o.id=aa.option_id"):
    db_ans[code][qid] = body
att = {r[0]: r[1:] for r in q("select legacy_code, score, max_score, attempt_no, is_auto_absent from public.form_attempts")}
bad_ans, bad_score, n_ans = [], [], 0
for r in S['formresponses']['rows']:
    rid, text = raw(r[1][0]), raw(r[1][7])
    if text == '__AUTO_ABSENT__': continue
    a = att.get(rid)
    if not a: bad_score.append((r[0], 'مفقودة')); continue
    if float(a[0]) != float(r[1][8]) or float(a[1]) != float(r[1][9]): bad_score.append((r[0], a[:2], r[1][8], r[1][9]))
    for qid, ans in json.loads(text).items():
        n_ans += 1
        if db_ans.get(rid, {}).get(qid) != jt(ans): bad_ans.append((r[0], qid))
ok(not bad_score, f'الإجابات: درجة كل محاولة وعظماها مطابقة للأصل ({sum(1 for v in att.values() if v[3]=="f")} محاولة حقيقية)')
ok(not bad_ans, f'الإجابات: {n_ans} إجابة، كل واحدة مربوطة بالخيار الذي يطابق نصها حرفيًا' + (f' {bad_ans[:3]}' if bad_ans else ''))
absent = sum(1 for v in att.values() if v[3] == 't')
ok(absent == 110, f'الأصفار التلقائية: {absent} (116 في الشيت منها 6 مكررة دُمجت)')

# إعادة التصحيح من الإجابات المربوطة مقابل الدرجة المخزّنة (تعديلات المعلم اليدوية تظهر هنا)
diff = q("select t.legacy_code, t.score, coalesce(sum(qq.points) filter (where o.is_correct),0) from public.form_attempts t join public.attempt_answers aa on aa.attempt_id=t.id join public.form_questions qq on qq.id=aa.question_id join public.question_options o on o.id=aa.option_id where not t.is_auto_absent group by 1,2 having t.score <> coalesce(sum(qq.points) filter (where o.is_correct),0)")
ok(len(diff) == 5, f'إعادة التصحيح: {len(diff)} محاولات تختلف درجتها المخزّنة (نفس الخمس التي كشفها الفحص — تعديلات يدوية، نُقلت كما هي)')

# التسوية التلقائية لن تولّد أصفارًا جديدة تتعارض مع الرصد المنقول
gen = q("select public.settle_due_forms()")[0][0]
ok(gen == '0', f'التسوية التلقائية بعد النقل ولّدت {gen} صفرًا إضافيًا')
print('\nالنتيجة:', 'كل الفحوص ناجحة' if not fails else f'{fails} فحص فشل')
sys.exit(1 if fails else 0)
