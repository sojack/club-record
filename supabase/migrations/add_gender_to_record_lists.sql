-- Add gender column to record_lists table
ALTER TABLE record_lists ADD COLUMN gender TEXT CHECK (gender IN ('male', 'female'));

-- Create index for efficient grouping queries
CREATE INDEX idx_record_lists_course_gender ON record_lists (course_type, gender);
