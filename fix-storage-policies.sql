-- Fix storage policies for styles bucket
-- Run this in Supabase SQL Editor

-- First, check if bucket exists
SELECT id, name, public FROM storage.buckets WHERE id = 'styles';

-- Drop existing storage policies for styles (if any)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname 
    FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects'
    AND (policyname LIKE '%styles%' OR qual::text LIKE '%styles%')
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

-- Create storage policies for styles bucket
-- Public read access
CREATE POLICY "public_read_styles"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'styles');

-- Authenticated users can upload
CREATE POLICY "authenticated_upload_styles"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'styles');

-- Authenticated users can update
CREATE POLICY "authenticated_update_styles_storage"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'styles')
WITH CHECK (bucket_id = 'styles');

-- Authenticated users can delete
CREATE POLICY "authenticated_delete_styles_storage"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'styles');

-- Verify policies were created
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND (policyname LIKE '%styles%' OR qual::text LIKE '%styles%')
ORDER BY policyname;



