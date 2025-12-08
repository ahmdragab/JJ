import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
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

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  image_url?: string;
  timestamp: string;
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
  hardConstraints.push(`\nLOGO: The brand logo MUST be included in every design. This is non-negotiable.`);

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

  let referencesContext = references.length > 0
    ? `STYLE REFERENCES (for mood/style inspiration only - DO NOT copy directly):
These are reference images used ONLY for understanding style, mood, color palette, composition, and aesthetic. The image generation model should use these for inspiration but should NOT copy any specific elements, text, logos, or objects from them.

${references.map(r => {
      const styleDesc = r.style_description ? `\n  Style description: ${r.style_description}` : '';
      return `- ${r.name} (${r.category || 'general'}): ${r.url}${styleDesc}`;
    }).join('\n')}

IMPORTANT: These are style guides only. Use them to understand the desired aesthetic, but do not include any specific elements from these images in the final design.`
    : 'No user-selected style references provided.';
  
  // Note: We no longer pass raw screenshot - we use the style profile instead

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

  const systemPrompt = `You are a design prompt architect. Your job is to take a user's simple request and transform it into a detailed, optimized prompt for an AI image generation model.

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
CRITICAL RULES
================================================================================
1. Understand what this brand does from the description above - ensure the design accurately reflects their industry, products, and services
2. Generate appropriate headline and CTA text based on the user's intent AND what the brand does
3. NEVER invent specific discounts, percentages, or numbers unless the user explicitly provides them
4. NEVER invent statistics, customer counts, or factual claims about the brand
5. If the topic involves a cultural/national event (like "Independence Day"), do NOT assume a specific country unless stated
6. The headline and CTA should be generic enough to be safe but compelling
7. Describe the overall layout naturally - focus on what looks good, not rigid percentages or exact positions
8. ASSETS (High-Fidelity): Be very specific about how each high-fidelity asset should be used. These must appear accurately in the final design. Describe their placement, size, and integration into the composition.
9. REFERENCES (Style Only): When referencing style images, describe the mood, color palette, composition style, or aesthetic they inspire, but make it clear these are for inspiration only - no specific elements should be copied.
10. HARD CONSTRAINTS: All hard constraints (colors, logo, brand description, voice) MUST be strictly followed
11. SOFT GUIDELINES: Use soft guidelines to inform your design choices, but feel free to explore variations and different compositions while maintaining the brand's overall visual language

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
  "final_prompt": "the complete, detailed prompt for the image generation model. MUST include: (1) all hard constraints (colors, logo, brand description), (2) soft guidelines as design principles (not rigid rules), (3) clear instructions for high-fidelity assets to be included accurately, (4) style references to be used for inspiration only (not copied). Emphasize that soft guidelines should inform the design but allow for creative variation."
}

RESOLUTION GUIDELINES:
- For social media posts (LinkedIn, Instagram, Facebook, Twitter): Use "2K" (good quality, standard cost)
- For stories/short-form content: Use "2K" (fast, good quality)
- For high-quality ads, print materials, or premium content: Use "4K" (highest quality, higher cost)
- For quick tests or low-priority content: Use "1K" (fastest, lowest cost)
- Default to "2K" if unsure`;

  const userMessage = `User's request: "${userPrompt}"${aspectRatio && aspectRatio !== 'auto' ? `\n\nIMPORTANT: The user has specified aspect ratio "${aspectRatio}". You MUST use this exact aspect ratio in your response and optimize the design for this format.` : ''}

Based on this request and the brand context, create a detailed render plan and final prompt for generating a high-quality, on-brand marketing visual.`;

  // Create prompt info for logging/display
  const promptInfo: GPTPromptInfo = {
    system_prompt: systemPrompt,
    user_message: userMessage,
    full_prompt: `=== SYSTEM PROMPT ===\n\n${systemPrompt}\n\n=== USER MESSAGE ===\n\n${userMessage}`,
  };

  // Log the prompt for reference
  console.log("=== GPT PROMPT SENT ===");
  console.log(promptInfo.full_prompt);
  console.log("=== END GPT PROMPT ===");

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
Create a high-quality marketing visual for ${brand.name}.

REQUEST: ${userPrompt}

BRAND INFORMATION:
- Brand: ${brand.name}${brand.slogan ? ` - "${brand.slogan}"` : ''}${brandDescription}

SPECIFICATIONS:
- Aspect ratio: ${aspectRatio}
- Visual style: ${styleDesc.length > 0 ? styleDesc.join(', ') : 'modern and professional'}
- Theme: ${brand.styleguide?.mode || 'auto'}

COLOR REQUIREMENTS (STRICT - USE ONLY THESE):
${colorPalette.length > 0 
  ? `${colorPalette.join('\n')}\n\nCRITICAL: Only use the exact brand colors listed above. Do NOT introduce any colors that are not part of the brand palette. Stick strictly to these colors.`
  : 'Use modern, professional colors'}

COMPOSITION:
- Create a clean, balanced layout that works well for the content
- Ensure there's clear space for text content (headline and CTA) that's easy to read
- REQUIRED: The brand logo MUST be included in the design - place it prominently in a corner position (top-left or top-right)
- Focus on visual appeal and brand consistency

TEXT CONTENT:
- Generate an appropriate headline based on the request and what the brand does
- Include a relevant call-to-action if appropriate
- Keep text minimal and impactful

CRITICAL REQUIREMENTS:
- The brand logo MUST appear in the final design - this is non-negotiable
- Use ONLY the brand colors specified above - no other colors
- Maintain professional quality suitable for marketing
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
    if (lowerUrl.includes('.svg')) return false;
    if (RASTER_EXTENSIONS.some(ext => lowerUrl.includes(ext))) return true;
    return !lowerUrl.includes('.svg');
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

  return brand.logos?.primary || null;
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
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
    
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    const base64 = btoa(binary);
    
    return { data: base64, mimeType: contentType };
  } catch (error) {
    console.error('Failed to fetch image:', error);
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
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
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
      editMode = false,
      previousImageUrl,
      conversation = [],
      includeLogoReference = true,
      assets = [],      // New: assets to include
      references = [],  // New: style references
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
      }
    }

    // Credit deduction logic:
    // - New generations: Always deduct 1 credit
    // - Edits: First edit is free, subsequent edits cost 1 credit
    let shouldDeductCredit = false;
    
    if (!editMode && userId) {
      // New generation - always deduct
      shouldDeductCredit = true;
    } else if (editMode && userId && imageId) {
      // For edits, check if this is the first edit (edit_count === 0 means first edit is free)
      const { data: imageData } = await supabase
        .from("images")
        .select("edit_count")
        .eq("id", imageId)
        .single();
      
      const currentEditCount = imageData?.edit_count ?? 0;
      // Only deduct if this is NOT the first edit (edit_count >= 1 means this will be 2nd+ edit)
      shouldDeductCredit = currentEditCount >= 1;
      
      if (shouldDeductCredit) {
        console.log(`Edit #${currentEditCount + 1} - will deduct credit (first edit was free)`);
      } else {
        console.log(`First edit - free (no credit deduction)`);
      }
    }

    if (shouldDeductCredit && userId) {
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
            description: editMode ? 'Credit used for image edit' : 'Credit used for image generation'
          });
      } catch (txError) {
        console.warn("Failed to log credit transaction:", txError);
        // Don't fail the request - credit was already deducted
      }

      console.log(`Credit deducted for user ${userId}: ${currentCredits} -> ${currentCredits - 1}`);
    }

    console.log("Mode:", editMode ? "EDIT" : "GENERATE");
    console.log("Prompt:", prompt);
    console.log("Assets:", assets.length, "References:", references.length);

    // Validate Gemini 3 Pro Image limits
    const MAX_HIGH_FIDELITY = 6; // Assets (high-fidelity objects)
    const MAX_TOTAL_IMAGES = 14; // Total reference images

    // Count auto-included images
    const autoIncludedCount = [
      brand && includeLogoReference && brand.logos?.primary ? 1 : 0,
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

    console.log(`Image count validation: ${(assets as AssetInput[]).length} assets, ${(references as AssetInput[]).length} references, ${autoIncludedCount} auto-included = ${totalImages}/${MAX_TOTAL_IMAGES} total`);

    // Build the request parts for Gemini
    const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [];
    
    // Store GPT prompt info for response (used in non-edit mode)
    let gptPromptInfo: GPTPromptInfo | null = null;
    let renderPlan: RenderPlan | null = null; // Store render plan for resolution recommendation

    // For edit mode, include the previous image
    if (editMode && previousImageUrl) {
      const previousImageData = await fetchImageAsBase64(previousImageUrl);
      if (previousImageData) {
        parts.push({
          text: "Here is the current image. Please modify it according to the user's request:",
        });
        parts.push({
          inline_data: {
            mime_type: previousImageData.mimeType,
            data: previousImageData.data,
          },
        });
        
        parts.push({
          text: `USER'S EDIT REQUEST: ${prompt}\n\nPlease make these changes while maintaining the overall style and brand consistency.`,
        });
      }

      // Add assets and references in edit mode too
      // Add logo reference (always included unless disabled)
      if (brand && includeLogoReference) {
        const bestLogoUrl = getBestLogoUrl(brand);
        if (bestLogoUrl) {
          const logoData = await fetchImageAsBase64(bestLogoUrl);
          if (logoData) {
            parts.push({
              text: "BRAND LOGO - REQUIRED: This is the brand's logo. You MUST include this logo in the final design. Place it prominently, typically in a corner position (top-left or top-right). The logo is essential and cannot be omitted.",
            });
            parts.push({
              inline_data: {
                mime_type: logoData.mimeType,
                data: logoData.data,
              },
            });
          }
        }
      }

      // Add user-selected assets (must_include)
      for (const asset of (assets as AssetInput[])) {
        const assetData = await fetchImageAsBase64(asset.url);
        if (assetData) {
          parts.push({
            text: `ASSET TO INCLUDE - "${asset.name}" (${asset.category || 'general'}). Include this prominently in the design:`,
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

      // Note: We no longer pass raw screenshot - we use the style profile instead
      // The style profile is already incorporated into the prompt via soft guidelines

      // Add user-selected references (style_reference)
      for (const ref of (references as AssetInput[])) {
        const refData = await fetchImageAsBase64(ref.url);
        if (refData) {
          const styleDesc = ref.style_description 
            ? ` Style: ${ref.style_description}.` 
            : '';
          parts.push({
            text: `STYLE REFERENCE - "${ref.name}".${styleDesc} Use only for mood/style inspiration, do NOT copy any text, logos, or specific elements:`,
          });
          parts.push({
            inline_data: {
              mime_type: refData.mimeType,
              data: refData.data,
            },
          });
        }
      }
    } else {
      // ================================================================
      // NEW: GPT-5.1 PROMPTING LAYER
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
        
        console.log("Using GPT-5.1 optimized prompt");
        console.log("Channel:", renderPlan.channel);
        if (renderPlan.headline) console.log("Headline:", renderPlan.headline);
        if (renderPlan.resolution) console.log("GPT recommended resolution:", renderPlan.resolution);
      } else {
        finalPrompt = prompt;
      }

      // Add logo reference (always included unless disabled)
      if (brand && includeLogoReference) {
        const bestLogoUrl = getBestLogoUrl(brand);
        if (bestLogoUrl) {
          const logoData = await fetchImageAsBase64(bestLogoUrl);
          if (logoData) {
            parts.push({
              text: "BRAND LOGO - REQUIRED: This is the brand's logo. You MUST include this logo in the final design. Place it prominently, typically in a corner position (top-left or top-right). The logo is essential and cannot be omitted.",
            });
            parts.push({
              inline_data: {
                mime_type: logoData.mimeType,
                data: logoData.data,
              },
            });
          }
        }
      }

      // Add user-selected assets (must_include)
      for (const asset of (assets as AssetInput[])) {
        const assetData = await fetchImageAsBase64(asset.url);
        if (assetData) {
          const instruction = renderPlan?.asset_instructions.find(ai => ai.asset_id === asset.id);
          parts.push({
            text: `ASSET TO INCLUDE - "${asset.name}" (${asset.category || 'general'}). ${instruction?.usage || 'Include this prominently in the design'}:`,
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

      // Note: We no longer pass raw screenshot - we use the style profile instead
      // The style profile is already incorporated into the prompt via soft guidelines

      // Add user-selected references (style_reference)
      for (const ref of (references as AssetInput[])) {
        const refData = await fetchImageAsBase64(ref.url);
        if (refData) {
          const styleDesc = ref.style_description 
            ? ` Style: ${ref.style_description}.` 
            : '';
          parts.push({
            text: `STYLE REFERENCE - "${ref.name}".${styleDesc} Use only for mood/style inspiration, do NOT copy any text, logos, or specific elements:`,
          });
          parts.push({
            inline_data: {
              mime_type: refData.mimeType,
              data: refData.data,
            },
          });
        }
      }

      // Add the optimized prompt
      parts.push({ text: finalPrompt });
    }

    // Resolution is always fixed at 2K
    const finalResolution: ResolutionLevel = '2K';
    
    // Determine which aspect ratio to use
    let aspectRatioToUse: string | null = null;
    
    if (aspectRatio && aspectRatio !== 'auto') {
      // User specified an aspect ratio - use it
      aspectRatioToUse = aspectRatio;
      console.log(`Using user-specified aspect ratio: ${aspectRatioToUse}`);
    } else if (aspectRatio === 'auto' || !aspectRatio) {
      // Auto mode: use GPT's recommended aspect ratio if available
      if (renderPlan?.aspect_ratio && renderPlan.aspect_ratio !== 'auto') {
        aspectRatioToUse = renderPlan.aspect_ratio;
        console.log(`Auto mode: Using GPT-recommended aspect ratio: ${aspectRatioToUse}`);
      } else {
        console.log(`Auto mode: No GPT aspect ratio recommendation - model will decide based on prompt`);
      }
    }
    
    // Validate aspect ratio before using it (must match Gemini API requirements)
    const validatedAspectRatio = validateAspectRatio(aspectRatioToUse);
    if (aspectRatioToUse && !validatedAspectRatio) {
      console.warn(`Invalid aspect ratio "${aspectRatioToUse}" - will let model decide instead`);
      aspectRatioToUse = null;
    } else if (validatedAspectRatio) {
      aspectRatioToUse = validatedAspectRatio;
    }
    
    // Get resolution dimensions for logging (if aspect ratio is known)
    const resolutionDims = aspectRatioToUse 
      ? getResolution(aspectRatioToUse as AspectRatioValue, finalResolution)
      : null;
    
    // Log resolution info
    if (resolutionDims) {
      console.log(`Target resolution: ${resolutionDims.width}x${resolutionDims.height} for aspect ratio ${aspectRatioToUse} at ${finalResolution}`);
    } else {
      console.log(`Aspect ratio will be determined by model. Resolution: ${finalResolution}`);
    }
    
    // Build generation config according to Gemini API documentation
    // For gemini-3-pro-image-preview, use image_config with aspect_ratio and image_size
    // Reference: https://ai.google.dev/gemini-api/docs/image-generation
    const generationConfig: Record<string, unknown> = {
      responseModalities: ["TEXT", "IMAGE"],
    };
    
    // Add image_config if we have a validated aspect ratio to use (either user-specified or GPT-recommended)
    if (validatedAspectRatio) {
      generationConfig.image_config = {
        aspect_ratio: validatedAspectRatio,
        image_size: finalResolution, // Always 2K
      };
      console.log(`Using image_config: aspect_ratio=${validatedAspectRatio}, image_size=${finalResolution}`);
    } else {
      // No valid aspect ratio specified - model decides based on prompt
      console.log(`No image_config - model will determine aspect ratio from prompt content`);
    }

    // Call Gemini API
    console.log("Calling Gemini API with", parts.length, "parts...");
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
      console.error("Gemini API error:", errorText);
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    console.log("Gemini response received");

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
      console.log("Number of parts:", geminiData.candidates[0].content.parts.length);
      for (const part of geminiData.candidates[0].content.parts) {
        if (part.text) {
          textResponse = part.text;
          console.log("Text response:", textResponse?.substring(0, 100) ?? '');
        } else if (part.inlineData?.data) {
          imageBase64 = part.inlineData.data;
          console.log("Image data found, length:", part.inlineData.data.length);
        } else if (part.inline_data?.data) {
          imageBase64 = part.inline_data.data;
          console.log("Image data found (alt), length:", part.inline_data.data.length);
        }
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

    console.log("Successfully extracted image data, length:", imageBase64.length);

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

      if (editMode) {
        const assistantMessage: ConversationMessage = {
          role: 'assistant',
          content: textResponse ?? 'Image updated',
          image_url: imageUrl || undefined,
          timestamp: new Date().toISOString(),
        };

        const { data: currentImage } = await supabase
          .from('images')
          .select('conversation, edit_count, image_url, version_history, metadata')
          .eq('id', imageId)
          .single();

        if (currentImage) {
          updateData.conversation = [...(currentImage.conversation || []), assistantMessage];
          updateData.edit_count = (currentImage.edit_count || 0) + 1;
          
          if (currentImage.image_url) {
            const versionHistory = Array.isArray(currentImage.version_history) 
              ? currentImage.version_history 
              : [];
            
            const versionEntry = {
              image_url: currentImage.image_url,
              timestamp: new Date().toISOString(),
              edit_prompt: prompt,
            };
            
            updateData.version_history = [...versionHistory, versionEntry];
          }
        }
      } else {
        // For new generations, store GPT prompt info in metadata
        if (gptPromptInfo) {
          const { data: currentImage } = await supabase
            .from('images')
            .select('metadata')
            .eq('id', imageId)
            .single();
          
          const existingMetadata = (currentImage?.metadata as Record<string, unknown>) || {};
          updateData.metadata = {
            ...existingMetadata,
            gpt_prompt_info: gptPromptInfo,
          };
        }
      }

      await supabase
        .from('images')
        .update(updateData)
        .eq('id', imageId);
    }

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
    console.error("Image generation error:", error);

    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
