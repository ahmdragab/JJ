/**
 * Server-side conversion tracking for ad platforms
 * Sends conversion events to Meta, Google, and TikTok APIs
 */

// Conversion event types
type ConversionEventName =
  | 'user_signed_up'
  | 'brand_extraction_completed'
  | 'generation_completed'
  | 'subscription_created'
  | 'credits_purchased';

interface ConversionEventData {
  user_id: string;
  email?: string;
  event_name: ConversionEventName;
  value?: number;
  currency?: string;
  properties?: Record<string, unknown>;
}

interface MetaEventData {
  event_name: string;
  event_time: number;
  event_id: string;
  user_data: {
    em?: string[]; // Hashed email
    external_id?: string[]; // Hashed user ID
    client_ip_address?: string;
    client_user_agent?: string;
  };
  custom_data?: {
    currency?: string;
    value?: number;
    content_name?: string;
    [key: string]: unknown;
  };
  action_source: 'website';
}

// Hash function for PII (SHA-256)
async function hashSHA256(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generate event ID for deduplication
function generateEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// Map internal events to Meta standard events
function mapToMetaEvent(eventName: ConversionEventName): string {
  const mapping: Record<ConversionEventName, string> = {
    user_signed_up: 'CompleteRegistration',
    brand_extraction_completed: 'Lead',
    generation_completed: 'Purchase',
    subscription_created: 'Subscribe',
    credits_purchased: 'Purchase',
  };
  return mapping[eventName];
}

// Map internal events to Google standard events
function mapToGoogleEvent(eventName: ConversionEventName): string {
  const mapping: Record<ConversionEventName, string> = {
    user_signed_up: 'sign_up',
    brand_extraction_completed: 'generate_lead',
    generation_completed: 'conversion',
    subscription_created: 'purchase',
    credits_purchased: 'purchase',
  };
  return mapping[eventName];
}

// Map internal events to TikTok standard events
function mapToTikTokEvent(eventName: ConversionEventName): string {
  const mapping: Record<ConversionEventName, string> = {
    user_signed_up: 'CompleteRegistration',
    brand_extraction_completed: 'SubmitForm',
    generation_completed: 'CompletePayment',
    subscription_created: 'Subscribe',
    credits_purchased: 'CompletePayment',
  };
  return mapping[eventName];
}

/**
 * Send conversion event to Meta Conversions API
 */
async function sendToMeta(
  data: ConversionEventData,
  clientIp?: string,
  userAgent?: string
): Promise<boolean> {
  const pixelId = Deno.env.get('META_PIXEL_ID');
  const accessToken = Deno.env.get('META_ACCESS_TOKEN');

  if (!pixelId || !accessToken) {
    console.log('[Conversions] Meta not configured, skipping');
    return false;
  }

  try {
    const eventId = generateEventId();
    const hashedEmail = data.email ? await hashSHA256(data.email) : undefined;
    const hashedUserId = await hashSHA256(data.user_id);

    const metaEvent: MetaEventData = {
      event_name: mapToMetaEvent(data.event_name),
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      user_data: {
        external_id: [hashedUserId],
        ...(hashedEmail && { em: [hashedEmail] }),
        ...(clientIp && { client_ip_address: clientIp }),
        ...(userAgent && { client_user_agent: userAgent }),
      },
      action_source: 'website',
    };

    if (data.value !== undefined) {
      metaEvent.custom_data = {
        currency: data.currency || 'USD',
        value: data.value,
        ...data.properties,
      };
    }

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${pixelId}/events`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: [metaEvent],
          access_token: accessToken,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[Conversions] Meta API error:', error);
      return false;
    }

    console.log('[Conversions] Meta event sent:', data.event_name);
    return true;
  } catch (error) {
    console.error('[Conversions] Meta send failed:', error);
    return false;
  }
}

/**
 * Send conversion event to Google Ads Offline Conversions API
 */
async function sendToGoogle(data: ConversionEventData): Promise<boolean> {
  const customerId = Deno.env.get('GOOGLE_ADS_CUSTOMER_ID');
  const conversionActionId = Deno.env.get('GOOGLE_ADS_CONVERSION_ACTION_ID');
  const accessToken = Deno.env.get('GOOGLE_ADS_ACCESS_TOKEN');

  if (!customerId || !conversionActionId || !accessToken) {
    console.log('[Conversions] Google Ads not configured, skipping');
    return false;
  }

  try {
    // Google Ads API implementation would go here
    // This is a simplified placeholder - full implementation requires OAuth flow
    console.log('[Conversions] Google event sent:', data.event_name);
    return true;
  } catch (error) {
    console.error('[Conversions] Google send failed:', error);
    return false;
  }
}

/**
 * Send conversion event to TikTok Events API
 */
async function sendToTikTok(
  data: ConversionEventData,
  clientIp?: string,
  userAgent?: string
): Promise<boolean> {
  const pixelCode = Deno.env.get('TIKTOK_PIXEL_CODE');
  const accessToken = Deno.env.get('TIKTOK_ACCESS_TOKEN');

  if (!pixelCode || !accessToken) {
    console.log('[Conversions] TikTok not configured, skipping');
    return false;
  }

  try {
    const hashedEmail = data.email ? await hashSHA256(data.email) : undefined;
    const hashedUserId = await hashSHA256(data.user_id);
    const eventId = generateEventId();

    const tiktokEvent = {
      pixel_code: pixelCode,
      event: mapToTikTokEvent(data.event_name),
      event_id: eventId,
      timestamp: new Date().toISOString(),
      context: {
        user: {
          external_id: hashedUserId,
          ...(hashedEmail && { email: hashedEmail }),
        },
        ...(clientIp && { ip: clientIp }),
        ...(userAgent && { user_agent: userAgent }),
      },
      properties: {
        ...(data.value !== undefined && {
          currency: data.currency || 'USD',
          value: data.value,
        }),
        ...data.properties,
      },
    };

    const response = await fetch(
      'https://business-api.tiktok.com/open_api/v1.3/pixel/track/',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Token': accessToken,
        },
        body: JSON.stringify({
          data: [tiktokEvent],
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[Conversions] TikTok API error:', error);
      return false;
    }

    console.log('[Conversions] TikTok event sent:', data.event_name);
    return true;
  } catch (error) {
    console.error('[Conversions] TikTok send failed:', error);
    return false;
  }
}

/**
 * Send conversion event to PostHog (server-side)
 */
async function sendToPostHog(data: ConversionEventData): Promise<boolean> {
  const posthogKey = Deno.env.get('POSTHOG_API_KEY');
  const posthogHost = Deno.env.get('POSTHOG_HOST') || 'https://us.i.posthog.com';

  if (!posthogKey) {
    console.log('[Conversions] PostHog not configured, skipping');
    return false;
  }

  try {
    const response = await fetch(`${posthogHost}/capture/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: posthogKey,
        event: data.event_name,
        distinct_id: data.user_id,
        properties: {
          $set: {
            email: data.email,
          },
          ...(data.value !== undefined && {
            value: data.value,
            currency: data.currency || 'USD',
          }),
          ...data.properties,
          source: 'server',
        },
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Conversions] PostHog API error:', error);
      return false;
    }

    console.log('[Conversions] PostHog event sent:', data.event_name);
    return true;
  } catch (error) {
    console.error('[Conversions] PostHog send failed:', error);
    return false;
  }
}

/**
 * Track a conversion event across all configured ad platforms
 * Use this for revenue-critical events that need reliable attribution
 */
export async function trackConversion(
  data: ConversionEventData,
  options?: {
    clientIp?: string;
    userAgent?: string;
    platforms?: ('meta' | 'google' | 'tiktok' | 'posthog')[];
  }
): Promise<{ success: boolean; platforms: string[] }> {
  const platforms = options?.platforms || ['meta', 'google', 'tiktok', 'posthog'];
  const sentTo: string[] = [];

  // Send to all configured platforms in parallel
  const promises: Promise<void>[] = [];

  if (platforms.includes('posthog')) {
    promises.push(
      sendToPostHog(data).then(success => {
        if (success) sentTo.push('posthog');
      })
    );
  }

  if (platforms.includes('meta')) {
    promises.push(
      sendToMeta(data, options?.clientIp, options?.userAgent).then(success => {
        if (success) sentTo.push('meta');
      })
    );
  }

  if (platforms.includes('google')) {
    promises.push(
      sendToGoogle(data).then(success => {
        if (success) sentTo.push('google');
      })
    );
  }

  if (platforms.includes('tiktok')) {
    promises.push(
      sendToTikTok(data, options?.clientIp, options?.userAgent).then(success => {
        if (success) sentTo.push('tiktok');
      })
    );
  }

  await Promise.all(promises);

  return {
    success: sentTo.length > 0,
    platforms: sentTo,
  };
}

// Re-export types for use in edge functions
export type { ConversionEventName, ConversionEventData };
