import { useState, useRef, useEffect } from 'react';
import { X, Upload, Loader2, Image as ImageIcon, Palette, Check } from 'lucide-react';
import { BrandAsset, supabase } from '../lib/supabase';

interface ReferenceUploadProps {
  brandId: string;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (references: BrandAsset[]) => void;
  selectedReferences: BrandAsset[];
  primaryColor?: string;
  maxSelection?: number; // Maximum references that can be selected
}

export function ReferenceUpload({
  brandId,
  isOpen,
  onClose,
  onSelect,
  selectedReferences,
  primaryColor = '#1a1a1a',
  maxSelection,
}: ReferenceUploadProps) {
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

  // Handle file upload (from input or drag/drop)
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    await processFiles(files);
  };

  // Process files (shared by both upload methods)
  const processFiles = async (files: File[]) => {

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
      alert('Failed to upload. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Check if can add more
  const canAddMore = maxSelection === undefined || localSelection.length < maxSelection;

  // Toggle selection
  const toggleSelection = (reference: BrandAsset) => {
    setLocalSelection(prev => {
      const isSelected = prev.some(r => r.id === reference.id);
      if (isSelected) {
        return prev.filter(r => r.id !== reference.id);
      } else {
        // Check limit before adding
        if (maxSelection !== undefined && prev.length >= maxSelection) {
          return prev; // Can't add more
        }
        return [...prev, reference];
      }
    });
  };

  // Confirm selection
  const handleConfirm = () => {
    onSelect(localSelection);
    onClose();
  };

  if (!isOpen) return null;

  // Combine all references (existing, uploaded, and selected) - avoid duplicates
  const allReferencesMap = new Map<string, BrandAsset>();
  existingReferences.forEach(ref => allReferencesMap.set(ref.id, ref));
  uploadedReferences.forEach(ref => allReferencesMap.set(ref.id, ref));
  localSelection.forEach(ref => allReferencesMap.set(ref.id, ref));
  const allReferences = Array.from(allReferencesMap.values());

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      
      {/* Modal Content */}
      <div 
        className="relative bg-white/95 backdrop-blur-xl rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[85vh] flex flex-col border border-slate-200/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between p-4 sm:p-6 border-b border-slate-100 gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-semibold text-slate-900 mb-1">Upload Reference</h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Upload style inspiration images to guide your design
              {maxSelection && ` (max ${maxSelection})`}
            </p>
            {!canAddMore && (
              <p className="text-xs text-red-600 mt-1 font-medium">
                Selection limit reached. Remove references to add more.
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

        {/* Upload Area */}
        <div className="p-4 sm:p-6 border-b border-slate-100">
          <label
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center w-full h-40 sm:h-48 border-2 border-dashed rounded-xl sm:rounded-2xl cursor-pointer transition-colors group ${
              isDragging 
                ? 'border-blue-400 bg-blue-50' 
                : localSelection.length > 0 
                ? 'hover:border-slate-300' 
                : 'hover:border-slate-300'
            }`}
            style={{
              borderColor: isDragging ? undefined : (localSelection.length > 0 ? primaryColor : undefined),
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
              <div className="flex flex-col items-center">
                <Loader2 className="w-8 h-8 animate-spin mb-3" style={{ color: primaryColor }} />
                <p className="text-sm text-slate-600">Uploading...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div 
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                  style={{ backgroundColor: `${primaryColor}10` }}
                >
                  <Upload className="w-6 h-6" style={{ color: primaryColor }} />
                </div>
                <p className="text-sm font-medium text-slate-700 mb-1">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-slate-500">
                  PNG, JPEG, WEBP, HEIC, HEIF, GIF up to 5MB
                </p>
              </div>
            )}
          </label>
        </div>

        {/* References Preview */}
        {loading ? (
          <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
          </div>
        ) : allReferences.length > 0 ? (
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
            <h3 className="text-xs sm:text-sm font-medium text-slate-700 mb-3 sm:mb-4">
              {existingReferences.length > 0 ? 'Available References' : 'Uploaded References'} 
              ({localSelection.length}{maxSelection ? `/${maxSelection}` : ''} selected)
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3">
              {allReferences.map((reference) => {
                const isSelected = localSelection.some(r => r.id === reference.id);
                return (
                  <button
                    key={reference.id}
                    onClick={() => toggleSelection(reference)}
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
                    title={!isSelected && !canAddMore ? 'Selection limit reached' : reference.name}
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
                        src={reference.url}
                        alt={reference.name}
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
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="text-xs sm:text-sm text-slate-600">
            {localSelection.length > 0 ? (
              <>
                <span className="font-medium">{localSelection.length}</span>
                {maxSelection && (
                  <span className={`ml-1 font-medium ${
                    localSelection.length >= maxSelection ? 'text-red-600' : 'text-slate-500'
                  }`}>
                    / {maxSelection} max
                  </span>
                )}
                <span className="text-slate-400 ml-1">
                  {localSelection.length === 1 ? 'reference' : 'references'} selected
                </span>
              </>
            ) : (
              <span className="text-slate-400">
                No references selected{maxSelection && ` (max ${maxSelection})`}
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

