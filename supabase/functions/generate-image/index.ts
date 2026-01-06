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
const GPT_MODEL = "gpt-4o-mini"; // Fast, cost-efficient model for prompt optimization (gpt-4o-mini or gpt-4-turbo)

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
  style_description?: string; // Optional: for style library references
}

// GPT-5.1 Output Schema
interface RenderPlan {
  channel: string;
  objective: string;
  aspect_ratio: string;
  resolution?: '1K' | '2K' | '4K'; // Optional: GPT can recommend resolution based on channel/context
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

// GPT Prompt Info (for logging/display)
interface GPTPromptInfo {
  system_prompt: string;
  user_message: string;
  full_prompt: string; // Combined for easy display
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

function buildBrandContext(brand: Brand): { hardConstraints: string; softGuidelines: string } {
  // ============================================================================
  // HARD CONSTRAINTS (Identity Level - MUST OBEY)
  // ============================================================================
  const hardConstraints: string[] = [];

  // Brand identity
  hardConstraints.push(`BRAND: ${brand.name}`);
  if (brand.slogan) hardConstraints.push(`Tagline: "${brand.slogan}"`);
  if (brand.domain) hardConstraints.push(`Domain: ${brand.domain}`);

  // Brand description
  if (brand.styleguide?.summary) {
    hardConstraints.push(`\nWHAT THIS BRAND DOES:\n${brand.styleguide.summary}\n\nThis description is essential - use it to ensure the design accurately represents what ${brand.name} does and their industry/domain.`);
  }

  // Colors (STRICT - identity level)
  const colors: string[] = [];
  if (brand.colors.primary) {
    colors.push(`- Primary: ${brand.colors.primary} (${describeColor(brand.colors.primary)})`);
  }
  if (brand.colors.secondary) {
    colors.push(`- Secondary: ${brand.colors.secondary} (${describeColor(brand.colors.secondary)})`);
  }
  if (brand.colors.background) {
    colors.push(`- Background: ${brand.colors.background} (${describeColor(brand.colors.background)})`);
  }

  if (colors.length > 0) {
    hardConstraints.push(`\nCOLORS (STRICT - USE ONLY THESE):\n${colors.join('\n')}\n\nIMPORTANT: Only use the exact brand colors listed above. Do not introduce colors that are not part of the brand palette.`);
  } else {
    hardConstraints.push(`\nCOLORS: Use modern, professional colors`);
  }

  // Logo requirement
  hardConstraints.push(`\nLOGO PRESERVATION (CRITICAL):
- The brand logo MUST appear in every design
- PRESERVE THE LOGO'S EXACT COLORS - copy the precise RGB values from the source image
- The logo is a FIXED ASSET: reproduce it pixel-perfect without any color shifting, tinting, or style harmonization
- Keep the logo's original proportions, shapes, and typography intact
- Place the logo prominently, typically in a corner position
- The logo's colors may differ from the brand palette - this is intentional, preserve them exactly`);

  // Typography category (identity level)
  if (brand.fonts?.heading || brand.fonts?.body) {
    const typography: string[] = [];
    if (brand.fonts.heading) typography.push(`Heading font: ${brand.fonts.heading}`);
    if (brand.fonts.body) typography.push(`Body font: ${brand.fonts.body}`);
    hardConstraints.push(`\nTYPOGRAPHY:\n${typography.join('\n')}`);
  }

  // Voice & tone (identity level)
  const voice: string[] = [];
  if (brand.voice?.formality) voice.push(`Formality: ${brand.voice.formality}`);
  if (brand.voice?.energy) voice.push(`Energy: ${brand.voice.energy}`);
  if (brand.voice?.adjectives?.length) voice.push(`Adjectives: ${brand.voice.adjectives.join(', ')}`);
  if (brand.voice?.keywords?.length) voice.push(`Keywords: ${brand.voice.keywords.join(', ')}`);

  if (voice.length > 0) {
    hardConstraints.push(`\nVOICE & TONE:\n${voice.join('\n')}`);
  } else {
    hardConstraints.push(`\nVOICE & TONE: Professional and approachable`);
  }

  // ============================================================================
  // SOFT GUIDELINES (Style Level - BIAS TOWARDS, but allowed to deviate)
  // ============================================================================
  const softGuidelines: string[] = [];

  // Theme/mode preference
  if (brand.styleguide?.mode) {
    softGuidelines.push(`Theme preference: ${brand.styleguide.mode} (but can adapt if needed)`);
  }

  // Style profile (if available)
  const styleProfile = brand.styleguide?.style_profile;
  if (styleProfile) {
    softGuidelines.push(`\nBRAND STYLE PROFILE (use as design principles, not rigid templates):`);

    // Layout & spacing
    if (styleProfile.layout_density) {
      softGuidelines.push(`- Layout density: ${styleProfile.layout_density} (bias towards this, but can vary)`);
    }
    if (styleProfile.whitespace) {
      softGuidelines.push(`- Whitespace: ${styleProfile.whitespace} (prefer this level, but can adjust)`);
    }

    // Shape language
    if (styleProfile.shape_language && styleProfile.shape_language.length > 0) {
      softGuidelines.push(`- Shape language: ${styleProfile.shape_language.join(', ')} (prefer these shapes, but can explore others)`);
    }

    // Imagery type
    if (styleProfile.imagery_type && styleProfile.imagery_type.length > 0) {
      softGuidelines.push(`- Imagery type: ${styleProfile.imagery_type.join(', ')} (bias towards these, but can mix)`);
    }

    // Color usage patterns
    if (styleProfile.color_usage) {
      const colorUsage: string[] = [];
      if (styleProfile.color_usage.contrast) {
        colorUsage.push(`contrast: ${styleProfile.color_usage.contrast}`);
      }
      if (styleProfile.color_usage.gradients) {
        colorUsage.push(`gradients: ${styleProfile.color_usage.gradients ? 'yes' : 'no'}`);
      }
      if (styleProfile.color_usage.duotone_overlays) {
        colorUsage.push(`duotone/overlays: ${styleProfile.color_usage.duotone_overlays ? 'yes' : 'no'}`);
      }
      if (colorUsage.length > 0) {
        softGuidelines.push(`- Color usage: ${colorUsage.join(', ')} (prefer these patterns, but can vary)`);
      }
    }

    // Typography feeling
    if (styleProfile.typography_feeling) {
      const typoFeeling: string[] = [];
      if (styleProfile.typography_feeling.category) {
        typoFeeling.push(`category: ${styleProfile.typography_feeling.category}`);
      }
      if (styleProfile.typography_feeling.headline_style) {
        typoFeeling.push(`headline style: ${styleProfile.typography_feeling.headline_style}`);
      }
      if (typoFeeling.length > 0) {
        softGuidelines.push(`- Typography feeling: ${typoFeeling.join(', ')} (bias towards this, but can adapt)`);
      }
    }

    // Motion/energy
    if (styleProfile.motion_energy) {
      softGuidelines.push(`- Visual energy: ${styleProfile.motion_energy} (prefer this energy level, but can adjust)`);
    }

    // Design elements
    if (styleProfile.design_elements) {
      const elements: string[] = [];
      if (styleProfile.design_elements.shadows) {
        elements.push(`shadows: ${styleProfile.design_elements.shadows}`);
      }
      if (styleProfile.design_elements.borders) {
        elements.push(`borders: ${styleProfile.design_elements.borders}`);
      }
      if (styleProfile.design_elements.patterns) {
        elements.push(`patterns: ${styleProfile.design_elements.patterns ? 'yes' : 'no'}`);
      }
      if (styleProfile.design_elements.textures) {
        elements.push(`textures: ${styleProfile.design_elements.textures ? 'yes' : 'no'}`);
      }
      if (elements.length > 0) {
        softGuidelines.push(`- Design elements: ${elements.join(', ')} (prefer these, but can explore)`);
      }
    }

    // Brand archetype
    if (styleProfile.brand_archetype && styleProfile.brand_archetype.length > 0) {
      softGuidelines.push(`- Brand archetype: ${styleProfile.brand_archetype.join(', ')} (keep this in mind for overall vibe)`);
    }
  }

  return {
    hardConstraints: hardConstraints.join('\n'),
    softGuidelines: softGuidelines.length > 0 
      ? softGuidelines.join('\n')
      : 'No specific style guidelines available. Use modern, professional design principles.',
  };
}

// ============================================================================
// GPT-5.1 PROMPTING LAYER
// ============================================================================

async function callGPT51(
  userPrompt: string,
  brand: Brand,
  assets: AssetInput[],
  references: AssetInput[],
  aspectRatio?: string | null  // User-selected aspect ratio (null/undefined/'auto' means let GPT decide)
): Promise<{ renderPlan: RenderPlan; promptInfo: GPTPromptInfo | null }> {
  if (!OPENAI_API_KEY) {
    // Fallback to simple prompt if no OpenAI key
    console.log("No OpenAI API key, using fallback prompt generation");
    return { 
      renderPlan: generateFallbackRenderPlan(userPrompt, brand, assets),
      promptInfo: null 
    };
  }

  const { hardConstraints, softGuidelines } = buildBrandContext(brand);
  
  const assetsContext = assets.length > 0 
    ? `HIGH-FIDELITY ASSETS TO INCLUDE (must appear accurately in the final design):
These are product images, logos, or specific objects that MUST be included in the generated image with high accuracy. The image generation model will receive these as high-fidelity references and should reproduce them faithfully in the design.

${assets.map(a => `- ${a.name} (${a.category || 'general'}): ${a.url}`).join('\n')}

IMPORTANT: These assets should be included prominently and accurately in the final design. They are not just style inspiration - they are actual elements that must appear in the output.`
    : 'No specific high-fidelity assets to include.';

  // Check if user has provided reference images (for ad concept inspiration)
  const hasReferenceAds = references.length > 0;
  
  let referencesContext = hasReferenceAds
    ? `REFERENCE AD DESIGNS (for concept inspiration):
The user has attached reference ad designs that they want you to use as inspiration for the concept and style. You should create something similar to the concept of these ads but adapted to fit the brand using brand colors and elements.

${references.map(r => {
      const styleDesc = r.style_description ? `\n  Style description: ${r.style_description}` : '';
      return `- ${r.name} (${r.category || 'general'}): ${r.url}${styleDesc}`;
    }).join('\n')}

IMPORTANT: Use these reference ads to understand the concept, layout approach, and visual style, but adapt it to the brand's colors, logo, and overall brand identity. Do not copy text, logos, or specific elements - instead, create a similar concept that fits the brand.`
    : 'No reference ad designs provided.';
  
  // Add aspect ratio constraint if user specified one
  const aspectRatioContext = aspectRatio && aspectRatio !== 'auto'
    ? `\n\nASPECT RATIO CONSTRAINT:
The user has specified that the design MUST use aspect ratio: ${aspectRatio}
- You MUST set "aspect_ratio" in your response to exactly "${aspectRatio}"
- Optimize your design_notes and final_prompt for this specific aspect ratio
- For vertical ratios (9:16, 2:3, 3:4, 4:5), suggest vertical compositions with elements stacked or arranged top-to-bottom
- For square ratios (1:1), suggest balanced, centered compositions
- For landscape ratios (16:9, 21:9, 3:2, 4:3, 5:4), suggest horizontal compositions with elements arranged left-to-right`
    : '';

  // Build the core system prompt - focused exclusively on paid media ad designs
  const systemPrompt = `You are a design prompt architect specializing in paid media ad designs. Your job is to take a user's simple request and transform it into a detailed, optimized prompt for an AI image generation model to create scroll-stopping, attention-grabbing paid media advertisements.

================================================================================
HARD CONSTRAINTS (MUST OBEY - Identity Level)
================================================================================
These are non-negotiable requirements that define the brand's identity. They MUST be followed in every design.

${hardConstraints}

================================================================================
SOFT GUIDELINES (BIAS TOWARDS - Style Level)
================================================================================
These are style preferences extracted from the brand's actual website design. They represent the brand's visual language and design patterns. You should BIAS TOWARDS these, but you are ALLOWED TO DEVIATE when exploring different layouts, compositions, or creative directions. The goal is consistency in visual language, not identical templates.

${softGuidelines}

IMPORTANT: Use soft guidelines as design principles and inspiration, not rigid rules. Each design should feel fresh and varied while respecting the brand's overall aesthetic. For example:
- If the brand uses "rounded cards", you can still use sharp rectangles for variety, but prefer rounded when it makes sense
- If the brand prefers "flat illustration", you can mix in other imagery types, but keep the overall vibe consistent
- If the brand has "high whitespace", you can create denser compositions when appropriate, but maintain the general spacious feel

================================================================================
ASSETS & REFERENCES
================================================================================
${assetsContext}

${referencesContext}${aspectRatioContext}

================================================================================
CRITICAL RULES FOR PAID MEDIA AD DESIGNS
================================================================================
1. THIS IS A PAID MEDIA AD: The design must be scroll-stopping, attention-grabbing, and visually appealing. Utilize best practices for paid media ads to create something that is visually compelling, on-brand, and convincing.

2. BRAND COLORS ONLY: Utilize ONLY the brand colors specified in the hard constraints. Do NOT invent random colors. Stick strictly to the brand color palette.

3. BRAND SHAPES AND STYLES: Take inspiration from the brand's website screenshot (which will be provided) to understand brand shapes, styles, and design direction. Don't invent random shapes unless absolutely necessary - prefer shapes and styles that align with the brand's visual identity.

4. LOGO AND ICON USAGE: The brand logo and favicon/icon will be provided as images. You MUST use them exactly as they are without making any changes to them. Do NOT modify, recolor, or reinterpret the logo or icon. Place them prominently where appropriate.

5. WEBSITE SCREENSHOT INSPIRATION: The brand's website screenshot will be provided. Use it to understand the brand's style, visual direction, color usage patterns, typography, and overall aesthetic. This is your primary reference for understanding how the brand presents itself visually.

6. DESIGN DECISIONS: Figure out what is the best design to deliver the message and what are the ideal elements to use. Consider the user's request, the brand identity, and best practices for paid media ads.

7. REFERENCE ADS (if provided): ${hasReferenceAds ? 'The user has attached reference ad designs. Create something similar to the concept of these ads in a way that fits the brand using brand colors and elements. Adapt the concept and style, but do not copy text, logos, or specific elements.' : 'No reference ads provided - create an original ad design based on the brand and user request.'}

8. Understand what this brand does from the description above - ensure the design accurately reflects their industry, products, and services

9. Generate appropriate headline and CTA text based on the user's intent AND what the brand does

10. NEVER invent specific discounts, percentages, or numbers unless the user explicitly provides them

11. NEVER invent statistics, customer counts, or factual claims about the brand

12. If the topic involves a cultural/national event (like "Independence Day"), do NOT assume a specific country unless stated

13. The headline and CTA should be generic enough to be safe but compelling

14. Describe the overall layout naturally - focus on what looks good, not rigid percentages or exact positions

15. ASSETS (High-Fidelity): CRITICAL - You MUST explicitly mention each attached high-fidelity asset in your final_prompt. These assets are attached as images and MUST appear accurately in the final design. In your final_prompt, explicitly state something like "Include the attached [asset name] image" or "Feature the [asset name] prominently" for EACH asset. Do not assume the model will include them automatically - you must explicitly instruct inclusion. Describe their placement, size, and integration into the composition.

16. HARD CONSTRAINTS: All hard constraints (colors, logo, brand description, voice) MUST be strictly followed

17. SOFT GUIDELINES: Use soft guidelines to inform your design choices, but feel free to explore variations and different compositions while maintaining the brand's overall visual language

OUTPUT FORMAT:
You must respond with a valid JSON object matching this schema:
{
  "channel": "linkedin_post | instagram_post | story | facebook_ad | twitter | youtube_thumbnail | general",
  "objective": "awareness | promo | announcement | hiring | product_launch | general",
  "aspect_ratio": "1:1 | 2:3 | 3:4 | 4:5 | 9:16 | 3:2 | 4:3 | 5:4 | 16:9 | 21:9"${aspectRatio && aspectRatio !== 'auto' ? ` (MUST be "${aspectRatio}" if user specified it)` : ' (recommend based on channel and content)'},
  "resolution": "1K | 2K | 4K (optional - recommend based on channel and use case. Use 2K for most social media, 4K for high-quality prints/ads, 1K for quick tests)",
  "headline": "compelling headline text or null if not needed",
  "subheadline": "supporting text or null",
  "cta": "call to action text or null",
  "design_notes": "detailed description of the visual composition, style, and overall aesthetic",
  "text_region_notes": "natural description of where text should appear (avoid rigid percentages)",
  "asset_instructions": [{"asset_id": "...", "usage": "specific instructions on how to include this high-fidelity asset accurately in the design (placement, size, integration)"}],
  "final_prompt": "the complete, detailed prompt for the image generation model. This is for a PAID MEDIA AD DESIGN. MUST include: (1) Emphasis that this is a paid media ad that needs to be scroll-stopping and attention-grabbing, (2) Instruction to use ONLY brand colors (no random colors), (3) Instruction to use logo and icon exactly as provided without modifications, (4) Reference to website screenshot for brand style inspiration, (5) ${hasReferenceAds ? 'Instruction to create something similar to the concept of the reference ads but adapted to the brand' : 'Original ad design based on brand and request'}, (6) all hard constraints (colors, logo, brand description), (7) soft guidelines as design principles (not rigid rules), (8) EXPLICIT instructions mentioning each attached high-fidelity asset by name (e.g., 'Include the attached product image', 'Feature the attached screenshot prominently') - this is CRITICAL as the model needs explicit instructions to include attached images. IMPORTANT: You must explicitly reference each attached asset image in this prompt - do not assume the model will include them automatically."
}

RESOLUTION GUIDELINES:
- For social media posts (LinkedIn, Instagram, Facebook, Twitter): Use "2K" (good quality, standard cost)
- For stories/short-form content: Use "2K" (fast, good quality)
- For high-quality ads, print materials, or premium content: Use "4K" (highest quality, higher cost)
- For quick tests or low-priority content: Use "1K" (fastest, lowest cost)
- Default to "2K" if unsure`;

  const userMessage = `User's request: "${userPrompt}"${aspectRatio && aspectRatio !== 'auto' ? `\n\nIMPORTANT: The user has specified aspect ratio "${aspectRatio}". You MUST use this exact aspect ratio in your response and optimize the design for this format.` : ''}

${hasReferenceAds ? 'The user has attached reference ad designs. Create something similar to the concept of these ads but adapted to fit the brand using brand colors and elements.' : ''}

Based on this request and the brand context, create a detailed render plan and final prompt for generating a high-quality, scroll-stopping paid media ad design that is attention-grabbing and on-brand.`;

  // Create prompt info for logging/display
  const promptInfo: GPTPromptInfo = {
    system_prompt: systemPrompt,
    user_message: userMessage,
    full_prompt: `=== SYSTEM PROMPT ===\n\n${systemPrompt}\n\n=== USER MESSAGE ===\n\n${userMessage}`,
  };

  // Log the prompt for reference
  // Consolidated GPT prompt logging (truncate if too long)
  const promptPreview = promptInfo.full_prompt.length > 200 
    ? promptInfo.full_prompt.substring(0, 200) + '...' 
    : promptInfo.full_prompt;
  console.log(`[GPT Prompt] ${promptPreview}`);

  try {
    console.log("Calling GPT-5.1 for prompt optimization...");
    
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
        max_completion_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, response.statusText);
      console.error("Error details:", errorText);
      // Fall back to simple generation
      return { 
        renderPlan: generateFallbackRenderPlan(userPrompt, brand, assets),
        promptInfo: promptInfo // Still return prompt info even on error
      };
    }

    const data = await response.json();
    
    // Log full response structure for debugging
    console.log("OpenAI response structure:", JSON.stringify({
      hasChoices: !!data.choices,
      choicesLength: data.choices?.length || 0,
      hasMessage: !!data.choices?.[0]?.message,
      hasContent: !!data.choices?.[0]?.message?.content,
      finishReason: data.choices?.[0]?.finish_reason,
      model: data.model,
    }));
    
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error("No content in OpenAI response. Full response:", JSON.stringify(data, null, 2));
      return { 
        renderPlan: generateFallbackRenderPlan(userPrompt, brand, assets),
        promptInfo: promptInfo
      };
    }

    try {
      const renderPlan = JSON.parse(content) as RenderPlan;
      console.log("GPT-5.1 render plan generated successfully");
      console.log("Channel:", renderPlan.channel);
      return { renderPlan, promptInfo };
    } catch (parseError) {
      console.error("Failed to parse OpenAI response as JSON:", parseError);
      console.error("Content that failed to parse:", content.substring(0, 500));
      return { 
        renderPlan: generateFallbackRenderPlan(userPrompt, brand, assets),
        promptInfo: promptInfo
      };
    }

  } catch (error) {
    console.error("GPT-5.1 call failed:", error);
    return { 
      renderPlan: generateFallbackRenderPlan(userPrompt, brand, assets),
      promptInfo: promptInfo
    };
  }
}

function generateFallbackRenderPlan(
  userPrompt: string,
  brand: Brand,
  assets: AssetInput[]
): RenderPlan {
  // Detect channel from prompt
  const promptLower = userPrompt.toLowerCase();
  let channel = "general";
  let aspectRatio = "1:1";
  
  if (promptLower.includes("linkedin")) {
    channel = "linkedin_post";
    aspectRatio = "1:1";
  } else if (promptLower.includes("instagram") && promptLower.includes("story")) {
    channel = "story";
    aspectRatio = "9:16";
  } else if (promptLower.includes("instagram")) {
    channel = "instagram_post";
    aspectRatio = "1:1";
  } else if (promptLower.includes("facebook")) {
    channel = "facebook_ad";
    aspectRatio = "4:5";
  } else if (promptLower.includes("twitter") || promptLower.includes("x post")) {
    channel = "twitter";
    aspectRatio = "16:9";
  } else if (promptLower.includes("youtube") || promptLower.includes("thumbnail")) {
    channel = "youtube_thumbnail";
    aspectRatio = "16:9";
  }

  // Build color descriptions
  const colorPalette: string[] = [];
  if (brand.colors.primary) {
    colorPalette.push(`${describeColor(brand.colors.primary)} (${brand.colors.primary}) as the dominant accent`);
  }
  if (brand.colors.secondary) {
    colorPalette.push(`${describeColor(brand.colors.secondary)} (${brand.colors.secondary}) for supporting elements`);
  }

  const styleDesc: string[] = [];
  if (brand.voice?.formality === 'professional' || brand.voice?.formality === 'formal') {
    styleDesc.push('clean, professional');
  } else if (brand.voice?.formality === 'casual') {
    styleDesc.push('friendly, approachable');
  }
  if (brand.voice?.energy === 'high') {
    styleDesc.push('dynamic, energetic');
  } else if (brand.voice?.energy === 'low') {
    styleDesc.push('calm, sophisticated');
  }

  const assetInstructions = assets.map(a => ({
    asset_id: a.id,
    usage: a.role === 'must_include' 
      ? `Include ${a.name} prominently in the design` 
      : `Use ${a.name} as style reference only`
  }));

  // Build brand description section
  const brandDescription = brand.styleguide?.summary 
    ? `\n\nWHAT THIS BRAND DOES:\n${brand.styleguide.summary}\n\nUse this information to ensure the design accurately represents what ${brand.name} does and their industry.`
    : '';

  const finalPrompt = `
Create a high-quality paid media ad design for ${brand.name}. This is a paid media ad, so it needs to be appealing, scroll-stopping, and attention-grabbing. Utilize best practices to create something that is visually appealing and on-brand yet convincing.

REQUEST: ${userPrompt}

BRAND INFORMATION:
- Brand: ${brand.name}${brand.slogan ? ` - "${brand.slogan}"` : ''}${brandDescription}

SPECIFICATIONS:
- Aspect ratio: ${aspectRatio}
- Visual style: ${styleDesc.length > 0 ? styleDesc.join(', ') : 'modern and professional'}
- Theme: ${brand.styleguide?.mode || 'auto'}

COLOR REQUIREMENTS (STRICT - USE ONLY BRAND COLORS):
${colorPalette.length > 0 
  ? `${colorPalette.join('\n')}\n\nCRITICAL: Utilize ONLY the brand colors listed above. Do NOT invent random colors. Try to take inspiration from any brand shapes and styles using the website screenshot provided. Don't invent random shapes unless necessary.`
  : 'Use modern, professional colors'}

BRAND ELEMENTS:
- The brand logo and icon/favicon will be provided as images - use them exactly as they are without making changes to them
- Take inspiration from the website screenshot to understand the brand style and direction
- Figure out what is the best design to deliver the message and what are the ideal elements to use

COMPOSITION:
- Create a scroll-stopping, attention-grabbing layout optimized for paid media ads
- Ensure there's clear space for text content (headline and CTA) that's easy to read
- REQUIRED: The brand logo MUST be included in the design - use it exactly as provided
- Focus on visual appeal, brand consistency, and conversion optimization

TEXT CONTENT:
- Generate an appropriate headline based on the request and what the brand does
- Include a relevant call-to-action if appropriate
- Keep text minimal and impactful

CRITICAL REQUIREMENTS:
- This is a design for paid media ad, so it needs to be appealing, scroll-stopping and attention-grabbing
- Utilize best practices to create something that is visually appealing and on-brand yet convincing
- The brand logo MUST appear in the final design - use it exactly as provided without modifications
- Use ONLY the brand colors specified above - no other colors
- Utilize the logo and icon as and when needed, but use exactly as they are without making changes
- Take inspiration from the website screenshot to understand the brand style and direction
- Maintain professional quality suitable for paid media advertising
- The design must unmistakably represent this brand and what they do
- Leave clean text regions that are easy to read
`.trim();

  return {
    channel,
    objective: "general",
    aspect_ratio: aspectRatio,
    headline: null, // Let image model generate
    subheadline: null,
    cta: null,
    design_notes: `Professional ${channel} design for ${brand.name} with ${styleDesc.join(', ')} aesthetic`,
    text_region_notes: "Natural layout with clear space for text content",
    asset_instructions: assetInstructions,
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

// Resolution mapping based on Gemini 3 Pro Image Preview specifications
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

function getResolution(aspectRatio: AspectRatioValue | 'auto' | undefined, resolutionLevel: ResolutionLevel = '2K'): Resolution | null {
  if (!aspectRatio || aspectRatio === 'auto') {
    return null; // Let AI decide
  }
  
  const ratioMap = RESOLUTION_MAP[aspectRatio as AspectRatioValue];
  if (!ratioMap) {
    return null;
  }
  
  return ratioMap[resolutionLevel];
}

/**
 * Validates and normalizes aspect ratio to ensure it matches Gemini API requirements.
 * Valid values: '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'
 * @param aspectRatio - The aspect ratio to validate
 * @returns Valid aspect ratio or null if invalid
 */
function validateAspectRatio(aspectRatio: string | null | undefined): AspectRatioValue | null {
  if (!aspectRatio) return null;
  
  // Normalize: trim whitespace and ensure exact format
  const normalized = aspectRatio.trim();
  
  // Valid Gemini API aspect ratios
  const validRatios: AspectRatioValue[] = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
  
  // Check if normalized value is in the valid list
  if (validRatios.includes(normalized as AspectRatioValue)) {
    return normalized as AspectRatioValue;
  }
  
  // Log warning for invalid values
  console.warn(`Invalid aspect ratio "${aspectRatio}" - must be one of: ${validRatios.join(', ')}`);
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
    const lowerUrl = url.toLowerCase();
    
    // Check for SVG data URIs (data:image/svg+xml)
    if (lowerUrl.startsWith('data:image/svg+xml')) return false;
    
    // Check for SVG file extensions
    if (lowerUrl.includes('.svg')) return false;
    
    // Check for raster file extensions
    if (RASTER_EXTENSIONS.some(ext => lowerUrl.includes(ext))) return true;
    
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

  if (brand.logos?.primary && isLikelyRaster(brand.logos.primary)) {
    return brand.logos.primary;
  }

  if (brand.all_logos?.length) {
    const rasterLogos = brand.all_logos
      .filter(logo => logo.url && isLikelyRaster(logo.url))
      .sort((a, b) => {
        const getPriority = (url: string): number => {
          const lower = url.toLowerCase();
          if (lower.includes('.png')) return 0;
          if (lower.includes('.jpg') || lower.includes('.jpeg')) return 1;
          if (lower.includes('.webp')) return 2;
          return 3;
        };
        return getPriority(a.url) - getPriority(b.url);
      });

    if (rasterLogos.length > 0) {
      return rasterLogos[0].url;
    }
  }

  if (brand.logos?.icon && isLikelyRaster(brand.logos.icon)) {
    return brand.logos.icon;
  }

  // Don't return SVG logos as fallback - return null instead
  // This prevents trying to use unsupported SVG formats
  return null;
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string; width?: number; height?: number } | null> {
  try {
    // Handle data URIs directly (don't fetch them)
    if (url.startsWith('data:')) {
      const [header, data] = url.split(',');
      const mimeMatch = header.match(/data:([^;]+)/);
      const mimeType = mimeMatch ? mimeMatch[1].toLowerCase().trim() : 'image/png';
      
      // Check if it's a supported type
      if (!SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
        console.warn(`Skipping unsupported image type in data URI: ${mimeType}`);
        return null;
      }
      
      // For data URIs, the data is already base64 encoded (or URL-encoded)
      // If it's URL-encoded (starts with %), we need to decode it first
      let base64Data = data;
      if (data.startsWith('%')) {
        // URL-encoded data URI - decode it
        try {
          const decoded = decodeURIComponent(data);
          // Extract base64 part if it's base64 encoded
          base64Data = decoded;
        } catch (e) {
          console.warn('Failed to decode URL-encoded data URI');
          return null;
        }
      }
      
      return { data: base64Data, mimeType };
    }
    
    // Regular URL - fetch it
    const response = await fetch(url);
    if (!response.ok) return null;
    
    let contentType = response.headers.get('content-type') || 'image/png';
    contentType = contentType.split(';')[0].trim().toLowerCase();
    
    if (!SUPPORTED_IMAGE_TYPES.includes(contentType)) {
      console.warn(`Skipping unsupported image type: ${contentType}`);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Try to extract dimensions from PNG/JPEG headers
    let width: number | undefined;
    let height: number | undefined;
    
    if (contentType === 'image/png' && uint8Array.length >= 24) {
      // PNG: width and height are at bytes 16-23 (big-endian)
      width = (uint8Array[16] << 24) | (uint8Array[17] << 16) | (uint8Array[18] << 8) | uint8Array[19];
      height = (uint8Array[20] << 24) | (uint8Array[21] << 16) | (uint8Array[22] << 8) | uint8Array[23];
    } else if ((contentType === 'image/jpeg' || contentType === 'image/jpg') && uint8Array.length >= 20) {
      // JPEG: Look for SOF markers (0xFFC0, 0xFFC1, 0xFFC2) - dimensions are at offset +5 and +7
      for (let i = 0; i < uint8Array.length - 9; i++) {
        if (uint8Array[i] === 0xFF && (uint8Array[i + 1] === 0xC0 || uint8Array[i + 1] === 0xC1 || uint8Array[i + 1] === 0xC2)) {
          height = (uint8Array[i + 5] << 8) | uint8Array[i + 6];
          width = (uint8Array[i + 7] << 8) | uint8Array[i + 8];
          break;
        }
      }
    }
    
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    const base64 = btoa(binary);
    
    return { data: base64, mimeType: contentType, width, height };
  } catch (error) {
    console.error('Failed to fetch image:', error);
    return null;
  }
}

/**
 * Detects aspect ratio from image dimensions
 * Returns a valid AspectRatioValue or null if cannot be determined
 */
function detectAspectRatioFromDimensions(width: number, height: number): AspectRatioValue | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  
  const ratio = width / height;
  
  // Tolerance for aspect ratio matching (±0.02)
  const ratios: Array<{ value: AspectRatioValue; ratio: number }> = [
    { value: '1:1', ratio: 1.0 },
    { value: '2:3', ratio: 2/3 },
    { value: '3:2', ratio: 3/2 },
    { value: '3:4', ratio: 3/4 },
    { value: '4:3', ratio: 4/3 },
    { value: '4:5', ratio: 4/5 },
    { value: '5:4', ratio: 5/4 },
    { value: '9:16', ratio: 9/16 },
    { value: '16:9', ratio: 16/9 },
    { value: '21:9', ratio: 21/9 },
  ];
  
  for (const { value, ratio: targetRatio } of ratios) {
    if (Math.abs(ratio - targetRatio) < 0.02) {
      return value;
    }
  }
  
  return null;
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
    
    const { data, error } = await supabase.storage
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
  const logger = createLogger('generate-image');
  const requestId = logger.generateRequestId();
  const startTime = performance.now();
  
  // Handle CORS preflight requests
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
    } catch (parseError) {
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
      assets = [],      // Assets to include
      references = [],  // Style references
      aspectRatio,     // Aspect ratio: '1:1' | '2:3' | '3:4' | '4:5' | '9:16' | '3:2' | '4:3' | '5:4' | '16:9' | '21:9' | 'auto'
      // Default to 2K resolution (same token cost as 1K but better quality)
      resolution: resolutionLevel = '2K', // Resolution level: '1K' | '2K' | '4K'
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

    // Fetch brand data and get user_id
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
        logger.setContext({ user_id: userId, brand_id: brandId });
      }
    }

    // If we have imageId, get user_id from the image record (more reliable)
    if (imageId && !userId) {
      const { data: imageData } = await supabase
        .from("images")
        .select("user_id")
        .eq("id", imageId)
        .single();
      
      if (imageData) {
        userId = imageData.user_id;
        logger.setContext({ user_id: userId });
      }
    }

    // Credit deduction logic: Always deduct 1 credit for new generations
    if (userId) {
      // First, check current credits
      const { data: creditsData, error: creditsError } = await supabase
        .from("user_credits")
        .select("credits")
        .eq("user_id", userId)
        .single();

      const currentCredits = creditsData?.credits ?? 0;
      
      // If no credits record or insufficient credits
      if (creditsError || currentCredits < 1) {
        console.log("Credit check failed:", { creditsError, currentCredits, userId });
        return new Response(
          JSON.stringify({ 
            error: "Insufficient credits. Please purchase more credits to generate images.",
            credits: currentCredits
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Deduct credit using direct UPDATE (more reliable than RPC)
      const { error: deductError } = await supabase
        .from("user_credits")
        .update({ 
          credits: currentCredits - 1,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", userId)
        .eq("credits", currentCredits); // Optimistic lock to prevent race conditions

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

      // Log the transaction (non-blocking - don't fail if this errors)
      try {
        await supabase
          .from("credit_transactions")
          .insert({
            user_id: userId,
            type: 'deducted',
            amount: -1,
            balance_after: currentCredits - 1,
            source: 'usage',
            description: 'Credit used for image generation'
          });
      } catch (txError) {
        console.warn("Failed to log credit transaction:", txError);
        // Don't fail the request - credit was already deducted
      }

      console.log(`Credit deducted for user ${userId}: ${currentCredits} -> ${currentCredits - 1}`);
    }

    // Consolidated request logging
      logger.info(`Image generation started`, {
        prompt_preview: prompt.substring(0, 100),
        assets_count: assets.length,
        references_count: references.length,
        aspect_ratio: aspectRatio,
        resolution: resolutionLevel,
      });

    // Validate Gemini 3 Pro Image limits
    const MAX_HIGH_FIDELITY = 6; // Assets (high-fidelity objects)
    const MAX_TOTAL_IMAGES = 14; // Total reference images

    // Count auto-included images (logo OR icon, not both)
    const hasLogoOrIcon = brand && includeLogoReference && (brand.logos?.primary || brand.logos?.icon);
    const autoIncludedCount = [
      hasLogoOrIcon ? 1 : 0,
      brand?.backdrops?.length ? 1 : 0,
      brand?.screenshot ? 1 : 0,
    ].reduce((a, b) => a + b, 0);

    const totalImages = (assets as AssetInput[]).length + (references as AssetInput[]).length + autoIncludedCount;

    // Validate limits
    if ((assets as AssetInput[]).length > MAX_HIGH_FIDELITY) {
      return new Response(
        JSON.stringify({ error: `Too many assets. Maximum ${MAX_HIGH_FIDELITY} high-fidelity images allowed.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (totalImages > MAX_TOTAL_IMAGES) {
      return new Response(
        JSON.stringify({ 
          error: `Too many images. Maximum ${MAX_TOTAL_IMAGES} total images allowed (including ${autoIncludedCount} auto-included). You have ${totalImages} total.` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Consolidated into main request log above

    // Build the request parts for Gemini
    const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [];
    
    // Store GPT prompt info for response
    let gptPromptInfo: GPTPromptInfo | null = null;
    let renderPlan: RenderPlan | null = null; // Store render plan for resolution recommendation
      
    // ================================================================
    // GPT-5.1 PROMPTING LAYER
    // ================================================================
    
    let finalPrompt: string;

    if (brand) {
      // Use GPT-5.1 to generate optimized prompt
      // Pass aspectRatio only if user specified one (not 'auto' or undefined)
      const aspectRatioToPass = aspectRatio && aspectRatio !== 'auto' ? aspectRatio : undefined;
      const gptResult = await callGPT51(
        prompt,
        brand,
        assets as AssetInput[],
        references as AssetInput[],
        aspectRatioToPass
      );
      renderPlan = gptResult.renderPlan;
      gptPromptInfo = gptResult.promptInfo;
      finalPrompt = renderPlan.final_prompt;
      
      // Consolidated GPT optimization logging
      const gptInfo = [
        `Channel: ${renderPlan.channel}`,
        renderPlan.headline ? `Headline: ${renderPlan.headline}` : null,
        renderPlan.resolution ? `Resolution: ${renderPlan.resolution}` : null,
      ].filter(Boolean).join(' | ');
      console.log(`[GPT-5.1 Optimized] ${gptInfo}`);
    } else {
      finalPrompt = prompt;
    }

    // Store logo OR icon data to add AFTER the prompt (closer to generation = more attention)
    // Prefer logo, fallback to icon if no logo available
    let logoDataToAttach: { mimeType: string; data: string } | null = null;
    let logoAttached = false;
    
    if (brand && includeLogoReference) {
      // Try to fetch logo first
      const bestLogoUrl = getBestLogoUrl(brand);
      if (bestLogoUrl) {
        console.log(`[Logo] Fetching logo from: ${bestLogoUrl}`);
        const logoData = await fetchImageAsBase64(bestLogoUrl);
        if (logoData) {
          logoDataToAttach = logoData;
          console.log(`[Logo] Successfully fetched: ${logoData.mimeType}, ${Math.round(logoData.data.length / 1024)}KB`);
        } else {
          console.warn(`[Logo] Failed to fetch logo from: ${bestLogoUrl}`);
        }
      }
      
      // Only fetch icon/favicon if we don't have a logo
      if (!logoDataToAttach && brand.logos?.icon) {
        console.log(`[Icon] No logo available, fetching icon from: ${brand.logos.icon}`);
        const iconData = await fetchImageAsBase64(brand.logos.icon);
        if (iconData) {
          logoDataToAttach = iconData; // Use same variable, it's just the brand identifier
          console.log(`[Icon] Successfully fetched: ${iconData.mimeType}, ${Math.round(iconData.data.length / 1024)}KB`);
        } else {
          console.warn(`[Icon] Failed to fetch icon from: ${brand.logos.icon}`);
        }
      }
    }

    // Add user-selected assets (must_include)
    const attachedAssetNames: string[] = [];
    for (const asset of (assets as AssetInput[])) {
      const assetData = await fetchImageAsBase64(asset.url);
      if (assetData) {
        const instruction = renderPlan?.asset_instructions.find(ai => ai.asset_id === asset.id);
        attachedAssetNames.push(asset.name);
        parts.push({
          text: `HIGH-FIDELITY ASSET TO INCLUDE - "${asset.name}" (${asset.category || 'general'}):\n\nThis is a REQUIRED element that MUST appear accurately in the final generated image. ${instruction?.usage || 'Include this prominently in the design with high fidelity and accuracy'}. This is not optional - the attached image below must be reproduced in the output.`,
        });
        parts.push({
          inline_data: {
            mime_type: assetData.mimeType,
            data: assetData.data,
          },
        });
      }
    }

    // Add backdrop/style references
    if (brand?.backdrops?.length) {
      const backdropData = await fetchImageAsBase64(brand.backdrops[0].url);
      if (backdropData) {
        parts.push({
          text: "STYLE REFERENCE - Example of the brand's visual style. Use this for mood and style inspiration only, do not copy elements directly:",
        });
        parts.push({
          inline_data: {
            mime_type: backdropData.mimeType,
            data: backdropData.data,
          },
        });
      }
    }

    // Add homepage screenshot as style reference (in addition to style profile analysis)
    if (brand?.screenshot) {
      const screenshotData = await fetchImageAsBase64(brand.screenshot);
      if (screenshotData) {
        parts.push({
          text: "WEBSITE SCREENSHOT - This is the brand's actual homepage. Use this to understand the brand's visual design language, layout patterns, color usage, typography, shapes, styles, and overall aesthetic. Take inspiration from the brand shapes and styles shown here. Don't invent random shapes unless necessary - prefer shapes and styles that align with what you see in this screenshot. This is your primary reference for understanding how the brand presents itself visually.",
        });
        parts.push({
          inline_data: {
            mime_type: screenshotData.mimeType,
            data: screenshotData.data,
          },
        });
      }
    }

    // Add user-selected references (reference ad designs)
    for (const ref of (references as AssetInput[])) {
      const refData = await fetchImageAsBase64(ref.url);
      if (refData) {
        const styleDesc = ref.style_description 
          ? ` Style: ${ref.style_description}.` 
          : '';
        parts.push({
          text: `REFERENCE AD DESIGN - "${ref.name}".${styleDesc} This is a reference ad design. Create something similar to the concept of this ad in a way that fits the brand using brand colors and elements. Adapt the concept and style, but do not copy text, logos, or specific elements. Use this to understand the ad concept and approach, then create a similar concept that fits the brand.`,
        });
        parts.push({
          inline_data: {
            mime_type: refData.mimeType,
            data: refData.data,
          },
        });
      }
    }

    // Add explicit instruction tying attached assets to the prompt
    if (attachedAssetNames.length > 0) {
      parts.push({
        text: `\n\nCRITICAL REQUIREMENT: The ${attachedAssetNames.length} image${attachedAssetNames.length > 1 ? 's' : ''} attached above (${attachedAssetNames.join(', ')}) ${attachedAssetNames.length > 1 ? 'are' : 'is'} REQUIRED and MUST be included in the final design. These are high-fidelity assets that must appear accurately in the output. Do not generate the design without including ${attachedAssetNames.length > 1 ? 'these assets' : 'this asset'}.`,
      });
    }

    // Add the optimized prompt FIRST (main instruction)
    parts.push({ text: finalPrompt });

    // Add logo OR icon IMMEDIATELY after the prompt (high priority, close to generation)
    if (logoDataToAttach) {
      parts.push({
        text: `

=== CRITICAL: BRAND LOGO/ICON (MUST INCLUDE) ===
The image below is the EXACT brand logo or icon. This is NOT a suggestion - you MUST include this in the generated image.

MANDATORY REQUIREMENTS:
1. COPY THIS EXACTLY - pixel-perfect reproduction, no modifications
2. DO NOT generate a different logo/icon or interpret the brand name as text
3. PRESERVE the original colors exactly as shown (do NOT color-match to the design)
4. USE EXACTLY AS IS - do not make any changes
5. PLACE prominently in a corner (top-left or top-right) or where appropriate for the ad design
6. MAINTAIN exact proportions - do not stretch, skew, or resize disproportionately

The attached image below is the ONLY acceptable brand identifier. Any other logo/icon is WRONG.`,
      });
      parts.push({
        inline_data: {
          mime_type: logoDataToAttach.mimeType,
          data: logoDataToAttach.data,
        },
      });
      logoAttached = true;
      console.log(`[Logo/Icon] Attached to request at position ${parts.length - 1}`);
    }

    // Resolution is always fixed at 2K
    const finalResolution: ResolutionLevel = '2K';
    
    // Determine which aspect ratio to use - ALWAYS set one (never let model decide)
    let aspectRatioToUse: string | null = null;
    
    if (aspectRatio && aspectRatio !== 'auto') {
      // User specified an aspect ratio - use it
      aspectRatioToUse = aspectRatio;
    } else if (aspectRatio === 'auto' || !aspectRatio) {
      // Auto mode: use GPT's recommended aspect ratio if available
      if (renderPlan?.aspect_ratio && renderPlan.aspect_ratio !== 'auto') {
        aspectRatioToUse = renderPlan.aspect_ratio;
      } else {
        // Default to 1:1 (square) for paid media ads if nothing specified
        // This is a common format for social media ads
        aspectRatioToUse = '1:1';
        console.log(`[Aspect Ratio] No aspect ratio specified, defaulting to 1:1 for paid media ads`);
      }
    }
    
    // Validate aspect ratio before using it (must match Gemini API requirements)
    const validatedAspectRatio = validateAspectRatio(aspectRatioToUse);
    if (!validatedAspectRatio) {
      // Fallback to 1:1 if validation fails
      console.warn(`Invalid aspect ratio "${aspectRatioToUse}" - defaulting to 1:1`);
      aspectRatioToUse = '1:1';
    } else {
      aspectRatioToUse = validatedAspectRatio;
    }
    
    // Get resolution dimensions for logging
    const resolutionDims = getResolution(aspectRatioToUse as AspectRatioValue, finalResolution);
    
    // Build generation config according to Gemini API documentation
    // For gemini-3-pro-image-preview, use image_config with aspect_ratio and image_size
    // Reference: https://ai.google.dev/gemini-api/docs/image-generation
    // ALWAYS set image_config to ensure consistent sizing
    const generationConfig: Record<string, unknown> = {
      responseModalities: ["TEXT", "IMAGE"],
      image_config: {
        aspect_ratio: aspectRatioToUse,
        image_size: finalResolution, // Always 2K
      },
    };
    
    // Consolidated resolution/config logging
    const resolutionInfo = resolutionDims 
      ? `${resolutionDims.width}x${resolutionDims.height} @ ${finalResolution}`
      : `unknown @ ${finalResolution}`;
    console.log(`[Config] aspect_ratio=${aspectRatioToUse} | ${resolutionInfo}`);

    // Call Gemini API
    // Create a sanitized summary for logging
    const partsSummary = parts.map((part, index) => {
      if ('text' in part) {
        const textPreview = part.text.length > 80 ? part.text.substring(0, 80) + '...' : part.text;
        return `[${index}] text: "${textPreview}"`;
      } else if ('inline_data' in part) {
        return `[${index}] image: ${part.inline_data.mime_type} (${Math.round(part.inline_data.data.length / 1024)}KB)`;
      }
      return `[${index}] unknown`;
    }).join(' | ');
    
    // Add final logo/icon reminder at the very end (recency bias helps)
    if (logoAttached) {
      parts.push({
        text: `\n\nFINAL REMINDER: The brand logo/icon attached above MUST appear in the generated image. Do NOT create a different logo/icon. Use the EXACT attached image.`,
      });
    }

    console.log(`[Gemini API] Calling with ${parts.length} parts (logo attached: ${logoAttached}): ${partsSummary}`);
    
    const geminiRequestBody = {
      contents: [{ parts }],
      generationConfig,
    };
    
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiRequestBody),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", errorText);
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    const responseParts = geminiData.candidates?.[0]?.content?.parts?.length || 0;
    console.log(`[Gemini Response] Received with ${responseParts} part(s)`);

    // Check for errors or blocked content
    if (geminiData.candidates?.[0]?.finishReason) {
      const finishReason = geminiData.candidates[0].finishReason;
      if (finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
        console.error("Gemini finish reason:", finishReason);
        throw new Error(`Gemini API finished with reason: ${finishReason}`);
      }
    }

    if (geminiData.candidates?.[0]?.safetyRatings) {
      const blocked = geminiData.candidates[0].safetyRatings.some(
        (rating: { blocked: boolean }) => rating.blocked
      );
      if (blocked) {
        console.error("Content blocked by safety filters");
        throw new Error("Content was blocked by safety filters");
      }
    }

    // Extract image data
    let imageBase64: string | null = null;
    let textResponse: string | null = null;

    if (geminiData.candidates?.[0]?.content?.parts) {
      for (const part of geminiData.candidates[0].content.parts) {
        if (part.text) {
          textResponse = part.text;
        } else if (part.inlineData?.data) {
          imageBase64 = part.inlineData.data;
        } else if (part.inline_data?.data) {
          imageBase64 = part.inline_data.data;
        }
      }
      
      if (textResponse) {
        console.log(`[Gemini Response] Text: "${textResponse.substring(0, 100)}${textResponse.length > 100 ? '...' : ''}"`);
      }
      if (imageBase64) {
        console.log(`[Gemini Response] Image: ${Math.round(imageBase64.length / 1024)}KB extracted`);
      }
    } else {
      console.error("No candidates or parts in response");
      console.error("Full response:", JSON.stringify(geminiData, null, 2));
    }

    if (!imageBase64) {
      const errorMsg = textResponse 
        ? `No image generated. Response: ${textResponse.substring(0, 200)}`
        : "No image generated from Gemini API.";
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Already logged above

    // Upload to storage
    let imageUrl: string | null = null;
    if (imageId && brandId) {
      imageUrl = await uploadToStorage(supabase, imageBase64, brandId, imageId);
    }

    // Update the images table if imageId is provided
    if (imageId) {
      const updateData: Record<string, unknown> = {
        status: 'ready',
        updated_at: new Date().toISOString(),
      };

      if (imageUrl) {
        updateData.image_url = imageUrl;
      }

      // For new generations, store GPT prompt info and aspect ratio in metadata
      const { data: currentImage } = await supabase
        .from('images')
        .select('metadata')
        .eq('id', imageId)
        .single();
      
      const existingMetadata = (currentImage?.metadata as Record<string, unknown>) || {};
      const newMetadata: Record<string, unknown> = {
        ...existingMetadata,
      };
      
      if (gptPromptInfo) {
        newMetadata.gpt_prompt_info = gptPromptInfo;
      }
      
      // Store the aspect ratio that was used (for future edits)
      // We always set an aspect ratio now, so store it
      if (aspectRatioToUse) {
        newMetadata.aspect_ratio = aspectRatioToUse;
      }
      
      if (Object.keys(newMetadata).length > Object.keys(existingMetadata).length || aspectRatioToUse) {
        updateData.metadata = newMetadata;
      }

      await supabase
        .from('images')
        .update(updateData)
        .eq('id', imageId);
    }

    const duration = performance.now() - startTime;
    logger.info("Image generation completed", {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    return new Response(
      JSON.stringify({
        success: true,
        image_url: imageUrl,
        image_base64: imageBase64,
        mime_type: "image/png",
        text_response: textResponse,
        gpt_prompt_info: gptPromptInfo, // Include GPT prompt for display
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
    logger.error("Image generation error", errorObj, {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    // Send to Sentry
    await captureException(errorObj, {
      function_name: 'generate-image',
      request_id: requestId,
    });

    return new Response(
      JSON.stringify({ 
        error: errorObj.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
