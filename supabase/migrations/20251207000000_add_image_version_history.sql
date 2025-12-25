-- Add version_history field to images table
-- This stores an array of previous image URLs with timestamps

ALTER TABLE images 
ADD COLUMN IF NOT EXISTS version_history jsonb DEFAULT '[]' NOT NULL;

-- Version history structure:
-- [
--   {
--     "image_url": "https://...",
--     "timestamp": "2024-12-07T10:00:00Z",
--     "edit_prompt": "Make it brighter"
--   },
--   ...
-- ]

COMMENT ON COLUMN images.version_history IS 'Array of previous image versions with URLs, timestamps, and edit prompts';

















