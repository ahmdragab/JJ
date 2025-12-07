-- Check storage policies for styles bucket
-- This queries the actual storage.objects policies

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

-- If no results, check all storage policies
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
ORDER BY policyname;

-- Check if the styles bucket exists
SELECT 
  id,
  name,
  public,
  created_at
FROM storage.buckets
WHERE id = 'styles';

