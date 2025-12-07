-- Diagnostic script to check Styles RLS issues
-- Run this to see what's happening

-- 1. Check current user and authentication
SELECT 
  current_user as current_db_user,
  session_user as session_user,
  current_setting('request.jwt.claims', true)::json->>'email' as email,
  current_setting('request.jwt.claims', true)::json->>'role' as role;

-- 2. Check all policies on styles table
SELECT 
  policyname,
  cmd,
  qual,
  with_check,
  roles
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename = 'styles'
ORDER BY policyname;

-- 3. Check if RLS is enabled
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename = 'styles';

-- 4. Try a test insert (this will show the actual error)
-- Replace 'test' with actual values
DO $$
BEGIN
  INSERT INTO styles (name, url, category, is_active)
  VALUES ('test', 'https://test.com/image.png', 'creative', true);
  RAISE NOTICE 'Insert successful!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Insert failed: %', SQLERRM;
END $$;

-- 5. Check if there are any conflicting policies on storage.objects
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND policyname LIKE '%styles%'
ORDER BY policyname;

