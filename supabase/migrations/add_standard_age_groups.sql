-- Admin-editable standard age-group bands (mirrors standard_events: it has no
-- admin UI either; edited directly in Supabase). Public-readable so the
-- relay editor's datalist can be populated with the anon key.
CREATE TABLE IF NOT EXISTS standard_age_groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE standard_age_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "standard_age_groups public read" ON standard_age_groups;
CREATE POLICY "standard_age_groups public read"
  ON standard_age_groups FOR SELECT USING (true);

DROP POLICY IF EXISTS "standard_age_groups authenticated write" ON standard_age_groups;
CREATE POLICY "standard_age_groups authenticated write"
  ON standard_age_groups FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

INSERT INTO standard_age_groups (name, sort_order) VALUES
  ('72-99', 1),
  ('100-119', 2),
  ('120-159', 3),
  ('160-199', 4),
  ('200-239', 5),
  ('240-279', 6),
  ('280-319', 7),
  ('320-359', 8),
  ('360-399', 9)
ON CONFLICT (name) DO NOTHING;
