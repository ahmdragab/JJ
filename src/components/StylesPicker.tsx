import { useState, useEffect } from 'react';
import { X, Loader2, Check, Sparkles, XCircle } from 'lucide-react';
import { Style, supabase } from '../lib/supabase';

interface StylesPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (styles: Style[]) => void;
  selectedStyles: Style[];
  primaryColor?: string;
  maxSelection?: number;
}

export function StylesPicker({
  isOpen,
  onClose,
  onSelect,
  selectedStyles,
  primaryColor = '#1a1a1a',
}: StylesPickerProps) {
  const [styles, setStyles] = useState<Style[]>([]);
  const [loading, setLoading] = useState(false);
  const [localSelection, setLocalSelection] = useState<Style[]>(selectedStyles);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  
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

    // Convert Sets to sorted arrays and capitalize
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

  // Filter styles by selected tags
  // OR within same category, AND across different categories
  const filteredStyles = styles.filter(style => {
    if (selectedTags.size === 0) return true;
    
    if (!style.tags) return false;
    
    // Group selected tags by their category
    const selectedTagsByCategory: Record<string, string[]> = {};
    Array.from(selectedTags).forEach(selectedTag => {
      // Find which category this tag belongs to by checking tagsByCategory
      for (const [category, categoryTags] of Object.entries(tagsByCategory)) {
        // Find the original tag (case-insensitive match) in this category
        const originalTag = styles
          .flatMap(s => {
            const catTags = s.tags?.[category as keyof typeof s.tags];
            return Array.isArray(catTags) ? catTags : [];
          })
          .find(t => t.toLowerCase() === selectedTag.toLowerCase());
        
        // Check if this tag exists in the category's tag list (case-insensitive)
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

    // For each category group, check if style has ANY tag from that group (OR)
    // Across all category groups, style must match ALL groups (AND)
    return Object.entries(selectedTagsByCategory).every(([category, categorySelectedTags]) => {
      const styleCategoryTags = style.tags?.[category as keyof typeof style.tags];
      if (!Array.isArray(styleCategoryTags)) return false;
      
      const styleCategoryTagsLower = styleCategoryTags.map(t => t.toLowerCase());
      // Check if style has ANY of the selected tags from this category (OR logic)
      return categorySelectedTags.some(selectedTag => 
        styleCategoryTagsLower.includes(selectedTag.toLowerCase())
      );
    });
  });

  const tagsByCategory = getTagsByCategory();

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      const newSet = new Set(prev);
      // Check case-insensitively
      const tagLower = tag.toLowerCase();
      const existingTag = Array.from(newSet).find(t => t.toLowerCase() === tagLower);
      if (existingTag) {
        newSet.delete(existingTag);
      } else {
        newSet.add(tag); // Keep original case
      }
      return newSet;
    });
  };

  // Check if can add more (max 2 styles)
  const canAddMore = localSelection.length < MAX_STYLES;


  // Toggle style selection
  const handleStyleClick = (style: Style, removeSelection = false) => {
    const isSelected = localSelection.some(s => s.id === style.id);
    
    if (removeSelection && isSelected) {
      // Remove from selection
      const newSelection = localSelection.filter(s => s.id !== style.id);
      setLocalSelection(newSelection);
      return;
    }
    
    if (!isSelected) {
      if (localSelection.length < MAX_STYLES) {
        // Add to selection
        setLocalSelection([...localSelection, style]);
      }
    } else {
      // Remove from selection
      setLocalSelection(localSelection.filter(s => s.id !== style.id));
    }
  };

  // Handle Add button click
  const handleAdd = () => {
    onSelect(localSelection);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      
      {/* Modal Content - Matching prompt text box style */}
      <div 
        className="relative bg-white/95 backdrop-blur-xl rounded-2xl border shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col transition-all duration-300"
        style={{
          borderColor: `${primaryColor}40`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 mb-1">Choose a Style</h2>
            <p className="text-sm text-slate-500">
              Select a style reference (max {MAX_STYLES})
            </p>
            {!canAddMore && (
              <p className="text-xs text-red-600 mt-1 font-medium">
                Selection limit reached. Remove styles to add more.
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tag Filters */}
        {Object.keys(tagsByCategory).some(cat => tagsByCategory[cat].length > 0) && (
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 relative">
            <div className="flex items-center gap-2 flex-wrap">
              {(['businessModel', 'industry', 'visualType', 'contentFormat', 'mood'] as const).map((category) => {
                const tags = tagsByCategory[category];
                if (!tags || tags.length === 0) return null;
                if (tags.length === 0) return null;
                
                // Count selected tags in this category
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
                      className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                        openCategory === category
                          ? 'text-white'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                      style={openCategory === category ? { backgroundColor: primaryColor } : {}}
                    >
                      {categoryLabels[category] || category}
                      {categorySelectedCount > 0 && (
                        <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                          openCategory === category ? 'bg-white/20 text-white' : 'bg-blue-600 text-white'
                        }`}>
                          {categorySelectedCount}
                        </span>
                      )}
                    </button>

                    {/* Dropdown for this category */}
                    {openCategory === category && (
                      <div className="absolute top-full left-0 mt-2 z-10 bg-white border border-slate-200 rounded-lg shadow-lg p-3 min-w-[200px] max-w-[300px] max-h-[300px] overflow-y-auto tag-filter-dropdown">
                        <div className="space-y-2">
                          {tags.map(tag => {
                            // Find the original tag (case-insensitive) for matching
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
                                    ? 'text-white'
                                    : 'text-slate-700 hover:bg-slate-50'
                                }`}
                                style={isSelected ? { backgroundColor: primaryColor } : {}}
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
                  className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
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
            <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
          </div>
        ) : filteredStyles.length > 0 ? (
          <div className="flex-1 overflow-y-auto p-6">
            {selectedTags.size > 0 && (
              <div className="mb-4 text-sm text-slate-600">
                Showing {filteredStyles.length} of {styles.length} styles
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {filteredStyles.map((style) => {
                const isSelected = localSelection.some(s => s.id === style.id);
                return (
                  <button
                    key={style.id}
                    onClick={() => handleStyleClick(style)}
                    disabled={!isSelected && !canAddMore}
                    className={`group relative rounded-2xl overflow-hidden border-2 transition-all ${
                      isSelected 
                        ? `ring-2 ring-offset-2` 
                        : !canAddMore
                        ? 'border-slate-200 opacity-50 cursor-not-allowed'
                        : 'border-slate-200 hover:border-slate-300 hover:shadow-lg'
                    }`}
                    style={isSelected ? {
                      borderColor: primaryColor,
                      boxShadow: `0 0 0 2px ${primaryColor}30`,
                    } : {}}
                    title={!isSelected && !canAddMore ? 'Selection limit reached' : style.name}
                  >
                    {/* Image */}
                    <div 
                      className="aspect-square relative overflow-hidden"
                      style={{
                        backgroundImage: 'linear-gradient(45deg, #f0f0f0 25%, transparent 25%), linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f0f0f0 75%), linear-gradient(-45deg, transparent 75%, #f0f0f0 75%)',
                        backgroundSize: '12px 12px',
                        backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
                        backgroundColor: '#fafafa',
                      }}
                    >
                      <img
                        src={style.url}
                        alt={style.name}
                        className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                      />
                      
                      {/* Overlay on hover */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
                    </div>

                    {/* Selection Check - Changes to X on hover */}
                    {isSelected && (
                      <div 
                        className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center shadow-lg transition-all group-hover:bg-red-500 z-10"
                        style={{ backgroundColor: primaryColor }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStyleClick(style, true);
                        }}
                      >
                        <Check className="w-4 h-4 text-white group-hover:hidden" />
                        <XCircle className="w-4 h-4 text-white hidden group-hover:block" />
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
              <Sparkles className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">
                {selectedTags.size > 0 ? 'No styles match your selected tags' : 'No styles available'}
              </p>
              {selectedTags.size > 0 && (
                <button
                  onClick={() => setSelectedTags(new Set())}
                  className="mt-3 px-4 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="text-sm text-slate-600">
            {localSelection.length > 0 ? (
              <>
                <span className="font-medium">{localSelection.length}</span>
                <span className={`ml-1 font-medium ${
                  localSelection.length >= MAX_STYLES ? 'text-red-600' : 'text-slate-500'
                }`}>
                  / {MAX_STYLES} max
                </span>
                <span className="text-slate-400 ml-1">
                  style selected
                </span>
              </>
            ) : (
              <span className="text-slate-400">
                Select up to {MAX_STYLES} styles
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-2xl border border-slate-200 text-slate-600 font-medium hover:bg-white transition-colors"
            >
              Cancel
            </button>
            {localSelection.length > 0 && (
              <button
                onClick={handleAdd}
                className="px-5 py-2.5 rounded-2xl text-white font-medium transition-all hover:shadow-lg"
                style={{ backgroundColor: primaryColor }}
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

