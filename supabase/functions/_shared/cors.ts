/**
 * CORS utilities for Supabase Edge Functions
 */

// Get allowed origins from environment or use defaults
// Set ALLOWED_ORIGINS env var in Supabase dashboard (comma-separated)
// e.g., "https://yourdomain.com,https://www.yourdomain.com,https://your-app.vercel.app"
const ALLOWED_ORIGINS = Deno.env.get('ALLOWED_ORIGINS')?.split(',').map(o => o.trim()) || [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
];

/**
 * Get CORS headers for a request
 * Validates origin against allowlist
 * Returns headers only for allowed origins - rejects others by omitting Access-Control-Allow-Origin
 */
export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '';

  // Check if origin is in the allowed list
  const isAllowed = ALLOWED_ORIGINS.some(allowed =>
    origin === allowed ||
    // Support wildcard subdomains if configured (e.g., *.yourdomain.com)
    (allowed.startsWith('*.') && origin.endsWith(allowed.slice(1)))
  );

  // Base headers always included
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
    'Access-Control-Max-Age': '86400',
  };

  // Only include Allow-Origin for valid origins - browser will reject if missing
  if (isAllowed && origin) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

/**
 * Handle CORS preflight request
 */
export function handleCorsPreflightRequest(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

/**
 * Get legacy CORS headers with origin validation
 * @deprecated Use getCorsHeaders(request) for proper origin checking
 */
export function getLegacyCorsHeaders(request?: Request): Record<string, string> {
  // If request provided, validate origin properly
  if (request) {
    return getCorsHeaders(request);
  }

  // Without request, we can't validate - return minimal headers without origin
  // This forces callers to pass the request for proper validation
  console.warn('getLegacyCorsHeaders called without request - CORS origin will not be set');
  return {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
    'Access-Control-Max-Age': '86400',
  };
}
