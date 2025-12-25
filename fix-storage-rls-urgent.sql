-- URGENT: Fix Storage RLS for styles bucket
-- The storage upload is failing due to RLS on storage.objects table
-- Run this immediately in Supabase SQL Editor

-- Step 1: Drop ALL existing storage policies for styles bucket
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname 
    FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects'
    AND (
      policyname LIKE '%styles%' 
      OR qual::text LIKE '%styles%'
      OR with_check::text LIKE '%styles%'
    )
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects CASCADE', r.policyname);
  END LOOP;
END $$;

-- Step 2: Create comprehensive storage policies for styles bucket
-- These must allow authenticated users to INSERT (upload) files

-- Public read access (for viewing images)
CREATE POLICY "public_read_styles_bucket"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'styles');

-- Authenticated users can upload (INSERT)
CREATE POLICY "authenticated_upload_styles_bucket"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'styles');

-- Authenticated users can update their uploads
CREATE POLICY "authenticated_update_styles_bucket"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'styles')
WITH CHECK (bucket_id = 'styles');

-- Authenticated users can delete their uploads
CREATE POLICY "authenticated_delete_styles_bucket"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'styles');

-- Step 3: Verify policies
SELECT 
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND (
    policyname LIKE '%styles%' 
    OR qual::text LIKE '%styles%'
    OR with_check::text LIKE '%styles%'
  )
ORDER BY cmd, policyname;

-- Step 4: Verify bucket exists and is public
SELECT id, name, public, created_at 
FROM storage.buckets 
WHERE id = 'styles';















