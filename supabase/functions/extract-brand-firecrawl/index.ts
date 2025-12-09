import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { url, brandId } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    console.log(`Extracting brand with Firecrawl for domain: ${domain}`);

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
              formats: ['branding', 'screenshot', 'markdown'],
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
          { status: 408, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Rate limiting
      if (status === 429) {
        return new Response(
          JSON.stringify({ 
            error: 'Too many requests to Firecrawl. Please wait a moment and try again.',
            code: 'RATE_LIMITED'
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Authentication errors
      if (status === 401 || status === 403) {
        return new Response(
          JSON.stringify({ 
            error: 'Firecrawl authentication failed. Please contact support.',
            code: 'AUTH_ERROR'
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
    if (brandData.screenshot) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      
      // Call analyze-brand-style function asynchronously
      const styleAnalysisUrl = `${supabaseUrl}/functions/v1/analyze-brand-style`;
      const pageImageUrls = (brandData.page_images || []).slice(0, 3).map(img => img.url);
      
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
        }),
      }).catch(error => {
        console.error('Failed to trigger style analysis (non-blocking):', error);
        // Don't fail the extraction if style analysis fails
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: brandData,
        raw: firecrawlData.data, // Include raw response for debugging
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Extract brand (Firecrawl) error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

  // Extract brand name from metadata
  const brandName = metadata?.title || domain.split('.')[0];

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
    name: capitalizeFirstLetter(brandName),
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

