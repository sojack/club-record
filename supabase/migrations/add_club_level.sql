ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'regular'
    CHECK (level IN ('regular', 'provincial', 'national'));
ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS province TEXT;
