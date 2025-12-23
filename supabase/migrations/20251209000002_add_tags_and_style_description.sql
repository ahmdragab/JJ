/*
  # Add Tags and Style Description to Styles
  
  Adds tags (jsonb array) and style_description (text) fields to styles table.
  Migrates existing category values to tags.mood.
  
  Tags structure:
  {
    "mood": ["minimalist", "bold", ...],
    "visualType": ["illustration-based", "real-people", ...],
    "contentFormat": ["before-after", "testimonial", ...],
    "businessModel": ["B2B", "B2C", "D2C/e-commerce"],
    "industry": ["Finance", "Fashion", ...]
  }
*/

-- Add new fields
ALTER TABLE styles 
  ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS style_description text;

-- Migrate existing category values to tags.mood
UPDATE styles
SET tags = jsonb_build_object(
  'mood', ARRAY[category]::text[]
)
WHERE tags = '{}'::jsonb OR tags IS NULL;

-- Create index for tags (GIN index for efficient jsonb queries)
CREATE INDEX IF NOT EXISTS styles_tags_idx ON styles USING GIN (tags);

-- Create index for style_description (for search)
CREATE INDEX IF NOT EXISTS styles_style_description_idx ON styles USING gin(to_tsvector('english', style_description))
WHERE style_description IS NOT NULL;

-- Note: We keep the category field for now to maintain backward compatibility
-- It can be removed in a future migration once all code is updated to use tags














