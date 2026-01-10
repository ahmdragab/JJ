import { useState, useEffect, useRef, ReactNode } from 'react';
import { ArrowLeft, Loader2, Check, Pencil, RefreshCw, Upload, X, Trash2, Plus, Image as ImageIcon, Palette, Globe, Type, BarChart2, Sparkles, ArrowRight } from 'lucide-react';
import { Brand, BrandAsset, supabase } from '../lib/supabase';
import { useToast } from '../components/Toast';
import { Button, Select } from '../components/ui';
import { convertSvgToPng, isSvgFile } from '../lib/imageUtils';

type BrandSection = 'colors' | 'fonts' | 'logos' | 'voice';

// Utility function to load Google Fonts dynamically
function loadGoogleFont(fontFamily: string): void {
  if (!fontFamily) return;
  
  // Check if font is already loaded
  const fontId = `google-font-${fontFamily.replace(/\s+/g, '-').toLowerCase()}`;
  if (document.getElementById(fontId)) return;
  
  // Format font name for Google Fonts API (replace spaces with +)
  const fontName = fontFamily.replace(/\s+/g, '+');
  
  // Create and append link element
  const link = document.createElement('link');
  link.id = fontId;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${fontName}:wght@300;400;500;600;700;800&display=swap`;
  document.head.appendChild(link);
}

export function BrandKitEditor({
  brand,
  onUpdate,
  onReExtract,
  onContinue,
  onBack: _onBack,
}: {
  brand: Brand;
  onUpdate: (updates: Partial<Brand>) => void;
  onReExtract: () => Promise<Partial<Brand> | null>;
  onContinue: () => void;
  onBack: () => void;
}) {
  void _onBack; // Navigation handled by parent
  const toast = useToast();
  const [localBrand, setLocalBrand] = useState(brand);
  const [saving, setSaving] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUpdatingRef = useRef(false);
  
  // Comparison mode state
  const [alternativeBrand, setAlternativeBrand] = useState<Partial<Brand> | null>(null);
  const [isReExtracting, setIsReExtracting] = useState(false);
  
  // Extraction loading state
  const [currentExtractionStep, setCurrentExtractionStep] = useState(0);
  const [selections, setSelections] = useState<Record<BrandSection, 'original' | 'alternative'>>({
    colors: 'original',
    fonts: 'original',
    logos: 'original',
    voice: 'original',
  });

  // Asset Library state
  const [brandAssets, setBrandAssets] = useState<BrandAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newAssetType, setNewAssetType] = useState<'asset' | 'reference'>('asset');
  const [newAssetName, setNewAssetName] = useState('');
  const [newAssetCategory, setNewAssetCategory] = useState('');
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);

  useEffect(() => {
    // Only reset localBrand if we're not in the middle of an update
    // This prevents losing unsaved changes when switching tabs
    if (!isUpdatingRef.current) {
      setLocalBrand(brand);
    }
  }, [brand]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Fetch brand assets
  useEffect(() => {
    const fetchAssets = async () => {
      setLoadingAssets(true);
      const { data, error } = await supabase
        .from('brand_assets')
        .select('*')
        .eq('brand_id', brand.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setBrandAssets(data as BrandAsset[]);
      }
      setLoadingAssets(false);
    };

    fetchAssets();
  }, [brand.id, brand.status]); // Refetch when status changes (e.g., from 'extracting' to 'ready')

  // Animate extraction steps
  useEffect(() => {
    if (brand.status === 'extracting') {
      const interval = setInterval(() => {
        setCurrentExtractionStep((prev) => (prev + 1) % 6);
      }, 2000); // Change step every 2 seconds

      return () => clearInterval(interval);
    } else {
      setCurrentExtractionStep(0);
    }
  }, [brand.status]);

  // Load Google Fonts dynamically when brand fonts change
  useEffect(() => {
    // Load heading font if it exists
    if (localBrand.fonts.heading) {
      loadGoogleFont(localBrand.fonts.heading);
    }
    
    // Load body font if it exists and is different from heading
    if (localBrand.fonts.body && localBrand.fonts.body !== localBrand.fonts.heading) {
      loadGoogleFont(localBrand.fonts.body);
    }

    // Also load fonts from alternative brand if in comparison mode
    if (alternativeBrand) {
      if (alternativeBrand.fonts?.heading) {
        loadGoogleFont(alternativeBrand.fonts.heading);
      }
      if (alternativeBrand.fonts?.body && alternativeBrand.fonts.body !== alternativeBrand.fonts.heading) {
        loadGoogleFont(alternativeBrand.fonts.body);
      }
    }
  }, [localBrand.fonts.heading, localBrand.fonts.body, alternativeBrand]);

  // Handle asset upload
  const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;

    // Validate file type - Gemini API supports: PNG, JPEG, WEBP, HEIC, HEIF, GIF
    // SVG is converted to PNG automatically
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
      toast.error('Unsupported Format', `Please upload: PNG, JPEG, WEBP, HEIC, HEIF, GIF, or SVG only. File: ${file.name}`);
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File Too Large', 'File size must be less than 5MB');
      return;
    }

    setUploadingAsset(true);

    try {
      // Convert SVG to PNG (Gemini API doesn't support SVG)
      if (isSvgFile(file)) {
        file = await convertSvgToPng(file, { maxWidth: 2048, maxHeight: 2048 });
      }

      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${brand.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('brand-assets')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('brand-assets')
        .getPublicUrl(uploadData.path);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create asset record
      const { data: assetData, error: assetError } = await supabase
        .from('brand_assets')
        .insert({
          brand_id: brand.id,
          user_id: user.id,
          name: newAssetName || file.name.replace(/\.[^/.]+$/, ''),
          url: urlData.publicUrl,
          type: newAssetType,
          category: newAssetCategory || null,
          file_size: file.size,
          mime_type: file.type,
        })
        .select()
        .single();

      if (assetError) throw assetError;

      // Add to local state
      setBrandAssets(prev => [assetData as BrandAsset, ...prev]);
      
      // Reset form
      setShowUploadModal(false);
      setNewAssetName('');
      setNewAssetCategory('');
      setNewAssetType('asset');
    } catch (error) {
      console.error('Asset upload failed:', error);
      toast.error('Upload Failed', 'Failed to upload asset. Please try again.');
    } finally {
      setUploadingAsset(false);
      e.target.value = '';
    }
  };

  // Handle asset deletion
  const handleDeleteAsset = async (asset: BrandAsset) => {
    if (!confirm(`Delete "${asset.name}"? This cannot be undone.`)) return;

    setDeletingAssetId(asset.id);

    try {
      // Delete from storage (extract path from URL)
      const urlParts = asset.url.split('/brand-assets/');
      if (urlParts.length > 1) {
        await supabase.storage.from('brand-assets').remove([urlParts[1]]);
      }

      // Delete from database
      const { error } = await supabase
        .from('brand_assets')
        .delete()
        .eq('id', asset.id);

      if (error) throw error;

      // Remove from local state
      setBrandAssets(prev => prev.filter(a => a.id !== asset.id));
    } catch (error) {
      console.error('Failed to delete asset:', error);
      toast.error('Delete Failed', 'Failed to delete asset.');
    } finally {
      setDeletingAssetId(null);
    }
  };

  // Handle re-extraction
  const handleReExtract = async () => {
    console.log('Re-extract button clicked');
    setIsReExtracting(true);
    try {
      const result = await onReExtract();
      console.log('Re-extract result:', result);
      if (result) {
        setAlternativeBrand(result);
      } else {
        console.error('Re-extraction returned null');
      }
    } catch (error) {
      console.error('Re-extraction error:', error);
    }
    setIsReExtracting(false);
  };

  // Apply selections to local brand
  const applySelection = (section: BrandSection, choice: 'original' | 'alternative') => {
    setSelections(prev => ({ ...prev, [section]: choice }));
    
    if (!alternativeBrand) return;
    
    const source = choice === 'alternative' ? alternativeBrand : brand;
    
    switch (section) {
      case 'colors':
        if (source.colors) {
          setLocalBrand(prev => ({ ...prev, colors: source.colors! }));
        }
        break;
      case 'fonts':
        if (source.fonts) {
          setLocalBrand(prev => ({ ...prev, fonts: source.fonts! }));
        }
        break;
      case 'logos':
        if (source.logos) {
          setLocalBrand(prev => ({ 
            ...prev, 
            logos: source.logos!,
            all_logos: source.all_logos || prev.all_logos,
          }));
        }
        break;
      case 'voice':
        if (source.voice) {
          setLocalBrand(prev => ({ ...prev, voice: source.voice! }));
        }
        break;
    }
  };

  const [uploadingLogo, setUploadingLogo] = useState<'primary' | 'icon' | null>(null);

  const updateColor = (key: string, value: string) => {
    isUpdatingRef.current = true;
    const updated = {
      ...localBrand,
      colors: { ...localBrand.colors, [key]: value },
    };
    setLocalBrand(updated);
    
    // Auto-save after a short delay (debounced)
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await onUpdate(updated);
        isUpdatingRef.current = false;
      } catch (error) {
        console.error('Failed to auto-save color:', error);
        isUpdatingRef.current = false;
      }
    }, 500); // Save 500ms after last change
  };

  const updateFont = (key: string, value: string) => {
    isUpdatingRef.current = true;
    const updated = {
      ...localBrand,
      fonts: { ...localBrand.fonts, [key]: value },
    };
    setLocalBrand(updated);
    
    // Auto-save after a short delay (debounced)
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await onUpdate(updated);
        isUpdatingRef.current = false;
      } catch (error) {
        console.error('Failed to auto-save font:', error);
        isUpdatingRef.current = false;
      }
    }, 500); // Save 500ms after last change
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'primary' | 'icon') => {
    let file = e.target.files?.[0];
    if (!file) return;

    // Validate file type - Gemini API supports: PNG, JPEG, WEBP, HEIC, HEIF, GIF
    // SVG is converted to PNG automatically
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
      toast.error('Unsupported Format', `Please upload: PNG, JPEG, WEBP, HEIC, HEIF, GIF, or SVG only. File: ${file.name}`);
      return;
    }

    // Validate file size (max 2MB)
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

      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${brand.id}/${type}-${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('brand-logos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        console.error('Storage upload error:', error);
        // Check if bucket doesn't exist
        if (error.message?.includes('Bucket') || error.message?.includes('bucket')) {
          throw new Error('Storage bucket not found. Please contact support or run database migrations.');
        }
        throw error;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('brand-logos')
        .getPublicUrl(data.path);

      const logoUrl = urlData.publicUrl;

      // Update the appropriate logo field
      setLocalBrand({
        ...localBrand,
        logos: { 
          ...localBrand.logos, 
          [type]: logoUrl,
        },
      });
      
      // Auto-save the logo update
      await handleSave({
        ...localBrand,
        logos: { 
          ...localBrand.logos, 
          [type]: logoUrl,
        },
      });
    } catch (error) {
      console.error('Logo upload failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Upload Failed', `Failed to upload logo: ${errorMessage}`);
    } finally {
      setUploadingLogo(null);
      // Reset input
      e.target.value = '';
    }
  };

  const handleSave = async (brandToSave: Brand = localBrand) => {
    isUpdatingRef.current = true;
    try {
      await onUpdate(brandToSave);
      isUpdatingRef.current = false;
    } catch (error) {
      console.error('Failed to save:', error);
      isUpdatingRef.current = false;
    }
  };

  const handleSaveAndContinue = async () => {
    setSaving(true);
    await onUpdate(localBrand);
    setSaving(false);
    onContinue();
  };

  // Use fixed brand colors from design system
  const primaryColor = '#3531B7';
  const secondaryColor = '#5B57D1';

  // Exit comparison mode and apply selections
  const handleApplySelections = () => {
    // localBrand already has the selections applied via applySelection
    // Just close comparison mode
    setAlternativeBrand(null);
  };

  // Cancel comparison and revert to original
  const handleCancelComparison = () => {
    setLocalBrand(brand);
    setAlternativeBrand(null);
    setSelections({
      colors: 'original',
      fonts: 'original',
      logos: 'original',
      voice: 'original',
    });
  };

  // Full-page comparison view
  if (alternativeBrand) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#F8F7F9' }}>
        {/* Comparison Header */}
        <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-neutral-200">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <button
              onClick={handleCancelComparison}
              className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Cancel</span>
            </button>
            <div className="text-center">
              <h1 className="text-lg font-semibold text-neutral-900">Compare Extractions</h1>
              <p className="text-xs text-neutral-500">Select the best version for each section</p>
            </div>
            <button
              onClick={handleApplySelections}
              className="px-5 py-2 rounded-full text-white text-sm font-medium shadow-lg hover:shadow-xl transition-all"
              style={{ 
                background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
              }}
            >
              Apply Selections
            </button>
          </div>
        </nav>

        <main className="max-w-6xl mx-auto px-6 py-12">
          {/* Colors Comparison */}
          <section className="mb-16">
            <h2 className="text-xs uppercase tracking-[0.2em] text-neutral-400 mb-6">Colors</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <ComparisonCard
                label="Original"
                isSelected={selections.colors === 'original'}
                onSelect={() => applySelection('colors', 'original')}
                primaryColor={primaryColor}
              >
                <div className="flex gap-2 h-20">
                  {['primary', 'secondary', 'background', 'text_primary'].map((key) => (
                    <div
                      key={key}
                      className="flex-1 rounded-xl flex flex-col justify-end p-2"
                      style={{ backgroundColor: brand.colors[key as keyof typeof brand.colors] || '#e5e5e5' }}
                    >
                      <span className={`text-[9px] uppercase tracking-wider ${isLightColor(brand.colors[key as keyof typeof brand.colors] || '#e5e5e5') ? 'text-black/40' : 'text-white/40'}`}>
                        {key.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </ComparisonCard>
              <ComparisonCard
                label="Alternative"
                isSelected={selections.colors === 'alternative'}
                onSelect={() => applySelection('colors', 'alternative')}
                primaryColor={primaryColor}
              >
                <div className="flex gap-2 h-20">
                  {['primary', 'secondary', 'background', 'text_primary'].map((key) => (
                    <div
                      key={key}
                      className="flex-1 rounded-xl flex flex-col justify-end p-2"
                      style={{ backgroundColor: alternativeBrand.colors?.[key as keyof typeof alternativeBrand.colors] || '#e5e5e5' }}
                    >
                      <span className={`text-[9px] uppercase tracking-wider ${isLightColor(alternativeBrand.colors?.[key as keyof typeof alternativeBrand.colors] || '#e5e5e5') ? 'text-black/40' : 'text-white/40'}`}>
                        {key.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </ComparisonCard>
            </div>
          </section>

          {/* Fonts Comparison */}
          <section className="mb-16">
            <h2 className="text-xs uppercase tracking-[0.2em] text-neutral-400 mb-6">Typography</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <ComparisonCard
                label="Original"
                isSelected={selections.fonts === 'original'}
                onSelect={() => applySelection('fonts', 'original')}
                primaryColor={primaryColor}
              >
                <div className="space-y-4">
                  <div>
                    <span className="text-xs text-neutral-400 block mb-1">Heading</span>
                    <p className="text-2xl text-neutral-800" style={{ fontFamily: brand.fonts.heading ? `"${brand.fonts.heading}", sans-serif` : 'inherit' }}>
                      {brand.fonts.heading || 'Not detected'}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-400 block mb-1">Body</span>
                    <p className="text-base text-neutral-600" style={{ fontFamily: brand.fonts.body ? `"${brand.fonts.body}", sans-serif` : 'inherit' }}>
                      {brand.fonts.body || 'Not detected'}
                    </p>
                  </div>
                </div>
              </ComparisonCard>
              <ComparisonCard
                label="Alternative"
                isSelected={selections.fonts === 'alternative'}
                onSelect={() => applySelection('fonts', 'alternative')}
                primaryColor={primaryColor}
              >
                <div className="space-y-4">
                  <div>
                    <span className="text-xs text-neutral-400 block mb-1">Heading</span>
                    <p className="text-2xl text-neutral-800" style={{ fontFamily: alternativeBrand.fonts?.heading ? `"${alternativeBrand.fonts.heading}", sans-serif` : 'inherit' }}>
                      {alternativeBrand.fonts?.heading || 'Not detected'}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-400 block mb-1">Body</span>
                    <p className="text-base text-neutral-600" style={{ fontFamily: alternativeBrand.fonts?.body ? `"${alternativeBrand.fonts.body}", sans-serif` : 'inherit' }}>
                      {alternativeBrand.fonts?.body || 'Not detected'}
                    </p>
                  </div>
                </div>
              </ComparisonCard>
            </div>
          </section>

          {/* Logos Comparison */}
          <section className="mb-16">
            <h2 className="text-xs uppercase tracking-[0.2em] text-neutral-400 mb-6">Logos</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <ComparisonCard
                label="Original"
                isSelected={selections.logos === 'original'}
                onSelect={() => applySelection('logos', 'original')}
                primaryColor={primaryColor}
              >
                {brand.all_logos && brand.all_logos.length > 0 ? (
                  <div className="grid grid-cols-3 gap-3">
                    {brand.all_logos.map((logo, index) => (
                      <div 
                        key={index}
                        className="aspect-square rounded-xl flex items-center justify-center p-3"
                        style={{
                          background: logo.mode === 'dark' 
                            ? 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)'
                            : '#f8fafc',
                        }}
                      >
                        <img 
                          src={logo.url} 
                          alt={`Logo ${index + 1}`} 
                          className="max-h-full max-w-full object-contain" 
                        />
                      </div>
                    ))}
                  </div>
                ) : brand.logos.primary ? (
                  <div className="flex items-center justify-center h-32 bg-neutral-50 rounded-xl">
                    <img src={brand.logos.primary} alt="Original logo" className="max-h-24 max-w-full object-contain" />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 bg-neutral-50 rounded-xl">
                    <span className="text-neutral-300">No logo detected</span>
                  </div>
                )}
                <p className="text-xs text-neutral-400 mt-3 text-center">
                  {brand.all_logos?.length || (brand.logos.primary ? 1 : 0)} logo(s)
                </p>
              </ComparisonCard>
              <ComparisonCard
                label="Alternative"
                isSelected={selections.logos === 'alternative'}
                onSelect={() => applySelection('logos', 'alternative')}
                primaryColor={primaryColor}
              >
                {alternativeBrand.all_logos && alternativeBrand.all_logos.length > 0 ? (
                  <div className="grid grid-cols-3 gap-3">
                    {alternativeBrand.all_logos.map((logo, index) => (
                      <div 
                        key={index}
                        className="aspect-square rounded-xl flex items-center justify-center p-3"
                        style={{
                          background: logo.mode === 'dark' 
                            ? 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)'
                            : '#f8fafc',
                        }}
                      >
                        <img 
                          src={logo.url} 
                          alt={`Logo ${index + 1}`} 
                          className="max-h-full max-w-full object-contain" 
                        />
                      </div>
                    ))}
                  </div>
                ) : alternativeBrand.logos?.primary ? (
                  <div className="flex items-center justify-center h-32 bg-neutral-50 rounded-xl">
                    <img src={alternativeBrand.logos.primary} alt="Alternative logo" className="max-h-24 max-w-full object-contain" />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 bg-neutral-50 rounded-xl">
                    <span className="text-neutral-300">No logo detected</span>
                  </div>
                )}
                <p className="text-xs text-neutral-400 mt-3 text-center">
                  {alternativeBrand.all_logos?.length || (alternativeBrand.logos?.primary ? 1 : 0)} logo(s)
                </p>
              </ComparisonCard>
            </div>
          </section>

          {/* Voice Comparison */}
          <section className="mb-16">
            <h2 className="text-xs uppercase tracking-[0.2em] text-neutral-400 mb-6">Brand Voice</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <ComparisonCard
                label="Original"
                isSelected={selections.voice === 'original'}
                onSelect={() => applySelection('voice', 'original')}
                primaryColor={primaryColor}
              >
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-neutral-500">Formality</span>
                    <span className="text-sm text-neutral-800 capitalize">{brand.voice.formality || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-neutral-500">Energy</span>
                    <span className="text-sm text-neutral-800 capitalize">{brand.voice.energy || 'N/A'}</span>
                  </div>
                  {brand.voice.keywords && brand.voice.keywords.length > 0 && (
                    <div className="pt-2">
                      <span className="text-xs text-neutral-400 block mb-2">Keywords</span>
                      <div className="flex flex-wrap gap-1">
                        {brand.voice.keywords.slice(0, 5).map((kw) => (
                          <span key={kw} className="px-2 py-0.5 bg-neutral-100 text-neutral-600 text-xs rounded-full">{kw}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </ComparisonCard>
              <ComparisonCard
                label="Alternative"
                isSelected={selections.voice === 'alternative'}
                onSelect={() => applySelection('voice', 'alternative')}
                primaryColor={primaryColor}
              >
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-neutral-500">Formality</span>
                    <span className="text-sm text-neutral-800 capitalize">{alternativeBrand.voice?.formality || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-neutral-500">Energy</span>
                    <span className="text-sm text-neutral-800 capitalize">{alternativeBrand.voice?.energy || 'N/A'}</span>
                  </div>
                  {alternativeBrand.voice?.keywords && alternativeBrand.voice.keywords.length > 0 && (
                    <div className="pt-2">
                      <span className="text-xs text-neutral-400 block mb-2">Keywords</span>
                      <div className="flex flex-wrap gap-1">
                        {alternativeBrand.voice.keywords.slice(0, 5).map((kw) => (
                          <span key={kw} className="px-2 py-0.5 bg-neutral-100 text-neutral-600 text-xs rounded-full">{kw}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </ComparisonCard>
            </div>
          </section>

          {/* Selection Summary */}
          <section className="bg-white rounded-2xl p-8 border border-neutral-200">
            <h3 className="text-sm font-medium text-neutral-800 mb-4">Your Selections</h3>
            <div className="flex flex-wrap gap-3">
              {Object.entries(selections).map(([section, choice]) => (
                <div 
                  key={section}
                  className="px-4 py-2 rounded-full text-sm"
                  style={{
                    backgroundColor: choice === 'alternative' ? `${primaryColor}15` : '#f1f5f9',
                    color: choice === 'alternative' ? primaryColor : '#64748b',
                  }}
                >
                  <span className="capitalize">{section}</span>: {choice}
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (brand.status === 'extracting') {
    // Animated extraction steps with Lucide icons
    const steps: { icon: ReactNode; label: string; description: string }[] = [
      { icon: <Globe className="w-8 h-8" />, label: 'Crawling website', description: 'Scanning homepage and gathering assets' },
      { icon: <Palette className="w-8 h-8" />, label: 'Extracting colors', description: 'Identifying brand color palette' },
      { icon: <Type className="w-8 h-8" />, label: 'Analyzing typography', description: 'Detecting fonts and text styles' },
      { icon: <ImageIcon className="w-8 h-8" />, label: 'Collecting images', description: 'Gathering logos and visual assets' },
      { icon: <BarChart2 className="w-8 h-8" />, label: 'Analyzing design style', description: 'Understanding visual patterns and aesthetics' },
      { icon: <Sparkles className="w-8 h-8" />, label: 'Finalizing brand kit', description: 'Putting everything together' },
    ];

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-neutral-50">
        <div className="text-center max-w-2xl w-full">
          {/* Animated loader */}
          <div className="relative w-24 h-24 mx-auto mb-8">
            <div
              className="absolute inset-0 rounded-full"
              style={{ backgroundColor: `${primaryColor}15` }}
            />
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ color: primaryColor }}
            >
              {steps[currentExtractionStep].icon}
            </div>
          </div>

          {/* Main heading */}
          <h2 className="text-3xl font-light text-neutral-800 mb-2 tracking-tight">
            Extracting Brand Identity
          </h2>

          {/* Current step */}
          <div className="mb-8">
            <p className="text-lg font-medium text-neutral-700 mb-1">
              {steps[currentExtractionStep].label}
            </p>
            <p className="text-neutral-500 text-sm">
              {steps[currentExtractionStep].description}
            </p>
          </div>

          {/* Progress steps indicator */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`h-2 rounded-full transition-all duration-500 ${
                  index === currentExtractionStep
                    ? 'w-8 opacity-100'
                    : index < currentExtractionStep
                    ? 'w-2 opacity-50'
                    : 'w-2 opacity-20'
                }`}
                style={{
                  backgroundColor: index === currentExtractionStep ? primaryColor : secondaryColor || primaryColor,
                }}
              />
            ))}
          </div>

          {/* Additional info */}
          <div className="mt-8 pt-6 border-t border-neutral-200">
            <p className="text-xs text-neutral-400">
              This usually takes 30-60 seconds. We're analyzing your brand's visual identity...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8F7F9' }}>
      {/* Hero Section with Brand Identity */}
      <header className="relative pt-8 sm:pt-12 pb-12 sm:pb-16 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start gap-6 sm:gap-8 md:gap-12">
            {/* Logo Display */}
            <div 
              className="flex-shrink-0 w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-xl sm:rounded-2xl flex items-center justify-center p-3 sm:p-4 shadow-2xl mx-auto sm:mx-0"
              style={{
                background: localBrand.styleguide?.mode === 'dark' 
                  ? 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)'
                  : 'linear-gradient(135deg, #ffffff 0%, #f8f8f8 100%)',
              }}
            >
              {localBrand.logos.primary ? (
                <img
                  src={localBrand.logos.primary}
                  alt={localBrand.name}
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <span 
                  className="text-4xl font-bold"
                  style={{ color: primaryColor }}
                >
                  {localBrand.name.charAt(0)}
                </span>
              )}
            </div>

            {/* Brand Info */}
            <div className="flex-1 pt-0 sm:pt-2 text-center sm:text-left w-full">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                <div>
                  <h1 className="text-3xl sm:text-4xl md:text-5xl font-light text-neutral-900 tracking-tight mb-2">
                    {localBrand.name}
                  </h1>
                  <p className="text-neutral-400 text-base sm:text-lg">{localBrand.domain}</p>
                </div>
                <Button
                  onClick={handleSaveAndContinue}
                  disabled={saving}
                  loading={saving}
                  size="lg"
                  className="shrink-0 mx-auto sm:mx-0"
                >
                  Continue to Studio
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
              {localBrand.slogan && (
                <p className="text-xl text-neutral-600 font-light italic max-w-xl mb-4">
                  "{localBrand.slogan}"
                </p>
              )}
              {/* Summary/Description */}
              {(localBrand.styleguide?.summary || (localBrand.extraction_data as { summary?: string })?.summary) && (
                <p className="text-sm text-neutral-500 max-w-2xl leading-relaxed">
                  {String(localBrand.styleguide?.summary || (localBrand.extraction_data as { summary?: string })?.summary || '')}
                </p>
              )}
              
              {/* Quick Stats */}
              <div className="flex gap-6 sm:gap-8 mt-6 sm:mt-8 justify-center sm:justify-start">
                <div>
                  <div className="text-2xl sm:text-3xl font-light text-neutral-800">
                    {localBrand.all_logos?.length || 1}
                  </div>
                  <div className="text-xs text-neutral-400 uppercase tracking-wider">Logos</div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-light text-neutral-800">
                    {Object.values(localBrand.colors).filter(Boolean).length}
                  </div>
                  <div className="text-xs text-neutral-400 uppercase tracking-wider">Colors</div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-light text-neutral-800">
                    {[localBrand.fonts.heading, localBrand.fonts.body].filter(Boolean).length}
                  </div>
                  <div className="text-xs text-neutral-400 uppercase tracking-wider">Fonts</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pb-12 sm:pb-20">
        {/* Color Palette - Full Width */}
        <section className="mb-12 sm:mb-16">
          <h2 className="text-xs uppercase tracking-[0.2em] text-neutral-400 mb-4 sm:mb-6">Color Palette</h2>
          <div className="flex gap-2 sm:gap-3 md:gap-4 h-28 sm:h-32 md:h-36 overflow-x-auto pb-2">
            {['primary', 'secondary', 'background', 'surface', 'text_primary'].map((key) => {
              const color = localBrand.colors[key as keyof typeof localBrand.colors] || '#e5e5e5';
              const isLight = isLightColor(color);
              
              return (
                <label 
                  key={key} 
                  className="flex-1 relative rounded-2xl transition-all duration-300 hover:scale-[1.02] cursor-pointer group shadow-sm overflow-hidden flex flex-col justify-end p-4"
                  style={{ backgroundColor: color }}
                >
                  {/* Hidden color input - clicking the swatch triggers this */}
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => updateColor(key, e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  
                  {/* Edit Indicator */}
                  <div className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-all scale-75 opacity-0 group-hover:scale-100 group-hover:opacity-100 pointer-events-none"
                    style={{ backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)' }}
                  >
                    <Pencil className={`w-3 h-3 ${isLight ? 'text-black/60' : 'text-white/60'}`} />
                  </div>
                  
                  {/* Label and Hex Code - Inside the swatch */}
                  <div className="pointer-events-none">
                    <div className={`text-xs uppercase tracking-wider mb-1 ${isLight ? 'text-black/50' : 'text-white/50'}`}>
                      {key.replace(/_/g, ' ')}
                    </div>
                    <div className={`font-mono text-sm ${isLight ? 'text-black/80' : 'text-white/80'}`}>
                      {color.toUpperCase()}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </section>

        <div className="grid lg:grid-cols-2 gap-8 sm:gap-10 md:gap-12">
          {/* Typography */}
          <section>
            <h2 className="text-xs uppercase tracking-[0.2em] text-neutral-400 mb-4 sm:mb-6">Typography</h2>
            <div className="space-y-6 sm:space-y-8">
              {/* Heading Font */}
              <div 
                className="p-8 rounded-2xl"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor}08 0%, transparent 100%)`,
                }}
              >
                <div className="flex items-center justify-between mb-6">
                  <span className="text-xs uppercase tracking-wider text-neutral-400">Heading</span>
                  <input
                    type="text"
                    value={localBrand.fonts.heading || ''}
                    onChange={(e) => updateFont('heading', e.target.value)}
                    placeholder="Not detected"
                    className="text-right text-sm text-neutral-600 bg-transparent border-none focus:outline-none focus:ring-0 placeholder:text-neutral-300"
                  />
                </div>
                <p
                  className="text-4xl text-neutral-800 leading-tight"
                  style={{ fontFamily: localBrand.fonts.heading ? `"${localBrand.fonts.heading}", sans-serif` : 'inherit' }}
                >
                  The quick brown<br />fox jumps over
                </p>
              </div>

              {/* Body Font */}
              <div className="p-8 rounded-2xl bg-white border border-neutral-100">
                <div className="flex items-center justify-between mb-6">
                  <span className="text-xs uppercase tracking-wider text-neutral-400">Body</span>
                  <input
                    type="text"
                    value={localBrand.fonts.body || ''}
                    onChange={(e) => updateFont('body', e.target.value)}
                    placeholder="Not detected"
                    className="text-right text-sm text-neutral-600 bg-transparent border-none focus:outline-none focus:ring-0 placeholder:text-neutral-300"
                  />
                </div>
                <p
                  className="text-lg text-neutral-600 leading-relaxed"
                  style={{ fontFamily: localBrand.fonts.body ? `"${localBrand.fonts.body}", sans-serif` : 'inherit' }}
                >
                  Typography is the art and technique of arranging type to make written language legible, readable and appealing when displayed.
                </p>
              </div>
            </div>
          </section>

          {/* Logo & Icon */}
          <section>
            <h2 className="text-xs uppercase tracking-[0.2em] text-neutral-400 mb-4 sm:mb-6">Brand Assets</h2>
            <div className="grid grid-cols-2 gap-4 sm:gap-6">
              {/* Primary Logo */}
              <div className="space-y-3">
                <label 
                  className="relative block aspect-[3/2] rounded-2xl border border-neutral-200 cursor-pointer group overflow-hidden"
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
                      className="w-full h-full object-contain p-6"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-neutral-300">
                      <Upload className="w-8 h-8 mb-2" />
                      <span className="text-sm">No logo</span>
                    </div>
                  )}
                  
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    {uploadingLogo === 'primary' ? (
                      <Loader2 className="w-8 h-8 text-white animate-spin" />
                    ) : (
                      <div className="text-center text-white">
                        <Upload className="w-6 h-6 mx-auto mb-1" />
                        <span className="text-sm">Replace</span>
                      </div>
                    )}
                  </div>
                </label>
                <div className="text-center">
                  <div className="text-xs uppercase tracking-wider text-neutral-500">Logo</div>
                </div>
              </div>

              {/* Icon / Favicon */}
              <div className="space-y-3">
                <label 
                  className="relative block aspect-[3/2] rounded-2xl border border-neutral-200 cursor-pointer group overflow-hidden"
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
                  
                  {(() => {
                    // Try logos.icon first, then fall back to favicon in all_logos
                    const iconUrl = localBrand.logos.icon || localBrand.all_logos?.find(l => l.type === 'favicon' || l.type === 'icon')?.url;
                    
                    if (iconUrl) {
                      return (
                        <img
                          src={iconUrl}
                          alt="Brand icon"
                          className="w-full h-full object-contain p-8"
                        />
                      );
                    }
                    return (
                      <div className="w-full h-full flex flex-col items-center justify-center text-neutral-300">
                        <Upload className="w-8 h-8 mb-2" />
                        <span className="text-sm">No icon</span>
                      </div>
                    );
                  })()}
                  
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    {uploadingLogo === 'icon' ? (
                      <Loader2 className="w-8 h-8 text-white animate-spin" />
                    ) : (
                      <div className="text-center text-white">
                        <Upload className="w-6 h-6 mx-auto mb-1" />
                        <span className="text-sm">Replace</span>
                      </div>
                    )}
                  </div>
                </label>
                <div className="text-center">
                  <div className="text-xs uppercase tracking-wider text-neutral-500">Icon / Favicon</div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Brand Voice - Horizontal */}
        {localBrand.voice && (localBrand.voice.formality || localBrand.voice.energy || (localBrand.voice.keywords && localBrand.voice.keywords.length > 0)) && (
          <section className="mt-12 sm:mt-16">
            <h2 className="text-xs uppercase tracking-[0.2em] text-neutral-400 mb-4 sm:mb-6">Brand Voice</h2>
            <div 
              className="p-4 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl flex flex-col sm:flex-row items-start sm:items-center gap-6 sm:gap-8 md:gap-12"
              style={{
                background: `linear-gradient(90deg, ${primaryColor}05 0%, ${secondaryColor}08 100%)`,
              }}
            >
              {localBrand.voice.formality && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-neutral-400 mb-2">Formality</div>
                  <div className="text-2xl font-light text-neutral-700 capitalize">{localBrand.voice.formality}</div>
                </div>
              )}
              {localBrand.voice.energy && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-neutral-400 mb-2">Energy</div>
                  <div className="text-2xl font-light text-neutral-700 capitalize">{localBrand.voice.energy}</div>
                </div>
              )}
              {localBrand.voice.keywords && localBrand.voice.keywords.length > 0 && (
                <div className="flex-1">
                  <div className="text-xs uppercase tracking-wider text-neutral-400 mb-3">Keywords</div>
                  <div className="flex flex-wrap gap-2">
                    {localBrand.voice.keywords.map((keyword) => (
                      <span
                        key={keyword}
                        className="px-3 py-1.5 rounded-full text-sm"
                        style={{ 
                          backgroundColor: `${primaryColor}10`,
                          color: primaryColor,
                        }}
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Asset Library */}
        <section className="mt-16">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs uppercase tracking-[0.2em] text-neutral-400">
              Asset Library
              <span className="ml-2 text-neutral-300 font-normal">({brandAssets.length})</span>
            </h2>
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full transition-all hover:scale-105"
              style={{ 
                backgroundColor: `${primaryColor}15`,
                color: primaryColor,
              }}
            >
              <Plus className="w-4 h-4" />
              Add Asset
            </button>
          </div>

          {/* Upload Modal */}
          {showUploadModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-neutral-800">Upload Asset</h3>
                  <button
                    onClick={() => {
                      setShowUploadModal(false);
                      setNewAssetName('');
                      setNewAssetCategory('');
                    }}
                    className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-neutral-400" />
                  </button>
                </div>

                {/* Asset Type Selection */}
                <div className="mb-4">
                  <label className="text-sm font-medium text-neutral-700 block mb-2">Type</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setNewAssetType('asset')}
                      className={`flex-1 py-3 px-4 rounded-xl border-2 transition-all ${
                        newAssetType === 'asset'
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-neutral-200 hover:border-neutral-300'
                      }`}
                    >
                      <ImageIcon className={`w-5 h-5 mx-auto mb-1 ${newAssetType === 'asset' ? 'text-emerald-600' : 'text-neutral-400'}`} />
                      <div className={`text-sm font-medium ${newAssetType === 'asset' ? 'text-emerald-700' : 'text-neutral-600'}`}>Asset</div>
                      <div className="text-xs text-neutral-400">Include in design</div>
                    </button>
                    <button
                      onClick={() => setNewAssetType('reference')}
                      className={`flex-1 py-3 px-4 rounded-xl border-2 transition-all ${
                        newAssetType === 'reference'
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-neutral-200 hover:border-neutral-300'
                      }`}
                    >
                      <Palette className={`w-5 h-5 mx-auto mb-1 ${newAssetType === 'reference' ? 'text-purple-600' : 'text-neutral-400'}`} />
                      <div className={`text-sm font-medium ${newAssetType === 'reference' ? 'text-purple-700' : 'text-neutral-600'}`}>Reference</div>
                      <div className="text-xs text-neutral-400">Style inspiration</div>
                    </button>
                  </div>
                </div>

                {/* Asset Name */}
                <div className="mb-4">
                  <label className="text-sm font-medium text-neutral-700 block mb-2">Name (optional)</label>
                  <input
                    type="text"
                    value={newAssetName}
                    onChange={(e) => setNewAssetName(e.target.value)}
                    placeholder="e.g., Product Hero Shot"
                    className="w-full px-4 py-3 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>

                {/* Category */}
                <div className="mb-6">
                  <Select
                    label="Category (optional)"
                    value={newAssetCategory}
                    onChange={setNewAssetCategory}
                    options={[
                      { value: 'product', label: 'Product' },
                      { value: 'ui_screen', label: 'UI / Screenshot' },
                      { value: 'lifestyle', label: 'Lifestyle' },
                      { value: 'team', label: 'Team / People' },
                      { value: 'moodboard', label: 'Moodboard' },
                      { value: 'campaign', label: 'Campaign' },
                      { value: 'icon', label: 'Icon / Graphic' },
                      { value: 'other', label: 'Other' },
                    ]}
                    placeholder="Select a category"
                  />
                </div>

                {/* Upload Button */}
                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAssetUpload}
                    className="hidden"
                    disabled={uploadingAsset}
                  />
                  <div
                    className={`w-full py-4 rounded-xl text-white font-medium text-center cursor-pointer transition-all ${
                      uploadingAsset ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-lg hover:scale-[1.02]'
                    }`}
                    style={{ 
                      background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
                    }}
                  >
                    {uploadingAsset ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Uploading...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <Upload className="w-5 h-5" />
                        Choose File & Upload
                      </span>
                    )}
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Assets Grid */}
          {loadingAssets ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-neutral-300" />
            </div>
          ) : brandAssets.length === 0 ? (
            <div 
              className="rounded-2xl border-2 border-dashed border-neutral-200 p-12 text-center"
              style={{ backgroundColor: `${primaryColor}05` }}
            >
              <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4">
                <ImageIcon className="w-8 h-8 text-neutral-400" />
              </div>
              <h3 className="text-neutral-700 font-medium mb-2">No assets yet</h3>
              <p className="text-neutral-500 text-sm mb-4">
                Upload product photos, UI screenshots, or style references to use when generating designs.
              </p>
              <button
                onClick={() => setShowUploadModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white font-medium transition-all hover:shadow-lg"
                style={{ 
                  background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
                }}
              >
                <Plus className="w-4 h-4" />
                Upload First Asset
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {brandAssets.map((asset) => (
                <div
                  key={asset.id}
                  className="relative group rounded-xl overflow-hidden border border-neutral-200 bg-white shadow-sm hover:shadow-md transition-all"
                >
                  {/* Image */}
                  <div 
                    className="aspect-square"
                    style={{
                      backgroundImage: 'linear-gradient(45deg, #f0f0f0 25%, transparent 25%), linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f0f0f0 75%), linear-gradient(-45deg, transparent 75%, #f0f0f0 75%)',
                      backgroundSize: '16px 16px',
                      backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                      backgroundColor: '#fafafa',
                    }}
                  >
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="w-full h-full object-contain p-2"
                    />
                  </div>

                  {/* Type Badge */}
                  <span 
                    className={`absolute top-2 left-2 px-2 py-0.5 text-[10px] uppercase tracking-wider rounded font-medium ${
                      asset.type === 'asset' 
                        ? 'bg-emerald-100 text-emerald-700' 
                        : 'bg-purple-100 text-purple-700'
                    }`}
                  >
                    {asset.type}
                  </span>

                  {/* Delete Button */}
                  <button
                    onClick={() => handleDeleteAsset(asset)}
                    disabled={deletingAssetId === asset.id}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/90 hover:bg-red-50 text-neutral-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                  >
                    {deletingAssetId === asset.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>

                  {/* Info */}
                  <div className="p-3 border-t border-neutral-100">
                    <p className="text-sm font-medium text-neutral-700 truncate">{asset.name}</p>
                    {asset.category && (
                      <p className="text-xs text-neutral-400 capitalize">{asset.category.replace(/_/g, ' ')}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Backdrops */}
        {localBrand.backdrops && localBrand.backdrops.length > 0 && (
          <section className="mt-16">
            <h2 className="text-xs uppercase tracking-[0.2em] text-neutral-400 mb-6">Visual Assets</h2>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {localBrand.backdrops.map((backdrop, index) => (
                <div
                  key={index}
                  className="flex-shrink-0 h-48 rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow"
                >
                  <img
                    src={backdrop.url}
                    alt={`Backdrop ${index + 1}`}
                    className="h-full w-auto object-cover"
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Website Screenshot */}
        {localBrand.screenshot && (
          <section className="mt-16">
            <h2 className="text-xs uppercase tracking-[0.2em] text-neutral-400 mb-6">Website Screenshot</h2>
            <div className="rounded-2xl overflow-hidden shadow-lg border border-neutral-200 max-h-[500px]">
              <img
                src={localBrand.screenshot}
                alt="Website screenshot"
                className="w-full h-auto object-cover object-top"
              />
            </div>
          </section>
        )}


        {/* Re-extract Section */}
        <section className="mt-20 pt-12 border-t border-neutral-200">
          <div className="text-center">
            <p className="text-neutral-500 mb-4">Results don't look right?</p>
            <button
              onClick={handleReExtract}
              disabled={isReExtracting}
              className="inline-flex items-center gap-2 px-6 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-full transition-all disabled:opacity-50"
            >
              {isReExtracting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Extracting...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Try alternative extraction
                </>
              )}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

// Comparison Card Component
function ComparisonCard({
  label,
  isSelected,
  onSelect,
  primaryColor,
  children,
}: {
  label: string;
  isSelected: boolean;
  onSelect: () => void;
  primaryColor: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-6 rounded-2xl border-2 transition-all ${
        isSelected
          ? 'border-current'
          : 'border-neutral-200 hover:border-neutral-300'
      }`}
      style={{
        borderColor: isSelected ? primaryColor : undefined,
        boxShadow: isSelected ? `0 0 0 2px white, 0 0 0 4px ${primaryColor}` : undefined,
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs uppercase tracking-wider text-neutral-400">{label}</span>
        {isSelected && (
          <div 
            className="w-5 h-5 rounded-full flex items-center justify-center"
            style={{ backgroundColor: primaryColor }}
          >
            <Check className="w-3 h-3 text-white" />
          </div>
        )}
      </div>
      {children}
    </button>
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
