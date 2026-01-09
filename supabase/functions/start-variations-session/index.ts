import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { getUserIdFromRequest, unauthorizedResponse } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

// =============================================================================
// START-VARIATIONS-SESSION EDGE FUNCTION
// =============================================================================
// Creates a session for variations mode that:
// 1. Deducts credits ONCE upfront
// 2. Returns a session token
// 3. Allows multiple generations without additional credit checks
//
// This prevents race conditions when firing parallel image generation requests.
// =============================================================================

const logger = createLogger("start-variations-session");

// Session expires after 5 minutes (plenty of time for parallel generations)
const SESSION_EXPIRY_MINUTES = 5;

interface SessionRequest {
  creditCost?: number;      // Credits to deduct (default: 2)
  maxGenerations?: number;  // Max generations allowed (default: 3)
}

interface SessionResponse {
  sessionId: string;
  expiresAt: string;
  creditsDeducted: number;
  maxGenerations: number;
  remainingCredits: number;
}

function getCors(request: Request): Record<string, string> {
  return {
    ...getCorsHeaders(request),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const corsHeaders = getCors(req);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    logger.setContext({ request_id: requestId });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authenticate user
    const { userId, error: authError } = await getUserIdFromRequest(req, supabase);
    if (authError || !userId) {
      return unauthorizedResponse(authError || "Authentication required", corsHeaders);
    }

    logger.setContext({ request_id: requestId, user_id: userId });

    // Parse request
    let requestBody: SessionRequest = {};
    try {
      requestBody = await req.json();
    } catch {
      // Empty body is OK, use defaults
    }

    // Validate and normalize parameters (server-side validation)
    const creditCost = Math.max(1, Math.min(5, Math.floor(Number(requestBody.creditCost) || 2)));
    const maxGenerations = Math.max(1, Math.min(10, Math.floor(Number(requestBody.maxGenerations) || 3)));

    // Check current credits
    const { data: creditsData, error: creditsError } = await supabase
      .from("user_credits")
      .select("credits")
      .eq("user_id", userId)
      .single();

    const currentCredits = creditsData?.credits ?? 0;

    if (creditsError || currentCredits < creditCost) {
      return new Response(
        JSON.stringify({
          error: `Insufficient credits. You need ${creditCost} credit${creditCost > 1 ? 's' : ''} but have ${currentCredits}.`,
          credits: currentCredits
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduct credits atomically with optimistic locking
    const { data: updateResult, error: deductError } = await supabase
      .from("user_credits")
      .update({
        credits: currentCredits - creditCost,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", userId)
      .eq("credits", currentCredits) // Optimistic lock
      .select("credits");

    if (deductError || !updateResult || updateResult.length === 0) {
      // Race condition - credits changed, retry
      const { data: retryData } = await supabase
        .from("user_credits")
        .select("credits")
        .eq("user_id", userId)
        .single();

      const retryCredits = retryData?.credits ?? 0;
      if (retryCredits < creditCost) {
        return new Response(
          JSON.stringify({
            error: `Insufficient credits. You need ${creditCost} credit${creditCost > 1 ? 's' : ''} but have ${retryCredits}.`,
            credits: retryCredits
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Retry deduction
      const { error: retryError } = await supabase
        .from("user_credits")
        .update({
          credits: retryCredits - creditCost,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", userId)
        .eq("credits", retryCredits);

      if (retryError) {
        return new Response(
          JSON.stringify({ error: "Failed to process credits. Please try again." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Log credit transaction
    try {
      await supabase
        .from("credit_transactions")
        .insert({
          user_id: userId,
          type: 'deducted',
          amount: -creditCost,
          balance_after: currentCredits - creditCost,
          source: 'variations',
          description: `${creditCost} credits used for ${maxGenerations} variations session`
        });
    } catch (txError) {
      console.warn("Failed to log credit transaction:", txError);
    }

    // Create session
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MINUTES * 60 * 1000);

    const { data: session, error: sessionError } = await supabase
      .from("generation_sessions")
      .insert({
        user_id: userId,
        credits_deducted: creditCost,
        max_generations: maxGenerations,
        generations_used: 0,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (sessionError || !session) {
      console.error("Failed to create session:", sessionError);

      // Refund credits since session creation failed
      await supabase
        .from("user_credits")
        .update({
          credits: currentCredits, // Restore original amount
          updated_at: new Date().toISOString()
        })
        .eq("user_id", userId);

      await supabase
        .from("credit_transactions")
        .insert({
          user_id: userId,
          type: 'refunded',
          amount: creditCost,
          source: 'error_refund',
          description: 'Credits refunded due to session creation failure'
        });

      return new Response(
        JSON.stringify({ error: "Failed to create session. Credits have been refunded." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logger.info("Variations session created", {
      session_id: session.id,
      credits_deducted: creditCost,
      max_generations: maxGenerations,
    });

    const response: SessionResponse = {
      sessionId: session.id,
      expiresAt: expiresAt.toISOString(),
      creditsDeducted: creditCost,
      maxGenerations: maxGenerations,
      remainingCredits: currentCredits - creditCost,
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    console.error("[start-variations-session] Error:", error);
    captureException(error);

    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({ error: "Failed to create session", message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
