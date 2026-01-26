-- Add World Record flag to records table
ALTER TABLE records ADD COLUMN IF NOT EXISTS is_world_record BOOLEAN NOT NULL DEFAULT false;
