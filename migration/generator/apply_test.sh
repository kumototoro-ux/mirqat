#!/bin/bash
# قاعدة جديدة = نفس Supabase + كل الهجرات، ثم ملفات النقل بالترتيب
DB=${DB:-mig_test}
su postgres -c "dropdb --if-exists $DB" >/dev/null 2>&1
su postgres -c "createdb $DB"
run() {
  out=$(su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f '$1'" 2>&1); rc=$?
  echo "$out" | grep -vE '^$' | sed 's/psql:.*NOTICE:  //' || true
  return $rc
}
run /home/claude/mirqat-db/tests/00_supabase_stub.sql >/dev/null || exit 1
for f in /home/claude/mirqat-db/supabase/migrations/*.sql; do run "$f" >/dev/null || { echo "فشل: $f"; exit 1; }; done
for f in "$@"; do echo "▶ $(basename $f)"; run "$f" || { echo "❌ فشل: $f"; exit 1; }; done
echo "✅ تم تطبيق كل الملفات"
