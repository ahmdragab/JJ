/*
  # Fix Styles RLS Policies
  
  Replaces the single "FOR ALL" policy with separate policies for INSERT, UPDATE, and DELETE.
  Also allows viewing all styles (not just active ones) for admin management.
*/

-- Drop the existing policy
DROP POLICY IF EXISTS "Authenticated users can manage styles" ON styles;

-- Allow authenticated users to view all styles (for admin management)
DROP POLICY IF EXISTS "Authenticated users can view active styles" ON styles;
CREATE POLICY "Authenticated users can view all styles"
  ON styles FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert styles
CREATE POLICY "Authenticated users can insert styles"
  ON styles FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update styles
CREATE POLICY "Authenticated users can update styles"
  ON styles FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to delete styles
CREATE POLICY "Authenticated users can delete styles"
  ON styles FOR DELETE
  TO authenticated
  USING (true);

