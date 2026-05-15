-- Migration: Add trigger-maintained updated_at to clubs, record_lists, records
-- Lets us answer "when did a user last update their data".
-- Safe to re-run (idempotent).

-- 1. Add the column nullable, backfill from created_at (NOT NOW(): existing
--    rows must reflect their real age, not the migration run time), then
--    enforce NOT NULL + DEFAULT for future rows.

ALTER TABLE clubs        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE record_lists ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE records      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE clubs        SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE record_lists SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE records      SET updated_at = created_at WHERE updated_at IS NULL;

ALTER TABLE clubs        ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE record_lists ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE records      ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE clubs        ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE record_lists ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE records      ALTER COLUMN updated_at SET NOT NULL;

-- 2. Shared trigger function. BEFORE UPDATE so the stored row carries the
--    new timestamp. Centralized here so every write path (RecordTable inline
--    edits, CSVUploader, the admin upload route) is covered automatically.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Attach to each table. DROP IF EXISTS first so the file stays re-runnable.
--    The WHEN clause skips no-op UPDATEs so updated_at only moves on real
--    changes. (Inserts already get updated_at via the column DEFAULT.)

DROP TRIGGER IF EXISTS trigger_set_updated_at ON clubs;
CREATE TRIGGER trigger_set_updated_at
  BEFORE UPDATE ON clubs
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trigger_set_updated_at ON record_lists;
CREATE TRIGGER trigger_set_updated_at
  BEFORE UPDATE ON record_lists
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trigger_set_updated_at ON records;
CREATE TRIGGER trigger_set_updated_at
  BEFORE UPDATE ON records
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION set_updated_at();

-- 4. How to check when a given user last updated their data.
--    max(updated_at) per table already covers inserts (DEFAULT NOW()),
--    edits (trigger), and backfilled history (= created_at).
--
--    SELECT GREATEST(
--             COALESCE(MAX(c.updated_at),  'epoch'),
--             COALESCE(MAX(rl.updated_at), 'epoch'),
--             COALESCE(MAX(r.updated_at),  'epoch')
--           ) AS last_activity
--    FROM clubs c
--    LEFT JOIN record_lists rl ON rl.club_id = c.id
--    LEFT JOIN records r       ON r.record_list_id = rl.id
--    WHERE c.user_id = :user_id;          -- owners
--    -- For editors too, resolve clubs via club_members.user_id instead.
