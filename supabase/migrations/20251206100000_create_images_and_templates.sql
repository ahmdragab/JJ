/*
  # Images and Templates Schema
  
  Creates tables for:
  - `images` - Generated images with conversation history
  - Simplified `templates` - Preset prompt configurations
  
  Also creates:
  - Storage bucket for images
  - RLS policies
*/

-- Create simplified templates table (drop old one if exists and recreate)
DROP TABLE IF EXISTS designs CASCADE;
DROP TABLE IF EXISTS templates CASCADE;

CREATE TABLE templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  aspect_ratio text NOT NULL, -- "1:1", "16:9", "9:16", "4:5"
  fields jsonb NOT NULL DEFAULT '[]', -- [{name: "headline", label: "Headline", required: true, placeholder: "..."}]
  prompt_template text NOT NULL, -- "Create a {{aspect_ratio}} image with..."
  category text NOT NULL DEFAULT 'social', -- social, ads, presentation, etc.
  preview_color text DEFAULT '#6366f1', -- Fallback color for preview
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

-- Templates are readable by all authenticated users
CREATE POLICY "Authenticated users can view active templates"
  ON templates FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Create images table
CREATE TABLE images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  brand_id uuid REFERENCES brands NOT NULL,
  template_id uuid REFERENCES templates,
  
  -- Content
  prompt text NOT NULL,
  image_url text, -- Supabase Storage URL
  
  -- Conversation history for edits
  conversation jsonb DEFAULT '[]' NOT NULL,
  
  -- Edit tracking
  edit_count int DEFAULT 0 NOT NULL,
  max_edits int DEFAULT 10 NOT NULL,
  
  -- Metadata
  metadata jsonb DEFAULT '{}' NOT NULL, -- aspect_ratio, template_fields, etc.
  
  -- Status
  status text DEFAULT 'generating' NOT NULL, -- generating, ready, error
  
  -- Timestamps
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE images ENABLE ROW LEVEL SECURITY;

-- Users can only access their own images
CREATE POLICY "Users can view own images"
  ON images FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own images"
  ON images FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own images"
  ON images FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own images"
  ON images FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX images_user_id_idx ON images(user_id);
CREATE INDEX images_brand_id_idx ON images(brand_id);
CREATE INDEX images_created_at_idx ON images(created_at DESC);

-- Insert standard templates
INSERT INTO templates (name, description, aspect_ratio, category, fields, prompt_template, preview_color) VALUES
(
  'LinkedIn Square Ad',
  'Perfect for LinkedIn feed ads and posts',
  '1:1',
  'social',
  '[
    {"name": "headline", "label": "Headline", "required": true, "placeholder": "e.g., Boost Your Productivity"},
    {"name": "cta", "label": "Call to Action", "required": false, "placeholder": "e.g., Learn More"}
  ]',
  'Create a professional square (1:1 aspect ratio) LinkedIn advertisement image. The image should feature the headline "{{headline}}" prominently displayed. {{#if cta}}Include a call-to-action button or text saying "{{cta}}".{{/if}} The design should be clean, professional, and suitable for B2B marketing. Use the brand colors and maintain a modern corporate aesthetic.',
  '#0077B5'
),
(
  'Instagram Story',
  'Vertical format for Instagram and Facebook stories',
  '9:16',
  'social',
  '[
    {"name": "headline", "label": "Main Message", "required": true, "placeholder": "e.g., New Collection Drop"},
    {"name": "subtext", "label": "Supporting Text", "required": false, "placeholder": "e.g., Shop now - Link in bio"}
  ]',
  'Create a visually striking vertical (9:16 aspect ratio) Instagram Story image. Feature the message "{{headline}}" as the main focal point. {{#if subtext}}Include supporting text: "{{subtext}}".{{/if}} The design should be eye-catching, modern, and optimized for mobile viewing. Use bold typography and the brand colors.',
  '#E4405F'
),
(
  'Twitter/X Post',
  'Landscape format optimized for Twitter/X feeds',
  '16:9',
  'social',
  '[
    {"name": "headline", "label": "Main Text", "required": true, "placeholder": "e.g., Breaking: New Feature Launch"},
    {"name": "tagline", "label": "Tagline", "required": false, "placeholder": "e.g., The future is here"}
  ]',
  'Create a compelling landscape (16:9 aspect ratio) image for Twitter/X. Display the text "{{headline}}" prominently. {{#if tagline}}Add a tagline: "{{tagline}}".{{/if}} The design should be attention-grabbing, shareable, and work well in a fast-scrolling feed. Use the brand colors and modern design elements.',
  '#1DA1F2'
),
(
  'Facebook Ad',
  'Optimized for Facebook feed advertisements',
  '4:5',
  'ads',
  '[
    {"name": "headline", "label": "Headline", "required": true, "placeholder": "e.g., Transform Your Business"},
    {"name": "description", "label": "Description", "required": false, "placeholder": "e.g., Join 10,000+ companies"},
    {"name": "cta", "label": "CTA Button", "required": false, "placeholder": "e.g., Get Started Free"}
  ]',
  'Create a high-converting Facebook advertisement image (4:5 aspect ratio). Feature the headline "{{headline}}" prominently. {{#if description}}Include the description: "{{description}}".{{/if}} {{#if cta}}Add a clear call-to-action: "{{cta}}".{{/if}} The design should be professional, trustworthy, and optimized for conversions. Use the brand colors.',
  '#1877F2'
),
(
  'YouTube Thumbnail',
  'Eye-catching thumbnails for YouTube videos',
  '16:9',
  'video',
  '[
    {"name": "title", "label": "Video Title", "required": true, "placeholder": "e.g., 10 Tips That Changed My Life"},
    {"name": "hook", "label": "Hook Text", "required": false, "placeholder": "e.g., #5 Will Shock You"}
  ]',
  'Create an attention-grabbing YouTube thumbnail (16:9 aspect ratio). Feature the title "{{title}}" in bold, readable text. {{#if hook}}Add a hook element: "{{hook}}".{{/if}} The design should be vibrant, high-contrast, and designed to maximize click-through rates. Use expressive typography and the brand colors. Make it pop against other thumbnails.',
  '#FF0000'
);

















