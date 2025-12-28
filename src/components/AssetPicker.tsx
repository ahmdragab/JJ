import { useState, useEffect, useRef } from 'react';
import { X, Search, Upload, Loader2, Image as ImageIcon, Palette, Check, Plus } from 'lucide-react';
import { BrandAsset, supabase } from '../lib/supabase';

interface AssetPickerProps {
  brandId: string;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (assets: BrandAsset[]) => void;
  selectedAssets: BrandAsset[];
  filterType?: 'asset' | 'reference' | 'all';
  title?: string;
  primaryColor?: string;
  maxSelection?: number; // Maximum total items that can be selected
  maxAssets?: number; // Maximum assets (when filterType is 'all')
}

export function AssetPicker({
  brandId,
  isOpen,
  onClose,
  onSelect,
  selectedAssets,
  filterType = 'all',
  title = 'Media Library',
  primaryColor = '#1a1a1a',
  maxSelection,
  maxAssets,
}: AssetPickerProps) {
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [localSelection, setLocalSelection] = useState<BrandAsset[]>(selectedAssets);
  const [uploadType, setUploadType] = useState<'asset' | 'reference'>(filterType === 'all' ? 'asset' : filterType);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch assets
  useEffect(() => {
    if (!isOpen) return;

    const fetchAssets = async () => {
      setLoading(true);
      let query = supabase
        .from('brand_assets')
        .select('*')
        .eq('brand_id', brandId)
        .order('created_at', { ascending: false });

      if (filterType !== 'all') {
        query = query.eq('type', filterType);
      }

      const { data, error } = await query;

      if (!error && data) {
        setAssets(data as BrandAsset[]);
      }
      setLoading(false);
    };

    fetchAssets();
    setLocalSelection(selectedAssets);
  }, [brandId, isOpen, filterType, selectedAssets]);

  // Filter assets by search
  const filteredAssets = assets.filter(asset => {
    const matchesSearch = !searchQuery || 
      asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (asset.category && asset.category.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch;
  });

  // Calculate current counts
  const currentAssets = filterType === 'all' 
    ? localSelection.filter(a => a.type === 'asset').length 
    : filterType === 'asset' ? localSelection.length : 0;
  const currentReferences = filterType === 'all'
    ? localSelection.filter(a => a.type === 'reference').length
    : filterType === 'reference' ? localSelection.length : 0;
  const currentTotal = localSelection.length;

  // Check if can add more
  const canAddMore = maxSelection === undefined || currentTotal < maxSelection;
  const canAddAsset = filterType === 'all' 
    ? (maxAssets === undefined || currentAssets < maxAssets) && canAddMore
    : canAddMore;

  // Toggle selection
  const toggleSelection = (asset: BrandAsset) => {
    setLocalSelection(prev => {
      const isSelected = prev.some(a => a.id === asset.id);
      if (isSelected) {
        return prev.filter(a => a.id !== asset.id);
      } else {
        // Check limits before adding
        if (maxSelection !== undefined && prev.length >= maxSelection) {
          return prev; // Can't add more
        }
        // If it's an asset and we have maxAssets limit
        if (asset.type === 'asset' && maxAssets !== undefined) {
          const currentAssetCount = prev.filter(a => a.type === 'asset').length;
          if (currentAssetCount >= maxAssets) {
            return prev; // Can't add more assets
          }
        }
        return [...prev, asset];
      }
    });
  };

  // Handle drag and drop
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
    if (files.length === 0) return;

    await processFiles(files);
  };

  // Handle upload (from input or drag/drop)
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    await processFiles(files);
  };

  // Process files (shared by both upload methods)
  const processFiles = async (files: File[]) => {
    if (files.length === 0) return;

    // Validate files - Gemini API supports: PNG, JPEG, WEBP, HEIC, HEIF, GIF
    // SVG is NOT supported by Gemini API
    const SUPPORTED_TYPES = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/heic',
      'image/heif',
      'image/gif',
    ];
    
    const invalidFiles = files.filter(f => !SUPPORTED_TYPES.includes(f.type.toLowerCase()));
    if (invalidFiles.length > 0) {
      const unsupportedNames = invalidFiles.map(f => f.name).join(', ');
      alert(`Unsupported file format. Please upload: PNG, JPEG, WEBP, HEIC, HEIF, or GIF only.\n\nUnsupported files: ${unsupportedNames}`);
      return;
    }

    const oversizedFiles = files.filter(f => f.size > 5 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      alert('File size must be less than 5MB');
      return;
    }

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const uploadPromises = files.map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${brandId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('brand-assets')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('brand-assets')
          .getPublicUrl(uploadData.path);

        const { data: assetData, error: assetError } = await supabase
          .from('brand_assets')
          .insert({
            brand_id: brandId,
            user_id: user.id,
            name: file.name.replace(/\.[^/.]+$/, ''),
            url: urlData.publicUrl,
            type: uploadType,
            file_size: file.size,
            mime_type: file.type,
          })
          .select()
          .single();

        if (assetError) throw assetError;
        return assetData as BrandAsset;
      });

      const newAssets = await Promise.all(uploadPromises);
      setAssets(prev => [...newAssets, ...prev]);
      setLocalSelection(prev => [...newAssets, ...prev]);
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Confirm selection
  const handleConfirm = () => {
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
      
      {/* Modal Content */}
      <div 
        className="relative bg-white/95 backdrop-blur-xl rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] flex flex-col border border-slate-200/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between p-4 sm:p-6 border-b border-slate-100 gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-semibold text-slate-900 mb-1">{title}</h2>
            <p className="text-xs sm:text-sm text-slate-500">
              {localSelection.length > 0 
                ? `${localSelection.length} ${localSelection.length === 1 ? 'item' : 'items'} selected${
                    maxSelection ? ` / ${maxSelection} max` : ''
                  }`
                : `Select media to include in your design${maxSelection ? ` (max ${maxSelection})` : ''}`
              }
            </p>
            {filterType === 'all' && maxAssets !== undefined && (
              <p className="text-xs text-slate-400 mt-1">
                Assets: {currentAssets}/{maxAssets} • References: {currentReferences}
              </p>
            )}
            {!canAddMore && (
              <p className="text-xs text-red-600 mt-1 font-medium">
                Selection limit reached. Remove items to add more.
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

        {/* Search & Upload Bar */}
        <div className="p-3 sm:p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search media..."
                className="w-full pl-10 pr-4 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all text-sm"
                style={{
                  focusRingColor: `${primaryColor}20`,
                }}
              />
            </div>

            {/* Upload Type Toggle (only if filterType is 'all') */}
            {filterType === 'all' && (
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setUploadType('asset')}
                  className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl text-xs font-medium transition-all ${
                    uploadType === 'asset' 
                      ? 'text-white shadow-md' 
                      : 'text-slate-600 hover:bg-slate-100 bg-white border border-slate-200'
                  }`}
                  style={uploadType === 'asset' ? { backgroundColor: primaryColor } : {}}
                >
                  Asset
                </button>
                <button
                  onClick={() => setUploadType('reference')}
                  className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl text-xs font-medium transition-all ${
                    uploadType === 'reference' 
                      ? 'text-white shadow-md' 
                      : 'text-slate-600 hover:bg-slate-100 bg-white border border-slate-200'
                  }`}
                  style={uploadType === 'reference' ? { backgroundColor: primaryColor } : {}}
                >
                  Reference
                </button>
              </div>
            )}

            {/* Upload Button */}
            <label 
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl text-white text-sm font-medium cursor-pointer transition-all hover:shadow-lg shrink-0 ${
                isDragging ? 'ring-2 ring-offset-2 ring-white' : ''
              }`}
              style={{ 
                backgroundColor: isDragging ? primaryColor : primaryColor,
                opacity: uploading ? 0.7 : 1,
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif,image/gif"
                multiple
                onChange={handleUpload}
                className="hidden"
                disabled={uploading}
              />
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Upload</span>
                </>
              )}
            </label>
          </div>
        </div>

        {/* Assets Grid */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="text-center py-20">
              <div 
                className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: `${primaryColor}10` }}
              >
                <ImageIcon 
                  className="w-10 h-10" 
                  style={{ color: primaryColor }}
                />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">
                {searchQuery ? 'No results found' : 'No media yet'}
              </h3>
              <p className="text-slate-500 text-sm">
                {searchQuery 
                  ? 'Try a different search term' 
                  : 'Upload media to use in your designs'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 sm:gap-3 md:gap-4">
              {filteredAssets.map((asset) => {
                const isSelected = localSelection.some(a => a.id === asset.id);
                return (
                  <button
                    key={asset.id}
                    onClick={() => toggleSelection(asset)}
                    disabled={!isSelected && !canAddMore}
                    className={`group relative rounded-2xl overflow-hidden border-2 transition-all ${
                      isSelected 
                        ? 'ring-2 ring-offset-2' 
                        : !canAddMore
                        ? 'border-slate-200 opacity-50 cursor-not-allowed'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                    style={isSelected ? {
                      borderColor: primaryColor,
                      ringColor: `${primaryColor}30`,
                    } : {}}
                    title={!isSelected && !canAddMore ? 'Selection limit reached' : asset.name}
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
                        src={asset.url}
                        alt={asset.name}
                        className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                      />
                      
                      {/* Overlay on hover */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
                    </div>

                    {/* Selection Check */}
                    {isSelected && (
                      <div 
                        className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center shadow-lg"
                        style={{ backgroundColor: primaryColor }}
                      >
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}

                    {/* Type Badge */}
                    <div 
                      className="absolute top-2 left-2 px-2 py-1 rounded-xl text-[9px] uppercase tracking-wider font-medium backdrop-blur-sm"
                      style={{
                        backgroundColor: asset.type === 'asset' 
                          ? `${primaryColor}15` 
                          : `${primaryColor}20`,
                        color: primaryColor,
                      }}
                    >
                      {asset.type === 'asset' ? (
                        <ImageIcon className="w-3 h-3" />
                      ) : (
                        <Palette className="w-3 h-3" />
                      )}
                    </div>

                    {/* Name */}
                    <div className="p-2.5 bg-white border-t border-slate-100">
                      <p className="text-xs text-slate-700 truncate font-medium">{asset.name}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="text-xs sm:text-sm text-slate-600">
            {localSelection.length > 0 ? (
              <>
                <span className="font-medium">{localSelection.length}</span> {localSelection.length === 1 ? 'item' : 'items'} selected
                {maxSelection && (
                  <span className={`ml-2 font-medium ${
                    localSelection.length >= maxSelection ? 'text-red-600' : 'text-slate-500'
                  }`}>
                    / {maxSelection} max
                  </span>
                )}
                {filterType === 'all' && (
                  <span className="text-slate-400 ml-2">
                    ({currentAssets} assets, {currentReferences} references)
                  </span>
                )}
              </>
            ) : (
              <span className="text-slate-400">
                No items selected{maxSelection && ` (max ${maxSelection})`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={localSelection.length === 0}
              className="flex-1 sm:flex-none px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl text-white text-sm font-medium transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: primaryColor }}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
