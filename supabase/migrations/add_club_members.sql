-- Club Members Feature Migration
-- Adds multi-user collaboration with role-based access control

-- 1. Create club_members table
CREATE TABLE club_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (club_id, user_id)
);

-- Create indexes for performance
CREATE INDEX idx_club_members_club_id ON club_members(club_id);
CREATE INDEX idx_club_members_user_id ON club_members(user_id);

-- 2. Migrate existing data: Insert current club owners into club_members
INSERT INTO club_members (club_id, user_id, role)
SELECT id, user_id, 'owner'
FROM clubs;

-- 3. Create trigger to auto-add creator as owner when club is created
CREATE OR REPLACE FUNCTION add_club_owner_on_create()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO club_members (club_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_add_club_owner
  AFTER INSERT ON clubs
  FOR EACH ROW
  EXECUTE FUNCTION add_club_owner_on_create();

-- 4. Create helper functions

-- Function to get club members with email (owner only)
CREATE OR REPLACE FUNCTION get_club_members_with_email(p_club_id UUID)
RETURNS TABLE (
  id UUID,
  club_id UUID,
  user_id UUID,
  role TEXT,
  created_at TIMESTAMPTZ,
  email TEXT
) AS $$
BEGIN
  -- Check if caller is owner
  IF NOT EXISTS (
    SELECT 1 FROM club_members
    WHERE club_members.club_id = p_club_id
      AND club_members.user_id = auth.uid()
      AND club_members.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only club owners can view member emails';
  END IF;

  RETURN QUERY
  SELECT
    cm.id,
    cm.club_id,
    cm.user_id,
    cm.role,
    cm.created_at,
    au.email::TEXT
  FROM club_members cm
  JOIN auth.users au ON au.id = cm.user_id
  WHERE cm.club_id = p_club_id
  ORDER BY
    CASE cm.role
      WHEN 'owner' THEN 1
      WHEN 'editor' THEN 2
      WHEN 'viewer' THEN 3
    END,
    cm.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add club member by email
CREATE OR REPLACE FUNCTION add_club_member_by_email(
  p_club_id UUID,
  p_email TEXT,
  p_role TEXT
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_member_id UUID;
BEGIN
  -- Check if caller is owner
  IF NOT EXISTS (
    SELECT 1 FROM club_members
    WHERE club_id = p_club_id
      AND user_id = auth.uid()
      AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only club owners can add members';
  END IF;

  -- Validate role (cannot add as owner)
  IF p_role NOT IN ('editor', 'viewer') THEN
    RAISE EXCEPTION 'Role must be editor or viewer';
  END IF;

  -- Find user by email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_email;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found with email %', p_email;
  END IF;

  -- Check if already a member
  IF EXISTS (
    SELECT 1 FROM club_members
    WHERE club_id = p_club_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'User is already a member of this club';
  END IF;

  -- Add member
  INSERT INTO club_members (club_id, user_id, role)
  VALUES (p_club_id, v_user_id, p_role)
  RETURNING id INTO v_member_id;

  RETURN v_member_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to transfer club ownership (atomic)
CREATE OR REPLACE FUNCTION transfer_club_ownership(
  p_club_id UUID,
  p_new_owner_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_current_owner_id UUID;
BEGIN
  -- Get current owner
  SELECT user_id INTO v_current_owner_id
  FROM club_members
  WHERE club_id = p_club_id AND role = 'owner';

  -- Check if caller is current owner
  IF v_current_owner_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the current owner can transfer ownership';
  END IF;

  -- Check if new owner is a member
  IF NOT EXISTS (
    SELECT 1 FROM club_members
    WHERE club_id = p_club_id AND user_id = p_new_owner_id
  ) THEN
    RAISE EXCEPTION 'New owner must be an existing member of the club';
  END IF;

  -- Perform atomic transfer
  UPDATE club_members
  SET role = 'editor'
  WHERE club_id = p_club_id AND user_id = v_current_owner_id;

  UPDATE club_members
  SET role = 'owner'
  WHERE club_id = p_club_id AND user_id = p_new_owner_id;

  -- Update the clubs table user_id as well (for backwards compatibility)
  UPDATE clubs
  SET user_id = p_new_owner_id
  WHERE id = p_club_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update member role (owner only, cannot change owner)
CREATE OR REPLACE FUNCTION update_club_member_role(
  p_member_id UUID,
  p_new_role TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_club_id UUID;
  v_target_user_id UUID;
  v_target_current_role TEXT;
BEGIN
  -- Get member info
  SELECT club_id, user_id, role
  INTO v_club_id, v_target_user_id, v_target_current_role
  FROM club_members
  WHERE id = p_member_id;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  -- Check if caller is owner
  IF NOT EXISTS (
    SELECT 1 FROM club_members
    WHERE club_id = v_club_id
      AND user_id = auth.uid()
      AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only club owners can change member roles';
  END IF;

  -- Cannot change owner role (use transfer_club_ownership instead)
  IF v_target_current_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot change owner role. Use transfer ownership instead.';
  END IF;

  -- Validate new role
  IF p_new_role NOT IN ('editor', 'viewer') THEN
    RAISE EXCEPTION 'Role must be editor or viewer';
  END IF;

  -- Update role
  UPDATE club_members
  SET role = p_new_role
  WHERE id = p_member_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to remove club member (owner only, cannot remove self)
CREATE OR REPLACE FUNCTION remove_club_member(p_member_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_club_id UUID;
  v_target_user_id UUID;
BEGIN
  -- Get member info
  SELECT club_id, user_id INTO v_club_id, v_target_user_id
  FROM club_members
  WHERE id = p_member_id;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  -- Check if caller is owner
  IF NOT EXISTS (
    SELECT 1 FROM club_members
    WHERE club_id = v_club_id
      AND user_id = auth.uid()
      AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only club owners can remove members';
  END IF;

  -- Cannot remove self (owner)
  IF v_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot remove yourself. Transfer ownership first.';
  END IF;

  -- Delete member
  DELETE FROM club_members WHERE id = p_member_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Update RLS policies

-- Enable RLS on club_members
ALTER TABLE club_members ENABLE ROW LEVEL SECURITY;

-- Club members policies
CREATE POLICY "Members can view their own membership"
  ON club_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Owners can view all members of their clubs"
  ON club_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM club_members owner_check
      WHERE owner_check.club_id = club_members.club_id
        AND owner_check.user_id = auth.uid()
        AND owner_check.role = 'owner'
    )
  );

-- Direct insert/update/delete handled by functions with SECURITY DEFINER

-- Update clubs policies
DROP POLICY IF EXISTS "Users can view their own clubs" ON clubs;
DROP POLICY IF EXISTS "Users can insert their own clubs" ON clubs;
DROP POLICY IF EXISTS "Users can update their own clubs" ON clubs;
DROP POLICY IF EXISTS "Users can delete their own clubs" ON clubs;

CREATE POLICY "Members can view their clubs"
  ON clubs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_members.club_id = clubs.id
        AND club_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can insert clubs"
  ON clubs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can update their clubs"
  ON clubs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_members.club_id = clubs.id
        AND club_members.user_id = auth.uid()
        AND club_members.role = 'owner'
    )
  );

CREATE POLICY "Owners can delete their clubs"
  ON clubs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_members.club_id = clubs.id
        AND club_members.user_id = auth.uid()
        AND club_members.role = 'owner'
    )
  );

-- Update record_lists policies
DROP POLICY IF EXISTS "Users can view their club record lists" ON record_lists;
DROP POLICY IF EXISTS "Users can insert record lists for their clubs" ON record_lists;
DROP POLICY IF EXISTS "Users can update their club record lists" ON record_lists;
DROP POLICY IF EXISTS "Users can delete their club record lists" ON record_lists;

CREATE POLICY "Members can view their club record lists"
  ON record_lists FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_members.club_id = record_lists.club_id
        AND club_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners and editors can insert record lists"
  ON record_lists FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_members.club_id = record_lists.club_id
        AND club_members.user_id = auth.uid()
        AND club_members.role IN ('owner', 'editor')
    )
  );

CREATE POLICY "Owners and editors can update record lists"
  ON record_lists FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_members.club_id = record_lists.club_id
        AND club_members.user_id = auth.uid()
        AND club_members.role IN ('owner', 'editor')
    )
  );

CREATE POLICY "Owners and editors can delete record lists"
  ON record_lists FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_members.club_id = record_lists.club_id
        AND club_members.user_id = auth.uid()
        AND club_members.role IN ('owner', 'editor')
    )
  );

-- Update records policies
DROP POLICY IF EXISTS "Users can view records of their club lists" ON records;
DROP POLICY IF EXISTS "Users can insert records to their club lists" ON records;
DROP POLICY IF EXISTS "Users can update records in their club lists" ON records;
DROP POLICY IF EXISTS "Users can delete records from their club lists" ON records;

CREATE POLICY "Members can view records of their club lists"
  ON records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM record_lists
      JOIN club_members ON club_members.club_id = record_lists.club_id
      WHERE record_lists.id = records.record_list_id
        AND club_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners and editors can insert records"
  ON records FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM record_lists
      JOIN club_members ON club_members.club_id = record_lists.club_id
      WHERE record_lists.id = records.record_list_id
        AND club_members.user_id = auth.uid()
        AND club_members.role IN ('owner', 'editor')
    )
  );

CREATE POLICY "Owners and editors can update records"
  ON records FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM record_lists
      JOIN club_members ON club_members.club_id = record_lists.club_id
      WHERE record_lists.id = records.record_list_id
        AND club_members.user_id = auth.uid()
        AND club_members.role IN ('owner', 'editor')
    )
  );

CREATE POLICY "Owners and editors can delete records"
  ON records FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM record_lists
      JOIN club_members ON club_members.club_id = record_lists.club_id
      WHERE record_lists.id = records.record_list_id
        AND club_members.user_id = auth.uid()
        AND club_members.role IN ('owner', 'editor')
    )
  );
