import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const GPT_MODEL = "gpt-4o"; // Vision-capable model

interface BrandStyleProfile {
  layout_density: "minimal" | "medium" | "dense";
  whitespace: "high" | "medium" | "low";
  shape_language: string[]; // e.g., ["rounded cards", "sharp rectangles", "pills", "circles"]
  imagery_type: string[]; // e.g., ["flat illustration", "3D illustration", "product UI mockups", "real photography"]
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
  brand_archetype: string[]; // e.g., ["enterprise SaaS", "playful consumer app", "premium luxury"]
  design_elements: {
    shadows: "none" | "subtle" | "prominent";
    borders: "none" | "thin" | "thick";
    patterns: boolean;
    textures: boolean;
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { brandId, screenshotUrl, pageImageUrls } = await req.json();

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

    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are an expert brand design analyst. Analyze the provided website screenshot and homepage images to extract structured style information about the brand's visual design language.

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
  }
}

Be specific and accurate. Base your analysis on what you actually see in the images, not assumptions.`;

    // Build user message with images
    const imageContent: Array<{ type: string; image_url?: { url: string }; text?: string }> = [
      {
        type: "text",
        text: "Analyze the brand's website design. The first image is the homepage screenshot. Additional images are key homepage visuals."
      }
    ];

    // Add screenshot
    imageContent.push({
      type: "image_url",
      image_url: { url: screenshotUrl }
    });

    // Add up to 3 homepage images (if provided)
    const imagesToAnalyze = (pageImageUrls || []).slice(0, 3);
    for (const imgUrl of imagesToAnalyze) {
      imageContent.push({
        type: "image_url",
        image_url: { url: imgUrl }
      });
    }

    console.log(`Analyzing brand style for brandId: ${brandId} with ${1 + imagesToAnalyze.length} images`);

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
            content: imageContent
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 1000,
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

    let styleProfile: BrandStyleProfile;
    try {
      styleProfile = JSON.parse(content) as BrandStyleProfile;
    } catch (parseError) {
      console.error("Failed to parse OpenAI response:", parseError);
      console.error("Content:", content.substring(0, 500));
      return new Response(
        JSON.stringify({ error: "Failed to parse style profile" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate and normalize the response
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

    // Update brand in database with style profile
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get current styleguide
    const { data: brandData, error: fetchError } = await supabase
      .from("brands")
      .select("styleguide")
      .eq("id", brandId)
      .single();

    if (fetchError) {
      console.error("Failed to fetch brand:", fetchError);
      // Still return the result even if update fails
    } else {
      const currentStyleguide = (brandData?.styleguide as Record<string, unknown>) || {};
      const updatedStyleguide = {
        ...currentStyleguide,
        style_profile: validatedProfile,
      };

      const { error: updateError } = await supabase
        .from("brands")
        .update({
          styleguide: updatedStyleguide,
          updated_at: new Date().toISOString(),
        })
        .eq("id", brandId);

      if (updateError) {
        console.error("Failed to update brand style profile:", updateError);
        // Still return the result even if update fails
      } else {
        console.log("Successfully updated brand style profile");
      }
    }

    return new Response(
      JSON.stringify({ success: true, style_profile: validatedProfile }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error analyzing brand style:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

