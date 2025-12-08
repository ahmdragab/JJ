/*
  # Add slug field to brands table
  
  Adds a human-readable slug for brand URLs.
  Format: domain-xxxx (e.g., stripe-a7k2, notion-m3xf)
*/

-- Add slug column
ALTER TABLE brands ADD COLUMN IF NOT EXISTS slug text;

-- Create unique index on slug
CREATE UNIQUE INDEX IF NOT EXISTS brands_slug_idx ON brands(slug) WHERE slug IS NOT NULL;

-- Function to generate a random 4-character alphanumeric string
CREATE OR REPLACE FUNCTION generate_random_suffix(length integer DEFAULT 4)
RETURNS text AS $$
DECLARE
  chars text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  result text := '';
  i integer;
BEGIN
  FOR i IN 1..length LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to generate a brand slug from domain
CREATE OR REPLACE FUNCTION generate_brand_slug(domain_name text)
RETURNS text AS $$
DECLARE
  clean_domain text;
  base_slug text;
  final_slug text;
  suffix text;
  attempts integer := 0;
BEGIN
  -- Clean the domain: remove TLD, convert to lowercase, replace dots with hyphens
  clean_domain := lower(domain_name);
  clean_domain := regexp_replace(clean_domain, '\.(com|org|net|io|co|dev|app|ai|so|me|xyz|tech|cloud|design|agency|studio|digital)$', '');
  clean_domain := regexp_replace(clean_domain, '[^a-z0-9-]', '-', 'g');
  clean_domain := regexp_replace(clean_domain, '-+', '-', 'g');
  clean_domain := trim(both '-' from clean_domain);
  
  -- Truncate if too long (keep first 20 chars)
  IF length(clean_domain) > 20 THEN
    clean_domain := left(clean_domain, 20);
    clean_domain := trim(both '-' from clean_domain);
  END IF;
  
  base_slug := clean_domain;
  
  -- Try to generate a unique slug
  LOOP
    suffix := generate_random_suffix(4);
    final_slug := base_slug || '-' || suffix;
    
    -- Check if slug exists
    IF NOT EXISTS (SELECT 1 FROM brands WHERE slug = final_slug) THEN
      RETURN final_slug;
    END IF;
    
    attempts := attempts + 1;
    IF attempts > 10 THEN
      -- If too many attempts, use longer suffix
      suffix := generate_random_suffix(6);
      final_slug := base_slug || '-' || suffix;
      RETURN final_slug;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Backfill existing brands with slugs
UPDATE brands 
SET slug = generate_brand_slug(domain)
WHERE slug IS NULL;

-- Make slug NOT NULL after backfill
ALTER TABLE brands ALTER COLUMN slug SET NOT NULL;





