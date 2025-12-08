import { Brand } from './supabase';

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

export async function generateSmartPresets(brand: Brand): Promise<SmartPreset[]> {
  // Check cache first
  const cacheKey = brand.id;
  const cached = presetCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log('Using cached presets for brand:', brand.name);
    return cached.presets;
  }

  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-smart-presets`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
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
    
    // Cache the results
    presetCache.set(cacheKey, { presets, timestamp: Date.now() });
    
    console.log(`Generated ${presets.length} smart presets for ${brand.name} (source: ${data.source})`);
    
    return presets;
  } catch (error) {
    console.error('Failed to generate smart presets:', error);
    // Return empty array on error - UI will handle gracefully
    return [];
  }
}




