import { useState, useRef, useEffect } from 'react';
import { X, Upload, Loader2, Check } from 'lucide-react';
import { BrandAsset, supabase } from '../lib/supabase';
import { useToast } from './Toast';

interface ReferenceUploadProps {
  brandId: string;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (references: BrandAsset[]) => void;
  selectedReferences: BrandAsset[];
  maxSelection?: number;
}

export function ReferenceUpload({
  brandId,
  isOpen,
  onClose,
  onSelect,
  selectedReferences,
  maxSelection,
}: ReferenceUploadProps) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [uploadedReferences, setUploadedReferences] = useState<BrandAsset[]>([]);
  const [localSelection, setLocalSelection] = useState<BrandAsset[]>(selectedReferences);
  const [existingReferences, setExistingReferences] = useState<BrandAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing references when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const loadReferences = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('brand_assets')
        .select('*')
        .eq('brand_id', brandId)
        .eq('type', 'reference')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setExistingReferences(data as BrandAsset[]);
      }
      setLoading(false);
    };

    loadReferences();
    setLocalSelection(selectedReferences);
    setUploadedReferences([]);
  }, [isOpen, brandId, selectedReferences]);

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
            type: 'reference',
            file_size: file.size,
            mime_type: file.type,
          })
          .select()
          .single();

        if (assetError) throw assetError;
        return assetData as BrandAsset;
      });

      const newReferences = await Promise.all(uploadPromises);
      setUploadedReferences(prev => [...prev, ...newReferences]);
      setLocalSelection(prev => [...prev, ...newReferences]);
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

  const canAddMore = maxSelection === undefined || localSelection.length < maxSelection;

  const toggleSelection = (reference: BrandAsset) => {
    setLocalSelection(prev => {
      const isSelected = prev.some(r => r.id === reference.id);
      if (isSelected) {
        return prev.filter(r => r.id !== reference.id);
      } else {
        if (maxSelection !== undefined && prev.length >= maxSelection) {
          return prev;
        }
        return [...prev, reference];
      }
    });
  };

  const handleConfirm = () => {
    onSelect(localSelection);
    onClose();
  };

  if (!isOpen) return null;

  // Combine all references - avoid duplicates
  const allReferencesMap = new Map<string, BrandAsset>();
  existingReferences.forEach(ref => allReferencesMap.set(ref.id, ref));
  uploadedReferences.forEach(ref => allReferencesMap.set(ref.id, ref));
  localSelection.forEach(ref => allReferencesMap.set(ref.id, ref));
  const allReferences = Array.from(allReferencesMap.values());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop-enter"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Modal Content */}
      <div
        className="relative bg-white rounded-xl shadow-lg w-full max-w-2xl max-h-[95vh] sm:max-h-[85vh] flex flex-col modal-content-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between p-4 sm:p-6 gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-semibold text-neutral-800 mb-1 font-heading">Upload Reference</h2>
            <p className="text-xs sm:text-sm text-neutral-500">
              Upload style inspiration images to guide your design
              {maxSelection && ` (max ${maxSelection})`}
            </p>
            {!canAddMore && (
              <p className="text-xs text-red-500 mt-1 font-medium">
                Selection limit reached. Remove references to add more.
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

        {/* Upload Area */}
        <div className="px-4 sm:px-6">
          <label
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center w-full h-40 sm:h-48 border-2 border-dashed rounded-2xl cursor-pointer transition-all group ${
              isDragging
                ? 'border-brand-primary bg-brand-primary/5'
                : localSelection.length > 0
                ? 'border-brand-primary/30 hover:border-brand-primary/50'
                : 'border-neutral-200 hover:border-neutral-300'
            }`}
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
              <div className="flex flex-col items-center">
                <Loader2 className="w-8 h-8 animate-spin mb-3 text-brand-primary" />
                <p className="text-sm text-neutral-600">Uploading...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 flex items-center justify-center mb-3 group-hover:bg-brand-primary/15 transition-colors">
                  <Upload className="w-6 h-6 text-brand-primary" />
                </div>
                <p className="text-sm font-medium text-neutral-700 mb-1">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-neutral-500">
                  PNG, JPEG, WEBP, HEIC, HEIF, GIF up to 5MB
                </p>
              </div>
            )}
          </label>
        </div>

        {/* References Preview */}
        {loading ? (
          <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-brand-primary" />
          </div>
        ) : allReferences.length > 0 ? (
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 no-scrollbar">
            <h3 className="text-xs sm:text-sm font-medium text-neutral-600 mb-3 sm:mb-4">
              {existingReferences.length > 0 ? 'Available References' : 'Uploaded References'}
              ({localSelection.length}{maxSelection ? `/${maxSelection}` : ''} selected)
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {allReferences.map((reference) => {
                const isSelected = localSelection.some(r => r.id === reference.id);
                return (
                  <button
                    key={reference.id}
                    onClick={() => toggleSelection(reference)}
                    disabled={!isSelected && !canAddMore}
                    className={`group relative rounded-2xl overflow-hidden border-2 transition-all duration-300 ${
                      isSelected
                        ? 'border-brand-primary ring-2 ring-brand-primary/20'
                        : !canAddMore
                        ? 'border-neutral-200 opacity-50 cursor-not-allowed'
                        : 'border-neutral-200 hover:border-neutral-300 hover:shadow-md'
                    }`}
                    title={!isSelected && !canAddMore ? 'Selection limit reached' : reference.name}
                  >
                    {/* Image */}
                    <div className="aspect-square relative overflow-hidden bg-neutral-100">
                      <img
                        src={reference.url}
                        alt={reference.name}
                        className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>

                    {/* Selection Check */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-brand-primary flex items-center justify-center shadow-md">
                        <Check className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Footer */}
        <div className="p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="text-xs sm:text-sm text-neutral-500">
            {localSelection.length > 0 ? (
              <>
                <span className="font-medium text-neutral-700">{localSelection.length}</span>
                {maxSelection && (
                  <span className={`ml-1 ${localSelection.length >= maxSelection ? 'text-red-500' : ''}`}>
                    / {maxSelection} max
                  </span>
                )}
                <span className="ml-1">
                  {localSelection.length === 1 ? 'reference' : 'references'} selected
                </span>
              </>
            ) : (
              <span>No references selected{maxSelection && ` (max ${maxSelection})`}</span>
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
