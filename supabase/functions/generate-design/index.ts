import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createLogger } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  const logger = createLogger('generate-design');
  const requestId = logger.generateRequestId();
  const startTime = performance.now();
  
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    logger.setContext({ request_id: requestId });
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { brandId, templateId, brief } = await req.json();

    if (!brandId || !templateId || !brief) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select("*")
      .eq("id", brandId)
      .maybeSingle();

    if (brandError || !brand) {
      return new Response(
        JSON.stringify({ error: "Brand not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: template, error: templateError } = await supabase
      .from("templates")
      .select("*")
      .eq("id", templateId)
      .maybeSingle();

    if (templateError || !template) {
      return new Response(
        JSON.stringify({ error: "Template not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const copyResponse = await fetch(`${supabaseUrl}/functions/v1/generate-copy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        brandVoice: brand.voice,
        templateType: template.type,
        brief,
        slots: template.slots,
      }),
    });

    if (!copyResponse.ok) {
      throw new Error("Failed to generate copy");
    }

    const { copy } = await copyResponse.json();

    const imageResponse = await fetch(`${supabaseUrl}/functions/v1/generate-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        brand: { voice: brand.voice, colors: brand.colors },
        templateType: template.type,
        brief,
      }),
    });

    if (!imageResponse.ok) {
      throw new Error("Failed to generate image");
    }

    const { image_url } = await imageResponse.json();

    const slots: Record<string, string> = { ...copy };

    for (const [slotKey, slotDef] of Object.entries(template.slots)) {
      const slot = slotDef as { type: string };
      if (slot.type === "image") {
        if (slotKey === "image_primary") {
          slots[slotKey] = image_url;
        } else if (slotKey === "logo" && brand.logos.primary) {
          slots[slotKey] = brand.logos.primary;
        }
      }
    }

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: design, error: designError } = await supabase
      .from("designs")
      .insert({
        user_id: user.id,
        brand_id: brandId,
        template_id: templateId,
        slots,
        tokens: {
          colors: brand.colors,
          fonts: brand.fonts,
        },
        brief,
        status: "ready",
      })
      .select()
      .single();

    if (designError) {
      throw designError;
    }

    const duration = performance.now() - startTime;
    logger.info("Design generation completed", {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    return new Response(
      JSON.stringify({ success: true, design }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const duration = performance.now() - startTime;
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    // Log to Axiom
    logger.error("Generate design error", errorObj, {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    // Send to Sentry
    await captureException(errorObj, {
      function_name: 'generate-design',
      request_id: requestId,
    });

    return new Response(
      JSON.stringify({ error: errorObj.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});