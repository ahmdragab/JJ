/*
  # Add CASCADE DELETE to Brand Foreign Keys
  
  This migration adds ON DELETE CASCADE to foreign key constraints
  that reference the brands table. This allows brands to be deleted
  even when they have related records in:
  - images
  - extraction_jobs
  
  Note: 
  - brand_assets already has CASCADE DELETE from a previous migration.
  - designs table was dropped in migration 20251206100000_create_images_and_templates.sql
*/

-- Drop and recreate foreign key constraint for images.brand_id
ALTER TABLE images
  DROP CONSTRAINT IF EXISTS images_brand_id_fkey;

ALTER TABLE images
  ADD CONSTRAINT images_brand_id_fkey
  FOREIGN KEY (brand_id)
  REFERENCES brands(id)
  ON DELETE CASCADE;

-- Drop and recreate foreign key constraint for extraction_jobs.brand_id
ALTER TABLE extraction_jobs
  DROP CONSTRAINT IF EXISTS extraction_jobs_brand_id_fkey;

ALTER TABLE extraction_jobs
  ADD CONSTRAINT extraction_jobs_brand_id_fkey
  FOREIGN KEY (brand_id)
  REFERENCES brands(id)
  ON DELETE CASCADE;

