import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Gemini API configuration
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-3-pro-image-preview"; // Model for image generation

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
  backdrops?: Array<{ url: string }>;
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
    colors?: {
      accent?: string;
      background?: string;
      text?: string;
    };
  };
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  image_url?: string;
  timestamp: string;
}

// Convert hex color to descriptive name
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

  if (r > 200 && g > 200 && b > 200) return 'light/white';
  if (r < 50 && g < 50 && b < 50) return 'dark/black';
  if (r > g && r > b) return b > 100 ? 'purple/magenta' : 'red/orange';
  if (g > r && g > b) return 'green';
  if (b > r && b > g) return r > 100 ? 'purple/violet' : 'blue';
  
  return hex;
}

function buildEnhancedBrandPrompt(brand: Brand, userPrompt: string): string {
  const colorPalette: string[] = [];
  if (brand.colors.primary) {
    colorPalette.push(`PRIMARY: ${brand.colors.primary} (${describeColor(brand.colors.primary)}) - use this as the dominant accent color`);
  }
  if (brand.colors.secondary) {
    colorPalette.push(`SECONDARY: ${brand.colors.secondary} (${describeColor(brand.colors.secondary)}) - use for supporting elements`);
  }
  if (brand.colors.background) {
    colorPalette.push(`BACKGROUND: ${brand.colors.background} (${describeColor(brand.colors.background)})`);
  }

  const styleElements: string[] = [];
  
  if (brand.voice?.formality === 'professional' || brand.voice?.formality === 'formal') {
    styleElements.push('clean and professional');
  } else if (brand.voice?.formality === 'casual') {
    styleElements.push('friendly and approachable');
  }
  
  if (brand.voice?.energy === 'high') {
    styleElements.push('dynamic', 'energetic', 'bold');
  } else if (brand.voice?.energy === 'medium') {
    styleElements.push('balanced', 'confident');
  } else if (brand.voice?.energy === 'low') {
    styleElements.push('calm', 'sophisticated', 'refined');
  }

  if (brand.voice?.adjectives?.length) {
    styleElements.push(...brand.voice.adjectives);
  }

  if (brand.styleguide?.mode === 'dark') {
    styleElements.push('dark theme/mode');
  } else if (brand.styleguide?.mode === 'light') {
    styleElements.push('light theme/mode');
  }

  const keywords = brand.voice?.keywords?.length 
    ? brand.voice.keywords.join(', ')
    : '';

  const typography: string[] = [];
  if (brand.fonts?.heading) {
    typography.push(`Headings: ${brand.fonts.heading} (or similar style)`);
  }
  if (brand.fonts?.body) {
    typography.push(`Body text: ${brand.fonts.body} (or similar style)`);
  }

  const enhancedPrompt = `
# IMAGE GENERATION REQUEST

Create a high-quality marketing visual that is perfectly on-brand for "${brand.name}".

## USER'S REQUEST
${userPrompt}

## BRAND IDENTITY

**Brand Name:** ${brand.name}
${brand.slogan ? `**Brand Tagline:** "${brand.slogan}"` : ''}
${keywords ? `**Brand Keywords:** ${keywords}` : ''}

## COLOR PALETTE (MUST USE THESE EXACT COLORS)
${colorPalette.length > 0 ? colorPalette.join('\n') : 'Use professional, modern colors'}

## VISUAL STYLE
${styleElements.length > 0 ? styleElements.join(', ') : 'Modern and professional'}

${typography.length > 0 ? `## TYPOGRAPHY STYLE\n${typography.join('\n')}` : ''}

## CRITICAL REQUIREMENTS
1. The primary brand color (${brand.colors.primary || 'main accent'}) MUST be prominently visible
2. The design must feel cohesive with the brand's identity
3. Create a clean, high-quality composition suitable for marketing
4. The image should unmistakably belong to this specific brand
5. Use the exact hex colors provided - do not substitute similar colors
6. Maintain professional quality suitable for commercial use

Generate an image that perfectly represents the ${brand.name} brand.
`.trim();

  return enhancedPrompt;
}

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
    
    // Convert to base64 in chunks to avoid stack overflow
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
    // Convert base64 to Uint8Array
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

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('brand-images')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (error) {
    console.error('Upload failed:', error);
    return null;
  }
}

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
      includeLogoReference = true 
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

    // Build prompt
    const enhancedPrompt = brand 
      ? buildEnhancedBrandPrompt(brand, prompt) 
      : prompt;

    console.log("Mode:", editMode ? "EDIT" : "GENERATE");
    console.log("Prompt:", prompt);

    // Build the request parts for Gemini
    const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [];

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
        
        // Add edit instruction
        parts.push({
          text: `USER'S EDIT REQUEST: ${prompt}\n\nPlease make these changes while maintaining the overall style and brand consistency.`,
        });
      }
    } else {
      // For new generation, add logo reference
      if (brand && includeLogoReference) {
        const bestLogoUrl = getBestLogoUrl(brand);
        if (bestLogoUrl) {
          const logoData = await fetchImageAsBase64(bestLogoUrl);
          if (logoData) {
            parts.push({
              text: "Here is the brand's logo. Use this as a visual style reference:",
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

      // Add backdrop reference
      if (brand?.backdrops?.length) {
        const backdropData = await fetchImageAsBase64(brand.backdrops[0].url);
        if (backdropData) {
          parts.push({
            text: "Here is an example of the brand's visual style:",
          });
          parts.push({
            inline_data: {
              mime_type: backdropData.mimeType,
              data: backdropData.data,
            },
          });
        }
      }

      // Add the main prompt
      parts.push({ text: enhancedPrompt });
    }

    // Call Gemini API
    console.log("Calling Gemini API...");
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
    console.log("Gemini response structure:", JSON.stringify(geminiData, null, 2));

    // Check for errors or blocked content
    if (geminiData.candidates?.[0]?.finishReason) {
      const finishReason = geminiData.candidates[0].finishReason;
      if (finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
        console.error("Gemini finish reason:", finishReason);
        throw new Error(`Gemini API finished with reason: ${finishReason}`);
      }
    }

    // Check for safety ratings
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
        console.log("Part type:", part.text ? 'text' : part.inlineData ? 'inlineData' : 'unknown');
        if (part.text) {
          textResponse = part.text;
          console.log("Text response:", textResponse.substring(0, 100));
        } else if (part.inlineData?.data) {
          imageBase64 = part.inlineData.data;
          console.log("Image data found, length:", part.inlineData.data.length);
        } else if (part.inline_data?.data) {
          // Alternative property name
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
        ? `No image generated from Gemini API. Text response: ${textResponse.substring(0, 200)}`
        : "No image generated from Gemini API. No text response either.";
      console.error(errorMsg);
      console.error("Full Gemini response:", JSON.stringify(geminiData, null, 2));
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
        // Add to conversation and increment edit count
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

        if (currentImage) {
          updateData.conversation = [...(currentImage.conversation || []), assistantMessage];
          updateData.edit_count = (currentImage.edit_count || 0) + 1;
          
          // Save previous version to history before updating
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
