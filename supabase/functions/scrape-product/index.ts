import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { getUserIdFromRequest, verifyBrandOwnership, unauthorizedResponse, forbiddenResponse } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { validateExternalUrl } from "../_shared/url-validation.ts";

// =============================================================================
// SCRAPE-PRODUCT EDGE FUNCTION
// =============================================================================
// Scrapes product data from a URL using Firecrawl, enriches with GPT,
// and stores in the products table.
// =============================================================================

// API Configuration
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Logger
const logger = createLogger("scrape-product");

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface ScrapeProductRequest {
  productUrl: string;
  brandId: string;
}

interface FirecrawlExtractedProduct {
  name?: string;
  description?: string;
  price?: number;
  currency?: string;
  sale_price?: number;
  images?: string[];
  category?: string;
  brand?: string;
  sku?: string;
  availability?: string;
}

interface GPTEnrichment {
  short_description: string;
  key_features: string[];
  value_proposition: string;
  ad_angles: Array<{
    angle: string;
    headline_idea: string;
  }>;
  suggested_category?: string;
}

interface ProductImage {
  url: string;
  alt?: string;
  is_primary: boolean;
}

// =============================================================================
// CORS HELPER
// =============================================================================

function getCors(request: Request): Record<string, string> {
  return {
    ...getCorsHeaders(request),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

// =============================================================================
// FIRECRAWL PRODUCT SCRAPING
// =============================================================================

async function scrapeProductWithFirecrawl(productUrl: string): Promise<{
  product: FirecrawlExtractedProduct;
  markdown?: string;
}> {
  if (!FIRECRAWL_API_KEY) {
    throw new Error("FIRECRAWL_API_KEY environment variable is not set");
  }

  const targetUrl = productUrl.startsWith("http") ? productUrl : `https://${productUrl}`;

  // Define extraction schema for product data
  const extractSchema = {
    type: "object",
    properties: {
      name: { type: "string", description: "Product name/title" },
      description: { type: "string", description: "Full product description" },
      price: { type: "number", description: "Current price as a number (without currency symbol)" },
      currency: { type: "string", description: "Currency code (USD, EUR, etc.)" },
      sale_price: { type: "number", description: "Sale/discounted price if available" },
      images: {
        type: "array",
        items: { type: "string" },
        description: "Array of product image URLs"
      },
      category: { type: "string", description: "Product category or type" },
      brand: { type: "string", description: "Brand name if visible" },
      sku: { type: "string", description: "SKU or product ID if visible" },
      availability: { type: "string", description: "In stock, out of stock, etc." }
    },
    required: ["name"]
  };

  // Call Firecrawl with retry logic
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Firecrawl] Attempt ${attempt}/${maxRetries} for ${targetUrl}`);

      const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: targetUrl,
          formats: ["extract", "markdown"],
          extract: {
            schema: extractSchema
          },
          waitFor: 3000,
          timeout: 30000,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log("[Firecrawl] Success:", JSON.stringify(data.data?.extract || {}).slice(0, 500));

        return {
          product: data.data?.extract || {},
          markdown: data.data?.markdown,
        };
      }

      const errorText = await response.text();
      const status = response.status;

      // Retry on transient errors
      if ((status === 502 || status === 503 || status === 504) && attempt < maxRetries) {
        const delay = 2000 * attempt;
        console.warn(`[Firecrawl] Status ${status}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw new Error(`Firecrawl API error: ${status} - ${errorText}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        const delay = 2000 * attempt;
        console.warn(`[Firecrawl] Error: ${lastError.message}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  throw lastError || new Error("Failed to scrape product after retries");
}

// =============================================================================
// GPT ENRICHMENT
// =============================================================================

async function enrichProductWithGPT(
  product: FirecrawlExtractedProduct,
  markdown?: string
): Promise<GPTEnrichment> {
  if (!OPENAI_API_KEY) {
    console.warn("[GPT] No OpenAI API key, skipping enrichment");
    return {
      short_description: product.description?.slice(0, 150) || "",
      key_features: [],
      value_proposition: "",
      ad_angles: [],
    };
  }

  const prompt = `You are analyzing a product to prepare it for ad creation.

PRODUCT DATA:
Name: ${product.name || "Unknown"}
Description: ${product.description || "Not available"}
Price: ${product.price ? `${product.currency || "$"}${product.price}` : "Not listed"}
Category: ${product.category || "Unknown"}

${markdown ? `PAGE CONTENT (excerpt):\n${markdown.slice(0, 2000)}` : ""}

Analyze this product and return a JSON object with:

{
  "short_description": "A punchy 1-2 sentence description (max 150 chars)",
  "key_features": ["Feature 1", "Feature 2", "Feature 3"],  // 3-5 key selling points
  "value_proposition": "One compelling sentence about why someone should buy this",
  "ad_angles": [
    {"angle": "Problem-Solution", "headline_idea": "Tired of X? Try Y"},
    {"angle": "Social Proof", "headline_idea": "Join thousands who..."},
    {"angle": "Urgency/Value", "headline_idea": "Get X for only $Y"}
  ],
  "suggested_category": "Category if not already known"
}

Be specific to THIS product. Make the ad angles compelling and varied.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a product marketing expert. Return only valid JSON." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[GPT] Error:", errorText);
      throw new Error(`GPT API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in GPT response");
    }

    const parsed = JSON.parse(content);
    console.log("[GPT] Enrichment complete");

    return {
      short_description: parsed.short_description || "",
      key_features: parsed.key_features || [],
      value_proposition: parsed.value_proposition || "",
      ad_angles: parsed.ad_angles || [],
      suggested_category: parsed.suggested_category,
    };
  } catch (error) {
    console.error("[GPT] Enrichment failed:", error);
    return {
      short_description: product.description?.slice(0, 150) || "",
      key_features: [],
      value_proposition: "",
      ad_angles: [],
    };
  }
}

// =============================================================================
// IMAGE PROCESSING
// =============================================================================

async function downloadAndStoreImages(
  imageUrls: string[],
  brandId: string,
  productId: string,
  supabase: ReturnType<typeof createClient>
): Promise<ProductImage[]> {
  const storedImages: ProductImage[] = [];
  const maxImages = 5; // Limit to 5 images per product

  for (let i = 0; i < Math.min(imageUrls.length, maxImages); i++) {
    const imageUrl = imageUrls[i];

    try {
      // Skip data URIs and invalid URLs
      if (!imageUrl || imageUrl.startsWith("data:") || !imageUrl.startsWith("http")) {
        console.log(`[Images] Skipping invalid URL: ${imageUrl?.slice(0, 50)}`);
        continue;
      }

      console.log(`[Images] Downloading ${i + 1}/${Math.min(imageUrls.length, maxImages)}: ${imageUrl.slice(0, 80)}`);

      // Download image
      const response = await fetch(imageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; JJBot/1.0)",
        },
      });

      if (!response.ok) {
        console.warn(`[Images] Failed to download: ${response.status}`);
        // Store original URL as fallback
        storedImages.push({
          url: imageUrl,
          is_primary: i === 0,
        });
        continue;
      }

      const contentType = response.headers.get("content-type") || "image/jpeg";
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      // Determine file extension
      let extension = "jpg";
      if (contentType.includes("png")) extension = "png";
      else if (contentType.includes("webp")) extension = "webp";
      else if (contentType.includes("gif")) extension = "gif";

      // Upload to Supabase Storage
      const storagePath = `${brandId}/products/${productId}/${i + 1}.${extension}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("brand-images")
        .upload(storagePath, bytes, {
          contentType,
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        console.warn(`[Images] Upload failed:`, uploadError);
        storedImages.push({
          url: imageUrl,
          is_primary: i === 0,
        });
        continue;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("brand-images")
        .getPublicUrl(uploadData.path);

      storedImages.push({
        url: urlData.publicUrl,
        is_primary: i === 0,
      });

      console.log(`[Images] Stored: ${urlData.publicUrl}`);
    } catch (error) {
      console.error(`[Images] Error processing ${imageUrl}:`, error);
      // Store original URL as fallback
      storedImages.push({
        url: imageUrl,
        is_primary: i === 0,
      });
    }
  }

  return storedImages;
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const corsHeaders = getCors(req);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    logger.setContext({ request_id: requestId });

    // Authenticate user
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { userId, error: authError } = await getUserIdFromRequest(req, supabase);

    if (authError || !userId) {
      return unauthorizedResponse(authError || "Authentication required", corsHeaders);
    }

    logger.setContext({ request_id: requestId, user_id: userId });

    // Parse request
    const { productUrl, brandId }: ScrapeProductRequest = await req.json();

    if (!productUrl) {
      return new Response(
        JSON.stringify({ error: "productUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate URL to prevent SSRF attacks (blocks internal IPs, localhost, cloud metadata)
    const urlValidation = validateExternalUrl(productUrl);
    if (!urlValidation.valid) {
      console.warn(`[Security] SSRF attempt blocked: ${productUrl} - ${urlValidation.error}`);
      return new Response(
        JSON.stringify({ error: `Invalid URL: ${urlValidation.error}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!brandId) {
      return new Response(
        JSON.stringify({ error: "brandId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify brand ownership
    const { owned } = await verifyBrandOwnership(supabase, brandId, userId);
    if (!owned) {
      return forbiddenResponse("You do not have permission to add products to this brand", corsHeaders);
    }

    logger.info("Scraping product", { productUrl, brandId });

    // Generate product ID upfront for image storage
    const productId = crypto.randomUUID();

    // Step 1: Scrape with Firecrawl
    console.log("[Scrape] Starting Firecrawl extraction...");
    const { product: scrapedProduct, markdown } = await scrapeProductWithFirecrawl(productUrl);

    if (!scrapedProduct.name) {
      return new Response(
        JSON.stringify({
          error: "Could not extract product name from the page. Please check the URL is a product page.",
          code: "EXTRACTION_FAILED"
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[Scrape] Product found:", scrapedProduct.name);

    // Step 2: Enrich with GPT
    console.log("[Enrich] Starting GPT enrichment...");
    const enrichment = await enrichProductWithGPT(scrapedProduct, markdown);

    // Step 3: Process images
    console.log("[Images] Processing product images...");
    const images = await downloadAndStoreImages(
      scrapedProduct.images || [],
      brandId,
      productId,
      supabase
    );

    // Step 4: Insert into database
    console.log("[DB] Inserting product...");
    const productRecord = {
      id: productId,
      brand_id: brandId,
      user_id: userId,
      name: scrapedProduct.name,
      description: scrapedProduct.description || null,
      short_description: enrichment.short_description || null,
      price: scrapedProduct.price || null,
      currency: scrapedProduct.currency || "USD",
      sale_price: scrapedProduct.sale_price || null,
      images: images,
      category: scrapedProduct.category || enrichment.suggested_category || null,
      tags: [],
      key_features: enrichment.key_features,
      value_proposition: enrichment.value_proposition || null,
      ad_angles: enrichment.ad_angles,
      source_url: productUrl,
      status: enrichment.key_features.length > 0 ? "enriched" : "scraped",
    };

    const { data: insertedProduct, error: insertError } = await supabase
      .from("products")
      .insert(productRecord)
      .select()
      .single();

    if (insertError) {
      console.error("[DB] Insert error:", insertError);
      throw new Error(`Database error: ${insertError.message}`);
    }

    logger.info("Product scraped successfully", {
      productId: insertedProduct.id,
      name: insertedProduct.name,
      status: insertedProduct.status,
      imageCount: images.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        product: insertedProduct
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    console.error("[scrape-product] Error:", error);
    captureException(error);

    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({
        error: "Failed to scrape product",
        message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
