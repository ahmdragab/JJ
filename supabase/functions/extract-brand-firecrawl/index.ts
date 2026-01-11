import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createLogger } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { getUserIdFromRequest, verifyBrandOwnership, unauthorizedResponse, forbiddenResponse } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { trackConversion } from "../_shared/conversions.ts";

// ConvertAPI configuration
const CONVERTAPI_SECRET = Deno.env.get("CONVERTAPI_SECRET");
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

/**
 * Check if a URL points to an animated or unsupported image format
 * GIFs are considered animated by default since we can't easily check animation in Edge Functions
 * These formats cause issues with Gemini image generation
 */
async function isAnimatedOrUnsupportedFormat(url: string): Promise<{ unsupported: boolean; reason?: string }> {
  try {
    const lowerUrl = url.toLowerCase();

    // Skip data URIs - they're handled separately
    if (lowerUrl.startsWith('data:')) {
      // Check if it's a GIF data URI
      if (lowerUrl.startsWith('data:image/gif')) {
        console.log("[Format] Detected GIF data URI - treating as animated");
        return { unsupported: true, reason: "GIF format (potentially animated)" };
      }
      return { unsupported: false };
    }

    // Check URL extension for GIF (treat all GIFs as potentially animated)
    if (lowerUrl.includes(".gif")) {
      console.log("[Format] Detected GIF from URL extension - treating as animated");
      return { unsupported: true, reason: "GIF format (potentially animated)" };
    }

    // Try HEAD request to check content-type
    const headResponse = await fetch(url, { method: "HEAD" });
    const contentType = headResponse.headers.get("content-type") || "";

    // Check for GIF content-type
    if (contentType.includes("image/gif")) {
      console.log(`[Format] Detected GIF from content-type: ${contentType}`);
      return { unsupported: true, reason: "GIF format (potentially animated)" };
    }

    // WebP can be animated but we can't easily detect it without downloading
    // For now, we'll allow WebP since most are static
    // If issues persist, we could add WebP detection here

    return { unsupported: false };
  } catch (error) {
    console.error("[Format] Error checking URL format:", error);
    // On error, allow the logo through - better to try than skip
    return { unsupported: false };
  }
}

/**
 * Check if a URL returns SVG content
 */
async function isSvgUrl(url: string): Promise<boolean> {
  try {
    // Check for SVG data URIs first (data:image/svg+xml)
    if (url.toLowerCase().startsWith('data:image/svg+xml')) {
      console.log("[SVG] Detected SVG from data URI");
      return true;
    }
    
    // Check URL extension
    if (url.toLowerCase().includes(".svg")) {
      console.log("[SVG] Detected SVG from URL extension");
      return true;
    }
    
    // Try HEAD request (skip for data URIs)
    if (!url.startsWith('data:')) {
      const headResponse = await fetch(url, { method: "HEAD" });
      const contentType = headResponse.headers.get("content-type") || "";
      if (contentType.includes("svg")) {
        console.log(`[SVG] Detected SVG from content-type: ${contentType}`);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error("[SVG] Error checking URL:", error);
    return false;
  }
}

/**
 * Convert SVG to PNG using ConvertAPI and upload to Supabase Storage
 */
async function convertSvgToPng(
  svgUrl: string,
  brandId: string,
  logoType: string = "primary"
): Promise<string | null> {
  if (!CONVERTAPI_SECRET) {
    console.warn("[ConvertAPI] CONVERTAPI_SECRET not set, skipping SVG conversion");
    return null;
  }

  try {
    console.log(`[ConvertAPI] Converting ${logoType} logo from: ${svgUrl.substring(0, 60)}...`);

    // Build file parameter based on whether it's a data URI or HTTP URL
    let fileParam: { Name: string; FileValue: { Url?: string; FileData?: string; FileName?: string } };

    if (svgUrl.startsWith('data:image/svg+xml')) {
      // Data URI - extract content and send as base64
      const base64Match = svgUrl.match(/base64,(.+)$/);
      const utf8Match = svgUrl.match(/utf8,(.+)$/);

      let svgContent: string;
      if (base64Match) {
        // Already base64 encoded
        svgContent = base64Match[1];
        console.log("[ConvertAPI] Data URI is base64 encoded");
      } else if (utf8Match) {
        // URL-encoded UTF-8 - decode and convert to base64
        const decoded = decodeURIComponent(utf8Match[1]);
        svgContent = btoa(decoded);
        console.log("[ConvertAPI] Data URI is UTF-8 encoded, converted to base64");
      } else {
        console.error("[ConvertAPI] Unable to parse SVG data URI format");
        return null;
      }

      fileParam = { Name: "File", FileValue: { FileData: svgContent, FileName: "logo.svg" } };
    } else {
      // HTTP URL - let ConvertAPI fetch it
      fileParam = { Name: "File", FileValue: { Url: svgUrl } };
      console.log("[ConvertAPI] Using URL for HTTP source");
    }

    // Call ConvertAPI
    const convertResponse = await fetch(
      `https://v2.convertapi.com/convert/svg/to/png?Secret=${CONVERTAPI_SECRET}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          Parameters: [
            fileParam,
            { Name: "ImageResolution", Value: "300" },
            { Name: "ScaleImage", Value: "true" },
            { Name: "ScaleProportions", Value: "true" },
            { Name: "ImageHeight", Value: "512" },
          ],
        }),
      }
    );
    
    if (!convertResponse.ok) {
      const errorText = await convertResponse.text();
      console.error(`[ConvertAPI] Conversion failed: ${convertResponse.status} - ${errorText}`);
      return null;
    }
    
    const convertResult = await convertResponse.json();
    
    if (!convertResult.Files || convertResult.Files.length === 0) {
      console.error("[ConvertAPI] No files in response");
      return null;
    }
    
    // Get the PNG data (base64 encoded)
    const pngBase64 = convertResult.Files[0].FileData;
    const pngFileName = convertResult.Files[0].FileName || `${logoType}.png`;
    
    console.log(`[ConvertAPI] Conversion successful: ${pngFileName}`);
    
    // Decode base64 to binary
    const binaryString = atob(pngBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Upload to Supabase Storage
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const storagePath = `${brandId}/${logoType}-converted-${Date.now()}.png`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("brand-logos")
      .upload(storagePath, bytes, {
        contentType: "image/png",
        cacheControl: "3600",
        upsert: true,
      });
    
    if (uploadError) {
      console.error("[ConvertAPI] Upload to storage failed:", uploadError);
      return null;
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from("brand-logos")
      .getPublicUrl(uploadData.path);
    
    console.log(`[ConvertAPI] PNG uploaded: ${urlData.publicUrl}`);
    return urlData.publicUrl;
  } catch (error) {
    console.error("[ConvertAPI] Error:", error);
    return null;
  }
}

/**
 * Download an image from URL and upload to Supabase Storage
 * This avoids hotlink protection issues from external sites
 */
async function downloadAndUploadImage(
  imageUrl: string,
  brandId: string,
  logoType: string = "primary"
): Promise<string | null> {
  try {
    // Skip data URIs - they need special handling
    if (imageUrl.startsWith('data:')) {
      console.log(`[Upload] Skipping data URI for ${logoType}`);
      return null;
    }

    console.log(`[Upload] Downloading ${logoType} from: ${imageUrl.substring(0, 80)}...`);

    // Download the image
    const response = await fetch(imageUrl, {
      headers: {
        // Some sites check for browser-like headers
        'User-Agent': 'Mozilla/5.0 (compatible; BrandExtractor/1.0)',
        'Accept': 'image/*,*/*',
      },
    });

    if (!response.ok) {
      console.error(`[Upload] Failed to download ${logoType}: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const imageData = await response.arrayBuffer();

    if (imageData.byteLength === 0) {
      console.error(`[Upload] Empty image data for ${logoType}`);
      return null;
    }

    // Determine file extension from content type
    let extension = 'png';
    if (contentType.includes('jpeg') || contentType.includes('jpg')) extension = 'jpg';
    else if (contentType.includes('webp')) extension = 'webp';
    else if (contentType.includes('gif')) extension = 'gif';
    else if (contentType.includes('svg')) extension = 'svg';

    // Upload to Supabase Storage
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const storagePath = `${brandId}/${logoType}-${Date.now()}.${extension}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("brand-logos")
      .upload(storagePath, imageData, {
        contentType,
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      console.error(`[Upload] Storage upload failed for ${logoType}:`, uploadError);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("brand-logos")
      .getPublicUrl(uploadData.path);

    console.log(`[Upload] ${logoType} uploaded: ${urlData.publicUrl}`);
    return urlData.publicUrl;
  } catch (error) {
    console.error(`[Upload] Error processing ${logoType}:`, error);
    return null;
  }
}

/**
 * Process logos - convert SVGs to PNGs using ConvertAPI
 * Also downloads and re-uploads raster images to avoid hotlink protection
 * Detects and skips animated/unsupported formats (like GIFs)
 */
async function processLogos(
  logos: { primary?: string; icon?: string; wordmark?: string },
  brandId: string
): Promise<{ primary?: string; icon?: string; wordmark?: string }> {
  const processedLogos = { ...logos };

  // Process primary logo
  if (logos.primary) {
    // First check if it's an animated/unsupported format
    const formatCheck = await isAnimatedOrUnsupportedFormat(logos.primary);
    if (formatCheck.unsupported) {
      console.warn(`[Format] Primary logo is unsupported: ${formatCheck.reason}. Skipping logo.`);
      processedLogos.primary = undefined;
    } else {
      const isSvg = await isSvgUrl(logos.primary);
      if (isSvg) {
        console.log("[SVG] Primary logo is SVG, converting via ConvertAPI...");
        const pngUrl = await convertSvgToPng(logos.primary, brandId, "primary");
        if (pngUrl) {
          processedLogos.primary = pngUrl;
        } else {
          console.warn("[SVG] Failed to convert primary logo, keeping original SVG");
        }
      } else {
        // Download and re-upload raster images to avoid hotlink protection
        console.log("[Upload] Primary logo is raster format, downloading and re-uploading...");
        const uploadedUrl = await downloadAndUploadImage(logos.primary, brandId, "primary");
        if (uploadedUrl) {
          processedLogos.primary = uploadedUrl;
        } else {
          console.warn("[Upload] Failed to re-upload primary logo, keeping original URL");
        }
      }
    }
  }

  // Process icon if different from primary
  if (logos.icon && logos.icon !== logos.primary) {
    // First check if it's an animated/unsupported format
    const formatCheck = await isAnimatedOrUnsupportedFormat(logos.icon);
    if (formatCheck.unsupported) {
      console.warn(`[Format] Icon is unsupported: ${formatCheck.reason}. Skipping icon.`);
      processedLogos.icon = undefined;
    } else {
      const isSvg = await isSvgUrl(logos.icon);
      if (isSvg) {
        console.log("[SVG] Icon is SVG, converting via ConvertAPI...");
        const pngUrl = await convertSvgToPng(logos.icon, brandId, "icon");
        if (pngUrl) {
          processedLogos.icon = pngUrl;
        }
      } else {
        // Download and re-upload raster images to avoid hotlink protection
        console.log("[Upload] Icon is raster format, downloading and re-uploading...");
        const uploadedUrl = await downloadAndUploadImage(logos.icon, brandId, "icon");
        if (uploadedUrl) {
          processedLogos.icon = uploadedUrl;
        }
      }
    }
  }

  return processedLogos;
}

// CORS headers function - uses validated origin from request
function getCors(request: Request): Record<string, string> {
  return {
    ...getCorsHeaders(request),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

// Firecrawl branding response structure based on actual API response
interface FirecrawlBrandingResponse {
  success: boolean;
  data?: {
    branding?: {
      // Theme
      colorScheme?: 'light' | 'dark';
      
      // Images
      images?: {
        logo?: string;
        favicon?: string;
        ogImage?: string;
      };
      
      // Colors - object format
      colors?: {
        primary?: string;
        accent?: string;
        background?: string;
        textPrimary?: string;
        link?: string;
        [key: string]: string | undefined;
      };
      
      // Fonts - array format with family and role
      fonts?: Array<{
        family: string;
        role: string; // body, heading, etc.
      }>;
      
      // Typography - nested structure
      typography?: {
        fontFamilies?: {
          primary?: string;
          heading?: string;
        };
        fontStacks?: {
          heading?: string[];
          body?: string[];
          paragraph?: string[];
        };
        fontSizes?: {
          h1?: string;
          h2?: string;
          body?: string;
          [key: string]: string | undefined;
        };
      };
      
      // Spacing
      spacing?: {
        baseUnit?: number | string;
        borderRadius?: string;
        [key: string]: number | string | undefined;
      };
      
      // Components - with buttonPrimary/buttonSecondary format
      components?: {
        input?: {
          borderColor?: string;
          borderRadius?: string;
        };
        buttonPrimary?: {
          background?: string;
          textColor?: string;
          borderRadius?: string;
          shadow?: string;
        };
        buttonSecondary?: {
          background?: string;
          textColor?: string;
          borderRadius?: string;
          shadow?: string;
        };
      };
      
      // Personality/Voice
      personality?: {
        tone?: string;
        energy?: string;
        targetAudience?: string;
      };
      
      // Design system info
      designSystem?: {
        framework?: string;
        componentLibrary?: string | null;
      };
      
      // Confidence scores
      confidence?: {
        buttons?: number;
        colors?: number;
        overall?: number;
      };
    };
    metadata?: {
      title?: string;
      description?: string;
      ogImage?: string;
      favicon?: string;
    };
    markdown?: string;
    screenshot?: string; // Base64 or URL of the screenshot
  };
  error?: string;
}

Deno.serve(async (req: Request) => {
  const logger = createLogger('extract-brand-firecrawl');
  const requestId = logger.generateRequestId();
  const startTime = performance.now();

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCors(req) });
  }

  try {
    logger.setContext({ request_id: requestId });

    // Authenticate the user
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { userId, error: authError } = await getUserIdFromRequest(req, supabase);

    if (authError || !userId) {
      return unauthorizedResponse(authError || 'Authentication required', getCors(req));
    }

    logger.setContext({ request_id: requestId, user_id: userId });

    const { url, brandId } = await req.json();

    if (brandId) {
      logger.setContext({ brand_id: brandId });

      // Verify brand ownership before allowing updates
      const { owned } = await verifyBrandOwnership(supabase, brandId, userId);
      if (!owned) {
        return forbiddenResponse('You do not have permission to update this brand', getCors(req));
      }
    }

    if (!url) {
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
        { status: 400, headers: { ...getCors(req), 'Content-Type': 'application/json' } }
      );
    }

    // Get Firecrawl API key from environment
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      throw new Error('FIRECRAWL_API_KEY environment variable is not set');
    }

    // Extract domain from URL
    let domain: string;
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      domain = urlObj.hostname.replace('www.', '');
    } catch {
      domain = url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
    }

    logger.info(`Extracting brand with Firecrawl`, { domain, url });

    // Retry function for transient errors
    const callFirecrawlWithRetry = async (maxRetries = 3, retryDelay = 2000): Promise<Response> => {
      const targetUrl = url.startsWith('http') ? url : `https://${url}`;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${firecrawlApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: targetUrl,
              formats: ['branding', 'screenshot@fullPage', 'markdown'],
              // Additional options for better extraction
              waitFor: 5000, // Wait longer for JS to load
              timeout: 60000, // Increased timeout for slow websites
            }),
          });

          // If successful, return immediately
          if (firecrawlResponse.ok) {
            return firecrawlResponse;
          }

          const errorText = await firecrawlResponse.text();
          const status = firecrawlResponse.status;
          
          // Transient server errors that should be retried
          const isTransientError = status === 502 || status === 503 || status === 504;
          
          if (isTransientError && attempt < maxRetries) {
            const delay = retryDelay * attempt; // Exponential backoff
            console.warn(`Firecrawl API returned ${status} (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }

          // If not retrying, return the response for error handling
          return firecrawlResponse;
        } catch (error) {
          // Network errors - retry if not last attempt
          if (attempt < maxRetries) {
            const delay = retryDelay * attempt;
            console.warn(`Firecrawl API network error (attempt ${attempt}/${maxRetries}): ${error instanceof Error ? error.message : 'Unknown error'}. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          // Last attempt failed, throw
          throw error;
        }
      }
      
      // Should never reach here, but TypeScript needs it
      throw new Error('Failed to call Firecrawl API after retries');
    };

    // Call Firecrawl API with retry logic
    const firecrawlResponse = await callFirecrawlWithRetry();

    if (!firecrawlResponse.ok) {
      const errorText = await firecrawlResponse.text();
      const status = firecrawlResponse.status;
      console.error(`Firecrawl API error: ${status} - ${errorText}`);
      
      // Handle specific error types with user-friendly messages
      if (status === 408) {
        return new Response(
          JSON.stringify({ 
            error: 'The website took too long to load. This can happen with slow or heavily protected websites. Please try again or use the alternative extraction.',
            code: 'SCRAPE_TIMEOUT'
          }),
          { status: 408, headers: { ...getCors(req), 'Content-Type': 'application/json' } }
        );
      }
      
      // Server errors (after retries exhausted)
      if (status === 502 || status === 503 || status === 504) {
        return new Response(
          JSON.stringify({ 
            error: 'Firecrawl service is temporarily unavailable. This is usually a temporary issue. Please try again in a few moments or use the alternative extraction method.',
            code: 'SERVICE_UNAVAILABLE',
            status
          }),
          { status: 503, headers: { ...getCors(req), 'Content-Type': 'application/json' } }
        );
      }
      
      // Rate limiting
      if (status === 429) {
        return new Response(
          JSON.stringify({ 
            error: 'Too many requests to Firecrawl. Please wait a moment and try again.',
            code: 'RATE_LIMITED'
          }),
          { status: 429, headers: { ...getCors(req), 'Content-Type': 'application/json' } }
        );
      }
      
      // Authentication errors
      if (status === 401 || status === 403) {
        return new Response(
          JSON.stringify({ 
            error: 'Firecrawl authentication failed. Please contact support.',
            code: 'AUTH_ERROR'
          }),
          { status: 500, headers: { ...getCors(req), 'Content-Type': 'application/json' } }
        );
      }
      
      // Generic error
      throw new Error(`Firecrawl API error: ${status}${errorText ? ` - ${errorText.substring(0, 200)}` : ''}`);
    }

    const firecrawlData: FirecrawlBrandingResponse = await firecrawlResponse.json();
    console.log('Firecrawl raw response:', JSON.stringify(firecrawlData, null, 2));
    console.log('Firecrawl data keys:', firecrawlData.data ? Object.keys(firecrawlData.data) : 'no data');
    console.log('Firecrawl branding data:', firecrawlData.data?.branding ? JSON.stringify(firecrawlData.data.branding, null, 2) : 'no branding');

    if (!firecrawlData.success || !firecrawlData.data) {
      throw new Error(firecrawlData.error || 'Failed to extract branding data');
    }
    
    // Check if branding data is present
    if (!firecrawlData.data.branding) {
      console.warn('No branding data in response. Available keys:', Object.keys(firecrawlData.data));
    }

    // Map Firecrawl response to our brand format
    const brandData = mapFirecrawlToOurFormat(firecrawlData, domain);

    // Convert SVG logos to PNG if brandId provided
    if (brandId && brandData.logos) {
      console.log("[SVG] Processing logos for brand:", brandId);
      brandData.logos = await processLogos(brandData.logos, brandId);
    }

    // If brandId provided, update the brand in the database
    if (brandId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Prepare update data (only include fields that exist in the database)
      const updateData = {
        name: brandData.name,
        domain: brandData.domain,
        slogan: brandData.slogan,
        logos: brandData.logos,
        all_logos: brandData.all_logos,
        colors: brandData.colors,
        fonts: brandData.fonts,
        voice: brandData.voice,
        styleguide: {
          ...brandData.styleguide,
          summary: brandData.summary,
          industry: brandData.industry,
          keyServices: brandData.key_services,
        },
        screenshot: brandData.screenshot,
        page_images: brandData.page_images,
        status: 'ready',
      };

      const { error: updateError } = await supabase
        .from('brands')
        .update(updateData)
        .eq('id', brandId);

      if (updateError) {
        console.error('Database update error:', updateError);
      } else {
        // Get the brand to retrieve user_id
        const { data: brandRecord } = await supabase
          .from('brands')
          .select('user_id')
          .eq('id', brandId)
          .single();

        if (brandRecord?.user_id) {
          // Get existing assets to avoid duplicates
          const { data: existingAssets } = await supabase
            .from('brand_assets')
            .select('url')
            .eq('brand_id', brandId);

          const existingUrls = new Set(existingAssets?.map(a => a.url) || []);

          // Add screenshot to asset library if it exists and not already added
          if (brandData.screenshot && !existingUrls.has(brandData.screenshot)) {
            const { error: screenshotError } = await supabase
              .from('brand_assets')
              .insert({
                brand_id: brandId,
                user_id: brandRecord.user_id,
                name: 'Website Screenshot',
                description: 'Automatically extracted website screenshot',
                url: brandData.screenshot,
                type: 'asset',
                category: 'screenshot',
              });
            
            if (screenshotError) {
              console.error('Failed to add screenshot to asset library:', screenshotError);
            }
          }

          // Add page images to asset library (skip duplicates)
          if (brandData.page_images && brandData.page_images.length > 0) {
            const assetInserts = brandData.page_images
              .filter(img => img.url && !existingUrls.has(img.url))
              .map((img, index) => ({
                brand_id: brandId,
                user_id: brandRecord.user_id,
                name: `Extracted Image ${index + 1}`,
                description: `Automatically extracted from website (${img.type || 'image'})`,
                url: img.url,
                type: 'asset' as const,
                category: img.type || 'extracted',
              }));

            // Insert in batches to avoid overwhelming the database
            if (assetInserts.length > 0) {
              const batchSize = 10;
              for (let i = 0; i < assetInserts.length; i += batchSize) {
                const batch = assetInserts.slice(i, i + batchSize);
                const { error: batchError } = await supabase
                  .from('brand_assets')
                  .insert(batch);
                
                if (batchError) {
                  console.error(`Failed to add page images batch ${i / batchSize + 1} to asset library:`, batchError);
                }
              }
            }
          }
        }
      }
    }

    // Trigger brand style analysis asynchronously (don't wait for it)
    // This uses Gemini 3 Flash to analyze the screenshot and extract:
    // - Visual style profile (layout, typography, shapes, etc.)
    // - Brand colors (more accurate than CSS extraction)
    if (brandData.screenshot) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      
      // Call analyze-brand-style function asynchronously
      const styleAnalysisUrl = `${supabaseUrl}/functions/v1/analyze-brand-style`;
      const pageImageUrls = (brandData.page_images || []).slice(0, 3).map(img => img.url);
      const logoUrl = brandData.logos?.primary || brandData.logos?.icon;
      
      fetch(styleAnalysisUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          brandId: brandId,
          screenshotUrl: brandData.screenshot,
          pageImageUrls: pageImageUrls,
          logoUrl: logoUrl, // Pass logo for better color extraction
        }),
      }).catch(error => {
        console.error('Failed to trigger style analysis (non-blocking):', error);
        // Don't fail the extraction if style analysis fails
      });

      // Also trigger ad personality analysis asynchronously with status tracking
      // This uses GPT-4o to extract observable visual traits for ad generation
      const adPersonalityUrl = `${supabaseUrl}/functions/v1/analyze-ad-personality`;

      // Set status to 'processing' before making the request
      const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
      await supabaseClient
        .from('brands')
        .update({
          ad_personality_status: 'processing',
          ad_personality_error: null
        })
        .eq('id', brandId);

      // Make the request and track success/failure
      fetch(adPersonalityUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          brandId: brandId,
          screenshotUrl: brandData.screenshot,
        }),
      })
        .then(async (response) => {
          if (response.ok) {
            // Success - the analyze-ad-personality function already updates the styleguide
            await supabaseClient
              .from('brands')
              .update({ ad_personality_status: 'completed' })
              .eq('id', brandId);
            console.log(`[Ad Personality] Analysis completed for brand ${brandId}`);
          } else {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP ${response.status}`);
          }
        })
        .catch(async (error) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('Failed to analyze ad personality:', errorMessage);

          // Update status to failed with error message
          await supabaseClient
            .from('brands')
            .update({
              ad_personality_status: 'failed',
              ad_personality_error: errorMessage.substring(0, 500),
            })
            .eq('id', brandId);

          // Increment attempts counter
          await supabaseClient.rpc('increment_ad_personality_attempts', { brand_id: brandId })
            .catch(() => {
              // If RPC doesn't exist, update directly
              supabaseClient
                .from('brands')
                .update({ ad_personality_attempts: 1 }) // Simple update, not atomic
                .eq('id', brandId);
            });
        });
    }

    const duration = performance.now() - startTime;
    logger.info("Brand extraction completed", {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    // Track brand extraction completed conversion
    trackConversion({
      user_id: userId,
      event_name: 'brand_extraction_completed',
      properties: {
        brand_id: brandId,
        domain: url,
        has_logo: !!(brandData.logos?.primary || brandData.logos?.icon),
        has_colors: !!(brandData.colors && Object.keys(brandData.colors).length > 0),
        duration_ms: Math.round(duration),
      },
    }).catch(err => {
      console.warn('Conversion tracking failed:', err);
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: brandData,
        raw: firecrawlData.data, // Include raw response for debugging
      }),
      { headers: { ...getCors(req), 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const duration = performance.now() - startTime;
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    // Log to Axiom
    logger.error('Extract brand (Firecrawl) error', errorObj, {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    // Send to Sentry
    await captureException(errorObj, {
      function_name: 'extract-brand-firecrawl',
      request_id: requestId,
    });

    return new Response(
      JSON.stringify({ 
        error: errorObj.message,
        success: false,
      }),
      { status: 500, headers: { ...getCors(req), 'Content-Type': 'application/json' } }
    );
  }
});

function mapFirecrawlToOurFormat(
  response: FirecrawlBrandingResponse,
  domain: string
) {
  const branding = response.data?.branding;
  const metadata = response.data?.metadata;
  const screenshot = response.data?.screenshot;
  const markdown = response.data?.markdown || '';

  console.log('Mapping branding data:', JSON.stringify(branding, null, 2));
  console.log('Screenshot available:', !!screenshot);
  console.log('Markdown length:', markdown.length);

  // Extract image URLs from markdown using regex
  // Markdown images: ![alt](url) or ![alt](url "title")
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.avif'];
  const pageImages: Array<{ url: string; type: string }> = [];
  const seenUrls = new Set<string>();
  
  // Match markdown image syntax: ![...](url)
  const markdownImageRegex = /!\[.*?\]\((.*?)(?:\s+".*?")?\)/g;
  let match;
  
  while ((match = markdownImageRegex.exec(markdown)) !== null) {
    const url = match[1].trim();
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url);
      const lowerUrl = url.toLowerCase();
      
      // Determine image type from extension
      let type = 'image';
      if (lowerUrl.includes('.svg')) type = 'svg';
      else if (lowerUrl.includes('.ico')) type = 'icon';
      else if (lowerUrl.includes('.gif')) type = 'gif';
      else if (lowerUrl.includes('.png')) type = 'png';
      else if (lowerUrl.includes('.jpg') || lowerUrl.includes('.jpeg')) type = 'jpg';
      else if (lowerUrl.includes('.webp')) type = 'webp';
      else if (lowerUrl.includes('.avif')) type = 'avif';
      
      pageImages.push({ url, type });
    }
  }
  
  // Also extract from HTML img tags that might be in markdown (some sites have raw HTML)
  const htmlImageRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((match = htmlImageRegex.exec(markdown)) !== null) {
    const url = match[1].trim();
    if (url && !seenUrls.has(url) && !url.startsWith('data:')) {
      seenUrls.add(url);
      const lowerUrl = url.toLowerCase();
      
      let type = 'image';
      if (lowerUrl.includes('.svg')) type = 'svg';
      else if (lowerUrl.includes('.ico')) type = 'icon';
      else if (lowerUrl.includes('.gif')) type = 'gif';
      else if (lowerUrl.includes('.png')) type = 'png';
      else if (lowerUrl.includes('.jpg') || lowerUrl.includes('.jpeg')) type = 'jpg';
      else if (lowerUrl.includes('.webp')) type = 'webp';
      
      pageImages.push({ url, type });
    }
  }
  
  // Also add images from branding.images if they're URLs (not data URIs)
  if (branding?.images) {
    if (branding.images.ogImage && !seenUrls.has(branding.images.ogImage)) {
      seenUrls.add(branding.images.ogImage);
      pageImages.unshift({ url: branding.images.ogImage, type: 'og-image' });
    }
    if (branding.images.favicon && !branding.images.favicon.startsWith('data:') && !seenUrls.has(branding.images.favicon)) {
      seenUrls.add(branding.images.favicon);
      pageImages.unshift({ url: branding.images.favicon, type: 'favicon' });
    }
  }

  console.log('Extracted page images:', pageImages.length);

  // Extract colors from object format
  const colors: Record<string, string> = {
    primary: '#6366f1',
    secondary: '#8b5cf6',
    background: '#ffffff',
    surface: '#f8fafc',
    text_primary: '#1e293b',
    text_on_primary: '#ffffff',
  };

  if (branding?.colors) {
    if (branding.colors.primary) colors.primary = branding.colors.primary;
    if (branding.colors.accent) colors.secondary = branding.colors.accent;
    if (branding.colors.background) colors.background = branding.colors.background;
    if (branding.colors.textPrimary) colors.text_primary = branding.colors.textPrimary;
    if (branding.colors.link) colors.surface = branding.colors.link; // Use link as accent
  }

  // Extract fonts from array format (uses family and role)
  const fonts: { heading: string; body: string } = {
    heading: '',
    body: '',
  };

  if (branding?.fonts && Array.isArray(branding.fonts)) {
    console.log('Processing fonts:', branding.fonts.length, 'fonts found');
    branding.fonts.forEach((font) => {
      const fontRole = font.role?.toLowerCase();
      console.log(`Font: ${font.family}, role: ${fontRole}`);
      if (fontRole === 'heading' || fontRole === 'display') {
        if (!fonts.heading) fonts.heading = font.family;
      } else if (fontRole === 'body' || fontRole === 'text') {
        if (!fonts.body) fonts.body = font.family;
      }
    });
    // Fallback: use first heading font, first body font
    if (!fonts.heading) {
      const headingFont = branding.fonts.find(f => f.role === 'heading');
      if (headingFont) fonts.heading = headingFont.family;
    }
    if (!fonts.body) {
      const bodyFont = branding.fonts.find(f => f.role === 'body');
      if (bodyFont) fonts.body = bodyFont.family;
      else if (branding.fonts[0]) fonts.body = branding.fonts[0].family;
    }
  }

  // Also check typography.fontFamilies for font info
  if (branding?.typography?.fontFamilies) {
    if (branding.typography.fontFamilies.heading && !fonts.heading) {
      fonts.heading = branding.typography.fontFamilies.heading;
    }
    if (branding.typography.fontFamilies.primary && !fonts.body) {
      fonts.body = branding.typography.fontFamilies.primary;
    }
  }

  console.log('Final fonts:', fonts);

  // Extract logos from images object
  const allLogos: Array<{ url: string; type?: string; mode?: string }> = [];
  let primaryLogo = '';

  if (branding?.images) {
    if (branding.images.logo) {
      primaryLogo = branding.images.logo;
      allLogos.push({ url: branding.images.logo, type: 'logo' });
    }
    if (branding.images.favicon) {
      allLogos.push({ url: branding.images.favicon, type: 'favicon' });
      if (!primaryLogo) primaryLogo = branding.images.favicon;
    }
    if (branding.images.ogImage) {
      allLogos.push({ url: branding.images.ogImage, type: 'og-image' });
    }
  }

  // Fallback to metadata
  if (!primaryLogo && metadata?.favicon) {
    primaryLogo = metadata.favicon;
    allLogos.push({ url: metadata.favicon, type: 'favicon' });
  }
  if (!primaryLogo && metadata?.ogImage) {
    primaryLogo = metadata.ogImage;
    allLogos.push({ url: metadata.ogImage, type: 'og-image' });
  }

  // Build styleguide from detailed data
  const styleguide: Record<string, unknown> = {};

  // Theme/mode from Firecrawl (uses colorScheme)
  styleguide.mode = branding?.colorScheme || 'light';

  if (branding?.typography) {
    styleguide.typography = {
      headings: {
        h1: { fontSize: branding.typography.fontSizes?.h1 },
        h2: { fontSize: branding.typography.fontSizes?.h2 },
      },
      p: { fontSize: branding.typography.fontSizes?.body },
      fontFamilies: branding.typography.fontFamilies,
      fontStacks: branding.typography.fontStacks,
    };
  }
  if (branding?.spacing) {
    styleguide.elementSpacing = {
      baseUnit: branding.spacing.baseUnit,
      borderRadius: branding.spacing.borderRadius,
    };
  }
  if (branding?.components) {
    styleguide.components = {
      button: {
        primary: branding.components.buttonPrimary,
        secondary: branding.components.buttonSecondary,
      },
      input: branding.components.input,
    };
  }
  if (branding?.designSystem) {
    styleguide.designSystem = branding.designSystem;
  }
  if (branding?.confidence) {
    styleguide.confidence = branding.confidence;
  }

  // Extract brand name from metadata (cleaned to remove SEO suffixes)
  const brandName = cleanBrandName(metadata?.title || '', domain);

  // Build voice from personality
  const voice: {
    formality: string;
    energy: string;
    keywords: string[];
  } = {
    formality: 'professional',
    energy: 'moderate',
    keywords: [],
  };

  if (branding?.personality) {
    if (branding.personality.tone) {
      voice.formality = branding.personality.tone.toLowerCase();
    }
    if (branding.personality.energy) {
      voice.energy = branding.personality.energy.toLowerCase();
    }
    if (branding.personality.targetAudience) {
      // Extract keywords from audience description
      voice.keywords = branding.personality.targetAudience
        .split(/\s+/)
        .filter(w => w.length > 3)
        .slice(0, 5);
    }
  }

  // Get description from metadata
  const description = metadata?.description || '';

  // Add summary to styleguide
  styleguide.summary = description;

  // Find favicon/icon from allLogos or images
  const faviconLogo = allLogos.find(l => l.type === 'favicon');
  const iconUrl = faviconLogo?.url || branding?.images?.favicon || metadata?.favicon || '';

  return {
    name: brandName,
    domain,
    slogan: '',
    summary: description,
    industry: '',
    key_services: [] as string[],
    logos: {
      primary: primaryLogo,
      icon: iconUrl,
      wordmark: '',
    },
    all_logos: allLogos,
    colors,
    fonts,
    voice,
    styleguide,
    backdrops: [] as Array<{ url: string }>,
    description: description || undefined,
    // New: screenshot and extracted page images
    screenshot: screenshot || null,
    page_images: pageImages,
  };
}

function capitalizeFirstLetter(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function cleanBrandName(rawTitle: string, domain: string): string {
  if (!rawTitle) return capitalizeFirstLetter(domain.split('.')[0]);

  // Common title separators: | - – — : · //
  const separators = /\s*[|–—\-:·\/\/]+\s*/;
  const segments = rawTitle.split(separators);

  // Take the first segment (usually the brand name)
  let brandName = segments[0].trim();

  // If still too long (>30 chars), take first 3 words
  if (brandName.length > 30) {
    brandName = brandName.split(/\s+/).slice(0, 3).join(' ');
  }

  return brandName || capitalizeFirstLetter(domain.split('.')[0]);
}

function isLightColor(hex: string): boolean {
  try {
    const c = hex.replace('#', '');
    const rgb = parseInt(c, 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luma > 128;
  } catch {
    return true;
  }
}

