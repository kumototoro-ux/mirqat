"""مولّد الدفعة الثالثة: الرصد اليومي (Daily Follow up) + إمكانية الرؤية من Grade Aggregation."""
import collections, json, os
import gen_batch1 as B1
import gen_batch2 as B2
from common import *

S, L, c, rows = B1.S, B1.L, B1.c, B1.rows
OUT = B1.OUT

def batch_grades():
    b = B1.Batch('06_grades', 'الدفعة 3 — الرصد اليومي وإمكانية رؤية النتائج')
    emp_codes = {key(c(r, 1)) for r in rows('employees')}
    student_codes = {key(c(r, 1)) for r in rows('students')}

    # فهارس التقييمات المنقولة: النماذج + التكاليف العادية (بالفصل + المادة + الترم + العنوان)
    forms_idx, tasks_idx = {}, {}
    for r in rows('forms'):
        cl = B1.class_of(c(r, 4), c(r, 5), c(r, 6), c(r, 7))
        forms_idx.setdefault((cl, L['subject'].name(c(r, 8)), L['term'].name(c(r, 9)), key(c(r, 10))), []).append(raw(c(r, 1)))
    for r in rows('tasklog'):
        if key(c(r, 21)) or key(c(r, 20)) in ('فيديو', 'اثراء') or not key(c(r, 9)) or not num(c(r, 12)):
            continue
        cl = B1.class_of(c(r, 3), c(r, 4), c(r, 5), c(r, 6))
        tasks_idx.setdefault((cl, L['subject'].name(c(r, 7)), L['term'].name(c(r, 19)), key(c(r, 9))), []).append(r[0])

    # المحاولات المنقولة: لتمييز رصد النموذج (تسليم حقيقي / صفر تلقائي)
    attempt_kind = {}
    for r in rows('formresponses'):
        k = (raw(c(r, 2)), key(c(r, 3)))
        is_absent = raw(c(r, 8)) == '__AUTO_ABSENT__'
        attempt_kind[k] = 'form' if (not is_absent or attempt_kind.get(k) == 'form') else 'auto_absent'

    # ------------------------------------------------------------------ تصنيف كل صف رصد
    plan = []           # (row, target, sid)
    manual_groups = collections.OrderedDict()
    for r in rows('dailyfollowup'):
        sid = key(c(r, 1))
        cl = B1.class_of(c(r, 3), c(r, 4), c(r, 5), c(r, 6))
        sub, term, ev = L['subject'].name(c(r, 7)), L['term'].name(c(r, 8)), L['eval'].name(c(r, 9))
        score, mx = num(c(r, 11)), num(c(r, 12))
        reason = None
        if sid not in student_codes: reason = 'رصد لطالب غير موجود'
        elif not (cl and sub and term and key(c(r, 10))): reason = 'رصد ناقص (فصل/مادة/ترم/عنوان)'
        elif score is None or mx is None or mx <= 0 or score < 0: reason = 'درجة أو عظمى غير صالحة'
        elif score > mx: reason = 'الدرجة أكبر من العظمى'
        if reason:
            b.quarantine_row('Daily Follow up', r[0], 'A:Q', ' | '.join(str(raw(x)) for x in r[1][:17]), reason)
            b.account('Daily Follow up', r[0], 'quarantined', note=reason); continue
        k = (cl, sub, term, key(c(r, 10)))
        f, t = forms_idx.get(k, []), tasks_idx.get(k, [])
        if len(f) + len(t) > 1:
            b.quarantine_row('Daily Follow up', r[0], 'J', raw(c(r, 10)), f'العنوان يطابق أكثر من تقييم: نماذج {f} تكاليف {t}')
            b.account('Daily Follow up', r[0], 'quarantined', note='غامض'); continue
        if f:   target = ('form', f[0])
        elif t: target = ('task', t[0])
        else:
            gk = k + (ev,)
            manual_groups.setdefault(gk, []).append(r)
            target = ('manual', gk)
        plan.append((r, target, sid))

    # ------------------------------------------------------------------ التقييمات اليدوية (رصد بلا تكليف مسبق)
    # تكرار نفس الطالب في نفس التقييم: يُحفظ كتقييم مستقل "(2)" — المجموع القديم يحسبهما معًا، فيبقى مطابقًا
    seen = collections.Counter()
    final = []
    for r, target, sid in plan:
        seen[(target, sid)] += 1
        final.append((r, target, sid, seen[(target, sid)]))
    copies_needed = collections.defaultdict(int)
    first_row_of = {}   # (هدف، n) → أول صف رصد حقيقي بهذا الترتيب — مرجع ثابت لنسخة التقييم
    for r, target, sid, n in final:
        copies_needed[target] = max(copies_needed[target], n)
        first_row_of.setdefault((target, n), r[0])

    b.comment('التقييمات اليدوية: كل مجموعة رصد بلا تكليف (فصل + مادة + ترم + عنوان + نوع تقييم) تصير تقييمًا واحدًا')
    manual_ref = {}
    def manual_sql(gk, n):
        return (f"(select id from public.assessments where kind = 'manual' and source_sheet = 'Daily Follow up' "
                f"and source_row = {manual_ref[(gk, n)]})")
    for gk, grp in manual_groups.items():
        cl, sub, term, _title, ev = gk
        teachers = collections.Counter(key(c(r, 14)) for r in grp if key(c(r, 14)) in emp_codes)
        maxes = collections.Counter(num(c(r, 12)) for r in grp)
        first = min(grp, key=lambda r: (str(parse_ts(c(r, 13)) or ''), r[0]))
        for n in range(1, copies_needed[('manual', gk)] + 1):
            anchor = first_row_of[(('manual', gk), n)]   # صف حقيقي فريد لكل نسخة
            manual_ref[(gk, n)] = anchor
            title = raw(c(first, 10)) + ('' if n == 1 else f' ({n})')
            pub = parse_ts(c(first, 13))
            b.sql("insert into public.assessments (kind, class_id, subject_id, term_id, eval_type_id, teacher_id, title, max_score, "
                  "published_at, week_id, source_sheet, source_row) values ("
                  + ', '.join(["'manual'", B1.class_sql(cl), f"migration.subject_id({lit(sub)})", f"migration.term_id({lit(term)})",
                               f"migration.eval_type_id({lit(ev)})" if ev else 'null',
                               f"migration.employee_id({lit(teachers.most_common(1)[0][0])})" if teachers else 'null',
                               lit(title), lit(maxes.most_common(1)[0][0]), (lit(pub) + '::timestamptz') if pub else 'null',
                               (B1.cal_sql(B1.week_by_date(parse_date(c(first, 13)))) if B1.week_by_date(parse_date(c(first, 13))) else 'null'),
                               "'Daily Follow up'", str(anchor)]) + ');')
            b.count('public.assessments')

    # ------------------------------------------------------------------ الرصد
    b.comment('الرصد: صف لكل (طالب، تقييم). تاريخ الرصد الأصلي ومن رصده وعلامة التعديل محفوظة')
    copies = 0
    for r, target, sid, n in final:
        kind, ref = target
        if kind == 'form' and n == 1:
            a_sql = f"migration.form_id({lit(ref)})"
            src = attempt_kind.get((ref, sid), 'manual')
        elif kind == 'task' and n == 1:
            a_sql = f"migration.task_id({ref})"; src = 'manual'
        else:
            # تكرار: يذهب لنسخة يدوية من التقييم (للنماذج والتكاليف ننشئها هنا عند الحاجة)
            if kind != 'manual':
                gk = ('dup', kind, ref)
                if (gk, n) not in manual_ref:
                    cl = B1.class_of(c(r, 3), c(r, 4), c(r, 5), c(r, 6))
                    anchor = first_row_of[(target, n)]
                    manual_ref[(gk, n)] = anchor
                    pub = parse_ts(c(r, 13))
                    b.sql("insert into public.assessments (kind, class_id, subject_id, term_id, eval_type_id, teacher_id, title, max_score, "
                          "published_at, source_sheet, source_row) values ("
                          + ', '.join(["'manual'", B1.class_sql(cl), f"migration.subject_id({lit(L['subject'].name(c(r, 7)))})",
                                       f"migration.term_id({lit(L['term'].name(c(r, 8)))})",
                                       f"migration.eval_type_id({lit(L['eval'].name(c(r, 9)))})",
                                       f"migration.employee_id({lit(key(c(r, 14)))})" if key(c(r, 14)) in emp_codes else 'null',
                                       lit(raw(c(r, 10)) + f' ({n})'), lit(num(c(r, 12))),
                                       (lit(pub) + '::timestamptz') if pub else 'null', "'Daily Follow up'", str(anchor)]) + ');')
                    b.count('public.assessments')
                a_sql = manual_sql(gk, n)
            else:
                a_sql = manual_sql(ref, n)
            src = 'manual'
            if n > 1: copies += 1
        rec = parse_ts(c(r, 13))
        edited = key(c(r, 16)) == 'نعم'
        edited_at = parse_ts(c(r, 17))
        recorder = f"migration.employee_id({lit(key(c(r, 14)))})" if (src == 'manual' and key(c(r, 14)) in emp_codes) else 'null'
        b.sql("insert into public.grade_entries (assessment_id, student_id, score, max_score, source, recorded_by, recorded_at, "
              "is_edited, edited_at, source_row) values ("
              + ', '.join([a_sql, f"migration.student_id({lit(sid)})", lit(num(c(r, 11))), lit(num(c(r, 12))), lit(src), recorder,
                           (lit(rec) + '::timestamptz') if rec else 'now()', lit(edited),
                           (lit(edited_at) + '::timestamptz') if edited_at else 'null', str(r[0])]) + ');')
        b.count('public.grade_entries')
        b.account('Daily Follow up', r[0], 'migrated', 'grade_entries',
                  note=(f'رصد مكرر — حُفظ في نسخة مستقلة ({n}) من التقييم' if n > 1 else None))

    # ------------------------------------------------------------------ Grade Aggregation
    b.comment('Grade Aggregation: لا يُنقل كبيانات (يُحسب لحظيًا من الرصد). يُنقل منه فقط قرار الإخفاء')
    for r in rows('gradeaggregation'):
        sid = key(c(r, 1))
        if key(c(r, 18)) == 'لا' and sid in student_codes:
            b.sql(f"insert into public.grade_visibility (student_id, subject_id, term_id, is_visible) values ("
                  f"migration.student_id({lit(sid)}), migration.subject_id({lit(L['subject'].name(c(r, 8)))}), "
                  f"migration.term_id({lit(L['term'].name(c(r, 3)))}), false);")
            b.count('public.grade_visibility')
            b.account('Grade Aggregation', r[0], 'migrated', 'grade_visibility', note='نتيجة مخفية')
        else:
            b.account('Grade Aggregation', r[0], 'derived', 'grade_breakdown', note='يُحسب لحظيًا من الرصد')
    b.stats = {'forms': sum(1 for x in final if x[1][0] == 'form' and x[3] == 1),
               'tasks': sum(1 for x in final if x[1][0] == 'task' and x[3] == 1),
               'manual': sum(1 for x in final if x[1][0] == 'manual' and x[3] == 1),
               'manual_assessments': len(manual_groups), 'copies': copies}
    return b

if __name__ == '__main__':
    baseline = collections.Counter()
    for fn in [B1.batch_reference, B1.batch_people, B1.batch_calendar, B1.batch_activity, B2.batch_forms]:
        prev = fn()
        for t, n in prev.expect.items(): baseline[t] += n
        for s_, n in prev.accounted.items(): baseline['rowmap:' + s_] += n
    b = batch_grades()
    with open(os.path.join(OUT, b.name + '.sql'), 'w', encoding='utf-8') as f:
        f.write(b.render(dict(baseline)))
    print(f'{b.name}: {sum(b.expect.values())} سجل، {len(b.quarantine)} في الحجر، {sum(b.accounted.values())} صف محاسَب')
    print('   ', dict(b.expect), b.stats)
    for q in b.quarantine: print('   حجر:', q[0], q[1], q[4])
