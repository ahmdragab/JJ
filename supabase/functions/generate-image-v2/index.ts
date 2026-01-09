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
const GPT_MODEL = "gpt-4o";  // Reliable, widely available

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
  colors: {
    primary?: string;
    secondary?: string;
    background?: string;
  };
  styleguide?: {
    summary?: string;
  };
}

interface CreativeConcept {
  creative_brief: string;  // The full, detailed creative concept
  aspect_ratio: string;
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
        const getPriority = (url: string): number => {
          const lower = url.toLowerCase();
          if (lower.includes('.png') || lower.includes('converted')) return 0;
          if (lower.includes('.jpg') || lower.includes('.jpeg')) return 1;
          if (lower.includes('.webp')) return 2;
          return 3;
        };
        return getPriority(a.url) - getPriority(b.url);
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
  brand: Brand | null
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

  let userMessage = `Request: ${userPrompt}\n\n`;

  if (brand) {
    userMessage += `Brand: ${brand.name}\n`;
    if (brand.slogan) userMessage += `Slogan: "${brand.slogan}"\n`;
    if (brand.domain) userMessage += `Website: ${brand.domain}\n`;
    if (brand.styleguide?.summary) userMessage += `What they do: ${brand.styleguide.summary}\n`;

    // Include brand colors so GPT can reference them in the concept
    const colors: string[] = [];
    if (brand.colors.primary) colors.push(`Primary: ${brand.colors.primary}`);
    if (brand.colors.secondary) colors.push(`Secondary: ${brand.colors.secondary}`);
    if (brand.colors.background) colors.push(`Background: ${brand.colors.background}`);
    if (colors.length > 0) {
      userMessage += `\nBrand Colors (USE THESE in your concept):\n${colors.join('\n')}\n`;
    }
  }

  userMessage += `\nGenerate a creative ad concept. Reference the brand colors by their hex values in your COLOR USAGE section. Output only valid JSON.`;

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
      temperature: 0.8,
      max_tokens: 1000,
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

    // Credit deduction
    if (userId && !skipCredits) {
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

    console.log(`[V2] User prompt: "${prompt.substring(0, 100)}..."`);

    // ========================================================================
    // STEP 1: GPT generates the creative concept
    // ========================================================================

    const concept = await generateCreativeConcept(prompt, brand);

    // Use user-specified aspect ratio if provided, otherwise use GPT's suggestion
    const finalAspectRatio = userAspectRatio || concept.aspect_ratio || '1:1';

    // ========================================================================
    // STEP 2: Build simple prompt for Gemini
    // ========================================================================

    const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [];

    // Fetch logo
    let logoData: { mimeType: string; data: string } | null = null;
    if (brand) {
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
      updateData.metadata = {
        ...existingMetadata,
        prompt_version: 'v2-creative',
        aspect_ratio: finalAspectRatio,
        gpt_concept: concept,
        gemini_prompt: geminiPrompt,
      };

      await supabase.from('images').update(updateData).eq('id', imageId);
    }

    const duration = performance.now() - startTime;
    logger.info("Image generation (v2-creative) completed", {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    return new Response(
      JSON.stringify({
        success: true,
        version: 'v2-creative',
        image_url: imageUrl,
        image_base64: imageBase64,
        mime_type: "image/png",
        text_response: textResponse,
        gpt_concept: concept,
        gemini_prompt: geminiPrompt,
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
