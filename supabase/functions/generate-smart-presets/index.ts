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

interface AdPersonality {
  visual_approach?: 'photography' | 'illustration' | '3D' | 'clean_UI' | 'abstract' | 'mixed';
  human_presence?: 'prominent' | 'subtle' | 'none';
  color_treatment?: 'bold_saturated' | 'muted_pastel' | 'monochrome' | 'gradient_heavy';
  composition?: 'centered' | 'asymmetric' | 'editorial' | 'grid' | 'chaotic';
  copy_style?: 'punchy_minimal' | 'data_driven' | 'storytelling' | 'conversational';
  tone?: 'serious' | 'playful' | 'provocative' | 'inspirational';
  imagery_subjects?: string[];
}

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
    industry?: string;
    keyServices?: string[];
    colors?: {
      accent?: string;
      background?: string;
      text?: string;
    };
    ad_personality?: AdPersonality;
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

// Available preset templates - Diverse categories based on brand needs
const PRESET_TEMPLATES: PresetTemplate[] = [
  // Product & E-commerce
  { id: 'product-hero', icon: '✨', label: 'Product Hero Shot', category: 'Product', aspectRatio: '1:1' },
  { id: 'product-lifestyle', icon: '🏠', label: 'Lifestyle Product Shot', category: 'Product', aspectRatio: '4:5' },
  { id: 'product-flatlay', icon: '📐', label: 'Product Flat Lay', category: 'Product', aspectRatio: '1:1' },

  // Social Media
  { id: 'social-post', icon: '📱', label: 'Social Media Post', category: 'Social', aspectRatio: '1:1' },
  { id: 'social-story', icon: '📲', label: 'Story / Reel Cover', category: 'Social', aspectRatio: '9:16' },
  { id: 'social-carousel', icon: '🎠', label: 'Carousel Slide', category: 'Social', aspectRatio: '1:1' },

  // Advertising
  { id: 'ad-awareness', icon: '📢', label: 'Brand Awareness Ad', category: 'Advertising', aspectRatio: '4:5' },
  { id: 'ad-conversion', icon: '🎯', label: 'Conversion Ad', category: 'Advertising', aspectRatio: '1:1' },
  { id: 'ad-retargeting', icon: '🔄', label: 'Retargeting Ad', category: 'Advertising', aspectRatio: '1:1' },

  // Website & Digital
  { id: 'website-hero', icon: '🖥️', label: 'Website Hero Banner', category: 'Website', aspectRatio: '16:9' },
  { id: 'website-feature', icon: '💡', label: 'Feature Illustration', category: 'Website', aspectRatio: '16:9' },
  { id: 'email-header', icon: '📧', label: 'Email Header', category: 'Email', aspectRatio: '16:9' },

  // Brand & Abstract
  { id: 'brand-texture', icon: '🎨', label: 'Brand Texture / Pattern', category: 'Brand', aspectRatio: '1:1' },
  { id: 'brand-mood', icon: '🌈', label: 'Brand Mood Visual', category: 'Brand', aspectRatio: '16:9' },

  // Promotional
  { id: 'promo-sale', icon: '🏷️', label: 'Sale / Promotion', category: 'Promotional', aspectRatio: '1:1' },
  { id: 'promo-launch', icon: '🚀', label: 'Product Launch', category: 'Promotional', aspectRatio: '4:5' },
  { id: 'promo-seasonal', icon: '🎉', label: 'Seasonal Campaign', category: 'Promotional', aspectRatio: '1:1' },
];

// Map visual approach to relevant preset categories
const VISUAL_APPROACH_PRESETS: Record<string, string[]> = {
  'photography': ['product-hero', 'product-lifestyle', 'social-post', 'ad-awareness', 'ad-conversion', 'promo-launch'],
  'illustration': ['website-feature', 'brand-mood', 'social-carousel', 'email-header', 'ad-awareness'],
  '3D': ['product-hero', 'brand-texture', 'website-hero', 'ad-awareness', 'promo-launch'],
  'clean_UI': ['website-feature', 'website-hero', 'social-post', 'email-header', 'ad-conversion'],
  'abstract': ['brand-texture', 'brand-mood', 'website-hero', 'social-story', 'email-header'],
  'mixed': ['social-post', 'ad-awareness', 'website-hero', 'promo-sale', 'product-hero', 'brand-mood'],
};

// Map imagery subjects to additional relevant presets
const SUBJECT_PRESETS: Record<string, string[]> = {
  'products': ['product-hero', 'product-lifestyle', 'product-flatlay', 'promo-sale', 'promo-launch'],
  'people': ['ad-awareness', 'social-post', 'product-lifestyle', 'website-hero'],
  'lifestyle_scenes': ['product-lifestyle', 'social-post', 'ad-awareness', 'brand-mood'],
  'UI_screenshots': ['website-feature', 'website-hero', 'ad-conversion', 'social-carousel'],
  'abstract_shapes': ['brand-texture', 'brand-mood', 'email-header', 'website-hero'],
  'data_visualizations': ['website-feature', 'ad-conversion', 'social-carousel', 'email-header'],
  'landscapes': ['brand-mood', 'website-hero', 'social-story', 'ad-awareness'],
};

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
  }

  if (brand.styleguide?.industry) {
    parts.push(`Industry: ${brand.styleguide.industry}`);
  }

  if (brand.styleguide?.keyServices?.length) {
    parts.push(`Key Services/Products: ${brand.styleguide.keyServices.join(', ')}`);
  }

  // Add ad personality - this is the key differentiator
  const adPersonality = brand.styleguide?.ad_personality;
  if (adPersonality) {
    parts.push(`\nBRAND VISUAL PERSONALITY (extracted from their website):`);
    if (adPersonality.visual_approach) {
      parts.push(`- Visual Style: ${adPersonality.visual_approach.replace('_', ' ')}`);
    }
    if (adPersonality.human_presence) {
      parts.push(`- Human Presence: ${adPersonality.human_presence}`);
    }
    if (adPersonality.color_treatment) {
      parts.push(`- Color Treatment: ${adPersonality.color_treatment.replace(/_/g, ' ')}`);
    }
    if (adPersonality.composition) {
      parts.push(`- Composition Style: ${adPersonality.composition}`);
    }
    if (adPersonality.copy_style) {
      parts.push(`- Copy Style: ${adPersonality.copy_style.replace(/_/g, ' ')}`);
    }
    if (adPersonality.tone) {
      parts.push(`- Tone: ${adPersonality.tone}`);
    }
    if (adPersonality.imagery_subjects?.length) {
      parts.push(`- Common Imagery: ${adPersonality.imagery_subjects.join(', ')}`);
    }
  }

  if (brand.voice) {
    parts.push(`\nBRAND VOICE:`);
    if (brand.voice.formality) parts.push(`- Formality: ${brand.voice.formality}`);
    if (brand.voice.energy) parts.push(`- Energy: ${brand.voice.energy}`);
    if (brand.voice.adjectives?.length) {
      parts.push(`- Brand Adjectives: ${brand.voice.adjectives.join(', ')}`);
    }
    if (brand.voice.keywords?.length) {
      parts.push(`- Keywords: ${brand.voice.keywords.join(', ')}`);
    }
  }

  return parts.join('\n');
}

function selectRelevantPresets(brand: Brand): PresetTemplate[] {
  const adPersonality = brand.styleguide?.ad_personality;
  const relevantIds = new Set<string>();

  // If we have ad_personality, use it to select presets
  if (adPersonality) {
    // Add presets based on visual approach
    if (adPersonality.visual_approach && VISUAL_APPROACH_PRESETS[adPersonality.visual_approach]) {
      VISUAL_APPROACH_PRESETS[adPersonality.visual_approach].forEach(id => relevantIds.add(id));
    }

    // Add presets based on imagery subjects
    if (adPersonality.imagery_subjects?.length) {
      adPersonality.imagery_subjects.forEach(subject => {
        const normalizedSubject = subject.toLowerCase().replace(/\s+/g, '_');
        if (SUBJECT_PRESETS[normalizedSubject]) {
          SUBJECT_PRESETS[normalizedSubject].forEach(id => relevantIds.add(id));
        }
      });
    }
  }

  // If we got presets from ad_personality, use those
  if (relevantIds.size >= 6) {
    return PRESET_TEMPLATES.filter(p => relevantIds.has(p.id)).slice(0, 10);
  }

  // Fallback: use summary to guess brand type and select presets
  const summary = (brand.styleguide?.summary || '').toLowerCase();

  if (summary.includes('saas') || summary.includes('software') || summary.includes('platform') || summary.includes('app')) {
    // SaaS/Tech - focus on UI, features, website assets
    ['website-feature', 'website-hero', 'social-post', 'ad-conversion', 'email-header', 'brand-mood'].forEach(id => relevantIds.add(id));
  } else if (summary.includes('shop') || summary.includes('store') || summary.includes('product') || summary.includes('e-commerce') || summary.includes('retail')) {
    // E-commerce - focus on products
    ['product-hero', 'product-lifestyle', 'product-flatlay', 'promo-sale', 'ad-conversion', 'social-post'].forEach(id => relevantIds.add(id));
  } else if (summary.includes('agency') || summary.includes('consulting') || summary.includes('service')) {
    // Services - focus on brand awareness, trust
    ['ad-awareness', 'website-hero', 'social-post', 'brand-mood', 'email-header', 'promo-launch'].forEach(id => relevantIds.add(id));
  } else if (summary.includes('food') || summary.includes('restaurant') || summary.includes('cafe') || summary.includes('coffee')) {
    // Food & Beverage
    ['product-hero', 'product-lifestyle', 'social-post', 'social-story', 'promo-sale', 'ad-awareness'].forEach(id => relevantIds.add(id));
  } else {
    // Default mix - balanced selection
    ['social-post', 'ad-awareness', 'website-hero', 'brand-mood', 'promo-sale', 'email-header'].forEach(id => relevantIds.add(id));
  }

  return PRESET_TEMPLATES.filter(p => relevantIds.has(p.id)).slice(0, 10);
}

async function generatePresetsWithLLM(brand: Brand, relevantPresets: PresetTemplate[]): Promise<SmartPreset[]> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }

  const brandContext = buildBrandContext(brand);
  const adPersonality = brand.styleguide?.ad_personality;

  // Build visual style guidance based on ad_personality
  let visualGuidance = '';
  if (adPersonality) {
    const styleNotes: string[] = [];
    if (adPersonality.visual_approach) {
      styleNotes.push(`visual style should be ${adPersonality.visual_approach.replace('_', ' ')}`);
    }
    if (adPersonality.color_treatment) {
      styleNotes.push(`colors should feel ${adPersonality.color_treatment.replace(/_/g, ' ')}`);
    }
    if (adPersonality.tone) {
      styleNotes.push(`overall tone is ${adPersonality.tone}`);
    }
    if (adPersonality.composition) {
      styleNotes.push(`composition tends to be ${adPersonality.composition}`);
    }
    if (styleNotes.length > 0) {
      visualGuidance = `\nVISUAL STYLE TO MATCH: ${styleNotes.join(', ')}.`;
    }
  }

  // Build the available presets list with descriptions
  const presetDescriptions = relevantPresets.map(p => `- ${p.id}: ${p.label} (${p.aspectRatio})`).join('\n');

  const systemPrompt = `You are a creative director generating image prompts for ${brand.name}. Your prompts will be used to generate marketing images with AI.

${brandContext}
${visualGuidance}

YOUR TASK: Generate 6-8 image prompts that are SPECIFICALLY tailored to ${brand.name}. Each prompt must reference something SPECIFIC about this brand - their product, their industry, their customers, or their unique value.

AVAILABLE PRESET TYPES (choose from these):
${presetDescriptions}

CRITICAL RULES:
1. Every prompt MUST mention something specific from the brand description above
2. Reference their actual product/service, not generic placeholders
3. Match the brand's visual personality exactly
4. Each prompt should paint a clear mental picture - what does the viewer SEE?
5. Prompts should be 15-30 words, descriptive and specific
6. Do NOT use generic phrases like "showcasing the brand" or "highlighting features"

EXAMPLES SHOWING THE DIFFERENCE:

For a coffee subscription brand "Bean Box":
❌ BAD: "Product hero shot showcasing Bean Box products"
✅ GOOD: "Fresh roasted coffee beans spilling from a Bean Box subscription package, morning light, steam rising from a cup nearby"

For a project management SaaS "Taskflow":
❌ BAD: "Website hero showing Taskflow's features"
✅ GOOD: "Split screen showing chaotic sticky notes transforming into clean Taskflow boards, satisfying before/after moment"

For a fitness app "FitPulse":
❌ BAD: "Social media post for FitPulse engagement"
✅ GOOD: "Runner checking FitPulse stats mid-workout, city sunrise backdrop, sense of personal achievement and data-driven progress"

Notice how good prompts:
- Reference the SPECIFIC product (coffee beans, project boards, fitness stats)
- Create a SCENE the viewer can visualize
- Connect to the EXPERIENCE of using the product

Respond with valid JSON:
{
  "presets": [
    {
      "preset_id": "product-hero",
      "prompt": "Your specific, vivid prompt here",
      "why_relevant": "Brief explanation of why this concept fits this brand"
    }
  ]
}`;

  const userMessage = `Generate 6-8 image prompts for ${brand.name}.

Remember: Each prompt must reference something SPECIFIC about what ${brand.name} does. Read their description carefully and make sure every prompt connects to their actual product, service, or customer experience.

What specific thing does ${brand.name} offer? Make sure that shows up in your prompts.`;

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

function generateFallbackPresets(brand: Brand, relevantPresets: PresetTemplate[]): Array<{ preset: PresetTemplate; prompt: string; whyRelevant?: string }> {
  const summary = brand.styleguide?.summary || '';
  const adPersonality = brand.styleguide?.ad_personality;

  // Build a base concept from what we know about the brand
  const brandDescription = summary.length > 20 ? summary.substring(0, 100) : brand.name;

  // Generate prompts based on preset type and brand info
  return relevantPresets.slice(0, 6).map(template => {
    let prompt = '';
    let whyRelevant = '';

    switch (template.id) {
      case 'product-hero':
        prompt = `Hero shot of ${brand.name} product, clean background, professional lighting, ${adPersonality?.color_treatment?.replace(/_/g, ' ') || 'vibrant'} colors`;
        whyRelevant = 'Showcases your product as the hero';
        break;
      case 'product-lifestyle':
        prompt = `${brand.name} product in real-world use, lifestyle setting, natural lighting, authentic moment`;
        whyRelevant = 'Shows your product in context';
        break;
      case 'social-post':
        prompt = `Engaging social media visual for ${brand.name}, ${adPersonality?.tone || 'modern'} tone, eye-catching composition`;
        whyRelevant = 'Perfect for social media engagement';
        break;
      case 'social-story':
        prompt = `Vertical story format for ${brand.name}, bold typography space, ${adPersonality?.composition || 'dynamic'} layout`;
        whyRelevant = 'Optimized for stories and reels';
        break;
      case 'ad-awareness':
        prompt = `Brand awareness ad for ${brand.name}, memorable visual, ${adPersonality?.visual_approach?.replace('_', ' ') || 'clean'} style`;
        whyRelevant = 'Builds brand recognition';
        break;
      case 'ad-conversion':
        prompt = `Conversion-focused ad for ${brand.name}, clear value proposition, compelling visual with action focus`;
        whyRelevant = 'Drives customer action';
        break;
      case 'website-hero':
        prompt = `Website hero banner for ${brand.name}, wide format, ${adPersonality?.composition || 'balanced'} composition, space for headline`;
        whyRelevant = 'Makes a strong first impression';
        break;
      case 'website-feature':
        prompt = `Feature illustration for ${brand.name}, clean and modern, explains key benefit visually`;
        whyRelevant = 'Communicates features clearly';
        break;
      case 'brand-mood':
        prompt = `Abstract brand mood visual for ${brand.name}, ${adPersonality?.color_treatment?.replace(/_/g, ' ') || 'harmonious'} palette, evokes brand feeling`;
        whyRelevant = 'Captures your brand essence';
        break;
      case 'brand-texture':
        prompt = `Brand texture or pattern for ${brand.name}, seamless, uses brand colors, subtle and sophisticated`;
        whyRelevant = 'Adds visual richness to designs';
        break;
      case 'promo-sale':
        prompt = `Promotional sale graphic for ${brand.name}, urgent but on-brand, space for offer text`;
        whyRelevant = 'Drives promotional campaigns';
        break;
      case 'promo-launch':
        prompt = `Product launch visual for ${brand.name}, exciting reveal moment, ${adPersonality?.tone || 'energetic'} feeling`;
        whyRelevant = 'Creates launch excitement';
        break;
      case 'email-header':
        prompt = `Email header banner for ${brand.name}, horizontal format, clean and professional, brand colors`;
        whyRelevant = 'Enhances email marketing';
        break;
      default:
        prompt = `Marketing visual for ${brand.name}, ${adPersonality?.visual_approach?.replace('_', ' ') || 'professional'} style`;
        whyRelevant = 'Versatile marketing asset';
    }

    return { preset: template, prompt, whyRelevant };
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

    // Select relevant presets based on brand's visual personality
    const relevantPresets = selectRelevantPresets(brand);
    console.log(`Selected ${relevantPresets.length} relevant preset types for ${brand.name}`);

    let smartPresets: SmartPreset[] = [];
    let useFallback = false;

    // Try LLM generation first
    try {
      smartPresets = await generatePresetsWithLLM(brand, relevantPresets);
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
      : generateFallbackPresets(brand, relevantPresets).map(fallback => ({
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



















