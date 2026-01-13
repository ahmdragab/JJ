/**
 * Authentication utilities for Supabase Edge Functions
 */
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface AuthResult {
  userId: string | null;
  error: string | null;
}

/**
 * Extract user ID from the request's Authorization header
 * Uses Supabase auth.getUser() to verify the JWT token
 */
export async function getUserIdFromRequest(
  request: Request,
  supabase: SupabaseClient
): Promise<AuthResult> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return { userId: null, error: 'Missing Authorization header' };
  }

  // Extract the token from "Bearer <token>" - use split for proper parsing
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return { userId: null, error: 'Invalid Authorization header format. Expected: Bearer <token>' };
  }

  const token = parts[1];
  if (!token) {
    return { userId: null, error: 'Missing token in Authorization header' };
  }

  try {
    // Verify the token and get user info
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return { userId: null, error: error?.message || 'Invalid or expired token' };
    }

    return { userId: user.id, error: null };
  } catch (err) {
    return { userId: null, error: 'Failed to verify authentication token' };
  }
}

/**
 * Verify that a brand belongs to the authenticated user
 */
export async function verifyBrandOwnership(
  supabase: SupabaseClient,
  brandId: string,
  userId: string
): Promise<{ owned: boolean; brand: unknown | null }> {
  const { data: brand, error } = await supabase
    .from('brands')
    .select('*')
    .eq('id', brandId)
    .eq('user_id', userId)
    .single();

  if (error || !brand) {
    return { owned: false, brand: null };
  }

  return { owned: true, brand };
}

/**
 * Verify that an image belongs to the authenticated user
 */
export async function verifyImageOwnership(
  supabase: SupabaseClient,
  imageId: string,
  userId: string
): Promise<{ owned: boolean; image: unknown | null }> {
  const { data: image, error } = await supabase
    .from('images')
    .select('*')
    .eq('id', imageId)
    .eq('user_id', userId)
    .single();

  if (error || !image) {
    return { owned: false, image: null };
  }

  return { owned: true, image };
}

/**
 * Create an unauthorized response
 */
export function unauthorizedResponse(
  message: string,
  corsHeaders: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Create a forbidden response (authenticated but not authorized)
 */
export function forbiddenResponse(
  message: string,
  corsHeaders: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Check if the request is using the service role key (server-to-server call)
 * This allows internal edge functions to call each other without user auth
 */
export function isServiceRoleRequest(request: Request): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return false;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return false;

  const token = parts[1];
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  return token === serviceRoleKey;
}
