import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore - npm: imports work in Deno runtime
import BrandDev from "npm:brand.dev";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Brand.dev API configuration
// To set up:
// 1. Sign up at https://www.brand.dev/signup to get your API key
// 2. Set the BRAND_DEV_API_KEY environment variable in your Supabase project:
//    - Go to Supabase Dashboard > Project Settings > Edge Functions > Secrets
//    - Add: BRAND_DEV_API_KEY = your-api-key-here
const BRAND_DEV_API_KEY = Deno.env.get("BRAND_DEV_API_KEY");

interface BrandDevLogo {
  url?: string;
  group?: number;
  type?: string;
  mode?: string;
  colors?: { hex?: string; name?: string }[];
  resolution?: { width?: number; height?: number; aspect_ratio?: number };
}

interface BrandDevBackdrop {
  url?: string;
  colors?: { hex?: string; name?: string }[];
  resolution?: { width?: number; height?: number; aspect_ratio?: number };
}

interface BrandDevColor {
  hex?: string;
  name?: string;
  type?: string;
}

interface BrandDevTypography {
  family?: string;
  type?: string;
  weight?: string;
}

interface BrandDevResponse {
  brand?: {
    title?: string;
    name?: string;
    description?: string;
    slogan?: string;
    logos?: BrandDevLogo[] | { primary?: string; secondary?: string; icon?: string; [key: string]: string | undefined };
    colors?: BrandDevColor[] | { primary?: string; secondary?: string; background?: string; text?: string; [key: string]: string | undefined };
    typography?: BrandDevTypography[] | { heading?: string; body?: string; [key: string]: string | undefined };
    backdrops?: BrandDevBackdrop[];
    [key: string]: unknown;
  };
  error?: string;
}

function mapBrandDevToOurFormat(brandDevData: BrandDevResponse): {
  name: string;
  slogan?: string;
  logos: { primary?: string; secondary?: string; icon?: string };
  all_logos: Array<{ url: string; type?: string; mode?: string }>;
  backdrops: Array<{ url: string }>;
  colors: {
    primary?: string;
    secondary?: string;
    background?: string;
    surface?: string;
    text_primary?: string;
    text_on_primary?: string;
  };
  fonts: { heading?: string; body?: string };
  voice: {
    formality?: string;
    energy?: string;
    playful?: boolean;
    adjectives?: string[];
    keywords?: string[];
  };
} {
  const brand = brandDevData.brand || {};

  // Extract brand name
  const brandName = brand.title || brand.name || "";

  // Extract logos - handle both array and object formats
  let logos = { primary: undefined as string | undefined, secondary: undefined as string | undefined, icon: undefined as string | undefined };
  let all_logos: Array<{ url: string; type?: string; mode?: string }> = [];
  
  if (Array.isArray(brand.logos)) {
    // Capture all logos with their metadata
    all_logos = brand.logos.map((logo: BrandDevLogo) => ({
      url: logo.url || "",
      type: logo.type,
      mode: logo.mode,
    })).filter(logo => logo.url);

    // Find specific logo types - Brand.dev uses "logo" for primary and "icon" for icon
    const primaryLogo = brand.logos.find((logo: BrandDevLogo) => logo.type === "logo");
    const iconLogo = brand.logos.find((logo: BrandDevLogo) => logo.type === "icon");
    // Also check for dark/light mode variants
    const darkLogo = brand.logos.find((logo: BrandDevLogo) => logo.mode === "dark");
    const lightLogo = brand.logos.find((logo: BrandDevLogo) => logo.mode === "light");
    
    logos = {
      primary: primaryLogo?.url || lightLogo?.url || brand.logos[0]?.url,
      secondary: darkLogo?.url,
      icon: iconLogo?.url,
    };
  } else if (brand.logos && typeof brand.logos === "object") {
    // If logos is an object
    logos = {
      primary: (brand.logos as { primary?: string }).primary,
      secondary: (brand.logos as { secondary?: string }).secondary,
      icon: (brand.logos as { icon?: string }).icon,
    };
  }

  // Extract backdrops
  let backdrops: Array<{ url: string }> = [];
  if (Array.isArray(brand.backdrops)) {
    backdrops = brand.backdrops.map((backdrop: BrandDevBackdrop) => ({
      url: backdrop.url || "",
    })).filter(backdrop => backdrop.url);
  }

  // Extract colors - handle both array and object formats
  let colors = {
    primary: undefined as string | undefined,
    secondary: undefined as string | undefined,
    background: "#FFFFFF" as string,
    surface: "#F8FAFC" as string,
    text_primary: "#0F172A" as string,
    text_on_primary: "#FFFFFF" as string,
  };

  if (Array.isArray(brand.colors)) {
    // If colors is an array, find by name or type
    const primaryColor = brand.colors.find((color: BrandDevColor) => 
      color.name?.toLowerCase() === "primary" || color.type?.toLowerCase() === "primary"
    );
    const secondaryColor = brand.colors.find((color: BrandDevColor) => 
      color.name?.toLowerCase() === "secondary" || color.type?.toLowerCase() === "secondary"
    );
    const backgroundColor = brand.colors.find((color: BrandDevColor) => 
      color.name?.toLowerCase() === "background" || color.type?.toLowerCase() === "background"
    );
    const textColor = brand.colors.find((color: BrandDevColor) => 
      color.name?.toLowerCase().includes("text") || color.type?.toLowerCase().includes("text")
    );

    colors = {
      primary: primaryColor?.hex || brand.colors[0]?.hex,
      secondary: secondaryColor?.hex || brand.colors[1]?.hex,
      background: backgroundColor?.hex || "#FFFFFF",
      surface: "#F8FAFC",
      text_primary: textColor?.hex || "#0F172A",
      text_on_primary: "#FFFFFF",
    };
  } else if (brand.colors && typeof brand.colors === "object") {
    // If colors is an object
    const colorsObj = brand.colors as { primary?: string; secondary?: string; background?: string; text?: string; [key: string]: string | undefined };
    colors = {
      primary: colorsObj.primary,
      secondary: colorsObj.secondary,
      background: colorsObj.background || "#FFFFFF",
      surface: "#F8FAFC",
      text_primary: colorsObj.text || "#0F172A",
      text_on_primary: "#FFFFFF",
    };
  }

  // Extract fonts - handle both array and object formats
  let fonts = { heading: undefined as string | undefined, body: undefined as string | undefined };

  if (Array.isArray(brand.typography)) {
    const headingFont = brand.typography.find((font: BrandDevTypography) => 
      font.type?.toLowerCase() === "heading" || font.type?.toLowerCase() === "headline"
    );
    const bodyFont = brand.typography.find((font: BrandDevTypography) => 
      font.type?.toLowerCase() === "body" || font.type?.toLowerCase() === "text"
    );

    fonts = {
      heading: headingFont?.family || brand.typography[0]?.family,
      body: bodyFont?.family || brand.typography[0]?.family,
    };
  } else if (brand.typography && typeof brand.typography === "object") {
    const typographyObj = brand.typography as { heading?: string; body?: string; [key: string]: string | undefined };
    fonts = {
      heading: typographyObj.heading,
      body: typographyObj.body,
    };
  }

  // Extract brand voice - try to infer from description if available
  const description = brand.description || "";
  const voice = {
    formality: inferFormality(description),
    energy: inferEnergy(description),
    playful: inferPlayful(description),
    adjectives: extractAdjectives(description),
    keywords: extractKeywords(description),
  };

  // Extract slogan
  const slogan = brand.slogan;

  return {
    name: brandName,
    slogan,
    logos,
    all_logos,
    backdrops,
    colors,
    fonts,
    voice,
  };
}

function inferFormality(description: string): string {
  const lower = description.toLowerCase();
  if (lower.includes("casual") || lower.includes("friendly") || lower.includes("relaxed")) {
    return "casual";
  }
  if (lower.includes("professional") || lower.includes("enterprise") || lower.includes("corporate")) {
    return "professional";
  }
  return "professional";
}

function inferEnergy(description: string): string {
  const lower = description.toLowerCase();
  if (lower.includes("dynamic") || lower.includes("energetic") || lower.includes("fast")) {
    return "high";
  }
  if (lower.includes("calm") || lower.includes("peaceful") || lower.includes("serene")) {
    return "low";
  }
  return "medium";
}

function inferPlayful(description: string): boolean {
  const lower = description.toLowerCase();
  return lower.includes("fun") || lower.includes("playful") || lower.includes("creative");
}

function extractAdjectives(description: string): string[] {
  const commonAdjectives = [
    "modern", "innovative", "reliable", "trusted", "creative", "professional",
    "dynamic", "efficient", "scalable", "user-friendly", "cutting-edge"
  ];
  const lower = description.toLowerCase();
  return commonAdjectives.filter(adj => lower.includes(adj)).slice(0, 5);
}

function extractKeywords(description: string): string[] {
  // Simple keyword extraction - take important words
  const words = description.toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 4 && !["that", "this", "with", "from", "their", "about"].includes(w));
  return [...new Set(words)].slice(0, 5);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { url, brandId } = await req.json();

    // brandId is optional - when not provided, we just return extracted data without DB update
    if (!url) {
      return new Response(
        JSON.stringify({ error: "Missing required field: url" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!BRAND_DEV_API_KEY) {
      return new Response(
        JSON.stringify({ error: "BRAND_DEV_API_KEY environment variable is not set" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const domain = new URL(url).hostname.replace("www.", "");

    // Use Brand.dev SDK to retrieve brand data, fonts, and styleguide
    let brandDevData: BrandDevResponse | null = null;
    let fontsData: any = null;
    let styleguideData: any = null;
    
    try {
      if (!BRAND_DEV_API_KEY) {
        throw new Error("BRAND_DEV_API_KEY is not set");
      }

      const client = new BrandDev({
        apiKey: BRAND_DEV_API_KEY,
      });

      // Helper function to retry with exponential backoff
      const retryWithBackoff = async <T>(
        fn: () => Promise<T>,
        maxRetries = 3,
        baseDelay = 1000
      ): Promise<T> => {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            return await fn();
          } catch (error: any) {
            const isRateLimit = error?.status === 429 || error?.message?.includes('rate limit');
            const isLastAttempt = attempt === maxRetries - 1;

            if (!isRateLimit || isLastAttempt) {
              throw error;
            }

            // Exponential backoff: 1s, 2s, 4s
            const delay = baseDelay * Math.pow(2, attempt);
            console.log(`Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
        throw new Error("Max retries exceeded");
      };

      // Call endpoints sequentially with delays to respect rate limits (2 calls/second)
      // This ensures we stay within Basic plan limits
      console.log("Fetching brand data from Brand.dev...");

      // 1. Brand data (most important - call first)
      try {
        const result = await retryWithBackoff(() => client.brand.retrieve({ domain }));
        console.log("Brand.dev brand response received");
        brandDevData = {
          brand: (result as any).brand || result,
        } as BrandDevResponse;
      } catch (error) {
        console.error("Brand.dev brand API error:", error);
      }

      // Wait 500ms to respect rate limit (2 calls/second = 1 call per 500ms)
      await new Promise(resolve => setTimeout(resolve, 500));

      // 2. Fonts data
      try {
        fontsData = await retryWithBackoff(() => client.brand.fonts({ domain }));
        console.log("Brand.dev fonts response received");
      } catch (error) {
        console.error("Brand.dev fonts API error:", error);
        // Fonts are nice-to-have, continue without them
      }

      // Wait 500ms before next call
      await new Promise(resolve => setTimeout(resolve, 500));

      // 3. Styleguide data
      try {
        styleguideData = await retryWithBackoff(() => client.brand.styleguide({ domain }));
        console.log("Brand.dev styleguide response received");
      } catch (error) {
        console.error("Brand.dev styleguide API error:", error);
        // Styleguide is nice-to-have, continue without it
      }
      
      console.log("Brand.dev API calls completed");
    } catch (error) {
      console.error(`Brand.dev API error:`, error);
      
      // Fallback to basic extraction if API fails
      const fallbackData = {
        name: domain.split(".")[0],
        logos: {
          primary: `https://logo.clearbit.com/${domain}`,
        },
        colors: {
          primary: "#3B82F6",
          secondary: "#06B6D4",
          background: "#FFFFFF",
          surface: "#F8FAFC",
          text_primary: "#0F172A",
          text_on_primary: "#FFFFFF",
        },
        fonts: {
          heading: "Inter",
          body: "Inter",
        },
        voice: {
          formality: "professional",
          energy: "medium",
          playful: false,
          adjectives: ["modern", "reliable", "innovative"],
          keywords: ["technology", "business", "solutions"],
        },
      };

      return new Response(
        JSON.stringify({ success: true, data: fallbackData }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!brandDevData) {
      throw new Error("Failed to retrieve brand data");
    }

    if (brandDevData.error) {
      throw new Error(brandDevData.error);
    }

    // Map Brand.dev response to our format
    const extractedData = mapBrandDevToOurFormat(brandDevData);

    // Extract fonts from fonts API or styleguide API
    if (fontsData?.fonts && Array.isArray(fontsData.fonts) && fontsData.fonts.length > 0) {
      // Use the most used fonts from the fonts API
      const sortedFonts = fontsData.fonts.sort((a: any, b: any) => (b.percent_words || 0) - (a.percent_words || 0));
      
      // First font is likely heading, second is body (or use same if only one)
      const headingFont = sortedFonts[0]?.font;
      const bodyFont = sortedFonts.length > 1 ? sortedFonts[1]?.font : sortedFonts[0]?.font;
      
      if (headingFont) extractedData.fonts.heading = headingFont;
      if (bodyFont) extractedData.fonts.body = bodyFont;
      
      console.log("Fonts extracted from fonts API:", extractedData.fonts);
    } else if (styleguideData?.styleguide?.typography) {
      // Fallback to styleguide typography
      const typography = styleguideData.styleguide.typography;
      
      if (typography.headings?.h1?.fontFamily) {
        extractedData.fonts.heading = typography.headings.h1.fontFamily;
      }
      if (typography.p?.fontFamily) {
        extractedData.fonts.body = typography.p.fontFamily;
      }
      
      console.log("Fonts extracted from styleguide API:", extractedData.fonts);
    }

    // Store full styleguide data for potential future use
    if (styleguideData?.styleguide) {
      (extractedData as any).styleguide = styleguideData.styleguide;
    }

    // Ensure we have at least a name
    if (!extractedData.name) {
      extractedData.name = domain.split(".")[0];
    }

    // Ensure we have at least a logo fallback
    if (!extractedData.logos.primary) {
      extractedData.logos.primary = `https://logo.clearbit.com/${domain}`;
    }

    return new Response(
      JSON.stringify({ success: true, data: extractedData }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Brand extraction error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        details: error instanceof Error ? error.stack : undefined
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});