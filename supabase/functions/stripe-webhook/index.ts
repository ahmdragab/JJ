import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { trackConversion } from "../_shared/conversions.ts";

// CORS headers function - uses validated origin from request
// Note: Stripe webhooks come from Stripe servers, not browsers, so CORS isn't strictly needed
// But we keep it for consistency and any browser-based testing
function getCors(request: Request): Record<string, string> {
  return {
    ...getCorsHeaders(request),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Stripe-Signature",
    "Access-Control-Max-Age": "86400",
  };
}

const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

// Verify Stripe webhook signature
async function verifyStripeSignature(
  payload: string,
  signature: string | null
): Promise<boolean> {
  if (!STRIPE_WEBHOOK_SECRET || !signature) {
    return false;
  }

  try {
    const Stripe = (await import("npm:stripe@^17.0.0")).default;
    const stripe = new Stripe(STRIPE_SECRET_KEY || "", {
      apiVersion: "2024-12-18.acacia",
    });
    
    // Verify webhook signature
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      STRIPE_WEBHOOK_SECRET
    );
    
    return !!event;
  } catch (error) {
    console.error("Stripe signature verification failed:", error);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  const logger = createLogger('stripe-webhook');
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
    
    const signature = req.headers.get("stripe-signature");
    const payload = await req.text();

    // Verify webhook signature
    if (!await verifyStripeSignature(payload, signature)) {
      logger.warn("Invalid Stripe webhook signature", { request_id: requestId });
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: { ...getCors(req), "Content-Type": "application/json" } }
      );
    }

    const event = JSON.parse(payload);
    logger.info(`Processing Stripe event: ${event.type}`, {
      request_id: requestId,
      event_id: event.id,
      event_type: event.type,
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase configuration missing");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Idempotency check: Use upsert with onConflict to atomically check and insert
    // This prevents race conditions when multiple identical webhooks arrive simultaneously
    const { data: insertResult, error: insertError } = await supabase
      .from("stripe_events")
      .upsert({
        event_id: event.id,
        event_type: event.type,
        processed_at: new Date().toISOString(),
      }, {
        onConflict: "event_id",
        ignoreDuplicates: false,  // Return existing row if duplicate
      })
      .select("processed_at")
      .single();

    // Check if this was an existing event (processed_at significantly before now)
    // or if there was a unique constraint error (race condition case)
    if (insertError) {
      // Unique constraint violation - another request is processing this event
      logger.info(`Event already being processed, skipping: ${event.id}`, {
        request_id: requestId,
        event_id: event.id,
      });
      return new Response(
        JSON.stringify({ received: true, message: "Event already processed" }),
        { status: 200, headers: { ...getCors(req), "Content-Type": "application/json" } }
      );
    }

    // Check if this was already processed (upsert returns existing row)
    if (insertResult) {
      const existingTimestamp = new Date(insertResult.processed_at).getTime();
      const now = Date.now();
      // If processed more than 5 seconds ago, it's a duplicate
      if (now - existingTimestamp > 5000) {
        logger.info(`Event already processed, skipping: ${event.id}`, {
          request_id: requestId,
          event_id: event.id,
        });
        return new Response(
          JSON.stringify({ received: true, message: "Event already processed" }),
          { status: 200, headers: { ...getCors(req), "Content-Type": "application/json" } }
        );
      }
    }

    // Handle different event types
    switch (event.type) {
      case "checkout.session.completed": {
        await handleCheckoutCompleted(event.data.object, supabase, logger);
        break;
      }
      
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await handleSubscriptionUpdated(event.data.object, supabase, logger);
        break;
      }
      
      case "customer.subscription.deleted": {
        await handleSubscriptionDeleted(event.data.object, supabase, logger);
        break;
      }
      
      case "invoice.payment_succeeded": {
        await handleInvoicePaymentSucceeded(event.data.object, supabase, logger);
        break;
      }
      
      case "payment_intent.succeeded": {
        await handlePaymentIntentSucceeded(event.data.object, supabase, logger);
        break;
      }
      
      default:
        logger.info(`Unhandled event type: ${event.type}`, { request_id: requestId });
    }

    const duration = performance.now() - startTime;
    logger.info("Stripe webhook processed successfully", {
      request_id: requestId,
      event_type: event.type,
      duration_ms: Math.round(duration),
    });

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...getCors(req), "Content-Type": "application/json" } }
    );
  } catch (error) {
    const duration = performance.now() - startTime;
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    logger.error("Stripe webhook error", errorObj, {
      request_id: requestId,
      duration_ms: Math.round(duration),
    });

    await captureException(errorObj, {
      function_name: 'stripe-webhook',
      request_id: requestId,
    });

    return new Response(
      JSON.stringify({ error: errorObj.message }),
      { status: 500, headers: { ...getCors(req), "Content-Type": "application/json" } }
    );
  }
});

// Handle checkout session completed (subscription or one-time purchase)
async function handleCheckoutCompleted(
  session: any,
  supabase: ReturnType<typeof createClient>,
  logger: ReturnType<typeof createLogger>
) {
  const customerId = session.customer;
  const subscriptionId = session.subscription;
  const clientReferenceId = session.client_reference_id; // User ID
  const metadata = session.metadata || {};

  logger.info("Processing checkout.session.completed", {
    customer_id: customerId,
    subscription_id: subscriptionId,
    client_reference_id: clientReferenceId,
  });

  // If it's a subscription, handle it
  if (subscriptionId) {
    await handleSubscriptionCreated(subscriptionId, customerId, clientReferenceId, supabase, logger);
  } 
  // If it's a one-time purchase (credit package)
  else if (metadata.package_id) {
    await handleCreditPackagePurchase(session, clientReferenceId, supabase, logger);
  }
}

// Handle subscription created/updated
async function handleSubscriptionUpdated(
  subscription: any,
  supabase: ReturnType<typeof createClient>,
  logger: ReturnType<typeof createLogger>
) {
  const subscriptionId = subscription.id;
  const customerId = subscription.customer;
  const status = subscription.status;
  const planPriceId = subscription.items?.data?.[0]?.price?.id;

  logger.info("Processing subscription update", {
    subscription_id: subscriptionId,
    customer_id: customerId,
    status: status,
  });

  // Find user by customer ID
  const { data: subscriptionRecord } = await supabase
    .from("subscriptions")
    .select("user_id, plan_id")
    .eq("stripe_subscription_id", subscriptionId)
    .single();

  if (!subscriptionRecord) {
    logger.warn("Subscription record not found", { subscription_id: subscriptionId });
    return;
  }

  // Find plan by Stripe price ID
  const { data: plan } = await supabase
    .from("plans")
    .select("id, name")
    .or(`stripe_price_id_monthly.eq.${planPriceId},stripe_price_id_yearly.eq.${planPriceId}`)
    .single();

  if (!plan) {
    logger.warn("Plan not found for price ID", { price_id: planPriceId });
    return;
  }

  // Determine billing cycle
  const billingCycle = subscription.items?.data?.[0]?.price?.recurring?.interval === "year" 
    ? "yearly" 
    : "monthly";

  // Update or create subscription record
  const subscriptionData = {
    plan_id: plan.id,
    status: status === "active" ? "active" : 
            status === "canceled" ? "canceled" :
            status === "past_due" ? "past_due" : "incomplete",
    billing_cycle: billingCycle,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end || false,
    stripe_customer_id: customerId,
    updated_at: new Date().toISOString(),
  };

  await supabase
    .from("subscriptions")
    .upsert({
      id: subscriptionRecord.user_id ? undefined : undefined, // Keep existing ID if updating
      user_id: subscriptionRecord.user_id,
      ...subscriptionData,
    }, {
      onConflict: "user_id",
    });

  // Grant credits if subscription is active and just started
  if (status === "active") {
    const { data: subRecord } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("stripe_subscription_id", subscriptionId)
      .single();

    if (subRecord) {
      await supabase.rpc("grant_subscription_credits", { subscription_uuid: subRecord.id });
      logger.info("Credits granted for subscription", { subscription_id: subscriptionId });
    }

    // Track subscription created conversion
    // Get user email for better attribution
    const { data: userData } = await supabase.auth.admin.getUserById(subscriptionRecord.user_id);
    const amount = subscription.items?.data?.[0]?.price?.unit_amount
      ? subscription.items.data[0].price.unit_amount / 100
      : 0;

    await trackConversion({
      user_id: subscriptionRecord.user_id,
      email: userData?.user?.email,
      event_name: 'subscription_created',
      value: amount,
      currency: subscription.currency?.toUpperCase() || 'USD',
      properties: {
        plan_id: plan.id,
        plan_name: plan.name,
        billing_cycle: billingCycle,
      },
    });
  }
}

// Handle subscription created
async function handleSubscriptionCreated(
  subscriptionId: string,
  customerId: string,
  userId: string | null,
  supabase: ReturnType<typeof createClient>,
  logger: ReturnType<typeof createLogger>
) {
  logger.info("Subscription created", { subscription_id: subscriptionId, customer_id: customerId, user_id: userId });

  // Fetch subscription details from Stripe
  if (!STRIPE_SECRET_KEY) {
    logger.error("STRIPE_SECRET_KEY not configured");
    return;
  }

  try {
    const Stripe = (await import("npm:stripe@^17.0.0")).default;
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-12-18.acacia",
    });

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    // Now handle it like an update
    await handleSubscriptionUpdated(subscription, supabase, logger);
  } catch (error) {
    logger.error("Failed to fetch subscription from Stripe", error instanceof Error ? error : new Error(String(error)), {
      subscription_id: subscriptionId,
    });
  }
}

// Handle subscription deleted
async function handleSubscriptionDeleted(
  subscription: any,
  supabase: ReturnType<typeof createClient>,
  logger: ReturnType<typeof createLogger>
) {
  const subscriptionId = subscription.id;

  await supabase
    .from("subscriptions")
    .update({
      status: "canceled",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscriptionId);

  logger.info("Subscription canceled", { subscription_id: subscriptionId });
}

// Handle invoice payment succeeded (subscription renewal)
async function handleInvoicePaymentSucceeded(
  invoice: any,
  supabase: ReturnType<typeof createClient>,
  logger: ReturnType<typeof createLogger>
) {
  const subscriptionId = invoice.subscription;

  if (!subscriptionId) {
    return; // Not a subscription invoice
  }

  logger.info("Processing subscription renewal", { subscription_id: subscriptionId });

  // Find subscription record
  const { data: subscriptionRecord } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("stripe_subscription_id", subscriptionId)
    .single();

  if (subscriptionRecord) {
    // Grant credits for new billing period
    await supabase.rpc("grant_subscription_credits", { subscription_uuid: subscriptionRecord.id });
    logger.info("Credits granted for renewal", { subscription_id: subscriptionId });
  }
}

// Handle payment intent succeeded (one-time purchase)
// NOTE: Credit packages are handled via checkout.session.completed, not here.
// This handler is kept for potential future use cases (direct payment intents).
async function handlePaymentIntentSucceeded(
  paymentIntent: any,
  _supabase: ReturnType<typeof createClient>,
  logger: ReturnType<typeof createLogger>
) {
  // Credit packages purchased through Stripe Checkout are processed in
  // checkout.session.completed handler. We intentionally do NOT process
  // credit packages here to avoid double-crediting users.
  //
  // If we need to handle direct PaymentIntent flows in the future (not via Checkout),
  // we should add a separate deduplication mechanism using session/payment intent IDs.

  logger.info("Payment intent succeeded (no action needed - handled by checkout.session.completed)", {
    payment_intent_id: paymentIntent.id,
  });
}

// Handle credit package purchase
async function handleCreditPackagePurchase(
  session: any,
  userId: string | null,
  supabase: ReturnType<typeof createClient>,
  logger: ReturnType<typeof createLogger>
) {
  const packageId = session.metadata?.package_id;
  const actualUserId = userId || session.metadata?.user_id;

  if (!packageId || !actualUserId) {
    logger.warn("Missing package_id or user_id for credit package purchase");
    return;
  }

  // Get package details
  const { data: packageData } = await supabase
    .from("credit_packages")
    .select("id, credits, name")
    .eq("id", packageId)
    .single();

  if (!packageData) {
    logger.error("Credit package not found", { package_id: packageId });
    return;
  }

  // Add credits to user
  await supabase.rpc("add_credits", {
    user_uuid: actualUserId,
    amount: packageData.credits,
    description: `Purchased ${packageData.name} credit package`,
    metadata: JSON.stringify({
      package_id: packageId,
      package_name: packageData.name,
      source: "credit_package",
    }),
  });

  logger.info("Credits added from package purchase", {
    user_id: actualUserId,
    package_id: packageId,
    credits: packageData.credits,
  });

  // Track credits purchased conversion
  const { data: userData } = await supabase.auth.admin.getUserById(actualUserId);
  const amount = session.amount_total ? session.amount_total / 100 : 0;

  await trackConversion({
    user_id: actualUserId,
    email: userData?.user?.email,
    event_name: 'credits_purchased',
    value: amount,
    currency: session.currency?.toUpperCase() || 'USD',
    properties: {
      package_id: packageId,
      credits: packageData.credits,
    },
  });
}

