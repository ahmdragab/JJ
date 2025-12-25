/*
  # Brand Assets Table
  
  Creates a table for storing brand-specific assets that users can upload
  and select when generating designs.
  
  Asset types:
  - 'asset': Must appear in the design (product photos, UI screenshots, etc.)
  - 'reference': Style reference only (moodboards, inspiration images)
*/

-- Create brand_assets table
CREATE TABLE brand_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  
  -- Asset info
  name text NOT NULL,
  description text,
  url text NOT NULL,
  
  -- Classification
  type text NOT NULL CHECK (type IN ('asset', 'reference')),
  category text, -- 'product', 'ui_screen', 'lifestyle', 'moodboard', 'campaign', etc.
  
  -- Metadata
  file_size integer, -- in bytes
  mime_type text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE brand_assets ENABLE ROW LEVEL SECURITY;

-- Users can view assets for brands they own
CREATE POLICY "Users can view own brand assets"
  ON brand_assets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM brands 
      WHERE brands.id = brand_assets.brand_id 
      AND brands.user_id = auth.uid()
    )
  );

-- Users can create assets for brands they own
CREATE POLICY "Users can create own brand assets"
  ON brand_assets FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM brands 
      WHERE brands.id = brand_assets.brand_id 
      AND brands.user_id = auth.uid()
    )
  );

-- Users can update their own assets
CREATE POLICY "Users can update own brand assets"
  ON brand_assets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own assets
CREATE POLICY "Users can delete own brand assets"
  ON brand_assets FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX brand_assets_brand_id_idx ON brand_assets(brand_id);
CREATE INDEX brand_assets_user_id_idx ON brand_assets(user_id);
CREATE INDEX brand_assets_type_idx ON brand_assets(type);
CREATE INDEX brand_assets_created_at_idx ON brand_assets(created_at DESC);

-- Create storage bucket for brand assets if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-assets', 'brand-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for brand-assets bucket
CREATE POLICY "Authenticated users can upload brand assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'brand-assets');

CREATE POLICY "Public read access for brand assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'brand-assets');

CREATE POLICY "Users can delete own brand assets from storage"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'brand-assets');

















