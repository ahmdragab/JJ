-- Add screenshot and page_images columns to brands table
ALTER TABLE brands ADD COLUMN IF NOT EXISTS screenshot text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS page_images jsonb DEFAULT '[]' NOT NULL;
















