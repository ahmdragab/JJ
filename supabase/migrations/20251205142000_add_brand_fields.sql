/*
  # Add new brand fields
  
  Adds new columns to the brands table:
  - slogan (text) - Brand tagline/slogan
  - all_logos (jsonb) - Array of all logo variants with metadata
  - backdrops (jsonb) - Array of backdrop/background images
  - styleguide (jsonb) - Full design system/styleguide data
*/

-- Add slogan column
ALTER TABLE brands ADD COLUMN IF NOT EXISTS slogan text;

-- Add all_logos column for storing all logo variants
ALTER TABLE brands ADD COLUMN IF NOT EXISTS all_logos jsonb DEFAULT '[]' NOT NULL;

-- Add backdrops column for storing background images
ALTER TABLE brands ADD COLUMN IF NOT EXISTS backdrops jsonb DEFAULT '[]' NOT NULL;

-- Add styleguide column for storing full design system data
ALTER TABLE brands ADD COLUMN IF NOT EXISTS styleguide jsonb;

