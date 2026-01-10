import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const GPT_MODEL = "gpt-5.2-chat-latest";  // GPT-5.2 for style analysis

// Available tags structure
const AVAILABLE_TAGS = {
  mood: [
    'minimalist', 'bold', 'corporate', 'creative', 'modern', 
    'vintage', 'playful', 'elegant', 'tech', 'lifestyle', 
    'abstract', 'geometric'
  ],
  visualType: [
    'illustration-based', 'real-people', 'product-screen', 
    'product-photo', 'lifestyle-photo', 'icon-based', 
    'typography-focused', 'mixed-media', 'pattern-based', '3d-rendered'
  ],
  contentFormat: [
    'before-after', 'testimonial', 'comparison', 'step-by-step', 
    'infographic', 'quote', 'checklist', 'timeline', 
    'hero-banner', 'carousel', 'single-focus'
  ],
  businessModel: ['B2B', 'B2C', 'D2C/e-commerce'],
  industry: [
    'Finance', 'Fashion', 'Tech', 'Healthcare', 
    'Food & Beverage', 'Real Estate', 'Education', 'Entertainment',
    'Travel', 'Automotive', 'Beauty', 'Sports', 'Non-profit'
  ]
};

interface StyleAnalysisResult {
  tags: {
    mood?: string[];
    visualType?: string[];
    contentFormat?: string[];
    businessModel?: string[];
    industry?: string[];
  };
  style_description: string;
}

Deno.serve(async (req: Request) => {
  const logger = createLogger('analyze-style');
  const requestId = logger.generateRequestId();
  const startTime = performance.now();
  
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    logger.setContext({ request_id: requestId });
    const { imageUrl, styleId } = await req.json();

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: "imageUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the tag list for the prompt
    const allTagsList = Object.entries(AVAILABLE_TAGS)
      .map(([group, tags]) => `${group}: ${tags.join(', ')}`)
      .join('\n');

    const systemPrompt = `You are an expert design analyst. Analyze the provided design image and return:
1. Relevant tags from the available tag list (select only tags that clearly apply)
2. A one-line abstract style description (describe the overall style/aesthetic, not specific design details)

Available tags (select only relevant ones):
${allTagsList}

Return a JSON object with:
- tags: An object with arrays of selected tags for each category (mood, visualType, contentFormat, businessModel, industry)
- style_description: A one-line abstract description of the design style (e.g., "Modern minimalist aesthetic with clean typography and subtle gradients")`;

    const userMessage = `Analyze this design image and provide tags and style description.`;

    console.log("Calling GPT-4o for style analysis...");
    
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: GPT_MODEL,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: userMessage
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, response.statusText);
      console.error("Error details:", errorText);
      return new Response(
        JSON.stringify({ error: `OpenAI API error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error("No content in OpenAI response");
      return new Response(
        JSON.stringify({ error: "No response from OpenAI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let analysisResult: StyleAnalysisResult;
    try {
      analysisResult = JSON.parse(content) as StyleAnalysisResult;
    } catch (parseError) {
      console.error("Failed to parse OpenAI response:", parseError);
      console.error("Content:", content.substring(0, 500));
      return new Response(
        JSON.stringify({ error: "Failed to parse analysis result" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate and clean tags (ensure they're from the available list)
    const validatedTags: StyleAnalysisResult['tags'] = {};
    
    for (const [group, availableTags] of Object.entries(AVAILABLE_TAGS)) {
      const providedTags = analysisResult.tags[group as keyof typeof analysisResult.tags];
      if (providedTags && Array.isArray(providedTags)) {
        const validTags = providedTags.filter(tag => 
          availableTags.includes(tag)
        );
        if (validTags.length > 0) {
          validatedTags[group as keyof typeof validatedTags] = validTags;
        }
      }
    }

    const result = {
      tags: validatedTags,
      style_description: analysisResult.style_description || ""
    };

    // If styleId is provided, update the style in the database
    if (styleId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const { error: updateError } = await supabase
        .from("styles")
        .update({
          tags: result.tags,
          style_description: result.style_description,
          updated_at: new Date().toISOString(),
        })
        .eq("id", styleId);

      if (updateError) {
        console.error("Failed to update style:", updateError);
        // Still return the result even if update fails
      }
    }

    const duration = performance.now() - startTime;
    logger.info("Style analysis completed", {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const duration = performance.now() - startTime;
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    // Log to Axiom
    logger.error("Error analyzing style", errorObj, {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    // Send to Sentry
    await captureException(errorObj, {
      function_name: 'analyze-style',
      request_id: requestId,
    });

    return new Response(
      JSON.stringify({ error: errorObj.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});




















