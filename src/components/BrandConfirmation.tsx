import { useState, useEffect } from 'react';
import { Upload, Check, Loader2, Pencil } from 'lucide-react';
import { Brand, supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { Button } from './ui';
import { Card } from './ui';
import { convertSvgToPng, isSvgFile } from '../lib/imageUtils';

type ConfirmationStep = 'logos' | 'colors';

interface BrandConfirmationProps {
  brand: Brand;
  onConfirm: (updates: Partial<Brand>) => Promise<void>;
  onComplete: () => void;
}

export function BrandConfirmation({ brand, onConfirm, onComplete }: BrandConfirmationProps) {
  const toast = useToast();
  const [currentStep, setCurrentStep] = useState<ConfirmationStep>('logos');
  const [localBrand, setLocalBrand] = useState(brand);
  const [uploadingLogo, setUploadingLogo] = useState<'primary' | 'icon' | null>(null);
  const [saving, setSaving] = useState(false);
  const [reExtractingColors, setReExtractingColors] = useState(false);

  // Update local brand when prop changes
  useEffect(() => {
    setLocalBrand(brand);
  }, [brand]);

  // Get favicon/icon URL
  const getFaviconUrl = () => {
    return localBrand.logos.icon || localBrand.all_logos?.find(l => l.type === 'favicon' || l.type === 'icon')?.url;
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'primary' | 'icon') => {
    let file = e.target.files?.[0];
    if (!file) return;

    const SUPPORTED_TYPES = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/heic',
      'image/heif',
      'image/gif',
      'image/svg+xml',
    ];

    if (!SUPPORTED_TYPES.includes(file.type.toLowerCase()) && !isSvgFile(file)) {
      toast.error('Unsupported Format', 'Please upload: PNG, JPEG, WEBP, HEIC, HEIF, GIF, or SVG only.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('File Too Large', 'File size must be less than 2MB');
      return;
    }

    setUploadingLogo(type);

    try {
      // Convert SVG to PNG (Gemini API doesn't support SVG)
      if (isSvgFile(file)) {
        file = await convertSvgToPng(file, { maxWidth: 1024, maxHeight: 1024 });
      }

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
      toast.error('Upload Failed', 'Failed to upload logo. Please try again.');
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
        toast.warning('No Screenshot', 'No screenshot available for color analysis. Please try manually adjusting the colors.');
        return;
      }

      // Get user session for authenticated request
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-brand-style`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
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
      toast.error('Color Extraction Failed', 'Failed to re-extract colors. Please try again or adjust manually.');
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

  // Checkerboard pattern for transparent backgrounds
  const checkerboardStyle = {
    backgroundImage: 'linear-gradient(45deg, #e4e3e8 25%, transparent 25%), linear-gradient(-45deg, #e4e3e8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e4e3e8 75%), linear-gradient(-45deg, transparent 75%, #e4e3e8 75%)',
    backgroundSize: '16px 16px',
    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
    backgroundColor: '#f8f7f9',
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-neutral-50 page-enter">
      <div className="w-full max-w-2xl">
        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className={`flex items-center gap-2 ${currentStep === 'logos' ? 'text-neutral-800' : 'text-neutral-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                currentStep === 'logos'
                  ? 'bg-brand-primary text-white'
                  : 'bg-neutral-200 text-neutral-500'
              }`}>
                {currentStep === 'colors' ? <Check className="w-4 h-4" /> : '1'}
              </div>
              <span className="text-sm font-medium">Logo & Favicon</span>
            </div>
            <div className="w-12 h-0.5 bg-neutral-200" />
            <div className={`flex items-center gap-2 ${currentStep === 'colors' ? 'text-neutral-800' : 'text-neutral-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                currentStep === 'colors'
                  ? 'bg-brand-primary text-white'
                  : 'bg-neutral-200 text-neutral-500'
              }`}>
                2
              </div>
              <span className="text-sm font-medium">Colors</span>
            </div>
          </div>
        </div>

        {/* Main Card */}
        <Card variant="elevated" rounded="2xl" padding="lg" className="md:p-12">
          {currentStep === 'logos' ? (
            <div className="text-center">
              {/* Question Text */}
              <div className="mb-8">
                <p className="text-neutral-500">Does the logo look accurate? If not, click to upload another.</p>
              </div>

              {/* Logo Upload Section */}
              <div className="grid grid-cols-2 gap-6 mb-8">
                {/* Primary Logo */}
                <div>
                  <label
                    className="relative block aspect-square rounded-2xl border-2 border-dashed border-neutral-200 cursor-pointer group overflow-hidden hover:border-brand-primary/50 transition-all duration-300"
                    style={checkerboardStyle}
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
                      <div className="w-full h-full flex flex-col items-center justify-center text-neutral-400">
                        <Upload className="w-8 h-8 mb-2" />
                        <span className="text-xs font-medium">No logo</span>
                      </div>
                    )}

                    <div className="absolute inset-0 bg-neutral-900/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px]">
                      {uploadingLogo === 'primary' ? (
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                      ) : (
                        <div className="text-center text-white">
                          <Pencil className="w-5 h-5 mx-auto mb-1" />
                          <span className="text-xs font-medium">Replace</span>
                        </div>
                      )}
                    </div>
                  </label>
                  <p className="text-xs text-neutral-500 mt-3 text-center font-medium">Logo</p>
                </div>

                {/* Favicon */}
                <div>
                  <label
                    className="relative block aspect-square rounded-2xl border-2 border-dashed border-neutral-200 cursor-pointer group overflow-hidden hover:border-brand-primary/50 transition-all duration-300"
                    style={checkerboardStyle}
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
                      <div className="w-full h-full flex flex-col items-center justify-center text-neutral-400">
                        <Upload className="w-8 h-8 mb-2" />
                        <span className="text-xs font-medium">No favicon</span>
                      </div>
                    )}

                    <div className="absolute inset-0 bg-neutral-900/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px]">
                      {uploadingLogo === 'icon' ? (
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                      ) : (
                        <div className="text-center text-white">
                          <Pencil className="w-5 h-5 mx-auto mb-1" />
                          <span className="text-xs font-medium">Replace</span>
                        </div>
                      )}
                    </div>
                  </label>
                  <p className="text-xs text-neutral-500 mt-3 text-center font-medium">Favicon</p>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex justify-center">
                <Button size="lg" onClick={handleContinue}>
                  Looks Good
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-neutral-800 mb-2 font-heading">
                Confirm Colors
              </h2>
              <p className="text-neutral-500 mb-8">Do these colors look accurate? Click to edit any of them.</p>

              {/* Color Palette */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                {['primary', 'secondary', 'background', 'surface', 'text_primary'].map((key) => {
                  const color = localBrand.colors[key as keyof typeof localBrand.colors] || '#e5e5e5';
                  const isLight = isLightColor(color);

                  return (
                    <div key={key} className="space-y-2">
                      <label className="relative block aspect-square rounded-2xl cursor-pointer group overflow-hidden transition-all hover:scale-105 hover:shadow-lg">
                        <input
                          type="color"
                          value={color}
                          onChange={(e) => handleColorUpdate(key, e.target.value)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div
                          className="w-full h-full flex flex-col justify-end p-3 transition-all"
                          style={{ backgroundColor: color }}
                        >
                          <div className={`text-[10px] font-mono font-medium ${isLight ? 'text-black/70' : 'text-white/70'}`}>
                            {color.toUpperCase()}
                          </div>
                        </div>
                        <div
                          className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-100 pointer-events-none"
                          style={{ backgroundColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.25)' }}
                        >
                          <Pencil className={`w-3 h-3 ${isLight ? 'text-black/70' : 'text-white/70'}`} />
                        </div>
                      </label>
                      <p className="text-xs text-neutral-500 text-center capitalize font-medium">
                        {key.replace(/_/g, ' ')}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-center gap-3">
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={handleReExtractColors}
                  disabled={reExtractingColors || (!localBrand.styleguide?.ai_extracted_colors && !localBrand.screenshot)}
                  loading={reExtractingColors}
                  className="border border-neutral-200"
                >
                  {reExtractingColors ? 'Retrying...' : 'Retry'}
                </Button>
                <Button
                  size="lg"
                  onClick={handleContinue}
                  disabled={saving || reExtractingColors}
                  loading={saving}
                >
                  {saving ? 'Saving...' : 'Looks Good'}
                </Button>
              </div>
            </div>
          )}
        </Card>
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
