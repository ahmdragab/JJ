-- Quick fix script for Styles RLS policies
-- Run this in your Supabase SQL editor if migrations haven't been applied

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can view active styles" ON styles;
DROP POLICY IF EXISTS "Authenticated users can manage styles" ON styles;
DROP POLICY IF EXISTS "Authenticated users can view all styles" ON styles;
DROP POLICY IF EXISTS "Authenticated users can insert styles" ON styles;
DROP POLICY IF EXISTS "Authenticated users can update styles" ON styles;
DROP POLICY IF EXISTS "Authenticated users can delete styles" ON styles;

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

-- Verify storage policies exist
-- If these fail, the bucket might not exist yet - run the migration first
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Authenticated users can upload styles'
  ) THEN
    CREATE POLICY "Authenticated users can upload styles"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'styles');
  END IF;
END $$;

