/*
  # Styles Table
  
  Creates a table for storing shared/public style reference images.
  Styles are available to all users and organized by categories.
  
  Unlike brand_assets (which are brand-specific), styles are global
  and can be used by anyone as reference images.
*/

-- Create styles table
CREATE TABLE styles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Style info
  name text NOT NULL,
  description text,
  url text NOT NULL,
  
  -- Organization
  category text NOT NULL, -- 'minimalist', 'bold', 'corporate', 'creative', 'modern', 'vintage', etc.
  
  -- Metadata
  file_size integer, -- in bytes
  mime_type text,
  
  -- Display order within category
  display_order integer DEFAULT 0 NOT NULL,
  
  -- Admin control
  is_active boolean DEFAULT true NOT NULL,
  
  -- Timestamps
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE styles ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view all styles (for admin management)
CREATE POLICY "Authenticated users can view all styles"
  ON styles FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert styles
CREATE POLICY "Authenticated users can insert styles"
  ON styles FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update styles
CREATE POLICY "Authenticated users can update styles"
  ON styles FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to delete styles
CREATE POLICY "Authenticated users can delete styles"
  ON styles FOR DELETE
  TO authenticated
  USING (true);

-- Create indexes for performance
CREATE INDEX styles_category_idx ON styles(category);
CREATE INDEX styles_is_active_idx ON styles(is_active);
CREATE INDEX styles_display_order_idx ON styles(category, display_order);
CREATE INDEX styles_created_at_idx ON styles(created_at DESC);

-- Create storage bucket for styles if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('styles', 'styles', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for styles bucket
CREATE POLICY "Public read access for styles"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'styles');

CREATE POLICY "Authenticated users can upload styles"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'styles');

CREATE POLICY "Authenticated users can update styles"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'styles');

CREATE POLICY "Authenticated users can delete styles"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'styles');

