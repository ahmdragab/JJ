-- Final fix for Styles RLS - More explicit approach
-- Run this in Supabase SQL Editor

-- Step 1: Drop ALL existing policies (using a more aggressive approach)
ALTER TABLE styles DISABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'styles'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON styles CASCADE', r.policyname);
  END LOOP;
END $$;

-- Step 2: Re-enable RLS
ALTER TABLE styles ENABLE ROW LEVEL SECURITY;

-- Step 3: Create policies with explicit role grants
CREATE POLICY "authenticated_select_styles"
  ON styles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_styles"
  ON styles
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_styles"
  ON styles
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_styles"
  ON styles
  FOR DELETE
  TO authenticated
  USING (true);

-- Step 4: Verify the policies
SELECT 
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename = 'styles'
ORDER BY cmd;

-- Step 5: Test insert (this should work now)
-- Uncomment the line below to test
-- INSERT INTO styles (name, url, category, is_active) VALUES ('test', 'https://test.com/test.png', 'creative', true);

