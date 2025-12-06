import { useState } from 'react';
import { ArrowLeft, Sparkles, Loader2, Download, RefreshCw, Wand2, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Brand } from '../lib/supabase';

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

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setGenerating(true);
    setError(null);
    setGeneratedImage(null);
    setTextResponse(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            prompt,
            brandId: brand.id,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate image');
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      {/* Header */}
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Brand Kit
          </button>
          <div className="flex items-center gap-2 text-slate-900 font-semibold">
            <Wand2 className="w-5 h-5 text-purple-600" />
            AI Image Generator
          </div>
          <div className="w-32" /> {/* Spacer for centering */}
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Brand Context Card */}
        <div className="mb-8 rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 flex items-center gap-4">
            {brand.logos.primary && (
              <img
                src={brand.logos.primary}
                alt={brand.name}
                className="w-12 h-12 object-contain rounded-lg bg-slate-50 p-2"
              />
            )}
            <div className="flex-1">
              <h2 className="text-slate-900 font-semibold">{brand.name}</h2>
              {brand.slogan && (
                <p className="text-slate-600 text-sm">{brand.slogan}</p>
              )}
            </div>
            <div className="flex gap-2">
              {brand.colors.primary && (
                <div
                  className="w-8 h-8 rounded-full border-2 border-slate-200"
                  style={{ backgroundColor: brand.colors.primary }}
                  title="Primary color"
                />
              )}
              {brand.colors.secondary && (
                <div
                  className="w-8 h-8 rounded-full border-2 border-slate-200"
                  style={{ backgroundColor: brand.colors.secondary }}
                  title="Secondary color"
                />
              )}
            </div>
            <button
              onClick={() => setShowBrandContext(!showBrandContext)}
              className="p-2 hover:bg-slate-50 rounded-lg transition-colors"
              title="Show brand context sent to AI"
            >
              {showBrandContext ? (
                <ChevronUp className="w-5 h-5 text-slate-600" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-600" />
              )}
            </button>
          </div>

          {/* Expandable Brand Context Details */}
          {showBrandContext && (
            <div className="px-4 pb-4 border-t border-slate-200 pt-4 bg-slate-50">
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-3">Brand elements sent to Nano Banana</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                {/* Logo Reference */}
                <div className="flex items-center gap-2">
                  {brand.logos.primary ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <X className="w-4 h-4 text-red-400" />
                  )}
                  <span className={brand.logos.primary ? 'text-slate-700' : 'text-slate-400'}>
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
                  <span className={brand.backdrops?.length ? 'text-slate-700' : 'text-slate-400'}>
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
                  <span className={brand.slogan ? 'text-slate-700' : 'text-slate-400'}>
                    Tagline
                  </span>
                </div>

                {/* Primary Color */}
                <div className="flex items-center gap-2">
                  {brand.colors.primary ? (
                    <>
                      <div 
                        className="w-4 h-4 rounded-full border border-slate-300"
                        style={{ backgroundColor: brand.colors.primary }}
                      />
                      <span className="text-slate-700">Primary: {brand.colors.primary}</span>
                    </>
                  ) : (
                    <>
                      <X className="w-4 h-4 text-red-400" />
                      <span className="text-slate-400">Primary color</span>
                    </>
                  )}
                </div>

                {/* Secondary Color */}
                <div className="flex items-center gap-2">
                  {brand.colors.secondary ? (
                    <>
                      <div 
                        className="w-4 h-4 rounded-full border border-slate-300"
                        style={{ backgroundColor: brand.colors.secondary }}
                      />
                      <span className="text-slate-700">Secondary: {brand.colors.secondary}</span>
                    </>
                  ) : (
                    <>
                      <X className="w-4 h-4 text-red-400" />
                      <span className="text-slate-400">Secondary color</span>
                    </>
                  )}
                </div>

                {/* Background Color */}
                <div className="flex items-center gap-2">
                  {brand.colors.background ? (
                    <>
                      <div 
                        className="w-4 h-4 rounded-full border border-slate-300"
                        style={{ backgroundColor: brand.colors.background }}
                      />
                      <span className="text-slate-700">Background</span>
                    </>
                  ) : (
                    <>
                      <X className="w-4 h-4 text-red-400" />
                      <span className="text-slate-400">Background</span>
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
                  <span className={brand.fonts.heading ? 'text-slate-700' : 'text-slate-400'}>
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
                  <span className={brand.voice?.formality ? 'text-slate-700' : 'text-slate-400'}>
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
                  <span className={brand.voice?.keywords?.length ? 'text-slate-700' : 'text-slate-400'}>
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
              <label className="block text-slate-700 font-medium mb-3">
                Describe your image
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the image you want to create..."
                className="w-full h-40 px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none shadow-sm"
              />
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating || !prompt.trim()}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
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
              <p className="text-slate-600 text-sm mb-3">Try an example:</p>
              <div className="flex flex-wrap gap-2">
                {examplePrompts.map((example, i) => (
                  <button
                    key={i}
                    onClick={() => setPrompt(example)}
                    className="px-3 py-1.5 text-xs bg-white hover:bg-purple-50 border border-slate-200 rounded-lg text-slate-700 hover:text-purple-700 transition-colors shadow-sm"
                  >
                    {example.slice(0, 40)}...
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Output Section */}
          <div className="space-y-4">
            <div className="aspect-square rounded-xl bg-slate-100 border border-slate-300 shadow-sm overflow-hidden flex items-center justify-center">
              {generating ? (
                <div className="text-center">
                  <Loader2 className="w-12 h-12 text-purple-600 animate-spin mx-auto mb-4" />
                  <p className="text-slate-800 font-medium">Creating your on-brand image...</p>
                  <p className="text-slate-600 text-sm mt-2">This may take a few seconds</p>
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
                  <p className="text-slate-700 text-sm">{error}</p>
                </div>
              ) : (
                <div className="text-center p-8">
                  <div className="w-20 h-20 bg-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Wand2 className="w-10 h-10 text-slate-500" />
                  </div>
                  <p className="text-slate-600">Your generated image will appear here</p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            {generatedImage && (
              <div className="flex gap-3">
                <button
                  onClick={handleDownload}
                  className="flex-1 py-3 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-xl transition-colors flex items-center justify-center gap-2 border border-slate-200 shadow-sm"
                >
                  <Download className="w-5 h-5" />
                  Download
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex-1 py-3 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-xl transition-colors flex items-center justify-center gap-2 border border-slate-200 shadow-sm"
                >
                  <RefreshCw className="w-5 h-5" />
                  Regenerate
                </button>
              </div>
            )}

            {/* Text Response */}
            {textResponse && (
              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                <p className="text-slate-600 text-sm">{textResponse}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

