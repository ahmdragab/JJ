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
  };
}

interface AssetInput {
  id: string;
  url: string;
  name: string;
  category?: string;
  role: 'must_include' | 'style_reference';
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

function buildBrandContext(brand: Brand): string {
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

  const voice: string[] = [];
  if (brand.voice?.formality) voice.push(`Formality: ${brand.voice.formality}`);
  if (brand.voice?.energy) voice.push(`Energy: ${brand.voice.energy}`);
  if (brand.voice?.adjectives?.length) voice.push(`Adjectives: ${brand.voice.adjectives.join(', ')}`);

  // Build brand description section - this is critical for understanding what the brand does
  let brandDescription = '';
  if (brand.styleguide?.summary) {
    brandDescription = `\n\nWHAT THIS BRAND DOES:\n${brand.styleguide.summary}\n\nThis description is essential - use it to ensure the design accurately represents what ${brand.name} does and their industry/domain.`;
  }

  return `
BRAND: ${brand.name}
${brand.slogan ? `Tagline: "${brand.slogan}"` : ''}
${brand.domain ? `Domain: ${brand.domain}` : ''}${brandDescription}

COLORS (STRICT - USE ONLY THESE):
${colors.length > 0 ? colors.join('\n') : 'Use modern, professional colors'}
${colors.length > 0 ? '\nIMPORTANT: Only use the exact brand colors listed above. Do not introduce colors that are not part of the brand palette.' : ''}

TYPOGRAPHY:
${brand.fonts?.heading ? `- Heading font: ${brand.fonts.heading}` : '- Use clean, modern heading font'}
${brand.fonts?.body ? `- Body font: ${brand.fonts.body}` : '- Use readable body font'}

VOICE & TONE:
${voice.length > 0 ? voice.join('\n') : 'Professional and approachable'}
${brand.voice?.keywords?.length ? `Keywords: ${brand.voice.keywords.join(', ')}` : ''}

THEME: ${brand.styleguide?.mode || 'auto'}
`.trim();
}

// ============================================================================
// GPT-5.1 PROMPTING LAYER
// ============================================================================

async function callGPT51(
  userPrompt: string,
  brand: Brand,
  assets: AssetInput[],
  references: AssetInput[]
): Promise<{ renderPlan: RenderPlan; promptInfo: GPTPromptInfo | null }> {
  if (!OPENAI_API_KEY) {
    // Fallback to simple prompt if no OpenAI key
    console.log("No OpenAI API key, using fallback prompt generation");
    return { 
      renderPlan: generateFallbackRenderPlan(userPrompt, brand, assets),
      promptInfo: null 
    };
  }

  const brandContext = buildBrandContext(brand);
  
  const assetsContext = assets.length > 0 
    ? `HIGH-FIDELITY ASSETS TO INCLUDE (must appear accurately in the final design):
These are product images, logos, or specific objects that MUST be included in the generated image with high accuracy. The image generation model will receive these as high-fidelity references and should reproduce them faithfully in the design.

${assets.map(a => `- ${a.name} (${a.category || 'general'}): ${a.url}`).join('\n')}

IMPORTANT: These assets should be included prominently and accurately in the final design. They are not just style inspiration - they are actual elements that must appear in the output.`
    : 'No specific high-fidelity assets to include.';

  let referencesContext = references.length > 0
    ? `STYLE REFERENCES (for mood/style inspiration only - DO NOT copy directly):
These are reference images used ONLY for understanding style, mood, color palette, composition, and aesthetic. The image generation model should use these for inspiration but should NOT copy any specific elements, text, logos, or objects from them.

${references.map(r => `- ${r.name} (${r.category || 'general'}): ${r.url}`).join('\n')}

IMPORTANT: These are style guides only. Use them to understand the desired aesthetic, but do not include any specific elements from these images in the final design.`
    : 'No user-selected style references provided.';
  
  // Add website screenshot to references context if available
  if (brand.screenshot) {
    referencesContext += `\n\nNOTE: The brand's website screenshot will also be automatically included as a style reference to help the image model understand the brand's actual design aesthetic and visual language.`;
  }

  const systemPrompt = `You are a design prompt architect. Your job is to take a user's simple request and transform it into a detailed, optimized prompt for an AI image generation model.

${brandContext}

${assetsContext}

${referencesContext}

CRITICAL RULES:
1. Understand what this brand does from the description above - ensure the design accurately reflects their industry, products, and services
2. Generate appropriate headline and CTA text based on the user's intent AND what the brand does
3. NEVER invent specific discounts, percentages, or numbers unless the user explicitly provides them
4. NEVER invent statistics, customer counts, or factual claims about the brand
5. If the topic involves a cultural/national event (like "Independence Day"), do NOT assume a specific country unless stated
6. The headline and CTA should be generic enough to be safe but compelling
7. Describe the overall layout naturally - focus on what looks good, not rigid percentages or exact positions
8. ASSETS (High-Fidelity): Be very specific about how each high-fidelity asset should be used. These must appear accurately in the final design. Describe their placement, size, and integration into the composition.
9. REFERENCES (Style Only): When referencing style images, describe the mood, color palette, composition style, or aesthetic they inspire, but make it clear these are for inspiration only - no specific elements should be copied.
10. STRICTLY enforce brand colors only - do not introduce colors outside the brand palette
11. The brand logo MUST be included in every design - mention this clearly in the final prompt

OUTPUT FORMAT:
You must respond with a valid JSON object matching this schema:
{
  "channel": "linkedin_post | instagram_post | story | facebook_ad | twitter | youtube_thumbnail | general",
  "objective": "awareness | promo | announcement | hiring | product_launch | general",
  "aspect_ratio": "1:1 | 16:9 | 9:16 | 4:5",
  "headline": "compelling headline text or null if not needed",
  "subheadline": "supporting text or null",
  "cta": "call to action text or null",
  "design_notes": "detailed description of the visual composition, style, and overall aesthetic",
  "text_region_notes": "natural description of where text should appear (avoid rigid percentages)",
  "asset_instructions": [{"asset_id": "...", "usage": "specific instructions on how to include this high-fidelity asset accurately in the design (placement, size, integration)"}],
  "final_prompt": "the complete, detailed prompt for the image generation model. MUST include: (1) strict instruction to use ONLY brand colors, (2) requirement that brand logo MUST be included, (3) brand description/summary so the model understands what the brand does, (4) clear instructions for high-fidelity assets to be included accurately, (5) style references to be used for inspiration only (not copied)"
}`;

  const userMessage = `User's request: "${userPrompt}"

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
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
    } = await req.json();

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
    if (brandId) {
      const { data: brandData } = await supabase
        .from("brands")
        .select("*")
        .eq("id", brandId)
        .single();

      if (brandData) {
        brand = brandData as Brand;
      }
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
    } else {
      // ================================================================
      // NEW: GPT-5.1 PROMPTING LAYER
      // ================================================================
      
      let finalPrompt: string;
      let renderPlan: RenderPlan | null = null;

      if (brand) {
        // Use GPT-5.1 to generate optimized prompt
        const gptResult = await callGPT51(
          prompt,
          brand,
          assets as AssetInput[],
          references as AssetInput[]
        );
        renderPlan = gptResult.renderPlan;
        gptPromptInfo = gptResult.promptInfo;
        finalPrompt = renderPlan.final_prompt;
        console.log("Using GPT-5.1 optimized prompt");
        console.log("Channel:", renderPlan.channel);
        if (renderPlan.headline) console.log("Headline:", renderPlan.headline);
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

      // Add website screenshot as style reference (always included if available)
      if (brand?.screenshot) {
        const screenshotData = await fetchImageAsBase64(brand.screenshot);
        if (screenshotData) {
          parts.push({
            text: "STYLE REFERENCE - Website screenshot showing the brand's actual website design and visual style. Use this for understanding the brand's aesthetic, layout patterns, and design language. Use only for style inspiration, do NOT copy any text, logos, or specific UI elements:",
          });
          parts.push({
            inline_data: {
              mime_type: screenshotData.mimeType,
              data: screenshotData.data,
            },
          });
        }
      }

      // Add user-selected references (style_reference)
      for (const ref of (references as AssetInput[])) {
        const refData = await fetchImageAsBase64(ref.url);
        if (refData) {
          parts.push({
            text: `STYLE REFERENCE - "${ref.name}". Use only for mood/style inspiration, do NOT copy any text, logos, or specific elements:`,
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

    // Call Gemini API
    console.log("Calling Gemini API with", parts.length, "parts...");
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
          },
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
