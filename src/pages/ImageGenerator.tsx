import { useState } from 'react';
import { ArrowLeft, Sparkles, Loader2, Download, RefreshCw, Wand2, Check, X, ChevronDown, ChevronUp, Image as ImageIcon, Palette, Plus, FolderOpen } from 'lucide-react';
import { Brand, BrandAsset, getAuthHeaders } from '../lib/supabase';
import { AssetPicker } from '../components/AssetPicker';

export function ImageGenerator({
  brand,
  onBack,
}: {
  brand: Brand;
  onBack: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [textResponse, setTextResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBrandContext, setShowBrandContext] = useState(false);

  // Asset selection state
  const [selectedAssets, setSelectedAssets] = useState<BrandAsset[]>([]);
  const [selectedReferences, setSelectedReferences] = useState<BrandAsset[]>([]);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [showReferencePicker, setShowReferencePicker] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);

  // Computed values
  // Use fixed brand color from design system
  const primaryColor = '#3531B7';

  // Calculate auto-included images (logo, backdrop, screenshot)
  const autoIncludedImages = [
    brand.logos.primary ? 1 : 0,
    brand.backdrops?.length ? 1 : 0,
    brand.screenshot ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  // Gemini 3 Pro Image limits
  const MAX_HIGH_FIDELITY = 6; // Assets (high-fidelity objects)
  const MAX_TOTAL_IMAGES = 14; // Total including auto-included

  // Calculate current counts
  const currentAssets = selectedAssets.length;
  const currentReferences = selectedReferences.length;
  const currentTotal = currentAssets + currentReferences + autoIncludedImages;

  // Validation
  const canAddAsset = currentAssets < MAX_HIGH_FIDELITY && currentTotal < MAX_TOTAL_IMAGES;
  const canAddReference = currentTotal < MAX_TOTAL_IMAGES;
  const totalRemaining = Math.max(0, MAX_TOTAL_IMAGES - currentTotal);
  void canAddAsset; void canAddReference; void totalRemaining; // Used for UI feedback

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setGenerating(true);
    setError(null);
    setGeneratedImage(null);
    setTextResponse(null);

    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            prompt,
            brandId: brand.id,
            // Pass selected assets and references
            assets: selectedAssets.map(a => ({
              id: a.id,
              url: a.url,
              name: a.name,
              category: a.category,
              role: 'must_include',
            })),
            references: selectedReferences.map(r => ({
              id: r.id,
              url: r.url,
              name: r.name,
              category: r.category,
              role: 'style_reference',
            })),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        // Handle credit errors specifically
        if (response.status === 402) {
          setError(`Insufficient credits. You have ${data.credits || 0} credits remaining. Please purchase more credits to generate images.`);
        } else {
          setError(data.error || 'Failed to generate image');
        }
        return;
      }

      if (data.image_base64) {
        setGeneratedImage(`data:${data.mime_type || 'image/png'};base64,${data.image_base64}`);
      }
      if (data.text_response) {
        setTextResponse(data.text_response);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setGenerating(false);
    }
  };

  // Remove asset from selection
  const removeAsset = (assetId: string) => {
    setSelectedAssets(prev => prev.filter(a => a.id !== assetId));
  };

  // Remove reference from selection
  const removeReference = (refId: string) => {
    setSelectedReferences(prev => prev.filter(r => r.id !== refId));
  };

  const handleDownload = () => {
    if (!generatedImage) return;

    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = `${brand.name.toLowerCase().replace(/\s+/g, '-')}-design.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const examplePrompts = [
    "A hero banner for our homepage showcasing innovation",
    "Social media post announcing a new product feature",
    "Professional LinkedIn banner with abstract tech elements",
    "Email header image with subtle brand patterns",
    "App store screenshot mockup with clean UI",
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-slate-50 to-emerald-50">
      {/* Header */}
      <nav className="border-b border-neutral-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Brand Kit
          </button>
          <div className="flex items-center gap-2 text-neutral-900 font-semibold">
            <Wand2 className="w-5 h-5 text-emerald-500" />
            AI Image Generator
          </div>
          <div className="w-32" /> {/* Spacer for centering */}
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Brand Context Card */}
        <div className="mb-8 rounded-xl bg-white border border-neutral-200 shadow-sm overflow-hidden">
          <div className="p-4 flex items-center gap-4">
            {brand.logos.primary && (
              <img
                src={brand.logos.primary}
                alt={brand.name}
                className="w-12 h-12 object-contain rounded-lg bg-neutral-50 p-2"
              />
            )}
            <div className="flex-1">
              <h2 className="text-neutral-900 font-semibold">{brand.name}</h2>
              {brand.slogan && (
                <p className="text-neutral-600 text-sm">{brand.slogan}</p>
              )}
            </div>
            <div className="flex gap-2">
              {brand.colors.primary && (
                <div
                  className="w-8 h-8 rounded-full border-2 border-neutral-200"
                  style={{ backgroundColor: brand.colors.primary }}
                  title="Primary color"
                />
              )}
              {brand.colors.secondary && (
                <div
                  className="w-8 h-8 rounded-full border-2 border-neutral-200"
                  style={{ backgroundColor: brand.colors.secondary }}
                  title="Secondary color"
                />
              )}
            </div>
            <button
              onClick={() => setShowBrandContext(!showBrandContext)}
              className="p-2 hover:bg-neutral-50 rounded-lg transition-colors"
              title="Show brand context sent to AI"
            >
              {showBrandContext ? (
                <ChevronUp className="w-5 h-5 text-neutral-600" />
              ) : (
                <ChevronDown className="w-5 h-5 text-neutral-600" />
              )}
            </button>
          </div>

          {/* Expandable Brand Context Details */}
          {showBrandContext && (
            <div className="px-4 pb-4 border-t border-neutral-200 pt-4 bg-neutral-50">
              <p className="text-neutral-500 text-xs uppercase tracking-wide mb-3">Brand elements sent to Nano Banana</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                {/* Logo Reference */}
                <div className="flex items-center gap-2">
                  {brand.logos.primary ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <X className="w-4 h-4 text-red-400" />
                  )}
                  <span className={brand.logos.primary ? 'text-neutral-700' : 'text-neutral-400'}>
                    Logo image
                  </span>
                </div>

                {/* Backdrop */}
                <div className="flex items-center gap-2">
                  {brand.backdrops?.length ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <X className="w-4 h-4 text-red-400" />
                  )}
                  <span className={brand.backdrops?.length ? 'text-neutral-700' : 'text-neutral-400'}>
                    Backdrop image
                  </span>
                </div>

                {/* Slogan */}
                <div className="flex items-center gap-2">
                  {brand.slogan ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <X className="w-4 h-4 text-red-400" />
                  )}
                  <span className={brand.slogan ? 'text-neutral-700' : 'text-neutral-400'}>
                    Tagline
                  </span>
                </div>

                {/* Primary Color */}
                <div className="flex items-center gap-2">
                  {brand.colors.primary ? (
                    <>
                      <div 
                        className="w-4 h-4 rounded-full border border-neutral-300"
                        style={{ backgroundColor: brand.colors.primary }}
                      />
                      <span className="text-neutral-700">Primary: {brand.colors.primary}</span>
                    </>
                  ) : (
                    <>
                      <X className="w-4 h-4 text-red-400" />
                      <span className="text-neutral-400">Primary color</span>
                    </>
                  )}
                </div>

                {/* Secondary Color */}
                <div className="flex items-center gap-2">
                  {brand.colors.secondary ? (
                    <>
                      <div 
                        className="w-4 h-4 rounded-full border border-neutral-300"
                        style={{ backgroundColor: brand.colors.secondary }}
                      />
                      <span className="text-neutral-700">Secondary: {brand.colors.secondary}</span>
                    </>
                  ) : (
                    <>
                      <X className="w-4 h-4 text-red-400" />
                      <span className="text-neutral-400">Secondary color</span>
                    </>
                  )}
                </div>

                {/* Background Color */}
                <div className="flex items-center gap-2">
                  {brand.colors.background ? (
                    <>
                      <div 
                        className="w-4 h-4 rounded-full border border-neutral-300"
                        style={{ backgroundColor: brand.colors.background }}
                      />
                      <span className="text-neutral-700">Background</span>
                    </>
                  ) : (
                    <>
                      <X className="w-4 h-4 text-red-400" />
                      <span className="text-neutral-400">Background</span>
                    </>
                  )}
                </div>

                {/* Heading Font */}
                <div className="flex items-center gap-2">
                  {brand.fonts.heading ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <X className="w-4 h-4 text-red-400" />
                  )}
                  <span className={brand.fonts.heading ? 'text-neutral-700' : 'text-neutral-400'}>
                    {brand.fonts.heading || 'Heading font'}
                  </span>
                </div>

                {/* Voice/Style */}
                <div className="flex items-center gap-2">
                  {brand.voice?.formality ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <X className="w-4 h-4 text-red-400" />
                  )}
                  <span className={brand.voice?.formality ? 'text-neutral-700' : 'text-neutral-400'}>
                    {brand.voice?.formality || 'Voice style'}
                  </span>
                </div>

                {/* Keywords */}
                <div className="flex items-center gap-2">
                  {brand.voice?.keywords?.length ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <X className="w-4 h-4 text-red-400" />
                  )}
                  <span className={brand.voice?.keywords?.length ? 'text-neutral-700' : 'text-neutral-400'}>
                    {brand.voice?.keywords?.length || 0} keywords
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Input Section */}
          <div className="space-y-6">
            <div>
              <label className="block text-neutral-700 font-medium mb-3">
                Describe your image
              </label>
              <div className="relative">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the image you want to create..."
                  className="w-full h-32 px-4 py-3 pr-14 bg-white border border-neutral-300 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none shadow-sm"
                />
                <button
                  onClick={() => setShowMediaLibrary(true)}
                  className="absolute right-2 top-2 p-2 rounded-lg transition-all hover:scale-110 active:scale-95 z-10 shadow-sm"
                  style={{ 
                    backgroundColor: `${primaryColor}15`,
                    color: primaryColor,
                  }}
                  title="Select from media library"
                >
                  <FolderOpen className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Asset & Reference Selection */}
            <div className="space-y-4">
              {/* Assets Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-neutral-700 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-emerald-600" />
                    Assets to Include
                    <span className="text-xs text-neutral-400 font-normal">(will appear in design)</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      currentAssets >= MAX_HIGH_FIDELITY 
                        ? 'bg-red-100 text-red-700' 
                        : currentAssets >= MAX_HIGH_FIDELITY - 1
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-neutral-100 text-neutral-600'
                    }`}>
                      {currentAssets}/{MAX_HIGH_FIDELITY}
                    </span>
                  </label>
                  <button
                    onClick={() => setShowAssetPicker(true)}
                    disabled={!canAddAsset}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ 
                      backgroundColor: `${primaryColor}15`,
                      color: primaryColor,
                    }}
                    title={!canAddAsset ? (currentAssets >= MAX_HIGH_FIDELITY ? 'Asset limit reached (6/6)' : 'Total image limit reached') : 'Add assets'}
                  >
                    <Plus className="w-3 h-3" />
                    Add
                  </button>
                </div>
                {!canAddAsset && currentAssets < MAX_HIGH_FIDELITY && (
                  <p className="text-xs text-amber-600 mb-2">
                    Total image limit reached. Remove {currentTotal - MAX_TOTAL_IMAGES + 1} image{currentTotal - MAX_TOTAL_IMAGES + 1 > 1 ? 's' : ''} to add more assets.
                  </p>
                )}
                {currentAssets >= MAX_HIGH_FIDELITY && (
                  <p className="text-xs text-red-600 mb-2">
                    Asset limit reached (6/6 high-fidelity images). Remove assets to add more.
                  </p>
                )}
                
                {selectedAssets.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className="relative group rounded-lg overflow-hidden border border-neutral-200 bg-white shadow-sm"
                      >
                        <img
                          src={asset.url}
                          alt={asset.name}
                          className="w-16 h-16 object-cover"
                        />
                        <button
                          onClick={() => removeAsset(asset.id)}
                          className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        >
                          <X className="w-5 h-5 text-white" />
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 bg-emerald-500 text-white text-[9px] text-center py-0.5 font-medium">
                          ASSET
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div 
                    onClick={() => setShowAssetPicker(true)}
                    className="border-2 border-dashed border-neutral-200 rounded-xl p-4 text-center cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors"
                  >
                    <p className="text-neutral-400 text-sm">Click to add product photos, UI screenshots, etc.</p>
                  </div>
                )}
              </div>

              {/* References Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-neutral-700 flex items-center gap-2">
                    <Palette className="w-4 h-4 text-purple-600" />
                    Style References
                    <span className="text-xs text-neutral-400 font-normal">(for mood/style only)</span>
                  </label>
                  <button
                    onClick={() => setShowReferencePicker(true)}
                    disabled={!canAddReference}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg bg-purple-100 text-purple-700 transition-colors flex items-center gap-1 hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={!canAddReference ? 'Total image limit reached (14/14)' : 'Add style references'}
                  >
                    <Plus className="w-3 h-3" />
                    Add
                  </button>
                </div>
                {!canAddReference && (
                  <p className="text-xs text-amber-600 mb-2">
                    Total image limit reached (14/14). Remove images to add more references.
                  </p>
                )}
                
                {selectedReferences.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedReferences.map((ref) => (
                      <div
                        key={ref.id}
                        className="relative group rounded-lg overflow-hidden border border-neutral-200 bg-white shadow-sm"
                      >
                        <img
                          src={ref.url}
                          alt={ref.name}
                          className="w-16 h-16 object-cover"
                        />
                        <button
                          onClick={() => removeReference(ref.id)}
                          className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        >
                          <X className="w-5 h-5 text-white" />
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 bg-purple-500 text-white text-[9px] text-center py-0.5 font-medium">
                          REF
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div 
                    onClick={() => setShowReferencePicker(true)}
                    className="border-2 border-dashed border-neutral-200 rounded-xl p-4 text-center cursor-pointer hover:border-purple-300 hover:bg-purple-50/50 transition-colors"
                  >
                    <p className="text-neutral-400 text-sm">Click to add moodboards, inspiration images, etc.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Image Count Summary */}
            {currentTotal > 0 && (
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-600">Total images:</span>
                  <span className={`font-semibold ${
                    currentTotal >= MAX_TOTAL_IMAGES 
                      ? 'text-red-600' 
                      : currentTotal >= MAX_TOTAL_IMAGES - 2
                      ? 'text-amber-600'
                      : 'text-neutral-900'
                  }`}>
                    {currentTotal}/{MAX_TOTAL_IMAGES}
                  </span>
                </div>
                <div className="mt-2 text-xs text-neutral-500 space-y-1">
                  <div className="flex justify-between">
                    <span>• Assets (high-fidelity):</span>
                    <span className={currentAssets >= MAX_HIGH_FIDELITY ? 'text-red-600 font-medium' : ''}>
                      {currentAssets}/{MAX_HIGH_FIDELITY}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>• Style references:</span>
                    <span>{currentReferences}</span>
                  </div>
                  {autoIncludedImages > 0 && (
                    <div className="flex justify-between text-neutral-400">
                      <span>• Auto-included (logo, backdrop, screenshot):</span>
                      <span>{autoIncludedImages}</span>
                    </div>
                  )}
                  {totalRemaining > 0 && (
                    <p className="text-emerald-600 font-medium mt-2">
                      {totalRemaining} more image{totalRemaining > 1 ? 's' : ''} allowed
                    </p>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={generating || !prompt.trim()}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
            >
              {generating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating with Nano Banana Pro...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate Image
                </>
              )}
            </button>

            {/* Example Prompts */}
            <div>
              <p className="text-neutral-600 text-sm mb-3">Try an example:</p>
              <div className="flex flex-wrap gap-2">
                {examplePrompts.map((example, i) => (
                  <button
                    key={i}
                    onClick={() => setPrompt(example)}
                    className="px-3 py-1.5 text-xs bg-white hover:bg-emerald-50 border border-neutral-200 rounded-lg text-neutral-700 hover:text-emerald-700 transition-colors shadow-sm"
                  >
                    {example.slice(0, 40)}...
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Output Section */}
          <div className="space-y-4">
            <div className="aspect-square rounded-xl bg-neutral-100 border border-neutral-300 shadow-sm overflow-hidden flex items-center justify-center">
              {generating ? (
                <div className="text-center">
                  <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mx-auto mb-4" />
                  <p className="text-neutral-800 font-medium">Creating your on-brand image...</p>
                  <p className="text-neutral-600 text-sm mt-2">This may take a few seconds</p>
                </div>
              ) : generatedImage ? (
                <img
                  src={generatedImage}
                  alt="Generated design"
                  className="w-full h-full object-contain"
                />
              ) : error ? (
                <div className="text-center p-8">
                  <div className="w-16 h-16 bg-red-200 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">⚠️</span>
                  </div>
                  <p className="text-red-700 mb-2 font-medium">Generation failed</p>
                  <p className="text-neutral-700 text-sm">{error}</p>
                </div>
              ) : (
                <div className="text-center p-8">
                  <div className="w-20 h-20 bg-neutral-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Wand2 className="w-10 h-10 text-neutral-500" />
                  </div>
                  <p className="text-neutral-600">Your generated image will appear here</p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            {generatedImage && (
              <div className="flex gap-3">
                <button
                  onClick={handleDownload}
                  className="flex-1 py-3 bg-white hover:bg-neutral-50 text-neutral-700 font-medium rounded-xl transition-colors flex items-center justify-center gap-2 border border-neutral-200 shadow-sm"
                >
                  <Download className="w-5 h-5" />
                  Download
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex-1 py-3 bg-white hover:bg-neutral-50 text-neutral-700 font-medium rounded-xl transition-colors flex items-center justify-center gap-2 border border-neutral-200 shadow-sm"
                >
                  <RefreshCw className="w-5 h-5" />
                  Regenerate
                </button>
              </div>
            )}

            {/* Text Response */}
            {textResponse && (
              <div className="p-4 bg-white rounded-xl border border-neutral-200 shadow-sm">
                <p className="text-neutral-600 text-sm">{textResponse}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Asset Picker Modal */}
      <AssetPicker
        brandId={brand.id}
        isOpen={showAssetPicker}
        onClose={() => setShowAssetPicker(false)}
        onSelect={(assets) => {
          // Enforce limit: max 6 assets, and total images (including auto-included) <= 14
          const maxAllowed = Math.min(MAX_HIGH_FIDELITY, MAX_TOTAL_IMAGES - autoIncludedImages - currentReferences);
          const filtered = assets.filter(a => a.type === 'asset').slice(0, maxAllowed);
          setSelectedAssets(filtered);
        }}
        selectedAssets={selectedAssets}
        filterType="asset"
        title="Select Assets"
        maxSelection={Math.min(MAX_HIGH_FIDELITY, MAX_TOTAL_IMAGES - autoIncludedImages - currentReferences)}
      />

      {/* Reference Picker Modal */}
      <AssetPicker
        brandId={brand.id}
        isOpen={showReferencePicker}
        onClose={() => setShowReferencePicker(false)}
        onSelect={(refs) => {
          // Enforce limit: total images (including auto-included and assets) <= 14
          const maxAllowed = MAX_TOTAL_IMAGES - autoIncludedImages - currentAssets;
          const filtered = refs.filter(r => r.type === 'reference').slice(0, maxAllowed);
          setSelectedReferences(filtered);
        }}
        selectedAssets={selectedReferences}
        filterType="reference"
        title="Select Style References"
        maxSelection={MAX_TOTAL_IMAGES - autoIncludedImages - currentAssets}
      />

      {/* Media Library Picker - Unified picker for all assets */}
      <AssetPicker
        brandId={brand.id}
        isOpen={showMediaLibrary}
        onClose={() => setShowMediaLibrary(false)}
        onSelect={(selected) => {
          // Split selected items by their type and enforce limits
          const assets = selected.filter(a => a.type === 'asset').slice(0, MAX_HIGH_FIDELITY);
          const maxRefs = MAX_TOTAL_IMAGES - autoIncludedImages - assets.length;
          const refs = selected.filter(r => r.type === 'reference').slice(0, maxRefs);
          setSelectedAssets(assets);
          setSelectedReferences(refs);
        }}
        selectedAssets={[...selectedAssets, ...selectedReferences]}
        filterType="all"
        title="Media Library"
        maxSelection={MAX_TOTAL_IMAGES - autoIncludedImages}
        maxAssets={MAX_HIGH_FIDELITY}
      />
    </div>
  );
}

