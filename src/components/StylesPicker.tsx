import { useState, useEffect, useRef } from 'react';
import { X, Loader2, Check, Sparkles, XCircle, Filter, Upload } from 'lucide-react';
import { Style, supabase } from '../lib/supabase';
import { useToast } from './Toast';

interface StylesPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (styles: Style[]) => void;
  selectedStyles: Style[];
  maxSelection?: number;
}

export function StylesPicker({
  isOpen,
  onClose,
  onSelect,
  selectedStyles,
}: StylesPickerProps) {
  const toast = useToast();
  const [styles, setStyles] = useState<Style[]>([]);
  const [loading, setLoading] = useState(false);
  const [localSelection, setLocalSelection] = useState<Style[]>(selectedStyles);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Maximum 1 style allowed
  const MAX_STYLES = 1;

  // Load styles when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const loadStyles = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('styles')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .order('category')
        .order('display_order', { ascending: true });

      if (!error && data) {
        setStyles(data as Style[]);
      }
      setLoading(false);
    };

    loadStyles();
    setLocalSelection(selectedStyles);
  }, [isOpen, selectedStyles]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!openCategory) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.tag-filter-dropdown')) {
        setOpenCategory(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openCategory]);

  // Capitalize first letter
  const capitalize = (str: string): string => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  // Get all tags grouped by category
  const getTagsByCategory = (): Record<string, string[]> => {
    const tagsByCategory: Record<string, Set<string>> = {
      businessModel: new Set(),
      industry: new Set(),
      visualType: new Set(),
      contentFormat: new Set(),
      mood: new Set(),
    };

    styles.forEach(style => {
      if (style.tags) {
        Object.entries(style.tags).forEach(([category, tagArray]) => {
          if (Array.isArray(tagArray) && tagsByCategory[category]) {
            tagArray.forEach(tag => tagsByCategory[category].add(tag));
          }
        });
      }
    });

    const result: Record<string, string[]> = {};
    Object.entries(tagsByCategory).forEach(([category, tagSet]) => {
      result[category] = Array.from(tagSet).sort().map(tag => capitalize(tag));
    });

    return result;
  };

  const categoryLabels: Record<string, string> = {
    mood: 'Mood',
    visualType: 'Visual Type',
    contentFormat: 'Content Format',
    businessModel: 'Business Model',
    industry: 'Industry',
  };

  const tagsByCategory = getTagsByCategory();

  // Filter styles by selected tags
  const filteredStylesUnordered = styles.filter(style => {
    if (selectedTags.size === 0) return true;
    if (!style.tags) return false;

    const selectedTagsByCategory: Record<string, string[]> = {};
    Array.from(selectedTags).forEach(selectedTag => {
      for (const [category, categoryTags] of Object.entries(tagsByCategory)) {
        const originalTag = styles
          .flatMap(s => {
            const catTags = s.tags?.[category as keyof typeof s.tags];
            return Array.isArray(catTags) ? catTags : [];
          })
          .find(t => t.toLowerCase() === selectedTag.toLowerCase());

        const tagInCategory = categoryTags.some(t => t.toLowerCase() === selectedTag.toLowerCase());

        if (originalTag && tagInCategory) {
          if (!selectedTagsByCategory[category]) {
            selectedTagsByCategory[category] = [];
          }
          selectedTagsByCategory[category].push(originalTag);
          break;
        }
      }
    });

    return Object.entries(selectedTagsByCategory).every(([category, categorySelectedTags]) => {
      const styleCategoryTags = style.tags?.[category as keyof typeof style.tags];
      if (!Array.isArray(styleCategoryTags)) return false;

      const styleCategoryTagsLower = styleCategoryTags.map(t => t.toLowerCase());
      return categorySelectedTags.some(selectedTag =>
        styleCategoryTagsLower.includes(selectedTag.toLowerCase())
      );
    });
  });

  // Reorder filtered styles: selected style first
  const filteredStyles = (() => {
    const selectedStyle = filteredStylesUnordered.find(style =>
      localSelection.some(s => s.id === style.id)
    );
    const otherStyles = filteredStylesUnordered.filter(style =>
      !localSelection.some(s => s.id === style.id)
    );

    if (selectedStyle) {
      return [selectedStyle, ...otherStyles];
    }
    return filteredStylesUnordered;
  })();

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      const newSet = new Set(prev);
      const tagLower = tag.toLowerCase();
      const existingTag = Array.from(newSet).find(t => t.toLowerCase() === tagLower);
      if (existingTag) {
        newSet.delete(existingTag);
      } else {
        newSet.add(tag);
      }
      return newSet;
    });
  };

  const canAddMore = localSelection.length < MAX_STYLES;

  const handleStyleClick = (style: Style, removeSelection = false) => {
    const isSelected = localSelection.some(s => s.id === style.id);

    if (removeSelection && isSelected) {
      const newSelection = localSelection.filter(s => s.id !== style.id);
      setLocalSelection(newSelection);
      return;
    }

    if (!isSelected) {
      if (localSelection.length < MAX_STYLES) {
        setLocalSelection([...localSelection, style]);
      }
    } else {
      setLocalSelection(localSelection.filter(s => s.id !== style.id));
    }
  };

  const handleAdd = () => {
    onSelect(localSelection);
    onClose();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const SUPPORTED_TYPES = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/heic',
      'image/heif',
      'image/gif',
    ];

    const validFiles = files.filter(f => SUPPORTED_TYPES.includes(f.type.toLowerCase()));
    if (validFiles.length === 0) {
      toast.error('Invalid Format', 'Please upload valid image files (PNG, JPEG, WEBP, HEIC, HEIF, GIF)');
      return;
    }

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const uploadPromises = validFiles.map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('styles')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('styles')
          .getPublicUrl(uploadData.path);

        const { data: styleData, error: styleError } = await supabase
          .from('styles')
          .insert({
            name: file.name.replace(/\.[^/.]+$/, ''),
            url: urlData.publicUrl,
            category: 'user_uploaded',
            file_size: file.size,
            mime_type: file.type,
            display_order: 0,
            is_active: true,
          })
          .select()
          .single();

        if (styleError) throw styleError;
        return styleData as Style;
      });

      await Promise.all(uploadPromises);

      const { data, error } = await supabase
        .from('styles')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .order('category')
        .order('display_order', { ascending: true });

      if (!error && data) {
        setStyles(data as Style[]);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error('Upload Failed', 'Failed to upload. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop-enter"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal Content */}
      <div
        className="relative glass rounded-2xl sm:rounded-3xl w-full max-w-4xl max-h-[95vh] sm:max-h-[85vh] flex flex-col modal-content-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between p-4 sm:p-6 border-b border-neutral-100 gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-semibold text-neutral-800 mb-1 font-heading">Choose a Style</h2>
            <p className="text-xs sm:text-sm text-neutral-500">
              Select a style reference (max {MAX_STYLES})
            </p>
            {!canAddMore && (
              <p className="text-xs text-red-500 mt-1 font-medium">
                Selection limit reached. Remove styles to add more.
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl hover:bg-neutral-100 flex items-center justify-center text-neutral-400 hover:text-neutral-600 transition-colors touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tag Filters */}
        {Object.keys(tagsByCategory).some(cat => tagsByCategory[cat].length > 0) && (
          <div className="p-3 sm:p-4 border-b border-neutral-100 relative">
            <div className="mb-3 flex items-center gap-2">
              <Filter className="w-4 h-4 text-neutral-400" />
              <h3 className="text-sm font-medium text-neutral-600">Filters</h3>
              {selectedTags.size > 0 && (
                <span className="ml-auto text-xs text-neutral-400">
                  {selectedTags.size} {selectedTags.size === 1 ? 'filter' : 'filters'} active
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {(['businessModel', 'industry', 'visualType', 'contentFormat', 'mood'] as const).map((category) => {
                const tags = tagsByCategory[category];
                if (!tags || tags.length === 0) return null;

                const categorySelectedCount = tags.filter(tag => {
                  const originalTag = styles
                    .flatMap(s => {
                      const catTags = s.tags?.[category as keyof typeof s.tags];
                      return Array.isArray(catTags) ? catTags : [];
                    })
                    .find(t => t.toLowerCase() === tag.toLowerCase());
                  return originalTag && Array.from(selectedTags).some(st => st.toLowerCase() === originalTag.toLowerCase());
                }).length;

                return (
                  <div key={category} className="relative tag-filter-dropdown">
                    <button
                      onClick={() => setOpenCategory(openCategory === category ? null : category)}
                      className={`flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-xl transition-all ${
                        openCategory === category
                          ? 'bg-brand-primary text-white'
                          : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50 hover:border-neutral-300'
                      }`}
                    >
                      {categoryLabels[category] || category}
                      {categorySelectedCount > 0 && (
                        <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                          openCategory === category ? 'bg-white/20 text-white' : 'bg-brand-primary text-white'
                        }`}>
                          {categorySelectedCount}
                        </span>
                      )}
                    </button>

                    {openCategory === category && (
                      <div className="absolute top-full left-0 mt-2 z-10 bg-white border border-neutral-200 rounded-xl shadow-lg p-2 min-w-[180px] max-w-[300px] max-h-[300px] overflow-y-auto no-scrollbar tag-filter-dropdown">
                        <div className="space-y-1">
                          {tags.map(tag => {
                            const originalTag = styles
                              .flatMap(s => {
                                const catTags = s.tags?.[category as keyof typeof s.tags];
                                return Array.isArray(catTags) ? catTags : [];
                              })
                              .find(t => t.toLowerCase() === tag.toLowerCase()) || tag;

                            const isSelected = Array.from(selectedTags).some(st => st.toLowerCase() === originalTag.toLowerCase());

                            return (
                              <button
                                key={`${category}-${tag}`}
                                onClick={() => toggleTag(originalTag)}
                                className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                                  isSelected
                                    ? 'bg-brand-primary text-white'
                                    : 'text-neutral-600 hover:bg-neutral-50'
                                }`}
                              >
                                {tag}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {selectedTags.size > 0 && (
                <button
                  onClick={() => {
                    setSelectedTags(new Set());
                    setOpenCategory(null);
                  }}
                  className="px-3 py-1.5 text-sm text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded-xl transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
        )}

        {/* Styles Grid */}
        {loading ? (
          <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-brand-primary" />
          </div>
        ) : filteredStyles.length > 0 ? (
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 no-scrollbar">
            {selectedTags.size > 0 && (
              <div className="mb-3 sm:mb-4 text-xs sm:text-sm text-neutral-500">
                Showing {filteredStyles.length} of {styles.length} styles
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {/* Upload Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="group relative rounded-2xl overflow-hidden border-2 border-dashed border-neutral-200 hover:border-brand-primary/30 transition-all bg-neutral-50/50 hover:bg-brand-primary/5 aspect-square flex flex-col items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-6 h-6 text-brand-primary animate-spin" />
                    <span className="text-xs text-neutral-500">Uploading...</span>
                  </>
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center group-hover:bg-brand-primary/15 transition-colors">
                      <Upload className="w-5 h-5 text-brand-primary" />
                    </div>
                    <span className="text-xs font-medium text-neutral-500 group-hover:text-neutral-600">Upload Style</span>
                  </>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif,image/gif"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />

              {filteredStyles.map((style) => {
                const isSelected = localSelection.some(s => s.id === style.id);
                return (
                  <button
                    key={style.id}
                    onClick={() => handleStyleClick(style)}
                    disabled={!isSelected && !canAddMore}
                    className={`group relative rounded-2xl overflow-hidden border-2 transition-all duration-300 ${
                      isSelected
                        ? 'border-brand-primary ring-2 ring-brand-primary/20'
                        : !canAddMore
                        ? 'border-neutral-200 opacity-50 cursor-not-allowed'
                        : 'border-neutral-200 hover:border-neutral-300 hover:shadow-md'
                    }`}
                    aria-label={!isSelected && !canAddMore ? 'Selection limit reached' : style.name}
                  >
                    {/* Image */}
                    <div className="aspect-square relative overflow-hidden bg-neutral-100">
                      <img
                        src={style.url}
                        alt=""
                        className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>

                    {/* Selection Check */}
                    {isSelected && (
                      <div
                        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-brand-primary flex items-center justify-center shadow-md transition-all group-hover:bg-red-500 z-10"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStyleClick(style, true);
                        }}
                      >
                        <Check className="w-3.5 h-3.5 text-white group-hover:hidden" />
                        <XCircle className="w-3.5 h-3.5 text-white hidden group-hover:block" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center">
            <div className="text-center">
              <Sparkles className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
              <p className="text-sm text-neutral-500">
                {selectedTags.size > 0 ? 'No styles match your selected tags' : 'No styles available'}
              </p>
              {selectedTags.size > 0 && (
                <button
                  onClick={() => setSelectedTags(new Set())}
                  className="mt-3 px-4 py-2 text-sm text-brand-primary hover:bg-brand-primary/5 rounded-xl transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-neutral-100 bg-neutral-50/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="text-xs sm:text-sm text-neutral-500">
            {localSelection.length > 0 ? (
              <>
                <span className="font-medium text-neutral-700">{localSelection.length}</span>
                <span className={`ml-1 ${localSelection.length >= MAX_STYLES ? 'text-red-500' : ''}`}>
                  / {MAX_STYLES} max
                </span>
                <span className="ml-1">style selected</span>
              </>
            ) : (
              <span>Select up to {MAX_STYLES} styles</span>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="btn-ghost flex-1 sm:flex-none px-5 py-2.5 rounded-xl border border-neutral-200"
            >
              Cancel
            </button>
            {localSelection.length > 0 && (
              <button
                onClick={handleAdd}
                className="btn-primary flex-1 sm:flex-none px-5 py-2.5 rounded-xl"
              >
                Add Style
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
