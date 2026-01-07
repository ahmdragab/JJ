/**
 * Response utilities for Supabase Edge Functions
 */

type ResponseHeaders = Record<string, string>;

/**
 * Create a success JSON response
 */
export function successResponse(
  data: unknown,
  corsHeaders: ResponseHeaders,
  status: number = 200
): Response {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Create an error JSON response
 */
export function errorResponse(
  message: string,
  corsHeaders: ResponseHeaders,
  status: number = 400,
  additionalData?: Record<string, unknown>
): Response {
  return new Response(
    JSON.stringify({ error: message, ...additionalData }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Create a validation error response (400)
 */
export function validationErrorResponse(
  message: string,
  corsHeaders: ResponseHeaders
): Response {
  return errorResponse(message, corsHeaders, 400);
}

/**
 * Create an unauthorized response (401)
 */
export function unauthorizedResponse(
  message: string = 'Unauthorized',
  corsHeaders: ResponseHeaders
): Response {
  return errorResponse(message, corsHeaders, 401);
}

/**
 * Create a forbidden response (403)
 */
export function forbiddenResponse(
  message: string = 'Forbidden',
  corsHeaders: ResponseHeaders
): Response {
  return errorResponse(message, corsHeaders, 403);
}

/**
 * Create a not found response (404)
 */
export function notFoundResponse(
  message: string = 'Not found',
  corsHeaders: ResponseHeaders
): Response {
  return errorResponse(message, corsHeaders, 404);
}

/**
 * Create a payment required response (402)
 */
export function paymentRequiredResponse(
  message: string,
  corsHeaders: ResponseHeaders,
  credits?: number
): Response {
  return errorResponse(message, corsHeaders, 402, { credits });
}

/**
 * Create a server error response (500)
 */
export function serverErrorResponse(
  message: string = 'Internal server error',
  corsHeaders: ResponseHeaders
): Response {
  return errorResponse(message, corsHeaders, 500);
}
