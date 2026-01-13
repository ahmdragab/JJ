import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { getUserIdFromRequest, verifyBrandOwnership, unauthorizedResponse, forbiddenResponse, isServiceRoleRequest } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

// =============================================================================
// ANALYZE-AD-PERSONALITY EDGE FUNCTION
// =============================================================================
// Analyzes a brand's website screenshot using GPT-4o to extract observable
// visual traits that inform ad generation style.
// =============================================================================

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const logger = createLogger("analyze-ad-personality");

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface AdPersonality {
  visual_approach: 'photography' | 'illustration' | '3D' | 'clean_UI' | 'abstract' | 'mixed';
  human_presence: 'prominent' | 'subtle' | 'none';
  color_treatment: 'bold_saturated' | 'muted_pastel' | 'monochrome' | 'gradient_heavy';
  composition: 'centered' | 'asymmetric' | 'editorial' | 'grid' | 'chaotic';
  copy_style: 'punchy_minimal' | 'data_driven' | 'storytelling' | 'conversational';
  tone: 'serious' | 'playful' | 'provocative' | 'inspirational';
  imagery_subjects: string[];
}

interface AnalyzeRequest {
  brandId: string;
  screenshotUrl?: string;  // Optional - will fetch from brand if not provided
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
// GPT-4o ANALYSIS
// =============================================================================

async function analyzeWithGPT4o(screenshotUrl: string): Promise<AdPersonality> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  const systemPrompt = `You are a brand and advertising analyst. You analyze website screenshots to extract observable visual traits that would inform how ads should be designed for this brand.

Your task is to analyze the website screenshot and return a JSON object with these specific traits:

1. visual_approach: What visual style dominates?
   - "photography": Real photos are primary (products, lifestyle, people)
   - "illustration": Custom illustrations, icons, or graphics dominate
   - "3D": 3D renders, abstract shapes, or dimensional graphics
   - "clean_UI": Minimal, interface-focused, product screenshots
   - "abstract": Abstract patterns, shapes, or artistic elements
   - "mixed": Clear combination of multiple approaches

2. human_presence: How are people shown?
   - "prominent": People are front and center, faces visible
   - "subtle": People appear but aren't the focus (hands, silhouettes)
   - "none": No people visible, product/graphic focused

3. color_treatment: How are colors used?
   - "bold_saturated": Vibrant, high-saturation colors
   - "muted_pastel": Soft, desaturated, or pastel palette
   - "monochrome": Single color family or black/white dominated
   - "gradient_heavy": Heavy use of gradients and color transitions

4. composition: How is content arranged?
   - "centered": Symmetric, centered layouts
   - "asymmetric": Dynamic, off-center, interesting negative space
   - "editorial": Magazine-style, text-heavy, storytelling layouts
   - "grid": Structured grid systems, cards, tiles
   - "chaotic": Intentionally busy, overlapping, energetic

5. copy_style: What's the text/headline style?
   - "punchy_minimal": Short, bold headlines, minimal text
   - "data_driven": Numbers, stats, proof points prominent
   - "storytelling": Longer narrative copy, emotional language
   - "conversational": Casual, question-based, direct address

6. tone: Overall brand feeling?
   - "serious": Professional, corporate, trust-focused
   - "playful": Fun, whimsical, lighthearted
   - "provocative": Bold, challenging, attention-grabbing
   - "inspirational": Aspirational, motivating, empowering

7. imagery_subjects: List 3-5 main subjects you see (e.g., "products", "people", "landscapes", "UI_screenshots", "abstract_shapes", "lifestyle_scenes", "data_visualizations")

Return ONLY valid JSON matching this exact structure:
{
  "visual_approach": "...",
  "human_presence": "...",
  "color_treatment": "...",
  "composition": "...",
  "copy_style": "...",
  "tone": "...",
  "imagery_subjects": ["...", "..."]
}`;

  const userPrompt = "Analyze this website screenshot and extract the ad personality traits. Be decisive - pick the MOST dominant trait for each category, not the safest option.";

  console.log("[GPT-4o] Analyzing screenshot:", screenshotUrl.slice(0, 80));

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            {
              type: "image_url",
              image_url: {
                url: screenshotUrl,
                detail: "high"
              }
            }
          ]
        }
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[GPT-4o] API error:", errorText);
    throw new Error(`GPT-4o API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No content in GPT-4o response");
  }

  const parsed = JSON.parse(content) as AdPersonality;
  console.log("[GPT-4o] Analysis complete:", JSON.stringify(parsed).slice(0, 200));

  // Validate the response has all required fields
  const requiredFields = ['visual_approach', 'human_presence', 'color_treatment', 'composition', 'copy_style', 'tone', 'imagery_subjects'];
  for (const field of requiredFields) {
    if (!(field in parsed)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  return parsed;
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if this is a service-to-service call (from extract-brand-firecrawl)
    const isServiceCall = isServiceRoleRequest(req);

    // Parse request first so we can use brandId for logging
    const { brandId, screenshotUrl: providedScreenshot }: AnalyzeRequest = await req.json();

    if (!brandId) {
      return new Response(
        JSON.stringify({ error: "brandId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For service-to-service calls, skip user auth (trust the calling function)
    // For user calls, verify authentication and brand ownership
    if (!isServiceCall) {
      const { userId, error: authError } = await getUserIdFromRequest(req, supabase);

      if (authError || !userId) {
        return unauthorizedResponse(authError || "Authentication required", corsHeaders);
      }

      logger.setContext({ request_id: requestId, user_id: userId });

      // Verify brand ownership
      const { owned } = await verifyBrandOwnership(supabase, brandId, userId);
      if (!owned) {
        return forbiddenResponse("You do not have permission to analyze this brand", corsHeaders);
      }
    } else {
      logger.setContext({ request_id: requestId, service_call: true });
    }

    // Get brand data to fetch screenshot if not provided
    let screenshotUrl = providedScreenshot;

    if (!screenshotUrl) {
      const { data: brand, error: brandError } = await supabase
        .from('brands')
        .select('screenshot')
        .eq('id', brandId)
        .single();

      if (brandError || !brand?.screenshot) {
        return new Response(
          JSON.stringify({ error: "Brand screenshot not found. Please provide a screenshotUrl or ensure the brand has a screenshot." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      screenshotUrl = brand.screenshot;
    }

    logger.info("Analyzing ad personality", { brandId, screenshotUrl: screenshotUrl.slice(0, 50) });

    // Analyze with GPT-4o
    const adPersonality = await analyzeWithGPT4o(screenshotUrl);

    // Update brand's styleguide with ad_personality
    const { data: currentBrand, error: fetchError } = await supabase
      .from('brands')
      .select('styleguide')
      .eq('id', brandId)
      .single();

    if (fetchError) {
      console.error("[DB] Error fetching brand:", fetchError);
      throw new Error(`Database error: ${fetchError.message}`);
    }

    const updatedStyleguide = {
      ...(currentBrand?.styleguide || {}),
      ad_personality: adPersonality,
    };

    const { error: updateError } = await supabase
      .from('brands')
      .update({ styleguide: updatedStyleguide })
      .eq('id', brandId);

    if (updateError) {
      console.error("[DB] Error updating brand:", updateError);
      throw new Error(`Database error: ${updateError.message}`);
    }

    logger.info("Ad personality analysis complete", {
      brandId,
      visual_approach: adPersonality.visual_approach,
      tone: adPersonality.tone,
    });

    return new Response(
      JSON.stringify({
        success: true,
        ad_personality: adPersonality,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    console.error("[analyze-ad-personality] Error:", error);
    captureException(error);

    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({
        error: "Failed to analyze ad personality",
        message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
