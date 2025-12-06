import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Generate a slug from domain name
export function generateSlug(domain: string): string {
  // Clean the domain
  let clean = domain.toLowerCase();
  clean = clean.replace(/\.(com|org|net|io|co|dev|app|ai|so|me|xyz|tech|cloud|design|agency|studio|digital)$/, '');
  clean = clean.replace(/[^a-z0-9-]/g, '-');
  clean = clean.replace(/-+/g, '-');
  clean = clean.replace(/^-|-$/g, '');
  
  // Truncate if too long
  if (clean.length > 20) {
    clean = clean.slice(0, 20).replace(/-$/, '');
  }
  
  // Add random suffix
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  
  return `${clean}-${suffix}`;
}

export type Brand = {
  id: string;
  user_id: string;
  domain: string;
  slug: string;
  name: string;
  slogan?: string;
  logos: {
    primary?: string;
    secondary?: string;
    icon?: string;
  };
  all_logos?: Array<{
    url: string;
    type?: string;
    mode?: string;
  }>;
  backdrops?: Array<{
    url: string;
  }>;
  screenshot?: string;
  page_images?: Array<{
    url: string;
    type?: string;
  }>;
  colors: {
    primary?: string;
    secondary?: string;
    background?: string;
    surface?: string;
    text_primary?: string;
    text_on_primary?: string;
  };
  fonts: {
    heading?: string;
    body?: string;
  };
  voice: {
    formality?: string;
    energy?: string;
    playful?: boolean;
    adjectives?: string[];
    keywords?: string[];
  };
  styleguide?: {
    mode?: 'light' | 'dark';
    colors?: {
      accent?: string;
      background?: string;
      text?: string;
    };
    typography?: {
      headings?: {
        h1?: { fontFamily?: string; fontSize?: string; fontWeight?: number; lineHeight?: string; letterSpacing?: string };
        h2?: { fontFamily?: string; fontSize?: string; fontWeight?: number; lineHeight?: string; letterSpacing?: string };
        h3?: { fontFamily?: string; fontSize?: string; fontWeight?: number; lineHeight?: string; letterSpacing?: string };
        h4?: { fontFamily?: string; fontSize?: string; fontWeight?: number; lineHeight?: string; letterSpacing?: string };
      };
      p?: { fontFamily?: string; fontSize?: string; fontWeight?: number; lineHeight?: string; letterSpacing?: string };
    };
    elementSpacing?: {
      xs?: string;
      sm?: string;
      md?: string;
      lg?: string;
      xl?: string;
    };
    shadows?: {
      sm?: string;
      md?: string;
      lg?: string;
      xl?: string;
      inner?: string;
    };
    components?: {
      button?: {
        primary?: Record<string, unknown>;
        secondary?: Record<string, unknown>;
        link?: Record<string, unknown>;
      };
      card?: Record<string, unknown>;
    };
  };
  status: 'draft' | 'extracting' | 'ready' | 'error';
  extraction_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type TemplateField = {
  name: string;
  label: string;
  required: boolean;
  placeholder?: string;
};

export type Template = {
  id: string;
  name: string;
  description?: string;
  aspect_ratio: string;
  category: string;
  fields: TemplateField[];
  prompt_template: string;
  preview_color?: string;
  is_active: boolean;
  created_at: string;
};

export type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
  image_url?: string;
  timestamp: string;
};

export type ImageVersion = {
  image_url: string;
  timestamp: string;
  edit_prompt: string;
};

export type GeneratedImage = {
  id: string;
  user_id: string;
  brand_id: string;
  template_id?: string;
  prompt: string;
  image_url?: string;
  conversation: ConversationMessage[];
  edit_count: number;
  max_edits: number;
  version_history: ImageVersion[];
  metadata: {
    aspect_ratio?: string;
    template_fields?: Record<string, string>;
    [key: string]: unknown;
  };
  status: 'generating' | 'ready' | 'error';
  created_at: string;
  updated_at: string;
};

export type ExtractionJob = {
  id: string;
  brand_id: string;
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error_message?: string;
  result: Record<string, unknown>;
  created_at: string;
  completed_at?: string;
};
