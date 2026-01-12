/**
 * Resilient fetch utility with retry logic and user-friendly error messages
 * Designed to handle flaky mobile network connections
 */

export interface ResilientFetchOptions extends RequestInit {
  /** Number of retry attempts (default: 2) */
  retries?: number;
  /** Delay between retries in ms (default: 1000) */
  retryDelay?: number;
  /** Request timeout in ms (default: 60000 for 60s) */
  timeout?: number;
}

/**
 * Sanitize error messages to remove sensitive information like Supabase URLs
 */
export function sanitizeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // Remove Supabase project URLs/IDs
  let sanitized = message.replace(/https?:\/\/[a-z0-9]+\.supabase\.co[^\s]*/gi, '[server]');

  // Remove any remaining Supabase references with project IDs
  sanitized = sanitized.replace(/\([a-z0-9]+\.supabase\.co\)/gi, '');

  // Clean up common network error messages for user-friendliness
  if (sanitized.toLowerCase().includes('load failed') ||
      sanitized.toLowerCase().includes('failed to fetch') ||
      sanitized.toLowerCase().includes('networkerror')) {
    return 'Network connection failed. Please check your internet connection and try again.';
  }

  if (sanitized.toLowerCase().includes('timeout') ||
      sanitized.toLowerCase().includes('aborted')) {
    return 'Request timed out. Please check your connection and try again.';
  }

  // Clean up empty parentheses left after sanitization
  sanitized = sanitized.replace(/\s*\(\s*\)/g, '').trim();

  return sanitized || 'An unexpected error occurred. Please try again.';
}

/**
 * Check if an error is a network-related error that should trigger a retry
 */
function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();
    return message.includes('failed to fetch') ||
           message.includes('load failed') ||
           message.includes('networkerror') ||
           message.includes('network request failed');
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  return false;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with automatic retry on network failures
 * Designed to handle flaky mobile connections
 */
export async function resilientFetch(
  url: string,
  options: ResilientFetchOptions = {}
): Promise<Response> {
  const {
    retries = 2,
    retryDelay = 1000,
    timeout = 60000,
    ...fetchOptions
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error instanceof Error ? error : new Error(String(error));

      // Only retry on network errors, not on other errors
      if (isNetworkError(error) && attempt < retries) {
        // Exponential backoff: 1s, 2s, 4s...
        const delay = retryDelay * Math.pow(2, attempt);
        console.warn(`Network error on attempt ${attempt + 1}, retrying in ${delay}ms...`, error);
        await sleep(delay);
        continue;
      }

      throw error;
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError || new Error('Request failed after retries');
}

/**
 * Wrapper for Supabase Edge Function calls with retry logic
 */
export async function callEdgeFunction<T = unknown>(
  functionName: string,
  options: {
    headers: Record<string, string>;
    body: unknown;
    retries?: number;
    timeout?: number;
  }
): Promise<{ data: T | null; error: string | null; response: Response }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const url = `${supabaseUrl}/functions/v1/${functionName}`;

  try {
    const response = await resilientFetch(url, {
      method: 'POST',
      headers: options.headers,
      body: JSON.stringify(options.body),
      retries: options.retries ?? 2,
      timeout: options.timeout ?? 60000,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        data: null,
        error: data.error || `Request failed with status ${response.status}`,
        response,
      };
    }

    return { data, error: null, response };
  } catch (error) {
    return {
      data: null,
      error: sanitizeErrorMessage(error),
      response: new Response(null, { status: 0 }),
    };
  }
}
