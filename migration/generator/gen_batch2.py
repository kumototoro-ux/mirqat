"""مولّد الدفعة الثانية: النماذج الإلكترونية (Forms + Form_Questions + Form_Responses + صفوف Task Log المرافقة)."""
import collections, datetime, json, os, re
import gen_batch1 as B1
from common import *

S, L, c, rows = B1.S, B1.L, B1.c, B1.rows
OUT = B1.OUT

# trim بنفس سلوك JavaScript (ما يستخدمه الكود القديم في مقارنة الخيارات) — لا يحذف رموز العرض الصفري
JS_WS = ' \t\n\r\v\f\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'
def js_trim(v): return (raw(v) or '').strip(JS_WS)

def options_of(v): return [o for o in (js_trim(x) for x in (raw(v) or '').split('||')) if o]

def resolve_correct(raw_correct, opts):
    """نفس resolveCorrect_ في الكود القديم: مطابقة تامة، ثم بتجاهل حالة الأحرف إن كان الخيار وحيدًا."""
    c_ = js_trim(raw_correct)
    if not c_: return None
    if c_ in opts: return opts.index(c_)
    by_case = [i for i, o in enumerate(opts) if o.lower() == c_.lower()]
    return by_case[0] if len(by_case) == 1 else None

STATUS = {'منشور': 'published', 'مسودة': 'draft', 'مغلق': 'closed'}
NOW = datetime.datetime.now(datetime.timezone.utc)

def to_utc(ts_text):
    """نص timestamptz من parse_ts → datetime بتوقيت UTC (للمقارنة بالوقت الحالي فقط)."""
    if not ts_text: return None
    s = ts_text.replace('Z', '+00:00')
    if s.endswith('+03'): s = s[:-3] + '+03:00'
    try: return datetime.datetime.fromisoformat(s.replace(' ', 'T')).astimezone(datetime.timezone.utc)
    except ValueError: return None

def batch_forms():
    b = B1.Batch('05_forms', 'الدفعة 2 — النماذج الإلكترونية: النماذج والأسئلة والخيارات والإجابات')
    emp_codes = {key(c(r, 1)) for r in rows('employees')}
    student_codes = {key(c(r, 1)) for r in rows('students')}
    teacher = lambda v: f"migration.employee_id({lit(key(v))})" if key(v) in emp_codes else 'null'

    # ------------------------------------------------------------------ النماذج
    b.comment('النماذج (Forms): التقييم + إعداداته')
    forms = {}
    for r in rows('forms'):
        code = raw(c(r, 1))
        cl = B1.class_of(c(r, 4), c(r, 5), c(r, 6), c(r, 7))
        sub, term, ev = L['subject'].name(c(r, 8)), L['term'].name(c(r, 9)), L['eval'].name(c(r, 16))
        if not (code and cl and sub and term and key(c(r, 10))):
            b.quarantine_row('Forms', r[0], 'A:P', ' | '.join(str(raw(x)) for x in r[1][:16]), 'نموذج ناقص (معرّف/فصل/مادة/ترم/عنوان)')
            b.account('Forms', r[0], 'quarantined'); continue
        opens, closes = parse_ts(c(r, 12)), parse_ts(c(r, 13))
        status = STATUS.get(key(c(r, 15)), 'draft')
        closed_now = status == 'closed' or (status == 'published' and closes and to_utc(closes) and to_utc(closes) <= NOW)
        # ⚠️ النماذج المنتهية تُعلَّم "مسوّاة" عند النقل: أصفار غيابها القديمة تُنقل كما هي، ولا تولّد
        # التسوية التلقائية في القاعدة الجديدة أصفارًا إضافية تتعارض مع الرصد المنقول في الدفعة التالية.
        settled = closed_now or key(c(r, 18)) == 'نعم'
        wk = B1.week_by_date(parse_date(c(r, 12)))
        forms[code] = {'row': r[0], 'class': cl, 'opens': opens}
        b.sql("insert into public.assessments (kind, class_id, subject_id, term_id, eval_type_id, teacher_id, title, description, "
              "published_at, due_at, week_id, legacy_code, source_sheet, source_row) values ("
              + ', '.join(["'form'", B1.class_sql(cl), f"migration.subject_id({lit(sub)})", f"migration.term_id({lit(term)})",
                           f"migration.eval_type_id({lit(ev)})" if ev else 'null', teacher(c(r, 2)),
                           lit(raw(c(r, 10))), lit(raw(c(r, 11))),
                           (lit(opens) + '::timestamptz') if opens else 'null', (lit(closes) + '::timestamptz') if closes else 'null',
                           B1.cal_sql(wk) if wk else 'null', lit(code), "'Forms'", str(r[0])]) + ');')
        b.count('public.assessments')
        attempts = num(c(r, 14))
        b.sql("insert into public.form_details (assessment_id, opens_at, closes_at, max_attempts, status, intro_video_url, absence_settled_at) values ("
              + ', '.join([f"migration.form_id({lit(code)})", (lit(opens) + '::timestamptz') if opens else 'null',
                           (lit(closes) + '::timestamptz') if closes else 'null',
                           str(int(attempts)) if attempts and attempts >= 1 else '1', lit(status), lit(raw(c(r, 17))),
                           ((lit(closes) + '::timestamptz') if closes else 'now()') if settled else 'null']) + ');')
        b.count('public.form_details')
        b.account('Forms', r[0], 'migrated', 'assessments', code)

    # ------------------------------------------------------------------ صفوف Task Log المرافقة
    b.comment('صفوف Task Log المرافقة للنماذج: تُدمج في النموذج نفسه (النموذج هو المرجع)، ونصها الأصلي محفوظ في row_map')
    for r in rows('tasklog'):
        fid = raw(c(r, 21))
        if not key(fid) or key(c(r, 20)) in ('فيديو', 'اثراء'):
            continue
        original = json.dumps({B1.S['tasklog']['header'][i] or f'col{i+1}': raw(v) for i, v in enumerate(r[1]) if raw(v)}, ensure_ascii=False)
        if fid not in forms:
            b.quarantine_row('Task Log', r[0], 'U', fid, 'تكليف مرتبط بنموذج غير موجود')
            b.account('Task Log', r[0], 'quarantined'); continue
        b.account('Task Log', r[0], 'merged', 'assessments', fid, note=original)

    # ------------------------------------------------------------------ الأسئلة والخيارات
    b.comment('الأسئلة والخيارات: كل خيار صف مستقل، والصحيح علم على الخيار نفسه')
    questions = {}   # (form, qid) → قائمة الخيارات
    position = collections.Counter()
    for r in rows('formquestions'):
        fid, qid = raw(c(r, 2)), raw(c(r, 1))
        opts = options_of(c(r, 5))
        if fid not in forms or not qid or (fid, qid) in questions:
            reason = 'سؤال لنموذج غير موجود' if fid not in forms else ('سؤال بلا معرّف' if not qid else 'معرّف سؤال مكرر في نفس النموذج')
            b.quarantine_row('Form_Questions', r[0], 'A:J', ' | '.join(str(raw(x)) for x in r[1][:10]), reason)
            b.account('Form_Questions', r[0], 'quarantined', note=reason); continue
        position[fid] += 1
        correct = resolve_correct(c(r, 6), opts)
        pts = num(c(r, 7)) or 0
        b.sql("insert into public.form_questions (assessment_id, position, body, image_url, points, section_title, section_instructions, "
              "legacy_code, legacy_correct_raw, source_row) values ("
              + ', '.join([f"migration.form_id({lit(fid)})", str(position[fid]), lit(raw(c(r, 3)) or ''), lit(raw(c(r, 8))), lit(pts),
                           lit(raw(c(r, 9))), lit(raw(c(r, 10))), lit(qid), lit(raw(c(r, 6))), str(r[0])]) + ');')
        b.count('public.form_questions')
        for i, o in enumerate(opts, 1):
            b.sql(f"insert into public.question_options (question_id, position, body, is_correct) values ("
                  f"migration.question_id({lit(fid)}, {lit(qid)}), {i}, {lit(o)}, {lit(correct is not None and correct == i - 1)});")
            b.count('public.question_options')
        if correct is None:
            b.quarantine_row('Form_Questions', r[0], 'F', raw(c(r, 6)), 'الإجابة الصحيحة لا تطابق أي خيار — نُقل السؤال بلا خيار صحيح')
        if len(set(opts)) != len(opts):
            b.quarantine_row('Form_Questions', r[0], 'E', raw(c(r, 5)), 'خيارات مكررة النص — الإجابات تُربط بأول خيار مطابق')
        questions[(fid, qid)] = opts
        b.account('Form_Questions', r[0], 'migrated', 'form_questions', qid)

    # ------------------------------------------------------------------ الإجابات
    b.comment('الإجابات: محاولة لكل صف. الصفر التلقائي = المحاولة 0. الإجابات تُربط بمعرّف الخيار، والنص الأصلي محفوظ في raw_answers')
    groups = collections.defaultdict(list)
    for r in rows('formresponses'):
        groups[(raw(c(r, 2)), key(c(r, 3)))].append(r)
    unmapped_answers = 0
    for (fid, sid), grp in groups.items():
        real = sorted([r for r in grp if raw(c(r, 8)) != '__AUTO_ABSENT__'], key=lambda r: (str(parse_ts(c(r, 11)) or ''), r[0]))
        absent = sorted([r for r in grp if raw(c(r, 8)) == '__AUTO_ABSENT__'], key=lambda r: r[0])
        for idx, r in enumerate(absent):
            if fid not in forms or sid not in student_codes:
                b.quarantine_row('Form_Responses', r[0], 'A:K', ' | '.join(str(raw(x)) for x in r[1][:11]), 'صفر تلقائي لنموذج أو طالب غير موجود')
                b.account('Form_Responses', r[0], 'quarantined'); continue
            if idx > 0:
                b.account('Form_Responses', r[0], 'merged', 'form_attempts', note=f'صفر تلقائي مكرر — الأول في صف {absent[0][0]}'); continue
            ts = parse_ts(c(r, 11))
            b.sql("insert into public.form_attempts (assessment_id, student_id, attempt_no, is_auto_absent, score, max_score, submitted_at, "
                  "legacy_code, source_row) values ("
                  + ', '.join([f"migration.form_id({lit(fid)})", f"migration.student_id({lit(sid)})", '0', 'true',
                               lit(num(c(r, 9)) or 0), lit(num(c(r, 10)) or 0),
                               (lit(ts) + '::timestamptz') if ts else 'now()', lit(raw(c(r, 1))), str(r[0])]) + ');')
            b.count('public.form_attempts')
            b.account('Form_Responses', r[0], 'migrated', 'form_attempts', raw(c(r, 1)))
        for n, r in enumerate(real, 1):
            score, mx = num(c(r, 9)), num(c(r, 10))
            reason = None
            if fid not in forms: reason = 'إجابة لنموذج غير موجود'
            elif sid not in student_codes: reason = 'إجابة لطالب غير موجود'
            elif score is None or mx is None or score < 0 or mx < 0 or (mx > 0 and score > mx): reason = 'درجة أو عظمى غير صالحة'
            if reason:
                b.quarantine_row('Form_Responses', r[0], 'A:K', ' | '.join(str(raw(x)) for x in r[1][:11]), reason)
                b.account('Form_Responses', r[0], 'quarantined', note=reason); continue
            text = raw(c(r, 8)) or ''
            try:
                answers = json.loads(text) if text else {}
                if not isinstance(answers, dict): raise ValueError
                raw_json = jlit(answers)
            except ValueError:
                answers, raw_json = {}, jlit({'نص_غير_صالح': text})
                b.quarantine_row('Form_Responses', r[0], 'H', text, 'نص الإجابات تالف — نُقلت الدرجة والنص الخام بلا تفاصيل')
            ts = parse_ts(c(r, 11))
            b.sql("insert into public.form_attempts (assessment_id, student_id, attempt_no, is_auto_absent, score, max_score, submitted_at, "
                  "raw_answers, legacy_code, source_row) values ("
                  + ', '.join([f"migration.form_id({lit(fid)})", f"migration.student_id({lit(sid)})", str(n), 'false', lit(score), lit(mx),
                               (lit(ts) + '::timestamptz') if ts else 'now()', raw_json, lit(raw(c(r, 1))), str(r[0])]) + ');')
            b.count('public.form_attempts')
            skipped = []
            for qid, ans in answers.items():
                opts = questions.get((fid, qid))
                a = js_trim(ans)
                if opts is None or a not in opts:
                    skipped.append(qid); continue
                b.sql("insert into public.attempt_answers (attempt_id, question_id, option_id) values ("
                      f"(select id from public.form_attempts where assessment_id = migration.form_id({lit(fid)}) "
                      f"and student_id = migration.student_id({lit(sid)}) and attempt_no = {n}), "
                      f"migration.question_id({lit(fid)}, {lit(qid)}), "
                      f"(select id from public.question_options where question_id = migration.question_id({lit(fid)}, {lit(qid)}) "
                      f"and position = {opts.index(a) + 1}));")
                b.count('public.attempt_answers')
            unmapped_answers += len(skipped)
            b.account('Form_Responses', r[0], 'migrated', 'form_attempts', raw(c(r, 1)),
                      note=('إجابات لم تُربط بخيار (محفوظة في النص الخام): ' + ', '.join(skipped)) if skipped else None)
    b.unmapped_answers = unmapped_answers
    return b

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    baseline = collections.Counter()
    for fn in [B1.batch_reference, B1.batch_people, B1.batch_calendar, B1.batch_activity]:
        prev = fn()
        for t, n in prev.expect.items(): baseline[t] += n
        for s_, n in prev.accounted.items(): baseline['rowmap:' + s_] += n
    b = batch_forms()
    with open(os.path.join(OUT, b.name + '.sql'), 'w', encoding='utf-8') as f:
        f.write(b.render(dict(baseline)))
    print(f'{b.name}: {sum(b.expect.values())} سجل، {len(b.quarantine)} في الحجر، {sum(b.accounted.values())} صف محاسَب')
    print('   التفاصيل:', dict(b.expect))
    print('   إجابات لم تُربط بخيار:', b.unmapped_answers)
    for q in b.quarantine: print('   حجر:', q[0], q[1], q[4])
