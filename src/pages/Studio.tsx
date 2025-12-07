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
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Palette
} from 'lucide-react';
import { supabase, Brand, GeneratedImage, ConversationMessage, BrandAsset, Style } from '../lib/supabase';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AssetPicker } from '../components/AssetPicker';
import { ReferenceUpload } from '../components/ReferenceUpload';
import { StylesPicker } from '../components/StylesPicker';

type AspectRatio = '1:1' | '2:3' | '3:4' | '4:5' | '9:16' | '3:2' | '4:3' | '5:4' | '16:9' | '21:9' | 'auto';

type EditingImage = {
  id: string;
  image_url: string;
  prompt: string;
} | null;

export function Studio({ brand }: { brand: Brand }) {
  const navigate = useNavigate();
  const [images, setImages] = useState<GeneratedImage[]>([]);
  // TEMPLATES COMMENTED OUT
  // const [templates, setTemplates] = useState<Template[]>([]);
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
  const [currentVersionIndex, setCurrentVersionIndex] = useState(0);
  const [modalEditPrompt, setModalEditPrompt] = useState('');
  const [modalEditing, setModalEditing] = useState(false);
  const [showModalEditPrompt, setShowModalEditPrompt] = useState(false);
  const [gptPromptInfo, setGptPromptInfo] = useState<{ system_prompt: string; user_message: string; full_prompt: string } | null>(null);
  const [showGptPrompt, setShowGptPrompt] = useState(false);
  
  // Confirmation dialog state
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; imageId: string | null }>({
    isOpen: false,
    imageId: null,
  });
  
  // TEMPLATES COMMENTED OUT
  // Template state
  // const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  // const [templateFields, setTemplateFields] = useState<Record<string, string>>({});
  // const [showTemplatesSection, setShowTemplatesSection] = useState(false);
  // const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(null);
  
  // Asset selection state
  const [selectedAssets, setSelectedAssets] = useState<BrandAsset[]>([]);
  const [selectedReferences, setSelectedReferences] = useState<BrandAsset[]>([]);
  const [selectedStyles, setSelectedStyles] = useState<Style[]>([]);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [showMediaPopover, setShowMediaPopover] = useState(false);
  const [showReferenceUpload, setShowReferenceUpload] = useState(false);
  const [showStylesPicker, setShowStylesPicker] = useState(false);
  
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const ratioDropdownRef = useRef<HTMLDivElement>(null);
  const modalEditInputRef = useRef<HTMLInputElement>(null);
  const mediaPopoverRef = useRef<HTMLDivElement>(null);

  const primaryColor = brand.colors?.primary || '#1a1a1a';

  // Calculate auto-included images (logo, backdrop, screenshot)
  const autoIncludedImages = [
    brand.logos?.primary ? 1 : 0,
    brand.backdrops?.length ? 1 : 0,
    brand.screenshot ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  // Gemini 3 Pro Image limits
  const MAX_HIGH_FIDELITY = 6; // Assets (high-fidelity objects)
  const MAX_TOTAL_IMAGES = 14; // Total including auto-included

  // Calculate current counts (styles count as references)
  const currentAssets = selectedAssets.length;
  const currentReferences = selectedReferences.length + selectedStyles.length;
  const currentTotal = currentAssets + currentReferences + autoIncludedImages;

  // Persist prompt to localStorage
  const STORAGE_KEY = `studio-prompt-${brand.id}`;

  useEffect(() => {
    loadData();
    // Load saved prompt from localStorage
    const savedPrompt = localStorage.getItem(STORAGE_KEY);
    if (savedPrompt) {
      setPrompt(savedPrompt);
    }
  }, [brand.id]);

  // Save prompt to localStorage whenever it changes
  useEffect(() => {
    if (prompt.trim()) {
      localStorage.setItem(STORAGE_KEY, prompt);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [prompt, STORAGE_KEY]);

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
      if (mediaPopoverRef.current && !mediaPopoverRef.current.contains(event.target as Node)) {
        setShowMediaPopover(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [prompt, editingImage]);

  const loadData = async () => {
    await Promise.all([loadImages()/*, loadTemplates()*/]);
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
  //   }
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
          template_id: null, // TEMPLATES COMMENTED OUT: currentTemplateId || null,
          prompt,
          status: 'generating',
          metadata: {
            aspect_ratio: selectedAspectRatio === 'auto' ? undefined : selectedAspectRatio,
            // TEMPLATES COMMENTED OUT: template_fields: currentTemplateId && templateFields ? templateFields : undefined,
          },
          conversation: [],
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Add to images list optimistically
      setImages(prev => [imageRecord, ...prev]);
      setPrompt('');
      localStorage.removeItem(STORAGE_KEY);
      setInputFocused(false);
      // TEMPLATES COMMENTED OUT
      // setCurrentTemplateId(null);
      // setTemplateFields({});
      setSelectedAssets([]);
      setSelectedReferences([]);
      setSelectedStyles([]);

      // Combine references and styles
      const allReferences = [
        ...selectedReferences.map(r => ({
          id: r.id,
          url: r.url,
          name: r.name,
          category: r.category,
          role: 'style_reference' as const,
        })),
        ...selectedStyles.map(s => ({
          id: s.id,
          url: s.url,
          name: s.name,
          category: s.category,
          role: 'style_reference' as const,
          style_description: s.style_description,
        })),
      ];

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
            aspectRatio: selectedAspectRatio === 'auto' ? undefined : selectedAspectRatio,
            assets: selectedAssets.map(a => ({
              id: a.id,
              url: a.url,
              name: a.name,
              category: a.category,
              role: 'must_include',
            })),
            references: allReferences,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to generate image');
      }

      // Capture GPT prompt info if available
      const responseData = await response.json();
      if (responseData.gpt_prompt_info) {
        setGptPromptInfo(responseData.gpt_prompt_info);
        console.log('GPT Prompt Info captured:', responseData.gpt_prompt_info);
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
            assets: selectedAssets.map(a => ({
              id: a.id,
              url: a.url,
              name: a.name,
              category: a.category,
              role: 'must_include',
            })),
            references: [
              ...selectedReferences.map(r => ({
                id: r.id,
                url: r.url,
                name: r.name,
                category: r.category,
                role: 'style_reference' as const,
              })),
              ...selectedStyles.map(s => ({
                id: s.id,
                url: s.url,
                name: s.name,
                category: s.category,
                role: 'style_reference' as const,
                style_description: s.style_description,
              })),
            ],
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Edit failed');
      }

      setPrompt('');
      localStorage.removeItem(STORAGE_KEY);
      setEditingImage(null);
      setInputFocused(false);
      setSelectedAssets([]);
      setSelectedReferences([]);
      setSelectedStyles([]);
      await loadImages();
      
    } catch (error) {
      console.error('Failed to edit:', error);
    } finally {
      setEditing(false);
    }
  };

  const handleModalEdit = async () => {
    console.log('handleModalEdit called', { 
      hasPrompt: !!modalEditPrompt.trim(), 
      hasImage: !!selectedImage, 
      isEditing: modalEditing 
    });
    
    if (!modalEditPrompt.trim() || !selectedImage || modalEditing) {
      console.log('Early return from handleModalEdit');
      return;
    }

    if (selectedImage.edit_count >= selectedImage.max_edits) {
      alert(`You've reached the maximum of ${selectedImage.max_edits} edits for this image.`);
      return;
    }

    const userMessage: ConversationMessage = {
      role: 'user',
      content: modalEditPrompt,
      timestamp: new Date().toISOString(),
    };

    const editPromptText = modalEditPrompt;
    const imageId = selectedImage.id;
    const originalImage = selectedImage;
    
    // Set editing state and clear input immediately
    setModalEditing(true);
    setModalEditPrompt('');
    
    // Optimistically update the UI to show loading
    const updatedConversation = [...(selectedImage.conversation || []), userMessage];
    setSelectedImage({
      ...selectedImage,
      status: 'generating',
      conversation: updatedConversation,
      edit_count: selectedImage.edit_count + 1,
    });

    try {
      console.log('Making API call...');
      
      // Make the API call - this blocks until the image is generated
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            prompt: editPromptText,
            brandId: brand.id,
            imageId: imageId,
            editMode: true,
            previousImageUrl: selectedImage.image_url,
            conversation: updatedConversation.slice(-5),
            assets: selectedAssets.map(a => ({
              id: a.id,
              url: a.url,
              name: a.name,
              category: a.category,
              role: 'must_include',
            })),
            references: [
              ...selectedReferences.map(r => ({
                id: r.id,
                url: r.url,
                name: r.name,
                category: r.category,
                role: 'style_reference' as const,
              })),
              ...selectedStyles.map(s => ({
                id: s.id,
                url: s.url,
                name: s.name,
                category: s.category,
                role: 'style_reference' as const,
                style_description: s.style_description,
              })),
            ],
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Edit failed');
      }

      // Capture GPT prompt info if available (for new generations, not edits)
      const responseData = await response.json();
      if (responseData.gpt_prompt_info) {
        setGptPromptInfo(responseData.gpt_prompt_info);
        console.log('GPT Prompt Info captured:', responseData.gpt_prompt_info);
      }

      console.log('API call complete, fetching updated image...');

      // Fetch the updated image from the database
      const { data: updatedImage, error: fetchError } = await supabase
        .from('images')
        .select('*')
        .eq('id', imageId)
        .single();

      if (fetchError) {
        console.error('Failed to fetch updated image:', fetchError);
        throw fetchError;
      }

      console.log('Updated image fetched:', {
        status: updatedImage.status,
        hasImageUrl: !!updatedImage.image_url,
        editCount: updatedImage.edit_count
      });

      // Update the modal with the new image
      setSelectedImage(updatedImage);
      
      // Show the latest version
      const versions = getAllVersions(updatedImage);
      setCurrentVersionIndex(Math.max(0, versions.length - 1));
      
      // Update the gallery in the background
      loadImages().catch(console.error);
      
    } catch (error) {
      console.error('Failed to edit:', error);
      // Revert to original image on error
      setSelectedImage(originalImage);
      setModalEditPrompt(editPromptText);
      setSelectedAssets([]);
      setSelectedReferences([]);
      setSelectedStyles([]);
    } finally {
      setModalEditing(false);
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

  // TEMPLATES COMMENTED OUT
  // const handleTemplateClick = (template: Template) => {
  //   // If template has fields, show modal to fill them
  //   if (template.fields && template.fields.length > 0) {
  //     setSelectedTemplate(template);
  //     setTemplateFields({});
  //   } else {
  //     // No fields, auto-fill the prompt
  //     const prompt = buildPromptFromTemplate(template, {});
  //     setPrompt(prompt);
  //     setInputFocused(true);
  //     setTimeout(() => inputRef.current?.focus(), 100);
  //   }
  // };

  // const handleTemplateGenerate = async () => {
  //   if (!selectedTemplate) return;
    
  //   const prompt = buildPromptFromTemplate(selectedTemplate, templateFields);
  //   const templateId = selectedTemplate.id;
    
  //   setSelectedTemplate(null);
  //   setTemplateFields({});
  //   setCurrentTemplateId(templateId);
    
  //   // Set the prompt and focus input
  //   setPrompt(prompt);
  //   setInputFocused(true);
  //   setTimeout(() => inputRef.current?.focus(), 100);
  // };

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
    localStorage.removeItem(STORAGE_KEY);
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

  // Get all versions (history + current)
  const getAllVersions = (img: GeneratedImage | null): Array<{ image_url: string; edit_prompt?: string; timestamp: string }> => {
    if (!img) return [];
    
    const versions: Array<{ image_url: string; edit_prompt?: string; timestamp: string }> = [];
    
    // Add version history (oldest first)
    if (img.version_history && Array.isArray(img.version_history)) {
      versions.push(...img.version_history);
    }
    
    // Add current version (newest)
    if (img.image_url) {
      versions.push({
        image_url: img.image_url,
        timestamp: img.updated_at,
      });
    }
    
    return versions;
  };

  const navigateVersion = (direction: number, totalVersions: number) => {
    setCurrentVersionIndex((prev) => {
      const newIndex = prev + direction;
      return Math.max(0, Math.min(totalVersions - 1, newIndex));
    });
  };

  // Reset version index when selected image changes
  useEffect(() => {
    if (selectedImage) {
      const versions = getAllVersions(selectedImage);
      setCurrentVersionIndex(Math.max(0, versions.length - 1)); // Start at latest version
      setShowModalEditPrompt(false);
      setModalEditPrompt('');
      
      // Load GPT prompt info from metadata if available
      const metadata = selectedImage.metadata || {};
      const promptInfo = metadata.gpt_prompt_info as { system_prompt: string; user_message: string; full_prompt: string } | undefined;
      if (promptInfo) {
        setGptPromptInfo(promptInfo);
        setShowGptPrompt(true); // Expand by default so users can see it
      } else {
        setGptPromptInfo(null);
        setShowGptPrompt(false);
      }
    } else {
      setCurrentVersionIndex(0);
      setShowModalEditPrompt(false);
      setModalEditPrompt('');
      setGptPromptInfo(null);
      setShowGptPrompt(false);
    }
  }, [selectedImage?.id]);

  // Focus modal edit input when prompt box appears
  useEffect(() => {
    if (showModalEditPrompt && modalEditInputRef.current) {
      setTimeout(() => modalEditInputRef.current?.focus(), 100);
    }
  }, [showModalEditPrompt]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!selectedImage) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showModalEditPrompt && !modalEditing) {
        setSelectedImage(null);
        setShowModalEditPrompt(false);
        setModalEditPrompt('');
        setGptPromptInfo(null);
        setShowGptPrompt(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [selectedImage, showModalEditPrompt, modalEditing]);

  const aspectRatios: { value: AspectRatio; label: string }[] = [
    { value: 'auto', label: 'Auto (AI decides)' },
    { value: '1:1', label: 'Square (1:1)' },
    { value: '2:3', label: 'Portrait (2:3)' },
    { value: '3:4', label: 'Portrait (3:4)' },
    { value: '4:5', label: 'Social (4:5)' },
    { value: '9:16', label: 'Mobile (9:16)' },
    { value: '3:2', label: 'Landscape (3:2)' },
    { value: '4:3', label: 'Landscape (4:3)' },
    { value: '5:4', label: 'Classic (5:4)' },
    { value: '16:9', label: 'Widescreen (16:9)' },
    { value: '21:9', label: 'Cinematic (21:9)' },
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
            {/* TEMPLATES COMMENTED OUT */}
            {/* Templates Section - Collapsible when images exist */}
            {/* {images.length > 0 && templates.length > 0 && (
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
            )} */}

            {/* Gallery Grid or Empty State */}
            {images.length === 0 ? (
              // TEMPLATES COMMENTED OUT - removed template empty state
              (
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
                    onClick={() => {
                      setSelectedImage(image);
                      // GPT prompt info will be loaded from metadata in useEffect
                    }}
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
            <div className={`flex gap-3 p-3 ${prompt.trim() ? 'flex-col' : 'items-center'}`}>
              <div className="flex items-start gap-3 flex-1">
                <textarea
                  ref={inputRef}
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
                  className={`flex-1 bg-transparent border-none outline-none text-slate-900 placeholder:text-slate-400 placeholder:text-sm text-base py-2 resize-none overflow-y-auto ${
                    prompt.trim() 
                      ? 'min-h-[3rem] max-h-[6rem]' 
                      : 'h-[2.5rem]'
                  }`}
                  rows={prompt.trim() ? 2 : 1}
                />

                {/* Submit Button - Always visible on right when there's text */}
                {prompt.trim() && (
                  <button
                    onClick={editingImage ? handleEdit : handleGenerate}
                    disabled={(generating || editing) || !prompt.trim()}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-white font-medium transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {(generating || editing) && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                    <span className="hidden sm:inline">
                      {editingImage ? 'Apply' : 'Create'}
                    </span>
                  </button>
                )}
              </div>

              {/* Actions Row - Moves to bottom when typing */}
              {prompt.trim() && (
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
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
                        <div className="absolute bottom-full left-0 mb-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-50 max-h-96 overflow-y-auto">
                          {/* Auto Option */}
                          <div className="px-3 py-2">
                            <button
                              onClick={() => {
                                setSelectedAspectRatio('auto');
                                setShowRatioDropdown(false);
                              }}
                              className="w-full px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center justify-between rounded"
                            >
                              <div className="flex items-center gap-2">
                                <Grid3x3 className="w-4 h-4 text-slate-400" />
                                <span>Auto (AI decides)</span>
                              </div>
                              {selectedAspectRatio === 'auto' && (
                                <Check className="w-4 h-4 text-slate-600" />
                              )}
                            </button>
                          </div>
                          <div className="border-t border-slate-100 my-1" />
                          
                          {/* Portrait/Square Ratios */}
                          <div className="px-3 py-2">
                            {[
                              { value: '1:1', label: 'Square (1:1)' },
                              { value: '2:3', label: 'Portrait (2:3)' },
                              { value: '3:4', label: 'Portrait (3:4)' },
                              { value: '4:5', label: 'Social (4:5)' },
                              { value: '9:16', label: 'Mobile (9:16)' },
                            ].map((ratio) => (
                              <button
                                key={ratio.value}
                                onClick={() => {
                                  setSelectedAspectRatio(ratio.value as AspectRatio);
                                  setShowRatioDropdown(false);
                                }}
                                className="w-full px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center justify-between rounded"
                              >
                                <span>{ratio.label}</span>
                                {selectedAspectRatio === ratio.value && (
                                  <Check className="w-4 h-4 text-slate-600" />
                                )}
                              </button>
                            ))}
                          </div>
                          
                          <div className="border-t border-slate-100 my-1" />
                          
                          {/* Landscape Ratios */}
                          <div className="px-3 py-2">
                            {[
                              { value: '3:2', label: 'Landscape (3:2)' },
                              { value: '4:3', label: 'Landscape (4:3)' },
                              { value: '5:4', label: 'Classic (5:4)' },
                              { value: '16:9', label: 'Widescreen (16:9)' },
                              { value: '21:9', label: 'Cinematic (21:9)' },
                            ].map((ratio) => (
                              <button
                                key={ratio.value}
                                onClick={() => {
                                  setSelectedAspectRatio(ratio.value as AspectRatio);
                                  setShowRatioDropdown(false);
                                }}
                                className="w-full px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center justify-between rounded"
                              >
                                <span>{ratio.label}</span>
                                {selectedAspectRatio === ratio.value && (
                                  <Check className="w-4 h-4 text-slate-600" />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Media Button with Popover - Available for both new and edit modes */}
                  <div className="relative" ref={mediaPopoverRef}>
                      <button
                        onClick={() => setShowMediaPopover(!showMediaPopover)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-100 relative"
                        title="Attach files"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Attach</span>
                        <ChevronDown className={`w-3 h-3 transition-transform ${showMediaPopover ? 'rotate-180' : ''}`} />
                        {(selectedAssets.length > 0 || selectedReferences.length > 0 || selectedStyles.length > 0) && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-medium"
                            style={{ 
                              backgroundColor: primaryColor,
                              color: 'white',
                            }}
                          >
                            {selectedAssets.length + selectedReferences.length + selectedStyles.length}
                          </span>
                        )}
                      </button>

                      {/* Media Popover */}
                      {showMediaPopover && (
                        <div className="absolute bottom-full left-0 mb-2 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50">
                          <button
                            onClick={() => {
                              setShowMediaLibrary(true);
                              setShowMediaPopover(false);
                            }}
                            className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-slate-50 transition-colors text-left group"
                          >
                            <div 
                              className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                              style={{ backgroundColor: `${primaryColor}10` }}
                            >
                              <FolderOpen className="w-3.5 h-3.5" style={{ color: primaryColor }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900">Select Assets</p>
                              <p className="text-xs text-slate-500">Use logos, icons, etc.</p>
                            </div>
                          </button>
                          
                          <div className="h-px bg-slate-100 mx-2" />
                          
                          <button
                            onClick={() => {
                              setShowReferenceUpload(true);
                              setShowMediaPopover(false);
                            }}
                            className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-slate-50 transition-colors text-left group"
                          >
                            <div 
                              className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                              style={{ backgroundColor: `${primaryColor}10` }}
                            >
                              <Palette className="w-3.5 h-3.5" style={{ color: primaryColor }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900">Add Reference</p>
                              <p className="text-xs text-slate-500">Inspo / style images</p>
                            </div>
                          </button>
                        </div>
                      )}
                    </div>

                  {/* Styles Button - Next to Attach */}
                  <button
                    onClick={() => setShowStylesPicker(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-100 relative"
                    title="Choose a style"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Styles</span>
                    {selectedStyles.length > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-medium"
                        style={{ 
                          backgroundColor: primaryColor,
                          color: 'white',
                        }}
                      >
                        {selectedStyles.length}
                      </span>
                    )}
                  </button>

                  {/* Enhance Prompt Button (placeholder) - Commented out */}
                  {false && !editingImage && (
                    <button
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-100"
                      onClick={() => {}}
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Enhance</span>
                    </button>
                  )}

                  {/* Spacer to push submit button to right if needed, or keep it here */}
                  <div className="flex-1" />
                </div>
              )}

              {/* Actions - Show on right side when no text (original behavior) */}
              {/* Removed: Auto, Media, and Enhance buttons now only show when user types something */}
            </div>
          </div>
        </div>
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 md:p-8"
          onClick={(e) => {
            // Don't close if clicking on the modal content, edit prompt, or while editing
            const target = e.target as HTMLElement;
            // Check if click is on backdrop or outer container (not on modal content)
            const isBackdrop = target === e.currentTarget || 
                              target.getAttribute('data-backdrop') === 'true';
            if (isBackdrop && !showModalEditPrompt && !modalEditing) {
              setSelectedImage(null);
              setShowModalEditPrompt(false);
              setModalEditPrompt('');
              setGptPromptInfo(null);
              setShowGptPrompt(false);
            }
          }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" data-backdrop="true" />
          
          {/* Modal Content */}
          <div 
            className="relative bg-white rounded-3xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col md:flex-row"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => {
                if (!modalEditing) {
                  setSelectedImage(null);
                  setShowModalEditPrompt(false);
                  setModalEditPrompt('');
                  setGptPromptInfo(null);
                  setShowGptPrompt(false);
                }
              }}
              disabled={modalEditing}
              className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-white transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Image Panel */}
            <div className="flex-1 bg-slate-100 flex items-center justify-center p-6 md:p-8 relative">
              {(() => {
                const versions = getAllVersions(selectedImage);
                const currentVersion = versions[currentVersionIndex] || versions[versions.length - 1] || null;

                return (
                  <>
                    {currentVersion?.image_url ? (
                      <div className="relative">
                        <img
                          src={currentVersion.image_url}
                          alt={`Generated version ${currentVersionIndex + 1}`}
                          className="max-w-full max-h-[60vh] md:max-h-[70vh] rounded-2xl shadow-lg object-contain"
                        />
                        {(modalEditing || selectedImage.status === 'generating') && (
                          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm rounded-2xl flex items-center justify-center z-10">
                            <div className="text-center text-white">
                              <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" />
                              <p className="font-medium">
                                {selectedImage.status === 'generating' ? 'Creating your image...' : 'Applying your edits...'}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
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
                  </>
                );
              })()}
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

              {/* Version Navigation */}
              {(() => {
                const versions = getAllVersions(selectedImage);
                const canNavigateLeft = currentVersionIndex > 0;
                const canNavigateRight = currentVersionIndex < versions.length - 1;
                const currentVersion = versions[currentVersionIndex] || versions[versions.length - 1] || null;

                return versions.length > 1 ? (
                  <div className="p-4 border-b border-slate-200 bg-slate-50/50">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-slate-600 uppercase tracking-wider">Version History</span>
                      <span className="text-sm font-medium text-slate-700">
                        {currentVersionIndex + 1} / {versions.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigateVersion(-1, versions.length)}
                        disabled={!canNavigateLeft}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${
                          canNavigateLeft
                            ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 cursor-pointer'
                            : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span className="text-sm font-medium">Previous</span>
                      </button>
                      <button
                        onClick={() => navigateVersion(1, versions.length)}
                        disabled={!canNavigateRight}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${
                          canNavigateRight
                            ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 cursor-pointer'
                            : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        <span className="text-sm font-medium">Next</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                    {currentVersion?.edit_prompt && (
                      <p className="mt-2 text-xs text-slate-500 italic">
                        "{currentVersion.edit_prompt}"
                      </p>
                    )}
                  </div>
                ) : null;
              })()}

              {/* GPT Prompt Info (for reference) - Only show on localhost */}
              {gptPromptInfo && (import.meta.env.DEV || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
                <div className="p-4 border-t border-slate-200 bg-slate-50/50">
                  <button
                    onClick={() => setShowGptPrompt(!showGptPrompt)}
                    className="w-full flex items-center justify-between text-left hover:opacity-80 transition-opacity"
                  >
                    <div className="flex items-center gap-2">
                      <Wand2 className="w-4 h-4 text-slate-600" />
                      <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Generated Prompt
                      </span>
                    </div>
                    {showGptPrompt ? (
                      <ChevronUp className="w-4 h-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    )}
                  </button>
                  {showGptPrompt && (
                    <div className="mt-3 space-y-3">
                      <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                        <div className="text-xs font-semibold text-slate-800 mb-2">System Prompt:</div>
                        <pre className="text-xs text-slate-700 whitespace-pre-wrap break-words font-mono overflow-auto max-h-48 bg-slate-50 p-2 rounded border border-slate-100">
                          {gptPromptInfo.system_prompt}
                        </pre>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                        <div className="text-xs font-semibold text-slate-800 mb-2">User Message:</div>
                        <pre className="text-xs text-slate-700 whitespace-pre-wrap break-words font-mono overflow-auto max-h-48 bg-slate-50 p-2 rounded border border-slate-100">
                          {gptPromptInfo.user_message}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="p-4 border-t border-slate-100 flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowModalEditPrompt(true);
                  }}
                  disabled={modalEditing || selectedImage.edit_count >= selectedImage.max_edits}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white font-medium transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
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

          {/* Floating Edit Prompt Box */}
          {showModalEditPrompt && (
            <div 
              className="relative w-full max-w-2xl mt-4 z-[60]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white/95 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-2xl p-4">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${primaryColor}15` }}
                  >
                    <Edit3 className="w-5 h-5" style={{ color: primaryColor }} />
                  </div>
                  
                  <input
                    ref={modalEditInputRef}
                    type="text"
                    value={modalEditPrompt}
                    onChange={(e) => setModalEditPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        e.stopPropagation(); // Prevent event bubbling
                        console.log('Enter pressed in modal edit input');
                        if (modalEditPrompt.trim() && !modalEditing) {
                          handleModalEdit();
                        }
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowModalEditPrompt(false);
                        setModalEditPrompt('');
                      }
                    }}
                    onKeyPress={(e) => {
                      // Additional prevention
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    placeholder="What would you like to change?"
                    className="flex-1 bg-transparent border-none outline-none text-slate-900 placeholder:text-slate-400 placeholder:text-sm text-base py-2"
                    disabled={modalEditing}
                  />

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Attach Button for Modal Edit */}
                    <div className="relative" ref={mediaPopoverRef}>
                      <button
                        onClick={() => setShowMediaPopover(!showMediaPopover)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-100 relative"
                        title="Attach files"
                        disabled={modalEditing}
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Attach</span>
                        <ChevronDown className={`w-3 h-3 transition-transform ${showMediaPopover ? 'rotate-180' : ''}`} />
                        {(selectedAssets.length > 0 || selectedReferences.length > 0 || selectedStyles.length > 0) && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-medium"
                            style={{ 
                              backgroundColor: primaryColor,
                              color: 'white',
                            }}
                          >
                            {selectedAssets.length + selectedReferences.length + selectedStyles.length}
                          </span>
                        )}
                      </button>

                      {/* Media Popover */}
                      {showMediaPopover && (
                        <div className="absolute bottom-full left-0 mb-2 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50">
                          <button
                            onClick={() => {
                              setShowMediaLibrary(true);
                              setShowMediaPopover(false);
                            }}
                            className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-slate-50 transition-colors text-left group"
                          >
                            <div 
                              className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                              style={{ backgroundColor: `${primaryColor}10` }}
                            >
                              <FolderOpen className="w-3.5 h-3.5" style={{ color: primaryColor }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900">Select Assets</p>
                              <p className="text-xs text-slate-500">Use logos, icons, etc.</p>
                            </div>
                          </button>
                          
                          <div className="h-px bg-slate-100 mx-2" />
                          
                          <button
                            onClick={() => {
                              setShowReferenceUpload(true);
                              setShowMediaPopover(false);
                            }}
                            className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-slate-50 transition-colors text-left group"
                          >
                            <div 
                              className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                              style={{ backgroundColor: `${primaryColor}10` }}
                            >
                              <Palette className="w-3.5 h-3.5" style={{ color: primaryColor }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900">Add Reference</p>
                              <p className="text-xs text-slate-500">Inspo / style images</p>
                            </div>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Styles Button - Next to Attach (Modal Edit) */}
                    <button
                      onClick={() => setShowStylesPicker(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-100 relative"
                      title="Choose a style"
                      disabled={modalEditing}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Styles</span>
                      {selectedStyles.length > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-medium"
                          style={{ 
                            backgroundColor: primaryColor,
                            color: 'white',
                          }}
                        >
                          {selectedStyles.length}
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => {
                        setShowModalEditPrompt(false);
                        setModalEditPrompt('');
                      }}
                      className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors"
                      disabled={modalEditing}
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleModalEdit}
                      disabled={modalEditing || !modalEditPrompt.trim() || selectedImage.edit_count >= selectedImage.max_edits}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-white font-medium transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: primaryColor }}
                    >
                      {modalEditing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      <span className="hidden sm:inline">Apply</span>
                    </button>
                  </div>
                </div>
                {selectedImage.edit_count >= selectedImage.max_edits && (
                  <p className="mt-2 text-xs text-amber-600 text-center">
                    You've reached the maximum of {selectedImage.max_edits} edits for this image.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TEMPLATES COMMENTED OUT */}
      {/* Template Field Modal */}
      {/* {selectedTemplate && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setSelectedTemplate(null);
            setTemplateFields({});
          }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          
          <div 
            className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setSelectedTemplate(null);
                setTemplateFields({});
              }}
              className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

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
      )} */}

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

      {/* Assets Library Picker */}
      <AssetPicker
        brandId={brand.id}
        isOpen={showMediaLibrary}
        onClose={() => setShowMediaLibrary(false)}
        onSelect={(selected) => {
          // Enforce limit: max 6 assets, and total images (including auto-included) <= 14
          const maxAllowed = Math.min(MAX_HIGH_FIDELITY, MAX_TOTAL_IMAGES - autoIncludedImages - currentReferences);
          const filtered = selected.filter(a => a.type === 'asset').slice(0, maxAllowed);
          setSelectedAssets(filtered);
        }}
        selectedAssets={selectedAssets}
        filterType="asset"
        title="Select Assets"
        primaryColor={primaryColor}
        maxSelection={Math.min(MAX_HIGH_FIDELITY, MAX_TOTAL_IMAGES - autoIncludedImages - currentReferences)}
      />

      {/* Reference Upload */}
      <ReferenceUpload
        brandId={brand.id}
        isOpen={showReferenceUpload}
        onClose={() => setShowReferenceUpload(false)}
        onSelect={(selected) => {
          // Enforce limit: total images (including auto-included, assets, and styles) <= 14
          const maxAllowed = MAX_TOTAL_IMAGES - autoIncludedImages - currentAssets - selectedStyles.length;
          const filtered = selected.slice(0, maxAllowed);
          setSelectedReferences(filtered);
        }}
        selectedReferences={selectedReferences}
        primaryColor={primaryColor}
        maxSelection={MAX_TOTAL_IMAGES - autoIncludedImages - currentAssets - selectedStyles.length}
      />

      {/* Styles Picker */}
      <StylesPicker
        isOpen={showStylesPicker}
        onClose={() => setShowStylesPicker(false)}
        onSelect={(selected) => {
          // Maximum 2 styles allowed
          const filtered = selected.slice(0, 2);
          setSelectedStyles(filtered);
        }}
        selectedStyles={selectedStyles}
        primaryColor={primaryColor}
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

