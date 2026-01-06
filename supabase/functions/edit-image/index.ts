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

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  image_url?: string;
  timestamp: string;
}

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

function getResolution(aspectRatio: AspectRatioValue, resolutionLevel: ResolutionLevel = '2K'): Resolution | null {
  const ratioMap = RESOLUTION_MAP[aspectRatio];
  if (!ratioMap) {
    return null;
  }
  return ratioMap[resolutionLevel];
}

function validateAspectRatio(aspectRatio: string | null | undefined): AspectRatioValue | null {
  if (!aspectRatio) return null;
  
  const normalized = aspectRatio.trim();
  const validRatios: AspectRatioValue[] = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
  
  if (validRatios.includes(normalized as AspectRatioValue)) {
    return normalized as AspectRatioValue;
  }
  
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

async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string; width?: number; height?: number } | null> {
  try {
    console.log(`[fetchImageAsBase64] Fetching image from: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[fetchImageAsBase64] HTTP error: ${response.status} ${response.statusText} for URL: ${url}`);
      return null;
    }
    
    let contentType = response.headers.get('content-type') || 'image/png';
    contentType = contentType.split(';')[0].trim().toLowerCase();
    
    if (!SUPPORTED_IMAGE_TYPES.includes(contentType)) {
      console.warn(`[fetchImageAsBase64] Unsupported image type: ${contentType} for URL: ${url}`);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      console.error(`[fetchImageAsBase64] Empty response body for URL: ${url}`);
      return null;
    }
    
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Try to extract dimensions from PNG/JPEG headers
    let width: number | undefined;
    let height: number | undefined;
    
    if (contentType === 'image/png' && uint8Array.length >= 24) {
      width = (uint8Array[16] << 24) | (uint8Array[17] << 16) | (uint8Array[18] << 8) | uint8Array[19];
      height = (uint8Array[20] << 24) | (uint8Array[21] << 16) | (uint8Array[22] << 8) | uint8Array[23];
    } else if ((contentType === 'image/jpeg' || contentType === 'image/jpg') && uint8Array.length >= 20) {
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
    
    if (!base64 || base64.length === 0) {
      console.error(`[fetchImageAsBase64] Failed to encode image to base64 for URL: ${url}`);
      return null;
    }
    
    console.log(`[fetchImageAsBase64] Successfully fetched and encoded image: ${contentType}, ${Math.round(base64.length / 1024)}KB base64`);
    return { data: base64, mimeType: contentType, width, height };
  } catch (error) {
    console.error(`[fetchImageAsBase64] Exception fetching image from ${url}:`, error);
    return null;
  }
}

function detectAspectRatioFromDimensions(width: number, height: number): AspectRatioValue | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  
  const ratio = width / height;
  
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
  const logger = createLogger('edit-image');
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
      previousImageUrl,
      includeLogoReference = true,
      assets = [],
      references = [],
    } = requestBody;

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "Missing prompt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!imageId) {
      return new Response(
        JSON.stringify({ error: "Missing imageId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!previousImageUrl) {
      return new Response(
        JSON.stringify({ error: "Missing previousImageUrl" }),
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

    // Get user_id from the image record (more reliable)
    const { data: imageData } = await supabase
      .from("images")
      .select("user_id")
      .eq("id", imageId)
      .single();
    
    if (imageData) {
      userId = imageData.user_id;
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Could not determine user_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Credit deduction logic: First edit is free, subsequent edits cost 1 credit
    const { data: currentImageData } = await supabase
      .from("images")
      .select("edit_count")
      .eq("id", imageId)
      .single();
    
    const currentEditCount = currentImageData?.edit_count ?? 0;
    const shouldDeductCredit = currentEditCount >= 1; // Only deduct if this is NOT the first edit
    
    if (shouldDeductCredit) {
      console.log(`Edit #${currentEditCount + 1} - will deduct credit (first edit was free)`);
      
      // Check current credits
      const { data: creditsData, error: creditsError } = await supabase
        .from("user_credits")
        .select("credits")
        .eq("user_id", userId)
        .single();

      const currentCredits = creditsData?.credits ?? 0;
      
      if (creditsError || currentCredits < 1) {
        console.log("Credit check failed:", { creditsError, currentCredits, userId });
        return new Response(
          JSON.stringify({ 
            error: "Insufficient credits. Please purchase more credits to edit images.",
            credits: currentCredits
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Deduct credit
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

      // Log the transaction (non-blocking)
      try {
        await supabase
          .from("credit_transactions")
          .insert({
            user_id: userId,
            type: 'deducted',
            amount: -1,
            balance_after: currentCredits - 1,
            source: 'usage',
            description: 'Credit used for image edit'
          });
      } catch (txError) {
        console.warn("Failed to log credit transaction:", txError);
      }

      console.log(`Credit deducted for user ${userId}: ${currentCredits} -> ${currentCredits - 1}`);
    } else {
      console.log(`First edit - free (no credit deduction)`);
    }

    // Validate Gemini 3 Pro Image limits
    const MAX_HIGH_FIDELITY = 6;
    const MAX_TOTAL_IMAGES = 14;

    const autoIncludedCount = [
      brand && includeLogoReference && brand.logos?.primary ? 1 : 0,
      brand?.backdrops?.length ? 1 : 0,
      brand?.screenshot ? 1 : 0,
    ].reduce((a, b) => a + b, 0);

    const totalImages = (assets as AssetInput[]).length + (references as AssetInput[]).length + autoIncludedCount + 1; // +1 for previous image

    if ((assets as AssetInput[]).length > MAX_HIGH_FIDELITY) {
      return new Response(
        JSON.stringify({ error: `Too many assets. Maximum ${MAX_HIGH_FIDELITY} high-fidelity images allowed.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (totalImages > MAX_TOTAL_IMAGES) {
      return new Response(
        JSON.stringify({ 
          error: `Too many images. Maximum ${MAX_TOTAL_IMAGES} total images allowed (including ${autoIncludedCount} auto-included + 1 previous image). You have ${totalImages} total.` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[EDIT] Prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}" | Assets: ${assets.length} | References: ${references.length}`);

    // Get original aspect ratio from image metadata or detect from image
    let originalAspectRatio: string | null = null;
    
    const { data: imageMetadata } = await supabase
      .from('images')
      .select('metadata')
      .eq('id', imageId)
      .single();
    
    if (imageMetadata?.metadata && typeof imageMetadata.metadata === 'object') {
      const metadata = imageMetadata.metadata as Record<string, unknown>;
      if (metadata.aspect_ratio && typeof metadata.aspect_ratio === 'string') {
        originalAspectRatio = metadata.aspect_ratio;
      }
    }
    
    // If not found in metadata, try to detect from image dimensions
    if (!originalAspectRatio) {
      const previousImageData = await fetchImageAsBase64(previousImageUrl);
      if (previousImageData?.width && previousImageData?.height) {
        const detectedRatio = detectAspectRatioFromDimensions(
          previousImageData.width,
          previousImageData.height
        );
        if (detectedRatio) {
          originalAspectRatio = detectedRatio;
        }
      }
    }

    // Build the request parts for Gemini
    const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [];
    const attachedAssetNames: string[] = [];
    
    // Include the previous image - REQUIRED for editing
    console.log(`[Edit] Fetching previous image from: ${previousImageUrl}`);
    const previousImageData = await fetchImageAsBase64(previousImageUrl);
    if (!previousImageData) {
      console.error(`[Edit] Failed to fetch previous image from: ${previousImageUrl}`);
      return new Response(
        JSON.stringify({ 
          error: `Failed to fetch the previous image. The image URL may be invalid or inaccessible. URL: ${previousImageUrl}` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const imageSizeKB = Math.round(previousImageData.data.length / 1024);
    console.log(`[Edit] Previous image fetched: ${previousImageData.mimeType}, ${imageSizeKB}KB`);
    
    // Validate image data size (Gemini has limits, typically ~20MB per image)
    const MAX_IMAGE_SIZE_MB = 20;
    const imageSizeMB = previousImageData.data.length / (1024 * 1024);
    if (imageSizeMB > MAX_IMAGE_SIZE_MB) {
      console.error(`[Edit] Image too large: ${imageSizeMB.toFixed(2)}MB (max ${MAX_IMAGE_SIZE_MB}MB)`);
      return new Response(
        JSON.stringify({ 
          error: `Image is too large (${imageSizeMB.toFixed(2)}MB). Maximum size is ${MAX_IMAGE_SIZE_MB}MB.` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Validate base64 data is not empty
    if (!previousImageData.data || previousImageData.data.length === 0) {
      console.error(`[Edit] Image data is empty`);
      return new Response(
        JSON.stringify({ 
          error: `Invalid image data: image appears to be empty or corrupted.` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
      parts.push({
        text: "Here is the current image. Please modify it according to the user's request:",
      });
      parts.push({
        inline_data: {
          mime_type: previousImageData.mimeType,
          data: previousImageData.data,
        },
      });

    // Add aspect ratio preservation instruction
    const aspectRatioInstruction = originalAspectRatio
      ? `\n\nCRITICAL: Maintain the exact same aspect ratio (${originalAspectRatio}) as the original image. The output must have the same dimensions and proportions.`
      : '';

    // Add logo reference with STRONG text preservation instructions
    if (brand && includeLogoReference) {
      const bestLogoUrl = getBestLogoUrl(brand);
      if (bestLogoUrl) {
        const logoData = await fetchImageAsBase64(bestLogoUrl);
        if (logoData) {
          parts.push({
            text: "BRAND LOGO - REQUIRED: This is the brand's logo reference image. You MUST include this logo in the final edited design. CRITICAL PRESERVATION RULES:\n- Use the logo EXACTLY as shown in the attached logo reference image\n- Do NOT change any text, characters, or words in the logo - preserve them exactly as they appear in the reference\n- Do NOT change colors, proportions, shapes, or typography\n- If the logo contains text (like brand name, slogan, or any words), that text MUST remain identical to the reference image\n- Place the logo prominently, typically in a corner position (top-left or top-right)\n- The logo is essential and cannot be omitted or modified",
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
        attachedAssetNames.push(asset.name);
        parts.push({
          text: `HIGH-FIDELITY ASSET TO INCLUDE - "${asset.name}" (${asset.category || 'general'}):\n\nThis is a REQUIRED element that MUST appear accurately in the final edited image. Include this prominently in the design with high fidelity and accuracy. This is not optional - the attached image below must be reproduced in the output.`,
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

    // Add homepage screenshot as style reference
    if (brand?.screenshot) {
      const screenshotData = await fetchImageAsBase64(brand.screenshot);
      if (screenshotData) {
        parts.push({
          text: "HOMEPAGE SCREENSHOT - This is the brand's actual homepage. Use this as a primary style reference to understand the brand's visual design language, layout patterns, color usage, typography, and overall aesthetic. Use this for style inspiration and to maintain consistency with the brand's actual website design.",
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

    // Add explicit instruction about attached assets
    let assetInstruction = '';
    if (attachedAssetNames.length > 0) {
      assetInstruction = `\n\nCRITICAL: The ${attachedAssetNames.length} image${attachedAssetNames.length > 1 ? 's' : ''} attached above (${attachedAssetNames.join(', ')}) ${attachedAssetNames.length > 1 ? 'are' : 'is'} REQUIRED and MUST be included in the edited design. These are high-fidelity assets that must appear accurately in the output.`;
    }

    // Add the edit request
    parts.push({
      text: `USER'S EDIT REQUEST: ${prompt}\n\nPlease make these changes while maintaining the overall style and brand consistency.${aspectRatioInstruction}${assetInstruction}`,
    });

    // Resolution is always fixed at 2K
    const finalResolution: ResolutionLevel = '2K';
    
    // Always use the original aspect ratio if we have it
    const validatedAspectRatio = validateAspectRatio(originalAspectRatio);
    
    // Get resolution dimensions for logging
    const resolutionDims = validatedAspectRatio 
      ? getResolution(validatedAspectRatio, finalResolution)
      : null;
    
    // Build generation config
    const generationConfig: Record<string, unknown> = {
      responseModalities: ["TEXT", "IMAGE"],
    };
    
    if (validatedAspectRatio) {
      generationConfig.image_config = {
        aspect_ratio: validatedAspectRatio,
        image_size: finalResolution,
      };
    }
    
    const resolutionInfo = resolutionDims 
      ? `${resolutionDims.width}x${resolutionDims.height} @ ${finalResolution}`
      : `model-determined @ ${finalResolution}`;
    const aspectInfo = validatedAspectRatio 
      ? `aspect_ratio=${validatedAspectRatio}` 
      : 'aspect_ratio=auto';
    console.log(`[Config] ${aspectInfo} | ${resolutionInfo} | preserving original aspect ratio`);

    // Call Gemini API
    const partsSummary = parts.map((part, index) => {
      if ('text' in part) {
        const textPreview = part.text.length > 80 ? part.text.substring(0, 80) + '...' : part.text;
        return `[${index}] text: "${textPreview}"`;
      } else if ('inline_data' in part) {
        return `[${index}] image: ${part.inline_data.mime_type} (${Math.round(part.inline_data.data.length / 1024)}KB)`;
      }
      return `[${index}] unknown`;
    }).join(' | ');
    
    console.log(`[Gemini API] Calling with ${parts.length} parts: ${partsSummary}`);
    
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
    if (!geminiData.candidates || geminiData.candidates.length === 0) {
      const errorMessage = geminiData.error?.message || 'No candidates returned from Gemini API';
      console.error("Gemini API error - no candidates:", JSON.stringify(geminiData, null, 2));
      throw new Error(`Gemini API error: ${errorMessage}`);
    }

    if (geminiData.candidates[0]?.finishReason) {
      const finishReason = geminiData.candidates[0].finishReason;
      if (finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
        const errorDetails = {
          finishReason,
          safetyRatings: geminiData.candidates[0]?.safetyRatings,
          promptFeedback: geminiData.promptFeedback,
          error: geminiData.error,
        };
        console.error("Gemini finish reason:", JSON.stringify(errorDetails, null, 2));
        
        // Provide more helpful error messages based on finish reason
        let errorMessage = `Gemini API finished with reason: ${finishReason}`;
        if (finishReason === 'OTHER') {
          errorMessage = `Gemini API encountered an error processing the request. This may be due to invalid image data, unsupported format, or request size limits. Please try again or use a different image.`;
        } else if (finishReason === 'SAFETY') {
          errorMessage = `Content was blocked by safety filters. Please modify your request.`;
        } else if (finishReason === 'RECITATION') {
          errorMessage = `Content was blocked due to recitation policy. Please modify your request.`;
        }
        
        throw new Error(errorMessage);
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

    // Upload to storage
    let imageUrl: string | null = null;
    if (imageId && brandId) {
      imageUrl = await uploadToStorage(supabase, imageBase64, brandId, imageId);
    }

    // Update the images table
    const assistantMessage: ConversationMessage = {
      role: 'assistant',
      content: textResponse ?? 'Image updated',
      image_url: imageUrl || undefined,
      timestamp: new Date().toISOString(),
    };

    const { data: currentImage } = await supabase
      .from('images')
      .select('conversation, edit_count, image_url, version_history')
      .eq('id', imageId)
      .single();

    const updateData: Record<string, unknown> = {
      status: 'ready',
      updated_at: new Date().toISOString(),
    };

    if (imageUrl) {
      updateData.image_url = imageUrl;
    }

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

    await supabase
      .from('images')
      .update(updateData)
      .eq('id', imageId);

    const duration = performance.now() - startTime;
    logger.info("Image edit completed", {
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
    logger.error("Image edit error", errorObj, {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    // Send to Sentry
    await captureException(errorObj, {
      function_name: 'edit-image',
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

