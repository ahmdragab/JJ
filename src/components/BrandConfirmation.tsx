import { useState, useEffect } from 'react';
import { Upload, Check, Loader2, Pencil } from 'lucide-react';
import { Brand, supabase } from '../lib/supabase';
import { PRIMARY_COLOR, SECONDARY_COLOR } from '../lib/colors';

type ConfirmationStep = 'logos' | 'colors';

interface BrandConfirmationProps {
  brand: Brand;
  onConfirm: (updates: Partial<Brand>) => Promise<void>;
  onComplete: () => void;
}

export function BrandConfirmation({ brand, onConfirm, onComplete }: BrandConfirmationProps) {
  const [currentStep, setCurrentStep] = useState<ConfirmationStep>('logos');
  const [localBrand, setLocalBrand] = useState(brand);
  const [uploadingLogo, setUploadingLogo] = useState<'primary' | 'icon' | null>(null);
  const [saving, setSaving] = useState(false);
  const [reExtractingColors, setReExtractingColors] = useState(false);

  // Update local brand when prop changes
  useEffect(() => {
    setLocalBrand(brand);
  }, [brand]);

  // Use fixed brand colors instead of brand's extracted colors
  const primaryColor = PRIMARY_COLOR;
  const secondaryColor = SECONDARY_COLOR;

  // Get favicon/icon URL
  const getFaviconUrl = () => {
    return localBrand.logos.icon || localBrand.all_logos?.find(l => l.type === 'favicon' || l.type === 'icon')?.url;
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'primary' | 'icon') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const SUPPORTED_TYPES = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/heic',
      'image/heif',
      'image/gif',
    ];
    
    if (!SUPPORTED_TYPES.includes(file.type.toLowerCase())) {
      alert(`Unsupported file format. Please upload: PNG, JPEG, WEBP, HEIC, HEIF, or GIF only.`);
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('File size must be less than 2MB');
      return;
    }

    setUploadingLogo(type);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${brand.id}/${type}-${Date.now()}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('brand-logos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('brand-logos')
        .getPublicUrl(data.path);

      const logoUrl = urlData.publicUrl;

      const updated = {
        ...localBrand,
        logos: { 
          ...localBrand.logos, 
          [type]: logoUrl,
        },
      };

      setLocalBrand(updated);
      await onConfirm(updated);
    } catch (error) {
      console.error('Logo upload failed:', error);
      alert('Failed to upload logo. Please try again.');
    } finally {
      setUploadingLogo(null);
      e.target.value = '';
    }
  };

  const handleColorUpdate = (key: string, value: string) => {
    const updated = {
      ...localBrand,
      colors: { ...localBrand.colors, [key]: value },
    };
    setLocalBrand(updated);
  };

  /**
   * Use AI-extracted colors (pre-computed during brand analysis)
   * Falls back to API call if not available yet
   */
  const handleReExtractColors = async () => {
    setReExtractingColors(true);

    try {
      // First, check if we have pre-computed AI colors in styleguide
      const aiExtractedColors = localBrand.styleguide?.ai_extracted_colors;

      if (aiExtractedColors && aiExtractedColors.primary) {
        // Use pre-computed colors (no API call needed!)
        console.log('Using pre-computed AI colors from styleguide');
        
        const updated = {
          ...localBrand,
          colors: aiExtractedColors,
        };
        setLocalBrand(updated);
        
        // Save to database
        await onConfirm({ colors: aiExtractedColors });
        return;
      }

      // Fallback: AI analysis hasn't completed yet, make API call
      console.log('AI colors not available yet, calling API...');
      
      if (!localBrand.screenshot) {
        alert('No screenshot available for color analysis. Please try manually adjusting the colors.');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-brand-style`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            brandId: brand.id,
            screenshotUrl: localBrand.screenshot,
            logoUrl: localBrand.logos.primary || localBrand.logos.icon,
            extractColorsOnly: true,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze colors');
      }

      const { extracted_colors } = await response.json();

      if (extracted_colors) {
        const updated = {
          ...localBrand,
          colors: extracted_colors,
        };
        setLocalBrand(updated);
        await onConfirm({ colors: extracted_colors });
      }
    } catch (error) {
      console.error('Color re-extraction failed:', error);
      alert('Failed to re-extract colors. Please try again or adjust manually.');
    } finally {
      setReExtractingColors(false);
    }
  };

  const handleContinue = async () => {
    if (currentStep === 'logos') {
      setCurrentStep('colors');
    } else {
      setSaving(true);
      await onConfirm(localBrand);
      setSaving(false);
      onComplete();
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#F8F7F9' }}>
      <div className="w-full max-w-2xl">
        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className={`flex items-center gap-2 ${currentStep === 'logos' ? 'text-slate-900' : 'text-slate-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep === 'logos' 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-slate-200 text-slate-400'
              }`}>
                {currentStep === 'colors' ? <Check className="w-4 h-4" /> : '1'}
              </div>
              <span className="text-sm font-medium">Logo & Favicon</span>
            </div>
            <div className="w-12 h-0.5 bg-slate-200"></div>
            <div className={`flex items-center gap-2 ${currentStep === 'colors' ? 'text-slate-900' : 'text-slate-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep === 'colors' 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-slate-200 text-slate-400'
              }`}>
                2
              </div>
              <span className="text-sm font-medium">Colors</span>
            </div>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-8 md:p-12">
          {currentStep === 'logos' ? (
            <div className="text-center">
              {/* Question Text */}
              <div className="mb-8">
                <p className="text-slate-500 mb-8">Does the logo look accurate? If not, click to upload another.</p>
              </div>

              {/* Logo Upload Section */}
              <div className="grid grid-cols-2 gap-4 mb-8">
                {/* Primary Logo */}
                <div>
                  <label 
                    className="relative block aspect-square rounded-xl border border-slate-200 cursor-pointer group overflow-hidden hover:border-purple-500 transition-colors"
                    style={{
                      backgroundImage: 'linear-gradient(45deg, #f0f0f0 25%, transparent 25%), linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f0f0f0 75%), linear-gradient(-45deg, transparent 75%, #f0f0f0 75%)',
                      backgroundSize: '20px 20px',
                      backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                      backgroundColor: '#f8f8f8',
                    }}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleLogoUpload(e, 'primary')}
                      className="hidden"
                      disabled={uploadingLogo === 'primary'}
                    />
                    
                    {localBrand.logos.primary ? (
                      <img
                        src={localBrand.logos.primary}
                        alt="Brand logo"
                        className="w-full h-full object-contain p-4"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                        <Upload className="w-8 h-8 mb-2" />
                        <span className="text-xs">No logo</span>
                      </div>
                    )}
                    
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      {uploadingLogo === 'primary' ? (
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                      ) : (
                        <div className="text-center text-white">
                          <Pencil className="w-5 h-5 mx-auto mb-1" />
                          <span className="text-xs">Replace</span>
                        </div>
                      )}
                    </div>
                  </label>
                  <p className="text-xs text-slate-500 mt-2 text-center">Logo</p>
                </div>

                {/* Favicon */}
                <div>
                  <label 
                    className="relative block aspect-square rounded-xl border border-slate-200 cursor-pointer group overflow-hidden hover:border-purple-500 transition-colors"
                    style={{
                      backgroundImage: 'linear-gradient(45deg, #f0f0f0 25%, transparent 25%), linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f0f0f0 75%), linear-gradient(-45deg, transparent 75%, #f0f0f0 75%)',
                      backgroundSize: '20px 20px',
                      backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                      backgroundColor: '#f8f8f8',
                    }}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleLogoUpload(e, 'icon')}
                      className="hidden"
                      disabled={uploadingLogo === 'icon'}
                    />
                    
                    {getFaviconUrl() ? (
                      <img
                        src={getFaviconUrl()}
                        alt="Favicon"
                        className="w-full h-full object-contain p-6"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                        <Upload className="w-8 h-8 mb-2" />
                        <span className="text-xs">No favicon</span>
                      </div>
                    )}
                    
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      {uploadingLogo === 'icon' ? (
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                      ) : (
                        <div className="text-center text-white">
                          <Pencil className="w-5 h-5 mx-auto mb-1" />
                          <span className="text-xs">Replace</span>
                        </div>
                      )}
                    </div>
                  </label>
                  <p className="text-xs text-slate-500 mt-2 text-center">Favicon</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-center">
                <button
                  onClick={handleContinue}
                  className="px-6 py-3 rounded-full text-white font-medium transition-all"
                  style={{ 
                    background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
                  }}
                >
                  Looks Good
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-slate-900 mb-2">
                Confirm Colors
              </h2>
              <p className="text-slate-500 mb-8">Do these colors look accurate? Click to edit any of them.</p>

              {/* Color Palette */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                {['primary', 'secondary', 'background', 'surface', 'text_primary'].map((key) => {
                  const color = localBrand.colors[key as keyof typeof localBrand.colors] || '#e5e5e5';
                  const isLight = isLightColor(color);
                  
                  return (
                    <div key={key} className="space-y-2">
                      <label className="relative block aspect-square rounded-xl cursor-pointer group overflow-hidden transition-all">
                        <input
                          type="color"
                          value={color}
                          onChange={(e) => handleColorUpdate(key, e.target.value)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div 
                          className="w-full h-full flex flex-col justify-end p-3"
                          style={{ backgroundColor: color }}
                        >
                          <div className={`text-xs font-mono ${isLight ? 'text-black/80' : 'text-white/80'}`}>
                            {color.toUpperCase()}
                          </div>
                        </div>
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all scale-75 opacity-0 group-hover:scale-100 group-hover:opacity-100 pointer-events-none"
                          style={{ backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)' }}
                        >
                          <Pencil className={`w-3 h-3 ${isLight ? 'text-black/60' : 'text-white/60'}`} />
                        </div>
                      </label>
                      <p className="text-xs text-slate-500 text-center capitalize">
                        {key.replace(/_/g, ' ')}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-center gap-3">
                <button
                  onClick={handleReExtractColors}
                  disabled={reExtractingColors || (!localBrand.styleguide?.ai_extracted_colors && !localBrand.screenshot)}
                  className="px-6 py-3 rounded-full font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-slate-300 text-slate-700 hover:bg-slate-50"
                  title={(!localBrand.styleguide?.ai_extracted_colors && !localBrand.screenshot) ? 'No screenshot available for color re-extraction' : 'Re-extract colors using AI'}
                >
                  {reExtractingColors ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Retrying...
                    </span>
                  ) : (
                    'Retry'
                  )}
                </button>
                <button
                  onClick={handleContinue}
                  disabled={saving || reExtractingColors}
                  className="px-6 py-3 rounded-full text-white font-medium transition-all disabled:opacity-50"
                  style={{ 
                    background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
                  }}
                >
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    'Looks Good'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper function to determine if a color is light
function isLightColor(hex: string): boolean {
  const c = hex.substring(1);
  const rgb = parseInt(c, 16);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = (rgb >> 0) & 0xff;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luma > 160;
}
