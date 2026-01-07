import { useState, useEffect, useRef } from 'react';
import { X, Upload, Loader2, Trash2, Edit2, Save, Image as ImageIcon, Link2, CheckCircle, XCircle, Sparkles, Search } from 'lucide-react';
import { Style, supabase, getAuthHeaders } from '../lib/supabase';
import { useToast } from '../components/Toast';

export function StylesAdmin() {
  const toast = useToast();
  const [styles, setStyles] = useState<Style[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingStyle, setEditingStyle] = useState<Partial<Style>>({});
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkUrls, setBulkUrls] = useState('');
  const [bulkCategory, setBulkCategory] = useState('creative');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ url: string; status: 'pending' | 'processing' | 'success' | 'error'; error?: string }[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<{ styleId: string; status: 'pending' | 'processing' | 'success' | 'error'; error?: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories = [
    'minimalist',
    'bold',
    'corporate',
    'creative',
    'modern',
    'vintage',
    'playful',
    'elegant',
    'tech',
    'lifestyle',
    'abstract',
    'geometric',
  ];

  useEffect(() => {
    loadStyles();
  }, []);

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

  const loadStyles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('styles')
      .select('*')
      .order('category')
      .order('display_order', { ascending: true });

    if (!error && data) {
      setStyles(data as Style[]);
    }
    setLoading(false);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      await processFiles(files);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      await processFiles(files);
    }
  };

  const processFiles = async (files: File[]) => {
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

        // Get the highest display_order for this category (or 0 if none)
        const categoryName = file.name.split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
        const category = categories.find(c => categoryName.includes(c)) || 'creative';
        
        const { data: existingStyles } = await supabase
          .from('styles')
          .select('display_order')
          .eq('category', category)
          .order('display_order', { ascending: false })
          .limit(1);

        const displayOrder = existingStyles && existingStyles.length > 0 
          ? (existingStyles[0].display_order || 0) + 1 
          : 0;

        const { data: styleData, error: styleError } = await supabase
          .from('styles')
          .insert({
            name: file.name.replace(/\.[^/.]+$/, ''),
            description: '',
            url: urlData.publicUrl,
            category,
            file_size: file.size,
            mime_type: file.type,
            display_order: displayOrder,
            is_active: true,
          })
          .select()
          .single();

        if (styleError) throw styleError;
        return styleData as Style;
      });

      const newStyles = await Promise.all(uploadPromises);
      await loadStyles();
      toast.success('Upload Complete', `Successfully uploaded ${newStyles.length} style(s)`);
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error('Upload Failed', 'Failed to upload. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleEdit = (style: Style) => {
    setEditingId(style.id);
    setEditingStyle({
      name: style.name,
      description: style.description || '',
      category: style.category,
      display_order: style.display_order,
      is_active: style.is_active,
    });
  };

  const handleSave = async (id: string) => {
    try {
      const { error } = await supabase
        .from('styles')
        .update({
          name: editingStyle.name,
          description: editingStyle.description,
          category: editingStyle.category,
          display_order: editingStyle.display_order,
          is_active: editingStyle.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      setEditingId(null);
      setEditingStyle({});
      await loadStyles();
    } catch (error) {
      console.error('Failed to update style:', error);
      toast.error('Update Failed', 'Failed to update style. Please try again.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this style?')) return;

    try {
      const { error } = await supabase
        .from('styles')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await loadStyles();
    } catch (error) {
      console.error('Failed to delete style:', error);
      toast.error('Delete Failed', 'Failed to delete style. Please try again.');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingStyle({});
  };

  const analyzeStyle = async (style: Style) => {
    setAnalyzingId(style.id);
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-style`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            imageUrl: style.url,
            styleId: style.id,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to analyze style');
      }

      const result = await response.json();
      await loadStyles();
      return result;
    } catch (error) {
      console.error('Analysis failed:', error);
      throw error;
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleBulkAnalyze = async () => {
    const stylesToAnalyze = styles.filter(s => s.is_active);
    if (stylesToAnalyze.length === 0) {
      toast.warning('No Styles', 'No active styles to analyze');
      return;
    }

    if (!confirm(`Analyze ${stylesToAnalyze.length} style(s) with GPT-4o? This may take a few minutes.`)) {
      return;
    }

    setAnalyzing(true);
    setAnalysisProgress(stylesToAnalyze.map(s => ({ styleId: s.id, status: 'pending' as const })));

    try {
      const results = await Promise.allSettled(
        stylesToAnalyze.map(async (style, index) => {
          // Update progress
          setAnalysisProgress(prev => {
            const newProgress = [...prev];
            newProgress[index] = { styleId: style.id, status: 'processing' };
            return newProgress;
          });

          try {
            await analyzeStyle(style);
            setAnalysisProgress(prev => {
              const newProgress = [...prev];
              newProgress[index] = { styleId: style.id, status: 'success' };
              return newProgress;
            });
            return { success: true, styleId: style.id };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            setAnalysisProgress(prev => {
              const newProgress = [...prev];
              newProgress[index] = { styleId: style.id, status: 'error', error: errorMessage };
              return newProgress;
            });
            throw error;
          }
        })
      );

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const errorCount = results.filter(r => r.status === 'rejected').length;

      await loadStyles();

      if (successCount > 0) {
        toast.success('Analysis Complete', `Successfully analyzed ${successCount} style(s)${errorCount > 0 ? `, ${errorCount} failed` : ''}`);
      } else {
        toast.error('Analysis Failed', 'Failed to analyze styles. Check the progress below for details.');
      }
    } catch (error) {
      console.error('Bulk analysis failed:', error);
      toast.error('Analysis Failed', 'Bulk analysis failed. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  // Convert image to PNG using canvas (handles AVIF, WebP, etc.)
  const convertImageToPNG = async (imageUrl: string): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve(null);
            return;
          }
          
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((blob) => {
            resolve(blob);
          }, 'image/png');
        } catch (error) {
          console.error('Canvas conversion error:', error);
          resolve(null);
        }
      };
      
      img.onerror = () => {
        resolve(null);
      };
      
      img.src = imageUrl;
    });
  };

  // Fetch image and convert to PNG
  const fetchAndConvertImage = async (url: string): Promise<{ blob: Blob; name: string } | null> => {
    try {
      // First, try to fetch the image
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Get the image as blob
      const blob = await response.blob();
      
      // If it's already PNG, use it directly
      if (blob.type === 'image/png') {
        const urlParts = url.split('/');
        const fileName = urlParts[urlParts.length - 1].split('?')[0] || 'image.png';
        return { blob, name: fileName };
      }

      // For AVIF, WebP, or other formats, convert to PNG using canvas
      const objectUrl = URL.createObjectURL(blob);
      const pngBlob = await convertImageToPNG(objectUrl);
      URL.revokeObjectURL(objectUrl);

      if (!pngBlob) {
        throw new Error('Failed to convert image');
      }

      // Extract filename from URL
      const urlParts = url.split('/');
      const originalFileName = urlParts[urlParts.length - 1].split('?')[0] || 'image';
      const nameWithoutExt = originalFileName.replace(/\.[^/.]+$/, '');
      const fileName = `${nameWithoutExt}.png`;

      return { blob: pngBlob, name: fileName };
    } catch (error) {
      console.error('Failed to fetch/convert image:', error);
      return null;
    }
  };

  const handleBulkImport = async () => {
    const urls = bulkUrls
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && (line.startsWith('http://') || line.startsWith('https://')));

    if (urls.length === 0) {
      toast.warning('No URLs', 'Please enter at least one valid URL');
      return;
    }

    setImporting(true);
    setImportProgress(urls.map(url => ({ url, status: 'pending' as const })));

    try {
      // Get the highest display_order for the selected category
      const { data: existingStyles } = await supabase
        .from('styles')
        .select('display_order')
        .eq('category', bulkCategory)
        .order('display_order', { ascending: false })
        .limit(1);

      let displayOrder = existingStyles && existingStyles.length > 0 
        ? (existingStyles[0].display_order || 0) + 1 
        : 0;

      const results = await Promise.allSettled(
        urls.map(async (url, index) => {
          // Update progress
          setImportProgress(prev => {
            const newProgress = [...prev];
            newProgress[index] = { url, status: 'processing' };
            return newProgress;
          });

          try {
            // Fetch and convert image
            const imageData = await fetchAndConvertImage(url);
            if (!imageData) {
              throw new Error('Failed to fetch or convert image');
            }

            // Upload to storage (no prefix needed, bucket name is 'styles')
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
            
            // Verify session before upload
            const { data: { session: uploadSession } } = await supabase.auth.getSession();
            if (!uploadSession) {
              throw new Error('No active session for storage upload');
            }

            console.log('Uploading to storage:', fileName);
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('styles')
              .upload(fileName, imageData.blob, {
                contentType: 'image/png',
                cacheControl: '3600',
                upsert: false,
              });

            if (uploadError) {
              console.error('Storage upload error:', uploadError);
              throw new Error(`Storage upload failed: ${uploadError.message}`);
            }

            console.log('Storage upload successful:', uploadData.path);

            const { data: urlData } = supabase.storage
              .from('styles')
              .getPublicUrl(uploadData.path);

            // Extract name from URL or filename
            const urlParts = url.split('/');
            const originalFileName = urlParts[urlParts.length - 1].split('?')[0] || 'image';
            const nameWithoutExt = originalFileName.replace(/\.[^/.]+$/, '');

            // Create style record
            // First verify we're authenticated and refresh session
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !session) {
              console.error('Session error:', sessionError);
              throw new Error('Not authenticated. Please log in again.');
            }

            console.log('Inserting style with data:', {
              name: nameWithoutExt,
              url: urlData.publicUrl,
              category: bulkCategory,
              file_size: imageData.blob.size,
              mime_type: 'image/png',
              display_order: displayOrder,
              is_active: true,
            });

            const { data: styleData, error: styleError } = await supabase
              .from('styles')
              .insert({
                name: nameWithoutExt,
                description: '',
                url: urlData.publicUrl,
                category: bulkCategory,
                file_size: imageData.blob.size,
                mime_type: 'image/png',
                display_order: displayOrder++,
                is_active: true,
              })
              .select()
              .single();

            if (styleError) {
              console.error('Style insert error details:', {
                message: styleError.message,
                details: styleError.details,
                hint: styleError.hint,
                code: styleError.code,
              });
              throw new Error(`Failed to create style record: ${styleError.message} (Code: ${styleError.code})`);
            }

            console.log('Style created successfully:', styleData);

            // Update progress
            setImportProgress(prev => {
              const newProgress = [...prev];
              newProgress[index] = { url, status: 'success' };
              return newProgress;
            });

            return { success: true, url };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            setImportProgress(prev => {
              const newProgress = [...prev];
              newProgress[index] = { url, status: 'error', error: errorMessage };
              return newProgress;
            });
            throw error;
          }
        })
      );

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const errorCount = results.filter(r => r.status === 'rejected').length;

      await loadStyles();

      if (successCount > 0) {
        toast.success('Import Complete', `Successfully imported ${successCount} style(s)${errorCount > 0 ? `, ${errorCount} failed` : ''}`);
      } else {
        toast.error('Import Failed', 'Failed to import styles. Check the progress below for details.');
      }

      // Clear URLs if all succeeded
      if (errorCount === 0) {
        setBulkUrls('');
        setShowBulkImport(false);
      }
    } catch (error) {
      console.error('Bulk import failed:', error);
      toast.error('Import Failed', 'Bulk import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-50 via-neutral-50 to-zinc-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
      </div>
    );
  }

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

  // Filter styles based on search query and selected tags
  const filteredStyles = styles.filter(style => {
    // Search query filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchesName = style.name.toLowerCase().includes(query);
      const matchesDescription = style.style_description?.toLowerCase().includes(query) || 
                                 style.description?.toLowerCase().includes(query);
      const matchesCategory = style.category.toLowerCase().includes(query);
      const matchesTags = style.tags && Object.values(style.tags).some(tagArray => 
        Array.isArray(tagArray) && tagArray.some(tag => tag.toLowerCase().includes(query))
      );
      
      if (!matchesName && !matchesDescription && !matchesCategory && !matchesTags) {
        return false;
      }
    }

    // Tag filter: OR within same category, AND across different categories
    if (selectedTags.size > 0) {
      if (!style.tags) return false;
      
      // Group selected tags by their category by checking all styles
      const selectedTagsByCategory: Record<string, string[]> = {};
      Array.from(selectedTags).forEach(selectedTag => {
        // Find which category this tag belongs to by checking all styles
        for (const [category, categoryTags] of Object.entries(tagsByCategory)) {
          const categoryTagsLower = categoryTags.map(t => t.toLowerCase());
          // Find the original tag (case-insensitive match)
          const originalTag = styles
            .flatMap(s => {
              const catTags = s.tags?.[category as keyof typeof s.tags];
              return Array.isArray(catTags) ? catTags : [];
            })
            .find(t => t.toLowerCase() === selectedTag.toLowerCase());
          
          if (originalTag && categoryTagsLower.includes(selectedTag.toLowerCase())) {
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
      const matchesAllCategories = Object.entries(selectedTagsByCategory).every(([category, categorySelectedTags]) => {
        const styleCategoryTags = style.tags?.[category as keyof typeof style.tags];
        if (!Array.isArray(styleCategoryTags)) return false;
        
        const styleCategoryTagsLower = styleCategoryTags.map(t => t.toLowerCase());
        // Check if style has ANY of the selected tags from this category (OR logic)
        return categorySelectedTags.some(selectedTag => 
          styleCategoryTagsLower.includes(selectedTag.toLowerCase())
        );
      });
      
      if (!matchesAllCategories) return false;
    }

    return true;
  });

  const groupedStyles = filteredStyles.reduce((acc, style) => {
    if (!acc[style.category]) {
      acc[style.category] = [];
    }
    acc[style.category].push(style);
    return acc;
  }, {} as Record<string, Style[]>);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-neutral-50 to-zinc-50 p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Styles Management</h1>
            <p className="text-slate-600">Upload and manage style reference images</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleBulkAnalyze}
              disabled={analyzing || styles.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-4 h-4" />
              {analyzing ? 'Analyzing...' : 'Analyze All Styles'}
            </button>
            <button
              onClick={() => setShowBulkImport(!showBulkImport)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
            >
              <Link2 className="w-4 h-4" />
              Bulk Import from URLs
            </button>
          </div>
        </div>

        {/* Bulk Import Section */}
        {showBulkImport && (
          <div className="mb-8 bg-white/70 backdrop-blur-sm rounded-2xl p-6 border border-slate-200/50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900">Bulk Import from URLs</h2>
              <button
                onClick={() => {
                  setShowBulkImport(false);
                  setBulkUrls('');
                  setImportProgress([]);
                }}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Paste image URLs (one per line). Images will be automatically converted to PNG format (AVIF, WebP, etc. supported).
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Category
                </label>
                <select
                  value={bulkCategory}
                  onChange={(e) => setBulkCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Image URLs (one per line)
                </label>
                <textarea
                  value={bulkUrls}
                  onChange={(e) => setBulkUrls(e.target.value)}
                  placeholder="https://example.com/image1.avif&#10;https://example.com/image2.webp&#10;https://example.com/image3.png"
                  rows={8}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  disabled={importing}
                />
              </div>
              <button
                onClick={handleBulkImport}
                disabled={importing || !bulkUrls.trim()}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Import {bulkUrls.split('\n').filter(l => l.trim()).length} Image(s)
                  </>
                )}
              </button>
              
              {/* Progress */}
              {importProgress.length > 0 && (
                <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
                  {importProgress.map((item, index) => (
                    <div
                      key={index}
                      className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
                        item.status === 'success' ? 'bg-green-50 text-green-700' :
                        item.status === 'error' ? 'bg-red-50 text-red-700' :
                        item.status === 'processing' ? 'bg-blue-50 text-blue-700' :
                        'bg-slate-50 text-slate-600'
                      }`}
                    >
                      {item.status === 'success' && <CheckCircle className="w-4 h-4 shrink-0" />}
                      {item.status === 'error' && <XCircle className="w-4 h-4 shrink-0" />}
                      {item.status === 'processing' && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                      {item.status === 'pending' && <div className="w-4 h-4 shrink-0" />}
                      <span className="flex-1 truncate font-mono text-xs">{item.url}</span>
                      {item.error && <span className="text-xs">({item.error})</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bulk Analysis Progress */}
        {analysisProgress.length > 0 && (
          <div className="mb-8 bg-white/70 backdrop-blur-sm rounded-2xl p-6 border border-slate-200/50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900">Analysis Progress</h2>
              <button
                onClick={() => setAnalysisProgress([])}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {analysisProgress.map((item) => {
                const style = styles.find(s => s.id === item.styleId);
                return (
                  <div
                    key={item.styleId}
                    className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
                      item.status === 'success' ? 'bg-green-50 text-green-700' :
                      item.status === 'error' ? 'bg-red-50 text-red-700' :
                      item.status === 'processing' ? 'bg-purple-50 text-purple-700' :
                      'bg-slate-50 text-slate-600'
                    }`}
                  >
                    {item.status === 'success' && <CheckCircle className="w-4 h-4 shrink-0" />}
                    {item.status === 'error' && <XCircle className="w-4 h-4 shrink-0" />}
                    {item.status === 'processing' && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                    {item.status === 'pending' && <div className="w-4 h-4 shrink-0" />}
                    <span className="flex-1 truncate text-xs">
                      {style?.name || item.styleId}
                    </span>
                    {item.error && <span className="text-xs">({item.error})</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Search and Filter Section */}
        <div className="mb-6 bg-white/70 backdrop-blur-sm rounded-2xl p-4 border border-slate-200/50">
          <div className="flex flex-col gap-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search styles by name, description, category, or tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Tag Filters */}
            {Object.keys(tagsByCategory).some(cat => tagsByCategory[cat].length > 0) && (
              <div className="flex items-center gap-2 flex-wrap relative">
                {(['businessModel', 'industry', 'visualType', 'contentFormat', 'mood'] as const).map((category) => {
                  const tags = tagsByCategory[category];
                  if (!tags || tags.length === 0) return null;
                  
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
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
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
                                      ? 'bg-blue-600 text-white'
                                      : 'text-slate-700 hover:bg-slate-50'
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
                    className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}

            {/* Results count */}
            {(searchQuery || selectedTags.size > 0) && (
              <div className="text-sm text-slate-600">
                Showing {filteredStyles.length} of {styles.length} styles
              </div>
            )}
          </div>
        </div>

        {/* Upload Area */}
        <div className="mb-8">
          <label
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-2xl cursor-pointer transition-colors ${
              isDragging 
                ? 'border-blue-400 bg-blue-50' 
                : 'border-slate-300 hover:border-slate-400'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif,image/gif"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              disabled={uploading}
            />
            {uploading ? (
              <div className="flex flex-col items-center">
                <Loader2 className="w-8 h-8 animate-spin mb-3 text-slate-600" />
                <p className="text-sm text-slate-600">Uploading...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <Upload className="w-8 h-8 mb-3 text-slate-400" />
                <p className="text-sm font-medium text-slate-700 mb-1">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-slate-500">
                  PNG, JPEG, WEBP, HEIC, HEIF, GIF
                </p>
              </div>
            )}
          </label>
        </div>

        {/* Styles by Category */}
        {Object.keys(groupedStyles).length === 0 ? (
          <div className="text-center py-12">
            <ImageIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">
              {searchQuery || selectedTags.size > 0 
                ? 'No styles match your filters' 
                : 'No styles uploaded yet'}
            </p>
            {(searchQuery || selectedTags.size > 0) && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedTags(new Set());
                }}
                className="mt-4 px-4 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedStyles)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([category, categoryStyles]) => (
                <div key={category} className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 border border-slate-200/50">
                  <h2 className="text-xl font-semibold text-slate-900 mb-4 capitalize">
                    {category} ({categoryStyles.length})
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {categoryStyles.map((style) => (
                      <div
                        key={style.id}
                        className="group relative bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg transition-all"
                      >
                        {/* Image */}
                        <div className="aspect-square bg-slate-50 relative overflow-hidden">
                          <img
                            src={style.url}
                            alt={style.name}
                            className="w-full h-full object-contain p-2"
                          />
                          {!style.is_active && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <span className="text-white text-xs font-medium">Inactive</span>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="p-3 border-t border-slate-100">
                          {editingId === style.id ? (
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={editingStyle.name || ''}
                                onChange={(e) => setEditingStyle({ ...editingStyle, name: e.target.value })}
                                placeholder="Name"
                                className="w-full px-2 py-1 text-sm border border-slate-200 rounded"
                              />
                              <textarea
                                value={editingStyle.description || ''}
                                onChange={(e) => setEditingStyle({ ...editingStyle, description: e.target.value })}
                                placeholder="Description (shown on hover)"
                                rows={2}
                                className="w-full px-2 py-1 text-sm border border-slate-200 rounded resize-none"
                              />
                              <select
                                value={editingStyle.category || ''}
                                onChange={(e) => setEditingStyle({ ...editingStyle, category: e.target.value })}
                                className="w-full px-2 py-1 text-sm border border-slate-200 rounded"
                              >
                                {categories.map(cat => (
                                  <option key={cat} value={cat}>{cat}</option>
                                ))}
                              </select>
                              <input
                                type="number"
                                value={editingStyle.display_order || 0}
                                onChange={(e) => setEditingStyle({ ...editingStyle, display_order: parseInt(e.target.value) || 0 })}
                                placeholder="Display Order"
                                className="w-full px-2 py-1 text-sm border border-slate-200 rounded"
                              />
                              <div className="flex items-center gap-2">
                                <label className="flex items-center gap-1 text-xs text-slate-600">
                                  <input
                                    type="checkbox"
                                    checked={editingStyle.is_active !== false}
                                    onChange={(e) => setEditingStyle({ ...editingStyle, is_active: e.target.checked })}
                                    className="rounded"
                                  />
                                  Active
                                </label>
                              </div>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleSave(style.id)}
                                  className="flex-1 px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                                >
                                  <Save className="w-3 h-3 inline mr-1" />
                                  Save
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="px-2 py-1 bg-slate-200 text-slate-700 text-xs rounded hover:bg-slate-300"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-sm font-medium text-slate-900 truncate" title={style.name}>
                                {style.name}
                              </p>
                              
                              {/* Style Description */}
                              {style.style_description && (
                                <p className="text-xs text-slate-600 italic line-clamp-2" title={style.style_description}>
                                  {style.style_description}
                                </p>
                              )}
                              
                              {/* Tags */}
                              {style.tags && Object.keys(style.tags).length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {Object.entries(style.tags).map(([group, tags]) => 
                                    Array.isArray(tags) && tags.map((tag, idx) => (
                                      <span
                                        key={`${group}-${idx}`}
                                        className="px-1.5 py-0.5 text-[10px] rounded bg-slate-100 text-slate-700 truncate max-w-[80px]"
                                        title={`${categoryLabels[group] || group}: ${capitalize(tag)}`}
                                      >
                                        {capitalize(tag)}
                                      </span>
                                    ))
                                  )}
                                </div>
                              )}
                              
                              {/* Old description fallback */}
                              {!style.style_description && style.description && (
                                <p className="text-xs text-slate-500 line-clamp-2" title={style.description}>
                                  {style.description}
                                </p>
                              )}
                              
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleEdit(style)}
                                  className="flex-1 px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded hover:bg-slate-200"
                                >
                                  <Edit2 className="w-3 h-3 inline mr-1" />
                                  Edit
                                </button>
                                <button
                                  onClick={async () => {
                                    try {
                                      await analyzeStyle(style);
                                    } catch (error) {
                                      toast.error('Analysis Failed', error instanceof Error ? error.message : 'Failed to analyze');
                                    }
                                  }}
                                  disabled={analyzingId === style.id}
                                  className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded hover:bg-purple-200 disabled:opacity-50"
                                  title="Analyze with GPT-4o"
                                >
                                  {analyzingId === style.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Sparkles className="w-3 h-3" />
                                  )}
                                </button>
                                <button
                                  onClick={() => handleDelete(style.id)}
                                  className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded hover:bg-red-200"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

