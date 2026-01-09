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

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-3-pro-image-preview";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface Brand {
  id: string;
  name: string;
  slogan?: string;
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

// ============================================================================
// IMAGE HANDLING
// ============================================================================

const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
const RASTER_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

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
      console.log(`[V3] Using primary logo (raster): ${brand.logos.primary}`);
      return brand.logos.primary;
    } else {
      console.log(`[V3] Primary logo is SVG, will try other sources: ${brand.logos.primary}`);
    }
  }

  // Try all_logos for raster logos
  if (brand.all_logos?.length) {
    const rasterLogos = brand.all_logos
      .filter(logo => {
        if (!logo.url || !isLikelyRaster(logo.url)) return false;
        // Exclude og-image - these are social preview images, not logos
        if (logo.type === 'og-image') return false;
        return true;
      })
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
      console.log(`[V3] Using logo from all_logos: ${rasterLogos[0].url}`);
      return rasterLogos[0].url;
    }
  }

  // Try icon as fallback
  if (brand.logos?.icon && isLikelyRaster(brand.logos.icon)) {
    console.log(`[V3] Using icon logo: ${brand.logos.icon}`);
    return brand.logos.icon;
  }

  // No valid raster logo found - return null (don't fallback to SVG, Gemini can't render it)
  console.warn(`[V3] No raster logo found for brand. Primary: ${brand.logos?.primary || 'none'} (SVG?), Icon: ${brand.logos?.icon || 'none'}, All logos: ${brand.all_logos?.length || 0}`);
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
        console.warn(`[V3] Skipping unsupported image type in data URI: ${mimeType}`);
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
          console.warn('[V3] Failed to decode URL-encoded data URI');
          return null;
        }
      }
      
      return { data: base64Data, mimeType };
    }
    
    // Regular URL - fetch it
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[V3] Failed to fetch logo from: ${url}`);
      return null;
    }
    
    let contentType = response.headers.get('content-type') || 'image/png';
    contentType = contentType.split(';')[0].trim().toLowerCase();
    
    if (!SUPPORTED_IMAGE_TYPES.includes(contentType)) {
      console.warn(`[V3] Skipping unsupported image type: ${contentType}`);
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
    console.error(`[V3] Failed to fetch image: ${error}`);
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
// ASPECT RATIO VALIDATION
// ============================================================================

type AspectRatioValue = '1:1' | '2:3' | '3:4' | '4:5' | '9:16' | '3:2' | '4:3' | '5:4' | '16:9' | '21:9';

function validateAspectRatio(aspectRatio: string | null | undefined): AspectRatioValue | null {
  if (!aspectRatio) return null;
  const validRatios: AspectRatioValue[] = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
  return validRatios.includes(aspectRatio.trim() as AspectRatioValue) 
    ? (aspectRatio.trim() as AspectRatioValue) 
    : null;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  const logger = createLogger('generate-image-v3');
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
      aspectRatio,
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

      console.log(`[V3] Credit deducted for user ${userId}`);
    }

    console.log(`[V3] Prompt: "${prompt.substring(0, 100)}..."`);

    // ========================================================================
    // BUILD SIMPLE, DIRECT PROMPT FOR GEMINI
    // ========================================================================
    
    const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [];
    
    // Build the core prompt - simple and direct
    let corePrompt = `Create a marketing ad image.

USER REQUEST: ${prompt}

`;

    // Add brand context if available
    if (brand) {
      corePrompt += `BRAND: ${brand.name}`;
      if (brand.slogan) corePrompt += ` - "${brand.slogan}"`;
      corePrompt += '\n';
      
      if (brand.styleguide?.summary) {
        corePrompt += `\nWHAT THEY DO: ${brand.styleguide.summary}\n`;
      }
      
      // Colors - keep it simple
      const colors: string[] = [];
      if (brand.colors.primary) colors.push(`Primary: ${brand.colors.primary}`);
      if (brand.colors.secondary) colors.push(`Secondary: ${brand.colors.secondary}`);
      if (brand.colors.background) colors.push(`Background: ${brand.colors.background}`);
      
      if (colors.length > 0) {
        corePrompt += `\nBRAND COLORS:\n${colors.join('\n')}\n`;
      }
    }

    // Simple, focused instructions
    corePrompt += `
REQUIREMENTS:
1. SCROLL-STOPPING: This is for ads - make it attention-grabbing and bold. It needs to stop people mid-scroll.
2. BE BOLD: Use strong contrast, clear hierarchy, and impactful visuals. Don't be boring or generic.
3. Use the brand colors specified above as the dominant palette.

Generate a high-quality, professional marketing image that would perform well as an ad.`;

    // Fetch logo FIRST - it's critical and should be prioritized
    let logoData: { mimeType: string; data: string } | null = null;
    if (brand) {
      const bestLogoUrl = getBestLogoUrl(brand);
      if (bestLogoUrl) {
        console.log(`[V3] Fetching logo from: ${bestLogoUrl}`);
        logoData = await fetchImageAsBase64(bestLogoUrl);
        if (logoData) {
          console.log(`[V3] Logo fetched successfully: ${logoData.mimeType}, ${Math.round(logoData.data.length / 1024)}KB`);
        } else {
          console.error(`[V3] Failed to fetch logo from: ${bestLogoUrl}`);
        }
      } else {
        console.warn(`[V3] No logo URL found for brand. Primary: ${brand.logos?.primary || 'none'}, Icon: ${brand.logos?.icon || 'none'}, All logos: ${brand.all_logos?.length || 0}`);
      }
    }

    // Add logo IMMEDIATELY at the start - before the prompt
    if (logoData) {
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
          mime_type: logoData.mimeType,
          data: logoData.data,
        },
      });
      console.log(`[V3] Logo attached at position ${parts.length - 1} (early in conversation)`);
    }

    // Add the core prompt
    parts.push({ text: corePrompt });

    // Build generation config
    const validatedAspectRatio = validateAspectRatio(aspectRatio);
    
    const generationConfig: Record<string, unknown> = {
      responseModalities: ["TEXT", "IMAGE"],
    };
    
    if (validatedAspectRatio) {
      generationConfig.image_config = {
        aspect_ratio: validatedAspectRatio,
        image_size: '2K',
      };
    }

    // Final logo reminder at the end
    if (logoData) {
      parts.push({
        text: `⚠️ FINAL REMINDER: The brand logo attached at the beginning of this conversation MUST appear in the generated image. Use the EXACT attached logo - do not create a new one or modify it in any way.`,
      });
    }

    console.log(`[V3] Calling Gemini: ${parts.length} parts, aspect=${validatedAspectRatio || 'auto'}, logo=${!!logoData}`);

    // Call Gemini directly
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
      console.error("[V3] Gemini error:", errorText);
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();

    // Check for issues
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

    console.log(`[V3] Image generated: ${Math.round(imageBase64.length / 1024)}KB`);

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
        prompt_version: 'v3',
        aspect_ratio: validatedAspectRatio,
        simple_prompt: corePrompt,
      };

      await supabase.from('images').update(updateData).eq('id', imageId);
    }

    const duration = performance.now() - startTime;
    logger.info("Image generation (v3) completed", {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    return new Response(
      JSON.stringify({
        success: true,
        version: 'v3',
        image_url: imageUrl,
        image_base64: imageBase64,
        mime_type: "image/png",
        text_response: textResponse,
        prompt_used: corePrompt,
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
    logger.error("Image generation error (v3)", errorObj, {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    // Send to Sentry
    await captureException(errorObj, {
      function_name: 'generate-image-v3',
      request_id: requestId,
    });

    return new Response(
      JSON.stringify({ 
        error: errorObj.message,
        version: 'v3',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

