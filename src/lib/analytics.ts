import posthog from 'posthog-js';
import type { AnalyticsEventMap, AnalyticsEventName, UserProperties } from '../types/analytics';

// Environment configuration
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
const GTM_ID = import.meta.env.VITE_GTM_ID;

// Events that should be sent to GTM (for ad platform pixels)
const GTM_EVENTS: Set<AnalyticsEventName> = new Set([
  'user_signed_up',
  'user_logged_in',
  'email_confirmed',
  'brand_extraction_started',
  'brand_extraction_completed',
  'brand_confirmed',
  'generation_started',
  'generation_completed',
  'insufficient_credits',
  'image_downloaded',
  'pricing_viewed',
  'checkout_started',
  'subscription_created',
  'credits_purchased',
  'page_viewed',
]);

// Initialize tracking state
let isInitialized = false;
let gtmInitialized = false;

// Check if we're in production (not localhost or dev mode)
const isProduction = typeof window !== 'undefined' &&
  !window.location.hostname.includes('localhost') &&
  !window.location.hostname.includes('127.0.0.1') &&
  import.meta.env.PROD;

/**
 * Initialize GTM (Google Tag Manager)
 */
function initGTM(): void {
  if (gtmInitialized || !GTM_ID || typeof window === 'undefined' || !isProduction) return;

  try {
    // Initialize dataLayer
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });

    // Load GTM script
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
    document.head.appendChild(script);

    // Add noscript fallback
    const noscript = document.createElement('noscript');
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.googletagmanager.com/ns.html?id=${GTM_ID}`;
    iframe.height = '0';
    iframe.width = '0';
    iframe.style.display = 'none';
    iframe.style.visibility = 'hidden';
    noscript.appendChild(iframe);
    document.body.insertBefore(noscript, document.body.firstChild);

    gtmInitialized = true;
    console.log('[Analytics] GTM initialized');
  } catch (error) {
    console.error('[Analytics] Failed to initialize GTM:', error);
  }
}

/**
 * Initialize all analytics (PostHog + GTM)
 * Call this once when the app loads
 */
export function initAnalytics(): void {
  // Skip analytics in development/localhost
  if (!isProduction) {
    console.log('[Analytics] Skipped - not in production environment');
    return;
  }

  // Initialize PostHog
  if (!isInitialized && POSTHOG_KEY) {
    try {
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        person_profiles: 'identified_only',
        capture_pageview: false, // We'll handle page views manually for SPA
        capture_pageleave: true,
        autocapture: false, // Disable autocapture for cleaner event data
        persistence: 'localStorage',
        // Session replay - watch user sessions for debugging
        disable_session_recording: false,
        session_recording: {
          maskAllInputs: false,
          maskInputOptions: {
            password: true,
          },
        },
        loaded: () => {
          console.log('[Analytics] PostHog initialized');
        },
      });
      isInitialized = true;
    } catch (error) {
      console.error('[Analytics] Failed to initialize PostHog:', error);
    }
  } else if (!POSTHOG_KEY) {
    console.warn('[Analytics] PostHog key not configured');
  }

  // Initialize GTM
  initGTM();
}

/**
 * Push event to GTM dataLayer
 */
function gtmPush(eventName: string, properties: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;

  // Initialize dataLayer if not exists
  window.dataLayer = window.dataLayer || [];

  window.dataLayer.push({
    event: eventName,
    ...properties,
  });
}

/**
 * Track an analytics event
 * Sends to PostHog and optionally to GTM
 */
export function track<T extends AnalyticsEventName>(
  eventName: T,
  properties: AnalyticsEventMap[T]
): void {
  // Log in development (even if analytics disabled)
  if (import.meta.env.DEV) {
    console.log('[Analytics] Event:', eventName, properties);
  }

  // Skip actual tracking in non-production
  if (!isProduction) return;

  // Send to PostHog
  if (isInitialized) {
    posthog.capture(eventName, properties as Record<string, unknown>);
  }

  // Send to GTM if event is in the GTM_EVENTS set
  if (GTM_ID && GTM_EVENTS.has(eventName)) {
    gtmPush(eventName, properties as Record<string, unknown>);
  }
}

/**
 * Identify a user with their properties
 * Call after authentication
 */
export function identify(userId: string, properties?: UserProperties): void {
  if (import.meta.env.DEV) {
    console.log('[Analytics] Identify:', userId, properties);
  }

  if (!isProduction || !isInitialized) return;

  posthog.identify(userId, properties);

  // Also push to GTM for ad platform user matching
  if (GTM_ID && properties?.email) {
    gtmPush('user_identified', {
      user_id: userId,
      email: properties.email,
    });
  }
}

/**
 * Reset user identity (on logout)
 */
export function reset(): void {
  if (import.meta.env.DEV) {
    console.log('[Analytics] Reset user identity');
  }

  if (!isProduction || !isInitialized) return;

  posthog.reset();
}

/**
 * Track page view
 * Call on route changes
 */
export function trackPageView(pageName: string, brandId?: string): void {
  track('page_viewed', {
    page: pageName,
    brand_id: brandId,
  });

  // Also use PostHog's built-in pageview for session replay
  if (isProduction && isInitialized) {
    posthog.capture('$pageview', {
      $current_url: window.location.href,
      page_name: pageName,
      brand_id: brandId,
    });
  }
}

/**
 * Set user properties without triggering an event
 */
export function setUserProperties(properties: UserProperties): void {
  if (!isProduction || !isInitialized) return;

  posthog.people.set(properties);
}

/**
 * Check if analytics is enabled
 */
export function isAnalyticsEnabled(): boolean {
  return isProduction && isInitialized && !!POSTHOG_KEY;
}

/**
 * Get the current distinct ID (for server-side tracking)
 */
export function getDistinctId(): string | null {
  if (!isInitialized) return null;
  return posthog.get_distinct_id();
}

// Extend Window interface for GTM dataLayer
declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
  }
}

export default {
  init: initAnalytics,
  track,
  identify,
  reset,
  trackPageView,
  setUserProperties,
  isEnabled: isAnalyticsEnabled,
  getDistinctId,
};
