-- The existing scope CHECK is the unnamed inline constraint from
-- add_relay_fields_to_record_lists.sql; Postgres auto-names it
-- record_lists_scope_check. Drop -> migrate values -> re-add (order matters).
ALTER TABLE record_lists DROP CONSTRAINT IF EXISTS record_lists_scope_check;
UPDATE record_lists SET scope = 'national' WHERE scope = 'national_provincial';
ALTER TABLE record_lists
  ADD CONSTRAINT record_lists_scope_check
    CHECK (scope IN ('club', 'provincial', 'national'));
