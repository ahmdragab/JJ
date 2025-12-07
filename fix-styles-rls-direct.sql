-- Direct fix for Styles RLS policies
-- Copy and paste this entire script into Supabase SQL Editor and run it

-- First, check if the styles table exists and has RLS enabled
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'styles') THEN
    RAISE EXCEPTION 'Styles table does not exist. Please run the migration first.';
  END IF;
END $$;

-- Disable RLS temporarily to drop all policies
ALTER TABLE styles DISABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies on styles table
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'styles') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON styles', r.policyname);
  END LOOP;
END $$;

-- Re-enable RLS
ALTER TABLE styles ENABLE ROW LEVEL SECURITY;

-- Create correct policies
CREATE POLICY "Authenticated users can view all styles"
  ON styles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert styles"
  ON styles FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update styles"
  ON styles FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete styles"
  ON styles FOR DELETE
  TO authenticated
  USING (true);

-- Verify policies were created
SELECT 
  policyname, 
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename = 'styles'
ORDER BY policyname;

