/**
 * Sentry initialization for Supabase Edge Functions (Deno)
 */

// Note: For Deno edge functions, we'll use Sentry's HTTP API directly
// since @sentry/deno may not be available via JSR. This is a lightweight wrapper.

const SENTRY_DSN = Deno.env.get('SENTRY_DSN');

interface SentryContext {
  user_id?: string;
  brand_id?: string;
  request_id?: string;
  function_name?: string;
  [key: string]: unknown;
}

/**
 * Extract DSN components
 */
function parseDsn(dsn: string): { projectId: string; host: string; publicKey: string } | null {
  try {
    const match = dsn.match(/https:\/\/([^@]+)@([^\/]+)\/(.+)/);
    if (!match) return null;
    return {
      publicKey: match[1],
      host: match[2],
      projectId: match[3],
    };
  } catch {
    return null;
  }
}

/**
 * Send error to Sentry
 */
export async function captureException(
  error: Error,
  context?: SentryContext
): Promise<void> {
  if (!SENTRY_DSN) {
    console.error('Sentry error (SENTRY_DSN not configured):', error);
    return;
  }

  const dsn = parseDsn(SENTRY_DSN);
  if (!dsn) {
    console.error('Invalid Sentry DSN');
    return;
  }

  const event = {
    message: error.message,
    exception: {
      values: [
        {
          type: error.name,
          value: error.message,
          stacktrace: {
            frames: error.stack
              ? error.stack
                  .split('\n')
                  .slice(1)
                  .map((line) => {
                    const match = line.match(/at (.+):(\d+):(\d+)/);
                    if (match) {
                      return {
                        filename: match[1],
                        lineno: parseInt(match[2], 10),
                        colno: parseInt(match[3], 10),
                      };
                    }
                    return { filename: line.trim() };
                  })
              : [],
          },
        },
      ],
    },
    contexts: {
      runtime: {
        name: 'deno',
        version: Deno.version.deno,
      },
    },
    tags: context
      ? Object.entries(context).reduce((acc, [key, value]) => {
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            acc[key] = String(value);
          }
          return acc;
        }, {} as Record<string, string>)
      : {},
    timestamp: new Date().toISOString(),
  };

  try {
    const response = await fetch(
      `https://${dsn.host}/api/${dsn.projectId}/store/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=custom-edge-function/1.0.0`,
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      console.warn('Failed to send error to Sentry:', response.status);
    }
  } catch (err) {
    // Silently fail - don't break the function if Sentry fails
    console.warn('Error sending to Sentry:', err);
  }
}

/**
 * Capture a message (non-error)
 */
export async function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  context?: SentryContext
): Promise<void> {
  if (!SENTRY_DSN) {
    return;
  }

  const error = new Error(message);
  error.name = level === 'error' ? 'Error' : level === 'warning' ? 'Warning' : 'Info';
  await captureException(error, context);
}











