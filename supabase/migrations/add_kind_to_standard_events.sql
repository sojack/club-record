-- Tag standard_events so the relay editor's datalist can filter to relay names
-- without polluting individual-event suggestions.
ALTER TABLE standard_events
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'individual'
    CHECK (kind IN ('individual', 'relay'));

-- Seed relay event names. Guarded so re-running is safe even if there is no
-- UNIQUE constraint on standard_events.name.
INSERT INTO standard_events (name, sort_order, kind)
SELECT v.name, v.sort_order, 'relay'
FROM (VALUES
  ('4 X 50 Freestyle Relay', 1001),
  ('4 X 100 Freestyle Relay', 1002),
  ('4 X 50 Medley Relay', 1003),
  ('4 X 100 Medley Relay', 1004)
) AS v(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM standard_events e WHERE e.name = v.name AND e.kind = 'relay'
);
