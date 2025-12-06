/*
  # Core Schema for Brand Design Automation Platform

  1. New Tables
    - `brands`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `domain` (text)
      - `name` (text)
      - `logos` (jsonb) - primary, secondary, icon URLs
      - `colors` (jsonb) - color tokens (primary, secondary, background, etc.)
      - `fonts` (jsonb) - heading and body fonts
      - `voice` (jsonb) - tone, energy, adjectives, keywords
      - `status` (text) - draft, extracting, ready, error
      - `extraction_data` (jsonb) - raw extraction metadata
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `templates`
      - `id` (uuid, primary key)
      - `name` (text)
      - `type` (text) - web_hero, social_post, email_header, etc.
      - `category` (text)
      - `aspect_ratio` (text)
      - `slots` (jsonb) - slot definitions (headline, body, image, etc.)
      - `style` (jsonb) - token mappings
      - `preview_url` (text)
      - `is_active` (boolean)
      - `created_at` (timestamptz)
    
    - `designs`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `brand_id` (uuid, references brands)
      - `template_id` (uuid, references templates)
      - `slots` (jsonb) - generated content for each slot
      - `tokens` (jsonb) - snapshot of brand tokens at generation time
      - `brief` (text) - user's generation brief
      - `status` (text) - generating, ready, error
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `extraction_jobs`
      - `id` (uuid, primary key)
      - `brand_id` (uuid, references brands)
      - `url` (text)
      - `status` (text) - pending, processing, completed, failed
      - `progress` (int) - 0-100
      - `error_message` (text)
      - `result` (jsonb)
      - `created_at` (timestamptz)
      - `completed_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Users can only access their own brands and designs
    - Templates are readable by all authenticated users
    - Extraction jobs are only accessible by the brand owner
*/

-- Create brands table
CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  domain text NOT NULL,
  name text NOT NULL,
  logos jsonb DEFAULT '{}' NOT NULL,
  colors jsonb DEFAULT '{}' NOT NULL,
  fonts jsonb DEFAULT '{}' NOT NULL,
  voice jsonb DEFAULT '{}' NOT NULL,
  status text DEFAULT 'draft' NOT NULL,
  extraction_data jsonb DEFAULT '{}' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own brands"
  ON brands FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own brands"
  ON brands FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own brands"
  ON brands FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own brands"
  ON brands FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create templates table
CREATE TABLE IF NOT EXISTS templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL,
  category text NOT NULL,
  aspect_ratio text NOT NULL,
  slots jsonb DEFAULT '{}' NOT NULL,
  style jsonb DEFAULT '{}' NOT NULL,
  preview_url text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active templates"
  ON templates FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Create designs table
CREATE TABLE IF NOT EXISTS designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  brand_id uuid REFERENCES brands NOT NULL,
  template_id uuid REFERENCES templates NOT NULL,
  slots jsonb DEFAULT '{}' NOT NULL,
  tokens jsonb DEFAULT '{}' NOT NULL,
  brief text,
  status text DEFAULT 'generating' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE designs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own designs"
  ON designs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own designs"
  ON designs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own designs"
  ON designs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own designs"
  ON designs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create extraction_jobs table
CREATE TABLE IF NOT EXISTS extraction_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands NOT NULL,
  url text NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  progress int DEFAULT 0 NOT NULL,
  error_message text,
  result jsonb DEFAULT '{}' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  completed_at timestamptz
);

ALTER TABLE extraction_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view jobs for own brands"
  ON extraction_jobs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM brands
      WHERE brands.id = extraction_jobs.brand_id
      AND brands.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create jobs for own brands"
  ON extraction_jobs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM brands
      WHERE brands.id = extraction_jobs.brand_id
      AND brands.user_id = auth.uid()
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS brands_user_id_idx ON brands(user_id);
CREATE INDEX IF NOT EXISTS designs_user_id_idx ON designs(user_id);
CREATE INDEX IF NOT EXISTS designs_brand_id_idx ON designs(brand_id);
CREATE INDEX IF NOT EXISTS extraction_jobs_brand_id_idx ON extraction_jobs(brand_id);
CREATE INDEX IF NOT EXISTS extraction_jobs_status_idx ON extraction_jobs(status);