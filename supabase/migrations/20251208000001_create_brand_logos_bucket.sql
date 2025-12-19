-- Create storage bucket for brand logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-logos', 'brand-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for brand-logos bucket
CREATE POLICY "Authenticated users can upload brand logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'brand-logos');

CREATE POLICY "Public read access for brand logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'brand-logos');

CREATE POLICY "Users can update own brand logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'brand-logos');

CREATE POLICY "Users can delete own brand logos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'brand-logos');












