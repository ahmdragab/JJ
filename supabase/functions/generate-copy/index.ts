import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { getUserIdFromRequest, unauthorizedResponse } from "../_shared/auth.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  const logger = createLogger('generate-copy');
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

    // Authenticate the user
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { userId, error: authError } = await getUserIdFromRequest(req, supabase);

    if (authError || !userId) {
      return unauthorizedResponse(authError || 'Authentication required', corsHeaders);
    }

    logger.setContext({ request_id: requestId, user_id: userId });

    const { brandVoice, templateType, brief, slots } = await req.json();

    if (!brandVoice || !templateType || !brief || !slots) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const generatedCopy: Record<string, string> = {};

    for (const [slotKey, slotDef] of Object.entries(slots)) {
      const slot = slotDef as { type: string; maxLength?: number };
      if (slot.type !== "text") continue;

      if (slotKey === "headline") {
        generatedCopy[slotKey] = generateHeadline(brief, brandVoice);
      } else if (slotKey === "subheadline") {
        generatedCopy[slotKey] = generateSubheadline(brief, brandVoice);
      } else if (slotKey === "body") {
        generatedCopy[slotKey] = generateBody(brief, brandVoice);
      } else if (slotKey === "cta_text") {
        generatedCopy[slotKey] = generateCTA(brief, brandVoice);
      }
    }

    const duration = performance.now() - startTime;
    logger.info("Copy generation completed", {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    return new Response(
      JSON.stringify({ success: true, copy: generatedCopy }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const duration = performance.now() - startTime;
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    // Log to Axiom
    logger.error("Generate copy error", errorObj, {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    // Send to Sentry
    await captureException(errorObj, {
      function_name: 'generate-copy',
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

function generateHeadline(brief: string, voice: any): string {
  const templates = [
    `Transform Your ${extractKeyword(brief)}`,
    `The Future of ${extractKeyword(brief)}`,
    `${extractKeyword(brief)} Made Simple`,
    `Elevate Your ${extractKeyword(brief)} Strategy`,
    `Discover Next-Level ${extractKeyword(brief)}`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateSubheadline(brief: string, voice: any): string {
  const keyword = extractKeyword(brief);
  const templates = [
    `Powerful ${keyword} solutions designed for modern teams`,
    `Everything you need to succeed with ${keyword}`,
    `Join thousands who've transformed their ${keyword}`,
    `The all-in-one platform for ${keyword} excellence`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateBody(brief: string, voice: any): string {
  const templates = [
    `Our platform combines cutting-edge technology with intuitive design to help you achieve your goals faster.`,
    `Join leading teams who trust our solution to drive results and accelerate growth.`,
    `Get started in minutes and see immediate results with our proven approach.`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateCTA(brief: string, voice: any): string {
  const ctas = [
    "Get Started Free",
    "Start Free Trial",
    "Try It Now",
    "Learn More",
    "See How It Works",
    "Request Demo",
  ];
  return ctas[Math.floor(Math.random() * ctas.length)];
}

function extractKeyword(brief: string): string {
  const words = brief.toLowerCase().split(" ");
  const meaningfulWords = words.filter(
    (w) => w.length > 4 && !["about", "their", "would", "could", "should"].includes(w)
  );
  return meaningfulWords[0] || "Business";
}