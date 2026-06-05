-- Per-distance cumulative split times for a record (null when unknown).
-- Shape: [{ "distance": 50, "ms": 29100 }, { "distance": 100, "ms": 62780 }]
-- Distinct from the is_split / is_relay_split boolean flags.
ALTER TABLE records ADD COLUMN IF NOT EXISTS split_times JSONB;
