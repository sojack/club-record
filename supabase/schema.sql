-- Club Record Database Schema
-- Run this in your Supabase SQL Editor to set up the database

-- Club profile (single club for MVP)
CREATE TABLE clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  short_name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  logo_url TEXT,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Record lists (e.g., "Girls 12 & Under")
CREATE TABLE record_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  course_type TEXT DEFAULT 'LCM',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(club_id, slug)
);

-- Individual records
CREATE TABLE records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_list_id UUID REFERENCES record_lists(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  swimmer_name TEXT NOT NULL,
  record_date TEXT,
  location TEXT,
  sort_order INTEGER DEFAULT 0,
  is_national BOOLEAN DEFAULT FALSE,
  is_current_national BOOLEAN DEFAULT FALSE,
  is_provincial BOOLEAN DEFAULT FALSE,
  is_current_provincial BOOLEAN DEFAULT FALSE,
  is_split BOOLEAN DEFAULT FALSE,
  is_relay_split BOOLEAN DEFAULT FALSE,
  is_new BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Standard events template
CREATE TABLE standard_events (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

-- Insert standard swimming events
INSERT INTO standard_events (name, sort_order) VALUES
  ('50 Free', 1), ('100 Free', 2), ('200 Free', 3), ('400 Free', 4),
  ('800 Free', 5), ('1500 Free', 6),
  ('50 Back', 7), ('100 Back', 8), ('200 Back', 9),
  ('50 Breast', 10), ('100 Breast', 11), ('200 Breast', 12),
  ('50 Fly', 13), ('100 Fly', 14), ('200 Fly', 15),
  ('200 IM', 16), ('400 IM', 17);

-- Enable Row Level Security
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE record_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE standard_events ENABLE ROW LEVEL SECURITY;

-- Clubs policies
CREATE POLICY "Users can view own club" ON clubs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own club" ON clubs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own club" ON clubs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Public can view clubs by slug" ON clubs
  FOR SELECT USING (true);

-- Record lists policies
CREATE POLICY "Users can manage own record lists" ON record_lists
  FOR ALL USING (
    club_id IN (SELECT id FROM clubs WHERE user_id = auth.uid())
  );

CREATE POLICY "Public can view record lists" ON record_lists
  FOR SELECT USING (true);

-- Records policies
CREATE POLICY "Users can manage own records" ON records
  FOR ALL USING (
    record_list_id IN (
      SELECT rl.id FROM record_lists rl
      JOIN clubs c ON rl.club_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );

CREATE POLICY "Public can view records" ON records
  FOR SELECT USING (true);

-- Standard events policies (read-only for all)
CREATE POLICY "Anyone can view standard events" ON standard_events
  FOR SELECT USING (true);

-- Create indexes for better query performance
CREATE INDEX idx_clubs_user_id ON clubs(user_id);
CREATE INDEX idx_clubs_slug ON clubs(slug);
CREATE INDEX idx_record_lists_club_id ON record_lists(club_id);
CREATE INDEX idx_record_lists_slug ON record_lists(slug);
CREATE INDEX idx_records_record_list_id ON records(record_list_id);
CREATE INDEX idx_records_sort_order ON records(sort_order);
