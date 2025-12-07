import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ChevronDown, Grid3x3, Wand2, Check } from 'lucide-react';
import { supabase, Brand } from '../lib/supabase';

type AspectRatio = '1:1' | '2:3' | '3:4' | '4:5' | '9:16' | '3:2' | '4:3' | '5:4' | '16:9' | '21:9' | 'auto';

export function CreatePage({ brand }: { brand: Brand }) {
  const navigate = useNavigate();
  // TEMPLATES COMMENTED OUT
  // const [templates, setTemplates] = useState<Template[]>([]);
  // const [loading, setLoading] = useState(true);
  // const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  // const [templateFields, setTemplateFields] = useState<Record<string, string>>({});
  const [scratchPrompt, setScratchPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  // const [mode, setMode] = useState<'choice' | 'template'>('choice');
  // const [templatesExpanded, setTemplatesExpanded] = useState(false);
  const [customPromptExpanded, setCustomPromptExpanded] = useState(false);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio>('auto');
  const [showRatioDropdown, setShowRatioDropdown] = useState(false);
  const ratioDropdownRef = useRef<HTMLDivElement>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);

  const primaryColor = brand.colors?.primary || '#1a1a1a';

  // TEMPLATES COMMENTED OUT
  // useEffect(() => {
  //   loadTemplates();
  // }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Handle ratio dropdown
      if (ratioDropdownRef.current && !ratioDropdownRef.current.contains(event.target as Node)) {
        setShowRatioDropdown(false);
      }
      
      // Handle input container collapse
      if (inputContainerRef.current && !inputContainerRef.current.contains(event.target as Node)) {
        // Only collapse if input is empty
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

  // TEMPLATES COMMENTED OUT
  // const loadTemplates = async () => {
  //   try {
  //     const { data, error } = await supabase
  //       .from('templates')
  //       .select('*')
  //       .eq('is_active', true)
  //       .order('created_at', { ascending: true });

  //     if (error) throw error;
  //     setTemplates(data || []);
  //   } catch (error) {
  //     console.error('Failed to load templates:', error);
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  // const handleSelectTemplate = (template: Template) => {
  //   setSelectedTemplate(template);
  //   setTemplateFields({});
  //   setMode('template');
  // };

  // const buildPromptFromTemplate = (template: Template, fields: Record<string, string>): string => {
  //   let prompt = template.prompt_template;
    
  //   // Replace field placeholders
  //   for (const [key, value] of Object.entries(fields)) {
  //     prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
  //   }
    
  //   // Handle conditional blocks {{#if field}}...{{/if}}
  //   prompt = prompt.replace(/\{\{#if (\w+)\}\}(.*?)\{\{\/if\}\}/gs, (_, field, content) => {
  //     return fields[field] ? content.replace(new RegExp(`{{${field}}}`, 'g'), fields[field]) : '';
  //   });
    
  //   return prompt;
  // };

  const handleGenerate = async (prompt: string, templateId?: string, metadata?: Record<string, unknown>) => {
    setGenerating(true);
    
    try {
      // Create image record first
      const { data: imageRecord, error: insertError } = await supabase
        .from('images')
        .insert({
          user_id: (await supabase.auth.getUser()).data.user?.id,
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

      // Generate the image
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
            imageId: imageRecord.id,
            aspectRatio: metadata?.aspect_ratio || (selectedAspectRatio === 'auto' ? undefined : selectedAspectRatio),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate image');
      }

      // Navigate to the image editor
      navigate(`/brands/${brand.slug}/gallery/${imageRecord.id}`);
      
    } catch (error) {
      console.error('Failed to generate:', error);
      setGenerating(false);
    }
  };

  // TEMPLATES COMMENTED OUT
  // const handleTemplateGenerate = () => {
  //   if (!selectedTemplate) return;
    
  //   const prompt = buildPromptFromTemplate(selectedTemplate, templateFields);
  //   handleGenerate(prompt, selectedTemplate.id, {
  //     aspect_ratio: selectedTemplate.aspect_ratio,
  //     template_fields: templateFields,
  //   });
  // };

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

  // TEMPLATES COMMENTED OUT
  // const getAspectRatioIcon = (ratio: string) => {
  //   switch (ratio) {
  //     case '1:1': return '□';
  //     case '16:9': return '▬';
  //     case '9:16': return '▮';
  //     case '4:5': return '▯';
  //     default: return '□';
  //   }
  // };

  // TEMPLATES COMMENTED OUT - removed loading state
  // if (loading) {
  //   return (
  //     <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-50 via-neutral-50 to-zinc-50">
  //       <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
  //     </div>
  //   );
  // }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-neutral-50 to-zinc-50 relative overflow-hidden">
      {/* Subtle background texture */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute -top-40 -right-40 w-96 h-96 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"
          style={{ backgroundColor: primaryColor }}
        />
        <div 
          className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"
          style={{ backgroundColor: primaryColor }}
        />
      </div>

      <div className="relative z-10 p-6 md:p-12">
        <div className="max-w-5xl mx-auto">
          {/* Free-form prompt input */}
          <div className="space-y-12">
              {/* Custom Input Field */}
              <div className={`transition-all duration-300 ${customPromptExpanded ? 'max-w-5xl mx-auto' : 'max-w-4xl mx-auto'} mt-16`} ref={inputContainerRef}>
                <div 
                  className={`rounded-2xl border transition-all duration-300 bg-gradient-to-br from-stone-50 via-neutral-50 to-zinc-50 ${customPromptExpanded ? 'p-10 shadow-xl' : 'p-6 shadow-sm'}`}
                  style={{
                    borderColor: customPromptExpanded ? primaryColor : `${primaryColor}30`,
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
                      className="flex-1 bg-transparent border-none outline-none text-slate-900 placeholder:text-slate-400 placeholder:text-sm text-base"
                    />
                    {customPromptExpanded && (
                      <>
                        <button
                          onClick={handleScratchGenerate}
                          disabled={generating || !scratchPrompt.trim()}
                          className="px-6 py-2.5 rounded-xl text-white font-medium transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shrink-0"
                          style={{ 
                            backgroundColor: primaryColor,
                          }}
                        >
                          {generating ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Creating...
                            </>
                          ) : (
                            'Create'
                          )}
                        </button>
                      </>
                    )}
                  </div>

                  {/* Expanded Options */}
                  {customPromptExpanded && (
                    <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between">
                      {/* Ratio Dropdown Button */}
                      <div className="relative" ref={ratioDropdownRef}>
                        <button
                          onClick={() => setShowRatioDropdown(!showRatioDropdown)}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
                        >
                          <Grid3x3 className="w-4 h-4" />
                          <span>Ratio</span>
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showRatioDropdown ? 'rotate-180' : ''}`} />
                        </button>

                        {/* Ratio Dropdown Menu */}
                        {showRatioDropdown && (
                          <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50">
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
                                  className="w-4 h-4 text-slate-600"
                                />
                                <div className="flex items-center gap-2 flex-1">
                                  <Grid3x3 className="w-4 h-4 text-slate-400" />
                                  <span className="text-sm text-slate-700">Auto</span>
                                </div>
                                {selectedAspectRatio === 'auto' && (
                                  <Check className="w-4 h-4 text-slate-600" />
                                )}
                              </label>
                            </div>

                            <div className="border-t border-slate-100 my-1" />

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
                                    className="w-4 h-4 text-slate-600"
                                  />
                                  <span className="text-sm text-slate-700 flex-1">{ratio.label}</span>
                                  {selectedAspectRatio === ratio.value && (
                                    <Check className="w-4 h-4 text-slate-600" />
                                  )}
                                </label>
                              ))}
                            </div>

                            <div className="border-t border-slate-100 my-1" />

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
                                    className="w-4 h-4 text-slate-600"
                                  />
                                  <span className="text-sm text-slate-700 flex-1">{ratio.label}</span>
                                  {selectedAspectRatio === ratio.value && (
                                    <Check className="w-4 h-4 text-slate-600" />
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
                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
                      >
                        <Wand2 className="w-4 h-4" />
                        <span>Enhance prompt</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* TEMPLATES COMMENTED OUT */}
              {/* Templates Grid */}
              {/* <div className="space-y-6">
                <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
                  <LayoutTemplate className="w-5 h-5" />
                  Templates
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {(templatesExpanded ? templates : templates.slice(0, 3)).map((template) => (
                    <button
                      key={template.id}
                      onClick={() => handleSelectTemplate(template)}
                      className="group relative bg-white/70 backdrop-blur-sm rounded-3xl p-6 text-left hover:bg-white hover:shadow-xl transition-all duration-300 border border-slate-200/50"
                    >
                      <div 
                        className="h-32 rounded-2xl mb-4 flex items-center justify-center text-4xl font-light text-white/80"
                        style={{ backgroundColor: template.preview_color || primaryColor }}
                      >
                        {getAspectRatioIcon(template.aspect_ratio)}
                      </div>
                      
                      <h3 className="text-lg font-semibold text-slate-900 mb-1 group-hover:text-slate-800">
                        {template.name}
                      </h3>
                      <p className="text-sm text-slate-500 mb-3 line-clamp-2">
                        {template.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
                          {template.aspect_ratio}
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </button>
                  ))}
                </div>
                {templates.length > 3 && (
                  <button
                    onClick={() => setTemplatesExpanded(!templatesExpanded)}
                    className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors text-sm font-medium"
                  >
                    {templatesExpanded ? (
                      <>
                        <ChevronDown className="w-4 h-4 rotate-180" />
                        Show less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        Show {templates.length - 3} more templates
                      </>
                    )}
                  </button>
                )}
              </div> */}
            </div>

          {/* TEMPLATES COMMENTED OUT */}
          {/* Template Mode */}
          {/* {mode === 'template' && selectedTemplate && (
            <div className="max-w-2xl mx-auto space-y-8">
              <button
                onClick={() => {
                  setMode('choice');
                  setSelectedTemplate(null);
                  setTemplateFields({});
                }}
                className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm rounded-full text-slate-600 hover:text-slate-900 hover:bg-white shadow-sm transition-all mb-4"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-medium">Back</span>
              </button>
              
              <div className="text-center">
                <div 
                  className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-2xl text-white/80"
                  style={{ backgroundColor: selectedTemplate.preview_color || primaryColor }}
                >
                  {getAspectRatioIcon(selectedTemplate.aspect_ratio)}
                </div>
                <h1 className="text-3xl font-bold text-slate-900 mb-2">
                  {selectedTemplate.name}
                </h1>
                <p className="text-slate-600">
                  {selectedTemplate.description}
                </p>
              </div>

              <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 space-y-6 border border-slate-200/50">
                {selectedTemplate.fields.map((field) => (
                  <div key={field.name}>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {field.label}
                      {field.required && <span className="text-red-400 ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      value={templateFields[field.name] || ''}
                      onChange={(e) => setTemplateFields(prev => ({ ...prev, [field.name]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all"
                    />
                  </div>
                ))}

                <button
                  onClick={handleTemplateGenerate}
                  disabled={generating || selectedTemplate.fields.some(f => f.required && !templateFields[f.name])}
                  className="w-full py-4 rounded-xl text-white font-medium text-lg transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                  style={{ backgroundColor: primaryColor }}
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Creating your image...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Generate
                    </>
                  )}
                </button>
              </div>
            </div>
          )} */}

        </div>
      </div>

      <style>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        .animate-blob { animation: blob 7s infinite; }
        .animation-delay-2000 { animation-delay: 2s; }
      `}</style>
    </div>
  );
}

