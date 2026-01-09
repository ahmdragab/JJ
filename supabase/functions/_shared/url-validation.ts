/**
 * URL validation utilities for SSRF prevention
 * Blocks internal/private IPs, localhost, and cloud metadata endpoints
 */

interface UrlValidationResult {
  valid: boolean;
  error?: string;
  normalizedUrl?: string;
}

/**
 * Validate that a URL is safe to fetch (prevents SSRF attacks)
 * Blocks:
 * - localhost and loopback addresses (127.x.x.x, ::1)
 * - Private/RFC1918 addresses (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
 * - Link-local addresses (169.254.x.x) including cloud metadata endpoints
 * - Non-HTTP(S) schemes
 */
export function validateExternalUrl(url: string): UrlValidationResult {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required' };
  }

  try {
    // Normalize URL - add https if no scheme
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
    const parsed = new URL(normalizedUrl);

    // Block non-HTTP(S) schemes
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Only HTTP and HTTPS URLs are allowed' };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost variants
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]' ||
      hostname.endsWith('.localhost') ||
      hostname === '0.0.0.0'
    ) {
      return { valid: false, error: 'Localhost URLs are not allowed' };
    }

    // Check for IPv4 addresses
    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const [, a, b, c, d] = ipv4Match.map(Number);

      // Validate each octet is 0-255
      if ([a, b, c, d].some(octet => octet > 255)) {
        return { valid: false, error: 'Invalid IP address format' };
      }

      // 127.0.0.0/8 - Loopback
      if (a === 127) {
        return { valid: false, error: 'Loopback addresses are not allowed' };
      }

      // 10.0.0.0/8 - Private
      if (a === 10) {
        return { valid: false, error: 'Private IP addresses are not allowed' };
      }

      // 172.16.0.0/12 - Private
      if (a === 172 && b >= 16 && b <= 31) {
        return { valid: false, error: 'Private IP addresses are not allowed' };
      }

      // 192.168.0.0/16 - Private
      if (a === 192 && b === 168) {
        return { valid: false, error: 'Private IP addresses are not allowed' };
      }

      // 169.254.0.0/16 - Link-local (includes cloud metadata endpoints)
      if (a === 169 && b === 254) {
        return { valid: false, error: 'Link-local addresses are not allowed' };
      }

      // 0.0.0.0/8 - Current network
      if (a === 0) {
        return { valid: false, error: 'Invalid IP address' };
      }

      // 224.0.0.0/4 - Multicast
      if (a >= 224 && a <= 239) {
        return { valid: false, error: 'Multicast addresses are not allowed' };
      }

      // 240.0.0.0/4 - Reserved
      if (a >= 240) {
        return { valid: false, error: 'Reserved IP addresses are not allowed' };
      }
    }

    // Block common cloud metadata hostnames
    const blockedHostnames = [
      'metadata.google.internal',
      'metadata.google.com',
      'metadata',
      'instance-data',
      'kubernetes.default.svc',
    ];
    if (blockedHostnames.includes(hostname)) {
      return { valid: false, error: 'Cloud metadata endpoints are not allowed' };
    }

    // Block IPv6 private/local addresses
    if (hostname.startsWith('[') || hostname.includes(':')) {
      // Simple check for common private IPv6 patterns
      const lowerHost = hostname.replace(/[\[\]]/g, '').toLowerCase();
      if (
        lowerHost.startsWith('fe80:') ||  // Link-local
        lowerHost.startsWith('fc00:') ||  // Unique local
        lowerHost.startsWith('fd') ||     // Unique local
        lowerHost === '::1' ||            // Loopback
        lowerHost === '::'                // Unspecified
      ) {
        return { valid: false, error: 'Private IPv6 addresses are not allowed' };
      }
    }

    return { valid: true, normalizedUrl: parsed.toString() };
  } catch (e) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Check if a URL points to a valid image host
 * More permissive than validateExternalUrl but still blocks SSRF
 */
export function validateImageUrl(url: string): UrlValidationResult {
  // First do the standard SSRF checks
  const baseValidation = validateExternalUrl(url);
  if (!baseValidation.valid) {
    return baseValidation;
  }

  // Additional checks could go here (e.g., known image CDNs only)
  return baseValidation;
}
