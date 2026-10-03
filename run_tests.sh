#!/bin/bash
# يبني قاعدة فارغة، يطبّق كل الهجرات بالترتيب، ثم يشغّل الاختبارات
set -e
DB=mirqat_test
su postgres -c "dropdb --if-exists $DB" >/dev/null
su postgres -c "createdb $DB"
run() { su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f '$1'" ; }
run tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do echo "▶ $(basename $f)"; run "$f"; done
for f in tests/[1-9]*.sql; do echo "🧪 $(basename $f)"; run "$f"; done
echo "✅ كل الهجرات والاختبارات نجحت"
