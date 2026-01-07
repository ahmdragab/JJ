import { useState, useEffect, useRef } from 'react';
import { X, Search, Loader2, Image as ImageIcon, Check, Plus } from 'lucide-react';
import { BrandAsset, supabase } from '../lib/supabase';
import { useToast } from './Toast';

interface AssetPickerProps {
  brandId: string;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (assets: BrandAsset[]) => void;
  selectedAssets: BrandAsset[];
  filterType?: 'asset' | 'reference' | 'all';
  title?: string;
  maxSelection?: number;
  maxAssets?: number;
}

export function AssetPicker({
  brandId,
  isOpen,
  onClose,
  onSelect,
  selectedAssets,
  filterType = 'all',
  title = 'Media Library',
  maxSelection,
  maxAssets,
}: AssetPickerProps) {
  const toast = useToast();
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

  // Check if can add more
  const canAddMore = maxSelection === undefined || localSelection.length < maxSelection;

  // Toggle selection
  const toggleSelection = (asset: BrandAsset) => {
    setLocalSelection(prev => {
      const isSelected = prev.some(a => a.id === asset.id);
      if (isSelected) {
        return prev.filter(a => a.id !== asset.id);
      } else {
        if (maxSelection !== undefined && prev.length >= maxSelection) {
          return prev;
        }
        if (asset.type === 'asset' && maxAssets !== undefined) {
          const currentAssetCount = prev.filter(a => a.type === 'asset').length;
          if (currentAssetCount >= maxAssets) {
            return prev;
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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    await processFiles(files);
  };

  const processFiles = async (files: File[]) => {
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

    const invalidFiles = files.filter(f => !SUPPORTED_TYPES.includes(f.type.toLowerCase()));
    if (invalidFiles.length > 0) {
      const unsupportedNames = invalidFiles.map(f => f.name).join(', ');
      toast.error('Unsupported Format', `Please upload: PNG, JPEG, WEBP, HEIC, HEIF, or GIF only. Unsupported: ${unsupportedNames}`);
      return;
    }

    const oversizedFiles = files.filter(f => f.size > 5 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      toast.error('File Too Large', 'File size must be less than 5MB');
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
      toast.error('Upload Failed', 'Failed to upload. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleConfirm = () => {
    onSelect(localSelection);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop-enter"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Modal Content */}
      <div
        className="relative bg-white rounded-xl shadow-lg w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] flex flex-col modal-content-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between p-4 sm:p-6 gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-semibold text-neutral-800 mb-1 font-heading">{title}</h2>
            <p className="text-xs sm:text-sm text-neutral-500">
              {localSelection.length > 0
                ? `${localSelection.length} ${localSelection.length === 1 ? 'item' : 'items'} selected${
                    maxSelection ? ` / ${maxSelection} max` : ''
                  }`
                : `Select media to include in your design${maxSelection ? ` (max ${maxSelection})` : ''}`
              }
            </p>
            {filterType === 'all' && maxAssets !== undefined && (
              <p className="text-xs text-neutral-400 mt-1">
                Assets: {currentAssets}/{maxAssets} • References: {currentReferences}
              </p>
            )}
            {!canAddMore && (
              <p className="text-xs text-red-500 mt-1 font-medium">
                Selection limit reached. Remove items to add more.
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

        {/* Search & Upload Bar */}
        <div className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search media..."
                className="input pl-10 py-2.5 text-sm"
              />
            </div>

            {/* Upload Type Toggle */}
            {filterType === 'all' && (
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setUploadType('asset')}
                  className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-medium transition-all ${
                    uploadType === 'asset'
                      ? 'bg-brand-primary text-white shadow-sm'
                      : 'text-neutral-600 hover:bg-neutral-100 bg-white border border-neutral-200'
                  }`}
                >
                  Asset
                </button>
                <button
                  onClick={() => setUploadType('reference')}
                  className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-medium transition-all ${
                    uploadType === 'reference'
                      ? 'bg-brand-primary text-white shadow-sm'
                      : 'text-neutral-600 hover:bg-neutral-100 bg-white border border-neutral-200'
                  }`}
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
              className={`btn-primary px-4 py-2.5 rounded-xl cursor-pointer shrink-0 ${
                isDragging ? 'ring-2 ring-offset-2 ring-brand-primary' : ''
              } ${uploading ? 'opacity-70' : ''}`}
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
                  <span className="hidden sm:inline ml-1.5">Upload</span>
                </>
              )}
            </label>
          </div>
        </div>

        {/* Assets Grid */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 no-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-brand-primary" />
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 rounded-xl bg-neutral-100 flex items-center justify-center mx-auto mb-4">
                <ImageIcon className="w-8 h-8 text-brand-primary" />
              </div>
              <h3 className="text-lg font-semibold text-neutral-800 mb-2 font-heading">
                {searchQuery ? 'No results found' : 'No media yet'}
              </h3>
              <p className="text-neutral-500 text-sm">
                {searchQuery
                  ? 'Try a different search term'
                  : 'Upload media to use in your designs'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 sm:gap-4">
              {filteredAssets.map((asset) => {
                const isSelected = localSelection.some(a => a.id === asset.id);
                return (
                  <button
                    key={asset.id}
                    onClick={() => toggleSelection(asset)}
                    disabled={!isSelected && !canAddMore}
                    className={`group relative rounded-xl overflow-hidden border transition-all duration-200 ${
                      isSelected
                        ? 'border-brand-primary ring-1 ring-brand-primary/20'
                        : !canAddMore
                        ? 'border-neutral-200 opacity-50 cursor-not-allowed'
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                    title={!isSelected && !canAddMore ? 'Selection limit reached' : asset.name}
                  >
                    {/* Image */}
                    <div className="aspect-square relative overflow-hidden bg-neutral-100">
                      <img
                        src={asset.url}
                        alt={asset.name}
                        className="w-full h-full object-contain p-2"
                      />
                    </div>

                    {/* Selection Check */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-brand-primary flex items-center justify-center shadow-md">
                        <Check className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}

                    {/* Name */}
                    <div className="p-2.5 bg-white">
                      <p className="text-xs text-neutral-700 truncate font-medium">{asset.name}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="text-xs sm:text-sm text-neutral-500">
            {localSelection.length > 0 ? (
              <>
                <span className="font-medium text-neutral-700">{localSelection.length}</span> {localSelection.length === 1 ? 'item' : 'items'} selected
                {maxSelection && (
                  <span className={`ml-2 ${localSelection.length >= maxSelection ? 'text-red-500' : ''}`}>
                    / {maxSelection} max
                  </span>
                )}
                {filterType === 'all' && (
                  <span className="ml-2">
                    ({currentAssets} assets, {currentReferences} references)
                  </span>
                )}
              </>
            ) : (
              <span>No items selected{maxSelection && ` (max ${maxSelection})`}</span>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="btn-ghost flex-1 sm:flex-none px-5 py-2.5 rounded-xl border border-neutral-200"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={localSelection.length === 0}
              className="btn-primary flex-1 sm:flex-none px-5 py-2.5 rounded-xl"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
