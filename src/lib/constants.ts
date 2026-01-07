/**
 * Shared constants for the application
 */

// API Endpoints
export const API_ENDPOINTS = {
  GENERATE_IMAGE: '/functions/v1/generate-image',
  GENERATE_IMAGE_V2: '/functions/v1/generate-image-v2',
  GENERATE_IMAGE_V3: '/functions/v1/generate-image-v3',
  EDIT_IMAGE: '/functions/v1/edit-image',
  EXTRACT_BRAND: '/functions/v1/extract-brand',
  GENERATE_COPY: '/functions/v1/generate-copy',
  ANALYZE_STYLE: '/functions/v1/analyze-style',
  CREATE_CHECKOUT: '/functions/v1/create-checkout',
} as const;

// Storage Buckets
export const STORAGE_BUCKETS = {
  BRAND_LOGOS: 'brand-logos',
  BRAND_ASSETS: 'brand-assets',
  GENERATED_IMAGES: 'generated-images',
} as const;

// Image Generation Limits
export const IMAGE_LIMITS = {
  MAX_HIGH_FIDELITY: 6,
  MAX_TOTAL_IMAGES: 14,
  MAX_ASSETS: 6,
  MAX_REFERENCES: 8,
} as const;

// Timing Constants (in milliseconds)
export const TIMING = {
  POLLING_INTERVAL: 2000,
  EXTRACTION_STEP_DURATION: 2000,
  DEBOUNCE_DELAY: 300,
  CACHE_DURATION: 24 * 60 * 60 * 1000, // 24 hours
} as const;

// Aspect Ratios
export const ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:4',
  '4:5',
  '9:16',
  '3:2',
  '4:3',
  '5:4',
  '16:9',
  '21:9',
  'auto',
] as const;

export type AspectRatio = typeof ASPECT_RATIOS[number];

// Resolution Levels
export const RESOLUTION_LEVELS = ['1K', '2K', '4K'] as const;
export type ResolutionLevel = typeof RESOLUTION_LEVELS[number];

/**
 * Build full API URL for a Supabase function
 */
export function getApiUrl(endpoint: string): string {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  return `${baseUrl}${endpoint}`;
}

/**
 * Get authorization headers for API calls
 */
export function getAuthHeaders(accessToken?: string): Record<string, string> {
  const token = accessToken || import.meta.env.VITE_SUPABASE_ANON_KEY;
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}
