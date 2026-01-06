import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  "Access-Control-Max-Age": "86400",
};

// API Configuration
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-3-pro-image-preview";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const GPT_MODEL = "gpt-4o-mini";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface Brand {
  id: string;
  name: string;
  slogan?: string;
  domain?: string;
  logos: {
    primary?: string;
    secondary?: string;
    icon?: string;
  };
  all_logos?: Array<{ url: string; type?: string; mode?: string }>;
  backdrops?: Array<{ url: string }>;
  screenshot?: string | null;
  colors: {
    primary?: string;
    secondary?: string;
    background?: string;
    surface?: string;
    text_primary?: string;
  };
  fonts: {
    heading?: string;
    body?: string;
  };
  voice: {
    formality?: string;
    energy?: string;
    adjectives?: string[];
    keywords?: string[];
  };
  styleguide?: {
    mode?: string;
    summary?: string;
    colors?: {
      accent?: string;
      background?: string;
      text?: string;
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
}

interface AssetInput {
  id: string;
  url: string;
  name: string;
  category?: string;
  role: 'must_include' | 'style_reference';
  style_description?: string;
}

interface RenderPlan {
  channel: string;
  objective: string;
  aspect_ratio: string;
  resolution?: '1K' | '2K' | '4K';
  headline: string | null;
  subheadline: string | null;
  cta: string | null;
  design_notes: string;
  text_region_notes: string;
  asset_instructions: Array<{
    asset_id: string;
    usage: string;
  }>;
  final_prompt: string;
}

interface GPTPromptInfo {
  system_prompt: string;
  user_message: string;
  full_prompt: string;
  design_type?: string;
}

// ============================================================================
// DESIGN TYPE PRESETS - Focused, minimal guidance per type
// ============================================================================

interface DesignTypePreset {
  name: string;
  description: string;
  composition: string;
  priorities: string[];
  aspectRatioHint: string;
}

const DESIGN_PRESETS: Record<string, DesignTypePreset> = {
  ad_conversion: {
    name: "Conversion Ad",
    description: "Direct response ads focused on driving immediate action",
    composition: "CTA is the most prominent text element. Clear visual hierarchy: hero image → headline → CTA. Single focused message.",
    priorities: [
      "Make the value proposition obvious within 2 seconds",
      "CTA must pop with contrast and whitespace around it",
      "One message only - avoid clutter and competing elements",
      "Use urgency or scarcity cues if appropriate"
    ],
    aspectRatioHint: "4:5 or 1:1 for social, 16:9 for display"
  },
  ad_awareness: {
    name: "Brand Awareness Ad",
    description: "Brand-building ads focused on recognition and emotional connection",
    composition: "Logo more prominent than conversion ads. Emotional, evocative imagery. Create a memorable visual hook.",
    priorities: [
      "Prioritize brand recall over immediate action",
      "Evocative, memorable headline that sticks",
      "Strong brand color presence (60-30-10 rule)",
      "Can be more artistic and less direct"
    ],
    aspectRatioHint: "1:1 or 16:9"
  },
  social_post: {
    name: "Social Media Post",
    description: "Organic content for engagement and community building",
    composition: "Thumb-stopping visual impact. Works well at small sizes in a scrolling feed. Authentic feel, not overly polished.",
    priorities: [
      "Optimize for scroll-stopping in a crowded feed",
      "Bold, simple visuals with clear focal point",
      "Consider platform UI elements (likes, comments overlay)",
      "Authentic and relatable, not corporate"
    ],
    aspectRatioHint: "1:1 or 4:5"
  },
  story_format: {
    name: "Story / Reel",
    description: "Vertical, ephemeral content for maximum impact",
    composition: "Vertical-first design. Keep top 15% and bottom 25% clear for platform UI. Full-bleed imagery works well.",
    priorities: [
      "Immediate visual impact - you have 1 second",
      "Safe zones: avoid text in top and bottom regions",
      "Vertical center is your hero area",
      "Consider swipe-up or link sticker placement"
    ],
    aspectRatioHint: "9:16"
  },
  thumbnail: {
    name: "Thumbnail / Preview",
    description: "Click-driving preview images that work at small sizes",
    composition: "Text MUST be readable at 120px height. Maximum 3 colors. High contrast, bold outlines on any text.",
    priorities: [
      "Must be recognizable at tiny sizes",
      "Faces and expressions increase click-through",
      "Avoid small details that disappear when scaled",
      "Create curiosity or intrigue"
    ],
    aspectRatioHint: "16:9"
  },
  banner: {
    name: "Banner / Header",
    description: "Profile covers, email headers, website banners",
    composition: "Subtle and sophisticated, not attention-grabbing. Text in the safe zone (typically middle-right). Works as a backdrop for other elements.",
    priorities: [
      "Account for profile picture overlay (platform-specific)",
      "Understated elegance over shouting for attention",
      "Works behind navigation, text, or other UI",
      "Extends the brand without competing"
    ],
    aspectRatioHint: "3:1 or 16:9"
  },
  product_showcase: {
    name: "Product Showcase",
    description: "Hero shots featuring products prominently",
    composition: "Product is the hero - clean background, professional lighting feel. Minimal text, let the product speak.",
    priorities: [
      "Product should occupy 50-70% of the visual",
      "Clean, uncluttered background",
      "Show the product in its best light",
      "Logo can be subtle or omitted"
    ],
    aspectRatioHint: "1:1 or 4:5"
  },
  announcement: {
    name: "Announcement / News",
    description: "Important updates, launches, events",
    composition: "Clear headline hierarchy. Date/time prominent if relevant. Creates excitement or urgency.",
    priorities: [
      "The news should be immediately clear",
      "If there's a date, make it visible",
      "Build anticipation or excitement",
      "Clear next step or CTA"
    ],
    aspectRatioHint: "1:1 or 4:5"
  },
  general: {
    name: "General Marketing Visual",
    description: "Flexible marketing content",
    composition: "Balanced, professional layout. Clear visual hierarchy. Brand colors used prominently.",
    priorities: [
      "Professional quality suitable for any context",
      "Clear primary message",
      "On-brand aesthetic and colors",
      "Versatile - works across channels"
    ],
    aspectRatioHint: "1:1"
  }
};

// ============================================================================
// DESIGN TYPE DETECTION
// ============================================================================

function detectDesignType(prompt: string): string {
  const lower = prompt.toLowerCase();
  
  // Ad detection
  if (lower.match(/\bad\b|\badvert|\bads\b|advertisement|campaign/)) {
    if (lower.includes('awareness') || lower.includes('brand building') || lower.includes('branding')) {
      return 'ad_awareness';
    }
    if (lower.includes('sale') || lower.includes('promo') || lower.includes('discount') || 
        lower.includes('offer') || lower.includes('buy') || lower.includes('shop')) {
      return 'ad_conversion';
    }
    return 'ad_conversion'; // Default ads to conversion
  }
  
  // Story/Reel detection
  if (lower.includes('story') || lower.includes('stories') || lower.includes('reel') || 
      lower.includes('9:16') || lower.includes('vertical') || lower.includes('tiktok')) {
    return 'story_format';
  }
  
  // Thumbnail detection
  if (lower.includes('thumbnail') || lower.includes('youtube') || lower.includes('preview image') ||
      lower.includes('video thumbnail')) {
    return 'thumbnail';
  }
  
  // Banner detection
  if (lower.includes('banner') || lower.includes('cover') || lower.includes('header') ||
      lower.includes('linkedin background') || lower.includes('profile cover') || 
      lower.includes('email header')) {
    return 'banner';
  }
  
  // Product showcase
  if (lower.includes('product') || lower.includes('showcase') || lower.includes('hero shot') ||
      lower.includes('product photo') || lower.includes('product image')) {
    return 'product_showcase';
  }
  
  // Announcement
  if (lower.includes('announcement') || lower.includes('launch') || lower.includes('coming soon') ||
      lower.includes('new release') || lower.includes('event') || lower.includes('webinar')) {
    return 'announcement';
  }
  
  // Social keywords
  if (lower.includes('post') || lower.includes('instagram') || lower.includes('linkedin') ||
      lower.includes('twitter') || lower.includes('facebook') || lower.includes('social')) {
    return 'social_post';
  }
  
  return 'general';
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function describeColor(hex: string): string {
  const colorNames: Record<string, string> = {
    '#9445fc': 'vibrant purple',
    '#8b5cf6': 'violet purple',
    '#a855f7': 'bright purple',
    '#7c3aed': 'deep violet',
    '#3b82f6': 'bright blue',
    '#2563eb': 'royal blue',
    '#0ea5e9': 'sky blue',
    '#06b6d4': 'cyan',
    '#22c55e': 'emerald green',
    '#10b981': 'teal green',
    '#84cc16': 'lime green',
    '#ef4444': 'bright red',
    '#f43f5e': 'rose pink',
    '#ec4899': 'hot pink',
    '#f97316': 'bright orange',
    '#eab308': 'golden yellow',
    '#f59e0b': 'amber',
    '#ffffff': 'white',
    '#000000': 'black',
    '#1f2937': 'dark charcoal',
    '#374151': 'slate gray',
  };

  const lowerHex = hex.toLowerCase();
  if (colorNames[lowerHex]) return colorNames[lowerHex];

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  if (r > 200 && g > 200 && b > 200) return 'light/off-white';
  if (r < 50 && g < 50 && b < 50) return 'dark/near-black';
  if (r > g && r > b) return b > 100 ? 'purple/magenta' : 'red/orange';
  if (g > r && g > b) return 'green';
  if (b > r && b > g) return r > 100 ? 'purple/violet' : 'blue';
  
  return `color ${hex}`;
}

// ============================================================================
// LEAN BRAND CONTEXT (v2 - simpler, less restrictive)
// ============================================================================

function buildBrandContextV2(brand: Brand): string {
  const parts: string[] = [];
  
  // Core identity
  parts.push(`BRAND: ${brand.name}`);
  if (brand.slogan) parts.push(`Tagline: "${brand.slogan}"`);
  
  // What they do (important for context)
  if (brand.styleguide?.summary) {
    parts.push(`\nABOUT: ${brand.styleguide.summary}`);
  }
  
  // Colors - dominant, not exclusive
  const colors: string[] = [];
  if (brand.colors.primary) {
    colors.push(`Primary: ${brand.colors.primary} (${describeColor(brand.colors.primary)})`);
  }
  if (brand.colors.secondary) {
    colors.push(`Secondary: ${brand.colors.secondary} (${describeColor(brand.colors.secondary)})`);
  }
  if (brand.colors.background) {
    colors.push(`Background: ${brand.colors.background} (${describeColor(brand.colors.background)})`);
  }
  
  if (colors.length > 0) {
    parts.push(`\nBRAND COLORS (dominant palette - neutrals like black, white, gray are OK for text/shadows):\n${colors.join('\n')}`);
  }
  
  // Voice - keep it simple
  const voiceParts: string[] = [];
  if (brand.voice?.adjectives?.length) {
    voiceParts.push(brand.voice.adjectives.slice(0, 4).join(', '));
  }
  if (brand.voice?.energy) {
    voiceParts.push(`${brand.voice.energy} energy`);
  }
  if (voiceParts.length > 0) {
    parts.push(`\nVIBE: ${voiceParts.join(' • ')}`);
  }
  
  // Style hints from profile (brief summary)
  const styleProfile = brand.styleguide?.style_profile;
  if (styleProfile) {
    const styleHints: string[] = [];
    if (styleProfile.layout_density) styleHints.push(`${styleProfile.layout_density} layout`);
    if (styleProfile.whitespace) styleHints.push(`${styleProfile.whitespace} whitespace`);
    if (styleProfile.motion_energy) styleHints.push(`${styleProfile.motion_energy} feel`);
    if (styleHints.length > 0) {
      parts.push(`STYLE: ${styleHints.join(', ')}`);
    }
  }
  
  return parts.join('\n');
}

// ============================================================================
// GPT PROMPTING (v2 - leaner, design-type aware)
// ============================================================================

async function callGPTV2(
  userPrompt: string,
  brand: Brand,
  assets: AssetInput[],
  references: AssetInput[],
  aspectRatio?: string | null
): Promise<{ renderPlan: RenderPlan; promptInfo: GPTPromptInfo | null; designType: string }> {
  
  const designType = detectDesignType(userPrompt);
  const preset = DESIGN_PRESETS[designType];
  
  if (!OPENAI_API_KEY) {
    return { 
      renderPlan: generateFallbackRenderPlan(userPrompt, brand, assets, designType, preset),
      promptInfo: null,
      designType
    };
  }

  const brandContext = buildBrandContextV2(brand);
  
  // Aspect ratio context
  const aspectRatioContext = aspectRatio && aspectRatio !== 'auto'
    ? `\nASPECT RATIO: User specified ${aspectRatio}. Use this exact ratio.`
    : `\nASPECT RATIO: Recommend based on design type. Hint: ${preset.aspectRatioHint}`;

  // LEAN SYSTEM PROMPT - focused, not overwhelming
  const systemPrompt = `You are a creative director specializing in ${preset.name} designs.

=== DESIGN TYPE: ${preset.name.toUpperCase()} ===
${preset.description}

COMPOSITION:
${preset.composition}

KEY PRIORITIES:
${preset.priorities.map((p, i) => `${i + 1}. ${p}`).join('\n')}

=== BRAND ===
${brandContext}

=== LOGO (PRESERVE EXACTLY) ===
Include the brand logo unless the design type typically omits it (like product hero shots).
When including the logo:
- COPY THE LOGO'S EXACT COLORS as shown in the reference image
- Treat the logo as a FIXED PHOTOGRAPHIC ASSET - reproduce it pixel-perfect
- The logo has its own color scheme that must be preserved (may differ from brand palette)
- Maintain exact proportions and shapes
- Place in a natural corner position (top-left or top-right)

=== ASSETS ===
${assets.length > 0 
  ? `MUST INCLUDE these in the design:\n${assets.map(a => `- ${a.name} (${a.category || 'general'})`).join('\n')}\n\nThese are attached as images. Explicitly mention each in your final_prompt.`
  : 'No specific assets to include.'}

${references.length > 0 
  ? `\nSTYLE INSPIRATION (match the vibe, don't copy):\n${references.map(r => `- ${r.name}${r.style_description ? `: ${r.style_description}` : ''}`).join('\n')}`
  : ''}
${aspectRatioContext}

=== OUTPUT ===
Respond with valid JSON:
{
  "channel": "linkedin_post | instagram_post | story | facebook_ad | twitter | youtube_thumbnail | general",
  "objective": "awareness | conversion | engagement | announcement | general",
  "aspect_ratio": "${aspectRatio && aspectRatio !== 'auto' ? aspectRatio : 'recommend based on design type'}",
  "headline": "compelling headline or null if not needed",
  "cta": "call to action or null",
  "design_notes": "brief description of the composition and style",
  "text_region_notes": "where text should appear naturally",
  "asset_instructions": [{"asset_id": "...", "usage": "how to use this asset"}],
  "final_prompt": "Complete, detailed prompt for the image generation model. Include: brand colors, composition, specific asset instructions (mentioning each by name), and style notes. Keep it focused on what matters for a ${preset.name}."
}

Remember: This is a ${preset.name}. Focus on what makes this design type effective. Don't overload with generic instructions.`;

  const userMessage = `Request: "${userPrompt}"

Create a ${preset.name} design for ${brand.name}.${aspectRatio && aspectRatio !== 'auto' ? ` Must use ${aspectRatio} aspect ratio.` : ''}`;

  const promptInfo: GPTPromptInfo = {
    system_prompt: systemPrompt,
    user_message: userMessage,
    full_prompt: `=== SYSTEM ===\n${systemPrompt}\n\n=== USER ===\n${userMessage}`,
    design_type: designType,
  };

  console.log(`[V2] Design type detected: ${designType} → ${preset.name}`);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: GPT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      return { 
        renderPlan: generateFallbackRenderPlan(userPrompt, brand, assets, designType, preset),
        promptInfo,
        designType
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error("No content in OpenAI response");
      return { 
        renderPlan: generateFallbackRenderPlan(userPrompt, brand, assets, designType, preset),
        promptInfo,
        designType
      };
    }

    try {
      const renderPlan = JSON.parse(content) as RenderPlan;
      console.log(`[V2] GPT render plan: ${renderPlan.channel}, ${renderPlan.objective}`);
      return { renderPlan, promptInfo, designType };
    } catch (parseError) {
      console.error("Failed to parse GPT response:", parseError);
      return { 
        renderPlan: generateFallbackRenderPlan(userPrompt, brand, assets, designType, preset),
        promptInfo,
        designType
      };
    }

  } catch (error) {
    console.error("GPT call failed:", error);
    return { 
      renderPlan: generateFallbackRenderPlan(userPrompt, brand, assets, designType, preset),
      promptInfo,
      designType
    };
  }
}

function generateFallbackRenderPlan(
  userPrompt: string,
  brand: Brand,
  assets: AssetInput[],
  designType: string,
  preset: DesignTypePreset
): RenderPlan {
  // Detect aspect ratio from preset hint
  let aspectRatio = "1:1";
  if (preset.aspectRatioHint.includes("9:16")) aspectRatio = "9:16";
  else if (preset.aspectRatioHint.includes("16:9")) aspectRatio = "16:9";
  else if (preset.aspectRatioHint.includes("4:5")) aspectRatio = "4:5";

  const colorDesc = brand.colors.primary 
    ? `${describeColor(brand.colors.primary)} (${brand.colors.primary})`
    : 'professional colors';

  const finalPrompt = `Create a ${preset.name} for ${brand.name}.

REQUEST: ${userPrompt}

DESIGN TYPE: ${preset.name}
${preset.composition}

BRAND: ${brand.name}${brand.slogan ? ` - "${brand.slogan}"` : ''}
${brand.styleguide?.summary ? `About: ${brand.styleguide.summary}` : ''}

COLORS: Use ${colorDesc} as the dominant color. Neutrals (black, white, gray) OK for text and supporting elements.

PRIORITIES:
${preset.priorities.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Include the brand logo in a corner position - preserve its exact colors as shown (treat as fixed asset).
Aspect ratio: ${aspectRatio}
`.trim();

  return {
    channel: designType.includes('story') ? 'story' : designType.includes('thumbnail') ? 'youtube_thumbnail' : 'general',
    objective: designType.includes('ad') ? (designType.includes('awareness') ? 'awareness' : 'conversion') : 'general',
    aspect_ratio: aspectRatio,
    headline: null,
    subheadline: null,
    cta: null,
    design_notes: `${preset.name} design for ${brand.name}`,
    text_region_notes: "Natural text placement based on design type",
    asset_instructions: assets.map(a => ({ asset_id: a.id, usage: `Include ${a.name} prominently` })),
    final_prompt: finalPrompt,
  };
}

// ============================================================================
// RESOLUTION MAPPING
// ============================================================================

type ResolutionLevel = '1K' | '2K' | '4K';
type AspectRatioValue = '1:1' | '2:3' | '3:4' | '4:5' | '9:16' | '3:2' | '4:3' | '5:4' | '16:9' | '21:9';

interface Resolution {
  width: number;
  height: number;
}

const RESOLUTION_MAP: Record<AspectRatioValue, Record<ResolutionLevel, Resolution>> = {
  '1:1': {
    '1K': { width: 1024, height: 1024 },
    '2K': { width: 2048, height: 2048 },
    '4K': { width: 4096, height: 4096 },
  },
  '2:3': {
    '1K': { width: 848, height: 1264 },
    '2K': { width: 1696, height: 2528 },
    '4K': { width: 3392, height: 5056 },
  },
  '3:2': {
    '1K': { width: 1264, height: 848 },
    '2K': { width: 2528, height: 1696 },
    '4K': { width: 5056, height: 3392 },
  },
  '3:4': {
    '1K': { width: 896, height: 1200 },
    '2K': { width: 1792, height: 2400 },
    '4K': { width: 3584, height: 4800 },
  },
  '4:3': {
    '1K': { width: 1200, height: 896 },
    '2K': { width: 2400, height: 1792 },
    '4K': { width: 4800, height: 3584 },
  },
  '4:5': {
    '1K': { width: 928, height: 1152 },
    '2K': { width: 1856, height: 2304 },
    '4K': { width: 3712, height: 4608 },
  },
  '5:4': {
    '1K': { width: 1152, height: 928 },
    '2K': { width: 2304, height: 1856 },
    '4K': { width: 4608, height: 3712 },
  },
  '9:16': {
    '1K': { width: 768, height: 1376 },
    '2K': { width: 1536, height: 2752 },
    '4K': { width: 3072, height: 5504 },
  },
  '16:9': {
    '1K': { width: 1376, height: 768 },
    '2K': { width: 2752, height: 1536 },
    '4K': { width: 5504, height: 3072 },
  },
  '21:9': {
    '1K': { width: 1584, height: 672 },
    '2K': { width: 3168, height: 1344 },
    '4K': { width: 6336, height: 2688 },
  },
};

function validateAspectRatio(aspectRatio: string | null | undefined): AspectRatioValue | null {
  if (!aspectRatio) return null;
  const normalized = aspectRatio.trim();
  const validRatios: AspectRatioValue[] = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
  if (validRatios.includes(normalized as AspectRatioValue)) {
    return normalized as AspectRatioValue;
  }
  return null;
}

// ============================================================================
// IMAGE HANDLING
// ============================================================================

const SUPPORTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
];

const RASTER_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.heif'];

function getBestLogoUrl(brand: Brand): string | null {
  const isLikelyRaster = (url: string): boolean => {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();
    
    // Check for SVG data URIs (data:image/svg+xml)
    if (lowerUrl.startsWith('data:image/svg+xml')) return false;
    
    // Check for SVG file extensions
    if (lowerUrl.includes('.svg')) return false;
    
    // Check for raster file extensions
    if (RASTER_EXTENSIONS.some(ext => lowerUrl.includes(ext))) return true;
    
    // Check for Supabase storage URLs - they might not have extensions in the path
    // but the query params or path structure might indicate PNG
    if (lowerUrl.includes('brand-logos') && (lowerUrl.includes('primary') || lowerUrl.includes('converted'))) {
      return true; // Assume converted logos are PNG
    }
    
    // Check for raster data URIs (data:image/png, data:image/jpeg, etc.)
    if (lowerUrl.startsWith('data:image/')) {
      const mimeType = lowerUrl.split(';')[0].split(':')[1];
      if (mimeType && ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'].includes(mimeType)) {
        return true;
      }
      // If it's a data URI but not a known raster type, assume it's not raster
      return false;
    }
    
    // If no clear indication, assume it might be raster (but prefer explicit extensions)
    return true;
  };

  // Try primary logo first (prefer raster)
  if (brand.logos?.primary) {
    if (isLikelyRaster(brand.logos.primary)) {
      console.log(`[V2] Using primary logo (raster): ${brand.logos.primary}`);
      return brand.logos.primary;
    } else {
      console.log(`[V2] Primary logo is SVG, will try other sources: ${brand.logos.primary}`);
    }
  }

  // Try all_logos for raster logos
  if (brand.all_logos?.length) {
    const rasterLogos = brand.all_logos
      .filter(logo => logo.url && isLikelyRaster(logo.url))
      .sort((a, b) => {
        const getPriority = (url: string): number => {
          const lower = url.toLowerCase();
          if (lower.includes('.png') || lower.includes('converted')) return 0; // Prefer PNG and converted logos
          if (lower.includes('.jpg') || lower.includes('.jpeg')) return 1;
          if (lower.includes('.webp')) return 2;
          return 3;
        };
        return getPriority(a.url) - getPriority(b.url);
      });

    if (rasterLogos.length > 0) {
      console.log(`[V2] Using logo from all_logos: ${rasterLogos[0].url}`);
      return rasterLogos[0].url;
    }
  }

  // Try icon as fallback
  if (brand.logos?.icon && isLikelyRaster(brand.logos.icon)) {
    console.log(`[V2] Using icon logo: ${brand.logos.icon}`);
    return brand.logos.icon;
  }

  // Last resort: use primary even if SVG (better than nothing)
  if (brand.logos?.primary) {
    console.log(`[V2] Using primary logo as fallback (may be SVG): ${brand.logos.primary}`);
    return brand.logos.primary;
  }

  console.warn(`[V2] No logo found for brand. Primary: ${brand.logos?.primary || 'none'}, Icon: ${brand.logos?.icon || 'none'}, All logos: ${brand.all_logos?.length || 0}`);
  return null;
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    // Handle data URIs directly (don't fetch them)
    if (url.startsWith('data:')) {
      const [header, data] = url.split(',');
      const mimeMatch = header.match(/data:([^;]+)/);
      const mimeType = mimeMatch ? mimeMatch[1].toLowerCase().trim() : 'image/png';
      
      // Check if it's a supported type
      if (!SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
        console.warn(`[V2] Skipping unsupported image type in data URI: ${mimeType}`);
        return null;
      }
      
      // For data URIs, the data is already base64 encoded (or URL-encoded)
      // If it's URL-encoded (starts with %), we need to decode it first
      let base64Data = data;
      if (data.startsWith('%')) {
        // URL-encoded data URI - decode it
        try {
          const decoded = decodeURIComponent(data);
          base64Data = decoded;
        } catch (e) {
          console.warn('[V2] Failed to decode URL-encoded data URI');
          return null;
        }
      }
      
      return { data: base64Data, mimeType };
    }
    
    // Regular URL - fetch it
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[V2] Failed to fetch logo from: ${url}`);
      return null;
    }
    
    let contentType = response.headers.get('content-type') || 'image/png';
    contentType = contentType.split(';')[0].trim().toLowerCase();
    
    if (!SUPPORTED_IMAGE_TYPES.includes(contentType)) {
      console.warn(`[V2] Skipping unsupported image type: ${contentType}`);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    const base64 = btoa(binary);
    
    return { data: base64, mimeType: contentType };
  } catch (error) {
    console.error(`[V2] Failed to fetch image: ${error}`);
    return null;
  }
}

async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  imageBase64: string,
  brandId: string,
  imageId: string
): Promise<string | null> {
  try {
    const binaryString = atob(imageBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const fileName = `${brandId}/${imageId}-${Date.now()}.png`;
    
    const { error } = await supabase.storage
      .from('brand-images')
      .upload(fileName, bytes, {
        contentType: 'image/png',
        upsert: true,
      });

    if (error) {
      console.error('Storage upload error:', error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('brand-images')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (error) {
    console.error('Upload failed:', error);
    return null;
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  const logger = createLogger('generate-image-v2');
  const requestId = logger.generateRequestId();
  const startTime = performance.now();
  
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    logger.setContext({ request_id: requestId });
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    let requestBody;
    try {
      requestBody = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { 
      prompt, 
      brandId, 
      imageId,
      includeLogoReference = true,
      assets = [],
      references = [],
      aspectRatio,
      skipCredits = false, // For comparison mode - don't deduct credits twice
    } = requestBody;

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "Missing prompt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY not set" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch brand data
    let brand: Brand | null = null;
    let userId: string | null = null;
    
    if (brandId) {
      const { data: brandData } = await supabase
        .from("brands")
        .select("*")
        .eq("id", brandId)
        .single();

      if (brandData) {
        brand = brandData as Brand;
        userId = brandData.user_id;
      }
    }

    if (imageId && !userId) {
      const { data: imageData } = await supabase
        .from("images")
        .select("user_id")
        .eq("id", imageId)
        .single();
      
      if (imageData) {
        userId = imageData.user_id;
      }
    }

    // Credit deduction (skip if in comparison mode)
    if (userId && !skipCredits) {
      const { data: creditsData, error: creditsError } = await supabase
        .from("user_credits")
        .select("credits")
        .eq("user_id", userId)
        .single();

      const currentCredits = creditsData?.credits ?? 0;
      
      if (creditsError || currentCredits < 1) {
        return new Response(
          JSON.stringify({ 
            error: "Insufficient credits. Please purchase more credits to generate images.",
            credits: currentCredits
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: deductError } = await supabase
        .from("user_credits")
        .update({ 
          credits: currentCredits - 1,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", userId)
        .eq("credits", currentCredits);

      if (deductError) {
        console.error("Failed to deduct credit:", deductError);
        return new Response(
          JSON.stringify({ 
            error: "Failed to process credits. Please try again.",
            credits: currentCredits
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        await supabase
          .from("credit_transactions")
          .insert({
            user_id: userId,
            type: 'deducted',
            amount: -1,
            balance_after: currentCredits - 1,
            source: 'usage',
            description: 'Credit used for image generation (v2)'
          });
      } catch (txError) {
        console.warn("Failed to log credit transaction:", txError);
      }

      console.log(`[V2] Credit deducted for user ${userId}`);
    }

    console.log(`[V2] Prompt: "${prompt.substring(0, 100)}..." | Assets: ${assets.length} | Refs: ${references.length}`);

    // Build request parts for Gemini
    const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [];
    
    let gptPromptInfo: GPTPromptInfo | null = null;
    let renderPlan: RenderPlan | null = null;
    let designType: string = 'general';
    let finalPrompt: string;

    if (brand) {
      const gptResult = await callGPTV2(
        prompt,
        brand,
        assets as AssetInput[],
        references as AssetInput[],
        aspectRatio
      );
      renderPlan = gptResult.renderPlan;
      gptPromptInfo = gptResult.promptInfo;
      designType = gptResult.designType;
      finalPrompt = renderPlan.final_prompt;
      
      console.log(`[V2] Design: ${designType} | Channel: ${renderPlan.channel}`);
    } else {
      finalPrompt = prompt;
    }

    // Fetch logo FIRST - it's critical and should be prioritized
    let logoDataToAttach: { mimeType: string; data: string } | null = null;
    if (brand && includeLogoReference) {
      const bestLogoUrl = getBestLogoUrl(brand);
      if (bestLogoUrl) {
        console.log(`[V2] Fetching logo from: ${bestLogoUrl}`);
        logoDataToAttach = await fetchImageAsBase64(bestLogoUrl);
        if (logoDataToAttach) {
          console.log(`[V2] Logo fetched successfully: ${logoDataToAttach.mimeType}, ${Math.round(logoDataToAttach.data.length / 1024)}KB`);
        } else {
          console.error(`[V2] Failed to fetch logo from: ${bestLogoUrl}`);
        }
      } else {
        console.warn(`[V2] No logo URL found for brand. Primary: ${brand.logos?.primary || 'none'}, Icon: ${brand.logos?.icon || 'none'}, All logos: ${brand.all_logos?.length || 0}`);
      }
    }

    // Add logo IMMEDIATELY at the start - before any other images
    if (logoDataToAttach) {
      parts.push({
        text: `🚨 CRITICAL: BRAND LOGO REQUIRED 🚨

The following image is the EXACT brand logo for ${brand?.name || 'this brand'}. 

MANDATORY REQUIREMENTS:
1. You MUST include this EXACT logo in the generated image
2. COPY THE LOGO PIXEL-PERFECT - do NOT recreate, redesign, or modify it
3. PRESERVE ALL ORIGINAL COLORS - do NOT change, tint, or color-match the logo
4. DO NOT generate a text-based logo or create a new logo design
5. PLACE the logo prominently in a corner (top-left or top-right preferred)
6. The logo must be clearly visible and readable

This is the ONLY acceptable logo. Do not use any other logo or create variations.`,
      });
      parts.push({
        inline_data: {
          mime_type: logoDataToAttach.mimeType,
          data: logoDataToAttach.data,
        },
      });
      console.log(`[V2] Logo attached at position ${parts.length - 1} (early in conversation)`);
    }

    // Add the optimized prompt
    parts.push({ text: finalPrompt });

    // Add user assets
    const attachedAssetNames: string[] = [];
    for (const asset of (assets as AssetInput[])) {
      const assetData = await fetchImageAsBase64(asset.url);
      if (assetData) {
        attachedAssetNames.push(asset.name);
        parts.push({
          text: `INCLUDE: "${asset.name}" - This must appear in the final design.`,
        });
        parts.push({
          inline_data: {
            mime_type: assetData.mimeType,
            data: assetData.data,
          },
        });
      }
    }

    // Add style references (backdrop, screenshot, user references)
    if (brand?.backdrops?.length) {
      const backdropData = await fetchImageAsBase64(brand.backdrops[0].url);
      if (backdropData) {
        parts.push({ text: "STYLE REF - Match this visual style:" });
        parts.push({ inline_data: { mime_type: backdropData.mimeType, data: backdropData.data } });
      }
    }

    if (brand?.screenshot) {
      const screenshotData = await fetchImageAsBase64(brand.screenshot);
      if (screenshotData) {
        parts.push({ text: "BRAND WEBSITE - Use for style and color reference:" });
        parts.push({ inline_data: { mime_type: screenshotData.mimeType, data: screenshotData.data } });
      }
    }

    for (const ref of (references as AssetInput[])) {
      const refData = await fetchImageAsBase64(ref.url);
      if (refData) {
        parts.push({
          text: `STYLE INSPIRATION: "${ref.name}" - Match the vibe, don't copy:`,
        });
        parts.push({ inline_data: { mime_type: refData.mimeType, data: refData.data } });
      }
    }

    // Final logo reminder at the end
    if (logoDataToAttach) {
      parts.push({
        text: `⚠️ FINAL REMINDER: The brand logo attached at the beginning of this conversation MUST appear in the generated image. Use the EXACT attached logo - do not create a new one or modify it in any way.`,
      });
    }

    // Build generation config
    const validatedAspectRatio = validateAspectRatio(
      aspectRatio && aspectRatio !== 'auto' ? aspectRatio : renderPlan?.aspect_ratio
    );
    
    const generationConfig: Record<string, unknown> = {
      responseModalities: ["TEXT", "IMAGE"],
    };
    
    if (validatedAspectRatio) {
      generationConfig.image_config = {
        aspect_ratio: validatedAspectRatio,
        image_size: '2K',
      };
    }

    // Final logo reminder
    if (logoDataToAttach) {
      parts.push({
        text: `FINAL REMINDER: The brand logo attached above MUST appear in the generated image. Use the EXACT attached logo.`,
      });
    }

    console.log(`[V2] Gemini call: ${parts.length} parts, aspect=${validatedAspectRatio || 'auto'}, logo=${!!logoDataToAttach}`);

    // Call Gemini
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig,
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("[V2] Gemini error:", errorText);
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();

    // Check for blocked content
    if (geminiData.candidates?.[0]?.finishReason && 
        !['STOP', 'MAX_TOKENS'].includes(geminiData.candidates[0].finishReason)) {
      throw new Error(`Gemini finished with: ${geminiData.candidates[0].finishReason}`);
    }

    // Extract image
    let imageBase64: string | null = null;
    let textResponse: string | null = null;

    if (geminiData.candidates?.[0]?.content?.parts) {
      for (const part of geminiData.candidates[0].content.parts) {
        if (part.text) textResponse = part.text;
        else if (part.inlineData?.data) imageBase64 = part.inlineData.data;
        else if (part.inline_data?.data) imageBase64 = part.inline_data.data;
      }
    }

    if (!imageBase64) {
      throw new Error(textResponse 
        ? `No image generated: ${textResponse.substring(0, 200)}`
        : "No image generated from Gemini API");
    }

    console.log(`[V2] Image generated: ${Math.round(imageBase64.length / 1024)}KB`);

    // Upload to storage
    let imageUrl: string | null = null;
    if (imageId && brandId) {
      imageUrl = await uploadToStorage(supabase, imageBase64, brandId, imageId);
    }

    // Update images table
    if (imageId) {
      const updateData: Record<string, unknown> = {
        status: 'ready',
        updated_at: new Date().toISOString(),
      };

      if (imageUrl) updateData.image_url = imageUrl;

      const { data: currentImage } = await supabase
        .from('images')
        .select('metadata')
        .eq('id', imageId)
        .single();
      
      const existingMetadata = (currentImage?.metadata as Record<string, unknown>) || {};
      const newMetadata: Record<string, unknown> = {
        ...existingMetadata,
        prompt_version: 'v2',
        design_type: designType,
      };
      
      if (gptPromptInfo) newMetadata.gpt_prompt_info = gptPromptInfo;
      if (validatedAspectRatio) newMetadata.aspect_ratio = validatedAspectRatio;
      
      updateData.metadata = newMetadata;

      await supabase.from('images').update(updateData).eq('id', imageId);
    }

    const duration = performance.now() - startTime;
    logger.info("Image generation (v2) completed", {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    return new Response(
      JSON.stringify({
        success: true,
        version: 'v2',
        design_type: designType,
        image_url: imageUrl,
        image_base64: imageBase64,
        mime_type: "image/png",
        text_response: textResponse,
        gpt_prompt_info: gptPromptInfo,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const duration = performance.now() - startTime;
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    // Log to Axiom
    logger.error("Image generation error (v2)", errorObj, {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    // Send to Sentry
    await captureException(errorObj, {
      function_name: 'generate-image-v2',
      request_id: requestId,
    });

    return new Response(
      JSON.stringify({ 
        error: errorObj.message,
        version: 'v2',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

