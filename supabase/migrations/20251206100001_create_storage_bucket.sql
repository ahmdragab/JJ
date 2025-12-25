-- Create storage bucket for brand images
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-images', 'brand-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'brand-images');

-- Allow public read access
CREATE POLICY "Public read access for brand images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'brand-images');

-- Allow users to delete their own images
CREATE POLICY "Users can delete own images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'brand-images');

















