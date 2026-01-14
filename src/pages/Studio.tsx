import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Loader2,
  Trash2,
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
  Megaphone,
  BarChart3,
  Monitor,
  Mail,
  Camera,
  Share2,
  Play,
  Package,
  Copy,
  Bug,
  Layers,
  AlertTriangle
} from 'lucide-react';
import { supabase, Brand, GeneratedImage, ConversationMessage, BrandAsset, Style, Product, getAuthHeaders, getUserCredits } from '../lib/supabase';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { UpgradeModal } from '../components/UpgradeModal';
import { AssetPicker } from '../components/AssetPicker';
import { ProductPicker } from '../components/ProductPicker';
import { ReferenceUpload } from '../components/ReferenceUpload';
import { StylesPicker } from '../components/StylesPicker';
import { generateSmartPresets, SmartPreset } from '../lib/smartPresets';
import { logger } from '../lib/logger';
import { track } from '../lib/analytics';
import { resilientFetch, sanitizeErrorMessage } from '../lib/fetch';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import { Button } from '../components/ui';
import { isAdminUser } from '../lib/admin';

type AspectRatio = '1:1' | '2:3' | '3:4' | '4:5' | '9:16' | '3:2' | '4:3' | '5:4' | '16:9' | '21:9' | 'auto';

type EditingImage = {
  id: string;
  image_url: string;
  prompt: string;
  metadata?: {
    aspect_ratio?: string;
    [key: string]: unknown;
  };
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
  const isAdmin = isAdminUser(user?.id);
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

  // Credits and upgrade modal state
  const [credits, setCredits] = useState<number>(0);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Load credits on mount
  useEffect(() => {
    if (!user) return;
    const loadCredits = async () => {
      try {
        const userCredits = await getUserCredits();
        setCredits(userCredits);
      } catch (error) {
        console.error('Failed to load credits:', error);
      }
    };
    loadCredits();
  }, [user]);

  // Subscribe to real-time credit updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('studio_credits_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_credits',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: { new: { credits: number } }) => {
          setCredits(payload.new.credits);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

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
  const [editSourceVersionIndex, setEditSourceVersionIndex] = useState<number | null>(null); // Which version to edit FROM (null = current/latest)
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

  // Product selection state
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Available styles for thumbnail selection
  const [availableStyles, setAvailableStyles] = useState<Style[]>([]);
  const [, setLoadingStyles] = useState(false);
  
  // Smart presets state
  const [smartPresets, setSmartPresets] = useState<SmartPreset[]>([]);
  const [loadingPresets, setLoadingPresets] = useState(false);
  const [showPresetsModal, setShowPresetsModal] = useState(false);
  
  // Variations mode - generate 3 variations instead of 1
  const [variationsMode, setVariationsMode] = useState(true); // ON by default
  const [comparing, setComparing] = useState(false);
  const [savingComparison, setSavingComparison] = useState<Set<string>>(new Set());
  const [savedVersions, setSavedVersions] = useState<Set<string>>(new Set()); // Track saved variations
  // Debug info type for generation diagnostics
  type GenerationDebugInfo = {
    brand_logos?: { primary?: string; icon?: string } | null;
    brand_all_logos_count?: number;
    logo_url_used?: string | null;
    logo_fetched?: boolean;
    logo_size_kb?: number | null;
    assets_count?: number;
    assets_attached?: string[];
    references_count?: number;
    product_name?: string | null;
  };

  const [comparisonResults, setComparisonResults] = useState<{
    v1: { image_base64: string; design_type?: string; gpt_prompt_info?: GPTPromptInfo; debug?: GenerationDebugInfo } | null | 'loading';
    v2: { image_base64: string; design_type?: string; gpt_prompt_info?: GPTPromptInfo; debug?: GenerationDebugInfo } | null | 'loading';
    v3: { image_base64: string; prompt_used?: string; debug?: GenerationDebugInfo } | null | 'loading';
  } | null>(null);
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const [comparisonPrompt, setComparisonPrompt] = useState(''); // Store prompt used for comparison (before it gets cleared)

  // Variation viewer modal state (for viewing saved variation groups from gallery)
  const [viewingVariationGroup, setViewingVariationGroup] = useState<string | null>(null);

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

  // Group images by variation_group_id for visual stacking in the gallery
  type ImageGroup = {
    groupId: string | null;
    images: GeneratedImage[];
    newestCreatedAt: string;
  };

  const groupedImages = useMemo((): ImageGroup[] => {
    const groups = new Map<string | null, GeneratedImage[]>();

    // Group images by variation_group_id
    for (const image of images) {
      const groupId = image.metadata?.variation_group_id || null;
      if (!groups.has(groupId)) {
        groups.set(groupId, []);
      }
      groups.get(groupId)!.push(image);
    }

    // Convert to array and sort each group by variation_index
    const result: ImageGroup[] = [];
    for (const [groupId, groupImages] of groups) {
      // Sort by variation_index within group, fallback to created_at
      groupImages.sort((a, b) => {
        const indexA = a.metadata?.variation_index ?? 999;
        const indexB = b.metadata?.variation_index ?? 999;
        if (indexA !== indexB) return indexA - indexB;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      result.push({
        groupId,
        images: groupImages,
        newestCreatedAt: groupImages[0]?.created_at || '',
      });
    }

    // Sort groups by newest image in each group
    result.sort((a, b) =>
      new Date(b.newestCreatedAt).getTime() - new Date(a.newestCreatedAt).getTime()
    );

    return result;
  }, [images]);

  // Get images for the variation viewer modal
  const viewingVariationImages = useMemo(() => {
    if (!viewingVariationGroup) return [];
    return images
      .filter(img => img.metadata?.variation_group_id === viewingVariationGroup)
      .sort((a, b) => (a.metadata?.variation_index ?? 0) - (b.metadata?.variation_index ?? 0));
  }, [images, viewingVariationGroup]);

  // Close variation viewer modal if all images in group are deleted
  useEffect(() => {
    if (viewingVariationGroup && viewingVariationImages.length === 0) {
      setViewingVariationGroup(null);
    }
  }, [viewingVariationGroup, viewingVariationImages.length]);

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

      // Track image deletion
      track('image_deleted', { image_id: imageId });

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

  const handlePresetClick = (preset: SmartPreset) => {
    // Set the prompt and aspect ratio, let user edit and click Create
    setPrompt(preset.prompt);
    setSelectedAspectRatio(preset.aspectRatio);
    setSelectedPlatform(null); // Clear platform when preset is selected
    setInputFocused(true); // Focus the input so user can edit
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;

    setGenerating(true);
    const startTime = Date.now();

    // Track generation started
    track('generation_started', {
      brand_id: brand.id,
      prompt_length: prompt.length,
      aspect_ratio: selectedAspectRatio,
      platform: selectedPlatform || 'none',
      has_style: selectedStyles.length > 0,
      has_product: !!selectedProduct,
    });

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
      setSelectedProduct(null);

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

      // Use V1 endpoint for single generation
      const endpoint = 'generate-image';

      const authHeaders = await getAuthHeaders();
      const response = await resilientFetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${endpoint}`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            prompt,
            brandId: brand.id,
            imageId: imageRecord.id,
            aspectRatio: selectedAspectRatio === 'auto' ? undefined : selectedAspectRatio,
            productId: selectedProduct?.id,
            assets: selectedAssets.map(a => ({
              id: a.id,
              url: a.url,
              name: a.name,
              category: a.category,
              role: 'must_include',
            })),
            references: allReferences,
          }),
          retries: 1,
          timeout: 120000, // 2 minutes for image generation
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        // Handle credit errors specifically
        if (response.status === 402) {
          track('insufficient_credits', {
            brand_id: brand.id,
            credits_needed: 1,
          });
          setCredits(errorData.credits || 0);
          setShowUpgradeModal(true);
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

      // Refresh credits to reflect the deduction
      const updatedCredits = await getUserCredits();
      setCredits(updatedCredits);

      // Track generation completed
      track('generation_completed', {
        brand_id: brand.id,
        image_id: imageRecord.id,
        duration_ms: Date.now() - startTime,
        credits_used: 1,
      });

    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to generate image', errorObj, {
        brand_id: brand.id,
        prompt_preview: prompt.substring(0, 100),
      });

      // Track generation failed
      track('generation_failed', {
        brand_id: brand.id,
        error_type: errorObj.message,
      });

      toast.error('Generation Failed', sanitizeErrorMessage(errorObj));
    } finally {
      setGenerating(false);
    }
  };

  // Helper to save a variation image to the database
  const saveVariationImage = async (
    imageBase64: string,
    variationIndex: number,
    variationGroupId: string,
    promptText: string,
    aspectRatio: AspectRatio,
    extraMetadata?: Record<string, unknown>
  ): Promise<GeneratedImage | null> => {
    if (!user?.id) return null;

    try {
      // Create image record in database
      const { data: imageRecord, error: insertError } = await supabase
        .from('images')
        .insert({
          user_id: user.id,
          brand_id: brand.id,
          template_id: null,
          prompt: promptText,
          status: 'generating',
          metadata: {
            aspect_ratio: aspectRatio === 'auto' ? undefined : aspectRatio,
            variation_group_id: variationGroupId,
            variation_index: variationIndex,
            ...extraMetadata,
          },
          conversation: [],
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Upload base64 image to storage
      const binaryString = atob(imageBase64);
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
      const { data: updatedRecord, error: updateError } = await supabase
        .from('images')
        .update({
          image_url: urlData.publicUrl,
          status: 'ready',
          updated_at: new Date().toISOString(),
        })
        .eq('id', imageRecord.id)
        .select()
        .single();

      if (updateError) throw updateError;

      return updatedRecord as GeneratedImage;
    } catch (error) {
      console.error('Failed to save variation image:', error);
      return null;
    }
  };

  // Comparison mode: generate with v1, v2, and v3 to compare outputs (auto-saves all variations)
  const handleCompare = async () => {
    if (!prompt.trim() || comparing) return;

    setComparing(true);
    const currentPrompt = prompt; // Store before it gets cleared
    const currentAspectRatio = selectedAspectRatio; // Store before it gets cleared
    const variationGroupId = crypto.randomUUID(); // Group ID for all 3 variations
    setComparisonPrompt(currentPrompt);
    // Show modal immediately with single loading state (progressive loading)
    setComparisonResults({ v1: 'loading', v2: null, v3: null });
    setShowComparisonModal(true);
    setSavedVersions(new Set());

    try {
      const authHeaders = await getAuthHeaders();

      // Step 1: Create a session that deducts credits once upfront
      // This prevents race conditions with parallel requests
      const sessionResponse = await resilientFetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/start-variations-session`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ creditCost: 2, maxGenerations: 3 }),
          retries: 2,
          timeout: 30000,
        }
      );

      if (!sessionResponse.ok) {
        const sessionError = await sessionResponse.json();
        // Handle insufficient credits specifically
        if (sessionResponse.status === 402) {
          track('insufficient_credits', {
            brand_id: brand.id,
            credits_needed: 2,
          });
          setCredits(sessionError.credits || 0);
          setShowComparisonModal(false);
          setComparisonResults(null);
          setShowUpgradeModal(true);
          return;
        }
        throw new Error(sessionError.error || 'Failed to start variations session');
      }

      const { sessionId, remainingCredits } = await sessionResponse.json();

      // Update credits immediately from session response
      if (typeof remainingCredits === 'number') {
        setCredits(remainingCredits);
      }

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
        productId: selectedProduct?.id,
        assets: selectedAssets.map(a => ({
          id: a.id,
          url: a.url,
          name: a.name,
          category: a.category,
          role: 'must_include',
        })),
        references: allReferences,
        sessionId, // All requests use the same session (credits already deducted)
      };

      // Step 2: Generate with 3 versions in parallel, auto-saving each as it completes
      // Using resilientFetch with retries for network resilience on mobile
      const savedImages: (GeneratedImage | null)[] = [null, null, null];

      const v1Promise = resilientFetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(requestBody),
        retries: 1,
        timeout: 120000, // 2 minutes for image generation
      }).then(async (res) => {
        const data = await res.json();
        if (data.debug) console.log('V1 Debug:', JSON.stringify(data.debug, null, 2));
        if (res.ok && data.image_base64) {
          // Auto-save to database
          const saved = await saveVariationImage(
            data.image_base64,
            0,
            variationGroupId,
            currentPrompt,
            currentAspectRatio,
            { gpt_prompt_info: data.gpt_prompt_info }
          );
          savedImages[0] = saved;
          setSavedVersions(prev => new Set(prev).add('v1'));
        }
        setComparisonResults(prev => prev ? {
          ...prev,
          v1: res.ok ? { image_base64: data.image_base64, gpt_prompt_info: data.gpt_prompt_info, debug: data.debug } : null,
          v2: prev.v2 === null ? 'loading' : prev.v2,
          v3: prev.v3 === null ? 'loading' : prev.v3,
        } : null);
      });

      const v2Promise = resilientFetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image-v2`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(requestBody),
        retries: 1,
        timeout: 120000,
      }).then(async (res) => {
        const data = await res.json();
        if (data.debug) console.log('V2 Debug:', JSON.stringify(data.debug, null, 2));
        if (res.ok && data.image_base64) {
          // Auto-save to database
          const saved = await saveVariationImage(
            data.image_base64,
            1,
            variationGroupId,
            currentPrompt,
            currentAspectRatio,
            { design_type: data.design_type, gpt_prompt_info: data.gpt_prompt_info || data.gpt_concept }
          );
          savedImages[1] = saved;
          setSavedVersions(prev => new Set(prev).add('v2'));
        }
        setComparisonResults(prev => prev ? {
          ...prev,
          v1: prev.v1 === null ? 'loading' : prev.v1,
          v2: res.ok ? { image_base64: data.image_base64, design_type: data.design_type, gpt_prompt_info: data.gpt_prompt_info || data.gpt_concept, debug: data.debug } : null,
          v3: prev.v3 === null ? 'loading' : prev.v3,
        } : null);
      });

      const v3Promise = resilientFetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image-v3`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(requestBody),
        retries: 1,
        timeout: 120000,
      }).then(async (res) => {
        const data = await res.json();
        if (data.debug) console.log('V3 Debug:', JSON.stringify(data.debug, null, 2));
        if (res.ok && data.image_base64) {
          // Auto-save to database
          const saved = await saveVariationImage(
            data.image_base64,
            2,
            variationGroupId,
            currentPrompt,
            currentAspectRatio,
            { prompt_used: data.prompt_used }
          );
          savedImages[2] = saved;
          setSavedVersions(prev => new Set(prev).add('v3'));
        }
        setComparisonResults(prev => prev ? {
          ...prev,
          v1: prev.v1 === null ? 'loading' : prev.v1,
          v2: prev.v2 === null ? 'loading' : prev.v2,
          v3: res.ok ? { image_base64: data.image_base64, prompt_used: data.prompt_used, debug: data.debug } : null,
        } : null);
      });

      // Wait for all to complete
      await Promise.all([v1Promise, v2Promise, v3Promise]);

      // Refresh gallery to show new images
      await loadImages();

      // Show success toast
      const savedCount = savedImages.filter(Boolean).length;
      if (savedCount > 0) {
        toast.success('Variations Saved', `${savedCount} variation${savedCount > 1 ? 's' : ''} saved to your gallery`);
      }

      // Clear selections after successful comparison
      setPrompt('');
      localStorage.removeItem(STORAGE_KEY);
      setInputFocused(false);
      setSelectedAssets([]);
      setSelectedReferences([]);
      setSelectedStyles([]);
      setSelectedPlatform(null);
      setSelectedProduct(null);

    } catch (error) {
      console.error('Comparison failed:', error);
      toast.error('Generation Failed', sanitizeErrorMessage(error));
      // Close modal and clear loading state on error
      setShowComparisonModal(false);
      setComparisonResults(null);
    } finally {
      setComparing(false);
    }
  };

  // Save a comparison result image to the database and storage
  const handleSaveComparisonImage = async (version: 'v1' | 'v2' | 'v3') => {
    if (!comparisonResults || savingComparison.has(version) || savedVersions.has(version)) return;

    const result = comparisonResults[version];
    if (!result || result === 'loading') {
      toast.warning('No Image', `No image available for ${version.toUpperCase()}`);
      return;
    }

    setSavingComparison(prev => new Set(prev).add(version));

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
          prompt: comparisonPrompt, // Use stored comparison prompt (before it was cleared)
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

      // Mark this version as saved (don't close modal - let user save multiple)
      setSavedVersions(prev => new Set(prev).add(version));

    } catch (error) {
      console.error('Failed to save comparison image:', error);
      toast.error('Save Failed', sanitizeErrorMessage(error));
    } finally {
      setSavingComparison(prev => {
        const next = new Set(prev);
        next.delete(version);
        return next;
      });
    }
  };

  // Edit a comparison result - save first if needed, then open edit modal
  const handleEditComparisonImage = async (version: 'v1' | 'v2' | 'v3') => {
    if (!comparisonResults) return;

    const result = comparisonResults[version];
    if (!result || result === 'loading') {
      toast.warning('No Image', `No image available for ${version.toUpperCase()}`);
      return;
    }

    // Save first if not already saved
    if (!savedVersions.has(version)) {
      await handleSaveComparisonImage(version);
    }

    // Map version to variation_index (auto-save uses variation_index, manual save uses prompt_version)
    const variationIndex = version === 'v1' ? 0 : version === 'v2' ? 1 : 2;

    // Find the saved image - try variation_index first (auto-saved), then prompt_version (manually saved)
    let { data: foundImages } = await supabase
      .from('images')
      .select('*')
      .eq('brand_id', brand.id)
      .eq('metadata->>variation_index', variationIndex.toString())
      .order('created_at', { ascending: false })
      .limit(1);

    // Fallback to prompt_version query for manually saved images
    if (!foundImages || foundImages.length === 0) {
      const { data: fallbackImages } = await supabase
        .from('images')
        .select('*')
        .eq('brand_id', brand.id)
        .eq('metadata->>prompt_version', version)
        .order('created_at', { ascending: false })
        .limit(1);
      foundImages = fallbackImages;
    }

    if (foundImages && foundImages.length > 0) {
      setSelectedImage(foundImages[0] as GeneratedImage);
      setShowComparisonModal(false);
    } else {
      toast.error('Error', 'Could not find saved image for editing');
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

    try {
      const authHeaders = await getAuthHeaders();
      const response = await resilientFetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/edit-image`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            prompt,
            brandId: brand.id,
            imageId: editingImage.id,
            previousImageUrl: editingImage.image_url,
            aspectRatio: editingImage.metadata?.aspect_ratio,
            productId: selectedProduct?.id,
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
          retries: 1,
          timeout: 120000,
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
      setSelectedProduct(null);
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
      isEditing: modalEditing,
      editSourceVersionIndex,
    });

    if (!modalEditPrompt.trim() || !selectedImage || modalEditing) {
      console.log('Early return from handleModalEdit');
      return;
    }

    if (selectedImage.edit_count >= selectedImage.max_edits) {
      toast.warning('Edit Limit Reached', `You've reached the maximum of ${selectedImage.max_edits} edits for this image.`);
      return;
    }

    // Determine which version to edit from
    const versions = getAllVersions(selectedImage);
    const sourceVersionIdx = editSourceVersionIndex ?? (versions.length - 1);
    const sourceVersion = versions[sourceVersionIdx];
    const previousImageUrl = sourceVersion?.image_url || selectedImage.image_url;

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
      console.log('Making API call...', { previousImageUrl, sourceVersionIdx });

      // Make the API call - this blocks until the image is generated
      const authHeaders = await getAuthHeaders();
      const response = await resilientFetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/edit-image`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            prompt: editPromptText,
            brandId: brand.id,
            imageId: imageId,
            previousImageUrl: previousImageUrl,
            aspectRatio: originalImage.metadata?.aspect_ratio,
            productId: selectedProduct?.id,
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
          retries: 1,
          timeout: 120000,
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

      // Show the latest version and reset edit source
      const versions = getAllVersions(updatedImage);
      setCurrentVersionIndex(Math.max(0, versions.length - 1));
      setEditSourceVersionIndex(null); // Reset to edit from latest

      // Update the gallery in the background
      loadImages().catch(console.error);

      // Clear selections after successful edit
      setSelectedAssets([]);
      setSelectedReferences([]);
      setSelectedStyles([]);
      setSelectedPlatform(null);
      setSelectedProduct(null);

    } catch (error) {
      console.error('Failed to edit:', error);
      // Revert to original image on error
      setSelectedImage(originalImage);
      setModalEditPrompt(editPromptText);
      setSelectedAssets([]);
      setSelectedReferences([]);
      setSelectedStyles([]);
      setSelectedPlatform(null);
      setSelectedProduct(null);
    } finally {
      setModalEditing(false);
    }
  };

  const handleDownload = useCallback(async (
    image: GeneratedImage,
    options?: { event?: React.MouseEvent; url?: string }
  ) => {
    options?.event?.stopPropagation();
    const urlToDownload = options?.url || image.image_url;
    if (!urlToDownload) return;

    // Track image download
    track('image_downloaded', {
      image_id: image.id,
      format: 'png',
    });

    try {
      // Extract the file path from the Supabase Storage URL
      // Supabase Storage URLs are like: https://[project].supabase.co/storage/v1/object/public/brand-images/[path]
      const urlParts = urlToDownload.split('/brand-images/');
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
          const response = await fetch(urlToDownload);
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
        const response = await fetch(urlToDownload);
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
      metadata: image.metadata,
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
      setEditSourceVersionIndex(null); // Reset edit source to latest
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
      setEditSourceVersionIndex(null);
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

  // Handle Escape key to close variations modal
  useEffect(() => {
    if (!showComparisonModal) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowComparisonModal(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showComparisonModal]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-50 via-neutral-50 to-zinc-50">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-600" />
      </div>
    );
  }

  return (
    <div className={`${images.length === 0 ? 'h-[calc(100vh-4rem)] overflow-hidden' : 'min-h-screen'} bg-neutral-50`}>
      {/* Main Content */}
      <div className={`${images.length === 0 ? 'pt-12 sm:pt-16 pb-2' : 'pt-8 sm:pt-10 md:pt-12 pb-32 sm:pb-40'}`}>
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
                    {/* Low Credit Warning Banner */}
                    {credits <= 2 && (
                      <div
                        className="mb-3 flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100 transition-colors"
                        onClick={() => {
                          track('low_credit_warning_clicked', { current_credits: credits });
                          setShowUpgradeModal(true);
                        }}
                      >
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span className="text-sm text-amber-800">
                          <span className="font-medium">{credits} credit{credits !== 1 ? 's' : ''} left.</span>
                          {' '}Upgrade to keep creating.
                        </span>
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
                            // Only blur if there's no text, no product, no styles, and there are images
                            if (!prompt.trim() && !selectedProduct && selectedStyles.length === 0 && images.length > 0) {
                              setInputFocused(false);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              editingImage ? handleEdit() : (variationsMode ? handleCompare() : handleGenerate());
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
                        {prompt.trim() && (
                          <Button
                            size="sm"
                            onClick={editingImage ? handleEdit : (variationsMode ? handleCompare : handleGenerate)}
                            disabled={(generating || editing || comparing) || !prompt.trim()}
                            loading={generating || editing || comparing}
                          >
                            <span className="sm:hidden">
                              {editingImage ? 'Apply' : 'Go'}
                            </span>
                            <span className="hidden sm:inline">
                              {editingImage ? 'Apply' : 'Create'}
                            </span>
                          </Button>
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
                                <div className="absolute top-full left-0 mt-2 w-64 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl border border-neutral-200 py-1 z-50 max-h-80 overflow-y-auto">
                                  {/* Auto Option */}
                                  <div className="px-3 py-2">
                                    <button
                                      onClick={() => {
                                        setSelectedAspectRatio('auto');
                                        setSelectedPlatform(null);
                                        setShowRatioDropdown(false);
                                      }}
                                      className="w-full px-2 py-2.5 sm:py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center justify-between rounded"
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
                                              onMouseDown={(e) => e.stopPropagation()}
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
                                                      onMouseDown={(e) => e.stopPropagation()}
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedPlatform(fullName);
                                                        setSelectedAspectRatio(size.ratio);
                                                        setShowRatioDropdown(false);
                                                        track('platform_selected', {
                                                          platform: fullName,
                                                          aspect_ratio: size.ratio
                                                        });
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
                                            className="w-full px-2 py-2.5 sm:py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center justify-between rounded"
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
                                            className="w-full px-2 py-2.5 sm:py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center justify-between rounded"
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

                          {/* Product Button - Opens product picker */}
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                            }}
                            onClick={() => {
                              setShowProductPicker(true);
                              inputRef.current?.focus();
                            }}
                            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-medium transition-all rounded-lg border relative ${
                              selectedProduct
                                ? 'text-violet-700 bg-violet-50 border-violet-200 hover:border-violet-300'
                                : 'text-neutral-700 hover:text-neutral-900 hover:bg-neutral-50 border-neutral-200 hover:border-neutral-300'
                            }`}
                            title={selectedProduct ? `Product: ${selectedProduct.name}` : "Select product"}
                          >
                            <Package className="w-4 h-4 sm:w-4 sm:h-4" />
                            <span>{selectedProduct ? selectedProduct.name.slice(0, 15) + (selectedProduct.name.length > 15 ? '...' : '') : 'Product'}</span>
                            {selectedProduct && (
                              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-xs flex items-center justify-center font-semibold bg-violet-500 text-white">
                                <Check className="w-3 h-3" />
                              </span>
                            )}
                          </button>

                          {/* Spacer to push submit button to right if needed, or keep it here */}
                          <div className="flex-1" />
                        </div>
                      )}

                      {/* Variations Toggle - Above style selection */}
                      {(inputFocused || prompt.trim()) && !editingImage && (
                        <div className="pt-3 pb-1" onMouseDown={(e) => { e.preventDefault(); }}>
                          <button
                            type="button"
                            onClick={() => {
                              setVariationsMode(!variationsMode);
                              inputRef.current?.focus();
                            }}
                            className="flex items-center gap-3 w-full group"
                          >
                            {/* Toggle Switch */}
                            <div className={`relative w-11 h-6 rounded-full transition-colors ${variationsMode ? 'bg-violet-500' : 'bg-neutral-200'}`}>
                              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${variationsMode ? 'translate-x-6' : 'translate-x-1'}`} />
                            </div>
                            <span className={`text-sm font-medium transition-colors ${variationsMode ? 'text-violet-700' : 'text-neutral-600'}`}>
                              Generate 3 variations for 2 credits
                            </span>
                          </button>
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
                            <span>Quick Style Selection <span className="text-gray-400 font-normal">(optional)</span></span>
                            {selectedStyles.length > 0 && (
                              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-brand-primary text-white">
                                {selectedStyles.length} selected
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2 overflow-hidden relative">
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
                            <span className="text-white text-sm font-medium drop-shadow-lg">Click to browse all styles</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Smart Presets Section */}
                <div className="mt-8">
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {smartPresets.slice(0, 3).map((preset) => {
                        const { tag, IconComponent } = getPresetIconAndTag(preset.category, preset.label);
                        return (
                          <div
                            key={preset.id}
                            onClick={() => handlePresetClick(preset)}
                            className="group bg-white rounded-xl p-3 border border-neutral-200 hover:border-neutral-300 hover:shadow-sm transition-all cursor-pointer flex items-start gap-3"
                          >
                            {/* Icon */}
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-brand-primary/[0.08] text-brand-primary shrink-0">
                              <IconComponent className="w-5 h-5 text-brand-primary" />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[11px] sm:text-[10px] font-medium text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded shrink-0">
                                  {tag}
                                </span>
                              </div>
                              <p className="text-sm text-neutral-700 leading-relaxed">
                                {preset.prompt}
                              </p>
                            </div>
                          </div>
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
                {groupedImages.map((group) => {
                  const isVariationGroup = group.groupId && group.images.length > 1;
                  const primaryImage = group.images[0];

                  if (isVariationGroup) {
                    // Render stacked variation card
                    return (
                      <div
                        key={group.groupId}
                        onClick={() => setViewingVariationGroup(group.groupId)}
                        className="group relative cursor-pointer"
                      >
                        {/* Stacked layers effect */}
                        <div className="absolute inset-0 bg-white/50 rounded-2xl border border-neutral-200/30 transform translate-x-2 translate-y-2" />
                        <div className="absolute inset-0 bg-white/70 rounded-2xl border border-neutral-200/40 transform translate-x-1 translate-y-1" />

                        {/* Main card */}
                        <div className="relative bg-white/90 backdrop-blur-sm rounded-2xl overflow-hidden hover:shadow-xl transition-all duration-300 border border-neutral-200/50">
                          <div className="aspect-square bg-neutral-50 relative overflow-hidden flex items-center justify-center">
                            {primaryImage.image_url ? (
                              <img
                                src={primaryImage.image_url}
                                alt="Generated"
                                className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
                              />
                            ) : primaryImage.status === 'generating' ? (
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

                            {/* Variations badge */}
                            <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-violet-500 text-white text-xs font-medium flex items-center gap-1 shadow-lg">
                              <Layers className="w-3 h-3" />
                              {group.images.length} variations
                            </div>

                            {/* Hover overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="absolute bottom-0 left-0 right-0 p-3 space-y-2">
                                <p className="text-xs text-white line-clamp-2 drop-shadow-lg">
                                  {primaryImage.prompt.length > 100 ? primaryImage.prompt.slice(0, 100) + '...' : primaryImage.prompt}
                                </p>
                                <div className="flex items-center justify-center">
                                  <span className="px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-lg text-xs font-medium text-neutral-700">
                                    Click to view all {group.images.length} variations
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Render single image card (no group or single image in group)
                  const image = primaryImage;
                  return (
                    <div
                      key={image.id}
                      onClick={() => {
                        setSelectedImage(image);
                      }}
                      className="group relative bg-white/70 backdrop-blur-sm rounded-2xl overflow-hidden cursor-pointer hover:bg-white hover:shadow-xl transition-all duration-300 border border-neutral-200/50"
                    >
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
                          <div className="absolute bottom-0 left-0 right-0 p-3 space-y-2">
                            <p className="text-xs text-white line-clamp-2 drop-shadow-lg">
                              {image.prompt.length > 100 ? image.prompt.slice(0, 100) + '...' : image.prompt}
                            </p>

                            <div className="flex items-center justify-between">
                              <button
                                onClick={(e) => startEditing(image, e)}
                                className="flex items-center gap-1.5 px-4 py-2 sm:px-3 sm:py-1.5 bg-white/90 backdrop-blur-sm rounded-lg text-sm sm:text-xs font-medium text-neutral-700 hover:bg-white transition-colors"
                              >
                                <Edit3 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                                Edit
                              </button>
                              <div className="flex items-center gap-3 sm:gap-2">
                                <button
                                  onClick={(e) => handleDownload(image, { event: e })}
                                  className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-white/90 backdrop-blur-sm flex items-center justify-center text-neutral-700 hover:bg-white transition-colors"
                                >
                                  <Download className="w-5 h-5 sm:w-4 sm:h-4" />
                                </button>
                                <button
                                  onClick={(e) => handleDeleteClick(image.id, e)}
                                  disabled={deleting === image.id}
                                  className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-white/90 backdrop-blur-sm flex items-center justify-center text-neutral-700 hover:bg-red-50 hover:text-red-600 transition-colors"
                                >
                                  {deleting === image.id ? (
                                    <Loader2 className="w-5 h-5 sm:w-4 sm:h-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-5 h-5 sm:w-4 sm:h-4" />
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
                  );
                })}
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
                <p className="text-sm sm:text-xs font-medium text-neutral-700">Editing image</p>
                <p className="text-sm sm:text-xs text-neutral-500 truncate">{editingImage.prompt}</p>
              </div>
              <button
                onClick={cancelEditing}
                className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-500 hover:text-neutral-700 transition-colors shrink-0"
              >
                <X className="w-5 h-5 sm:w-4 sm:h-4" />
              </button>
            </div>
          )}

          {/* Low Credit Warning Banner */}
          {credits <= 2 && (
            <div
              className="mb-3 flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100 transition-colors"
              onClick={() => {
                track('low_credit_warning_clicked', { current_credits: credits });
                setShowUpgradeModal(true);
              }}
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-sm text-amber-800">
                <span className="font-medium">{credits} credit{credits !== 1 ? 's' : ''} left.</span>
                {' '}Upgrade to keep creating.
              </span>
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
                    // Only blur if there's no text, no product, no styles
                    if (!prompt.trim() && !selectedProduct && selectedStyles.length === 0) {
                      setInputFocused(false);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      editingImage ? handleEdit() : (variationsMode ? handleCompare() : handleGenerate());
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
                {prompt.trim() && (
                  <Button
                    size="sm"
                    onClick={editingImage ? handleEdit : (variationsMode ? handleCompare : handleGenerate)}
                    disabled={(generating || editing || comparing) || !prompt.trim()}
                    loading={generating || editing || comparing}
                  >
                    <span className="sm:hidden">
                      {editingImage ? 'Apply' : 'Go'}
                    </span>
                    <span className="hidden sm:inline">
                      {editingImage ? 'Apply' : 'Create'}
                    </span>
                  </Button>
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
                        <div className="absolute top-full left-0 mt-2 w-64 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl border border-neutral-200 py-1 z-50 max-h-80 overflow-y-auto">
                          {/* Auto Option */}
                          <div className="px-3 py-2">
                            <button
                              onClick={() => {
                                setSelectedAspectRatio('auto');
                                setSelectedPlatform(null);
                                setShowRatioDropdown(false);
                              }}
                              className="w-full px-2 py-2.5 sm:py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center justify-between rounded"
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
                                      onMouseDown={(e) => e.stopPropagation()}
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
                                              onMouseDown={(e) => e.stopPropagation()}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedPlatform(fullName);
                                                setSelectedAspectRatio(size.ratio);
                                                setShowRatioDropdown(false);
                                                track('platform_selected', {
                                                  platform: fullName,
                                                  aspect_ratio: size.ratio
                                                });
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
                                    className="w-full px-2 py-2.5 sm:py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center justify-between rounded"
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
                                    className="w-full px-2 py-2.5 sm:py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center justify-between rounded"
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

                  {/* Product Button - Opens product picker */}
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                    }}
                    onClick={() => {
                      setShowProductPicker(true);
                      inputRef.current?.focus();
                    }}
                    className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-medium transition-all rounded-lg border relative ${
                      selectedProduct
                        ? 'text-violet-700 bg-violet-50 border-violet-200 hover:border-violet-300'
                        : 'text-neutral-700 hover:text-neutral-900 hover:bg-neutral-50 border-neutral-200 hover:border-neutral-300'
                    }`}
                    title={selectedProduct ? `Product: ${selectedProduct.name}` : "Select product"}
                  >
                    <Package className="w-4 h-4 sm:w-4 sm:h-4" />
                    <span>{selectedProduct ? selectedProduct.name.slice(0, 15) + (selectedProduct.name.length > 15 ? '...' : '') : 'Product'}</span>
                    {selectedProduct && (
                      <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-xs flex items-center justify-center font-semibold bg-violet-500 text-white">
                        <Check className="w-3 h-3" />
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

              {/* Variations Toggle - Above style selection */}
              {(inputFocused || prompt.trim()) && !editingImage && images.length > 0 && (
                <div className="pt-3 pb-1" onMouseDown={(e) => { e.preventDefault(); }}>
                  <button
                    type="button"
                    onClick={() => {
                      setVariationsMode(!variationsMode);
                      inputRef.current?.focus();
                    }}
                    className="flex items-center gap-3 w-full group"
                  >
                    {/* Toggle Switch */}
                    <div className={`relative w-11 h-6 rounded-full transition-colors ${variationsMode ? 'bg-violet-500' : 'bg-neutral-200'}`}>
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${variationsMode ? 'translate-x-6' : 'translate-x-1'}`} />
                    </div>
                    <span className={`text-sm font-medium transition-colors ${variationsMode ? 'text-violet-700' : 'text-neutral-600'}`}>
                      Generate 3 variations for 2 credits
                    </span>
                  </button>
                </div>
              )}

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
                    <span>Quick Style Selection <span className="text-gray-400 font-normal">(optional)</span></span>
                    {selectedStyles.length > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-brand-primary text-white">
                        {selectedStyles.length} selected
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 overflow-hidden relative">
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
                    <span className="text-white text-sm font-medium drop-shadow-lg">Click to browse all styles</span>
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
          <div className="absolute inset-0 bg-black/60" data-backdrop="true" />

          {/* Modal Content */}
          <div
            className="relative bg-white rounded-xl max-w-5xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col md:flex-row border border-neutral-200 shadow-lg"
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
              className="absolute top-3 right-3 z-10 w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-white border border-neutral-200 flex items-center justify-center text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="w-5 h-5 sm:w-4 sm:h-4" />
            </button>

            {/* Image Panel */}
            <div className="flex-1 bg-neutral-50 flex items-center justify-center p-6 md:p-8 relative">
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
                          className="max-w-full max-h-[60vh] md:max-h-[70vh] rounded-lg object-contain"
                        />
                        {(modalEditing || selectedImage.status === 'generating') && (
                          <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center z-10">
                            <div className="text-center text-white">
                              <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3" />
                              <p className="text-sm font-medium">
                                {selectedImage.status === 'generating' ? 'Creating your image...' : 'Applying your edits...'}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : selectedImage.status === 'generating' ? (
                      <div className="text-center">
                        <Loader2 className="w-10 h-10 animate-spin text-neutral-400 mx-auto mb-3" />
                        <p className="text-sm text-neutral-600">Creating your image...</p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <Sparkles className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
                        <p className="text-sm text-neutral-500">Image not available</p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Info Panel */}
            <div className="w-full md:w-80 lg:w-96 flex flex-col max-h-[50vh] md:max-h-none overflow-y-auto bg-white">
              {/* Content */}
              <div className="flex-1 p-5 pr-12">
                {/* Prompt */}
                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-neutral-900">Prompt</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedImage.prompt);
                      }}
                      className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
                      title="Copy prompt"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-sm text-neutral-600 leading-relaxed">
                    {selectedImage.prompt}
                  </p>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-3 text-xs text-neutral-400 mb-5">
                  <span className="tabular-nums">{formatDate(selectedImage.created_at)}</span>
                  {selectedImage.edit_count > 0 && (
                    <>
                      <span>·</span>
                      <span>{selectedImage.edit_count} edit{selectedImage.edit_count !== 1 ? 's' : ''}</span>
                    </>
                  )}
                </div>

                {/* Version History with Thumbnails */}
                {(() => {
                  const versions = getAllVersions(selectedImage);
                  const canNavigateLeft = currentVersionIndex > 0;
                  const canNavigateRight = currentVersionIndex < versions.length - 1;
                  const currentVersion = versions[currentVersionIndex] || versions[versions.length - 1] || null;
                  const effectiveEditSourceIndex = editSourceVersionIndex ?? (versions.length - 1);

                  return versions.length > 1 ? (
                    <div className="mb-5">
                      {/* Version header with navigation */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs text-neutral-500">Version {currentVersionIndex + 1} of {versions.length}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => navigateVersion(-1, versions.length)}
                            disabled={!canNavigateLeft}
                            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                              canNavigateLeft
                                ? 'text-neutral-600 hover:bg-neutral-100'
                                : 'text-neutral-300 cursor-not-allowed'
                            }`}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => navigateVersion(1, versions.length)}
                            disabled={!canNavigateRight}
                            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                              canNavigateRight
                                ? 'text-neutral-600 hover:bg-neutral-100'
                                : 'text-neutral-300 cursor-not-allowed'
                            }`}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Version Thumbnail Strip */}
                      <div className="mb-3">
                        <p className="text-[11px] text-neutral-400 mb-2">Click to view, double-click to edit from version</p>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {versions.map((version, idx) => {
                            const isViewing = idx === currentVersionIndex;
                            const isEditSource = idx === effectiveEditSourceIndex;
                            return (
                              <button
                                key={idx}
                                onClick={() => setCurrentVersionIndex(idx)}
                                onDoubleClick={() => {
                                  setEditSourceVersionIndex(idx);
                                  setShowModalEditPrompt(true);
                                }}
                                className={`relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                                  isViewing
                                    ? 'border-neutral-900 ring-2 ring-neutral-900/20'
                                    : 'border-neutral-200 hover:border-neutral-300'
                                }`}
                                title={`Version ${idx + 1}${version.edit_prompt ? `: ${version.edit_prompt}` : ''}`}
                              >
                                <img
                                  src={version.image_url}
                                  alt={`Version ${idx + 1}`}
                                  className="w-full h-full object-cover"
                                />
                                {/* Version number badge */}
                                <span className={`absolute bottom-0.5 right-0.5 text-[9px] font-medium px-1 rounded ${
                                  isViewing
                                    ? 'bg-neutral-900 text-white'
                                    : 'bg-black/50 text-white'
                                }`}>
                                  {idx + 1}
                                </span>
                                {/* Edit source indicator - only show if NOT the latest version */}
                                {isEditSource && idx < versions.length - 1 && (
                                  <span className="absolute top-0.5 left-0.5 text-[8px] font-medium px-1 rounded bg-violet-500 text-white">
                                    Edit
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Edit from this version button (when viewing a different version than edit source) */}
                      {currentVersionIndex !== effectiveEditSourceIndex && (
                        <button
                          onClick={() => {
                            setEditSourceVersionIndex(currentVersionIndex);
                            setShowModalEditPrompt(true);
                          }}
                          className="w-full mb-3 px-3 py-2 text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg transition-colors"
                        >
                          Edit from this version (v{currentVersionIndex + 1})
                        </button>
                      )}

                      {/* Current version edit prompt */}
                      {currentVersion?.edit_prompt && (
                        <p className="text-xs text-neutral-500 italic">
                          "{currentVersion.edit_prompt}"
                        </p>
                      )}
                    </div>
                  ) : null;
                })()}

                {/* Image Info */}
                {(() => {
                  const metadata = selectedImage.metadata || {};
                  const aspectRatio = metadata.aspect_ratio as string | undefined;
                  const resolution = (metadata.resolution as string) || '2K';

                  return (
                    <div className="mb-5">
                      <div className="text-xs font-medium text-neutral-500 mb-2">Image Info</div>
                      <div className="flex gap-2 flex-wrap">
                        {aspectRatio && (
                          <span className="px-2 py-1 bg-neutral-100 rounded text-xs font-medium text-neutral-600">
                            {aspectRatio}
                          </span>
                        )}
                        <span className="px-2 py-1 bg-neutral-100 rounded text-xs font-medium text-neutral-600">
                          {resolution}
                        </span>
                        <span className="px-2 py-1 bg-neutral-100 rounded text-xs font-medium text-neutral-600">
                          PNG
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Debug: GPT Prompt (dev only) */}
                {gptPromptInfo && (import.meta.env.DEV || window.location.hostname === 'localhost') && (
                  <div className="pt-4 border-t border-neutral-100">
                    <button
                      onClick={() => setShowGptPrompt(!showGptPrompt)}
                      className="flex items-center gap-2 text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      <span>Debug prompt</span>
                      {showGptPrompt ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    {showGptPrompt && (
                      <div className="mt-3 space-y-2">
                        <pre className="text-[11px] text-neutral-600 whitespace-pre-wrap break-words font-mono overflow-auto max-h-32 bg-neutral-50 p-2 rounded-md">
                          {gptPromptInfo.system_prompt}
                        </pre>
                        <pre className="text-[11px] text-neutral-600 whitespace-pre-wrap break-words font-mono overflow-auto max-h-32 bg-neutral-50 p-2 rounded-md">
                          {gptPromptInfo.user_message}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Actions - pinned to bottom */}
              <div className="p-5 mt-auto">
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => setShowModalEditPrompt(true)}
                    disabled={modalEditing || selectedImage.edit_count >= selectedImage.max_edits}
                    className="flex-1"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span className="ml-1.5">Edit</span>
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const versions = getAllVersions(selectedImage);
                      const currentVersion = versions[currentVersionIndex] || versions[versions.length - 1];
                      // Use the current version's URL, or fall back to the image's main URL
                      const urlToDownload = currentVersion?.image_url || selectedImage.image_url;
                      if (urlToDownload) {
                        handleDownload(selectedImage, { url: urlToDownload });
                      }
                    }}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Floating Edit Prompt Box */}
          {showModalEditPrompt && (
            <div
              className="relative w-full max-w-2xl mt-4 z-[60] px-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white rounded-xl border border-neutral-200 shadow-lg p-4">
                {/* Edit source indicator */}
                {(() => {
                  const versions = getAllVersions(selectedImage);
                  const effectiveIdx = editSourceVersionIndex ?? (versions.length - 1);
                  const isEditingPreviousVersion = effectiveIdx < versions.length - 1;
                  const sourceVersion = versions[effectiveIdx];

                  return isEditingPreviousVersion ? (
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-neutral-100">
                      <img
                        src={sourceVersion?.image_url}
                        alt={`Editing from version ${effectiveIdx + 1}`}
                        className="w-10 h-10 rounded-md object-cover border border-violet-200"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-violet-600">Editing from Version {effectiveIdx + 1}</p>
                        {sourceVersion?.edit_prompt && (
                          <p className="text-[11px] text-neutral-500 truncate">{sourceVersion.edit_prompt}</p>
                        )}
                      </div>
                      <button
                        onClick={() => setEditSourceVersionIndex(null)}
                        className="text-xs text-neutral-400 hover:text-neutral-600 px-2 py-1 rounded hover:bg-neutral-100"
                        title="Reset to latest version"
                      >
                        Reset
                      </button>
                    </div>
                  ) : null;
                })()}
                <div className="flex items-center gap-3">
                  <input
                    ref={modalEditInputRef}
                    type="text"
                    value={modalEditPrompt}
                    onChange={(e) => setModalEditPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        e.stopPropagation();
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
                    placeholder="What would you like to change?"
                    className="flex-1 min-w-0 bg-transparent border-none outline-none text-neutral-800 placeholder:text-neutral-400 text-sm"
                    disabled={modalEditing}
                  />

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setShowMediaLibrary(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-neutral-500 hover:text-neutral-700 transition-colors rounded-lg hover:bg-neutral-100 relative"
                      title="Attach assets"
                      disabled={modalEditing}
                    >
                      <FolderOpen className="w-4 h-4" />
                      {(selectedAssets.length > 0 || selectedReferences.length > 0) && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-medium bg-brand-primary text-white">
                          {selectedAssets.length + selectedReferences.length}
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => setShowProductPicker(true)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors rounded-lg relative ${
                        selectedProduct
                          ? 'text-violet-600 bg-violet-50 hover:bg-violet-100'
                          : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'
                      }`}
                      title={selectedProduct ? `Product: ${selectedProduct.name}` : "Select product"}
                      disabled={modalEditing}
                    >
                      <Package className="w-4 h-4" />
                      {selectedProduct && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-medium bg-violet-500 text-white">
                          <Check className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => {
                        setShowModalEditPrompt(false);
                        setModalEditPrompt('');
                      }}
                      className="w-8 h-8 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-400 hover:text-neutral-600 transition-colors"
                      disabled={modalEditing}
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <Button
                      size="sm"
                      onClick={handleModalEdit}
                      disabled={modalEditing || !modalEditPrompt.trim() || selectedImage.edit_count >= selectedImage.max_edits}
                      loading={modalEditing}
                    >
                      {!modalEditing && <Send className="w-4 h-4" />}
                      <span className="ml-1.5">Apply</span>
                    </Button>
                  </div>
                </div>
                {selectedImage.edit_count >= selectedImage.max_edits && (
                  <p className="mt-3 text-xs text-amber-600">
                    Maximum of {selectedImage.max_edits} edits reached for this image.
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

      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        currentCredits={credits}
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

      {/* Product Picker */}
      <ProductPicker
        brandId={brand.id}
        isOpen={showProductPicker}
        onClose={() => setShowProductPicker(false)}
        onSelect={(product) => {
          setSelectedProduct(product);
          if (product) {
            const primaryImage = product.images?.find(img => img.is_primary)?.url || product.images?.[0]?.url;
            track('product_added', {
              product_url: primaryImage || '',
              success: true
            });
          }
        }}
        selectedProduct={selectedProduct}
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
          <div className="absolute inset-0 bg-black/60" />

          <div
            className="relative bg-white rounded-xl shadow-lg max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start sm:items-center justify-between p-4 sm:p-6 gap-3">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {smartPresets.map((preset) => {
                    const { tag, IconComponent } = getPresetIconAndTag(preset.category, preset.label);
                    return (
                      <div
                        key={preset.id}
                        onClick={() => {
                          handlePresetClick(preset);
                          setShowPresetsModal(false);
                        }}
                        className="group bg-white rounded-xl p-3 border border-neutral-200 hover:border-neutral-300 hover:shadow-sm transition-all cursor-pointer flex items-start gap-3"
                      >
                        {/* Icon */}
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-brand-primary/[0.08] text-brand-primary shrink-0">
                          <IconComponent className="w-5 h-5 text-brand-primary" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[11px] sm:text-[10px] font-medium text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded shrink-0">
                              {tag}
                            </span>
                          </div>
                          <p className="text-sm text-neutral-700 leading-relaxed">
                            {preset.prompt}
                          </p>
                        </div>
                      </div>
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
      {/* 3 Variations Modal */}
      {showComparisonModal && comparisonResults && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          onClick={() => setShowComparisonModal(false)}
        >
          <div className="absolute inset-0 bg-black/60" />

          {/* Modal wrapper for positioning X button outside */}
          <div className="relative">
            {/* Floating Close Button - outside modal */}
            <button
              onClick={() => setShowComparisonModal(false)}
              className="absolute -top-3 -right-3 z-20 w-8 h-8 rounded-full bg-black/70 hover:bg-black/90 flex items-center justify-center text-white transition-colors shadow-lg"
            >
              <X className="w-4 h-4" />
            </button>

            <div
              className="relative bg-white rounded-xl shadow-lg w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
            {/* Variations Grid */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {/* Check if any image has loaded */}
              {(() => {
                const hasAnyImage = (comparisonResults.v1 && comparisonResults.v1 !== 'loading') ||
                                   (comparisonResults.v2 && comparisonResults.v2 !== 'loading') ||
                                   (comparisonResults.v3 && comparisonResults.v3 !== 'loading');

                // Initial loading state - beautiful centered overlay
                if (!hasAnyImage) {
                  return (
                    <div className="flex items-center justify-center min-h-[400px]">
                      <div className="flex flex-col items-center gap-6 max-w-md text-center">
                        {/* Animated loader rings */}
                        <div className="relative w-24 h-24">
                          <div className="absolute inset-0 rounded-full border-4 border-violet-200 animate-pulse" />
                          <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-violet-500 animate-spin" />
                          <div className="absolute inset-4 rounded-full border-4 border-transparent border-t-violet-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Sparkles className="w-6 h-6 text-violet-500 animate-pulse" />
                          </div>
                        </div>

                        {/* Text content */}
                        <div className="space-y-2">
                          <h3 className="text-lg font-semibold text-neutral-800">Creating Your Variations</h3>
                          <p className="text-sm text-neutral-500">
                            Generating 3 unique designs based on your prompt...
                          </p>
                        </div>

                        {/* Progress dots */}
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-2 h-2 rounded-full bg-violet-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  );
                }

                // Grid view - show as soon as any image is ready
                return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Variation 1 */}
                <div className="flex flex-col">
                  {comparisonResults.v1 === 'loading' || !comparisonResults.v1 ? (
                    comparisonResults.v1 === 'loading' ? (
                      <div className="relative rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200 aspect-square">
                        {/* Shimmer effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-neutral-100 via-neutral-200 to-neutral-100 animate-pulse" />
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" style={{ animation: 'shimmer 2s infinite' }} />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-sm">
                            <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                          </div>
                          <span className="text-sm font-medium text-neutral-500 bg-white/80 px-3 py-1 rounded-full">Generating...</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center aspect-square bg-red-50 rounded-xl border border-red-200 text-red-600 text-sm">
                        Failed
                      </div>
                    )
                  ) : (
                    <div className="relative rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200 group animate-in fade-in zoom-in-95 duration-300">
                      <img
                        src={`data:image/png;base64,${comparisonResults.v1.image_base64}`}
                        alt="Variation 1"
                        className="w-full h-auto"
                      />
                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <div className="flex items-center justify-between">
                            <button
                              onClick={() => handleEditComparisonImage('v1')}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-lg text-xs font-medium text-neutral-700 hover:bg-white transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Edit
                            </button>
                            <button
                              onClick={() => {
                                const v1 = comparisonResults.v1;
                                if (!v1 || v1 === 'loading') return;
                                const link = document.createElement('a');
                                link.href = `data:image/png;base64,${v1.image_base64}`;
                                link.download = `variation-1-${Date.now()}.png`;
                                link.click();
                              }}
                              className="w-8 h-8 rounded-lg bg-white/90 backdrop-blur-sm flex items-center justify-center text-neutral-700 hover:bg-white transition-colors"
                              title="Download"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Admin Debug Panel */}
                  {isAdmin && comparisonResults.v1 && comparisonResults.v1 !== 'loading' && comparisonResults.v1.debug && (
                    <details className="mt-2 text-[10px]">
                      <summary className="flex items-center gap-1 text-neutral-400 cursor-pointer hover:text-neutral-600">
                        <Bug className="w-3 h-3" /> Debug
                      </summary>
                      <div className="mt-1 p-2 bg-neutral-50 rounded-lg border border-neutral-100 font-mono space-y-0.5">
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Logo:</span>
                          <span className={comparisonResults.v1.debug.logo_fetched ? 'text-green-600' : 'text-red-500'}>
                            {comparisonResults.v1.debug.logo_fetched ? 'Yes' : 'No'} ({comparisonResults.v1.debug.logo_size_kb || 0}KB)
                          </span>
                        </div>
                        <div className="text-neutral-500 truncate" title={comparisonResults.v1.debug.logo_url_used || ''}>
                          URL: {comparisonResults.v1.debug.logo_url_used || 'None'}
                        </div>
                        <div className="text-neutral-500">
                          Assets: {comparisonResults.v1.debug.assets_attached?.join(', ') || 'None'}
                        </div>
                      </div>
                    </details>
                  )}
                </div>

                {/* Variation 2 */}
                <div className="flex flex-col">
                  {comparisonResults.v2 === 'loading' || !comparisonResults.v2 ? (
                    comparisonResults.v2 === 'loading' ? (
                      <div className="relative rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200 aspect-square">
                        {/* Shimmer effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-neutral-100 via-neutral-200 to-neutral-100 animate-pulse" />
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full" style={{ animation: 'shimmer 2s infinite' }} />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-sm">
                            <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                          </div>
                          <span className="text-sm font-medium text-neutral-500 bg-white/80 px-3 py-1 rounded-full">Generating...</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center aspect-square bg-red-50 rounded-xl border border-red-200 text-red-600 text-sm">
                        Failed
                      </div>
                    )
                  ) : (
                    <div className="relative rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200 group animate-in fade-in zoom-in-95 duration-300">
                      <img
                        src={`data:image/png;base64,${comparisonResults.v2.image_base64}`}
                        alt="Variation 2"
                        className="w-full h-auto"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <div className="flex items-center justify-between">
                            <button
                              onClick={() => handleEditComparisonImage('v2')}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-lg text-xs font-medium text-neutral-700 hover:bg-white transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Edit
                            </button>
                            <button
                              onClick={() => {
                                const v2 = comparisonResults.v2;
                                if (!v2 || v2 === 'loading') return;
                                const link = document.createElement('a');
                                link.href = `data:image/png;base64,${v2.image_base64}`;
                                link.download = `variation-2-${Date.now()}.png`;
                                link.click();
                              }}
                              className="w-8 h-8 rounded-lg bg-white/90 backdrop-blur-sm flex items-center justify-center text-neutral-700 hover:bg-white transition-colors"
                              title="Download"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Admin Debug Panel */}
                  {isAdmin && comparisonResults.v2 && comparisonResults.v2 !== 'loading' && comparisonResults.v2.debug && (
                    <details className="mt-2 text-[10px]">
                      <summary className="flex items-center gap-1 text-neutral-400 cursor-pointer hover:text-neutral-600">
                        <Bug className="w-3 h-3" /> Debug
                      </summary>
                      <div className="mt-1 p-2 bg-neutral-50 rounded-lg border border-neutral-100 font-mono space-y-0.5">
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Logo:</span>
                          <span className={comparisonResults.v2.debug.logo_fetched ? 'text-green-600' : 'text-red-500'}>
                            {comparisonResults.v2.debug.logo_fetched ? 'Yes' : 'No'} ({comparisonResults.v2.debug.logo_size_kb || 0}KB)
                          </span>
                        </div>
                        <div className="text-neutral-500 truncate" title={comparisonResults.v2.debug.logo_url_used || ''}>
                          URL: {comparisonResults.v2.debug.logo_url_used || 'None'}
                        </div>
                        <div className="text-neutral-500">
                          Assets: {comparisonResults.v2.debug.assets_attached?.join(', ') || 'None'}
                        </div>
                      </div>
                    </details>
                  )}
                </div>

                {/* Variation 3 */}
                <div className="flex flex-col">
                  {comparisonResults.v3 === 'loading' || !comparisonResults.v3 ? (
                    comparisonResults.v3 === 'loading' ? (
                      <div className="relative rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200 aspect-square">
                        {/* Shimmer effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-neutral-100 via-neutral-200 to-neutral-100 animate-pulse" />
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full" style={{ animation: 'shimmer 2s infinite' }} />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-sm">
                            <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                          </div>
                          <span className="text-sm font-medium text-neutral-500 bg-white/80 px-3 py-1 rounded-full">Generating...</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center aspect-square bg-red-50 rounded-xl border border-red-200 text-red-600 text-sm">
                        Failed
                      </div>
                    )
                  ) : (
                    <div className="relative rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200 group animate-in fade-in zoom-in-95 duration-300">
                      <img
                        src={`data:image/png;base64,${comparisonResults.v3.image_base64}`}
                        alt="Variation 3"
                        className="w-full h-auto"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <div className="flex items-center justify-between">
                            <button
                              onClick={() => handleEditComparisonImage('v3')}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-lg text-xs font-medium text-neutral-700 hover:bg-white transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Edit
                            </button>
                            <button
                              onClick={() => {
                                const v3 = comparisonResults.v3;
                                if (!v3 || v3 === 'loading') return;
                                const link = document.createElement('a');
                                link.href = `data:image/png;base64,${v3.image_base64}`;
                                link.download = `variation-3-${Date.now()}.png`;
                                link.click();
                              }}
                              className="w-8 h-8 rounded-lg bg-white/90 backdrop-blur-sm flex items-center justify-center text-neutral-700 hover:bg-white transition-colors"
                              title="Download"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Admin Debug Panel */}
                  {isAdmin && comparisonResults.v3 && comparisonResults.v3 !== 'loading' && comparisonResults.v3.debug && (
                    <details className="mt-2 text-[10px]">
                      <summary className="flex items-center gap-1 text-neutral-400 cursor-pointer hover:text-neutral-600">
                        <Bug className="w-3 h-3" /> Debug
                      </summary>
                      <div className="mt-1 p-2 bg-neutral-50 rounded-lg border border-neutral-100 font-mono space-y-0.5">
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Logo:</span>
                          <span className={comparisonResults.v3.debug.logo_fetched ? 'text-green-600' : 'text-red-500'}>
                            {comparisonResults.v3.debug.logo_fetched ? 'Yes' : 'No'} ({comparisonResults.v3.debug.logo_size_kb || 0}KB)
                          </span>
                        </div>
                        <div className="text-neutral-500 truncate" title={comparisonResults.v3.debug.logo_url_used || ''}>
                          URL: {comparisonResults.v3.debug.logo_url_used || 'None'}
                        </div>
                        <div className="text-neutral-500">
                          Assets: {comparisonResults.v3.debug.assets_attached?.join(', ') || 'None'}
                        </div>
                      </div>
                    </details>
                  )}
                </div>
              </div>
                );
              })()}
            </div>

            </div>
          </div>
        </div>
      )}

      {/* Variation Viewer Modal - for viewing saved variation groups from gallery */}
      {viewingVariationGroup && viewingVariationImages.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          onClick={() => setViewingVariationGroup(null)}
        >
          <div className="absolute inset-0 bg-black/60" />

          <div className="relative">
            {/* Close button */}
            <button
              onClick={() => setViewingVariationGroup(null)}
              className="absolute -top-3 -right-3 z-20 w-8 h-8 rounded-full bg-black/70 hover:bg-black/90 flex items-center justify-center text-white transition-colors shadow-lg"
            >
              <X className="w-4 h-4" />
            </button>

            <div
              className="relative bg-white rounded-xl shadow-lg w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-4 sm:px-6 py-4 border-b border-neutral-100">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-violet-500" />
                  <h3 className="text-lg font-semibold text-neutral-800">
                    {viewingVariationImages.length} Variations
                  </h3>
                </div>
                <p className="text-sm text-neutral-500 mt-1 line-clamp-1">
                  {viewingVariationImages[0]?.prompt}
                </p>
              </div>

              {/* Variations Grid */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {viewingVariationImages.map((image, index) => (
                    <div key={image.id} className="flex flex-col">
                      <div className="relative rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200 group">
                        {image.image_url ? (
                          <img
                            src={image.image_url}
                            alt={`Variation ${index + 1}`}
                            className="w-full h-auto"
                          />
                        ) : (
                          <div className="aspect-square flex items-center justify-center">
                            <Sparkles className="w-10 h-10 text-neutral-300" />
                          </div>
                        )}

                        {/* Variation number badge */}
                        <div className="absolute top-2 left-2 px-2 py-1 rounded-full bg-neutral-900/70 backdrop-blur-sm text-white text-xs font-medium">
                          #{index + 1}
                        </div>

                        {/* Hover overlay with actions */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="absolute bottom-0 left-0 right-0 p-3">
                            <div className="flex items-center justify-between">
                              <button
                                onClick={() => {
                                  setSelectedImage(image);
                                  setViewingVariationGroup(null);
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-lg text-xs font-medium text-neutral-700 hover:bg-white transition-colors"
                              >
                                <Edit3 className="w-3.5 h-3.5" /> Edit
                              </button>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleDownload(image)}
                                  className="w-8 h-8 rounded-lg bg-white/90 backdrop-blur-sm flex items-center justify-center text-neutral-700 hover:bg-white transition-colors"
                                  title="Download"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    handleDeleteClick(image.id, e);
                                  }}
                                  disabled={deleting === image.id}
                                  className="w-8 h-8 rounded-lg bg-white/90 backdrop-blur-sm flex items-center justify-center text-neutral-700 hover:bg-red-50 hover:text-red-600 transition-colors"
                                  title="Delete"
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
                      </div>
                    </div>
                  ))}
                </div>
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
          // Track newly added styles
          const newStyles = filtered.filter(
            s => !selectedStyles.some(existing => existing.id === s.id)
          );
          newStyles.forEach(style => {
            track('style_selected', {
              style_id: style.id,
              style_name: style.name,
              category: style.category || 'uncategorized'
            });
          });
          setSelectedStyles(filtered);
        }}
        selectedStyles={selectedStyles}
      />
    </div>
  );
}

