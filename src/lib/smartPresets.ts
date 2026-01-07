import { Brand, getAuthHeaders } from './supabase';

export type AspectRatio = '1:1' | '2:3' | '3:4' | '4:5' | '9:16' | '3:2' | '4:3' | '5:4' | '16:9' | '21:9' | 'auto';

export interface SmartPreset {
  id: string;
  icon: string;
  label: string;
  category: string;
  aspectRatio: AspectRatio;
  prompt: string;
  smartContext?: {
    whyRelevant: string;
  };
}

// Cache presets per brand (since brand doesn't change often)
const presetCache = new Map<string, { presets: SmartPreset[]; timestamp: number }>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// localStorage key helper
function getStorageKey(brandId: string): string {
  return `smart-presets-${brandId}`;
}

// Load presets from localStorage
function loadPresetsFromStorage(brandId: string): SmartPreset[] | null {
  try {
    const storageKey = getStorageKey(brandId);
    const stored = localStorage.getItem(storageKey);
    if (!stored) return null;
    
    const parsed = JSON.parse(stored);
    // Check if cache is still valid
    if (parsed.timestamp && Date.now() - parsed.timestamp < CACHE_DURATION) {
      return parsed.presets;
    }
    // Cache expired, remove it
    localStorage.removeItem(storageKey);
    return null;
  } catch (error) {
    console.error('Failed to load presets from localStorage:', error);
    return null;
  }
}

// Save presets to localStorage
function savePresetsToStorage(brandId: string, presets: SmartPreset[]): void {
  try {
    const storageKey = getStorageKey(brandId);
    localStorage.setItem(storageKey, JSON.stringify({
      presets,
      timestamp: Date.now(),
    }));
  } catch (error) {
    console.error('Failed to save presets to localStorage:', error);
    // localStorage might be full or disabled, continue without it
  }
}

export async function generateSmartPresets(brand: Brand): Promise<SmartPreset[]> {
  const cacheKey = brand.id;
  
  // 1. Check in-memory cache first (fastest)
  const cached = presetCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log('Using in-memory cached presets for brand:', brand.name);
    return cached.presets;
  }

  // 2. Check localStorage cache (survives page refresh)
  const storedPresets = loadPresetsFromStorage(cacheKey);
  if (storedPresets && storedPresets.length > 0) {
    console.log('Using localStorage cached presets for brand:', brand.name);
    // Also update in-memory cache
    presetCache.set(cacheKey, { presets: storedPresets, timestamp: Date.now() });
    return storedPresets;
  }

  // 3. Fetch from API
  try {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-smart-presets`,
      {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ brandId: brand.id }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success || !data.presets) {
      throw new Error('Invalid response from presets API');
    }

    const presets: SmartPreset[] = data.presets;
    
    // Cache the results in both memory and localStorage
    presetCache.set(cacheKey, { presets, timestamp: Date.now() });
    savePresetsToStorage(cacheKey, presets);
    
    console.log(`Generated ${presets.length} smart presets for ${brand.name} (source: ${data.source})`);
    
    return presets;
  } catch (error) {
    console.error('Failed to generate smart presets:', error);
    
    // 4. Fallback: Try to return stale cache if available (better than nothing)
    const staleStored = loadPresetsFromStorage(cacheKey);
    if (staleStored && staleStored.length > 0) {
      console.warn('API failed, using stale cached presets');
      return staleStored;
    }
    
    // 5. Last resort: return empty array (UI will handle gracefully)
    return [];
  }
}







