import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Gemini 3 Flash - latest model for vision tasks (Public Preview, Dec 2025)
// https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-flash
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-3-flash-preview";
const CONVERTAPI_SECRET = Deno.env.get("CONVERTAPI_SECRET");

// Supported image MIME types for Gemini Vision API
// SVG and other vector formats are NOT supported
const SUPPORTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
];

interface ExtractedColors {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  text_primary: string;
  text_on_primary: string;
}

interface BrandStyleProfile {
  layout_density: "minimal" | "medium" | "dense";
  whitespace: "high" | "medium" | "low";
  shape_language: string[];
  imagery_type: string[];
  color_usage: {
    contrast: "dark-on-light" | "light-on-dark" | "mixed";
    gradients: boolean;
    duotone_overlays: boolean;
  };
  typography_feeling: {
    category: "geometric sans" | "grotesk" | "serif" | "condensed" | "mixed";
    headline_style: "loud" | "understated" | "balanced";
  };
  motion_energy: "calm" | "moderate" | "dynamic";
  brand_archetype: string[];
  design_elements: {
    shadows: "none" | "subtle" | "prominent";
    borders: "none" | "thin" | "thick";
    patterns: boolean;
    textures: boolean;
  };
  extracted_colors?: ExtractedColors;
}

/**
 * Check if a URL points to an SVG image
 */
async function isSvgUrl(url: string): Promise<boolean> {
  try {
    // Check URL extension first
    if (url.toLowerCase().includes(".svg")) {
      console.log("[SVG] Detected SVG from URL extension");
      return true;
    }

    // Check data URI
    if (url.toLowerCase().startsWith('data:image/svg+xml')) {
      console.log("[SVG] Detected SVG from data URI");
      return true;
    }

    // Check content-type via HEAD request
    const response = await fetch(url, { method: "HEAD" });
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("svg")) {
      console.log(`[SVG] Detected SVG from content-type: ${contentType}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error("[SVG] Error checking URL:", error);
    return false;
  }
}

/**
 * Convert SVG to PNG using ConvertAPI
 * Returns base64 PNG data or null if conversion fails
 * Note: ConvertAPI requires an HTTP URL, not data URIs
 */
async function convertSvgToPng(svgUrl: string): Promise<{ base64: string; mimeType: string } | null> {
  if (!CONVERTAPI_SECRET) {
    console.warn("[ConvertAPI] CONVERTAPI_SECRET not set, skipping SVG conversion");
    return null;
  }

  // ConvertAPI can't handle data URIs - only HTTP URLs
  if (svgUrl.startsWith('data:')) {
    console.warn("[ConvertAPI] Cannot convert data URI SVGs, skipping");
    return null;
  }

  try {
    console.log(`[ConvertAPI] Converting SVG to PNG: ${svgUrl.substring(0, 100)}...`);

    const response = await fetch(
      `https://v2.convertapi.com/convert/svg/to/png?Secret=${CONVERTAPI_SECRET}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Parameters: [
            { Name: "File", FileValue: { Url: svgUrl } },
            { Name: "ImageResolution", Value: "300" },
            { Name: "ScaleImage", Value: "true" },
            { Name: "ScaleProportions", Value: "true" },
            { Name: "ImageHeight", Value: "512" },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ConvertAPI] API error: ${response.status}`, errorText);
      return null;
    }

    const convertResult = await response.json();
    if (!convertResult.Files || convertResult.Files.length === 0) {
      console.error("[ConvertAPI] No files in response");
      return null;
    }

    const pngBase64 = convertResult.Files[0].FileData;
    console.log("[ConvertAPI] SVG to PNG conversion successful");

    return { base64: pngBase64, mimeType: "image/png" };
  } catch (error) {
    console.error("[ConvertAPI] Conversion failed:", error);
    return null;
  }
}

/**
 * Fetch image and convert to base64 for Gemini API
 * Automatically converts SVG to PNG using ConvertAPI
 * Returns null for unsupported formats that can't be converted
 */
async function fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    // Log the URL being processed (truncated for readability)
    const urlPreview = url.length > 100 ? `${url.substring(0, 100)}...` : url;
    console.log(`[fetchImage] Processing: ${urlPreview}`);
    
    // First check if it's an SVG - we need to convert it
    const isSvg = await isSvgUrl(url);
    if (isSvg) {
      console.log(`[fetchImage] SVG detected, attempting conversion`);
      const converted = await convertSvgToPng(url);
      if (converted) {
        console.log("[fetchImage] SVG successfully converted to PNG");
        return converted;
      }
      console.warn("[fetchImage] SVG conversion failed, skipping image");
      return null;
    }

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const contentType = response.headers.get("content-type") || "image/png";
    
    // Extract the base MIME type (remove charset, etc.)
    const baseMimeType = contentType.split(";")[0].trim().toLowerCase();
    
    // Check if the MIME type is supported by Gemini Vision API
    if (!SUPPORTED_IMAGE_TYPES.includes(baseMimeType)) {
      // Double-check for SVG that might not have been detected earlier
      if (baseMimeType.includes("svg")) {
        console.log(`[fetchImage] SVG detected from content-type, attempting conversion`);
        const converted = await convertSvgToPng(url);
        if (converted) {
          return converted;
        }
      }
      console.warn(`Skipping unsupported image format: ${baseMimeType} (URL: ${url})`);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    // Convert to base64
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    
    return { base64, mimeType: baseMimeType };
  } catch (error) {
    console.error("Error fetching image:", error);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const logger = createLogger('analyze-brand-style');
  const requestId = logger.generateRequestId();
  const startTime = performance.now();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify authorization - accept service role key or valid user JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // Allow service role key for internal calls (from other edge functions)
    const isServiceRole = token === serviceRoleKey;

    if (!isServiceRole) {
      // If not service role, validate as a user JWT via Supabase
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabase = createClient(supabaseUrl, serviceRoleKey!);
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        console.error("Auth validation failed:", error?.message);
        return new Response(
          JSON.stringify({ error: "Invalid authorization token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    logger.setContext({ request_id: requestId });
    const { brandId, screenshotUrl, pageImageUrls, logoUrl, extractColorsOnly } = await req.json();

    if (!brandId) {
      return new Response(
        JSON.stringify({ error: "brandId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!screenshotUrl) {
      return new Response(
        JSON.stringify({ error: "screenshotUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Gemini API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the appropriate prompt based on mode
    const systemPrompt = extractColorsOnly 
      ? `Extract brand colors from the images. Return JSON only:
{
  "extracted_colors": {
    "primary": "#hex",
    "secondary": "#hex",
    "background": "#hex",
    "surface": "#hex",
    "text_primary": "#hex",
    "text_on_primary": "#hex"
  }
}
Extract actual hex values. Primary from logo/buttons. Be concise.`
      : `You are an expert brand design analyst. Your PRIMARY task is to analyze the HOMEPAGE SCREENSHOT in detail. The screenshot is the most important image - it shows the actual website design and visual style. Pay close attention to every detail in the screenshot: layout, spacing, colors, typography, shapes, imagery, and overall aesthetic.

Your task is to analyze the visual design and return a JSON object with the following structure:

{
  "layout_density": "minimal" | "medium" | "dense" - How much content/elements are packed into the design
  "whitespace": "high" | "medium" | "low" - Amount of empty space between elements
  "shape_language": ["rounded cards", "sharp rectangles", "pills", "circles", "squiggles", etc.] - Array of shape types used
  "imagery_type": ["flat illustration", "3D illustration", "icon-heavy", "product UI mockups", "real photography", "people", "objects", etc.] - Array of imagery styles used
  "color_usage": {
    "contrast": "dark-on-light" | "light-on-dark" | "mixed" - Overall color contrast pattern
    "gradients": true/false - Whether gradients are used
    "duotone_overlays": true/false - Whether duotone/color overlay effects are used
  },
  "typography_feeling": {
    "category": "geometric sans" | "grotesk" | "serif" | "condensed" | "mixed" - Font category
    "headline_style": "loud" | "understated" | "balanced" - How prominent/attention-grabbing headlines are
  },
  "motion_energy": "calm" | "moderate" | "dynamic" - Visual energy level (calm = clean & minimal, dynamic = busy & energetic)
  "brand_archetype": ["enterprise SaaS", "playful consumer app", "premium luxury", "tech startup", "e-commerce", etc.] - Array of brand archetype tags
  "design_elements": {
    "shadows": "none" | "subtle" | "prominent" - Shadow usage
    "borders": "none" | "thin" | "thick" - Border usage
    "patterns": true/false - Whether patterns are used
    "textures": true/false - Whether textures are used
  },
  "extracted_colors": {
    "primary": "#hex - The main brand color (usually found in logo, primary buttons, or key UI elements)",
    "secondary": "#hex - Secondary/accent color used for highlights and secondary actions",
    "background": "#hex - Main page background color",
    "surface": "#hex - Card/component background color",
    "text_primary": "#hex - Main text color",
    "text_on_primary": "#hex - Text color on primary-colored backgrounds"
  }
}

Be specific and accurate. Base your analysis on what you actually see in the images, not assumptions.
For colors, extract ACTUAL hex values - analyze the exact colors visible in the screenshot and logo.`;

    // Build image parts for Gemini
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
    
    // Add instruction text
    parts.push({
      text: extractColorsOnly 
        ? "Extract brand colors. First image is the website screenshot. Second image (if provided) is the logo - use it for primary color."
        : "Analyze the brand's website design. The first image is the HOMEPAGE SCREENSHOT - analyze it in detail. Additional images provide supplementary context."
    });

    // Fetch and add screenshot
    console.log(`Fetching screenshot: ${screenshotUrl}`);
    const screenshotData = await fetchImageAsBase64(screenshotUrl);
    if (screenshotData) {
      parts.push({
        inlineData: {
          mimeType: screenshotData.mimeType,
          data: screenshotData.base64
        }
      });
    } else {
      console.error("Failed to fetch screenshot, continuing without it");
    }

    // Add logo if provided (especially useful for color extraction)
    if (logoUrl) {
      console.log(`Fetching logo: ${logoUrl}`);
      const logoData = await fetchImageAsBase64(logoUrl);
      if (logoData) {
        parts.push({
          inlineData: {
            mimeType: logoData.mimeType,
            data: logoData.base64
          }
        });
      }
    }

    // Add additional page images (for full analysis mode only)
    if (!extractColorsOnly && pageImageUrls?.length) {
      const imagesToAnalyze = pageImageUrls.slice(0, 3);
      for (const imgUrl of imagesToAnalyze) {
        const imgData = await fetchImageAsBase64(imgUrl);
        if (imgData) {
          parts.push({
            inlineData: {
              mimeType: imgData.mimeType,
              data: imgData.base64
            }
          });
        }
      }
    }

    // Count how many images we actually have (parts with inlineData)
    const imageCount = parts.filter(p => p.inlineData).length;
    console.log(`Analyzing brand ${extractColorsOnly ? 'colors' : 'style'} for brandId: ${brandId} with ${imageCount} images using Gemini 3 Flash`);

    // Ensure we have at least one image to analyze
    if (imageCount === 0) {
      console.error("No valid images available for analysis - all images may be unsupported formats");
      return new Response(
        JSON.stringify({ error: "No valid images available for analysis. The logo may be in an unsupported format (SVG) and conversion failed." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          generationConfig: {
            temperature: 0.1, // Low temperature for consistent, accurate results
            topP: 0.8,
            maxOutputTokens: extractColorsOnly ? 2000 : 2000,
            responseMimeType: "application/json"
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, response.statusText);
      console.error("Error details:", errorText);
      return new Response(
        JSON.stringify({ error: `Gemini API error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    
    // Log finish reason for debugging
    const finishReason = data.candidates?.[0]?.finishReason;
    console.log(`Finish reason: ${finishReason}`);
    
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      console.error("No content in Gemini response:", JSON.stringify(data).substring(0, 500));
      return new Response(
        JSON.stringify({ error: "No response from Gemini" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for MAX_TOKENS before parsing - this means the response was truncated
    if (finishReason === "MAX_TOKENS") {
      console.error("Gemini response was truncated due to token limit");
      console.error("Content received:", content.substring(0, 200));
      
      if (extractColorsOnly) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Response was truncated. Please try again.",
            message: "The AI response was cut off. Please retry or adjust colors manually."
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Response was truncated due to token limit. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsedResponse: BrandStyleProfile | { extracted_colors: ExtractedColors };
    try {
      parsedResponse = JSON.parse(content);
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", parseError);
      console.error("Content received:", content.substring(0, 500));
      console.error("Finish reason:", finishReason);
      
      // If extractColorsOnly mode and we got partial JSON, try to return default colors
      if (extractColorsOnly) {
        console.warn("Returning error due to parsing failure");
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Failed to parse AI response",
            message: "Please try again or adjust colors manually"
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Failed to parse style profile" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle colors-only mode (called from retry button)
    if (extractColorsOnly) {
      const colorsResponse = parsedResponse as { extracted_colors: ExtractedColors };
      const extractedColors = validateColors(colorsResponse.extracted_colors);

      console.log("Extracted colors (colors-only mode):", JSON.stringify(extractedColors));

      // Get current styleguide and store AI colors there
      const { data: brandData, error: fetchError } = await supabase
        .from("brands")
        .select("styleguide")
        .eq("id", brandId)
        .single();

      if (fetchError) {
        console.error("Failed to fetch brand:", fetchError);
        return new Response(
          JSON.stringify({ error: "Failed to fetch brand data", details: fetchError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const currentStyleguide = (brandData?.styleguide as Record<string, unknown>) || {};
      const updatedStyleguide = {
        ...currentStyleguide,
        ai_extracted_colors: extractedColors,
      };

      const { error: updateError } = await supabase
        .from("brands")
        .update({
          styleguide: updatedStyleguide,
          updated_at: new Date().toISOString(),
        })
        .eq("id", brandId);

      if (updateError) {
        console.error("Failed to update brand AI colors:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to save extracted colors", details: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Successfully stored AI-extracted colors in styleguide");

      const duration = performance.now() - startTime;
      logger.info("Brand color extraction completed", {
        request_id: requestId,
        duration_ms: Math.round(duration),
        mode: "colors_only"
      });

      return new Response(
        JSON.stringify({ success: true, extracted_colors: extractedColors }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Full style analysis mode
    const styleProfile = parsedResponse as BrandStyleProfile;
    
    // Validate and normalize the style profile
    const validatedProfile: BrandStyleProfile = {
      layout_density: ["minimal", "medium", "dense"].includes(styleProfile.layout_density) 
        ? styleProfile.layout_density 
        : "medium",
      whitespace: ["high", "medium", "low"].includes(styleProfile.whitespace)
        ? styleProfile.whitespace
        : "medium",
      shape_language: Array.isArray(styleProfile.shape_language) ? styleProfile.shape_language : [],
      imagery_type: Array.isArray(styleProfile.imagery_type) ? styleProfile.imagery_type : [],
      color_usage: {
        contrast: ["dark-on-light", "light-on-dark", "mixed"].includes(styleProfile.color_usage?.contrast)
          ? styleProfile.color_usage.contrast
          : "mixed",
        gradients: Boolean(styleProfile.color_usage?.gradients),
        duotone_overlays: Boolean(styleProfile.color_usage?.duotone_overlays),
      },
      typography_feeling: {
        category: ["geometric sans", "grotesk", "serif", "condensed", "mixed"].includes(styleProfile.typography_feeling?.category)
          ? styleProfile.typography_feeling.category
          : "mixed",
        headline_style: ["loud", "understated", "balanced"].includes(styleProfile.typography_feeling?.headline_style)
          ? styleProfile.typography_feeling.headline_style
          : "balanced",
      },
      motion_energy: ["calm", "moderate", "dynamic"].includes(styleProfile.motion_energy)
        ? styleProfile.motion_energy
        : "moderate",
      brand_archetype: Array.isArray(styleProfile.brand_archetype) ? styleProfile.brand_archetype : [],
      design_elements: {
        shadows: ["none", "subtle", "prominent"].includes(styleProfile.design_elements?.shadows)
          ? styleProfile.design_elements.shadows
          : "subtle",
        borders: ["none", "thin", "thick"].includes(styleProfile.design_elements?.borders)
          ? styleProfile.design_elements.borders
          : "thin",
        patterns: Boolean(styleProfile.design_elements?.patterns),
        textures: Boolean(styleProfile.design_elements?.textures),
      },
    };

    // Add extracted colors if present
    if (styleProfile.extracted_colors) {
      validatedProfile.extracted_colors = validateColors(styleProfile.extracted_colors);
      console.log("Gemini returned extracted_colors:", JSON.stringify(validatedProfile.extracted_colors));
    } else {
      console.warn("Gemini did NOT return extracted_colors in response");
    }

    // Get current styleguide and update
    const { data: brandData, error: fetchError } = await supabase
      .from("brands")
      .select("styleguide")
      .eq("id", brandId)
      .single();

    if (fetchError) {
      console.error("Failed to fetch brand:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch brand data", details: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const currentStyleguide = (brandData?.styleguide as Record<string, unknown>) || {};
    const updatedStyleguide = {
      ...currentStyleguide,
      style_profile: validatedProfile,
    };

    // Store AI-extracted colors in styleguide (don't overwrite main colors field)
    // These will be used when user clicks "Retry" button
    if (validatedProfile.extracted_colors) {
      updatedStyleguide.ai_extracted_colors = validatedProfile.extracted_colors;
    }

    const { error: updateError } = await supabase
      .from("brands")
      .update({
        styleguide: updatedStyleguide,
        updated_at: new Date().toISOString(),
      })
      .eq("id", brandId);

    if (updateError) {
      console.error("Failed to update brand style profile:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to save style profile", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Successfully updated brand style profile", {
      has_style_profile: true,
      has_ai_extracted_colors: !!validatedProfile.extracted_colors,
    });

    const duration = performance.now() - startTime;
    logger.info("Brand style analysis completed", {
      request_id: requestId,
      duration_ms: Math.round(duration),
      mode: "full_analysis"
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        style_profile: validatedProfile,
        extracted_colors: validatedProfile.extracted_colors 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const duration = performance.now() - startTime;
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    logger.error("Error analyzing brand style", errorObj, {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    await captureException(errorObj, {
      function_name: 'analyze-brand-style',
      request_id: requestId,
    });

    return new Response(
      JSON.stringify({ error: errorObj.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Validate and normalize extracted colors
 */
function validateColors(colors: ExtractedColors | undefined): ExtractedColors {
  const defaultColors: ExtractedColors = {
    primary: "#6366f1",
    secondary: "#8b5cf6",
    background: "#ffffff",
    surface: "#f8fafc",
    text_primary: "#1e293b",
    text_on_primary: "#ffffff",
  };

  if (!colors) return defaultColors;

  const isValidHex = (color: string): boolean => {
    return /^#[0-9A-Fa-f]{6}$/.test(color) || /^#[0-9A-Fa-f]{3}$/.test(color);
  };

  return {
    primary: isValidHex(colors.primary) ? colors.primary : defaultColors.primary,
    secondary: isValidHex(colors.secondary) ? colors.secondary : defaultColors.secondary,
    background: isValidHex(colors.background) ? colors.background : defaultColors.background,
    surface: isValidHex(colors.surface) ? colors.surface : defaultColors.surface,
    text_primary: isValidHex(colors.text_primary) ? colors.text_primary : defaultColors.text_primary,
    text_on_primary: isValidHex(colors.text_on_primary) ? colors.text_on_primary : defaultColors.text_on_primary,
  };
}
