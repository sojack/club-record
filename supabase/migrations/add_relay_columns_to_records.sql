-- Relay-only columns on records. All nullable; populated only for rows in a
-- relay list. Leg-1 swimmer reuses the existing swimmer_name column.
ALTER TABLE records ADD COLUMN IF NOT EXISTS swimmer_name_2 TEXT;
ALTER TABLE records ADD COLUMN IF NOT EXISTS swimmer_name_3 TEXT;
ALTER TABLE records ADD COLUMN IF NOT EXISTS swimmer_name_4 TEXT;
ALTER TABLE records ADD COLUMN IF NOT EXISTS age_group TEXT;
ALTER TABLE records ADD COLUMN IF NOT EXISTS record_club TEXT;
ALTER TABLE records ADD COLUMN IF NOT EXISTS province TEXT;
