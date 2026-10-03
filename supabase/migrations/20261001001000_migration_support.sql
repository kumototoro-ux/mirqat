-- =====================================================================
-- مِرقاة — 10: دعم نقل البيانات
-- staging : نسخة طبق الأصل من كل شيت (تُنشأ وقت النقل، كل الأعمدة نص + رقم الصف الأصلي)
-- migration.quarantine : كل قيمة لم تُنقل — لا تُحذف ولا تُخمَّن، تُحفظ هنا مع سببها
-- لا يصل لهذين المخططين أي مستخدم عبر API إطلاقًا.
-- =====================================================================

create table migration.runs (
  id           integer generated always as identity primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  source_label text,                  -- مثال: "نسخة 2026-10-01 مساءً"
  source_hash  text,                  -- بصمة SHA-256 للقطة المصدر
  status       text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  notes        text
);

create table migration.quarantine (
  id             bigint generated always as identity primary key,
  run_id         integer references migration.runs(id),
  source_sheet   text not null,
  source_row     integer,
  source_column  text,
  raw_value      text,
  reason         text not null,
  resolved       boolean not null default false,
  resolution     text,
  created_at     timestamptz not null default now()
);
create index quarantine_sheet_idx on migration.quarantine (source_sheet, resolved);

create table migration.row_counts (
  run_id         integer references migration.runs(id),
  source_sheet   text not null,
  source_rows    integer not null,
  migrated_rows  integer not null,
  quarantined    integer not null,
  primary key (run_id, source_sheet)
);
comment on table migration.row_counts is 'التحقق الأول: source_rows = migrated_rows + quarantined لكل شيت، وإلا يُرفض النقل';
