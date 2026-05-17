-- Add relay support to record_lists.
-- record_type: 'individual' (default, all existing lists) or 'relay'
-- scope: only meaningful for relay lists. 'club' = internal (no holding club);
--        'national_provincial' = each record carries a holding club + province.
ALTER TABLE record_lists
  ADD COLUMN IF NOT EXISTS record_type TEXT NOT NULL DEFAULT 'individual'
    CHECK (record_type IN ('individual', 'relay'));

ALTER TABLE record_lists
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'club'
    CHECK (scope IN ('club', 'national_provincial'));

-- Widen the existing gender CHECK to allow 'mixed' (relays only).
-- The original constraint from add_gender_to_record_lists.sql is unnamed;
-- Postgres auto-names it record_lists_gender_check.
ALTER TABLE record_lists DROP CONSTRAINT IF EXISTS record_lists_gender_check;
ALTER TABLE record_lists
  ADD CONSTRAINT record_lists_gender_check
    CHECK (gender IN ('male', 'female', 'mixed'));
