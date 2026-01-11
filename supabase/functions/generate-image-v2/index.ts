import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";

// ============================================================================
// V2: "THE CREATIVE" - GPT generates the concept, Gemini executes
// ============================================================================
// GPT does the creative heavy lifting: understands the brand, comes up with
// the ad concept, headline, visual direction. Gemini just executes the brief.
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  "Access-Control-Max-Age": "86400",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const GEMINI_MODEL = "gemini-3-pro-image-preview";
const GPT_MODEL = "gpt-5.2-chat-latest";  // GPT-5.2 for creative concept generation

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
  };
  styleguide?: {
    summary?: string;
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

interface CreativeConcept {
  creative_brief: string;  // The full, detailed creative concept
  aspect_ratio: string;
}

interface ProductContext {
  name: string;
  short_description?: string;
  description?: string;
  key_features?: string[];
  value_proposition?: string;
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
  '1:1': { '1K': { width: 1024, height: 1024 }, '2K': { width: 2048, height: 2048 }, '4K': { width: 4096, height: 4096 } },
  '2:3': { '1K': { width: 848, height: 1264 }, '2K': { width: 1696, height: 2528 }, '4K': { width: 3392, height: 5056 } },
  '3:2': { '1K': { width: 1264, height: 848 }, '2K': { width: 2528, height: 1696 }, '4K': { width: 5056, height: 3392 } },
  '3:4': { '1K': { width: 896, height: 1200 }, '2K': { width: 1792, height: 2400 }, '4K': { width: 3584, height: 4800 } },
  '4:3': { '1K': { width: 1200, height: 896 }, '2K': { width: 2400, height: 1792 }, '4K': { width: 4800, height: 3584 } },
  '4:5': { '1K': { width: 928, height: 1152 }, '2K': { width: 1856, height: 2304 }, '4K': { width: 3712, height: 4608 } },
  '5:4': { '1K': { width: 1152, height: 928 }, '2K': { width: 2304, height: 1856 }, '4K': { width: 4608, height: 3712 } },
  '9:16': { '1K': { width: 768, height: 1376 }, '2K': { width: 1536, height: 2752 }, '4K': { width: 3072, height: 5504 } },
  '16:9': { '1K': { width: 1376, height: 768 }, '2K': { width: 2752, height: 1536 }, '4K': { width: 5504, height: 3072 } },
  '21:9': { '1K': { width: 1584, height: 672 }, '2K': { width: 3168, height: 1344 }, '4K': { width: 6336, height: 2688 } },
};

function getResolution(aspectRatio: string, resolutionLevel: ResolutionLevel = '2K'): Resolution | null {
  if (!aspectRatio || aspectRatio === 'auto') return null;
  const ratioMap = RESOLUTION_MAP[aspectRatio as AspectRatioValue];
  return ratioMap ? ratioMap[resolutionLevel] : null;
}

// ============================================================================
// IMAGE HANDLING
// ============================================================================

const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
const RASTER_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

function getBestLogoUrl(brand: Brand): string | null {
  const isLikelyRaster = (url: string): boolean => {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();

    if (lowerUrl.startsWith('data:image/svg+xml')) return false;
    if (lowerUrl.includes('.svg')) return false;
    if (RASTER_EXTENSIONS.some(ext => lowerUrl.includes(ext))) return true;
    if (lowerUrl.includes('brand-logos') && (lowerUrl.includes('primary') || lowerUrl.includes('converted'))) {
      return true;
    }
    if (lowerUrl.startsWith('data:image/')) {
      const mimeType = lowerUrl.split(';')[0].split(':')[1];
      if (mimeType && ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'].includes(mimeType)) {
        return true;
      }
      return false;
    }
    return true;
  };

  if (brand.logos?.primary && isLikelyRaster(brand.logos.primary)) {
    console.log(`[V2] Using primary logo: ${brand.logos.primary.substring(0, 50)}...`);
    return brand.logos.primary;
  }

  if (brand.all_logos?.length) {
    const rasterLogos = brand.all_logos
      .filter(logo => {
        if (!logo.url || !isLikelyRaster(logo.url)) return false;
        if (logo.type === 'og-image') return false;
        return true;
      })
      .sort((a, b) => {
        // First priority: type (logo > favicon > other)
        const getTypePriority = (type?: string): number => {
          if (type === 'logo') return 0;
          if (type === 'favicon' || type === 'icon') return 2;
          return 1; // Other types (like wordmark) in the middle
        };
        const typeDiff = getTypePriority(a.type) - getTypePriority(b.type);
        if (typeDiff !== 0) return typeDiff;

        // Second priority: format (PNG > JPG > WEBP > other)
        const getFormatPriority = (url: string): number => {
          const lower = url.toLowerCase();
          if (lower.includes('.png') || lower.includes('converted')) return 0;
          if (lower.includes('.jpg') || lower.includes('.jpeg')) return 1;
          if (lower.includes('.webp')) return 2;
          return 3;
        };
        return getFormatPriority(a.url) - getFormatPriority(b.url);
      });
    if (rasterLogos.length > 0) {
      console.log(`[V2] Using logo from all_logos: ${rasterLogos[0].url.substring(0, 50)}...`);
      return rasterLogos[0].url;
    }
  }

  if (brand.logos?.icon && isLikelyRaster(brand.logos.icon)) {
    console.log(`[V2] Using icon logo: ${brand.logos.icon.substring(0, 50)}...`);
    return brand.logos.icon;
  }

  console.warn(`[V2] No raster logo found for brand`);
  return null;
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    if (url.startsWith('data:')) {
      const [header, data] = url.split(',');
      const mimeMatch = header.match(/data:([^;]+)/);
      const mimeType = mimeMatch ? mimeMatch[1].toLowerCase().trim() : 'image/png';

      if (!SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
        console.warn(`[V2] Skipping unsupported image type: ${mimeType}`);
        return null;
      }

      let base64Data = data;
      if (data.startsWith('%')) {
        try {
          base64Data = decodeURIComponent(data);
        } catch {
          console.warn('[V2] Failed to decode URL-encoded data URI');
          return null;
        }
      }

      return { data: base64Data, mimeType };
    }

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[V2] Failed to fetch image from: ${url}`);
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

    return { data: btoa(binary), mimeType: contentType };
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
      .upload(fileName, bytes, { contentType: 'image/png', upsert: true });

    if (error) {
      console.error('Storage upload error:', error);
      return null;
    }

    const { data: urlData } = supabase.storage.from('brand-images').getPublicUrl(fileName);
    return urlData.publicUrl;
  } catch (error) {
    console.error('Upload failed:', error);
    return null;
  }
}

// ============================================================================
// GPT CREATIVE CONCEPT GENERATION
// ============================================================================

async function generateCreativeConcept(
  userPrompt: string,
  brand: Brand | null,
  product: ProductContext | null
): Promise<CreativeConcept> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }

  const systemPrompt = `You are an award-winning creative director at a top advertising agency. Your job is to generate detailed, executable ad concepts.

Given a brand and a brief request, you create a COMPLETE creative concept that a designer could execute without any additional questions.

Your creative brief must include ALL of these elements:
1. FORMAT: Aspect ratio and platform (e.g., "Square 1:1 Instagram static ad")
2. VISUAL CONCEPT: Specific visual elements, objects, imagery, graphics - be concrete, not abstract
3. LAYOUT: How elements are arranged (centered, diagonal, split panels, grid, etc.)
4. BACKGROUND: What's behind the main elements (gradient, solid color, texture, scene)
5. HEADLINE: The main text - punchy, memorable, on-brand
6. SUBHEADLINE: Supporting copy that adds context
7. CTA: Call-to-action button text
8. FOOTER/MICROTEXT: Legal text, tagline, or secondary info (optional)
9. COLOR USAGE: How the brand colors should be applied (which elements get primary vs secondary color)
10. MOOD/STYLE: The overall feeling (calm, bold, playful, premium, etc.)

NOTE: Do NOT include logo placement instructions - the logo will be handled separately.

EXAMPLE of a good creative brief:
"Square 1:1 Instagram static ad. Calm, friendly design. Four calendar cards in a row (or stacked diagonally) labeled Week 1, Week 2, Week 3, Week 4 with checkmarks appearing progressively left to right. Soft gradient background using brand primary color (#39FF9C) for the checkmarks and CTA button, dark secondary (#003D2B) for text. Headline: "Pay over time." Subhead: "4 interest-free payments." CTA button: "Shop Now" Footer microtext: "Keep your cash moving." Accent color highlights the checkmarks and CTA."

Output valid JSON:
{
  "creative_brief": "Your complete, detailed creative concept as a single paragraph. Include all 11 elements above. Be specific about visual elements - describe actual objects, graphics, and compositions, not vague concepts.",
  "aspect_ratio": "1:1 | 9:16 | 16:9 | 4:5 | 3:4 | 2:3"
}

Rules:
- Be SPECIFIC: "Four calendar cards with checkmarks" not "visual elements showing time"
- Be VISUAL: Describe what the viewer literally sees
- Be COMPLETE: Include every element needed to execute the design
- Be CREATIVE: Surprise me. No generic stock-photo-style concepts.
- Match the brand's industry and personality`;

  let userMessage = '';

  // BRAND IDENTITY FIRST - GPT must understand what this brand does before getting creative
  if (brand) {
    userMessage += `================================================================================
BRAND IDENTITY (YOUR AD MUST BE RELEVANT TO THIS)
================================================================================
Brand: ${brand.name}
`;
    if (brand.styleguide?.summary) {
      userMessage += `WHAT THEY DO: ${brand.styleguide.summary}

⚠️ CRITICAL: Your ad concept MUST be about THIS business. Do NOT create generic concepts or wordplay that ignores what this brand actually does.
`;
    }
    if (brand.slogan) userMessage += `Slogan: "${brand.slogan}"\n`;

    const colors: string[] = [];
    if (brand.colors.primary) colors.push(`Primary: ${brand.colors.primary}`);
    if (brand.colors.secondary) colors.push(`Secondary: ${brand.colors.secondary}`);
    if (brand.colors.background) colors.push(`Background: ${brand.colors.background}`);
    if (colors.length > 0) {
      userMessage += `\nBrand Colors:\n${colors.join('\n')}\n`;
    }
  }

  // Add product context if this ad is for a specific product
  if (product) {
    userMessage += `\n================================================================================
PRODUCT TO FEATURE
================================================================================
This ad is for selling a specific product. The ad concept MUST showcase this product:

PRODUCT NAME: ${product.name}
${product.short_description ? `DESCRIPTION: ${product.short_description}` : product.description ? `DESCRIPTION: ${product.description.slice(0, 300)}` : ''}
${product.key_features && product.key_features.length > 0 ? `KEY FEATURES:\n${product.key_features.map(f => `- ${f}`).join('\n')}` : ''}
${product.value_proposition ? `VALUE PROPOSITION: ${product.value_proposition}` : ''}
`;
  }

  // User request comes AFTER brand identity
  userMessage += `\n================================================================================
USER REQUEST
================================================================================
${userPrompt}

Generate a creative ad concept that is SPECIFICALLY RELEVANT to this brand's business. Reference the brand colors by their hex values. Output only valid JSON.`;

  console.log(`[V2-GPT] Generating creative concept...`);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GPT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      max_completion_tokens: 2000,
      response_format: { type: "json_object" }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[V2-GPT] Error:", errorText);
    throw new Error(`GPT API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log("[V2-GPT] Response:", JSON.stringify(data).substring(0, 500));
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(`No content in GPT response: ${JSON.stringify(data).substring(0, 300)}`);
  }

  const concept = JSON.parse(content) as CreativeConcept;
  console.log(`[V2-GPT] Concept generated:`, JSON.stringify(concept).substring(0, 200));

  return concept;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  const logger = createLogger('generate-image-v2');
  const requestId = logger.generateRequestId();
  const startTime = performance.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
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
      aspectRatio: userAspectRatio,
      skipCredits = false,
      assets = [],           // High-fidelity assets to include
      references = [],       // Style references
      productId,             // Optional: Product to feature
      includeLogoReference = true,
      sessionId,             // Optional: session ID from start-variations-session
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

      if (imageData) userId = imageData.user_id;
    }

    // Fetch product data if productId is provided
    let product: {
      id: string;
      name: string;
      short_description?: string;
      description?: string;
      images?: Array<{ url: string; is_primary?: boolean }>;
      key_features?: string[];
      value_proposition?: string;
    } | null = null;

    if (productId && brandId) {
      const { data: productData, error: productError } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .eq("brand_id", brandId)
        .single();

      if (productError) {
        console.warn("[V2] Product fetch warning:", productError);
      } else if (productData) {
        product = productData;
        console.log(`[V2] Product loaded: ${product.name}`);
      }
    }

    // Credit handling: Either validate session or deduct credits
    if (userId && !skipCredits) {
      if (sessionId) {
        // Session-based generation: Validate session instead of deducting credits
        const { data: session, error: sessionError } = await supabase
          .from("generation_sessions")
          .select("*")
          .eq("id", sessionId)
          .eq("user_id", userId)
          .single();

        if (sessionError || !session) {
          console.warn("[V2] Invalid session:", { sessionId, userId, error: sessionError });
          return new Response(
            JSON.stringify({ error: "Invalid or expired session" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (new Date(session.expires_at) < new Date()) {
          return new Response(
            JSON.stringify({ error: "Session has expired" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (session.generations_used >= session.max_generations) {
          return new Response(
            JSON.stringify({ error: "Session has reached maximum generations" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Increment generations_used atomically
        await supabase
          .from("generation_sessions")
          .update({ generations_used: session.generations_used + 1 })
          .eq("id", sessionId)
          .eq("generations_used", session.generations_used);

        console.log(`[V2] Session ${sessionId} used: ${session.generations_used + 1}/${session.max_generations}`);
      } else {
        // Standard credit deduction
        const { data: creditsData, error: creditsError } = await supabase
          .from("user_credits")
          .select("credits")
          .eq("user_id", userId)
          .single();

        const currentCredits = creditsData?.credits ?? 0;

        if (creditsError || currentCredits < 1) {
          return new Response(
            JSON.stringify({ error: "Insufficient credits.", credits: currentCredits }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { error: deductError } = await supabase
          .from("user_credits")
          .update({ credits: currentCredits - 1, updated_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("credits", currentCredits);

        if (deductError) {
          return new Response(
            JSON.stringify({ error: "Failed to process credits.", credits: currentCredits }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[V2] Credit deducted for user ${userId}`);
      }
    }

    console.log(`[V2] User prompt: "${prompt.substring(0, 100)}...", assets: ${assets.length}, refs: ${references.length}`);

    // ========================================================================
    // STEP 1: GPT generates the creative concept
    // ========================================================================

    const concept = await generateCreativeConcept(prompt, brand, product);

    // Use user-specified aspect ratio if provided, otherwise use GPT's suggestion
    const finalAspectRatio = userAspectRatio || concept.aspect_ratio || '1:1';

    // ========================================================================
    // STEP 2: Build simple prompt for Gemini
    // ========================================================================

    const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [];

    // Fetch logo
    let logoData: { mimeType: string; data: string } | null = null;
    if (brand && includeLogoReference) {
      const bestLogoUrl = getBestLogoUrl(brand);
      if (bestLogoUrl) {
        logoData = await fetchImageAsBase64(bestLogoUrl);
        if (logoData) {
          console.log(`[V2] Logo fetched: ${logoData.mimeType}, ${Math.round(logoData.data.length / 1024)}KB`);
        }
      }
    }

    // Add logo first if available
    if (logoData && brand) {
      parts.push({
        text: `🚨 BRAND LOGO (REQUIRED) 🚨
The following image is the EXACT brand logo. You MUST:
1. Include this EXACT logo in the generated image
2. COPY it pixel-perfect - do NOT recreate or redesign it
3. PRESERVE its original colors exactly
4. Place it in a corner (bottom-right or top-right preferred)`,
      });
      parts.push({
        inline_data: {
          mime_type: logoData.mimeType,
          data: logoData.data,
        },
      });
    }

    // Auto-inject product images as high-fidelity assets
    const productAssets: AssetInput[] = [];
    if (product?.images && product.images.length > 0) {
      const productImagesToInclude = product.images.slice(0, 3);
      for (let i = 0; i < productImagesToInclude.length; i++) {
        const img = productImagesToInclude[i];
        productAssets.push({
          id: `product-image-${i}`,
          url: img.url,
          name: i === 0 ? `${product.name} (Primary)` : `${product.name} (Image ${i + 1})`,
          category: 'product',
          role: 'must_include',
        });
      }
      console.log(`[V2] Auto-injected ${productAssets.length} product image(s)`);
    }

    // Combine user assets with product assets
    const allAssets = [...productAssets, ...(assets as AssetInput[])];

    // Add high-fidelity assets (must appear in output)
    const attachedAssetNames: string[] = [];
    for (const asset of allAssets) {
      const assetData = await fetchImageAsBase64(asset.url);
      if (assetData) {
        attachedAssetNames.push(asset.name);
        parts.push({
          text: `HIGH-FIDELITY ASSET TO INCLUDE - "${asset.name}" (${asset.category || 'general'}):\n\nThis is a REQUIRED element that MUST appear accurately in the final generated image. Include this prominently in the design with high fidelity and accuracy. This is not optional - the attached image below must be reproduced in the output.`,
        });
        parts.push({
          inline_data: {
            mime_type: assetData.mimeType,
            data: assetData.data,
          },
        });
      }
    }

    // Add user-selected references (style references)
    for (const ref of (references as AssetInput[])) {
      const refData = await fetchImageAsBase64(ref.url);
      if (refData) {
        const styleDesc = ref.style_description ? ` Style: ${ref.style_description}.` : '';
        parts.push({
          text: `REFERENCE AD DESIGN - "${ref.name}".${styleDesc} This is a reference ad design. Create something similar to the concept of this ad in a way that fits the brand. Adapt the concept and style, but do not copy text or logos.`,
        });
        parts.push({
          inline_data: {
            mime_type: refData.mimeType,
            data: refData.data,
          },
        });
      }
    }

    // Add explicit instruction for attached assets
    if (attachedAssetNames.length > 0) {
      parts.push({
        text: `\n\nCRITICAL REQUIREMENT: The ${attachedAssetNames.length} asset(s) attached above (${attachedAssetNames.join(', ')}) MUST be included in the final design. These are high-fidelity assets that must appear accurately in the output.`,
      });
    }

    // Build the Gemini prompt from GPT's full creative brief
    let geminiPrompt = `Create this ad image:\n\n`;
    geminiPrompt += `${concept.creative_brief}\n\n`;

    // Add brand colors with STRICT enforcement
    if (brand) {
      const colors: string[] = [];
      if (brand.colors.primary) colors.push(`Primary: ${brand.colors.primary}`);
      if (brand.colors.secondary) colors.push(`Secondary: ${brand.colors.secondary}`);
      if (brand.colors.background) colors.push(`Background: ${brand.colors.background}`);

      if (colors.length > 0) {
        geminiPrompt += `⚠️ MANDATORY BRAND COLORS - USE ONLY THESE:\n${colors.join('\n')}\n`;
        geminiPrompt += `You MUST use these exact hex colors. Do NOT use pastel, muted, or other colors.\n\n`;
      }
    }

    // Handle no-logo case explicitly
    if (!logoData) {
      geminiPrompt += `NOTE: Do NOT include any logo or brand text in the image. No logo is available.\n\n`;
    }

    geminiPrompt += `Generate a high-quality, professional ad image exactly as described above.`;

    parts.push({ text: geminiPrompt });

    // Logo reminder at the end
    if (logoData) {
      parts.push({
        text: `⚠️ FINAL REMINDER: Include the EXACT brand logo from above. Do NOT create a new logo.`,
      });
    }

    // Build generation config
    const generationConfig: Record<string, unknown> = {
      responseModalities: ["TEXT", "IMAGE"],
    };

    const validRatios = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
    if (validRatios.includes(finalAspectRatio)) {
      generationConfig.image_config = {
        aspect_ratio: finalAspectRatio,
        image_size: '2K',
      };
    }

    console.log(`[V2] Calling Gemini: ${parts.length} parts, aspect=${finalAspectRatio}, logo=${!!logoData}`);

    // ========================================================================
    // STEP 3: Gemini generates the image
    // ========================================================================

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
      const resolutionDims = getResolution(finalAspectRatio, '2K');
      updateData.metadata = {
        ...existingMetadata,
        prompt_version: 'v2-creative',
        aspect_ratio: finalAspectRatio,
        resolution: '2K',
        dimensions: resolutionDims,
        mime_type: 'image/png',
        gpt_concept: concept,
        gemini_prompt: geminiPrompt,
        // Debug info for troubleshooting
        debug: {
          brand_logos: brand?.logos || null,
          brand_all_logos_count: brand?.all_logos?.length || 0,
          logo_url_used: logoData ? getBestLogoUrl(brand!) : null,
          logo_fetched: !!logoData,
          logo_size_kb: logoData ? Math.round(logoData.data.length / 1024) : null,
          logo_mime: logoData?.mimeType || null,
          assets_count: allAssets.length,
          assets_attached: attachedAssetNames,
          references_count: (references as AssetInput[]).length,
          product_id: productId || null,
          product_name: product?.name || null,
          product_images_count: product?.images?.length || 0,
          include_logo_reference: includeLogoReference,
        },
      };

      await supabase.from('images').update(updateData).eq('id', imageId);
    }

    const duration = performance.now() - startTime;
    logger.info("Image generation (v2-creative) completed", {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    // Calculate dimensions for response
    const responseDims = getResolution(finalAspectRatio, '2K');

    // Build debug info for response
    const debugInfo = {
      brand_logos: brand?.logos || null,
      brand_all_logos_count: brand?.all_logos?.length || 0,
      logo_url_used: logoData ? getBestLogoUrl(brand!) : null,
      logo_fetched: !!logoData,
      logo_size_kb: logoData ? Math.round(logoData.data.length / 1024) : null,
      assets_count: allAssets.length,
      assets_attached: attachedAssetNames,
      references_count: (references as AssetInput[]).length,
      product_name: product?.name || null,
    };

    return new Response(
      JSON.stringify({
        success: true,
        version: 'v2-creative',
        image_url: imageUrl,
        image_base64: imageBase64,
        mime_type: "image/png",
        aspect_ratio: finalAspectRatio,
        resolution: '2K',
        dimensions: responseDims,
        text_response: textResponse,
        gpt_concept: concept,
        gemini_prompt: geminiPrompt,
        debug: debugInfo,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const duration = performance.now() - startTime;
    const errorObj = error instanceof Error ? error : new Error(String(error));

    logger.error("Image generation error (v2-creative)", errorObj, {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    await captureException(errorObj, {
      function_name: 'generate-image-v2',
      request_id: requestId,
    });

    return new Response(
      JSON.stringify({
        error: errorObj.message,
        version: 'v2-creative',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
