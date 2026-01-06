import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// API Configuration
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const GPT_MODEL = "gpt-4o-mini";

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
  };
}

interface SmartPreset {
  preset_id: string;
  prompt: string;
  why_relevant?: string;
}

interface PresetTemplate {
  id: string;
  icon: string;
  label: string;
  category: string;
  aspectRatio: '1:1' | '2:3' | '3:4' | '4:5' | '9:16' | '3:2' | '4:3' | '5:4' | '16:9' | '21:9';
}

// Available preset templates - All focused on ads with specific platforms and objectives
const PRESET_TEMPLATES: PresetTemplate[] = [
  { id: 'facebook-ad-awareness', icon: '📢', label: 'Facebook Ad - Brand Awareness', category: 'Advertising', aspectRatio: '4:5' },
  { id: 'facebook-ad-conversion', icon: '💰', label: 'Facebook Ad - Conversions', category: 'Advertising', aspectRatio: '1:1' },
  { id: 'instagram-ad-engagement', icon: '📱', label: 'Instagram Ad - Engagement', category: 'Advertising', aspectRatio: '1:1' },
  { id: 'instagram-ad-conversion', icon: '🎯', label: 'Instagram Ad - Conversions', category: 'Advertising', aspectRatio: '4:5' },
  { id: 'linkedin-ad-awareness', icon: '💼', label: 'LinkedIn Ad - Brand Awareness', category: 'Advertising', aspectRatio: '16:9' },
  { id: 'linkedin-ad-leadgen', icon: '📋', label: 'LinkedIn Ad - Lead Generation', category: 'Advertising', aspectRatio: '1:1' },
  { id: 'google-display-awareness', icon: '🔍', label: 'Google Display - Awareness', category: 'Advertising', aspectRatio: '16:9' },
  { id: 'google-display-conversion', icon: '🛒', label: 'Google Display - Conversions', category: 'Advertising', aspectRatio: '16:9' },
  { id: 'tiktok-ad-engagement', icon: '🎵', label: 'TikTok Ad - Engagement', category: 'Advertising', aspectRatio: '9:16' },
  { id: 'youtube-ad-awareness', icon: '▶️', label: 'YouTube Ad - Awareness', category: 'Advertising', aspectRatio: '16:9' },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildBrandContext(brand: Brand): string {
  const parts: string[] = [];
  
  parts.push(`BRAND: ${brand.name}`);
  if (brand.slogan) parts.push(`Tagline: "${brand.slogan}"`);
  if (brand.domain) parts.push(`Domain: ${brand.domain}`);
  
  if (brand.styleguide?.summary) {
    parts.push(`\nWHAT THIS BRAND DOES:\n${brand.styleguide.summary}`);
    parts.push(`\nThis description is essential - use it to understand what ${brand.name} does, their industry, and their target audience.`);
  }
  
  if (brand.voice) {
    parts.push(`\nBRAND VOICE & TONE:`);
    if (brand.voice.formality) parts.push(`- Formality: ${brand.voice.formality}`);
    if (brand.voice.energy) parts.push(`- Energy: ${brand.voice.energy}`);
    if (brand.voice.adjectives?.length) {
      parts.push(`- Adjectives: ${brand.voice.adjectives.join(', ')}`);
    }
    if (brand.voice.keywords?.length) {
      parts.push(`- Keywords: ${brand.voice.keywords.join(', ')}`);
    }
  }
  
  return parts.join('\n');
}

async function generatePresetsWithLLM(brand: Brand): Promise<SmartPreset[]> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }

  const brandContext = buildBrandContext(brand);
  const availablePresetIds = PRESET_TEMPLATES.map(p => p.id).join(', ');

  const systemPrompt = `You are a creative advertising strategist that generates personalized ad concepts for brands.

Your task: Generate 6-8 smart ad presets (image generation prompts) that are highly relevant to the given brand. Each preset must be for a SPECIFIC AD TYPE with a CLEAR OBJECTIVE and include a CREATIVE CONCEPT/IDEA related to what the brand does.

${brandContext}

CRITICAL REQUIREMENTS:
1. Each preset MUST be for an AD (not generic posts or banners)
2. Each preset must specify the PLATFORM (Facebook, Instagram, LinkedIn, Google, TikTok, YouTube) and OBJECTIVE (Awareness, Conversion, Engagement, Lead Gen)
3. Each prompt must include a SPECIFIC CREATIVE CONCEPT/IDEA that relates to what ${brand.name} does - not generic marketing slop
4. The creative concept should be tied to the brand's product/service, target audience, or unique value proposition
5. Match the brand's voice and tone exactly (${brand.voice?.formality || 'professional'} formality, ${brand.voice?.energy || 'moderate'} energy)
6. Use the brand name naturally: "${brand.name}"
7. Prompts should be 15-25 words, clear and direct
8. Consider the brand's industry, what they actually do, and their target audience
9. Each ad should have a clear creative angle/idea - think about what problem the brand solves, what makes them unique, or what their customers care about

EXAMPLES OF GOOD AD CONCEPTS:
- For a SaaS tool: "Facebook awareness ad showing how [brand] transforms chaotic workflows into organized productivity"
- For an e-commerce brand: "Instagram conversion ad featuring a customer's before/after transformation using [brand]'s product"
- For a service: "LinkedIn lead gen ad illustrating the hidden costs of not using [brand]'s expertise"

BAD EXAMPLES (too generic):
- "Create a Facebook ad for [brand]" ❌
- "Instagram post showcasing [brand]" ❌
- "LinkedIn banner for [brand]" ❌

You must respond with a valid JSON object with this structure:
{
  "presets": [
    {
      "preset_id": "facebook-ad-awareness",
      "prompt": "Facebook brand awareness ad showing [specific creative concept related to what brand does]",
      "why_relevant": "This creative concept connects to [specific aspect of brand/product] and targets [specific audience/need]"
    },
    ...
  ]
}

Available preset_ids: ${availablePresetIds}

Generate 6-8 ad presets with specific creative concepts. Each must have a clear idea behind it related to what ${brand.name} does, not generic marketing.`;

  const userMessage = `Generate 6-8 ad presets for ${brand.name}. Each preset must be for a specific ad platform/objective and include a creative concept/idea that relates to what ${brand.name} does - their product, service, or value proposition. Avoid generic marketing slop. Make each ad concept specific and relevant to the brand.`;

  console.log("Calling OpenAI to generate smart presets...");
  
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: GPT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7, // Some creativity but still focused
      max_tokens: 1200,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenAI API error:", response.status, response.statusText);
    console.error("Error details:", errorText);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  
  if (!content) {
    console.error("No content in OpenAI response. Full response:", JSON.stringify(data, null, 2));
    throw new Error("No content from OpenAI");
  }

  try {
    const parsed = JSON.parse(content);
    const presetsArray = parsed.presets || [];
    
    if (!Array.isArray(presetsArray) || presetsArray.length === 0) {
      throw new Error("Invalid presets format from LLM");
    }
    
    console.log(`Generated ${presetsArray.length} smart presets`);
    return presetsArray as SmartPreset[];
  } catch (parseError) {
    console.error("Failed to parse OpenAI response as JSON:", parseError);
    console.error("Content that failed to parse:", content.substring(0, 500));
    throw new Error("Failed to parse LLM response");
  }
}

function generateFallbackPresets(brand: Brand): Array<{ preset: PresetTemplate; prompt: string; whyRelevant?: string }> {
  const tone = brand.voice?.energy === 'high' ? 'energetic' : 
               brand.voice?.formality === 'professional' ? 'professional' : 
               'modern';
  
  const summary = brand.styleguide?.summary?.toLowerCase() || '';
  let creativeConcept = '';
  let whyRelevant = '';
  
  // Generate product-specific creative concepts based on brand type
  if (summary.includes('saas') || summary.includes('software') || summary.includes('app')) {
    creativeConcept = `showing how ${brand.name} transforms workflows and boosts productivity`;
    whyRelevant = 'Highlights the core value proposition of efficiency and productivity';
  } else if (summary.includes('e-commerce') || summary.includes('shop') || summary.includes('store')) {
    creativeConcept = `featuring a customer's transformation or success story with ${brand.name}'s products`;
    whyRelevant = 'Social proof and customer success drive conversions';
  } else if (summary.includes('service') || summary.includes('consulting') || summary.includes('agency')) {
    creativeConcept = `illustrating the problem ${brand.name} solves and the results clients achieve`;
    whyRelevant = 'Problem-solution framing resonates with service buyers';
  } else if (summary.includes('education') || summary.includes('course') || summary.includes('learning')) {
    creativeConcept = `showing the learning journey and outcomes students achieve with ${brand.name}`;
    whyRelevant = 'Outcome-focused messaging drives education conversions';
  } else if (brand.voice?.keywords?.length) {
    const keyword = brand.voice.keywords[0];
    creativeConcept = `highlighting how ${brand.name} delivers ${keyword} to customers`;
    whyRelevant = `Connects to your brand's core value: ${keyword}`;
  } else {
    creativeConcept = `showcasing ${brand.name}'s unique value proposition and customer benefits`;
    whyRelevant = 'Focuses on what makes your brand different';
  }
  
  // Select ad-focused templates
  const adTemplates = PRESET_TEMPLATES.filter(t => t.category === 'Advertising').slice(0, 6);
  
  return adTemplates.map(template => {
    // Extract objective from label
    const objective = template.label.includes('Awareness') ? 'brand awareness' :
                     template.label.includes('Conversion') ? 'conversions' :
                     template.label.includes('Engagement') ? 'engagement' :
                     template.label.includes('Lead') ? 'lead generation' : 'awareness';
    
    return {
      preset: template,
      prompt: `${template.label} ${creativeConcept} for ${brand.name}`,
      whyRelevant: whyRelevant || `Targets ${objective} with a concept relevant to your brand`,
    };
  });
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  const logger = createLogger('generate-smart-presets');
  const requestId = logger.generateRequestId();
  const startTime = performance.now();
  
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
    logger.setContext({ request_id: requestId });
    const { brandId } = await req.json();

    if (!brandId) {
      return new Response(
        JSON.stringify({ error: "Missing brandId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch brand data
    const { data: brandData, error: brandError } = await supabase
      .from("brands")
      .select("*")
      .eq("id", brandId)
      .single();

    if (brandError || !brandData) {
      console.error("Brand fetch error:", brandError);
      return new Response(
        JSON.stringify({ error: "Brand not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const brand = brandData as Brand;
    console.log(`Generating smart presets for brand: ${brand.name}`);

    let smartPresets: SmartPreset[] = [];
    let useFallback = false;

    // Try LLM generation first
    try {
      smartPresets = await generatePresetsWithLLM(brand);
    } catch (error) {
      console.error("LLM generation failed, using fallback:", error);
      useFallback = true;
    }

    // Map presets to final format
    const finalPresets = smartPresets.length > 0
      ? smartPresets.map(llmPreset => {
          const template = PRESET_TEMPLATES.find(t => t.id === llmPreset.preset_id);
          if (!template) return null;
          
          return {
            id: template.id,
            icon: template.icon,
            label: template.label,
            category: template.category,
            aspectRatio: template.aspectRatio,
            prompt: llmPreset.prompt,
            smartContext: llmPreset.why_relevant ? { whyRelevant: llmPreset.why_relevant } : undefined,
          };
        }).filter(Boolean)
      : generateFallbackPresets(brand).map(fallback => ({
          id: fallback.preset.id,
          icon: fallback.preset.icon,
          label: fallback.preset.label,
          category: fallback.preset.category,
          aspectRatio: fallback.preset.aspectRatio,
          prompt: fallback.prompt,
          smartContext: fallback.whyRelevant ? { whyRelevant: fallback.whyRelevant } : undefined,
        }));

    // Ensure we have at least 6 presets
    const presets = finalPresets.slice(0, 8);

    console.log(`Returning ${presets.length} presets (${useFallback ? 'fallback' : 'LLM-generated'})`);

    const duration = performance.now() - startTime;
    logger.info("Smart presets generation completed", {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    return new Response(
      JSON.stringify({
        success: true,
        presets,
        source: useFallback ? 'fallback' : 'llm',
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
    logger.error("Smart presets generation error", errorObj, {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    // Send to Sentry
    await captureException(errorObj, {
      function_name: 'generate-smart-presets',
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



















