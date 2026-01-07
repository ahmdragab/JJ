import { useState, useEffect, useRef, useCallback } from 'react';
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
  FlaskConical,
  Columns,
  Zap,
  Megaphone,
  BarChart3,
  Monitor,
  Mail,
  Camera,
  Share2,
  Play,
  Package
} from 'lucide-react';
import { supabase, Brand, GeneratedImage, ConversationMessage, BrandAsset, Style, getAuthHeaders } from '../lib/supabase';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AssetPicker } from '../components/AssetPicker';
import { ReferenceUpload } from '../components/ReferenceUpload';
import { StylesPicker } from '../components/StylesPicker';
import { generateSmartPresets, SmartPreset } from '../lib/smartPresets';
import { logger } from '../lib/logger';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';

type AspectRatio = '1:1' | '2:3' | '3:4' | '4:5' | '9:16' | '3:2' | '4:3' | '5:4' | '16:9' | '21:9' | 'auto';

type EditingImage = {
  id: string;
  image_url: string;
  prompt: string;
} | null;

// Platform groups with sizes - static constant (no need for useMemo)
const PLATFORM_GROUPS = [
  {
    name: 'Facebook',
    favicon: 'https://www.facebook.com/favicon.ico',
    sizes: [
      { label: 'Square', ratio: '1:1' as AspectRatio },
      { label: 'Portrait', ratio: '4:5' as AspectRatio },
      { label: 'Story', ratio: '9:16' as AspectRatio },
    ],
  },
  {
    name: 'Instagram',
    favicon: 'https://www.instagram.com/favicon.ico',
    sizes: [
      { label: 'Square', ratio: '1:1' as AspectRatio },
      { label: 'Portrait', ratio: '4:5' as AspectRatio },
      { label: 'Story', ratio: '9:16' as AspectRatio },
      { label: 'Reels', ratio: '9:16' as AspectRatio },
    ],
  },
  {
    name: 'LinkedIn',
    favicon: 'https://www.linkedin.com/favicon.ico',
    sizes: [
      { label: 'Square', ratio: '1:1' as AspectRatio },
      { label: 'Portrait', ratio: '4:5' as AspectRatio },
    ],
  },
  {
    name: 'TikTok',
    favicon: 'https://www.tiktok.com/favicon.ico',
    sizes: [
      { label: 'Vertical', ratio: '9:16' as AspectRatio },
    ],
  },
  {
    name: 'Snapchat',
    favicon: 'https://www.snapchat.com/favicon.ico',
    sizes: [
      { label: 'Full Screen', ratio: '9:16' as AspectRatio },
    ],
  },
  {
    name: 'Twitter/X',
    favicon: 'https://abs.twimg.com/favicons/twitter.3.ico',
    sizes: [
      { label: 'Square', ratio: '1:1' as AspectRatio },
      { label: 'Landscape', ratio: '16:9' as AspectRatio },
    ],
  },
];

export function Studio({ brand }: { brand: Brand }) {
  const { user } = useAuth();
  const toast = useToast();
  const [images, setImages] = useState<GeneratedImage[]>([]);
  
  // Set logger context
  useEffect(() => {
    if (user && brand) {
      logger.setContext({ user_id: user.id, brand_id: brand.id });
    }
  }, [user, brand]);
  // TEMPLATES COMMENTED OUT
  // const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  
  // Create/Edit state
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio>('auto');
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [showRatioDropdown, setShowRatioDropdown] = useState(false);
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set());
  const [editingImage, setEditingImage] = useState<EditingImage>(null);

  const togglePlatformExpand = useCallback((platformName: string) => {
    setExpandedPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(platformName)) {
        next.delete(platformName);
      } else {
        next.add(platformName);
      }
      return next;
    });
  }, []);
  
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
  const [, setShowMediaPopover] = useState(false);
  const [showReferenceUpload, setShowReferenceUpload] = useState(false);
  const [showStylesPicker, setShowStylesPicker] = useState(false);

  // Available styles for thumbnail selection
  const [availableStyles, setAvailableStyles] = useState<Style[]>([]);
  const [, setLoadingStyles] = useState(false);
  
  // Smart presets state
  const [smartPresets, setSmartPresets] = useState<SmartPreset[]>([]);
  const [loadingPresets, setLoadingPresets] = useState(false);
  const [showPresetsModal, setShowPresetsModal] = useState(false);
  
  // Prompt version toggle (v1 = current, v2 = experimental, v3 = lean/direct)
  const [promptVersion, setPromptVersion] = useState<'v1' | 'v2' | 'v3'>('v1');
  const [compareMode, setCompareMode] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [savingComparison, setSavingComparison] = useState<string | null>(null);
  const [comparisonResults, setComparisonResults] = useState<{
    v1: { image_base64: string; design_type?: string; gpt_prompt_info?: GPTPromptInfo } | null;
    v2: { image_base64: string; design_type?: string; gpt_prompt_info?: GPTPromptInfo } | null;
    v3: { image_base64: string; prompt_used?: string } | null;
  } | null>(null);
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  
  // GPT Prompt Info type for comparison
  type GPTPromptInfo = { system_prompt: string; user_message: string; full_prompt: string; design_type?: string };
  
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const ratioDropdownRef = useRef<HTMLDivElement>(null);
  const modalEditInputRef = useRef<HTMLInputElement>(null);
  const mediaPopoverRef = useRef<HTMLDivElement>(null);


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

  // Persist prompt to localStorage
  const STORAGE_KEY = `studio-prompt-${brand.id}`;

  useEffect(() => {
    loadData();
    // Load saved prompt from localStorage
    const savedPrompt = localStorage.getItem(STORAGE_KEY);
    if (savedPrompt) {
      setPrompt(savedPrompt);
    }
    
    // Load smart presets
    if (brand) {
      setLoadingPresets(true);
      generateSmartPresets(brand)
        .then(presets => {
          // Only update if we got presets (don't clear existing ones on error)
          if (presets && presets.length > 0) {
            setSmartPresets(presets);
          }
          setLoadingPresets(false);
        })
        .catch(error => {
          logger.error('Failed to load presets', error instanceof Error ? error : new Error(String(error)));
          // Don't clear existing presets on error - keep what we have
          setLoadingPresets(false);
        });
    }
    
    // Load available styles for thumbnail selection
    const loadStyles = async () => {
      setLoadingStyles(true);
      const { data, error } = await supabase
        .from('styles')
        .select('*')
        .eq('is_active', true)
        .order('category')
        .order('display_order', { ascending: true });
      
      if (!error && data) {
        setAvailableStyles(data as Style[]);
      }
      setLoadingStyles(false);
    };
    
    loadStyles();
  }, [brand.id]);

  // Save prompt to localStorage whenever it changes
  useEffect(() => {
    if (prompt.trim()) {
      localStorage.setItem(STORAGE_KEY, prompt);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [prompt, STORAGE_KEY]);

  // Auto-focus input when there are no images
  useEffect(() => {
    if (images.length === 0 && !editingImage) {
      setInputFocused(true);
    }
  }, [images.length, editingImage]);

  useEffect(() => {
    // Poll for generating images
    const generatingImages = images.filter(img => img.status === 'generating');
    if (generatingImages.length > 0) {
      const interval = setInterval(loadImages, 2000);
      return () => clearInterval(interval);
    }
  }, [images]);

  // Sync selectedImage with updated images array
  useEffect(() => {
    if (selectedImage) {
      const updatedImage = images.find(img => img.id === selectedImage.id);
      if (updatedImage && updatedImage !== selectedImage) {
        setSelectedImage(updatedImage);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ratioDropdownRef.current && !ratioDropdownRef.current.contains(event.target as Node)) {
        setShowRatioDropdown(false);
      }
      if (inputContainerRef.current && !inputContainerRef.current.contains(event.target as Node)) {
        if (!prompt.trim() && !editingImage && images.length > 0) {
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
      logger.error('Failed to load images', error instanceof Error ? error : new Error(String(error)));
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

  const handleDeleteClick = useCallback((imageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete({ isOpen: true, imageId });
  }, []);

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
      logger.error('Failed to delete image', error instanceof Error ? error : new Error(String(error)), {
        image_id: imageId,
      });
    } finally {
      setDeleting(null);
      setConfirmDelete({ isOpen: false, imageId: null });
    }
  };

  // Helper function to get icon and tag for preset category
  const getPresetIconAndTag = (category: string, label: string) => {
    const categoryLower = category.toLowerCase();
    const labelLower = label.toLowerCase();
    
    // Determine tag
    let tag = category;
    if (categoryLower.includes('ad') || categoryLower.includes('advertising') || labelLower.includes('ad')) {
      tag = 'Ad';
    } else if (categoryLower.includes('social') || labelLower.includes('social') || labelLower.includes('post')) {
      tag = 'Social Post';
    } else if (categoryLower.includes('infographic') || labelLower.includes('infographic')) {
      tag = 'Infographic';
    } else if (categoryLower.includes('email') || labelLower.includes('email')) {
      tag = 'Email';
    } else if (categoryLower.includes('video') || labelLower.includes('youtube') || labelLower.includes('thumbnail')) {
      tag = 'Video';
    } else if (categoryLower.includes('product') || labelLower.includes('product')) {
      tag = 'Product';
    } else if (categoryLower.includes('professional') || categoryLower.includes('linkedin')) {
      tag = 'Professional';
    } else if (categoryLower.includes('marketing')) {
      tag = 'Marketing';
    }
    
    // Determine icon component
    let IconComponent: React.ComponentType<{ className?: string; style?: React.CSSProperties }> = ImageIcon;
    if (categoryLower.includes('ad') || categoryLower.includes('advertising') || labelLower.includes('ad')) {
      IconComponent = Megaphone;
    } else if (categoryLower.includes('infographic') || labelLower.includes('infographic') || categoryLower.includes('chart')) {
      IconComponent = BarChart3;
    } else if (categoryLower.includes('social') || labelLower.includes('social') || labelLower.includes('post') || labelLower.includes('instagram') || labelLower.includes('facebook') || labelLower.includes('twitter')) {
      IconComponent = Share2;
    } else if (categoryLower.includes('email') || labelLower.includes('email')) {
      IconComponent = Mail;
    } else if (categoryLower.includes('video') || labelLower.includes('youtube') || labelLower.includes('thumbnail')) {
      IconComponent = Play;
    } else if (categoryLower.includes('product') || labelLower.includes('product')) {
      IconComponent = Package;
    } else if (categoryLower.includes('story') || labelLower.includes('story')) {
      IconComponent = Camera;
    } else {
      IconComponent = Monitor;
    }
    
    return { tag, IconComponent };
  };

  const handlePresetClick = async (preset: SmartPreset) => {
    if (generating) return; // Don't allow multiple generations at once
    
    // Set the prompt and aspect ratio
    setPrompt(preset.prompt);
    setSelectedAspectRatio(preset.aspectRatio);
    setSelectedPlatform(null); // Clear platform when preset is selected
    
    // Immediately start generating with V1
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
          template_id: null,
          prompt: preset.prompt,
          status: 'generating',
          metadata: {
            aspect_ratio: preset.aspectRatio === 'auto' ? undefined : preset.aspectRatio,
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
      setSelectedAssets([]);
      setSelectedReferences([]);
      setSelectedStyles([]);
      setSelectedPlatform(null);

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

      // Always use V1 for presets
      const authHeaders = await getAuthHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            prompt: preset.prompt,
            brandId: brand.id,
            imageId: imageRecord.id,
            aspectRatio: preset.aspectRatio === 'auto' ? undefined : preset.aspectRatio,
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
        const errorData = await response.json();
        // Handle credit errors specifically
        if (response.status === 402) {
          toast.error('Insufficient Credits', `You have ${errorData.credits || 0} credits remaining. Please purchase more credits to generate images.`);
          // Remove the image record that was created
          await supabase.from('images').delete().eq('id', imageRecord.id);
          setImages(prev => prev.filter(img => img.id !== imageRecord.id));
        } else {
          throw new Error(errorData.error || 'Failed to generate image');
        }
        return;
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
      const errorObj = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to generate image from preset', errorObj, {
        brand_id: brand.id,
        preset_id: preset.id,
        prompt_preview: preset.prompt.substring(0, 100),
      });
      toast.error('Generation Failed', errorObj.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;

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
      setSelectedPlatform(null);

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

      // Use selected prompt version (v1 or v2)
      const endpoint = promptVersion === 'v3' ? 'generate-image-v3' : promptVersion === 'v2' ? 'generate-image-v2' : 'generate-image';

      const authHeaders = await getAuthHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${endpoint}`,
        {
          method: 'POST',
          headers: authHeaders,
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
        const errorData = await response.json();
        // Handle credit errors specifically
        if (response.status === 402) {
          toast.error('Insufficient Credits', `You have ${errorData.credits || 0} credits remaining. Please purchase more credits to generate images.`);
          // Remove the image record that was created
          await supabase.from('images').delete().eq('id', imageRecord.id);
          setImages(prev => prev.filter(img => img.id !== imageRecord.id));
        } else {
          throw new Error(errorData.error || 'Failed to generate image');
        }
        return;
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
      const errorObj = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to generate image', errorObj, {
        brand_id: brand.id,
        prompt_preview: prompt.substring(0, 100),
      });
      toast.error('Generation Failed', errorObj.message);
    } finally {
      setGenerating(false);
    }
  };

  // Comparison mode: generate with both v1 and v2 to compare outputs
  const handleCompare = async () => {
    if (!prompt.trim() || comparing) return;

    setComparing(true);
    setComparisonResults(null);
    
    try {
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

      const requestBody = {
        prompt,
        brandId: brand.id,
        aspectRatio: selectedAspectRatio === 'auto' ? undefined : selectedAspectRatio,
        assets: selectedAssets.map(a => ({
          id: a.id,
          url: a.url,
          name: a.name,
          category: a.category,
          role: 'must_include',
        })),
        references: allReferences,
        // Note: No imageId means no DB save, just generate and return
      };

      // Generate with all 3 versions in parallel
      // V1 will deduct credit, V2 and V3 skip credits
      const authHeaders = await getAuthHeaders();
      const [v1Response, v2Response, v3Response] = await Promise.all([
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(requestBody), // V1 deducts 1 credit
        }),
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image-v2`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ ...requestBody, skipCredits: true }), // V2 skips credit
        }),
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image-v3`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ ...requestBody, skipCredits: true }), // V3 skips credit
        }),
      ]);

      const [v1Data, v2Data, v3Data] = await Promise.all([
        v1Response.json(),
        v2Response.json(),
        v3Response.json(),
      ]);

      setComparisonResults({
        v1: v1Response.ok ? {
          image_base64: v1Data.image_base64,
          gpt_prompt_info: v1Data.gpt_prompt_info,
        } : null,
        v2: v2Response.ok ? {
          image_base64: v2Data.image_base64,
          design_type: v2Data.design_type,
          gpt_prompt_info: v2Data.gpt_prompt_info,
        } : null,
        v3: v3Response.ok ? {
          image_base64: v3Data.image_base64,
          prompt_used: v3Data.prompt_used,
        } : null,
      });
      setShowComparisonModal(true);

    } catch (error) {
      console.error('Comparison failed:', error);
      toast.error('Comparison Failed', error instanceof Error ? error.message : 'Failed to compare versions');
    } finally {
      setComparing(false);
    }
  };

  // Save a comparison result image to the database and storage
  const handleSaveComparisonImage = async (version: 'v1' | 'v2' | 'v3') => {
    if (!comparisonResults || savingComparison) return;
    
    const result = comparisonResults[version];
    if (!result || !result.image_base64) {
      toast.warning('No Image', `No image available for ${version.toUpperCase()}`);
      return;
    }

    setSavingComparison(version);

    try {
      if (!user?.id) {
        throw new Error('Not authenticated');
      }

      // Create image record in database
      const { data: imageRecord, error: insertError } = await supabase
        .from('images')
        .insert({
          user_id: user.id,
          brand_id: brand.id,
          template_id: null,
          prompt,
          status: 'generating',
          metadata: {
            aspect_ratio: selectedAspectRatio === 'auto' ? undefined : selectedAspectRatio,
            prompt_version: version,
            ...('gpt_prompt_info' in result && result.gpt_prompt_info && { gpt_prompt_info: result.gpt_prompt_info }),
            ...('design_type' in result && result.design_type && { design_type: result.design_type }),
            ...('prompt_used' in result && result.prompt_used && { prompt_used: result.prompt_used }),
          },
          conversation: [],
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Upload base64 image to storage
      const binaryString = atob(result.image_base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const fileName = `${brand.id}/${imageRecord.id}-${Date.now()}.png`;
      
      const { error: uploadError } = await supabase.storage
        .from('brand-images')
        .upload(fileName, bytes, {
          contentType: 'image/png',
          upsert: true,
        });

      if (uploadError) {
        // Clean up the image record if upload fails
        await supabase.from('images').delete().eq('id', imageRecord.id);
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('brand-images')
        .getPublicUrl(fileName);

      // Update image record with URL and status
      const { error: updateError } = await supabase
        .from('images')
        .update({
          image_url: urlData.publicUrl,
          status: 'ready',
          updated_at: new Date().toISOString(),
        })
        .eq('id', imageRecord.id);

      if (updateError) throw updateError;

      // Reload images to show the new one
      await loadImages();

      // Close modal and reset comparison mode
      setShowComparisonModal(false);
      setCompareMode(false);
      setPrompt('');
      localStorage.removeItem(STORAGE_KEY);
      setSelectedAssets([]);
      setSelectedReferences([]);
      setSelectedStyles([]);
      setSelectedPlatform(null);

    } catch (error) {
      console.error('Failed to save comparison image:', error);
      toast.error('Save Failed', error instanceof Error ? error.message : 'Failed to save image');
    } finally {
      setSavingComparison(null);
    }
  };

  const handleEdit = async () => {
    if (!prompt.trim() || !editingImage || editing) return;
    
    // Find the full image record
    const fullImage = images.find(img => img.id === editingImage.id);
    if (!fullImage) return;

    if (fullImage.edit_count >= fullImage.max_edits) {
      toast.warning('Edit Limit Reached', `You've reached the maximum of ${fullImage.max_edits} edits for this image.`);
      return;
    }

    setEditing(true);
    const userMessage: ConversationMessage = {
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString(),
    };

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
      setSelectedPlatform(null);
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
      toast.warning('Edit Limit Reached', `You've reached the maximum of ${selectedImage.max_edits} edits for this image.`);
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
      const authHeaders = await getAuthHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/edit-image`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            prompt: editPromptText,
            brandId: brand.id,
            imageId: imageId,
            previousImageUrl: selectedImage.image_url,
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
      setSelectedPlatform(null);
    } finally {
      setModalEditing(false);
    }
  };

  const handleDownload = useCallback(async (image: GeneratedImage, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!image.image_url) return;

    try {
      // Extract the file path from the Supabase Storage URL
      // Supabase Storage URLs are like: https://[project].supabase.co/storage/v1/object/public/brand-images/[path]
      const urlParts = image.image_url.split('/brand-images/');
      if (urlParts.length === 2) {
        const filePath = urlParts[1];

        // Download directly from storage with no transformations
        // Use the download method to get the original file
        const { data, error } = await supabase.storage
          .from('brand-images')
          .download(filePath);

        if (error) {
          console.error('Storage download error:', error);
          // Fallback to fetching from URL
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
          return;
        }

        // Create download link with the original file
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${brand.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Fallback for non-Supabase URLs
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
      }
    } catch (error) {
      console.error('Download failed:', error);
    }
  }, [brand.name]);

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-50 via-neutral-50 to-zinc-50">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-600" />
      </div>
    );
  }

  return (
    <div className={`${images.length === 0 ? 'h-[calc(100vh-4rem)] overflow-hidden' : 'min-h-screen'} bg-neutral-50 relative`}>
      {/* Subtle background texture */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-brand-primary mix-blend-multiply filter blur-3xl opacity-[0.08] animate-blob" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-brand-primary mix-blend-multiply filter blur-3xl opacity-[0.08] animate-blob animation-delay-2000" />
      </div>

      {/* Main Content */}
      <div className={`relative z-10 ${images.length === 0 ? 'pt-4 sm:pt-6 pb-2' : 'pt-8 sm:pt-10 md:pt-12 pb-32 sm:pb-40'}`}>
        <div className={`${images.length === 0 ? 'p-4 sm:p-6 md:p-6' : 'p-4 sm:p-6 md:p-8'}`}>
          <div className="max-w-7xl mx-auto">
            {/* TEMPLATES COMMENTED OUT */}
            {/* Templates Section - Collapsible when images exist */}
            {/* {images.length > 0 && templates.length > 0 && (
              <div className="mb-8">
                <button
                  onClick={() => setShowTemplatesSection(!showTemplatesSection)}
                  className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors"
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
                        className="group relative bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-neutral-200/50 hover:bg-white hover:shadow-lg hover:border-neutral-300 transition-all text-left"
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
                        <h4 className="text-sm font-medium text-neutral-900 mb-1">
                          {template.name}
                        </h4>
                        {template.description && (
                          <p className="text-xs text-neutral-500 line-clamp-2">
                            {template.description}
                          </p>
                        )}
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-neutral-400">
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
              <div className="space-y-6 overflow-visible">
                {/* Input Bar - Moved here when no images */}
                <div 
                  ref={inputContainerRef}
                  className="max-w-3xl mx-auto overflow-visible"
                >
                  {/* Prompt Version Toggle */}
                  {!editingImage && (
                    <div className="mb-2 flex items-center justify-center gap-3">
                      <div className="flex items-center gap-1 bg-white/80 backdrop-blur-sm rounded-lg border border-neutral-200 p-0.5">
                        <button
                          onClick={() => setPromptVersion('v1')}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                            promptVersion === 'v1'
                              ? 'bg-neutral-900 text-white shadow-sm'
                              : 'text-neutral-500 hover:text-neutral-700'
                          }`}
                        >
                          V1
                        </button>
                        <button
                          onClick={() => setPromptVersion('v2')}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                            promptVersion === 'v2'
                              ? 'bg-emerald-500 text-white shadow-sm'
                              : 'text-neutral-500 hover:text-neutral-700'
                          }`}
                        >
                          <FlaskConical className="w-3 h-3" />
                          V2
                        </button>
                        <button
                          onClick={() => setPromptVersion('v3')}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                            promptVersion === 'v3'
                              ? 'bg-amber-500 text-white shadow-sm'
                              : 'text-neutral-500 hover:text-neutral-700'
                          }`}
                        >
                          <Zap className="w-3 h-3" />
                          V3
                        </button>
                      </div>
                      
                      {promptVersion === 'v2' && (
                        <span className="text-xs text-emerald-600">
                          Design-type aware
                        </span>
                      )}
                      {promptVersion === 'v3' && (
                        <span className="text-xs text-amber-600">
                          Lean & direct
                        </span>
                      )}
                      
                      {/* Compare Mode Toggle */}
                      <button
                        onClick={() => setCompareMode(!compareMode)}
                        className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-all ${
                          compareMode 
                            ? 'bg-amber-100 text-amber-700 border border-amber-300' 
                            : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'
                        }`}
                      >
                        <Columns className="w-3 h-3" />
                        <span className="hidden sm:inline">Compare</span>
                      </button>
                    </div>
                  )}

                  {/* Main Input */}
                  <div 
                    className={`bg-white rounded-xl sm:rounded-2xl border transition-all duration-300 overflow-visible ${
                      inputFocused
                        ? 'border-brand-primary/40'
                        : 'border-neutral-200'
                    }`}
                  >
                    <div className={`flex gap-2 sm:gap-3 p-2.5 sm:p-3 overflow-visible ${(prompt.trim() || inputFocused) ? 'flex-col' : 'items-center'}`}>
                      <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
                        <textarea
                          ref={inputRef}
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          onFocus={() => setInputFocused(true)}
                          onBlur={() => {
                            // Only blur if there's no text and there are images, otherwise keep it focused
                            if (!prompt.trim() && images.length > 0) {
                              setInputFocused(false);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              editingImage ? handleEdit() : handleGenerate();
                            }
                          }}
                          placeholder={editingImage ? "What would you like to change?" : "e.g., Create a LinkedIn post to celebrate UAE National Day"}
                          className={`flex-1 bg-transparent border-none outline-none text-neutral-900 placeholder:text-neutral-400 placeholder:text-xs sm:placeholder:text-sm text-sm sm:text-base py-1.5 sm:py-2 resize-none overflow-y-auto min-w-0 [field-sizing:content] ${
                            (prompt.trim() || inputFocused)
                              ? 'min-h-[2.5rem] sm:min-h-[3rem] max-h-[8rem] sm:max-h-[10rem]' 
                              : 'h-[2rem] sm:h-[2.5rem]'
                          }`}
                          rows={(prompt.trim() || inputFocused) ? 5 : 1}
                        />

                        {/* Submit Button - Always visible on right when there's text */}
                        {prompt.trim() && !compareMode && (
                          <button
                            onClick={editingImage ? handleEdit : handleGenerate}
                            disabled={(generating || editing) || !prompt.trim()}
                            className="btn-primary px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm shrink-0"
                          >
                            {(generating || editing) && (
                              <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                            )}
                            <span className="sm:hidden">
                              {editingImage ? 'Apply' : 'Go'}
                            </span>
                            <span className="hidden sm:inline">
                              {editingImage ? 'Apply' : 'Create'}
                            </span>
                          </button>
                        )}
                        
                        {/* Compare Button - Shows when compare mode is enabled */}
                        {prompt.trim() && compareMode && !editingImage && (
                          <button
                            onClick={handleCompare}
                            disabled={comparing || !prompt.trim()}
                            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-white text-xs sm:text-sm font-medium transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed shrink-0 bg-gradient-to-r from-amber-500 to-orange-500"
                          >
                            {comparing ? (
                              <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                            ) : (
                              <Columns className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            )}
                            <span className="sm:hidden">Compare</span>
                            <span className="hidden sm:inline">
                              {comparing ? 'Comparing...' : 'Compare All Versions'}
                            </span>
                          </button>
                        )}
                      </div>

                      {/* Actions Row - Moves to bottom when typing or focused */}
                      {(prompt.trim() || inputFocused) && (
                        <div className="flex items-center gap-2 sm:gap-3 pt-2 border-t border-neutral-100 flex-wrap overflow-visible">
                          {/* Ratio Dropdown (only for new images) */}
                          {!editingImage && (
                            <div className="relative overflow-visible" ref={ratioDropdownRef}>
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  // Prevent blur on textarea
                                  e.preventDefault();
                                }}
                                onClick={() => {
                                  setShowRatioDropdown(!showRatioDropdown);
                                  // Keep input focused
                                  inputRef.current?.focus();
                                }}
                                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition-all rounded-lg hover:bg-neutral-50 border hover:border-neutral-300 ${
                                  showRatioDropdown ? 'border-brand-primary/40' : 'border-neutral-200'
                                }`}
                              >
                                <Grid3x3 className="w-4 h-4 sm:w-4 sm:h-4" />
                                <span>
                                  {selectedPlatform 
                                    ? selectedPlatform 
                                    : selectedAspectRatio === 'auto' 
                                      ? 'Size/Platform' 
                                      : `Size: ${selectedAspectRatio}`
                                  }
                                </span>
                                <ChevronDown className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform ${showRatioDropdown ? 'rotate-180' : ''}`} />
                              </button>

                              {showRatioDropdown && (
                                <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-neutral-200 py-1 z-50 max-h-80 overflow-y-auto">
                                  {/* Auto Option */}
                                  <div className="px-3 py-2">
                                    <button
                                      onClick={() => {
                                        setSelectedAspectRatio('auto');
                                        setSelectedPlatform(null);
                                        setShowRatioDropdown(false);
                                      }}
                                      className="w-full px-2 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center justify-between rounded"
                                    >
                                      <div className="flex items-center gap-2">
                                        <Grid3x3 className="w-4 h-4 text-neutral-400" />
                                        <span>Auto</span>
                                      </div>
                                      {selectedAspectRatio === 'auto' && !selectedPlatform && (
                                        <Check className="w-4 h-4 text-neutral-600" />
                                      )}
                                    </button>
                                  </div>
                                  <div className="border-t border-neutral-100 my-1" />
                                  
                                  {/* Platforms Section */}
                                  <div className="px-3 py-2">
                                    <div className="px-2 py-1 text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
                                      Platforms
                                    </div>
                                    <div className="space-y-1">
                                      {PLATFORM_GROUPS.map((platform) => {
                                        const isExpanded = expandedPlatforms.has(platform.name);
                                        const hasPlatformSelected = platform.sizes.some(
                                          size => selectedPlatform === `${platform.name} - ${size.label}`
                                        );
                                        
                                        return (
                                          <div key={platform.name}>
                                            {/* Platform Header */}
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                togglePlatformExpand(platform.name);
                                              }}
                                              className={`w-full px-2 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center justify-between rounded ${
                                                hasPlatformSelected ? 'bg-neutral-50' : ''
                                              }`}
                                            >
                                              <div className="flex items-center gap-2">
                                                <img 
                                                  src={platform.favicon} 
                                                  alt="" 
                                                  className="w-4 h-4 rounded-sm"
                                                  onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                  }}
                                                />
                                                <span className="font-medium">{platform.name}</span>
                                                {hasPlatformSelected && (
                                                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                                )}
                                              </div>
                                              <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                            </button>
                                            
                                            {/* Expanded Sizes */}
                                            {isExpanded && (
                                              <div className="ml-6 mt-1 space-y-0.5 pb-1">
                                                {platform.sizes.map((size) => {
                                                  const fullName = `${platform.name} - ${size.label}`;
                                                  const isSelected = selectedPlatform === fullName;
                                                  
                                                  return (
                                                    <button
                                                      key={size.label}
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedPlatform(fullName);
                                                        setSelectedAspectRatio(size.ratio);
                                                        setShowRatioDropdown(false);
                                                      }}
                                                      className="w-full px-2 py-1.5 text-left text-sm text-neutral-600 hover:bg-neutral-50 flex items-center justify-between rounded"
                                                    >
                                                      <span>{size.label} ({size.ratio})</span>
                                                      {isSelected && (
                                                        <Check className="w-4 h-4 text-blue-500" />
                                                      )}
                                                    </button>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  
                                  <div className="border-t border-neutral-100 my-1" />
                                  
                                  {/* Sizes Section */}
                                  <div className="px-3 py-2">
                                    <div className="px-2 py-1 text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">
                                      Custom Sizes
                                    </div>
                                    {/* Portrait/Square Ratios */}
                                    <div className="space-y-1">
                                      {[
                                        { value: '1:1', label: 'Square (1:1)' },
                                        { value: '2:3', label: 'Portrait (2:3)' },
                                        { value: '3:4', label: 'Portrait (3:4)' },
                                        { value: '4:5', label: 'Social (4:5)' },
                                        { value: '9:16', label: 'Mobile (9:16)' },
                                      ].map((ratio) => {
                                        const isSelected = selectedAspectRatio === ratio.value && !selectedPlatform;
                                        return (
                                          <button
                                            key={ratio.value}
                                            onClick={() => {
                                              setSelectedAspectRatio(ratio.value as AspectRatio);
                                              setSelectedPlatform(null);
                                              setShowRatioDropdown(false);
                                            }}
                                            className="w-full px-2 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center justify-between rounded"
                                          >
                                            <span>{ratio.label}</span>
                                            {isSelected && (
                                              <Check className="w-4 h-4 text-neutral-600" />
                                            )}
                                          </button>
                                        );
                                      })}
                                    </div>
                                    
                                    <div className="border-t border-neutral-100 my-1.5" />
                                    
                                    {/* Landscape Ratios */}
                                    <div className="space-y-1">
                                      {[
                                        { value: '3:2', label: 'Landscape (3:2)' },
                                        { value: '4:3', label: 'Landscape (4:3)' },
                                        { value: '5:4', label: 'Classic (5:4)' },
                                        { value: '16:9', label: 'Widescreen (16:9)' },
                                        { value: '21:9', label: 'Cinematic (21:9)' },
                                      ].map((ratio) => {
                                        const isSelected = selectedAspectRatio === ratio.value && !selectedPlatform;
                                        return (
                                          <button
                                            key={ratio.value}
                                            onClick={() => {
                                              setSelectedAspectRatio(ratio.value as AspectRatio);
                                              setSelectedPlatform(null);
                                              setShowRatioDropdown(false);
                                            }}
                                            className="w-full px-2 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center justify-between rounded"
                                          >
                                            <span>{ratio.label}</span>
                                            {isSelected && (
                                              <Check className="w-4 h-4 text-neutral-600" />
                                            )}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Attach Assets Button - Opens asset modal directly */}
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              // Prevent blur on textarea
                              e.preventDefault();
                            }}
                            onClick={() => {
                              setShowMediaLibrary(true);
                              // Keep input focused
                              inputRef.current?.focus();
                            }}
                            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition-all rounded-lg hover:bg-neutral-50 border border-neutral-200 hover:border-neutral-300 relative"
                            title="Attach assets"
                          >
                            <FolderOpen className="w-4 h-4 sm:w-4 sm:h-4" />
                            <span>Attach Assets</span>
                            {(selectedAssets.length > 0 || selectedReferences.length > 0) && (
                              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-xs flex items-center justify-center font-semibold bg-brand-primary text-white">
                                {selectedAssets.length + selectedReferences.length}
                              </span>
                            )}
                          </button>

                          {/* Spacer to push submit button to right if needed, or keep it here */}
                          <div className="flex-1" />
                        </div>
                      )}

                      {/* Style Thumbnails - Attached to input box */}
                      {(inputFocused || prompt.trim()) && !editingImage && availableStyles.length > 0 && (
                        <div 
                          className="pt-2 group/thumbnails relative"
                          onMouseDown={(e) => {
                            // Prevent blur on textarea when clicking thumbnails
                            e.preventDefault();
                          }}
                        >
                          <div className="mb-2 text-xs font-medium text-neutral-600 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Quick Style Selection</span>
                            {selectedStyles.length > 0 && (
                              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-brand-primary text-white">
                                {selectedStyles.length} selected
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide relative">
                            {availableStyles.map((style) => {
                              const isSelected = selectedStyles.some(s => s.id === style.id);
                              return (
                                <button
                                  key={style.id}
                                  type="button"
                                  onMouseDown={(e) => {
                                    // Prevent blur on textarea by preventing default mousedown
                                    e.preventDefault();
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Keep input focused
                                    inputRef.current?.focus();
                                    // Open the modal
                                    setShowStylesPicker(true);
                                  }}
                                  className={`group relative shrink-0 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                                    isSelected
                                      ? 'border-brand-primary ring-2 ring-brand-primary/30 ring-offset-1'
                                      : 'border-neutral-200 hover:border-neutral-300 hover:shadow-md'
                                  }`}
                                  aria-label={style.name}
                                >
                                  {/* Thumbnail Image */}
                                  <div 
                                    className="w-14 h-14 sm:w-16 sm:h-16 relative overflow-hidden"
                                    style={{
                                      backgroundImage: 'linear-gradient(45deg, #f0f0f0 25%, transparent 25%), linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f0f0f0 75%), linear-gradient(-45deg, transparent 75%, #f0f0f0 75%)',
                                      backgroundSize: '8px 8px',
                                      backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
                                      backgroundColor: '#fafafa',
                                    }}
                                  >
                                    <img
                                      src={style.url}
                                      alt={style.name}
                                      className="w-full h-full object-contain p-1 group-hover:scale-110 transition-transform duration-200"
                                    />
                                    
                                    {/* Overlay on hover */}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
                                  </div>

                                  {/* Selection Indicator */}
                                  {isSelected && (
                                    <div className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center shadow-sm z-10 bg-brand-primary">
                                      <Check className="w-2.5 h-2.5 text-white" />
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          
                          {/* Hover Overlay - Shows on hover to indicate clicking opens modal */}
                          <div className="absolute left-0 right-0 top-8 bottom-0 bg-neutral-900/80 backdrop-blur-md rounded-lg opacity-0 group-hover/thumbnails:opacity-100 transition-opacity duration-200 flex items-center justify-center pointer-events-none z-30">
                            <div className="flex items-center gap-2 text-white text-sm font-medium drop-shadow-lg">
                              <Sparkles className="w-4 h-4" />
                              <span>Click to browse all styles</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Smart Presets Section */}
                <div>
                  <div className="mb-4 text-center">
                    <h3 className="text-sm sm:text-base font-medium text-neutral-600">
                      Some ideas to get started
                    </h3>
                  </div>
                  
                  {loadingPresets ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
                      <span className="ml-3 text-neutral-600 text-sm sm:text-base">Generating smart presets...</span>
                    </div>
                  ) : smartPresets.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {smartPresets.slice(0, 3).map((preset) => {
                        const { tag, IconComponent } = getPresetIconAndTag(preset.category, preset.label);
                        return (
                          <button
                            key={preset.id}
                            onClick={() => handlePresetClick(preset)}
                            className="group relative bg-white rounded-2xl p-4 border border-neutral-200 hover:border-neutral-300 hover:shadow-md transition-all text-left flex flex-col h-full"
                          >
                            {/* Tag */}
                            <div className="absolute top-3 left-3">
                              <span className="text-xs font-medium text-neutral-500 bg-neutral-50 px-2 py-0.5 rounded-full border border-neutral-200">
                                {tag}
                              </span>
                            </div>
                            
                            {/* Icon */}
                            <div className="flex items-center justify-center mb-4 mt-1">
                              <div className="w-16 h-16 rounded-xl flex items-center justify-center bg-brand-primary/[0.08] text-brand-primary">
                                <IconComponent className="w-8 h-8 text-brand-primary" />
                              </div>
                            </div>
                            
                            {/* Title */}
                            <h4 className="font-semibold text-neutral-900 mb-1.5 text-sm leading-tight">
                              {preset.label}
                            </h4>
                            
                            {/* Description */}
                            {preset.smartContext?.whyRelevant ? (
                              <p className="text-xs text-neutral-600 mb-3 flex-1 leading-relaxed line-clamp-2">
                                {preset.smartContext.whyRelevant}
                              </p>
                            ) : (
                              <p className="text-xs text-neutral-600 mb-3 flex-1 leading-relaxed">
                                {preset.category}
                              </p>
                            )}
                            
                            {/* Create Button */}
                            <div className="mt-auto pt-3 border-t border-neutral-100">
                              <button
                                className="btn-primary w-full py-2.5 rounded-lg text-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePresetClick(preset);
                                }}
                              >
                                Create
                              </button>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-neutral-500">
                      <p>Unable to load presets. You can still create images using the input below.</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
                {images.map((image) => (
                  <div
                    key={image.id}
                    onClick={() => {
                      setSelectedImage(image);
                      // GPT prompt info will be loaded from metadata in useEffect
                    }}
                    className="group relative bg-white/70 backdrop-blur-sm rounded-2xl overflow-hidden cursor-pointer hover:bg-white hover:shadow-xl transition-all duration-300 border border-neutral-200/50"
                  >
                    {/* Image Preview */}
                    <div className="aspect-square bg-neutral-50 relative overflow-hidden flex items-center justify-center">
                      {image.image_url ? (
                        <img
                          src={image.image_url}
                          alt="Generated"
                          className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : image.status === 'generating' ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="text-center">
                            <Loader2 className="w-8 h-8 animate-spin text-neutral-400 mx-auto mb-2" />
                            <p className="text-xs text-neutral-500">Creating...</p>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Sparkles className="w-10 h-10 text-neutral-300" />
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
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-lg text-xs font-medium text-neutral-700 hover:bg-white transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              Edit
                            </button>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => handleDownload(image, e)}
                                className="w-8 h-8 rounded-lg bg-white/90 backdrop-blur-sm flex items-center justify-center text-neutral-700 hover:bg-white transition-colors"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => handleDeleteClick(image.id, e)}
                                disabled={deleting === image.id}
                                className="w-8 h-8 rounded-lg bg-white/90 backdrop-blur-sm flex items-center justify-center text-neutral-700 hover:bg-red-50 hover:text-red-600 transition-colors"
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
                      
                      {/* Edit count badge */}
                      {image.edit_count > 0 && (
                        <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-neutral-900/70 backdrop-blur-sm text-white text-xs font-medium flex items-center gap-1">
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

      {/* Floating Input Bar - Only show when there are images */}
      {images.length > 0 && (
      <div 
        ref={inputContainerRef}
        className={`fixed bottom-0 left-0 right-0 z-40 transition-all duration-300 overflow-visible ${
          inputFocused ? 'pb-4 sm:pb-6' : 'pb-4 sm:pb-6'
        }`}
      >
        <div className="max-w-3xl mx-auto px-3 sm:px-4 overflow-visible">
          {/* Editing Badge */}
          {editingImage && (
            <div className="mb-3 flex items-center gap-3 bg-white/90 backdrop-blur-sm rounded-xl p-2 border border-neutral-200">
              <img 
                src={editingImage.image_url} 
                alt="Editing" 
                className="w-12 h-12 rounded-lg object-cover"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-neutral-700">Editing image</p>
                <p className="text-xs text-neutral-500 truncate">{editingImage.prompt}</p>
              </div>
              <button
                onClick={cancelEditing}
                className="w-8 h-8 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-500 hover:text-neutral-700 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Smart Presets Link - Only show when not editing and images exist */}
          {!editingImage && images.length > 0 && smartPresets.length > 0 && (
            <div className="mb-2 flex items-center justify-center">
              <button
                onClick={() => setShowPresetsModal(true)}
                className="text-xs text-neutral-500 hover:text-neutral-700 transition-colors flex items-center gap-1.5"
              >
                <Sparkles className="w-3 h-3" />
                <span>Browse smart presets</span>
              </button>
            </div>
          )}

          {/* Prompt Version Toggle */}
          {!editingImage && (
            <div className="mb-2 flex items-center justify-center gap-3">
              <div className="flex items-center gap-1 bg-white/80 backdrop-blur-sm rounded-lg border border-neutral-200 p-0.5">
                <button
                  onClick={() => setPromptVersion('v1')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                    promptVersion === 'v1'
                      ? 'bg-neutral-900 text-white shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-700'
                  }`}
                >
                  V1
                </button>
                <button
                  onClick={() => setPromptVersion('v2')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                    promptVersion === 'v2'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-700'
                  }`}
                >
                  <FlaskConical className="w-3 h-3" />
                  V2
                </button>
                <button
                  onClick={() => setPromptVersion('v3')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                    promptVersion === 'v3'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-700'
                  }`}
                >
                  <Zap className="w-3 h-3" />
                  V3
                </button>
              </div>
              
              {promptVersion === 'v2' && (
                <span className="text-xs text-emerald-600">
                  Design-type aware
                </span>
              )}
              {promptVersion === 'v3' && (
                <span className="text-xs text-amber-600">
                  Lean & direct
                </span>
              )}
              
              {/* Compare Mode Toggle */}
              <button
                onClick={() => setCompareMode(!compareMode)}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-all ${
                  compareMode 
                    ? 'bg-amber-100 text-amber-700 border border-amber-300' 
                    : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <Columns className="w-3 h-3" />
                <span className="hidden sm:inline">Compare</span>
              </button>
            </div>
          )}

          {/* Main Input */}
          <div 
            className={`bg-white/95 backdrop-blur-xl rounded-xl sm:rounded-2xl border shadow-xl transition-all duration-300 overflow-visible ${
              inputFocused
                ? 'border-brand-primary/40 shadow-2xl'
                : 'border-neutral-200/80'
            }`}
          >
            <div className={`flex gap-2 sm:gap-3 p-2.5 sm:p-3 overflow-visible ${(prompt.trim() || inputFocused) ? 'flex-col' : 'items-center'}`}>
              <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
                <textarea
                  ref={inputRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => {
                    // Only blur if there's no text, otherwise keep it focused
                    if (!prompt.trim()) {
                      setInputFocused(false);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      editingImage ? handleEdit() : handleGenerate();
                    }
                  }}
                  placeholder={editingImage ? "What would you like to change?" : "e.g., Create a LinkedIn post to celebrate UAE National Day"}
                  className={`flex-1 bg-transparent border-none outline-none text-neutral-900 placeholder:text-neutral-400 placeholder:text-xs sm:placeholder:text-sm text-sm sm:text-base py-1.5 sm:py-2 resize-none overflow-y-auto min-w-0 [field-sizing:content] ${
                    (prompt.trim() || inputFocused)
                      ? 'min-h-[2.5rem] sm:min-h-[3rem] max-h-[8rem] sm:max-h-[10rem]' 
                      : 'h-[2rem] sm:h-[2.5rem]'
                  }`}
                  rows={(prompt.trim() || inputFocused) ? 5 : 1}
                />

                {/* Submit Button - Always visible on right when there's text */}
                {prompt.trim() && !compareMode && (
                  <button
                    onClick={editingImage ? handleEdit : handleGenerate}
                    disabled={(generating || editing) || !prompt.trim()}
                    className="btn-primary px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm shrink-0"
                  >
                    {(generating || editing) && (
                      <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                    )}
                    <span className="sm:hidden">
                      {editingImage ? 'Apply' : 'Go'}
                    </span>
                    <span className="hidden sm:inline">
                      {editingImage ? 'Apply' : 'Create'}
                    </span>
                  </button>
                )}

                {/* Compare Button - Shows when compare mode is enabled */}
                {prompt.trim() && compareMode && !editingImage && (
                  <button
                    onClick={handleCompare}
                    disabled={comparing || !prompt.trim()}
                    className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-white text-xs sm:text-sm font-medium transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed shrink-0 bg-gradient-to-r from-amber-500 to-orange-500"
                  >
                    {comparing ? (
                      <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                    ) : (
                      <Columns className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    )}
                    <span className="sm:hidden">Compare</span>
                    <span className="hidden sm:inline">
                      {comparing ? 'Comparing...' : 'Compare All Versions'}
                    </span>
                  </button>
                )}
              </div>

              {/* Actions Row - Moves to bottom when typing or focused */}
              {(prompt.trim() || inputFocused) && (
                <div className="flex items-center gap-2 sm:gap-3 pt-2 border-t border-neutral-100 flex-wrap overflow-visible">
                  {/* Ratio Dropdown (only for new images) */}
                  {!editingImage && (
                    <div className="relative" ref={ratioDropdownRef}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          // Prevent blur on textarea
                          e.preventDefault();
                        }}
                        onClick={() => {
                          setShowRatioDropdown(!showRatioDropdown);
                          // Keep input focused
                          inputRef.current?.focus();
                        }}
                        className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition-all rounded-lg hover:bg-neutral-50 border hover:border-neutral-300 ${
                          showRatioDropdown ? 'border-brand-primary/40' : 'border-neutral-200'
                        }`}
                      >
                        <Grid3x3 className="w-4 h-4 sm:w-4 sm:h-4" />
                        <span>
                          {selectedPlatform
                            ? selectedPlatform
                            : selectedAspectRatio === 'auto'
                              ? 'Size/Platform'
                              : `Size: ${selectedAspectRatio}`
                          }
                        </span>
                        <ChevronDown className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform ${showRatioDropdown ? 'rotate-180' : ''}`} />
                      </button>

                      {showRatioDropdown && (
                        <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-neutral-200 py-1 z-50 max-h-80 overflow-y-auto">
                          {/* Auto Option */}
                          <div className="px-3 py-2">
                            <button
                              onClick={() => {
                                setSelectedAspectRatio('auto');
                                setSelectedPlatform(null);
                                setShowRatioDropdown(false);
                              }}
                              className="w-full px-2 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center justify-between rounded"
                            >
                              <div className="flex items-center gap-2">
                                <Grid3x3 className="w-4 h-4 text-neutral-400" />
                                <span>Auto</span>
                              </div>
                              {selectedAspectRatio === 'auto' && !selectedPlatform && (
                                <Check className="w-4 h-4 text-neutral-600" />
                              )}
                            </button>
                          </div>
                          <div className="border-t border-neutral-100 my-1" />
                          
                          {/* Platforms Section */}
                          <div className="px-3 py-2">
                            <div className="px-2 py-1 text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
                              Platforms
                            </div>
                            <div className="space-y-1">
                              {PLATFORM_GROUPS.map((platform) => {
                                const isExpanded = expandedPlatforms.has(platform.name);
                                const hasPlatformSelected = platform.sizes.some(
                                  size => selectedPlatform === `${platform.name} - ${size.label}`
                                );
                                
                                return (
                                  <div key={platform.name}>
                                    {/* Platform Header */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        togglePlatformExpand(platform.name);
                                      }}
                                      className={`w-full px-2 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center justify-between rounded ${
                                        hasPlatformSelected ? 'bg-neutral-50' : ''
                                      }`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <img 
                                          src={platform.favicon} 
                                          alt="" 
                                          className="w-4 h-4 rounded-sm"
                                          onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                          }}
                                        />
                                        <span className="font-medium">{platform.name}</span>
                                        {hasPlatformSelected && (
                                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                        )}
                                      </div>
                                      <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                    </button>
                                    
                                    {/* Expanded Sizes */}
                                    {isExpanded && (
                                      <div className="ml-6 mt-1 space-y-0.5 pb-1">
                                        {platform.sizes.map((size) => {
                                          const fullName = `${platform.name} - ${size.label}`;
                                          const isSelected = selectedPlatform === fullName;
                                          
                                          return (
                                            <button
                                              key={size.label}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedPlatform(fullName);
                                                setSelectedAspectRatio(size.ratio);
                                                setShowRatioDropdown(false);
                                              }}
                                              className="w-full px-2 py-1.5 text-left text-sm text-neutral-600 hover:bg-neutral-50 flex items-center justify-between rounded"
                                            >
                                              <span>{size.label} ({size.ratio})</span>
                                              {isSelected && (
                                                <Check className="w-4 h-4 text-blue-500" />
                                              )}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          
                          <div className="border-t border-neutral-100 my-1" />
                          
                          {/* Sizes Section */}
                          <div className="px-3 py-2">
                            <div className="px-2 py-1 text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">
                              Custom Sizes
                            </div>
                            {/* Portrait/Square Ratios */}
                            <div className="space-y-1">
                              {[
                                { value: '1:1', label: 'Square (1:1)' },
                                { value: '2:3', label: 'Portrait (2:3)' },
                                { value: '3:4', label: 'Portrait (3:4)' },
                                { value: '4:5', label: 'Social (4:5)' },
                                { value: '9:16', label: 'Mobile (9:16)' },
                              ].map((ratio) => {
                                const isSelected = selectedAspectRatio === ratio.value && !selectedPlatform;
                                return (
                                  <button
                                    key={ratio.value}
                                    onClick={() => {
                                      setSelectedAspectRatio(ratio.value as AspectRatio);
                                      setSelectedPlatform(null);
                                      setShowRatioDropdown(false);
                                    }}
                                    className="w-full px-2 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center justify-between rounded"
                                  >
                                    <span>{ratio.label}</span>
                                    {isSelected && (
                                      <Check className="w-4 h-4 text-neutral-600" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                            
                            <div className="border-t border-neutral-100 my-1.5" />
                            
                            {/* Landscape Ratios */}
                            <div className="space-y-1">
                              {[
                                { value: '3:2', label: 'Landscape (3:2)' },
                                { value: '4:3', label: 'Landscape (4:3)' },
                                { value: '5:4', label: 'Classic (5:4)' },
                                { value: '16:9', label: 'Widescreen (16:9)' },
                                { value: '21:9', label: 'Cinematic (21:9)' },
                              ].map((ratio) => {
                                const isSelected = selectedAspectRatio === ratio.value && !selectedPlatform;
                                return (
                                  <button
                                    key={ratio.value}
                                    onClick={() => {
                                      setSelectedAspectRatio(ratio.value as AspectRatio);
                                      setSelectedPlatform(null);
                                      setShowRatioDropdown(false);
                                    }}
                                    className="w-full px-2 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center justify-between rounded"
                                  >
                                    <span>{ratio.label}</span>
                                    {isSelected && (
                                      <Check className="w-4 h-4 text-neutral-600" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Attach Assets Button - Opens asset modal directly */}
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      // Prevent blur on textarea
                      e.preventDefault();
                    }}
                    onClick={() => {
                      setShowMediaLibrary(true);
                      // Keep input focused
                      inputRef.current?.focus();
                    }}
                    className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition-all rounded-lg hover:bg-neutral-50 border border-neutral-200 hover:border-neutral-300 relative"
                    title="Attach assets"
                  >
                    <FolderOpen className="w-4 h-4 sm:w-4 sm:h-4" />
                    <span>Attach Assets</span>
                    {(selectedAssets.length > 0 || selectedReferences.length > 0) && (
                      <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-xs flex items-center justify-center font-semibold bg-brand-primary text-white">
                        {selectedAssets.length + selectedReferences.length}
                      </span>
                    )}
                  </button>

                  {/* Enhance Prompt Button (placeholder) - Commented out */}
                  {false && !editingImage && (
                    <button
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-neutral-500 hover:text-neutral-700 transition-colors rounded-lg hover:bg-neutral-100"
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
              
              {/* Style Thumbnails - Attached to input box */}
              {(inputFocused || prompt.trim()) && !editingImage && availableStyles.length > 0 && images.length > 0 && (
                <div 
                  className="pt-2 group/thumbnails relative"
                  onMouseDown={(e) => {
                    // Prevent blur on textarea when clicking thumbnails
                    e.preventDefault();
                  }}
                >
                  <div className="mb-2 text-xs font-medium text-neutral-600 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Quick Style Selection</span>
                    {selectedStyles.length > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-brand-primary text-white">
                        {selectedStyles.length} selected
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide relative">
                    {availableStyles.map((style) => {
                      const isSelected = selectedStyles.some(s => s.id === style.id);
                      return (
                        <button
                          key={style.id}
                          type="button"
                          onMouseDown={(e) => {
                            // Prevent blur on textarea by preventing default mousedown
                            e.preventDefault();
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Keep input focused
                            inputRef.current?.focus();
                            // Open the modal
                            setShowStylesPicker(true);
                          }}
                          className={`group relative shrink-0 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                            isSelected
                              ? 'border-brand-primary ring-2 ring-brand-primary/30 ring-offset-1'
                              : 'border-neutral-200 hover:border-neutral-300 hover:shadow-md'
                          }`}
                          aria-label={style.name}
                        >
                          {/* Thumbnail Image */}
                          <div className="w-14 h-14 sm:w-16 sm:h-16 relative overflow-hidden bg-neutral-50 checkerboard">
                            <img
                              src={style.url}
                              alt={style.name}
                              className="w-full h-full object-contain p-1 group-hover:scale-110 transition-transform duration-200"
                            />

                            {/* Overlay on hover */}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
                          </div>

                          {/* Selection Indicator */}
                          {isSelected && (
                            <div className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center shadow-sm z-10 bg-brand-primary">
                              <Check className="w-2.5 h-2.5 text-white" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Hover Overlay - Shows on hover to indicate clicking opens modal */}
                  <div className="absolute left-0 right-0 top-8 bottom-0 bg-neutral-900/80 backdrop-blur-md rounded-lg opacity-0 group-hover/thumbnails:opacity-100 transition-opacity duration-200 flex items-center justify-center pointer-events-none z-30">
                    <div className="flex items-center gap-2 text-white text-sm font-medium drop-shadow-lg">
                      <Sparkles className="w-4 h-4" />
                      <span>Click to browse all styles</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      )}

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
            className="relative bg-white rounded-2xl sm:rounded-3xl shadow-2xl max-w-5xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col md:flex-row"
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
              className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-neutral-600 hover:text-neutral-900 hover:bg-white transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Image Panel */}
            <div className="flex-1 bg-neutral-100 flex items-center justify-center p-6 md:p-8 relative">
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
                        <Loader2 className="w-12 h-12 animate-spin text-neutral-400 mx-auto mb-4" />
                        <p className="text-neutral-600">Creating your image...</p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <Sparkles className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
                        <p className="text-neutral-500">Image not available</p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Info Panel */}
            <div className="w-full md:w-80 lg:w-96 border-t md:border-t-0 md:border-l border-neutral-200 flex flex-col max-h-[50vh] md:max-h-none overflow-y-auto">
              {/* Header */}
              <div className="p-4 sm:p-6 border-b border-neutral-100">
                <div className="flex items-center gap-2 text-xs text-neutral-500 mb-3">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatDate(selectedImage.created_at)}
                  {selectedImage.edit_count > 0 && (
                    <span className="px-2 py-0.5 bg-neutral-100 rounded-full">
                      {selectedImage.edit_count} edit{selectedImage.edit_count !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <p className="text-sm text-neutral-700 leading-relaxed">
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
                  <div className="p-4 border-b border-neutral-200 bg-neutral-50/50">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-neutral-600 uppercase tracking-wider">Version History</span>
                      <span className="text-sm font-medium text-neutral-700">
                        {currentVersionIndex + 1} / {versions.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigateVersion(-1, versions.length)}
                        disabled={!canNavigateLeft}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${
                          canNavigateLeft
                            ? 'bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50 hover:border-neutral-400 cursor-pointer'
                            : 'bg-neutral-100 border-neutral-200 text-neutral-400 cursor-not-allowed'
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
                            ? 'bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50 hover:border-neutral-400 cursor-pointer'
                            : 'bg-neutral-100 border-neutral-200 text-neutral-400 cursor-not-allowed'
                        }`}
                      >
                        <span className="text-sm font-medium">Next</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                    {currentVersion?.edit_prompt && (
                      <p className="mt-2 text-xs text-neutral-500 italic">
                        "{currentVersion.edit_prompt}"
                      </p>
                    )}
                  </div>
                ) : null;
              })()}

              {/* GPT Prompt Info (for reference) - Only show on localhost */}
              {gptPromptInfo && (import.meta.env.DEV || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
                <div className="p-4 border-t border-neutral-200 bg-neutral-50/50">
                  <button
                    onClick={() => setShowGptPrompt(!showGptPrompt)}
                    className="w-full flex items-center justify-between text-left hover:opacity-80 transition-opacity"
                  >
                    <div className="flex items-center gap-2">
                      <Wand2 className="w-4 h-4 text-neutral-600" />
                      <span className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                        Generated Prompt
                      </span>
                    </div>
                    {showGptPrompt ? (
                      <ChevronUp className="w-4 h-4 text-neutral-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-neutral-500" />
                    )}
                  </button>
                  {showGptPrompt && (
                    <div className="mt-3 space-y-3">
                      <div className="bg-white rounded-lg p-3 border border-neutral-200 shadow-sm">
                        <div className="text-xs font-semibold text-neutral-800 mb-2">System Prompt:</div>
                        <pre className="text-xs text-neutral-700 whitespace-pre-wrap break-words font-mono overflow-auto max-h-48 bg-neutral-50 p-2 rounded border border-neutral-100">
                          {gptPromptInfo.system_prompt}
                        </pre>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-neutral-200 shadow-sm">
                        <div className="text-xs font-semibold text-neutral-800 mb-2">User Message:</div>
                        <pre className="text-xs text-neutral-700 whitespace-pre-wrap break-words font-mono overflow-auto max-h-48 bg-neutral-50 p-2 rounded border border-neutral-100">
                          {gptPromptInfo.user_message}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="p-3 sm:p-4 border-t border-neutral-100 flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowModalEditPrompt(true);
                  }}
                  disabled={modalEditing || selectedImage.edit_count >= selectedImage.max_edits}
                  className="btn-primary flex-1 px-3 sm:px-4 py-2 sm:py-3 rounded-lg sm:rounded-xl text-sm sm:text-base"
                >
                  <Edit3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Edit</span>
                </button>
                <button
                  onClick={() => handleDownload(selectedImage)}
                  className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-3 bg-neutral-100 hover:bg-neutral-200 rounded-lg sm:rounded-xl text-neutral-700 font-medium transition-colors"
                >
                  <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Floating Edit Prompt Box */}
          {showModalEditPrompt && (
            <div 
              className="relative w-full max-w-2xl mt-4 z-[60] px-2 sm:px-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white/95 backdrop-blur-xl rounded-xl sm:rounded-2xl border border-neutral-200 shadow-2xl p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 bg-brand-primary/[0.15]">
                    <Edit3 className="w-4 h-4 sm:w-5 sm:h-5 text-brand-primary" />
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
                    className="flex-1 w-full min-w-0 bg-transparent border-none outline-none text-neutral-900 placeholder:text-neutral-400 placeholder:text-xs sm:placeholder:text-sm text-sm sm:text-base py-1.5 sm:py-2"
                    disabled={modalEditing}
                  />

                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 w-full sm:w-auto justify-end sm:justify-start">
                    {/* Attach Assets Button for Modal Edit */}
                    <button
                      onClick={() => setShowMediaLibrary(true)}
                      className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 text-xs text-neutral-500 hover:text-neutral-700 transition-colors rounded-lg hover:bg-neutral-100 relative"
                      title="Attach assets"
                      disabled={modalEditing}
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Attach Assets</span>
                      {(selectedAssets.length > 0 || selectedReferences.length > 0) && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-medium bg-brand-primary text-white">
                          {selectedAssets.length + selectedReferences.length}
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => {
                        setShowModalEditPrompt(false);
                        setModalEditPrompt('');
                      }}
                      className="w-8 h-8 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-500 hover:text-neutral-700 transition-colors shrink-0"
                      disabled={modalEditing}
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleModalEdit}
                      disabled={modalEditing || !modalEditPrompt.trim() || selectedImage.edit_count >= selectedImage.max_edits}
                      className="btn-primary px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl text-sm sm:text-base shrink-0 min-w-[80px] sm:min-w-0"
                    >
                      {modalEditing ? (
                        <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      )}
                      <span className="sm:hidden">Go</span>
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
              className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="mb-6 pr-8">
              <h3 className="text-lg font-bold text-neutral-900 mb-1">
                {selectedTemplate.name}
              </h3>
              {selectedTemplate.description && (
                <p className="text-sm text-neutral-600">
                  {selectedTemplate.description}
                </p>
              )}
            </div>

            <div className="space-y-4 mb-6">
              {selectedTemplate.fields.map((field) => (
                <div key={field.name}>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">
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
                    className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-300 transition-all"
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
                className="flex-1 px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 rounded-xl text-neutral-700 font-medium transition-colors"
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
        maxSelection={MAX_TOTAL_IMAGES - autoIncludedImages - currentAssets - selectedStyles.length}
      />

      {/* Styles Picker */}
      {/* Smart Presets Modal */}
      {showPresetsModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setShowPresetsModal(false)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          
          <div 
            className="relative bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start sm:items-center justify-between p-4 sm:p-6 border-b border-neutral-200 gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="text-lg sm:text-xl font-bold text-neutral-900 mb-1">
                  Smart Presets
                </h3>
                <p className="text-xs sm:text-sm text-neutral-600">
                  Personalized suggestions for <span className="font-semibold">{brand.name}</span>
                </p>
              </div>
              <button
                onClick={() => setShowPresetsModal(false)}
                className="w-8 h-8 rounded-lg bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center text-neutral-600 hover:text-neutral-900 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Presets Grid */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
              {loadingPresets ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
                  <span className="ml-3 text-neutral-600 text-sm">Loading presets...</span>
                </div>
              ) : smartPresets.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {smartPresets.map((preset) => {
                    const { tag, IconComponent } = getPresetIconAndTag(preset.category, preset.label);
                    return (
                      <button
                        key={preset.id}
                        onClick={() => {
                          handlePresetClick(preset);
                          setShowPresetsModal(false);
                        }}
                        className="group relative bg-white rounded-2xl p-6 border border-neutral-200 hover:border-neutral-300 hover:shadow-md transition-all text-left flex flex-col h-full"
                      >
                        {/* Tag */}
                        <div className="absolute top-4 left-4">
                          <span className="text-xs font-medium text-neutral-500 bg-neutral-50 px-2.5 py-1 rounded-full border border-neutral-200">
                            {tag}
                          </span>
                        </div>
                        
                        {/* Icon */}
                        <div className="flex items-center justify-center mb-6 mt-2">
                          <div className="w-20 h-20 rounded-2xl flex items-center justify-center bg-brand-primary/[0.08] text-brand-primary">
                            <IconComponent className="w-10 h-10 text-brand-primary" />
                          </div>
                        </div>
                        
                        {/* Title */}
                        <h4 className="font-semibold text-neutral-900 mb-2 text-base leading-tight">
                          {preset.label}
                        </h4>
                        
                        {/* Description */}
                        {preset.smartContext?.whyRelevant ? (
                          <p className="text-sm text-neutral-600 mb-4 flex-1 leading-relaxed">
                            {preset.smartContext.whyRelevant}
                          </p>
                        ) : (
                          <p className="text-sm text-neutral-600 mb-4 flex-1 leading-relaxed">
                            {preset.category}
                          </p>
                        )}
                        
                        {/* Create Button */}
                        <div className="mt-auto pt-4 border-t border-neutral-100">
                          <button
                            className="btn-primary w-full py-2.5 rounded-lg text-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePresetClick(preset);
                              setShowPresetsModal(false);
                            }}
                          >
                            Create
                          </button>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-neutral-500">
                  <p>No presets available. You can still create images using the input below.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Comparison Modal */}
      {showComparisonModal && comparisonResults && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
          onClick={() => setShowComparisonModal(false)}
        >
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          
          <div 
            className="relative bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-neutral-200">
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-neutral-900 flex items-center gap-2">
                  <Columns className="w-5 h-5" />
                  Side-by-Side Comparison
                </h3>
                <p className="text-sm text-neutral-600 mt-1">
                  Prompt: "{prompt.substring(0, 60)}{prompt.length > 60 ? '...' : ''}"
                </p>
              </div>
              <button
                onClick={() => setShowComparisonModal(false)}
                className="w-8 h-8 rounded-lg bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center text-neutral-600 hover:text-neutral-900 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Comparison Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                {/* V1 Result */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-neutral-900 text-white text-xs font-medium rounded-md">
                      V1
                    </span>
                    <span className="text-xs text-neutral-500">GPT + Complex</span>
                  </div>
                  
                  {comparisonResults.v1 ? (
                    <div className="space-y-3">
                      <div className="relative rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200">
                        <img 
                          src={`data:image/png;base64,${comparisonResults.v1.image_base64}`}
                          alt="V1 Result"
                          className="w-full h-auto"
                        />
                      </div>
                      
                      {comparisonResults.v1.gpt_prompt_info && (
                        <details className="bg-neutral-50 rounded-lg border border-neutral-200">
                          <summary className="px-3 py-2 text-xs font-medium text-neutral-600 cursor-pointer hover:bg-neutral-100">
                            View Prompt
                          </summary>
                          <div className="px-3 pb-3">
                            <pre className="text-[10px] text-neutral-600 whitespace-pre-wrap max-h-48 overflow-y-auto bg-white p-2 rounded border">
                              {comparisonResults.v1.gpt_prompt_info.full_prompt}
                            </pre>
                          </div>
                        </details>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-64 bg-red-50 rounded-xl border border-red-200 text-red-600 text-sm">
                      Failed
                    </div>
                  )}
                </div>

                {/* V2 Result */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-emerald-500 text-white text-xs font-medium rounded-md flex items-center gap-1">
                      <FlaskConical className="w-3 h-3" />
                      V2
                    </span>
                    <span className="text-xs text-neutral-500">Design-type aware</span>
                  </div>
                  
                  {comparisonResults.v2 ? (
                    <div className="space-y-3">
                      <div className="relative rounded-xl overflow-hidden bg-neutral-100 border border-emerald-200">
                        <img 
                          src={`data:image/png;base64,${comparisonResults.v2.image_base64}`}
                          alt="V2 Result"
                          className="w-full h-auto"
                        />
                      </div>
                      
                      {comparisonResults.v2.gpt_prompt_info && (
                        <details className="bg-emerald-50 rounded-lg border border-emerald-200">
                          <summary className="px-3 py-2 text-xs font-medium text-emerald-700 cursor-pointer hover:bg-emerald-100">
                            View Prompt
                          </summary>
                          <div className="px-3 pb-3">
                            <pre className="text-[10px] text-neutral-600 whitespace-pre-wrap max-h-48 overflow-y-auto bg-white p-2 rounded border">
                              {comparisonResults.v2.gpt_prompt_info.full_prompt}
                            </pre>
                          </div>
                        </details>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-64 bg-red-50 rounded-xl border border-red-200 text-red-600 text-sm">
                      Failed
                    </div>
                  )}
                </div>

                {/* V3 Result */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-amber-500 text-white text-xs font-medium rounded-md flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      V3
                    </span>
                    <span className="text-xs text-neutral-500">Lean & Direct</span>
                  </div>
                  
                  {comparisonResults.v3 ? (
                    <div className="space-y-3">
                      <div className="relative rounded-xl overflow-hidden bg-neutral-100 border border-amber-200">
                        <img 
                          src={`data:image/png;base64,${comparisonResults.v3.image_base64}`}
                          alt="V3 Result"
                          className="w-full h-auto"
                        />
                      </div>
                      
                      {comparisonResults.v3.prompt_used && (
                        <details className="bg-amber-50 rounded-lg border border-amber-200">
                          <summary className="px-3 py-2 text-xs font-medium text-amber-700 cursor-pointer hover:bg-amber-100">
                            View Prompt
                          </summary>
                          <div className="px-3 pb-3">
                            <pre className="text-[10px] text-neutral-600 whitespace-pre-wrap max-h-48 overflow-y-auto bg-white p-2 rounded border">
                              {comparisonResults.v3.prompt_used}
                            </pre>
                          </div>
                        </details>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-64 bg-red-50 rounded-xl border border-red-200 text-red-600 text-sm">
                      Failed
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-t border-neutral-200 bg-neutral-50">
              <p className="text-xs text-neutral-500">
                Comparison uses 1 credit. Select a version to save it to your gallery.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowComparisonModal(false);
                    setCompareMode(false);
                  }}
                  className="px-3 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
                  disabled={!!savingComparison}
                >
                  Close
                </button>
                <button
                  onClick={() => handleSaveComparisonImage('v1')}
                  disabled={!comparisonResults?.v1 || !!savingComparison}
                  className="px-3 py-2 text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {savingComparison === 'v1' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Use V1'
                  )}
                </button>
                <button
                  onClick={() => handleSaveComparisonImage('v2')}
                  disabled={!comparisonResults?.v2 || !!savingComparison}
                  className="px-3 py-2 text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {savingComparison === 'v2' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Use V2'
                  )}
                </button>
                <button
                  onClick={() => handleSaveComparisonImage('v3')}
                  disabled={!comparisonResults?.v3 || !!savingComparison}
                  className="px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {savingComparison === 'v3' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Use V3'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <StylesPicker
        isOpen={showStylesPicker}
        onClose={() => setShowStylesPicker(false)}
        onSelect={(selected) => {
          // Maximum 2 styles allowed
          const filtered = selected.slice(0, 2);
          setSelectedStyles(filtered);
        }}
        selectedStyles={selectedStyles}
      />
    </div>
  );
}

