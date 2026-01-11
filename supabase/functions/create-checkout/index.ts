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
  const logger = createLogger('create-checkout');
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

    const body = await req.json();
    const { type, planId, packageId, billingCycle = "monthly" } = body;

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

    let checkoutSession;

    if (type === "subscription" && planId) {
      // Create subscription checkout
      const { data: plan } = await supabase
        .from("plans")
        .select("*")
        .eq("id", planId)
        .single();

      if (!plan) {
        return new Response(
          JSON.stringify({ error: "Plan not found" }),
          { status: 404, headers: { ...getCors(req), "Content-Type": "application/json" } }
        );
      }

      // Get or create Stripe customer
      let customerId: string;
      const { data: existingSubscription } = await supabase
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .single();

      if (existingSubscription?.stripe_customer_id) {
        customerId = existingSubscription.stripe_customer_id;
      } else {
        // Create Stripe customer
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: {
            user_id: user.id,
          },
        });
        customerId = customer.id;
      }

      // Determine price ID based on billing cycle
      const priceId = billingCycle === "yearly" 
        ? plan.stripe_price_id_yearly 
        : plan.stripe_price_id_monthly;

      if (!priceId) {
        return new Response(
          JSON.stringify({ error: "Stripe price ID not configured for this plan" }),
          { status: 500, headers: { ...getCors(req), "Content-Type": "application/json" } }
        );
      }

      checkoutSession = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${SITE_URL}/pricing?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${SITE_URL}/pricing?canceled=true`,
        client_reference_id: user.id,
        metadata: {
          user_id: user.id,
          plan_id: planId,
          billing_cycle: billingCycle,
        },
      });

      logger.info("Subscription checkout created", {
        request_id: requestId,
        plan_id: planId,
        billing_cycle: billingCycle,
      });
    } else if (type === "package" && packageId) {
      // Create one-time payment for credit package
      const { data: packageData } = await supabase
        .from("credit_packages")
        .select("*")
        .eq("id", packageId)
        .single();

      if (!packageData) {
        return new Response(
          JSON.stringify({ error: "Credit package not found" }),
          { status: 404, headers: { ...getCors(req), "Content-Type": "application/json" } }
        );
      }

      if (!packageData.stripe_price_id) {
        return new Response(
          JSON.stringify({ error: "Stripe price ID not configured for this package" }),
          { status: 500, headers: { ...getCors(req), "Content-Type": "application/json" } }
        );
      }

      checkoutSession = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price: packageData.stripe_price_id,
            quantity: 1,
          },
        ],
        success_url: `${SITE_URL}/pricing?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${SITE_URL}/pricing?canceled=true`,
        client_reference_id: user.id,
        metadata: {
          user_id: user.id,
          package_id: packageId,
        },
      });

      logger.info("Credit package checkout created", {
        request_id: requestId,
        package_id: packageId,
      });
    } else {
      logger.warn("Invalid checkout request", {
        request_id: requestId,
        type,
        planId,
        packageId,
      });
      return new Response(
        JSON.stringify({ error: "Invalid request: type and planId/packageId required" }),
        { status: 400, headers: { ...getCors(req), "Content-Type": "application/json" } }
      );
    }

    const duration = performance.now() - startTime;
    logger.info("Checkout session created", {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    return new Response(
      JSON.stringify({ url: checkoutSession.url }),
      { status: 200, headers: { ...getCors(req), "Content-Type": "application/json" } }
    );
  } catch (error) {
    const duration = performance.now() - startTime;
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    logger.error("Create checkout error", errorObj, {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    await captureException(errorObj, {
      function_name: 'create-checkout',
      request_id: requestId,
    });

    return new Response(
      JSON.stringify({ error: errorObj.message }),
      { status: 500, headers: { ...getCors(req), "Content-Type": "application/json" } }
    );
  }
});

