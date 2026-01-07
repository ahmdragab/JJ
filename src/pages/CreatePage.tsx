import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ChevronDown, Grid3x3, Wand2, Check } from 'lucide-react';
import { supabase, Brand, getAuthHeaders } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';

type AspectRatio = '1:1' | '2:3' | '3:4' | '4:5' | '9:16' | '3:2' | '4:3' | '5:4' | '16:9' | '21:9' | 'auto';

export function CreatePage({ brand }: { brand: Brand }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [scratchPrompt, setScratchPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [customPromptExpanded, setCustomPromptExpanded] = useState(false);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio>('auto');
  const [showRatioDropdown, setShowRatioDropdown] = useState(false);
  const ratioDropdownRef = useRef<HTMLDivElement>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);

  const primaryColor = brand.colors?.primary || '#3531B7';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ratioDropdownRef.current && !ratioDropdownRef.current.contains(event.target as Node)) {
        setShowRatioDropdown(false);
      }

      if (inputContainerRef.current && !inputContainerRef.current.contains(event.target as Node)) {
        if (!scratchPrompt.trim()) {
          setCustomPromptExpanded(false);
        }
      }
    };

    if (showRatioDropdown || customPromptExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showRatioDropdown, customPromptExpanded, scratchPrompt]);

  const handleGenerate = async (prompt: string, templateId?: string, metadata?: Record<string, unknown>) => {
    setGenerating(true);

    try {
      if (!user?.id) {
        throw new Error('Not authenticated');
      }

      const { data: imageRecord, error: insertError } = await supabase
        .from('images')
        .insert({
          user_id: user.id,
          brand_id: brand.id,
          template_id: templateId || null,
          prompt,
          status: 'generating',
          metadata: metadata || {},
          conversation: [],
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const authHeaders = await getAuthHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            prompt,
            brandId: brand.id,
            imageId: imageRecord.id,
            aspectRatio: metadata?.aspect_ratio || (selectedAspectRatio === 'auto' ? undefined : selectedAspectRatio),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 402) {
          toast.error('Insufficient Credits', `You have ${data.credits || 0} credits remaining. Please purchase more credits to generate images.`);
        } else {
          throw new Error(data.error || 'Failed to generate image');
        }
        await supabase.from('images').delete().eq('id', imageRecord.id);
        return;
      }

      navigate(`/brands/${brand.slug}/gallery/${imageRecord.id}`);

    } catch (error) {
      console.error('Failed to generate:', error);
      toast.error('Generation Failed', error instanceof Error ? error.message : 'Failed to generate image');
      setGenerating(false);
    }
  };

  const handleScratchGenerate = () => {
    if (!scratchPrompt.trim()) return;
    handleGenerate(scratchPrompt, undefined, {
      aspect_ratio: selectedAspectRatio === 'auto' ? undefined : selectedAspectRatio,
    });
  };

  const handlePromptChange = (value: string) => {
    setScratchPrompt(value);
    if (value.trim() && !customPromptExpanded) {
      setCustomPromptExpanded(true);
    } else if (!value.trim() && customPromptExpanded) {
      setCustomPromptExpanded(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 relative overflow-hidden">
      {/* Subtle background gradient */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-40 -right-40 w-96 h-96 rounded-full mix-blend-multiply filter blur-3xl opacity-[0.08] animate-blob"
          style={{ backgroundColor: primaryColor }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full mix-blend-multiply filter blur-3xl opacity-[0.08] animate-blob animation-delay-2000"
          style={{ backgroundColor: primaryColor }}
        />
      </div>

      <div className="relative z-10 p-6 md:p-12">
        <div className="max-w-5xl mx-auto">
          {/* Free-form prompt input */}
          <div className="space-y-12">
            {/* Custom Input Field */}
            <div
              className={`transition-all duration-500 ${customPromptExpanded ? 'max-w-5xl mx-auto' : 'max-w-4xl mx-auto'} mt-16`}
              ref={inputContainerRef}
            >
              <div
                className={`rounded-3xl border transition-all duration-500 bg-white/80 backdrop-blur-sm ${
                  customPromptExpanded ? 'p-8 md:p-10 shadow-lg' : 'p-5 md:p-6 shadow-sm'
                }`}
                style={{
                  borderColor: customPromptExpanded ? primaryColor : 'rgba(0,0,0,0.06)',
                  borderWidth: customPromptExpanded ? '2px' : '1px',
                }}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={scratchPrompt}
                    onChange={(e) => handlePromptChange(e.target.value)}
                    onFocus={() => setCustomPromptExpanded(true)}
                    placeholder="e.g., Create a LinkedIn post to celebrate UAE National Day"
                    className="flex-1 bg-transparent border-none outline-none text-neutral-800 placeholder:text-neutral-400 placeholder:text-sm text-base"
                  />
                  {customPromptExpanded && (
                    <button
                      onClick={handleScratchGenerate}
                      disabled={generating || !scratchPrompt.trim()}
                      className="btn-primary px-6 py-2.5 rounded-xl shrink-0"
                    >
                      {generating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Creating...
                        </>
                      ) : (
                        'Create'
                      )}
                    </button>
                  )}
                </div>

                {/* Expanded Options */}
                {customPromptExpanded && (
                  <div className="mt-4 pt-4 border-t border-neutral-100 flex items-center justify-between">
                    {/* Ratio Dropdown Button */}
                    <div className="relative" ref={ratioDropdownRef}>
                      <button
                        onClick={() => setShowRatioDropdown(!showRatioDropdown)}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-500 hover:text-neutral-700 transition-colors rounded-lg hover:bg-neutral-100"
                      >
                        <Grid3x3 className="w-4 h-4" />
                        <span>Ratio</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showRatioDropdown ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Ratio Dropdown Menu */}
                      {showRatioDropdown && (
                        <div className="absolute top-full left-0 mt-2 w-64 glass rounded-2xl shadow-xl py-2 z-50">
                          {/* Auto Option */}
                          <div className="px-4 py-2">
                            <label className="flex items-center gap-3 cursor-pointer">
                              <input
                                type="radio"
                                name="aspect-ratio"
                                value="auto"
                                checked={selectedAspectRatio === 'auto'}
                                onChange={(e) => {
                                  setSelectedAspectRatio(e.target.value as AspectRatio);
                                  setShowRatioDropdown(false);
                                }}
                                className="w-4 h-4 text-brand-primary accent-brand-primary"
                              />
                              <div className="flex items-center gap-2 flex-1">
                                <Grid3x3 className="w-4 h-4 text-neutral-400" />
                                <span className="text-sm text-neutral-700">Auto</span>
                              </div>
                              {selectedAspectRatio === 'auto' && (
                                <Check className="w-4 h-4 text-brand-primary" />
                              )}
                            </label>
                          </div>

                          <div className="border-t border-neutral-100 my-1" />

                          {/* Portrait/Square Ratios */}
                          <div className="px-4 py-2">
                            {[
                              { value: '1:1', label: 'Square (1:1)' },
                              { value: '2:3', label: 'Portrait (2:3)' },
                              { value: '3:4', label: 'Portrait (3:4)' },
                              { value: '4:5', label: 'Social (4:5)' },
                              { value: '9:16', label: 'Mobile (9:16)' },
                            ].map((ratio) => (
                              <label key={ratio.value} className="flex items-center gap-3 cursor-pointer py-1.5">
                                <input
                                  type="radio"
                                  name="aspect-ratio"
                                  value={ratio.value}
                                  checked={selectedAspectRatio === ratio.value}
                                  onChange={(e) => {
                                    setSelectedAspectRatio(e.target.value as AspectRatio);
                                    setShowRatioDropdown(false);
                                  }}
                                  className="w-4 h-4 text-brand-primary accent-brand-primary"
                                />
                                <span className="text-sm text-neutral-700 flex-1">{ratio.label}</span>
                                {selectedAspectRatio === ratio.value && (
                                  <Check className="w-4 h-4 text-brand-primary" />
                                )}
                              </label>
                            ))}
                          </div>

                          <div className="border-t border-neutral-100 my-1" />

                          {/* Landscape Ratios */}
                          <div className="px-4 py-2">
                            {[
                              { value: '3:2', label: 'Landscape (3:2)' },
                              { value: '4:3', label: 'Landscape (4:3)' },
                              { value: '5:4', label: 'Classic (5:4)' },
                              { value: '16:9', label: 'Widescreen (16:9)' },
                              { value: '21:9', label: 'Cinematic (21:9)' },
                            ].map((ratio) => (
                              <label key={ratio.value} className="flex items-center gap-3 cursor-pointer py-1.5">
                                <input
                                  type="radio"
                                  name="aspect-ratio"
                                  value={ratio.value}
                                  checked={selectedAspectRatio === ratio.value}
                                  onChange={(e) => {
                                    setSelectedAspectRatio(e.target.value as AspectRatio);
                                    setShowRatioDropdown(false);
                                  }}
                                  className="w-4 h-4 text-brand-primary accent-brand-primary"
                                />
                                <span className="text-sm text-neutral-700 flex-1">{ratio.label}</span>
                                {selectedAspectRatio === ratio.value && (
                                  <Check className="w-4 h-4 text-brand-primary" />
                                )}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Enhance Prompt Button */}
                    <button
                      onClick={() => {/* TODO: Implement prompt enhancement */}}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-500 hover:text-neutral-700 transition-colors rounded-lg hover:bg-neutral-100"
                    >
                      <Wand2 className="w-4 h-4" />
                      <span>Enhance prompt</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
