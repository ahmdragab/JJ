import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

// CORS headers function - uses validated origin from request
function getCors(request: Request): Record<string, string> {
  return {
    ...getCorsHeaders(request),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "http://localhost:5173";

Deno.serve(async (req: Request) => {
  const logger = createLogger('create-portal-session');
  const requestId = logger.generateRequestId();
  const startTime = performance.now();

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCors(req) });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...getCors(req), "Content-Type": "application/json" } }
    );
  }

  try {
    logger.setContext({ request_id: requestId });

    // Get authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...getCors(req), "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...getCors(req), "Content-Type": "application/json" } }
      );
    }

    if (!STRIPE_SECRET_KEY) {
      logger.error("STRIPE_SECRET_KEY not configured", new Error("Missing STRIPE_SECRET_KEY"), {
        request_id: requestId,
      });
      return new Response(
        JSON.stringify({ error: "Payment system not configured. Please contact support." }),
        { status: 500, headers: { ...getCors(req), "Content-Type": "application/json" } }
      );
    }

    // Import Stripe
    const Stripe = (await import("npm:stripe@^17.0.0")).default;
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-12-18.acacia",
    });

    // Get existing Stripe customer ID from subscriptions table
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    let customerId = subscription?.stripe_customer_id;

    // If no customer ID, try to find or create a Stripe customer
    if (!customerId) {
      // Search for existing customer by email
      const customers = await stripe.customers.list({
        email: user.email,
        limit: 1,
      });

      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        // Create a new customer
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: {
            user_id: user.id,
          },
        });
        customerId = customer.id;
      }
    }

    // Create portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${SITE_URL}/brands`,
    });

    const duration = performance.now() - startTime;
    logger.info("Portal session created", {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    return new Response(
      JSON.stringify({ url: portalSession.url }),
      { status: 200, headers: { ...getCors(req), "Content-Type": "application/json" } }
    );
  } catch (error) {
    const duration = performance.now() - startTime;
    const errorObj = error instanceof Error ? error : new Error(String(error));

    logger.error("Create portal session error", errorObj, {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    await captureException(errorObj, {
      function_name: 'create-portal-session',
      request_id: requestId,
    });

    return new Response(
      JSON.stringify({ error: "Failed to create portal session. Please try again." }),
      { status: 500, headers: { ...getCors(req), "Content-Type": "application/json" } }
    );
  }
});
