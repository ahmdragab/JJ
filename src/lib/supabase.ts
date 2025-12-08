import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

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
    summary?: string;
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
    style_profile?: {
      layout_density?: 'minimal' | 'medium' | 'dense';
      whitespace?: 'high' | 'medium' | 'low';
      shape_language?: string[];
      imagery_type?: string[];
      color_usage?: {
        contrast?: 'dark-on-light' | 'light-on-dark' | 'mixed';
        gradients?: boolean;
        duotone_overlays?: boolean;
      };
      typography_feeling?: {
        category?: 'geometric sans' | 'grotesk' | 'serif' | 'condensed' | 'mixed';
        headline_style?: 'loud' | 'understated' | 'balanced';
      };
      motion_energy?: 'calm' | 'moderate' | 'dynamic';
      brand_archetype?: string[];
      design_elements?: {
        shadows?: 'none' | 'subtle' | 'prominent';
        borders?: 'none' | 'thin' | 'thick';
        patterns?: boolean;
        textures?: boolean;
      };
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

export type BrandAsset = {
  id: string;
  brand_id: string;
  user_id: string;
  name: string;
  description?: string;
  url: string;
  type: 'asset' | 'reference';
  category?: string;
  file_size?: number;
  mime_type?: string;
  created_at: string;
  updated_at: string;
};

export type StyleTags = {
  mood?: string[];
  visualType?: string[];
  contentFormat?: string[];
  businessModel?: string[];
  industry?: string[];
};

export type Style = {
  id: string;
  name: string;
  description?: string;
  url: string;
  category: string; // Kept for backward compatibility, but tags.mood should be used
  tags?: StyleTags;
  style_description?: string;
  file_size?: number;
  mime_type?: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

// Credit management functions
export async function getUserCredits(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  // Use get_or_create_credits function - creates credits if they don't exist
  // No parameters needed - function uses auth.uid() internally for security
  const { data, error } = await supabase.rpc('get_or_create_credits');

  if (error) {
    console.error('Error getting credits:', error);
    // Fallback to direct query
    const { data: fallbackData } = await supabase
      .from('user_credits')
      .select('credits')
      .eq('user_id', user.id)
      .single();
    return fallbackData?.credits ?? 0;
  }

  return data ?? 0;
}

export async function checkHasCredits(required: number = 1): Promise<boolean> {
  const credits = await getUserCredits();
  return credits >= required;
}
