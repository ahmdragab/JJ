import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

// Available preset templates
const PRESET_TEMPLATES: PresetTemplate[] = [
  { id: 'instagram-post', icon: '📱', label: 'Instagram Post', category: 'Social', aspectRatio: '1:1' },
  { id: 'linkedin-banner', icon: '💼', label: 'LinkedIn Banner', category: 'Professional', aspectRatio: '16:9' },
  { id: 'email-header', icon: '📧', label: 'Email Header', category: 'Marketing', aspectRatio: '16:9' },
  { id: 'instagram-story', icon: '📸', label: 'Instagram Story', category: 'Social', aspectRatio: '9:16' },
  { id: 'facebook-ad', icon: '📢', label: 'Facebook Ad', category: 'Advertising', aspectRatio: '4:5' },
  { id: 'twitter-post', icon: '🐦', label: 'Twitter Post', category: 'Social', aspectRatio: '16:9' },
  { id: 'youtube-thumbnail', icon: '▶️', label: 'YouTube Thumbnail', category: 'Video', aspectRatio: '16:9' },
  { id: 'product-showcase', icon: '🎯', label: 'Product Showcase', category: 'Product', aspectRatio: '1:1' },
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

  const systemPrompt = `You are a creative assistant that generates personalized image generation prompts for brands.

Your task: Generate 6-8 smart presets (image generation prompts) that are highly relevant to the given brand.

${brandContext}

IMPORTANT RULES:
1. Generate prompts that are SPECIFIC to what this brand does (use the brand description above)
2. Match the brand's voice and tone exactly (${brand.voice?.formality || 'professional'} formality, ${brand.voice?.energy || 'moderate'} energy)
3. Use the brand name naturally in prompts: "${brand.name}"
4. Make prompts actionable and specific (not generic like "create a post")
5. Each prompt should be for a different use case (social media, professional, marketing, etc.)
6. Prompts should be 10-20 words, clear and direct
7. Consider the brand's industry, target audience, and what they actually do
8. Be creative but stay true to the brand's identity

You must respond with a valid JSON object with this structure:
{
  "presets": [
    {
      "preset_id": "instagram-post",
      "prompt": "Create a vibrant Instagram post showcasing [brand name]'s latest features",
      "why_relevant": "Perfect for your energetic brand voice"
    },
    ...
  ]
}

Available preset_ids: ${availablePresetIds}

Generate 6-8 presets that are most relevant to this brand. Focus on what makes this brand unique and what they actually do.`;

  const userMessage = `Generate smart presets for ${brand.name}. Focus on what makes this brand unique and what they actually do based on the brand description above.`;

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
  let purpose = 'showcasing our brand';
  
  if (summary.includes('saas') || summary.includes('software') || summary.includes('app')) {
    purpose = 'showcasing our latest features';
  } else if (summary.includes('e-commerce') || summary.includes('shop') || summary.includes('store')) {
    purpose = 'highlighting our products';
  } else if (summary.includes('service') || summary.includes('consulting') || summary.includes('agency')) {
    purpose = 'showcasing our expertise';
  } else if (brand.voice?.keywords?.length) {
    purpose = `featuring ${brand.voice.keywords[0]}`;
  }
  
  return PRESET_TEMPLATES.slice(0, 6).map(template => ({
    preset: template,
    prompt: `Create a ${tone} ${template.label.toLowerCase()} ${purpose} for ${brand.name}`,
    whyRelevant: template.category === 'Professional' && brand.voice?.formality === 'professional' 
      ? 'Perfect for your professional tone'
      : undefined,
  }));
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

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
    console.error("Smart presets generation error:", error);

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














