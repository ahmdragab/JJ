import { useState, useEffect } from 'react';
import { Plus, Sparkles, Loader2, X, ArrowRight } from 'lucide-react';
import { supabase, Brand } from '../lib/supabase';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import { Button } from '../components/ui';

export function BrandsList({
  onSelectBrand,
  onCreateNew,
}: {
  onSelectBrand: (slug: string) => void;
  onCreateNew: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; brandId: string | null }>({
    isOpen: false,
    brandId: null,
  });

  useEffect(() => {
    if (user) {
      loadBrands();
    }
  }, [user]);

  const loadBrands = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('brands')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBrands(data || []);
    } catch (error) {
      console.error('Failed to load brands:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (brandId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete({ isOpen: true, brandId });
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDelete.brandId) return;

    const brandId = confirmDelete.brandId;
    setDeleting(brandId);
    try {
      const brandToDelete = brands.find(b => b.id === brandId);

      if (brandToDelete) {
        // Delete brand logos
        if (brandToDelete.logos) {
          const logoPaths: string[] = [];
          if (brandToDelete.logos.primary) {
            const primaryPath = brandToDelete.logos.primary.split('/brand-logos/')[1];
            if (primaryPath) logoPaths.push(primaryPath);
          }
          if (brandToDelete.logos.icon) {
            const iconPath = brandToDelete.logos.icon.split('/brand-logos/')[1];
            if (iconPath) logoPaths.push(iconPath);
          }
          if (logoPaths.length > 0) {
            await supabase.storage.from('brand-logos').remove(logoPaths);
          }
        }

        // Delete brand assets
        const { data: assets } = await supabase
          .from('brand_assets')
          .select('url')
          .eq('brand_id', brandId);

        if (assets && assets.length > 0) {
          const assetPaths = assets
            .map(asset => {
              const urlParts = asset.url.split('/brand-assets/');
              return urlParts.length > 1 ? urlParts[1] : null;
            })
            .filter((path): path is string => path !== null);

          if (assetPaths.length > 0) {
            await supabase.storage.from('brand-assets').remove(assetPaths);
          }
        }

        // Delete brand images
        const { data: images } = await supabase
          .from('images')
          .select('image_url')
          .eq('brand_id', brandId);

        if (images && images.length > 0) {
          const imagePaths = images
            .map(img => {
              if (!img.image_url) return null;
              const urlParts = img.image_url.split('/brand-images/');
              return urlParts.length > 1 ? urlParts[1] : null;
            })
            .filter((path): path is string => path !== null);

          if (imagePaths.length > 0) {
            await supabase.storage.from('brand-images').remove(imagePaths);
          }
        }
      }

      const { error } = await supabase
        .from('brands')
        .delete()
        .eq('id', brandId);

      if (error) throw error;
      setBrands(brands.filter(b => b.id !== brandId));
    } catch (error) {
      console.error('Failed to delete brand:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast.error('Delete Failed', `Failed to delete brand: ${errorMessage}. Please try again.`);
    } finally {
      setDeleting(null);
      setConfirmDelete({ isOpen: false, brandId: null });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-brand-primary/10 animate-pulse" />
          <Loader2 className="w-6 h-6 animate-spin text-brand-primary absolute inset-0 m-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="pt-10 sm:pt-12 pb-12 sm:pb-16 page-enter">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
              <div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold mb-3 text-neutral-800 tracking-tight font-display">
                  Your Brands
                </h1>
                <p className="text-base sm:text-lg text-neutral-500">
                  A collection of your creative identities
                </p>
              </div>
              <Button size="lg" onClick={onCreateNew} className="w-full sm:w-auto">
                <Plus className="w-4 h-4 mr-2" />
                New Brand
              </Button>
            </div>
          </div>

          {/* Brands Grid */}
          {brands.length === 0 ? (
            <div className="text-center py-20 sm:py-28">
              <div className="max-w-sm mx-auto">
                <div className="relative mb-8">
                  <div className="w-24 h-24 mx-auto rounded-full bg-brand-primary/5 flex items-center justify-center">
                    <Sparkles className="w-10 h-10 text-brand-primary/60" />
                  </div>
                </div>
                <h3 className="text-2xl font-semibold text-neutral-800 mb-3 font-display">Start your collection</h3>
                <p className="text-neutral-500 mb-8">
                  Create your first brand and bring it to life
                </p>
                <Button size="lg" onClick={onCreateNew}>
                  Create Your First Brand
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 lg:gap-8">
              {brands.map((brand, index) => (
                <div
                  key={brand.id}
                  onClick={() => onSelectBrand(brand.slug)}
                  className="group card-interactive stagger-fade-in"
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  <div className="p-4 sm:p-5">
                    {/* Brand Preview */}
                    <div className="relative mb-4 aspect-[4/3] rounded-2xl overflow-hidden">
                      {brand.screenshot ? (
                        <img
                          src={brand.screenshot}
                          alt={brand.name}
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                      ) : (
                        <div
                          className="w-full h-full transition-transform duration-700 group-hover:scale-105"
                          style={{
                            background: `linear-gradient(135deg, ${brand.colors?.primary || '#3531B7'} 0%, ${brand.colors?.secondary || '#2a26a0'} 100%)`,
                          }}
                        />
                      )}

                      {/* Logo overlay */}
                      {brand.logos?.primary && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/5">
                          <img
                            src={brand.logos.primary}
                            alt={brand.name}
                            className="max-w-[50%] max-h-[50%] object-contain drop-shadow-lg"
                          />
                        </div>
                      )}

                      {/* Delete button - subtle */}
                      <button
                        onClick={(e) => handleDeleteClick(brand.id, e)}
                        disabled={deleting === brand.id}
                        className="absolute top-2 left-2 w-10 h-10 rounded-xl bg-white/90 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-red-50 text-neutral-400 hover:text-red-500 disabled:opacity-50 touch-manipulation"
                        title="Delete brand"
                      >
                        {deleting === brand.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {/* Brand Info */}
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-lg font-semibold text-neutral-800 mb-0.5 font-heading group-hover:text-brand-primary transition-colors duration-300">
                          {brand.name}
                        </h3>
                        <p className="text-sm text-neutral-400">{brand.domain}</p>
                      </div>

                      {brand.slogan && (
                        <p className="text-sm text-neutral-500 leading-relaxed line-clamp-2">
                          {brand.slogan}
                        </p>
                      )}

                      {/* Color Palette - softer, more subtle */}
                      {brand.colors && (
                        <div className="flex gap-1.5 pt-1">
                          {brand.colors.primary && (
                            <div
                              className="w-6 h-6 rounded-full transition-transform duration-300 group-hover:scale-110"
                              style={{ backgroundColor: brand.colors.primary }}
                            />
                          )}
                          {brand.colors.secondary && (
                            <div
                              className="w-6 h-6 rounded-full transition-transform duration-300 group-hover:scale-110"
                              style={{ backgroundColor: brand.colors.secondary }}
                            />
                          )}
                          {brand.colors.background && (
                            <div
                              className="w-6 h-6 rounded-full border border-neutral-200/50 transition-transform duration-300 group-hover:scale-110"
                              style={{ backgroundColor: brand.colors.background }}
                            />
                          )}
                        </div>
                      )}

                      {/* Footer */}
                      <div className="pt-3 flex items-center justify-between">
                        <span className="text-xs text-neutral-400">
                          {new Date(brand.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </span>
                        <div className="flex items-center gap-1.5 text-sm font-medium text-brand-primary opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                          <span>Open</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        onClose={() => setConfirmDelete({ isOpen: false, brandId: null })}
        onConfirm={handleDeleteConfirm}
        title="Delete Brand"
        message="Are you sure you want to delete this brand? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}
