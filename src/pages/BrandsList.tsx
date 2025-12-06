import { useState, useEffect } from 'react';
import { Plus, Sparkles, Loader2, X } from 'lucide-react';
import { supabase, Brand } from '../lib/supabase';
import { ConfirmDialog } from '../components/ConfirmDialog';

export function BrandsList({
  onSelectBrand,
  onCreateNew,
}: {
  onSelectBrand: (slug: string) => void;
  onCreateNew: () => void;
}) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; brandId: string | null }>({
    isOpen: false,
    brandId: null,
  });

  useEffect(() => {
    loadBrands();
  }, []);

  const loadBrands = async () => {
    try {
      const { data, error } = await supabase
        .from('brands')
        .select('*')
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
      const { error } = await supabase
        .from('brands')
        .delete()
        .eq('id', brandId);

      if (error) throw error;
      setBrands(brands.filter(b => b.id !== brandId));
    } catch (error) {
      console.error('Failed to delete brand:', error);
      alert('Failed to delete brand. Please try again.');
    } finally {
      setDeleting(null);
      setConfirmDelete({ isOpen: false, brandId: null });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-50 via-neutral-50 to-zinc-50">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-200 to-orange-200 animate-pulse blur-xl opacity-40"></div>
          <Loader2 className="w-8 h-8 animate-spin text-amber-600 absolute inset-0 m-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-neutral-50 to-zinc-50 relative overflow-hidden">
      {/* Organic background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-amber-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-orange-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-yellow-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative z-10 pt-8 md:pt-12 pb-8 md:pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {/* Header */}
          <div className="mb-12 md:mb-16">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
              <div>
                <h1 className="text-3xl md:text-5xl font-bold mb-4 text-slate-900 leading-tight font-playful">
                  Your Brands
                </h1>
                <p className="text-lg md:text-xl text-slate-600/80 font-light">
                  A collection of your creative identities
                </p>
              </div>
              <button
                onClick={onCreateNew}
                className="group relative px-6 py-3 bg-slate-900 text-white font-medium text-base rounded-full hover:shadow-2xl hover:scale-105 transition-all duration-300 overflow-hidden"
              >
                <span className="relative z-10 flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  New Brand
                </span>
                <div className="absolute inset-0 bg-slate-800 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </button>
            </div>
          </div>

          {/* Brands Grid */}
          {brands.length === 0 ? (
            <div className="text-center py-24">
              <div className="max-w-md mx-auto">
                <div className="relative mb-8">
                  <div className="w-32 h-32 mx-auto rounded-full bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-200/30 to-orange-200/30 animate-pulse"></div>
                    <Sparkles className="w-16 h-16 text-amber-600 relative z-10" />
                  </div>
                </div>
                <h3 className="text-3xl font-bold text-slate-800 mb-3">Start your collection</h3>
                <p className="text-lg text-slate-600 mb-8 font-light">
                  Create your first brand and bring it to life
                </p>
                <button
                  onClick={onCreateNew}
                  className="px-8 py-4 bg-slate-900 text-white font-medium text-lg rounded-full hover:shadow-2xl hover:scale-105 transition-all duration-300"
                >
                  Create Your First Brand
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
              {brands.map((brand, index) => {
                const primaryColor = brand.colors?.primary || '#64748b';
                const secondaryColor = brand.colors?.secondary || '#94a3b8';
                
                return (
                <div
                  key={brand.id}
                  onClick={() => onSelectBrand(brand.slug)}
                    className="group relative cursor-pointer transform hover:scale-[1.02] transition-all duration-500"
                    style={{
                      animationDelay: `${index * 100}ms`,
                    }}
                  >
                    {/* Card with organic shape */}
                    <div className="relative h-full">
                      {/* Organic blob shape background */}
                      <div 
                        className="absolute inset-0 rounded-[3rem] opacity-90 group-hover:opacity-100 transition-opacity duration-500"
                        style={{
                          background: `linear-gradient(135deg, ${primaryColor}15, ${secondaryColor}15)`,
                          clipPath: 'polygon(0% 0%, 100% 0%, 95% 100%, 5% 100%)',
                        }}
                      >
                        <div className="absolute inset-0 rounded-[3rem] backdrop-blur-sm bg-white/60"></div>
                      </div>

                      {/* Content */}
                      <div className="relative p-6 md:p-8">
                        {/* Brand Preview - Organic shape */}
                        <div 
                          className="relative mb-6 h-48 rounded-[2.5rem] overflow-hidden group-hover:scale-105 transition-transform duration-500"
                          style={{
                            clipPath: 'polygon(0% 0%, 100% 0%, 98% 100%, 2% 100%)',
                          }}
                        >
                          {brand.screenshot ? (
                            <img
                              src={brand.screenshot}
                              alt={brand.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div 
                              className="w-full h-full"
                              style={{
                                background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
                              }}
                            />
                          )}
                          
                          {/* Logo overlay */}
                          {brand.logos?.primary && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/5 backdrop-blur-[2px]">
                              <img
                                src={brand.logos.primary}
                                alt={brand.name}
                                className="max-w-[55%] max-h-[55%] object-contain drop-shadow-2xl"
                              />
                            </div>
                          )}

                          {/* Delete button */}
                          <button
                            onClick={(e) => handleDeleteClick(brand.id, e)}
                            disabled={deleting === brand.id}
                            className="absolute top-4 left-4 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 text-red-600 disabled:opacity-50"
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
                        <div className="space-y-4">
                          <div>
                            <h3 
                              className="text-2xl font-bold mb-1.5"
                              style={{
                                color: primaryColor,
                              }}
                            >
                              {brand.name}
                            </h3>
                            <p className="text-sm text-slate-600 font-light">{brand.domain}</p>
                          </div>

                          {brand.slogan && (
                            <p className="text-sm text-slate-700 leading-relaxed font-light line-clamp-2">
                              {brand.slogan}
                            </p>
                          )}

                          {/* Color Palette - Organic shapes */}
                          {brand.colors && (
                            <div className="flex gap-3 pt-2">
                              {brand.colors.primary && (
                                <div
                                  className="w-10 h-10 rounded-full shadow-lg transform hover:scale-110 transition-transform"
                                  style={{ 
                                    backgroundColor: brand.colors.primary,
                                    clipPath: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)',
                                  }}
                                  title="Primary color"
                                />
                              )}
                              {brand.colors.secondary && (
                                <div
                                  className="w-10 h-10 rounded-full shadow-lg transform hover:scale-110 transition-transform"
                                  style={{ 
                                    backgroundColor: brand.colors.secondary,
                                    clipPath: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)',
                                  }}
                                  title="Secondary color"
                                />
                              )}
                              {brand.colors.background && (
                                <div
                                  className="w-10 h-10 rounded-full shadow-lg transform hover:scale-110 transition-transform"
                                  style={{ 
                                    backgroundColor: brand.colors.background,
                                    clipPath: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)',
                                  }}
                                  title="Background color"
                                />
                              )}
                            </div>
                          )}

                          {/* Footer */}
                          <div className="pt-4 border-t border-slate-200/50">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-slate-500 font-light">
                                {new Date(brand.created_at).toLocaleDateString('en-US', { 
                                  month: 'short', 
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </span>
                              <div 
                                className="flex items-center gap-2 text-sm font-medium group-hover:gap-3 transition-all"
                                style={{ color: primaryColor }}
                              >
                                <span>Explore</span>
                                <div className="w-1 h-1 rounded-full bg-current"></div>
                                <div className="w-1 h-1 rounded-full bg-current"></div>
                                <div className="w-1 h-1 rounded-full bg-current"></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
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

      <style>{`
        @keyframes blob {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
}
