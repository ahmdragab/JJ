import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Loader2, 
  Trash2, 
  Calendar, 
  Sparkles, 
  ImageIcon,
  Download,
  X,
  Send,
  ChevronDown,
  Grid3x3,
  Check,
  Wand2,
  Clock,
  Edit3,
  LayoutTemplate,
  ChevronUp
} from 'lucide-react';
import { supabase, Brand, GeneratedImage, Template, ConversationMessage } from '../lib/supabase';
import { ConfirmDialog } from '../components/ConfirmDialog';

type AspectRatio = '1:1' | '2:3' | '3:4' | '4:5' | '9:16' | '3:2' | '4:3' | '5:4' | '16:9' | '21:9' | 'auto';

type EditingImage = {
  id: string;
  image_url: string;
  prompt: string;
} | null;

export function Studio({ brand }: { brand: Brand }) {
  const navigate = useNavigate();
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  
  // Create/Edit state
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio>('auto');
  const [showRatioDropdown, setShowRatioDropdown] = useState(false);
  const [editingImage, setEditingImage] = useState<EditingImage>(null);
  
  // Modal state
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [editing, setEditing] = useState(false);
  
  // Confirmation dialog state
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; imageId: string | null }>({
    isOpen: false,
    imageId: null,
  });
  
  // Template state
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [templateFields, setTemplateFields] = useState<Record<string, string>>({});
  const [showTemplatesSection, setShowTemplatesSection] = useState(false);
  const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const ratioDropdownRef = useRef<HTMLDivElement>(null);
  const modalEditInputRef = useRef<HTMLInputElement>(null);

  const primaryColor = brand.colors?.primary || '#1a1a1a';

  useEffect(() => {
    loadData();
  }, [brand.id]);

  useEffect(() => {
    // Poll for generating images
    const generatingImages = images.filter(img => img.status === 'generating');
    if (generatingImages.length > 0) {
      const interval = setInterval(loadImages, 2000);
      return () => clearInterval(interval);
    }
  }, [images]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ratioDropdownRef.current && !ratioDropdownRef.current.contains(event.target as Node)) {
        setShowRatioDropdown(false);
      }
      if (inputContainerRef.current && !inputContainerRef.current.contains(event.target as Node)) {
        if (!prompt.trim() && !editingImage) {
          setInputFocused(false);
        }
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [prompt, editingImage]);

  const loadData = async () => {
    await Promise.all([loadImages(), loadTemplates()]);
    setLoading(false);
  };

  const loadImages = async () => {
    try {
      const { data, error } = await supabase
        .from('images')
        .select('*')
        .eq('brand_id', brand.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setImages(data || []);
    } catch (error) {
      console.error('Failed to load images:', error);
    }
  };

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const buildPromptFromTemplate = (template: Template, fields: Record<string, string>): string => {
    let prompt = template.prompt_template;
    
    // Replace field placeholders
    for (const [key, value] of Object.entries(fields)) {
      prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    
    // Handle conditional blocks {{#if field}}...{{/if}}
    prompt = prompt.replace(/\{\{#if (\w+)\}\}(.*?)\{\{\/if\}\}/gs, (_, field, content) => {
      return fields[field] ? content.replace(new RegExp(`{{${field}}}`, 'g'), fields[field]) : '';
    });
    
    return prompt;
  };

  const handleDeleteClick = (imageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete({ isOpen: true, imageId });
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDelete.imageId) return;

    const imageId = confirmDelete.imageId;
    setDeleting(imageId);
    try {
      const { error } = await supabase
        .from('images')
        .delete()
        .eq('id', imageId);

      if (error) throw error;
      setImages(images.filter(img => img.id !== imageId));
      if (selectedImage?.id === imageId) {
        setSelectedImage(null);
      }
    } catch (error) {
      console.error('Failed to delete image:', error);
    } finally {
      setDeleting(null);
      setConfirmDelete({ isOpen: false, imageId: null });
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;

    setGenerating(true);
    
    try {
      const { data: imageRecord, error: insertError } = await supabase
        .from('images')
        .insert({
          user_id: (await supabase.auth.getUser()).data.user?.id,
          brand_id: brand.id,
          template_id: currentTemplateId || null,
          prompt,
          status: 'generating',
          metadata: {
            aspect_ratio: selectedAspectRatio === 'auto' ? undefined : selectedAspectRatio,
            template_fields: currentTemplateId && templateFields ? templateFields : undefined,
          },
          conversation: [],
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Add to images list optimistically
      setImages(prev => [imageRecord, ...prev]);
      setPrompt('');
      setInputFocused(false);
      setCurrentTemplateId(null);
      setTemplateFields({});

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
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to generate image');
      }

      // Reload to get the generated image
      await loadImages();
      
    } catch (error) {
      console.error('Failed to generate:', error);
    } finally {
      setGenerating(false);
    }
  };

  const handleEdit = async () => {
    if (!prompt.trim() || !editingImage || editing) return;
    
    // Find the full image record
    const fullImage = images.find(img => img.id === editingImage.id);
    if (!fullImage) return;

    if (fullImage.edit_count >= fullImage.max_edits) {
      alert(`You've reached the maximum of ${fullImage.max_edits} edits for this image.`);
      return;
    }

    setEditing(true);
    const userMessage: ConversationMessage = {
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString(),
    };

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
            imageId: editingImage.id,
            editMode: true,
            previousImageUrl: editingImage.image_url,
            conversation: [...(fullImage.conversation || []), userMessage].slice(-5),
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Edit failed');
      }

      setPrompt('');
      setEditingImage(null);
      setInputFocused(false);
      await loadImages();
      
    } catch (error) {
      console.error('Failed to edit:', error);
    } finally {
      setEditing(false);
    }
  };

  const handleDownload = async (image: GeneratedImage, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!image.image_url) return;

    try {
      const response = await fetch(image.image_url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${brand.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const handleTemplateClick = (template: Template) => {
    // If template has fields, show modal to fill them
    if (template.fields && template.fields.length > 0) {
      setSelectedTemplate(template);
      setTemplateFields({});
    } else {
      // No fields, auto-fill the prompt
      const prompt = buildPromptFromTemplate(template, {});
      setPrompt(prompt);
      setInputFocused(true);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleTemplateGenerate = async () => {
    if (!selectedTemplate) return;
    
    const prompt = buildPromptFromTemplate(selectedTemplate, templateFields);
    const templateId = selectedTemplate.id;
    
    setSelectedTemplate(null);
    setTemplateFields({});
    setCurrentTemplateId(templateId);
    
    // Set the prompt and focus input
    setPrompt(prompt);
    setInputFocused(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const startEditing = (image: GeneratedImage, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingImage({
      id: image.id,
      image_url: image.image_url || '',
      prompt: image.prompt,
    });
    setPrompt('');
    setInputFocused(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const cancelEditing = () => {
    setEditingImage(null);
    setPrompt('');
    setInputFocused(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const aspectRatios: { value: AspectRatio; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: '1:1', label: 'Square (1:1)' },
    { value: '16:9', label: 'Landscape (16:9)' },
    { value: '9:16', label: 'Portrait (9:16)' },
    { value: '4:5', label: 'Portrait (4:5)' },
    { value: '3:2', label: 'Landscape (3:2)' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-50 via-neutral-50 to-zinc-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-neutral-50 to-zinc-50 relative">
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

      {/* Main Content */}
      <div className="relative z-10 pb-40">
        <div className="p-6 md:p-12">
          <div className="max-w-7xl mx-auto">
            {/* Templates Section - Collapsible when images exist */}
            {images.length > 0 && templates.length > 0 && (
              <div className="mb-8">
                <button
                  onClick={() => setShowTemplatesSection(!showTemplatesSection)}
                  className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <LayoutTemplate className="w-4 h-4" />
                  <span className="text-sm font-medium">Templates</span>
                  {showTemplatesSection ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
                
                {showTemplatesSection && (
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {templates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => handleTemplateClick(template)}
                        className="group relative bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-slate-200/50 hover:bg-white hover:shadow-lg hover:border-slate-300 transition-all text-left"
                      >
                        <div 
                          className="w-full aspect-square rounded-lg mb-3 flex items-center justify-center"
                          style={{ 
                            backgroundColor: template.preview_color || `${primaryColor}15` 
                          }}
                        >
                          <LayoutTemplate 
                            className="w-8 h-8" 
                            style={{ color: template.preview_color || primaryColor }}
                          />
                        </div>
                        <h4 className="text-sm font-medium text-slate-900 mb-1">
                          {template.name}
                        </h4>
                        {template.description && (
                          <p className="text-xs text-slate-500 line-clamp-2">
                            {template.description}
                          </p>
                        )}
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                          <Grid3x3 className="w-3 h-3" />
                          <span>{template.aspect_ratio}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Gallery Grid or Templates (empty state) */}
            {images.length === 0 ? (
              templates.length > 0 ? (
                <div>
                  <div className="text-center mb-8">
                    <div 
                      className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                      style={{ backgroundColor: `${primaryColor}10` }}
                    >
                      <ImageIcon className="w-8 h-8" style={{ color: primaryColor }} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">
                      Get started with a template
                    </h3>
                    <p className="text-sm text-slate-600">
                      Choose a template below or create from scratch using the input
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {templates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => handleTemplateClick(template)}
                        className="group relative bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-slate-200/50 hover:bg-white hover:shadow-lg hover:border-slate-300 transition-all text-left"
                      >
                        <div 
                          className="w-full aspect-square rounded-lg mb-3 flex items-center justify-center"
                          style={{ 
                            backgroundColor: template.preview_color || `${primaryColor}15` 
                          }}
                        >
                          <LayoutTemplate 
                            className="w-8 h-8" 
                            style={{ color: template.preview_color || primaryColor }}
                          />
                        </div>
                        <h4 className="text-sm font-medium text-slate-900 mb-1">
                          {template.name}
                        </h4>
                        {template.description && (
                          <p className="text-xs text-slate-500 line-clamp-2">
                            {template.description}
                          </p>
                        )}
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                          <Grid3x3 className="w-3 h-3" />
                          <span>{template.aspect_ratio}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-20">
                  <div className="max-w-md mx-auto">
                    <div 
                      className="w-24 h-24 rounded-3xl mx-auto mb-6 flex items-center justify-center"
                      style={{ backgroundColor: `${primaryColor}10` }}
                    >
                      <ImageIcon className="w-12 h-12" style={{ color: primaryColor }} />
                    </div>
                    <h3 className="text-2xl font-bold text-slate-800 mb-3">
                      No images yet
                    </h3>
                    <p className="text-slate-600 mb-6">
                      Start creating on-brand images using the input below
                    </p>
                  </div>
                </div>
              )
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                {images.map((image) => (
                  <div
                    key={image.id}
                    onClick={() => setSelectedImage(image)}
                    className="group relative bg-white/70 backdrop-blur-sm rounded-2xl overflow-hidden cursor-pointer hover:bg-white hover:shadow-xl transition-all duration-300 border border-slate-200/50"
                  >
                    {/* Image Preview */}
                    <div className="aspect-square bg-slate-50 relative overflow-hidden flex items-center justify-center">
                      {image.image_url ? (
                        <img
                          src={image.image_url}
                          alt="Generated"
                          className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : image.status === 'generating' ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="text-center">
                            <Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto mb-2" />
                            <p className="text-xs text-slate-500">Creating...</p>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Sparkles className="w-10 h-10 text-slate-300" />
                        </div>
                      )}

                      {/* Hover overlay with actions and details */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Bottom section with prompt and actions */}
                        <div className="absolute bottom-0 left-0 right-0 p-3 space-y-2">
                          {/* Prompt text - shown on hover at bottom */}
                          <p className="text-xs text-white line-clamp-2 drop-shadow-lg">
                            {image.prompt.length > 100 ? image.prompt.slice(0, 100) + '...' : image.prompt}
                          </p>
                          
                          {/* Action buttons */}
                          <div className="flex items-center justify-between">
                            <button
                              onClick={(e) => startEditing(image, e)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-lg text-xs font-medium text-slate-700 hover:bg-white transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              Edit
                            </button>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => handleDownload(image, e)}
                                className="w-8 h-8 rounded-lg bg-white/90 backdrop-blur-sm flex items-center justify-center text-slate-700 hover:bg-white transition-colors"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => handleDeleteClick(image.id, e)}
                                disabled={deleting === image.id}
                                className="w-8 h-8 rounded-lg bg-white/90 backdrop-blur-sm flex items-center justify-center text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
                              >
                                {deleting === image.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Status badge */}
                      {image.status === 'generating' && (
                        <div className="absolute top-2 left-2 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                          Creating
                        </div>
                      )}
                      
                      {/* Edit count badge */}
                      {image.edit_count > 0 && (
                        <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-slate-900/70 backdrop-blur-sm text-white text-xs font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {image.edit_count}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Input Bar */}
      <div 
        ref={inputContainerRef}
        className={`fixed bottom-0 left-0 right-0 z-40 transition-all duration-300 ${
          inputFocused ? 'pb-6' : 'pb-6'
        }`}
      >
        <div className="max-w-3xl mx-auto px-4">
          {/* Editing Badge */}
          {editingImage && (
            <div className="mb-3 flex items-center gap-3 bg-white/90 backdrop-blur-sm rounded-xl p-2 border border-slate-200">
              <img 
                src={editingImage.image_url} 
                alt="Editing" 
                className="w-12 h-12 rounded-lg object-cover"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700">Editing image</p>
                <p className="text-xs text-slate-500 truncate">{editingImage.prompt}</p>
              </div>
              <button
                onClick={cancelEditing}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Main Input */}
          <div 
            className={`bg-white/95 backdrop-blur-xl rounded-2xl border shadow-xl transition-all duration-300 ${
              inputFocused 
                ? 'border-slate-300 shadow-2xl' 
                : 'border-slate-200/80'
            }`}
            style={{
              borderColor: inputFocused ? `${primaryColor}40` : undefined,
            }}
          >
            <div className="flex items-center gap-3 p-3">
              {!editingImage && (
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${primaryColor}15` }}
                >
                  <Sparkles className="w-5 h-5" style={{ color: primaryColor }} />
                </div>
              )}
              
              <input
                ref={inputRef}
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onFocus={() => setInputFocused(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    editingImage ? handleEdit() : handleGenerate();
                  }
                }}
                placeholder={editingImage ? "What would you like to change?" : "e.g., Create a LinkedIn post to celebrate UAE National Day"}
                className="flex-1 bg-transparent border-none outline-none text-slate-900 placeholder:text-slate-400 placeholder:text-sm text-base py-2"
              />

              {/* Actions */}
              {(inputFocused || prompt.trim()) && (
                <div className="flex items-center gap-2 shrink-0">
                  {/* Ratio Dropdown (only for new images) */}
                  {!editingImage && (
                    <div className="relative" ref={ratioDropdownRef}>
                      <button
                        onClick={() => setShowRatioDropdown(!showRatioDropdown)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-100"
                      >
                        <Grid3x3 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{selectedAspectRatio === 'auto' ? 'Auto' : selectedAspectRatio}</span>
                        <ChevronDown className={`w-3 h-3 transition-transform ${showRatioDropdown ? 'rotate-180' : ''}`} />
                      </button>

                      {showRatioDropdown && (
                        <div className="absolute bottom-full left-0 mb-2 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-50">
                          {aspectRatios.map((ratio) => (
                            <button
                              key={ratio.value}
                              onClick={() => {
                                setSelectedAspectRatio(ratio.value);
                                setShowRatioDropdown(false);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center justify-between"
                            >
                              <span>{ratio.label}</span>
                              {selectedAspectRatio === ratio.value && (
                                <Check className="w-4 h-4 text-slate-600" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Enhance Prompt Button (placeholder) */}
                  {!editingImage && (
                    <button
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-100"
                      onClick={() => {/* TODO: Enhance prompt */}}
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Enhance</span>
                    </button>
                  )}

                  {/* Submit Button */}
                  <button
                    onClick={editingImage ? handleEdit : handleGenerate}
                    disabled={(generating || editing) || !prompt.trim()}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-white font-medium transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {(generating || editing) ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span className="hidden sm:inline">
                      {editingImage ? 'Apply' : 'Create'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8"
          onClick={() => setSelectedImage(null)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          
          {/* Modal Content */}
          <div 
            className="relative bg-white rounded-3xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col md:flex-row"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-white transition-colors shadow-lg"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Image Panel */}
            <div className="flex-1 bg-slate-100 flex items-center justify-center p-6 md:p-8">
              {selectedImage.image_url ? (
                <img
                  src={selectedImage.image_url}
                  alt="Generated"
                  className="max-w-full max-h-[60vh] md:max-h-[70vh] rounded-2xl shadow-lg object-contain"
                />
              ) : selectedImage.status === 'generating' ? (
                <div className="text-center">
                  <Loader2 className="w-12 h-12 animate-spin text-slate-400 mx-auto mb-4" />
                  <p className="text-slate-600">Creating your image...</p>
                </div>
              ) : (
                <div className="text-center">
                  <Sparkles className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">Image not available</p>
                </div>
              )}
            </div>

            {/* Info Panel */}
            <div className="w-full md:w-80 lg:w-96 border-t md:border-t-0 md:border-l border-slate-200 flex flex-col">
              {/* Header */}
              <div className="p-6 border-b border-slate-100">
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatDate(selectedImage.created_at)}
                  {selectedImage.edit_count > 0 && (
                    <span className="px-2 py-0.5 bg-slate-100 rounded-full">
                      {selectedImage.edit_count} edit{selectedImage.edit_count !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {selectedImage.prompt}
                </p>
              </div>

              {/* Edit History */}
              {selectedImage.conversation && selectedImage.conversation.length > 0 && (
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Edit History</p>
                  {selectedImage.conversation.map((msg, index) => (
                    <div
                      key={index}
                      className={`rounded-xl p-3 text-sm ${
                        msg.role === 'user'
                          ? 'bg-slate-900 text-white ml-4'
                          : 'bg-slate-100 text-slate-700 mr-4'
                      }`}
                    >
                      {msg.content}
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="p-4 border-t border-slate-100 flex items-center gap-2">
                <button
                  onClick={() => {
                    startEditing(selectedImage);
                    setSelectedImage(null);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white font-medium transition-all hover:shadow-lg"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Edit3 className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => handleDownload(selectedImage)}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-medium transition-colors"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Template Field Modal */}
      {selectedTemplate && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setSelectedTemplate(null);
            setTemplateFields({});
          }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          
          {/* Modal Content */}
          <div 
            className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => {
                setSelectedTemplate(null);
                setTemplateFields({});
              }}
              className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="mb-6 pr-8">
              <h3 className="text-lg font-bold text-slate-900 mb-1">
                {selectedTemplate.name}
              </h3>
              {selectedTemplate.description && (
                <p className="text-sm text-slate-600">
                  {selectedTemplate.description}
                </p>
              )}
            </div>

            {/* Fields */}
            <div className="space-y-4 mb-6">
              {selectedTemplate.fields.map((field) => (
                <div key={field.name}>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {field.label}
                    {field.required && (
                      <span className="text-red-500 ml-1">*</span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={templateFields[field.name] || ''}
                    onChange={(e) => setTemplateFields({
                      ...templateFields,
                      [field.name]: e.target.value
                    })}
                    placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all"
                  />
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setSelectedTemplate(null);
                  setTemplateFields({});
                }}
                className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleTemplateGenerate}
                disabled={
                  selectedTemplate.fields.some(f => 
                    f.required && !templateFields[f.name]?.trim()
                  )
                }
                className="flex-1 px-4 py-2.5 rounded-xl text-white font-medium transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: primaryColor }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        onClose={() => setConfirmDelete({ isOpen: false, imageId: null })}
        onConfirm={handleDeleteConfirm}
        title="Delete Image"
        message="Are you sure you want to delete this image? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />

      <style>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        .animate-blob { animation: blob 7s infinite; }
        .animation-delay-2000 { animation-delay: 2s; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

