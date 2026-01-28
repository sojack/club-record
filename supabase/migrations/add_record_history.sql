-- Add history tracking fields to records table
-- superseded_by: points to the NEW record that broke this one
-- is_current: false if this record has been broken

ALTER TABLE records ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES records(id) ON DELETE SET NULL;
ALTER TABLE records ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT true;

-- Index for efficient filtering of current records
CREATE INDEX IF NOT EXISTS idx_records_is_current ON records(record_list_id, is_current);

-- Index for finding history chain
CREATE INDEX IF NOT EXISTS idx_records_superseded_by ON records(superseded_by);
