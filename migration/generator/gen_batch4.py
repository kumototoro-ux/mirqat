"""مولّد الدفعة الرابعة: التحضير (Attendance and Absence) وربط الحصص (Period Links)."""
import collections, datetime, json, os
import gen_batch1 as B1
import gen_batch2 as B2
import gen_batch3 as B3
from common import *

S, L, c, rows = B1.S, B1.L, B1.c, B1.rows
OUT = B1.OUT

def riyadh_date(v):
    """تاريخ اليوم بتوقيت الرياض لقيمة وقت (ISO بـ Z يُحوَّل، والقيم المحلية تبقى)."""
    t = B2.to_utc(parse_ts(v))
    return (t + datetime.timedelta(hours=3)).date().isoformat() if t else parse_date(v)

def batch_attendance():
    b = B1.Batch('07_attendance', 'الدفعة 4 — التحضير')
    emp_codes = {key(c(r, 1)) for r in rows('employees')}
    student_codes = {key(c(r, 1)) for r in rows('students')}
    statuses = {key(s): s for s in L['att_status'].items}

    resolved = []
    for r in rows('attendanceandabsence'):
        sid = key(c(r, 1))
        day, per = day_no(c(r, 6)), period_no(c(r, 7))
        wk, inferred = B1.week_by_label(c(r, 4), c(r, 5)), False
        if not wk and not key(c(r, 4)) and not key(c(r, 5)):
            # الترم والأسبوع فارغان: يُستنتجان من تاريخ التسجيل، بشرط أن يطابق يومُه اليومَ المكتوب في الصف
            d = riyadh_date(c(r, 14))
            cand = B1.week_by_date(d) if d else None
            if cand and day is not None and datetime.date.fromisoformat(d).weekday() == (day + 6) % 7:
                wk, inferred = cand, True
        status = statuses.get(key(c(r, 8)))
        reason = None
        if sid not in student_codes: reason = 'تحضير لطالب غير موجود'
        elif not wk: reason = 'لا يمكن تحديد الأسبوع'
        elif day is None or per is None: reason = 'يوم أو حصة غير مفهومة'
        elif not status: reason = 'حالة تحضير غير موجودة في القائمة'
        if reason:
            b.quarantine_row('Attendance and Absence', r[0], 'A:O', ' | '.join(str(raw(x)) for x in r[1][:15]), reason)
            b.account('Attendance and Absence', r[0], 'quarantined', note=reason); continue
        sub = L['subject'].name(c(r, 10))
        resolved.append({'r': r, 'sid': sid, 'wk': wk, 'day': day, 'per': per, 'sub': sub, 'status': status,
                         'ts': parse_ts(c(r, 14)), 'inferred': inferred})

    # الحفظ المكرر لنفس الكشف: المعتمد هو الأحدث، والأقدم يُحفظ في الحجر كسجل تاريخي
    groups = collections.defaultdict(list)
    for x in resolved:
        groups[(x['sid'], x['wk']['term'], x['wk']['start'], x['day'], x['per'], x['sub'])].append(x)
    b.comment('التحضير: سجل لكل (طالب، أسبوع، يوم، حصة، مادة)')
    for grp in groups.values():
        grp.sort(key=lambda x: (B2.to_utc(x['ts']) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc), x['r'][0]))
        keep = grp[-1]
        for old in grp[:-1]:
            b.quarantine_row('Attendance and Absence', old['r'][0], 'A:O', ' | '.join(str(raw(v)) for v in old['r'][1][:15]),
                             f"نسخة أقدم من تحضير أُعيد حفظه — المعتمد صف {keep['r'][0]}"
                             + ('' if key(old['r'][1][7]) == key(keep['r'][1][7]) else f" (الحالة تغيّرت من {raw(old['r'][1][7])} إلى {raw(keep['r'][1][7])})"))
            b.account('Attendance and Absence', old['r'][0], 'quarantined', note=f"نسخة أقدم — المعتمد صف {keep['r'][0]}")
        r = keep['r']
        b.sql("insert into public.attendance_records (student_id, week_id, day_of_week, period_no, subject_id, status_id, note, recorded_by, "
              "recorder_type, recorded_at, is_edited, source_row) values ("
              + ', '.join([f"migration.student_id({lit(keep['sid'])})", B1.cal_sql(keep['wk']), str(keep['day']), str(keep['per']),
                           f"migration.subject_id({lit(keep['sub'])})" if keep['sub'] else 'null',
                           f"(select id from public.attendance_statuses where name = {lit(keep['status'])})",
                           lit(raw(c(r, 9))), f"migration.employee_id({lit(key(c(r, 11)))})" if key(c(r, 11)) in emp_codes else 'null',
                           lit(raw(c(r, 13))), (lit(keep['ts']) + '::timestamptz') if keep['ts'] else 'now()',
                           lit(key(c(r, 15)) == 'نعم'), str(r[0])]) + ');')
        b.count('public.attendance_records')
        b.account('Attendance and Absence', r[0], 'migrated', 'attendance_records',
                  note='الترم والأسبوع استُنتجا من تاريخ التسجيل' if keep['inferred'] else None)
    return b

def batch_period_links():
    b = B1.Batch('08_period_links', 'الدفعة 5 — ربط الحصص بمحتواها')
    emp_codes = {key(c(r, 1)) for r in rows('employees')}
    tt_rows = {r[0] for r in rows('classtimetable') if key(c(r, 5)) == 'جدول حصص'}
    tasks = {r[0]: r for r in rows('tasklog')}
    forms = {r[0]: r for r in rows('forms')}
    enr = {r[0]: r for r in rows('enrichmentlog')}
    migrated_tasks = {r[0] for r in rows('tasklog') if not key(c(r, 21)) and key(c(r, 20)) not in ('فيديو', 'اثراء')
                      and key(c(r, 9)) and num(c(r, 12))}
    seen = set()
    b.comment('ربط الحصص: كان بأرقام الصفوف، صار بمعرّفات حقيقية — مع التحقق أن عنوان المحتوى المحفوظ يطابق الصف المشار إليه')
    for r in rows('periodlinks'):
        slot_row, kind, crow, title = int(num(c(r, 1)) or 0), key(c(r, 5)), int(num(c(r, 6)) or 0), key(c(r, 7))
        wk = B1.week_by_label(c(r, 3), c(r, 4))
        target, reason = None, None
        if slot_row not in tt_rows: reason = 'الحصة المشار إليها غير موجودة'
        elif not wk: reason = 'لا يمكن تحديد الأسبوع'
        elif kind == 'مهمة':
            t = tasks.get(crow)
            if not t or key(c(t, 9)) != title: reason = 'صف التكليف لا يطابق العنوان المحفوظ'
            elif key(c(t, 21)): target = ('assessment', f"migration.form_id({lit(raw(c(t, 21)))})")   # تكليف مرافق → نموذجه
            elif crow in migrated_tasks: target = ('assessment', f"migration.task_id({crow})")
            else: reason = 'التكليف المشار إليه في الحجر'
        elif kind == 'نموذج':
            f = forms.get(crow)
            if not f or key(c(f, 10)) != title: reason = 'صف النموذج لا يطابق العنوان المحفوظ'
            else: target = ('assessment', f"migration.form_id({lit(raw(c(f, 1)))})")
        elif kind in ('فيديو', 'اثراء'):
            e = enr.get(crow)
            if not e or key(c(e, 8)) != title: reason = 'صف المحتوى لا يطابق العنوان المحفوظ'
            else: target = ('content', f"migration.content_id('Enrichment Log', {crow})")
        else:
            reason = 'نوع محتوى غير معروف'
        if reason:
            b.quarantine_row('Period Links', r[0], 'A:H', ' | '.join(str(raw(x)) for x in r[1][:8]), reason)
            b.account('Period Links', r[0], 'quarantined', note=reason); continue
        dedupe = (slot_row, wk['term'], wk['start'], target)
        if dedupe in seen:
            b.account('Period Links', r[0], 'merged', 'period_links', note='ربط مكرر لنفس الحصة والأسبوع والمحتوى'); continue
        seen.add(dedupe)
        ts = parse_ts(c(r, 8))
        b.sql("insert into public.period_links (slot_id, week_id, assessment_id, content_item_id, linked_by, linked_at, source_row) values ("
              + ', '.join([f"migration.slot_id({slot_row})", B1.cal_sql(wk),
                           target[1] if target[0] == 'assessment' else 'null', target[1] if target[0] == 'content' else 'null',
                           f"migration.employee_id({lit(key(c(r, 2)))})" if key(c(r, 2)) in emp_codes else 'null',
                           (lit(ts) + '::timestamptz') if ts else 'now()', str(r[0])]) + ');')
        b.count('public.period_links')
        b.account('Period Links', r[0], 'migrated', 'period_links')
    return b

if __name__ == '__main__':
    baseline = collections.Counter()
    for fn in [B1.batch_reference, B1.batch_people, B1.batch_calendar, B1.batch_activity, B2.batch_forms, B3.batch_grades]:
        prev = fn()
        for t, n in prev.expect.items(): baseline[t] += n
        for s_, n in prev.accounted.items(): baseline['rowmap:' + s_] += n
    for fn in [batch_attendance, batch_period_links]:
        b = fn()
        with open(os.path.join(OUT, b.name + '.sql'), 'w', encoding='utf-8') as f:
            f.write(b.render(dict(baseline)))
        for t, n in b.expect.items(): baseline[t] += n
        for s_, n in b.accounted.items(): baseline['rowmap:' + s_] += n
        reasons = collections.Counter(q[4].split(' — ')[0] for q in b.quarantine)
        print(f'{b.name}: {sum(b.expect.values())} سجل، {len(b.quarantine)} في الحجر {dict(reasons)}، {sum(b.accounted.values())} صف محاسَب')
